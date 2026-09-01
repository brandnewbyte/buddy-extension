import * as pendingSave from '../lib/pending-save'
import type { IpcResult } from '../../shared/ipc'
import type { EntrySaveMeta } from '../../shared/types'

// Content script asks on page load whether credentials were captured on the
// previous page (form submit → navigation) and should be offered for saving.
// Origin-bound: a submit that lands the tab somewhere else entirely (an OAuth
// hop, a link the user clicked meanwhile) must not surface the prompt there.
// The candidate itself survives that page — the popup still offers it on the
// origin's own terms — but not the one after it.
export async function handle(tab: chrome.tabs.Tab | undefined): Promise<IpcResult<EntrySaveMeta | null>> {
  const tabId = tab?.id
  if (!tabId) return { ok: false, code: 'BAD_REQUEST' }

  // This ask is the one per-page signal the background gets, so it is also
  // where a candidate ages. Charged before reading: a candidate whose budget
  // this document spends is gone from the popup too, not just from the bar.
  await pendingSave.countDocument(tabId)

  // An auto-hidden bar had its chance in-page; it doesn't chase the user
  // from page to page. The popup still offers the candidate.
  const candidate = await pendingSave.get(tabId)
  if (candidate?.snoozed) return { ok: true, data: null }

  const meta = await pendingSave.meta(tabId)
  if (!meta) return { ok: true, data: null }

  if (origin(meta.url) === null || origin(meta.url) !== origin(tab.url)) {
    return { ok: true, data: null }
  }

  return { ok: true, data: meta }
}

function origin(url: string | undefined): string | null {
  if (!url) return null
  try { return new URL(url).origin } catch { return null }
}
