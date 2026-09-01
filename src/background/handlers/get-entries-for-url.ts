import { sendToNative } from '../lib/native'
import { validateEntryList } from '../../shared/contracts/responses'
import { setTabCount } from '../lib/badge'
import * as searchResultsCache from '../lib/search-results-cache'
import { sorted } from '../lib/entry-order'
import type { IpcResult } from '../../shared/ipc'
import type { EntryMeta } from '../../shared/types'

// How long a cached result stays trustworthy without re-confirmation. Long
// enough to absorb one interaction's burst — focus events moving across a
// form, the multi-frame probe, the save-candidate lookup right after a submit
// — and short enough that unlocking a vault and reaching for the glyph can
// never read the state before it.
const FRESH_MS = 1500

// The url is the sender frame's own, taken from the browser-attested sender
// rather than from the message: a frame asks what the vault holds for itself,
// never for the page embedding it.
export async function handle(
  tabId: number | undefined,
  url: string | null,
): Promise<IpcResult<EntryMeta[]>> {
  if (!url) return { ok: true, data: [] }

  // Serving from cache produces no native traffic, and invalidation only
  // rides replies — so an unconfirmed cache re-asks rather than answering
  // from a picture of the vault taken an interaction ago.
  const cached = searchResultsCache.checkedWithin(FRESH_MS) ? searchResultsCache.get(url) : null
  if (cached) {
    if (tabId) setTabCount(tabId, cached.length)
    return { ok: true, data: cached }
  }

  const response = await sendToNative({
    type: 'GET_ENTRIES_BY_URL',
    url,
  }, validateEntryList)

  if (!response.ok) return response

  const entries = sorted(response.data)
  searchResultsCache.set(url, entries)
  if (tabId) setTabCount(tabId, entries.length)
  return { ok: true, data: entries }
}
