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
import { sorted } from '../src/background/lib/entry-order'
import type { EntryMeta, FieldType } from '../src/shared/types'

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

  it('carries the section\'s remaining fillable set, deduplicated', () => {
    const raw = {
      entry: entry([{ type: 'username', value: 'u' }]),
      token: 't1',
      available: ['username', 'password', 'totp', 'totp'],
    }
    // Wider than the released slice on purpose: this is the multi-page work
    // queue, not a second copy of what just crossed.
    expect(validateFillGrant(raw, LOGIN)?.available).toEqual(['username', 'password', 'totp'])
  })

  it('treats an unrecognised name in the queue as a protocol error', () => {
    const raw = {
      entry: entry([{ type: 'username', value: 'u' }]),
      token: 't1',
      available: ['username', 'totp_seed'],
    }
    expect(validateFillGrant(raw, LOGIN)).toBeNull()
  })

  it('accepts a desktop that sends no queue at all', () => {
    const raw = { entry: entry([{ type: 'username', value: 'u' }]), token: 't1' }
    expect(validateFillGrant(raw, LOGIN)?.available).toBeUndefined()
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

  it('keeps the match rank, and rejects one that is not a sane integer', () => {
    expect(validateEntryList({ entries: [{ ...meta, rank: 21 }] })?.[0].rank).toBe(21)
    expect(validateEntryList({ entries: [{ ...meta, rank: -1 }] })).toBeNull()
    expect(validateEntryList({ entries: [{ ...meta, rank: 1.5 }] })).toBeNull()
    expect(validateEntryList({ entries: [{ ...meta, rank: LIMITS.rank + 1 }] })).toBeNull()
  })
})

describe('byEntryOrder', () => {
  const meta = (over: Partial<EntryMeta>): EntryMeta =>
    ({ id: 'e1', vaultId: 'v1', sectionId: 's1', title: 'X', ...over })

  it('leads with the more specific URL match, not the alphabet', () => {
    // The pwbuddy.com/demo case: two entries on one host, told apart only by
    // path. Sorting on title alone put Harbor in front on Meridian's own page.
    const harbor = meta({ title: 'Harbor', rank: 0 })
    const meridian = meta({ title: 'Meridian', rank: 21 })
    expect(sorted([harbor, meridian]).map(e => e.title)).toEqual(['Meridian', 'Harbor'])
  })

  it('falls back to the existing order when ranks tie or are absent', () => {
    const a = meta({ title: 'Beta', rank: 1 })
    const b = meta({ title: 'Alpha', rank: 1 })
    expect(sorted([a, b]).map(e => e.title)).toEqual(['Alpha', 'Beta'])
    expect(sorted([meta({ title: 'Beta' }), meta({ title: 'Alpha' })]).map(e => e.title))
      .toEqual(['Alpha', 'Beta'])
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
