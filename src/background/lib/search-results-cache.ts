import type { EntryMeta } from '../../shared/types'

// Volatile per-worker cache of url → matching entries, feeding the content
// script's GET_ENTRIES_FOR_URL. Keys are origin+pathname and the map dies with
// the service worker.
//
// Results are only meaningful for the set of vaults that produced them, so the
// cache is invalidated whenever that set changes — otherwise a locked vault
// leaves entries on offer that can no longer be filled.
const cache = new Map<string, EntryMeta[]>()

let openVaultFingerprint: string | null = null

// When the cache was last confirmed against a desktop reply. Both revision
// and lock invalidation ride replies, and a cache hit produces no reply of
// its own, so without this a hit would keep serving whatever was true at the
// last unrelated call — one interaction behind, indefinitely.
let checkedAt = 0

/// A reply carrying a revision has just been applied: the cache now describes
/// the desktop as of this moment.
export function markChecked(): void {
  checkedAt = Date.now()
}

export function checkedWithin(ms: number): boolean {
  return Date.now() - checkedAt < ms
}

function key(url: string): string | null {
  try {
    const { origin, pathname } = new URL(url)
    return `searchResults:${origin}:${pathname}`
  } catch {
    return null
  }
}

export function get(url: string): EntryMeta[] | null {
  const k = key(url)
  return k ? cache.get(k) ?? null : null
}

export function set(url: string, entries: EntryMeta[]): void {
  const k = key(url)
  if (k) cache.set(k, entries)
}

export function clear(): void {
  cache.clear()
  checkedAt = 0
}

/// Drops everything when the set of open vaults changes. Covers unlocking as
/// well as locking: a newly opened vault can add matches a cached result set
/// never knew about.
export function syncOpenVaults(openIds: string[]): void {
  const next = [...openIds].sort().join(',')

  if (next === openVaultFingerprint) return

  openVaultFingerprint = next
  cache.clear()
}
