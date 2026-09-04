import { sendToNative } from '../lib/native'
import { validateFillGrant } from '../../shared/contracts/responses'
import { senderFrameUrl } from '../lib/tabs'
import { deliver } from '../lib/fill-delivery'
import type { IpcResult } from '../../shared/ipc'
import type { RefreshTotpMessage } from '../../shared/messages'
import type { FieldType } from '../../shared/types'

const TOTP_ONLY: FieldType[] = ['totp']

// Replaces a code that has aged out under a user who hadn't submitted yet.
//
// Deliberately not a session and deliberately not START_FILL: there is no
// chain to continue, nothing is held between the original fill and this, and
// START_FILL would retire the tab's pending save — a login two pages back is
// exactly what the user is still in the middle of.
//
// The gates are the same ones a pick gets. The frame is browser-attested and
// answers only itself; the desktop re-runs URL matching against the entry
// before releasing, so a tab that has navigated elsewhere gets nothing. Only
// the code crosses: the slice is fixed here rather than taken from the page.
export async function handle(
  sender: chrome.runtime.MessageSender | undefined,
  message: RefreshTotpMessage,
): Promise<IpcResult<void>> {
  const tabId = sender?.tab?.id
  const frameId = sender?.frameId
  const url = senderFrameUrl(sender)
  if (!tabId || !url || !Number.isInteger(frameId)) return { ok: false, code: 'BAD_REQUEST' }

  const response = await sendToNative(
    {
      type: 'GET_ENTRY_BY_ID',
      id: message.id,
      vaultId: message.vaultId,
      sectionId: message.sectionId,
      url,
      fields: TOTP_ONLY,
    },
    raw => validateFillGrant(raw, TOTP_ONLY),
  )

  if (!response.ok) return response

  // The successor token is simply dropped: it is single-use and short-lived,
  // and a refresh starts no chain for it to carry.
  await deliver(tabId, [{ frameId: frameId!, slice: TOTP_ONLY }], response.data.entry)
  return { ok: true, data: undefined }
}
