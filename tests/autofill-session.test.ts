import { describe, it, expect, beforeEach, vi } from 'vitest'

// A minimal chrome.storage.session over a Map: the module under test only ever
// gets, sets and removes whole keys.
const store = new Map<string, unknown>()

vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) store.set(k, v)
      },
      remove: async (key: string) => { store.delete(key) },
    },
  },
})

const session = await import('../src/background/lib/autofill-session')
const { loginChain, remainingAfter } = await import('../src/shared/contracts/fields')

const TAB = 1

describe('autofill session work queue', () => {
  beforeEach(() => store.clear())

  it('survives a page that fills only part of what the section holds', async () => {
    // The multi-page regression: seeded from the granted slice, the session
    // emptied on page one and the TOTP step found nothing pending.
    await session.start(TAB, 't1', ['username', 'password', 'totp'])
    await session.markFilled(TAB, ['username', 'password'])

    expect((await session.get(TAB))?.remaining).toEqual(['totp'])
  })

  it('retires itself once the last field is filled', async () => {
    await session.start(TAB, 't1', ['username', 'password'])
    await session.markFilled(TAB, ['username', 'password'])

    expect(await session.get(TAB)).toBeNull()
  })
})

describe('autofill session chain narrowing', () => {
  beforeEach(() => store.clear())

  it('retires every earlier step, not just the fields this page carried', () => {
    // A page handing back a password says the username step is behind us,
    // whether or not it drew a username box.
    expect(remainingAfter(['username', 'password', 'totp'], ['password'])).toEqual(['totp'])
  })

  it('leaves the queue alone when the filled field is off the chain', () => {
    expect(remainingAfter(['password', 'totp'], ['card_number'])).toEqual(['password', 'totp'])
  })

  it('keeps only the login chain, in chain order', () => {
    // The real shape of the bug: a section holding a card beside its login
    // seeded card roles nothing would ever fill, so the session never emptied.
    expect(loginChain(['card_number', 'totp', 'street', 'username'])).toEqual(['username', 'totp'])
  })

  it('retires a session whose entry has nothing left to give', async () => {
    // No TOTP on the entry, so one page finishes it and nothing lingers.
    await session.start(TAB, 't1', loginChain(['username', 'password', 'card_number']))
    await session.markFilled(TAB, ['username', 'password'])

    expect(await session.get(TAB)).toBeNull()
  })
})

describe('autofill session document budget', () => {
  beforeEach(() => store.clear())

  it('drops the session once its pages are spent', async () => {
    await session.start(TAB, 't1', ['username', 'password', 'totp'])

    // Three documents is the budget; the fourth finds nothing to resume.
    expect(await session.countDocument(TAB)).not.toBeNull()
    expect(await session.countDocument(TAB)).not.toBeNull()
    expect(await session.countDocument(TAB)).not.toBeNull()
    expect(await session.countDocument(TAB)).toBeNull()
    expect(await session.get(TAB)).toBeNull()
  })

  it('keeps the count across a token rotation', async () => {
    // Every resumed page redeems and rotates, so a budget reset here would
    // mean no budget at all.
    await session.start(TAB, 't1', ['username', 'password', 'totp'])
    await session.countDocument(TAB)
    await session.rotate(TAB, 't2')

    expect((await session.get(TAB))?.documents).toBe(1)
    expect((await session.get(TAB))?.token).toBe('t2')
  })
})
