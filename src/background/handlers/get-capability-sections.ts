import { sendToNative } from '../lib/native'
import { validateEntryList } from '../../shared/contracts/responses'
import { sorted } from '../lib/entry-order'
import type { GetCapabilitySectionsMessage } from '../../shared/messages'
import type { IpcResult } from '../../shared/ipc'
import type { EntryMeta } from '../../shared/types'

// Metadata only (titles, masked hints); the secrets are released by
// START_CAPABILITY_FILL after the user picks a section.
export async function handle(message: GetCapabilitySectionsMessage): Promise<IpcResult<EntryMeta[]>> {
  const response = await sendToNative({
    type: 'GET_SECTIONS_BY_CAPABILITY',
    capability: message.capability,
  }, validateEntryList)

  if (!response.ok) return response
  return { ok: true, data: sorted(response.data) }
}
