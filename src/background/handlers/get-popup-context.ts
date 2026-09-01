import { sendToNative, NativeGetPopupContext } from '../lib/native'
import { validatePopupContext } from '../../shared/contracts/responses'
import { activeTab, originPath } from '../lib/tabs'
import { setTabCount } from '../lib/badge'
import * as searchResultsCache from '../lib/search-results-cache'
import * as autofillSession from '../lib/autofill-session'
import * as pendingSave from '../lib/pending-save'
import * as saveTarget from '../lib/save-target'
import { sorted } from '../lib/entry-order'
import type { IpcResult } from '../../shared/ipc'
import type { PopupContext } from '../../shared/messages'

export async function handle(): Promise<IpcResult<PopupContext>> {
  const tab = await activeTab()
  const url = originPath(tab)

  const request: NativeGetPopupContext = { type: 'GET_POPUP_CONTEXT' }
  if (url) request.url = url

  const response = await sendToNative(request, validatePopupContext)
  if (!response.ok) return response

  const { vaults } = response.data
  const searchResults = sorted(response.data.searchResults)

  // Authoritative view of which vaults are open — drops the content script's
  // cached matches if that set has changed since they were stored.
  searchResultsCache.syncOpenVaults(vaults.filter(v => !v.locked).map(v => v.id))

  // A locked vault yields an empty result set — don't cache that as a miss
  if (url && vaults.some(v => !v.locked))
    searchResultsCache.set(url, searchResults)

  if (tab?.id) setTabCount(tab.id, searchResults.length)

  const fillActive = tab?.id ? !!(await autofillSession.get(tab.id)) : false

  // Same rule as get-open-vaults: a remembered vault that has since been
  // closed shouldn't preselect anything.
  const last = await saveTarget.get()
  const lastSaveVaultId = vaults.some(v => !v.locked && v.id === last) ? last : null

  return { ok: true, data: {
    vaults,
    searchResults,
    fillActive,
    pendingSave: tab?.id ? await pendingSave.meta(tab.id) : null,
    lastSaveVaultId,
  }}
}
