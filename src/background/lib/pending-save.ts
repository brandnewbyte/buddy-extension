import type { EntrySaveMeta } from '../../shared/types'

// A capture is only interesting for as long as the user is plausibly still
// thinking about the login they just performed. The document budget below is
// the real bound; this catches a tab that simply sits there afterwards.
const TTL_MS = 90 * 1000

// Top-frame documents a candidate may be offered to before it's dropped. The
// page that captured it never asks (its submit navigates away first), so one
// budgets exactly the landing page. Two, because a login that bounces through
// a client-side redirect commits a document before the user sees anything.
const MAX_DOCUMENTS = 2

// The password stays in this module until CONFIRM_SAVE hands it to the
// desktop. Content scripts and the popup only ever see meta() — a prompt
// needs a title and username to render, not the secret it's about.
//
// storage.session (memory-backed, never written to disk) rather than a module
// Map so a candidate survives the MV3 worker being torn down mid-navigation.
export interface SaveCandidate {
  url: string
  title: string
  fields: { role: string; value: string }[]
  capturedAt: number
  // 'update' = the username matches an entry we already hold for this page;
  // target names the exact section whose password changes.
  kind: 'new' | 'update'
  target?: { entryId: string; vaultId: string; sectionId: string }
  // Auto-hidden once: the in-page bar stays gone (it had its chance), while
  // the popup keeps offering the save for the candidate's remaining life.
  snoozed?: boolean
  // Top-frame documents that have asked for this candidate. Counts pages
  // rather than navigations because the content script's per-page ask is the
  // only navigation signal available without the `tabs` permission.
  documents?: number
}

const key = (tabId: number) => `pendingSave:${tabId}`

export async function set(tabId: number, data: Omit<SaveCandidate, 'capturedAt'>): Promise<void> {
  await chrome.storage.session.set({ [key(tabId)]: { ...data, capturedAt: Date.now() } })
}

export async function get(tabId: number): Promise<SaveCandidate | null> {
  const result = await chrome.storage.session.get(key(tabId))
  const c = result[key(tabId)] as SaveCandidate | undefined
  if (!c) return null
  if (Date.now() - c.capturedAt > TTL_MS) { await clear(tabId); return null }
  return c
}

export async function clear(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId))
}

export async function snooze(tabId: number): Promise<void> {
  const c = await get(tabId)
  if (c) await chrome.storage.session.set({ [key(tabId)]: { ...c, snoozed: true } })
}

/// Charges one top-frame document against the candidate's budget, dropping it
/// once spent. Called from the content script's per-page ask and nowhere else:
/// the popup reading the same candidate must not age it.
export async function countDocument(tabId: number): Promise<void> {
  const c = await get(tabId)
  if (!c) return

  const documents = (c.documents ?? 0) + 1
  if (documents > MAX_DOCUMENTS) {
    await clear(tabId)
    return
  }

  await chrome.storage.session.set({ [key(tabId)]: { ...c, documents } })
}

export function credentials(c: SaveCandidate): { username: string; password: string } | null {
  const username = c.fields.find(f => f.role === 'username')?.value ?? ''
  const password = c.fields.find(f => f.role === 'password' || f.role === 'new_password')?.value ?? ''
  if (!username || !password) return null
  return { username, password }
}

/// The password-free view that may cross to content scripts and the popup.
export async function meta(tabId: number): Promise<EntrySaveMeta | null> {
  const c = await get(tabId)
  if (!c) return null

  const creds = credentials(c)
  if (!creds) return null

  return {
    url: c.url, title: c.title, username: creds.username, kind: c.kind,
    // Only an update has a fixed destination; a new save's is still open.
    ...(c.target ? { vaultId: c.target.vaultId } : {}),
  }
}
