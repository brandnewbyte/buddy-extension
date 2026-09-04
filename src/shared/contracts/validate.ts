// Validation primitives for native responses.
//
// Every helper returns null on failure rather than throwing, so a validator
// reads as a chain of guards and a single malformed leaf collapses the whole
// response to null. Callers treat null as a protocol error.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Closed-object check: `value` carries every required key, no key outside
 * required ∪ optional, and nothing inherited. This is what stops a future
 * desktop field from reaching us unreviewed. A TOTP seed sent where a code
 * belongs is an extra key, and an extra key is a rejection.
 */
export function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  if (keys.some(key => !required.includes(key) && !optional.includes(key))) return false
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
}

/** A string of at most `max` characters, or null. Empty is allowed. */
export function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}

/** As `str`, but rejects the empty string: for identifiers and tokens. */
export function nonEmptyStr(value: unknown, max: number): string | null {
  const s = str(value, max)
  return s !== null && s.length > 0 ? s : null
}

/** An optional string: absent is fine, present must be valid. */
export function optionalStr(value: unknown, max: number): { ok: true; value?: string } | null {
  if (value === undefined) return { ok: true }
  const s = str(value, max)
  return s === null ? null : { ok: true, value: s }
}

/** A non-negative integer of at most `max`, or null. */
export function nonNegativeInt(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : null
}

export function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** An array of at most `max` entries, or null. */
export function arr(value: unknown, max: number): unknown[] | null {
  return Array.isArray(value) && value.length <= max ? value : null
}

/**
 * Maps a validator over an array, collapsing to null if any element fails.
 * Partial acceptance is deliberately not offered: half a picker list is a
 * list we cannot explain to the user.
 */
export function mapAll<T>(values: unknown[], validate: (value: unknown) => T | null): T[] | null {
  const out: T[] = []
  for (const value of values) {
    const item = validate(value)
    if (item === null) return null
    out.push(item)
  }
  return out
}
