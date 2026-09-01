// The wire field vocabulary, as a runtime allowlist. `FieldType` is derived
// from it rather than declared alongside it, so a type added here without a
// validator entry is a compile error rather than a silent passthrough.
//
// These are the desktop's role names verbatim (see socket/protocol.rs). The
// page-side vocabulary is `PageRole` in content/forms.ts; the two meet only
// in content/fill/slice.ts, which maps one to the other.
export const FIELD_TYPES = [
  'username',
  'password',
  'totp',
  'card_name',
  'card_number',
  'card_exp',
  'card_cvv',
  'street',
  'street2',
  'city',
  'region',
  'postal_code',
  'country',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export function isFieldType(value: unknown): value is FieldType {
  return typeof value === 'string' && (FIELD_TYPES as readonly string[]).includes(value)
}

/** Section kinds offered by capability rather than by URL. */
export const CAPABILITIES = ['card', 'address'] as const

export type Capability = (typeof CAPABILITIES)[number]

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value)
}
