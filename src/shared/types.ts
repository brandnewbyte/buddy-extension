// The wire vocabulary lives in contracts/fields.ts, which owns it as a
// runtime allowlist; these re-exports keep the historical import site working.
// A hand-maintained second naming scheme is what previously drifted (card_name
// vs card-holder, plus a card-zip that nothing ever emitted).
//
// `forms.ts` keeps its own separate union for what it finds on the *page*;
// the two meet only in fill/slice.ts, which maps one to the other.
import type { FieldType } from './contracts/fields'

export type { FieldType, Capability } from './contracts/fields'
export { FIELD_TYPES, CAPABILITIES, isFieldType, isCapability } from './contracts/fields'

export interface Vault {
  id: string
  name: string
  color: string
  locked: boolean
}

export interface Entry {
  id: string
  vaultId: string
  sectionId: string
  title: string
  hasIcon: boolean,
  fields: EntryField[]
}

export interface EntryField {
  type: FieldType
  label?: string
  value: string
}

export interface EntryMeta {
  id: string
  // Identity is the triple. Ids are unique per vault rather than globally, and
  // one entry can offer several fillable sections — two logins on the same
  // site, say — so a result names the section it came from.
  vaultId: string
  sectionId: string
  /** The section's name, for telling two logins on one entry apart. */
  sectionName?: string
  /** What this section can fill: login / card / address. */
  capabilities?: string[]
  /**
   * How specifically this section's URL matched the page: higher is more
   * specific, 0 is a host-only match against a stored path that didn't apply.
   * Ordering only — matching already happened on the desktop.
   */
  rank?: number
  title: string
  username?: string
  url?: string
  /** Display hint for URL-less sections: a card's "•••• 4242", an address's street. */
  subtitle?: string
}

// What a save prompt needs to render. Deliberately password-free: the
// captured password lives in the background's pending-save store and goes
// straight from there to the desktop on confirm — it never crosses back into
// a page's content script or the popup.
export interface EntrySaveMeta {
  title: string
  url: string
  username: string
  // 'update' = this username already exists for the site; confirming changes
  // that entry's password instead of creating a duplicate.
  kind: 'new' | 'update'
  // Where an update lands. Fixed by the entry being updated, so the confirming
  // surface shows it rather than offering a choice. Absent on a new save,
  // whose destination is the user's to pick.
  vaultId?: string
}
