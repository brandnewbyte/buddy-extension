import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { classifyPage, formFor } from '../src/content/forms'
import { isProgrammaticFill, setControlValue } from '../src/content/fill/dom'
import {
  declineFormContaining,
  isDeclined,
  markDeclined,
  markOffered,
  resetDeclines,
} from '../src/content/picker/decline'

// The picker used to have no memory at all: every focusin re-offered from
// scratch. These pin the rule that replaced it — a refusal covers the form,
// not the field, so turning it down on the username also silences the
// password box beside it.

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

function load(name: string): void {
  document.body.innerHTML = readFileSync(join(FIXTURES, name), 'utf8')
}

function formOf(selector: string) {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`no element for ${selector}`)
  const form = formFor(el, classifyPage())
  if (!form) throw new Error(`no classified form for ${selector}`)
  return { el, form }
}

beforeEach(() => {
  resetDeclines()
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
})

describe('declining a form', () => {
  it('silences the password field after a refusal on the username', () => {
    // The exact reported annoyance: hand-key the username, and the dropdown
    // reappears on the password beside it.
    load('plain-login.html')
    const username = formOf('input[type="email"]')
    markOffered(username.form.container)

    expect(declineFormContaining(username.el)).toBe(true)

    const password = formOf('input[type="password"]')
    expect(password.form.container).toBe(username.form.container)
    expect(isDeclined(password.form.container)).toBe(true)
  })

  it('leaves a second, genuinely different login form still offerable', () => {
    load('two-login-forms.html')
    const customer = formOf('#customer input[type="password"]')
    const admin = formOf('#admin input[type="password"]')
    expect(customer.form.container).not.toBe(admin.form.container)

    markOffered(customer.form.container)
    markOffered(admin.form.container)
    declineFormContaining(customer.el)

    expect(isDeclined(customer.form.container)).toBe(true)
    expect(isDeclined(admin.form.container)).toBe(false)
  })

  it('treats typing where we never offered as a refusal of nothing', () => {
    load('plain-login.html')
    const { el } = formOf('input[type="email"]')
    // No markOffered: the picker never appeared here.
    expect(declineFormContaining(el)).toBe(false)
    expect(isDeclined(formOf('input[type="email"]').form.container)).toBe(false)
  })

  it('attributes a refusal from a nested control to the form around it', () => {
    load('newsletter-plus-login.html')
    const login = formOf('#login-form input[type="password"]')
    markOffered(login.form.container)

    // Walks up from the control to the offered container rather than needing
    // the caller to have resolved the form itself.
    expect(declineFormContaining(login.el)).toBe(true)
    expect(isDeclined(login.form.container)).toBe(true)
  })

  // Our own fill dispatches input events. If those counted as the user
  // typing, every successful fill would immediately mark its own form
  // declined and the picker would never reappear to switch accounts.
  it('does not mistake our own fill for the user typing', () => {
    load('plain-login.html')
    const { form } = formOf('input[type="email"]')
    markOffered(form.container)

    const field = document.querySelector<HTMLInputElement>('input[type="email"]')!
    let sawProgrammatic: boolean | null = null

    // Mirrors the real guard: the watcher's capture listener bails out while
    // isProgrammaticFill() holds, and only then attributes a refusal.
    const onInput = (e: Event) => {
      sawProgrammatic = isProgrammaticFill()
      if (isProgrammaticFill()) return
      if (e.target instanceof Element) declineFormContaining(e.target)
    }
    document.addEventListener('input', onInput, { capture: true })
    try {
      setControlValue(field, 'user@example.com')
    } finally {
      document.removeEventListener('input', onInput, { capture: true })
    }

    expect(sawProgrammatic).toBe(true)
    expect(isDeclined(form.container)).toBe(false)
  })

  it('still counts a real keystroke once the post-fill window has passed', () => {
    // setControlValue keeps isProgrammaticFill() true for 800ms afterwards, to
    // cover sites that move focus a beat after we write. Typing inside that
    // window is not attributed to the user; typing after it is.
    load('plain-login.html')
    const { form } = formOf('input[type="email"]')
    markOffered(form.container)
    const field = document.querySelector<HTMLInputElement>('input[type="email"]')!

    setControlValue(field, 'filled@example.com')
    expect(isProgrammaticFill()).toBe(true)

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 1000)
    expect(isProgrammaticFill()).toBe(false)
    expect(declineFormContaining(field)).toBe(true)
  })

  it('does not leak a refusal across fixtures', () => {
    load('plain-login.html')
    const first = formOf('input[type="password"]')
    markDeclined(first.form.container)
    expect(isDeclined(first.form.container)).toBe(true)

    resetDeclines()
    load('plain-login.html')
    expect(isDeclined(formOf('input[type="password"]').form.container)).toBe(false)
  })
})
