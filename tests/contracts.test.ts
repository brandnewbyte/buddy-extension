import { describe, it, expect } from 'vitest'
import {
  validateEntry,
  validateEntryList,
  validateFillGrant,
  validatePopupContext,
  validateSavedEntryRef,
} from '../src/shared/contracts/responses'
import { LIMITS } from '../src/shared/contracts/limits'
import { hasExactKeys } from '../src/shared/contracts/validate'
import type { FieldType } from '../src/shared/types'

const LOGIN: FieldType[] = ['username', 'password']

function entry(fields: { type: string; value: string; label?: string }[]): unknown {
  return { id: 'e1', vaultId: 'v1', sectionId: 's1', title: 'Test', hasIcon: false, fields }
}

describe('hasExactKeys', () => {
  it('accepts exactly the required keys, with optionals absent or present', () => {
    expect(hasExactKeys({ a: 1, b: 2 }, ['a', 'b'])).toBe(true)
    expect(hasExactKeys({ a: 1 }, ['a'], ['b'])).toBe(true)
    expect(hasExactKeys({ a: 1, b: 2 }, ['a'], ['b'])).toBe(true)
  })

  it('rejects a missing required key and any key it was not told about', () => {
    expect(hasExactKeys({ a: 1 }, ['a', 'b'])).toBe(false)
    expect(hasExactKeys({ a: 1, rogue: 2 }, ['a'])).toBe(false)
  })
})

describe('validateEntry', () => {
  it('accepts a well-formed entry holding a subset of the requested slice', () => {
    const result = validateEntry(entry([{ type: 'username', value: 'u' }]), LOGIN)
    expect(result?.fields).toEqual([{ type: 'username', value: 'u' }])
  })

  it('rejects a field the page never asked for', () => {
    // The whole point of the slice: a login form gets no TOTP, and a desktop
    // that sends one anyway is a protocol error rather than a silent fill.
    expect(validateEntry(entry([{ type: 'totp', value: '123456' }]), LOGIN)).toBeNull()
  })

  it('rejects an unknown field type', () => {
    expect(validateEntry(entry([{ type: 'totp_seed', value: 'JBSWY3DP' }]), LOGIN)).toBeNull()
  })

  it('rejects an extra key on a field, which is how a seed would arrive', () => {
    expect(validateEntry(entry([{ type: 'totp', value: '1', seed: 'JBSWY' } as never]), ['totp'])).toBeNull()
  })

  it('rejects an extra key on the entry itself', () => {
    const raw = { ...(entry([]) as object), notes: 'secret' }
    expect(validateEntry(raw, LOGIN)).toBeNull()
  })

  it('rejects duplicate roles, which fill could not choose between', () => {
    const raw = entry([
      { type: 'password', value: 'a' },
      { type: 'password', value: 'b' },
    ])
    expect(validateEntry(raw, LOGIN)).toBeNull()
  })

  it('rejects an oversized value rather than truncating it', () => {
    const raw = entry([{ type: 'password', value: 'x'.repeat(LIMITS.value + 1) }])
    expect(validateEntry(raw, LOGIN)).toBeNull()
  })

  it('rejects a missing required key and a non-object', () => {
    expect(validateEntry({ id: 'e1' }, LOGIN)).toBeNull()
    expect(validateEntry(null, LOGIN)).toBeNull()
    expect(validateEntry([], LOGIN)).toBeNull()
  })

  it('keeps an optional label but not an empty slice request', () => {
    const withLabel = validateEntry(entry([{ type: 'username', value: 'u', label: 'Email' }]), LOGIN)
    expect(withLabel?.fields[0].label).toBe('Email')
    expect(validateEntry(entry([{ type: 'username', value: 'u' }]), [])).toBeNull()
  })
})

describe('validateFillGrant', () => {
  it('requires both the entry and a non-empty successor token', () => {
    const raw = { entry: entry([{ type: 'username', value: 'u' }]), token: 't1' }
    expect(validateFillGrant(raw, LOGIN)?.token).toBe('t1')
    expect(validateFillGrant({ ...raw, token: '' }, LOGIN)).toBeNull()
    expect(validateFillGrant({ entry: raw.entry }, LOGIN)).toBeNull()
  })
})

describe('validateEntryList', () => {
  const meta = { id: 'e1', vaultId: 'v1', sectionId: 's1', title: 'Example' }

  it('accepts metadata and keeps optional hints', () => {
    const result = validateEntryList({ entries: [{ ...meta, username: 'u', subtitle: '4242' }] })
    expect(result).toHaveLength(1)
    expect(result?.[0].subtitle).toBe('4242')
  })

  it('rejects the whole list when one entry is malformed', () => {
    expect(validateEntryList({ entries: [meta, { ...meta, rogue: true }] })).toBeNull()
  })

  it('rejects a listing longer than the cap', () => {
    const entries = Array.from({ length: LIMITS.entries + 1 }, () => meta)
    expect(validateEntryList({ entries })).toBeNull()
  })
})

describe('validatePopupContext', () => {
  const vault = { id: 'v1', name: 'Personal', color: 'blue', locked: false }

  it('treats absent search results as empty', () => {
    expect(validatePopupContext({ vaults: [vault] })).toEqual({ vaults: [vault], searchResults: [] })
  })

  it('rejects a vault with an unexpected key', () => {
    expect(validatePopupContext({ vaults: [{ ...vault, path: '/tmp/v.vault' }] })).toBeNull()
  })
})

describe('validateSavedEntryRef', () => {
  it('accepts the id pair and nothing else', () => {
    expect(validateSavedEntryRef({ id: 'e1', vaultId: 'v1' })).toEqual({ id: 'e1', vaultId: 'v1' })
    expect(validateSavedEntryRef({ id: 'e1', vaultId: 'v1', password: 'p' })).toBeNull()
  })
})
