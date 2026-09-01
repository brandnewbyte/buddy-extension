import { setBadge } from './badge'
import * as searchResultsCache from './search-results-cache'
import * as autofillSession from './autofill-session'
import * as capabilityTarget from './capability-target'
import { isOffline, isSocketError, PROTOCOL_VERSION } from '../../shared/ipc'
import type { IpcResult, SocketError } from '../../shared/ipc'
import { LIMITS } from '../../shared/contracts/limits'
import { bool, hasExactKeys, isRecord, nonEmptyStr, str } from '../../shared/contracts/validate'
import type { FieldType } from '../../shared/types'

// Desktop error codes issued before the pairing gate (or by the ceremony
// itself) — their presence proves nothing about our pairing being valid.
const PRE_GATE: SocketError[] = [
  'PAIRING_REQUIRED',
  'PAIRING_DISMISSED',
  'PAIRING_PENDING',
  'BAD_REQUEST',
  'UNSUPPORTED_VERSION',
]

// Wire format from the native host / socket server. `locked` is stamped by
// the desktop on every reply; host-generated errors don't carry it. `pairing`
// appears exactly once: the first reply after the user approves this client.
interface Envelope {
  rid: number
  result: IpcResult<unknown>
  locked?: boolean
  // Fingerprint of the open vaults' content. A change means our cached
  // lookups may describe entries that were edited since.
  revision?: string
  secret?: string
}

const ENVELOPE_OPTIONAL = ['locked', 'revision', 'pairing'] as const

// Structural check on the frame itself, before anything reads a payload.
// Exactly one of success/error, an integer rid, and no key we don't know
// about — an unrecognised envelope is dropped rather than routed.
function parseEnvelope(raw: unknown): Envelope | null {
  if (!isRecord(raw)) return null
  const hasSuccess = raw.success !== undefined
  const hasError = raw.error !== undefined
  if (hasSuccess === hasError) return null
  if (!hasExactKeys(raw, [hasSuccess ? 'success' : 'error'], ENVELOPE_OPTIONAL)) return null

  let rid: number
  let result: IpcResult<unknown>
  if (hasSuccess) {
    if (!isRecord(raw.success) || !hasExactKeys(raw.success, ['rid'], ['data'])) return null
    if (!Number.isInteger(raw.success.rid)) return null
    rid = raw.success.rid as number
    result = { ok: true, data: raw.success.data ?? undefined }
  } else {
    if (!isRecord(raw.error) || !hasExactKeys(raw.error, ['rid', 'code'])) return null
    if (!Number.isInteger(raw.error.rid) || !isSocketError(raw.error.code)) return null
    rid = raw.error.rid as number
    result = { ok: false, code: raw.error.code }
  }

  const envelope: Envelope = { rid, result }

  if (raw.locked !== undefined) {
    const locked = bool(raw.locked)
    if (locked === null) return null
    envelope.locked = locked
  }
  if (raw.revision !== undefined) {
    const revision = str(raw.revision, LIMITS.id)
    if (revision === null) return null
    envelope.revision = revision
  }
  if (raw.pairing !== undefined) {
    if (!isRecord(raw.pairing) || !hasExactKeys(raw.pairing, ['secret'])) return null
    const secret = nonEmptyStr(raw.pairing.secret, LIMITS.secret)
    if (secret === null) return null
    envelope.secret = secret
  }

  return envelope
}

export interface NativeSelectVault {
  type: 'SELECT_VAULT'
  id: string
}

export interface NativeGetPopupContext {
  type: 'GET_POPUP_CONTEXT'
  url?: string
}

// `fields` is the slice the page declared it could fill. The desktop releases
// the intersection of that and the section's own fields, so an entry never
// crosses whole.
export interface NativeGetEntryById {
  type: 'GET_ENTRY_BY_ID'
  id: string
  vaultId: string
  sectionId: string
  url: string
  fields: FieldType[]
}

export interface NativeGetEntryByToken {
  type: 'GET_ENTRY_BY_TOKEN'
  token: string
  url: string
  fields: FieldType[]
}

// Both entry commands answer with the decrypted entry slice plus a fresh
// single-use token for re-fetching it on the next page load. The shape and
// its validator live together in contracts/responses.ts.
export type { FillGrant } from '../../shared/contracts/responses'

export interface NativeGetEntriesByUrl {
  type: 'GET_ENTRIES_BY_URL'
  url: string
}

export interface NativeGetSectionsByCapability {
  type: 'GET_SECTIONS_BY_CAPABILITY'
  capability: string
}

// No token in the reply: card/address fills are single-shot, with no
// multi-page continuation to chain.
export interface NativeGetEntryByCapability {
  type: 'GET_ENTRY_BY_CAPABILITY'
  id: string
  vaultId: string
  sectionId: string
  capability: string
  fields: FieldType[]
}

export interface NativeSaveEntryIcon {
  type: 'SAVE_ENTRY_ICON'
  id: string
  vaultId: string
  data: string
}

export interface NativeSaveEntry {
  type: 'SAVE_ENTRY'
  url: string
  title?: string
  username: string
  password: string
  // Absent = the desktop's focused vault
  vaultId?: string
}

// Password change for a section the desktop already offered on this URL
export interface NativeUpdateEntryPassword {
  type: 'UPDATE_ENTRY_PASSWORD'
  id: string
  vaultId: string
  sectionId: string
  url: string
  password: string
}

export interface NativeLaunchDesktop {
  type: 'LAUNCH_DESKTOP'
}

// Runs the pairing ceremony: held open by the desktop until the user decides
// (or PAIRING_PENDING after its hold window). Idempotent when already paired.
export interface NativePair {
  type: 'PAIR'
}

export type NativeMessage =
  | NativeSelectVault
  | NativeGetPopupContext
  | NativeGetEntryById
  | NativeGetEntryByToken
  | NativeGetEntriesByUrl
  | NativeGetSectionsByCapability
  | NativeGetEntryByCapability
  | NativeSaveEntryIcon
  | NativeSaveEntry
  | NativeUpdateEntryPassword
  | NativeLaunchDesktop
  | NativePair

const NATIVE_HOST = 'com.brandnewbyte.buddy'
const PAIRING_SECRET_KEY = 'pairing_secret'

// A response is only understood in the context of the request that asked for
// it, so the validator and the is-this-the-ceremony flag are held with the
// resolver rather than looked up from the frame's own contents.
interface PendingRequest {
  resolve: (response: IpcResult<unknown>) => void
  validate: (raw: unknown) => unknown | null
  isPair: boolean
}

let port: chrome.runtime.Port | null = null
let rid = 0
const pending = new Map<number, PendingRequest>()

/** Commands whose reply carries no payload. */
const expectNoData = (raw: unknown): unknown => (raw === undefined ? undefined : null)

// ── Pairing ──────────────────────────────────────────────────────────────────
// The desktop only serves approved clients. Identity (browser + version) rides
// on every message; the secret proves we're the client the user approved. An
// unpaired request fails with PAIRING_REQUIRED while the desktop surfaces its
// approval modal — the user approves there and simply retries. The secret then
// arrives on the first approved reply and is kept in extension-local storage.
// A major version bump re-enters the pairing ceremony by design; minor and
// patch updates keep the existing pairing.

const manifest = chrome.runtime.getManifest()

const clientInfo = {
  // Firefox builds carry browser_specific_settings.gecko in the manifest
  browser: (manifest as { browser_specific_settings?: { gecko?: unknown } }).browser_specific_settings?.gecko ? 'firefox' : 'chrome',
  version: manifest.version,
  id: chrome.runtime.id,
}

// undefined = not yet loaded from storage; null = known to have none
let pairingSecret: string | null | undefined

// Pairing FSM taps (see lib/pairing.ts, which registers itself here — the
// indirection avoids a circular import): 'required' fires on any
// PAIRING_REQUIRED; 'healthy' fires on any response that passed the desktop's
// pairing gate and therefore proves the pairing is valid.
type PairingEvent = 'required' | 'healthy'
let pairingListener: ((event: PairingEvent) => void) | null = null

export function setPairingListener(fn: (event: PairingEvent) => void): void {
  pairingListener = fn
}

// Raised by the pairing FSM for the length of a ceremony, re-arms included.
let ceremonyActive = false

export function setCeremonyActive(active: boolean): void {
  ceremonyActive = active
}

async function getPairingSecret(): Promise<string | null> {
  if (pairingSecret === undefined) {
    const stored = await chrome.storage.local.get(PAIRING_SECRET_KEY)
    pairingSecret = typeof stored[PAIRING_SECRET_KEY] === 'string' ? stored[PAIRING_SECRET_KEY] : null
  }
  return pairingSecret ?? null
}

function storePairingSecret(secret: string | null): void {
  pairingSecret = secret
  if (secret === null) {
    void chrome.storage.local.remove(PAIRING_SECRET_KEY)
  } else {
    void chrome.storage.local.set({ [PAIRING_SECRET_KEY]: secret })
  }
}

// Single badge tap: every reply passes through here, so handlers never
// touch the badge themselves.
function updateBadge(msg: IpcResult<unknown>, locked: boolean | undefined): void {
  if (typeof locked === 'boolean') {
    setBadge(locked ? 'locked' : 'unlocked')
  } else if (!msg.ok && isOffline(msg.code)) {
    setBadge('offline')
  }
}

// Cached matches outlive the vault that produced them, so a lock would
// otherwise leave entries on offer whose Fill silently does nothing. Handled
// here because every reply passes through, which catches an auto-lock during
// an unrelated call rather than only when the user clicks Fill.
//
// `locked` means *nothing* is open; VAULT_LOCKED additionally covers one vault
// of several going away, where the flag stays false.
function invalidateOnLock(msg: IpcResult<unknown>, locked: boolean | undefined): void {
  const lockedOut = locked === true || (!msg.ok && msg.code === 'VAULT_LOCKED')
  if (!lockedOut) return

  searchResultsCache.clear()
  void autofillSession.clearAll()
  void capabilityTarget.clearAll()
}

// An entry edited in the desktop should reach the picker on the next
// interaction, not whenever the worker happens to die. The revision rides
// every reply, so any traffic at all notices the change.
let lastRevision: string | null = null

function invalidateOnRevisionChange(revision: string | undefined): void {
  if (revision === undefined) return
  if (lastRevision !== null && revision !== lastRevision) {
    searchResultsCache.clear()
  }
  lastRevision = revision
  // Only a reply carrying a revision proves the cache still matches the
  // desktop, so this is the one place freshness can be claimed.
  searchResultsCache.markChecked()
}

function connect(): chrome.runtime.Port {
  const p = chrome.runtime.connectNative(NATIVE_HOST)

  p.onMessage.addListener((raw: unknown) => {
    const envelope = parseEnvelope(raw)
    if (!envelope) {
      // Keys only: a malformed frame could still carry payload fields
      console.warn('[native] unroutable message, keys:', isRecord(raw) ? Object.keys(raw).join(',') : typeof raw)
      return
    }

    const { rid, locked, revision } = envelope
    const request = pending.get(rid)
    let msg = envelope.result

    // A secret is only a secret if we asked for one. Binding it to an
    // outstanding PAIR stops any other reply from rotating our pairing.
    if (envelope.secret !== undefined && request?.isPair) {
      storePairingSecret(envelope.secret)
    }

    // Payload validation happens against the request's own schema, so a
    // response can never carry a field the page never asked to fill.
    if (msg.ok && request) {
      const data = request.validate(msg.data)
      msg = data === null
        ? { ok: false, code: 'INVALID_RESPONSE' }
        : { ok: true, data }
      if (!msg.ok) console.warn('[native] response failed its schema, rid:', rid)
    }

    if (!msg.ok && msg.code === 'PAIRING_REQUIRED') {
      // Our pairing is gone (revoked, desktop reinstalled, or we updated).
      // Drop the stale secret so the next request re-enters the ceremony.
      if (pairingSecret) storePairingSecret(null)
      pairingListener?.('required')
    } else if (locked !== undefined && (msg.ok || !PRE_GATE.includes(msg.code))) {
      // `locked` is only stamped by the desktop, and any desktop response
      // that isn't a pre-gate rejection implies our pairing is valid.
      pairingListener?.('healthy')
    }

    updateBadge(msg, locked)
    invalidateOnLock(msg, locked)
    invalidateOnRevisionChange(revision)

    if (request) {
      pending.delete(rid)
      request.resolve(msg)
    }
  })

  p.onDisconnect.addListener(() => {
    port = null
    // Chrome reports through lastError, Firefox through port.error
    const detail = chrome.runtime.lastError?.message
      ?? (p as chrome.runtime.Port & { error?: { message?: string } }).error?.message
      ?? ''
    console.warn('[native] disconnected:', detail || 'no error detail')

    // "Host not found" is the browser saying no native host manifest is
    // registered — the desktop app was never installed. Distinguishable from
    // every does-exist failure (not running, crashed), and what the popup's
    // get-started state keys on. Chrome says "Specified native messaging
    // host not found."; Firefox says "No such native application".
    const code = /not found|no such native/i.test(detail) ? 'NOT_INSTALLED' : 'DISCONNECTED'

    // Nothing cached outlives the desktop. Entries would be offered that no
    // fill can honour, tokens are gone with the process that minted them, and
    // a restarted desktop may hand back a revision matching the one we last
    // saw — so the comparison is dropped rather than trusted.
    lastRevision = null
    searchResultsCache.clear()
    void autofillSession.clearAll()
    void capabilityTarget.clearAll()

    setBadge('offline')
    for (const request of pending.values()) {
      request.resolve({ ok: false, code })
    }
    pending.clear()
  })

  return p
}

function getPort(): chrome.runtime.Port {
  if (!port) port = connect()
  return port
}

/**
 * Sends a command and validates its reply against `validate`, which returns
 * null for anything the contract does not recognise. Commands with no payload
 * omit it and get the no-data check instead.
 */
export async function sendToNative<T>(
  message: NativeMessage,
  validate: (raw: unknown) => T | null,
): Promise<IpcResult<T>>
export async function sendToNative(message: NativeMessage): Promise<IpcResult<void>>
export async function sendToNative<T>(
  message: NativeMessage,
  validate: (raw: unknown) => T | null = expectNoData as (raw: unknown) => T | null,
): Promise<IpcResult<T>> {
  // The desktop holds PAIR open while the user decides and the native host
  // reads one message at a time, so anything posted meanwhile queues behind
  // the hold. It would come back PAIRING_REQUIRED *after* the approval it
  // predates (sent without the secret that approval minted), wiping the fresh
  // secret and re-arming the ceremony once per queued request. Answer here
  // instead: same code the desktop would give, minus the round trip and the
  // 'required' event we'd only be telling ourselves. LAUNCH_DESKTOP is the
  // host's own command and never reaches the pairing gate.
  if (ceremonyActive && message.type !== 'PAIR' && message.type !== 'LAUNCH_DESKTOP') {
    return { ok: false, code: 'PAIRING_REQUIRED' }
  }

  const secret = await getPairingSecret()
  const client = secret ? { ...clientInfo, secret } : clientInfo

  return new Promise((resolve) => {
    const id = ++rid
    pending.set(id, {
      resolve: resolve as (response: IpcResult<unknown>) => void,
      validate,
      isPair: message.type === 'PAIR',
    })
    try {
      getPort().postMessage({ rid: id, protocol_version: PROTOCOL_VERSION, client, ...message })
    } catch (err) {
      pending.delete(id)
      console.warn('[native] post failed:', err instanceof Error ? err.message : err)
      searchResultsCache.clear()
      setBadge('offline')
      resolve({ ok: false, code: 'DISCONNECTED' })
    }
  })
}
