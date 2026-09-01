import type { FieldType } from '../../shared/types'

const TTL_MS = 5 * 60 * 1000

// Security boundary: no entry values are ever persisted here. The session
// holds a single-use token redeemable through the native channel plus the
// remaining field types (work queue). Secrets are re-fetched from the
// desktop per page load and only transit memory during the fill itself.
interface AutofillSession {
  token: string
  remaining: FieldType[]
  createdAt: number
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

// Each redemption consumes the token; store its successor
export async function rotate(tabId: number, token: string): Promise<void> {
  const sess = await get(tabId)
  if (!sess) return
  await save(tabId, { ...sess, token, createdAt: Date.now() })
}

export async function markFilled(tabId: number, types: FieldType[]): Promise<void> {
  const sess = await get(tabId)
  if (!sess) return

  sess.remaining = sess.remaining.filter(t => !types.includes(t))

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

