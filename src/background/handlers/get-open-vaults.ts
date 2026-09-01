import { sendToNative } from '../lib/native'
import { validatePopupContext } from '../../shared/contracts/responses'
import * as saveTarget from '../lib/save-target'
import type { IpcResult } from '../../shared/ipc'
import type { OpenVaults } from '../../shared/messages'

// Names and colours for the vaults currently open. Asked without a URL so the
// desktop skips the entry search — this runs when a picker or save bar appears,
// not on every navigation.
export async function handle(): Promise<IpcResult<OpenVaults>> {
  const response = await sendToNative({ type: 'GET_POPUP_CONTEXT' }, validatePopupContext)
  if (!response.ok) return response

  const open = response.data.vaults.filter(v => !v.locked)
  const last = await saveTarget.get()

  return { ok: true, data: {
    vaults: open,
    // A remembered vault that has since been closed shouldn't preselect
    lastSaveVaultId: open.some(v => v.id === last) ? last : null,
  }}
}
