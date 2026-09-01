import { activeTab } from '../lib/tabs'
import { pendingTokens } from '../lib/pending-tokens'
import * as autofillSession from '../lib/autofill-session'
import type { IpcResult } from '../../shared/ipc'

// Abandon the active tab's autofill session (mis-click, wrong entry, etc).
// The desktop-side token is left to expire; it's unusable without the
// local successor anyway.
export async function handle(): Promise<IpcResult<void>> {
  const tab = await activeTab()
  if (!tab?.id) return { ok: false, code: 'BAD_REQUEST' }

  await pendingTokens.delete(tab.id)
  await autofillSession.clear(tab.id)
  return { ok: true, data: undefined }
}
