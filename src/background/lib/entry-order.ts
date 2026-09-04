import type { EntryMeta } from '../../shared/types'

// Results merge every open vault, so the desktop's order is really unlock
// order: it shifts under the user between one picker and the next, and the
// same set can come back arranged differently after a lock. Ordered here,
// once, so the picker and the popup can never disagree about a list they both
// got from the same place.
//
// Relevance first: the desktop ranked these by how specifically each entry's
// URL matched the page, and two entries on one host are exactly the case where
// alphabetical order puts the wrong one in front. Sorting title-first threw
// that away — on /demo/meridian/login, "Harbor" led on the strength of its H.
//
// Title next because that's what the row leads with. The rest is tie-breaking
// only: two logins on one site differ by username, and the vault is the last
// resort for the same account saved in two of them.
export function byEntryOrder(a: EntryMeta, b: EntryMeta): number {
  return (b.rank ?? 0) - (a.rank ?? 0)
    || a.title.localeCompare(b.title)
    || (a.username ?? a.subtitle ?? '').localeCompare(b.username ?? b.subtitle ?? '')
    || (a.sectionName ?? '').localeCompare(b.sectionName ?? '')
    || a.vaultId.localeCompare(b.vaultId)
}

export function sorted(entries: EntryMeta[]): EntryMeta[] {
  return [...entries].sort(byEntryOrder)
}
