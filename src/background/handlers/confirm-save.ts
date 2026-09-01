import type { ConfirmSaveMessage } from '../../shared/messages'
import type { IpcResult } from '../../shared/ipc'
import * as pendingSave from '../lib/pending-save'
import * as saveTarget from '../lib/save-target'
import * as searchResultsCache from '../lib/search-results-cache'
import { activeTab } from '../lib/tabs'
import { sendToNative } from '../lib/native'
import { validateSavedEntryRef } from '../../shared/contracts/responses'

// The candidate (password included) comes from the background's own store,
// keyed by tab — the confirming surface only names a destination vault.
export async function handle(tabId: number | undefined, msg: ConfirmSaveMessage): Promise<IpcResult<{ id: string, vaultId: string }>> {
  const id = tabId ?? (await activeTab())?.id
  if (!id) return { ok: false, code: 'BAD_REQUEST' }

  const candidate = await pendingSave.get(id)
  const creds = candidate && pendingSave.credentials(candidate)
  if (!candidate || !creds) return { ok: false, code: 'NOT_FOUND' }

  // Known username on this page = a password change for that exact section,
  // never a duplicate entry alongside it.
  const result = candidate.kind === 'update' && candidate.target
    ? await sendToNative({
        type: 'UPDATE_ENTRY_PASSWORD',
        id: candidate.target.entryId,
        vaultId: candidate.target.vaultId,
        sectionId: candidate.target.sectionId,
        url: candidate.url,
        password: creds.password,
      }, validateSavedEntryRef)
    : await sendToNative({
        type: 'SAVE_ENTRY',
        url: candidate.url,
        title: candidate.title,
        username: creds.username,
        password: creds.password,
        vaultId: msg.vaultId,
      }, validateSavedEntryRef)

  // Only clear the pending save once we know it actually landed — a failed
  // save (e.g. locked vault) should stay offered rather than being lost.
  if (result.ok) {
    await pendingSave.clear(id)
    // The cached match list for this page no longer reflects the vault
    searchResultsCache.clear()
    // Remember the destination so the next save preselects it
    if (candidate.kind === 'new') await saveTarget.set(msg.vaultId)
  }

  return result
}
