import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach } from 'vitest'
import { fill } from '../src/content/fill/index'
import { classifyPage, offersLoginPicker, pickerOffer } from '../src/content/forms'
import { sliceFor } from '../src/content/fill/slice'
import type { Entry, FieldType } from '../src/shared/types'

// Each fixture is a body snapshot of a page shape seen in the wild, exercised
// through the real fill() path (classify → target form → set values).
// Conventions inside a fixture:
//   data-expect="username|password|totp"  the element that MUST receive the value
//   data-expect-echo                      may receive a duplicate of an expected
//                                         value (confirm-password fields)
//   data-decoy                            an element that must NEVER receive a value
//   data-no-picker                        the picker must not open on this
//   data-anchor                           run the fill anchored at this element;
//                                         without it the fill is unanchored
//                                         (popup / multi-page resume semantics)
// A field type with no data-expect in the fixture asserts the value lands nowhere.

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

const VALUES: Record<string, string> = {
  username: 'user@example.com',
  password: 'correct-horse-battery',
  totp: '481516',
}

export function entryOf(types: FieldType[], values: Record<string, string> = VALUES): Entry {
  return {
    id: 'e1', vaultId: 'v1', sectionId: 's1', title: 'Test', hasIcon: true,
    fields: types.map(type => ({ type, value: values[type] ?? '' })),
  }
}

function allControls(): (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[] {
  return [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')]
}

function loadFixture(name: string): void {
  document.body.innerHTML = readFileSync(join(FIXTURES, name), 'utf8')
}

function val(selector: string): string {
  return document.querySelector<HTMLInputElement>(selector)?.value ?? ''
}

// The affinity invariant that motivated the anchored-fill rework: with two
// real login forms, the anchor decides everything and its absence fills nothing.
describe('anchored fill affinity', () => {
  beforeEach(() => loadFixture('two-login-forms.html'))

  it('fills only the anchored form', async () => {
    const filled = await fill(entryOf(['username', 'password']), document.querySelector('#admin input[name="username"]'))
    expect(filled.sort()).toEqual(['password', 'username'])
    expect(val('#admin input[name="username"]')).toBe(VALUES.username)
    expect(val('#admin input[name="password"]')).toBe(VALUES.password)
    expect(val('#customer input[name="email"]')).toBe('')
    expect(val('#customer input[name="password"]')).toBe('')
  })

  it('anchoring the other form flips the outcome', async () => {
    await fill(entryOf(['username', 'password']), document.querySelector('#customer input[name="email"]'))
    expect(val('#customer input[name="password"]')).toBe(VALUES.password)
    expect(val('#admin input[name="password"]')).toBe('')
  })

  it('unanchored fill refuses to choose', async () => {
    const filled = await fill(entryOf(['username', 'password']), null)
    expect(filled).toEqual([])
  })
})

describe('card and address fill', () => {
  beforeEach(() => loadFixture('checkout-card.html'))

  const cardEntry = (): Entry => ({
    id: 'c1', vaultId: 'v1', sectionId: 's1', title: 'Visa', hasIcon: true,
    fields: [
      { type: 'card_name', value: 'Robin Doe' },
      { type: 'card_number', value: '4242424242424242' },
      { type: 'card_exp', value: '04/26' },
      { type: 'card_cvv', value: '123' },
    ],
  })

  const addressEntry = (): Entry => ({
    id: 'a1', vaultId: 'v1', sectionId: 's1', title: 'Home', hasIcon: true,
    fields: [
      { type: 'street', value: '1 Main St' },
      { type: 'city', value: 'Springfield' },
      { type: 'region', value: 'CA' },
      { type: 'postal_code', value: '90210' },
      { type: 'country', value: 'US' },
    ],
  })

  it('classifies the checkout as a card form', () => {
    const kinds = classifyPage().map(f => f.kind)
    expect(kinds).toContain('card')
  })

  it('fills card fields including split expiry selects', async () => {
    const filled = await fill(cardEntry(), document.querySelector('input[name="cardnumber"]'))
    expect(filled.sort()).toEqual(['card_cvv', 'card_exp', 'card_name', 'card_number'])
    expect(val('input[name="cardnumber"]')).toBe('4242424242424242')
    expect(val('input[name="card_holder"]')).toBe('Robin Doe')
    expect(val('input[name="cvv"]')).toBe('123')
    expect(val('select[name="exp_month"]')).toBe('4')   // "04" matched numerically
    expect(val('select[name="exp_year"]')).toBe('26')   // "2026" matched via two-digit year
  })

  it('fills the address block when anchored inside it', async () => {
    const filled = await fill(addressEntry(), document.querySelector('input[name="ship_address1"]'))
    expect(filled.sort()).toEqual(['city', 'country', 'postal_code', 'region', 'street'])
    expect(val('input[name="ship_address1"]')).toBe('1 Main St')
    expect(val('input[name="ship_city"]')).toBe('Springfield')
    expect(val('input[name="ship_zip"]')).toBe('90210')
    expect(val('select[name="ship_state"]')).toBe('CA')
    expect(val('select[name="ship_country"]')).toBe('US')
  })

  it('never fills login credentials into a checkout', async () => {
    const filled = await fill(entryOf(['username', 'password']), null)
    expect(filled).toEqual([])
  })

  it('offers the matching picker per field', () => {
    const forms = classifyPage()
    expect(pickerOffer(document.querySelector('input[name="cardnumber"]')!, forms)).toBe('card')
    expect(pickerOffer(document.querySelector('input[name="cvv"]')!, forms)).toBe('card')
    expect(pickerOffer(document.querySelector('input[name="ship_city"]')!, forms)).toBe('address')
    // A checkout never offers logins anywhere
    for (const el of document.querySelectorAll('input, select')) {
      expect(pickerOffer(el, forms)).not.toBe('login')
    }
  })
})

describe('card fields with shared widget hints', () => {
  beforeEach(() => loadFixture('card-shared-widget-hints.html'))

  const cardEntry = (): Entry => ({
    id: 'c2', vaultId: 'v1', sectionId: 's1', title: 'Mastercard', hasIcon: true,
    fields: [
      { type: 'card_name', value: 'Taylor Doe' },
      { type: 'card_number', value: '5555555555554444' },
      { type: 'card_exp', value: '04/30' },
    ],
  })

  it('resolves specific roles despite a shared credit-card class', () => {
    const form = classifyPage().find(candidate => candidate.kind === 'card')
    expect(form).toBeDefined()
    expect(sliceFor(form!, 'card').sort()).toEqual(['card_exp', 'card_name', 'card_number'])

    for (const selector of ['#payment-number', '#payment-holder', '#payment-month', '#payment-year']) {
      expect(pickerOffer(document.querySelector(selector)!, [form!])).toBe('card')
    }
  })

  it('fills holder name and both expiry selects along with the number', async () => {
    const filled = await fill(cardEntry(), document.querySelector('#payment-number'))
    expect(filled.sort()).toEqual(['card_exp', 'card_name', 'card_number'])
    expect(val('#payment-number')).toBe('5555555555554444')
    expect(val('#payment-holder')).toBe('Taylor Doe')
    expect(val('#payment-month')).toBe('4')
    expect(val('#payment-year')).toBe('2030')
  })

  it('keeps broad number vocabulary when it belongs to the input identity', () => {
    document.body.innerHTML = '<form><input type="tel" name="credit_card"><button>Pay</button></form>'
    const input = document.querySelector('input')!
    const form = classifyPage().find(candidate => candidate.kind === 'card')
    expect(form?.resolved.card_number).toBe(input)
    expect(pickerOffer(input, form ? [form] : [])).toBe('card')
  })

  it('uses account-holder vocabulary only after card context is established', () => {
    document.body.innerHTML = `
      <form>
        <input type="tel" name="cardNumber">
        <input type="text" name="accountHolderName">
      </form>
    `
    const holder = document.querySelector('input[name="accountHolderName"]')
    const form = classifyPage().find(candidate => candidate.kind === 'card')
    expect(form?.resolved.card_name).toBe(holder)
  })
})

for (const file of readdirSync(FIXTURES).filter(f => f.endsWith('.html')).sort()) {
  describe(basename(file, '.html'), () => {
    beforeEach(() => {
      document.body.innerHTML = readFileSync(join(FIXTURES, file), 'utf8')
    })

    it('fills expected fields, nothing elsewhere, never a decoy', async () => {
      const anchor = document.querySelector('[data-anchor]')
      await fill(entryOf(['username', 'password', 'totp']), anchor)

      for (const type of ['username', 'password', 'totp'] as const) {
        const expected = document.querySelector<HTMLInputElement>(`[data-expect="${type}"]`)
        const holders = allControls().filter(el => el.value === VALUES[type])

        if (expected) {
          expect(expected.value, `${type}: expected element not filled`).toBe(VALUES[type])
        }

        for (const el of holders) {
          expect(el.hasAttribute('data-decoy'), `${type}: filled a decoy: ${el.outerHTML}`).toBe(false)
          const legitimate = el === expected || el.hasAttribute('data-expect-echo')
          expect(legitimate, `${type}: value leaked into ${el.outerHTML}`).toBe(true)
        }

        if (!expected) {
          expect(holders.length, `${type}: value landed with no expectation`).toBe(0)
        }
      }
    })

    // The picker gate and fill resolve targets through the same classifier
    // on purpose: a field worth filling must be worth offering on, and a
    // field fill would skip gets no dropdown.
    it('opens the picker only on resolved login fields', () => {
      const forms = classifyPage()
      for (const el of document.querySelectorAll('[data-no-picker]')) {
        expect(pickerOffer(el, forms), `${el.outerHTML}: picker must stay shut`).toBeNull()
      }
      for (const el of document.querySelectorAll('[data-expect]')) {
        expect(offersLoginPicker(el, forms), `${el.outerHTML}: fillable but no picker`).toBe(true)
      }
    })
  })
}
