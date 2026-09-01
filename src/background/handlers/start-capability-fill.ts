import { sendToNative } from '../lib/native'
import { validateCapabilityGrant } from '../../shared/contracts/responses'
import { activeTab } from '../lib/tabs'
import { probe } from '../lib/frame-offers'
import { ensureContentScript } from '../lib/host-access'
import { deliver, type FrameTarget } from '../lib/fill-delivery'
import { isFieldType } from '../../shared/contracts/fields'
import * as capabilityTarget from '../lib/capability-target'
import type { IpcResult } from '../../shared/ipc'
import type { StartCapabilityFillMessage } from '../../shared/messages'

// A card/address pick. Unlike logins there is no URL gate and no session
// token. Several frames may legitimately take part — a split-field payment
// provider puts each box in its own iframe — so the release is the union of
// what those frames asked for, and each one is then handed only its own piece.
export async function handle(sender: chrome.runtime.MessageSender | undefined, message: StartCapabilityFillMessage): Promise<IpcResult<void>> {
  const tab = sender?.tab ?? await activeTab()
  if (!tab?.id) return { ok: false, code: 'BAD_REQUEST' }

  // An anchored pick fills its own frame plus its same-origin siblings: that
  // is what completes a provider's split card form without opening every frame
  // on the page to the release. A popup pick has no anchor origin to fence
  // against and reaches whichever frames answered the probe.
  const anchored = sender?.tab ? anchoredTarget(sender, message) : []
  const anchorOrigin = anchored.length ? originOfSender(sender) : null
  // Card fields live in the processor's iframes, so a popup pick has to reach
  // frames as well as the top document.
  if (!anchored.length) await ensureContentScript(tab.id, true)
  const offers = await probe(tab.id, message.capability)

  const siblings = offers
    .filter(offer => !anchored.some(target => target.frameId === offer.frameId))
    .filter(offer => anchored.length === 0 || (anchorOrigin !== null && offer.origin === anchorOrigin))
    .map(offer => ({ frameId: offer.frameId, slice: offer.slice }))

  const targets: FrameTarget[] = [...anchored, ...siblings]
  if (!targets.length) return { ok: false, code: 'NOT_FOUND' }

  const requested = [...new Set(targets.flatMap(target => target.slice))]
  const response = await sendToNative(
    {
      type: 'GET_ENTRY_BY_CAPABILITY',
      id: message.id,
      vaultId: message.vaultId,
      sectionId: message.sectionId,
      capability: message.capability,
      fields: requested,
    },
    raw => validateCapabilityGrant(raw, requested),
  )

  if (!response.ok) return response

  const delivered = await deliver(tab.id, targets, response.data)
  if (delivered.length) {
    await capabilityTarget.set(tab.id, {
      id: message.id,
      vaultId: message.vaultId,
      sectionId: message.sectionId,
      capability: message.capability,
      frameIds: delivered,
    })
  }

  return { ok: true, data: undefined }
}

function anchoredTarget(sender: chrome.runtime.MessageSender, message: StartCapabilityFillMessage): FrameTarget[] {
  const frameId = sender.frameId
  const slice = [...new Set((message.slice ?? []).filter(isFieldType))]
  return Number.isInteger(frameId) && slice.length ? [{ frameId: frameId!, slice }] : []
}

function originOfSender(sender: chrome.runtime.MessageSender | undefined): string | null {
  if (!sender?.url) return null
  try { return new URL(sender.url).origin } catch { return null }
}
