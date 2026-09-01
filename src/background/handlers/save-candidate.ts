import type { SaveCandidateMessage } from '../../shared/messages'
import * as pendingSave from '../lib/pending-save'
import * as getEntriesForUrl from './get-entries-for-url'
import type { EntryMeta } from '../../shared/types'

// Classify a captured submit against what the vault already holds for this
// page: unknown username = offer a new save; known username = offer a
// password update for that exact section. The content script has already
// filtered out submits whose password we autofilled verbatim, so a known
// username arriving here means the password differed.
export async function handle(tabId: number | undefined, msg: SaveCandidateMessage): Promise<void> {
  if (!tabId) return

  const username = msg.fields.find(f => f.role === 'username')?.value
  const existing = username ? findExisting(await knownEntries(tabId, msg.url), username) : null

  await pendingSave.set(tabId, {
    url: msg.url,
    title: msg.title,
    fields: msg.fields,
    kind: existing ? 'update' : 'new',
    target: existing
      ? { entryId: existing.id, vaultId: existing.vaultId, sectionId: existing.sectionId }
      : undefined,
  })
}

// Through the handler rather than reading the cache directly: this decides
// whether the user is shown "save" or "update", and one cache policy deciding
// that is better than two. A locked vault or offline desktop yields [], which
// safely degrades to a 'new' save — confirm surfaces the real error anyway.
async function knownEntries(tabId: number, url: string): Promise<EntryMeta[]> {
  const res = await getEntriesForUrl.handle(tabId, url)
  return res.ok ? res.data : []
}

function findExisting(entries: EntryMeta[], username: string): EntryMeta | null {
  return entries.find(e => e.username === username && e.id && e.sectionId) ?? null
}
