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

/**
 * The multi-page login chain, in the order a flow can present it.
 *
 * A fill session's work queue is drawn from this and nothing else. Card and
 * address forms arrive whole: a checkout that omits the cardholder name has no
 * name box, not a second page holding one. Those roles in a queue would only
 * keep a login session alive past the login it belongs to — an entry storing a
 * card alongside its login could never retire its own session.
 */
export const LOGIN_CHAIN = ['username', 'password', 'totp'] as const

export type LoginChainField = (typeof LOGIN_CHAIN)[number]

/** `fields` narrowed to the chain and put back in chain order. */
export function loginChain(fields: readonly FieldType[]): FieldType[] {
  return LOGIN_CHAIN.filter(field => fields.includes(field))
}

/**
 * A step retires itself and every earlier one: a page that hands back a
 * password says the username step is behind us whether or not this page
 * carried a username box. Flows only ever move forwards, so anything at or
 * before the furthest field just filled is no longer owed.
 */
export function remainingAfter(remaining: readonly FieldType[], filled: readonly FieldType[]): FieldType[] {
  const position = (field: FieldType) => (LOGIN_CHAIN as readonly string[]).indexOf(field)
  // -1 seeds the fold and is also what an off-chain field scores, so one
  // arriving retires nothing rather than emptying the queue.
  const furthest = filled.reduce((max, field) => Math.max(max, position(field)), -1)
  return remaining.filter(field => position(field) > furthest)
}

/** Section kinds offered by capability rather than by URL. */
export const CAPABILITIES = ['card', 'address'] as const

export type Capability = (typeof CAPABILITIES)[number]

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value)
}
