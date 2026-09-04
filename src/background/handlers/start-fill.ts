import { sendToNative } from '../lib/native'
import { validateFillGrant } from '../../shared/contracts/responses'
import { activeTab, originPath, senderFrameUrl } from '../lib/tabs'
import { probe } from '../lib/frame-offers'
import { ensureContentScript } from '../lib/host-access'
import { deliver, type FrameTarget } from '../lib/fill-delivery'
import { isFieldType, loginChain } from '../../shared/contracts/fields'
import * as autofillSession from '../lib/autofill-session'
import * as pendingSave from '../lib/pending-save'
import type { IpcResult } from '../../shared/ipc'
import type { StartFillMessage } from '../../shared/messages'

// User picked an entry (popup or picker): trade the id for the slice that
// entry can contribute to the target form, plus a session token, then hand
// each target frame its own part.
//
// An anchored pick is keyed on the frame the user clicked in, origin included,
// so a login living in a cross-origin iframe fills against its own saved
// entry. A popup pick has no such frame: it speaks for the tab, so it stays on
// the top document rather than releasing the top page's credential into
// somebody else's frame.
export async function handle(sender: chrome.runtime.MessageSender | undefined, message: StartFillMessage): Promise<IpcResult<void>> {
  const tab = sender?.tab ?? await activeTab()
  if (!tab?.id) return { ok: false, code: 'BAD_REQUEST' }

  // Deliberately reaching for a stored credential retires whatever the last
  // login on this tab left behind. Cleared up front rather than on success:
  // the earlier capture is stale either way, and a second login carrying the
  // first one's save offer is worse than no offer at all.
  await pendingSave.clear(tab.id)

  let targets: FrameTarget[]
  let url: string | null

  if (sender?.tab) {
    targets = anchoredTarget(sender, message)
    url = senderFrameUrl(sender)
  } else {
    // Popup pick: the page may have no script at all on an ungranted origin.
    await ensureContentScript(tab.id)
    const offers = await probe(tab.id, 'login')
    targets = offers.filter(offer => offer.trusted)
    url = originPath(tab)

    // Every candidate sat in a cross-origin frame, which is how a bank hosting
    // its login on a sibling domain looks. Say that, rather than failing as
    // though the page had no sign-in form at all.
    if (!targets.length && offers.length) return { ok: false, code: 'FRAME_REQUIRED' }
  }

  if (!url) return { ok: false, code: 'BAD_REQUEST' }

  // A login goes to exactly one frame. Two candidates is the ambiguity the
  // unanchored rule has always refused, now resolved before any release.
  if (!targets.length) return { ok: false, code: 'NO_FILLABLE_FIELD' }
  if (targets.length > 1) return { ok: false, code: 'MULTIPLE_MATCHES' }

  const requested = targets[0].slice
  const response = await sendToNative(
    {
      type: 'GET_ENTRY_BY_ID',
      id: message.id,
      vaultId: message.vaultId,
      sectionId: message.sectionId,
      url,
      fields: requested,
    },
    raw => validateFillGrant(raw, requested),
  )

  if (!response.ok) return response

  // Seeded from what the section *holds*, not from the slice just released:
  // a login page that offers only username/password would otherwise declare
  // the session finished the moment it was filled, and the TOTP step a page
  // later would find nothing pending. `available` is absent only on a desktop
  // predating it, where the granted slice is the best queue there is.
  const { entry, token, available } = response.data
  await autofillSession.start(tab.id, token, loginChain(available ?? entry.fields.map(f => f.type)))
  await deliver(tab.id, targets, entry)

  return { ok: true, data: undefined }
}

function anchoredTarget(sender: chrome.runtime.MessageSender, message: StartFillMessage): FrameTarget[] {
  const frameId = sender.frameId
  const slice = [...new Set((message.slice ?? []).filter(isFieldType))]
  return Number.isInteger(frameId) && slice.length ? [{ frameId: frameId!, slice }] : []
}
