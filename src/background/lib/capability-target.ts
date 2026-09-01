// Which card/address section a tab most recently filled, and into which
// frames. Metadata only: no field values, so nothing here is a secret. It
// exists so a checkout that reveals a CVV box after the card number can be
// completed by re-fetching that slice, rather than by leaving the card sitting
// in the page waiting for a field that may never appear.
import type { Capability } from '../../shared/types'

const TTL_MS = 5 * 60 * 1000

export interface CapabilityTarget {
  id: string
  vaultId: string
  sectionId: string
  capability: Capability
  /** The frames the original fill reached. A frame outside this set is not served. */
  frameIds: number[]
  createdAt: number
}

const key = (tabId: number) => `capability:${tabId}`

export async function get(tabId: number): Promise<CapabilityTarget | null> {
  const result = await chrome.storage.session.get(key(tabId))
  const target = result[key(tabId)] as CapabilityTarget | undefined
  if (!target) return null
  if (Date.now() - target.createdAt > TTL_MS) {
    await clear(tabId)
    return null
  }
  return target
}

export async function set(tabId: number, target: Omit<CapabilityTarget, 'createdAt'>): Promise<void> {
  await chrome.storage.session.set({ [key(tabId)]: { ...target, createdAt: Date.now() } })
}

export async function clear(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId))
}

export async function clearAll(): Promise<void> {
  const all = await chrome.storage.session.get(null)
  const stale = Object.keys(all).filter(k => k.startsWith('capability:'))
  if (stale.length) await chrome.storage.session.remove(stale)
}
