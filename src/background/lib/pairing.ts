import { sendToNative, setPairingListener, setCeremonyActive } from './native'
import type { IpcResult } from '../../shared/ipc'
import type { PairingState } from '../../shared/messages'

// Extension-side pairing governor. The desktop is deliberately dumb here: it
// never shows the approval modal except in response to an explicit PAIR
// command, so this module fully owns prompt frequency:
//
//   - Auto: the first PAIRING_REQUIRED of a browser session triggers one
//     ceremony. After that (and always after a dismissal) it's manual-only
//     via the popup's Connect button.
//   - A PAIR is held open by the desktop while the user decides. PENDING
//     answers (user undecided after the hold window) re-arm the hold a few
//     times so a slow decision still lands in-band.
//   - Self-heal: any response that passed the desktop's pairing gate proves a
//     valid pairing and resets both flags, so a later revocation gets one
//     fresh auto-ceremony. PAIR is also idempotent desktop-side — if pairing
//     already exists it returns OK without any prompt.
//
// Flags live in chrome.storage.session: survives service-worker restarts,
// clears on browser restart (which re-arms the single auto attempt).

const DISMISSED_KEY = 'pair_dismissed'
const ATTEMPTED_KEY = 'pair_attempted'
// Each PENDING answer means the desktop held for its full window (60s) while
// the modal stayed up; a few re-arms ≈ several minutes of patience.
const MAX_ARMS = 5

// undefined = not yet loaded from session storage
let dismissed: boolean | undefined
let attempted: boolean | undefined
let inFlight: Promise<IpcResult<void>> | null = null

async function loadFlags(): Promise<void> {
  if (dismissed !== undefined) return
  const stored = await chrome.storage.session.get([DISMISSED_KEY, ATTEMPTED_KEY])
  dismissed = !!stored[DISMISSED_KEY]
  attempted = !!stored[ATTEMPTED_KEY]
}

function setFlags(d: boolean, a: boolean): void {
  dismissed = d
  attempted = a
  void chrome.storage.session.set({ [DISMISSED_KEY]: d, [ATTEMPTED_KEY]: a })
}

function currentState(): PairingState {
  if (inFlight) return 'pairing'
  if (dismissed) return 'dismissed'
  return 'idle'
}

// Popup keeps its pairing UI live off these broadcasts; nobody may be
// listening, which sendMessage reports as an error — ignore it.
function broadcast(state: PairingState): void {
  void chrome.runtime.sendMessage({ type: 'PAIRING_STATE_CHANGED', state }).catch(() => {})
}

export async function getState(): Promise<IpcResult<PairingState>> {
  await loadFlags()
  return { ok: true, data: currentState() }
}

/// One PAIR ceremony, re-armed through PENDING answers. Concurrent callers
/// join the in-flight run instead of stacking modals.
function run(): Promise<IpcResult<void>> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    // Everything else fails fast locally while this is up, rather than
    // queueing behind the desktop's hold in the native host's serial loop.
    setCeremonyActive(true)
    try {
      for (let arm = 0; arm < MAX_ARMS; arm++) {
        const res = await sendToNative({ type: 'PAIR' })
        if (res.ok) {
          // Secret already stored off the response envelope by native.ts
          setFlags(false, false)
          broadcast('paired')
          return res
        }
        if (res.code === 'PAIRING_PENDING') continue
        if (res.code === 'PAIRING_DISMISSED') {
          setFlags(true, true)
          return res
        }
        // Desktop gone/too old/etc — give up quietly, keep the auto attempt
        // spent so we don't loop on the next request
        return res
      }
      return { ok: false as const, code: 'PAIRING_PENDING' as const }
    } finally {
      setCeremonyActive(false)
      inFlight = null
      broadcast(currentState())
    }
  })()

  broadcast('pairing')
  return inFlight
}

/// First PAIRING_REQUIRED of the session gets one automatic ceremony;
/// afterwards the user drives retries from the popup.
async function maybeAutoPair(): Promise<void> {
  await loadFlags()
  if (dismissed || attempted || inFlight) return
  setFlags(false, true)
  await run()
}

/// Popup "Connect": always allowed — clears a dismissal and re-runs.
export async function manualPair(): Promise<IpcResult<void>> {
  await loadFlags()
  if (!inFlight) setFlags(false, true)
  return run()
}

setPairingListener((event) => {
  if (event === 'required') {
    void maybeAutoPair()
  } else {
    // A response passed the desktop's pairing gate: pairing is valid. Reset
    // the FSM so a future revocation re-enters it cleanly.
    void loadFlags().then(() => {
      if (dismissed || attempted) setFlags(false, false)
    })
  }
})
