import { sendToNative } from '../lib/native'
import { validateCapabilityGrant, validateFillGrant } from '../../shared/contracts/responses'
import { originPath } from '../lib/tabs'
import { pendingTokens } from '../lib/pending-tokens'
import { isFieldType, loginChain, type FieldType } from '../../shared/contracts/fields'
import { LIMITS } from '../../shared/contracts/limits'
import * as autofillSession from '../lib/autofill-session'
import * as capabilityTarget from '../lib/capability-target'
import type { IpcResult } from '../../shared/ipc'
import type { GetPendingFillMessage } from '../../shared/messages'
import type { Entry } from '../../shared/types'

// A frame asks whether a fill is pending for its tab, naming what it can take:
// a desktop-initiated token (_bftk grab), an in-progress multi-page session, or
// a card/address section whose form has just revealed another field.
//
// Nothing is held between page loads except a single-use token and, for
// capability fills, the metadata needed to ask again. The slice is intersected
// with what the page offers before anything is requested, so a resumed fill
// carries only fields this document has somewhere to put.
export async function handle(
  sender: chrome.runtime.MessageSender | undefined,
  message: GetPendingFillMessage,
): Promise<IpcResult<Entry | null>> {
  const tab = sender?.tab
  const tabId = tab?.id
  const url = originPath(tab)
  if (!tabId || !url) return { ok: false, code: 'BAD_REQUEST' }

  const offers = normalizeOffers(message.offers)
  if (!offers.length) return { ok: true, data: null }

  // Multi-page login sessions resume in the top frame only; a subframe asking
  // can still be served a capability refill below, but never a login.
  //
  // A fresh document charges the session's budget before anything is asked of
  // the vault, so a session that has outlived its login flow runs out of pages
  // rather than staying offerable for the rest of its TTL. A desktop token is
  // not metered: its first ask *is* the page load that redeems it.
  const topFrame = sender?.frameId === 0
  const desktopToken = topFrame ? await pendingTokens.get(tabId) : undefined
  const session = topFrame && !desktopToken
    ? (message.reason === 'reveal' ? await autofillSession.get(tabId) : await autofillSession.countDocument(tabId))
    : null
  const token = desktopToken ?? session?.token

  if (token) {
    // A resumed session only wants what it has not filled yet. A desktop token
    // has no history to narrow against, so the page's own offer is the floor.
    const requested = session ? intersect(offers, session.remaining) : offers
    if (!requested.length) return { ok: true, data: null }

    const response = await sendToNative(
      { type: 'GET_ENTRY_BY_TOKEN', token, url, fields: requested },
      raw => validateFillGrant(raw, requested),
    )

    if (!response.ok) {
      // Token expired, vault locked, or page doesn't match the entry:
      // drop local state so we stop asking
      await pendingTokens.delete(tabId)
      await autofillSession.clear(tabId)
      return response
    }

    const { entry, token: next, available } = response.data
    if (session) {
      await autofillSession.rotate(tabId, next)
    } else {
      // A desktop-initiated grab becomes a session here, and takes the same
      // work queue a picker fill would: what the section holds, so its own
      // later pages resume rather than stopping at this one.
      await pendingTokens.delete(tabId)
      await autofillSession.start(tabId, next, loginChain(available ?? entry.fields.map(f => f.type)))
    }
    return { ok: true, data: entry }
  }

  return refillCapability(tabId, sender?.frameId, offers)
}

// Only the frames the original fill reached may ask again, so a revealed CVV
// box is served while an unrelated frame that merely offers card fields is not.
async function refillCapability(
  tabId: number,
  frameId: number | undefined,
  offers: FieldType[],
): Promise<IpcResult<Entry | null>> {
  const target = await capabilityTarget.get(tabId)
  if (!target || !Number.isInteger(frameId) || !target.frameIds.includes(frameId!)) {
    return { ok: true, data: null }
  }

  const response = await sendToNative(
    {
      type: 'GET_ENTRY_BY_CAPABILITY',
      id: target.id,
      vaultId: target.vaultId,
      sectionId: target.sectionId,
      capability: target.capability,
      fields: offers,
    },
    raw => validateCapabilityGrant(raw, offers),
  )

  if (!response.ok) {
    await capabilityTarget.clear(tabId)
    return response
  }
  return { ok: true, data: response.data }
}

function normalizeOffers(offers: unknown): FieldType[] {
  if (!Array.isArray(offers)) return []
  const unique = [...new Set(offers.filter(isFieldType))]
  return unique.length <= LIMITS.entryFields ? unique : []
}

function intersect(offers: FieldType[], remaining: FieldType[]): FieldType[] {
  return offers.filter(field => remaining.includes(field))
}
