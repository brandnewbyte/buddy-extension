import { remainingAfter } from '../../shared/contracts/fields'
import type { FieldType } from '../../shared/types'

const TTL_MS = 5 * 60 * 1000

// Top-frame documents that may resume this session before it's dropped. The
// TTL alone is a weak bound: matching is host-exact but path never gates, so a
// session outliving its login flow stays offerable on every other page of the
// same site for the rest of the window. A multi-page login spends one document
// per step it's actually asked to fill — two for username/password/TOTP, and
// the third is slack for a client-side redirect that re-presents a form.
//
// Only pages presenting fillable fields ask at all, so an interstitial or a
// post-login dashboard costs nothing: the budget meters exactly the documents
// where a resume was possible.
const MAX_DOCUMENTS = 3

// Security boundary: no entry values are ever persisted here. The session
// holds a single-use token redeemable through the native channel plus the
// remaining field types (work queue). Secrets are re-fetched from the
// desktop per page load and only transit memory during the fill itself.
interface AutofillSession {
  token: string
  remaining: FieldType[]
  createdAt: number
  // Top-frame documents that have asked to resume. Counts pages rather than
  // navigations because the content script's per-page ask is the only
  // navigation signal available without the `tabs` permission.
  documents?: number
}

const key = (tabId: number) => `autofill:${tabId}`

export async function get(tabId: number): Promise<AutofillSession | null> {
  const result = await chrome.storage.session.get(key(tabId))
  const sess = result[key(tabId)] as AutofillSession | undefined
  if (!sess) return null
  if (Date.now() - sess.createdAt > TTL_MS || !sess.remaining.length) {
    await clear(tabId)
    return null
  }
  return sess
}

async function save(tabId: number, sess: AutofillSession): Promise<void> {
  await chrome.storage.session.set({ [key(tabId)]: sess })
}

export async function start(tabId: number, token: string, fields: FieldType[]): Promise<void> {
  await save(tabId, { token, remaining: [...fields], createdAt: Date.now() })
}

// Charges one top-frame document against the session's budget, returning the
// survivor — or null once it's spent and the session has been dropped.
export async function countDocument(tabId: number): Promise<AutofillSession | null> {
  const sess = await get(tabId)
  if (!sess) return null

  const documents = (sess.documents ?? 0) + 1
  if (documents > MAX_DOCUMENTS) {
    await clear(tabId)
    return null
  }

  const charged = { ...sess, documents }
  await save(tabId, charged)
  return charged
}

// Each redemption consumes the token; store its successor
export async function rotate(tabId: number, token: string): Promise<void> {
  const sess = await get(tabId)
  if (!sess) return
  await save(tabId, { ...sess, token, createdAt: Date.now() })
}

export async function markFilled(tabId: number, types: FieldType[]): Promise<void> {
  const sess = await get(tabId)
  if (!sess) return

  sess.remaining = remainingAfter(sess.remaining, types)

  if (!sess.remaining.length) {
    await clear(tabId)
  } else {
    await save(tabId, sess)
  }
}

export async function clear(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId))
}

// Every tab's session at once. The tokens they hold are wiped by the desktop
// on lock, so keeping them would only produce fills that fail.
export async function clearAll(): Promise<void> {
  const all = await chrome.storage.session.get(null)
  const stale = Object.keys(all).filter(k => k.startsWith('autofill:'))

  if (stale.length) await chrome.storage.session.remove(stale)
}

