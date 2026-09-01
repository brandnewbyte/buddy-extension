import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach } from 'vitest'
import { classifyPage, formFor, pickerOffer } from '../src/content/forms'
import { pageOffers, sliceFor } from '../src/content/fill/slice'

// A slice is what the extension is willing to receive. These assert the
// request side of the fill: what a page shape causes us to ask the vault for.
// Over-asking is the failure mode, so every case names the exact set.

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

function load(name: string): void {
  document.body.innerHTML = readFileSync(join(FIXTURES, name), 'utf8')
}

function offers(name: string, lane?: 'login' | 'card' | 'address'): string[] {
  load(name)
  return pageOffers(classifyPage(), lane).sort()
}

function anchoredSlice(selector: string): string[] {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`no element for ${selector}`)
  const forms = classifyPage()
  const offer = pickerOffer(el, forms)
  const form = formFor(el, forms)
  if (!offer || !form) return []
  return sliceFor(form, offer).sort()
}

beforeEach(() => { document.body.innerHTML = '' })

describe('pageOffers', () => {
  it('asks for exactly the roles a plain login resolved', () => {
    expect(offers('plain-login.html')).toEqual(['password', 'username'])
  })

  it('asks for nothing when two login forms make the target ambiguous', () => {
    // Same rule the unanchored fill has always applied, now enforced before
    // anything is requested rather than after it arrives.
    expect(offers('two-login-forms.html')).toEqual([])
  })

  it('asks for the username alone on a password-less first step', () => {
    expect(offers('split-login-step1.html')).toEqual(['username'])
  })

  it('ignores a footer newsletter box when a real login is present', () => {
    expect(offers('newsletter-plus-login.html')).toEqual(['password', 'username'])
  })

  it('never asks for login fields on a checkout with no login form', () => {
    expect(offers('checkout-card.html')).not.toContain('password')
    expect(offers('checkout-card.html')).not.toContain('username')
  })

  it('collapses the split expiry pair into the single wire field', () => {
    const card = offers('checkout-card.html', 'card')
    expect(card).toContain('card_exp')
    expect(card).not.toContain('card_exp_month')
    expect(card).not.toContain('card_exp_year')
  })

  it('keeps card and address in separate lanes on one checkout form', () => {
    expect(offers('checkout-card.html', 'card').every(f => f.startsWith('card_'))).toBe(true)
    expect(offers('checkout-card.html', 'address').some(f => f.startsWith('card_'))).toBe(false)
  })
})

describe('sliceFor, anchored', () => {
  it('asks only for the lane the user picked in', () => {
    load('checkout-card.html')
    const card = anchoredSlice('input[autocomplete="cc-number"]')
    expect(card.length).toBeGreaterThan(0)
    expect(card.every(field => field.startsWith('card_'))).toBe(true)
  })

  it('asks for the address lane when the pick was an address field', () => {
    load('checkout-card.html')
    expect(anchoredSlice('input[name="ship_city"]')).toContain('city')
    expect(anchoredSlice('input[name="ship_city"]').some(f => f.startsWith('card_'))).toBe(false)
  })

  it('collapses a new-password and its confirm into one wire field', () => {
    // Two password controls, one released value: the confirm box is echoed
    // client-side, so the request must not name `password` twice or ask for a
    // second secret the vault does not have.
    load('register-confirm-password.html')
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(2)
    expect(anchoredSlice('input[type="password"]')).toEqual(['password', 'username'])
  })

  it('asks for nothing on a field that resolved to no role', () => {
    load('orphan-search.html')
    const search = document.querySelector('input')
    expect(search).not.toBeNull()
    expect(anchoredSlice('input')).toEqual([])
  })
})
