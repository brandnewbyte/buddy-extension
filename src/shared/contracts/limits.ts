// Size caps for everything the desktop can send us. A response that exceeds
// one is rejected outright rather than truncated: a value we had to cut is a
// value we no longer understand, and silently filling a truncated password is
// worse than filling nothing.
export const LIMITS = {
  /** Entry, vault and section identifiers. */
  id: 128,
  /** Single-use fill token. */
  token: 256,
  /** Pairing secret. */
  secret: 512,
  /** Entry and vault display names. */
  title: 512,
  /** Per-field display label, and the picker's section/subtitle hints. */
  label: 256,
  /** Any released field value: password, card number, street, TOTP code. */
  value: 4096,
  /** Saved-login URL echoed back in metadata. */
  url: 2048,
  /** Vault colour token. */
  color: 64,

  /** Fields on one released entry. Thirteen roles exist; allow slack. */
  entryFields: 32,
  /** Capability strings listed against one picker result. */
  capabilities: 8,
  /** URL-match specificity. The desktop's rank is 1 + the matched path length. */
  rank: 2049,
  /** Results in one picker or popup listing. */
  entries: 500,
  /** Open vaults. */
  vaults: 64,
} as const
