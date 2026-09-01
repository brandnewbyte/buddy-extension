import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dismissNativeAutofill, isRefocusing } from '../src/content/picker/glyph'

// The glyph exists so our list and the browser's own autofill popup never
// stack. That only works if clicking it dismisses the browser's, and nothing
// dismisses it by itself: the popup is bound to the focused field and closes
// on blur, while our mousedown handler cancels the default action that would
// otherwise have moved focus. Synthetic key events do not reach it either.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let field: HTMLInputElement

beforeEach(() => {
  document.body.innerHTML = '<input id="f" type="email">'
  field = document.getElementById('f') as HTMLInputElement
  field.focus()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dismissNativeAutofill', () => {
  // Ordered deliberately: the flag is module state with a 300ms window, so the
  // clean-state assertion has to run before anything bounces.
  it('does not flag before anything has bounced', () => {
    expect(isRefocusing()).toBe(false)
  })

  it('blurs the field and puts focus straight back', () => {
    const order: string[] = []
    field.addEventListener('blur', () => order.push('blur'))
    field.addEventListener('focus', () => order.push('focus'))

    dismissNativeAutofill(field)

    expect(order).toEqual(['blur', 'focus'])
    expect(document.activeElement).toBe(field)
  })

  it('flags the bounce, so the focus watcher does not re-arm mid-click', () => {
    dismissNativeAutofill(field)
    expect(isRefocusing()).toBe(true)
  })

  it('stops flagging once the bounce window has passed', () => {
    dismissNativeAutofill(field)
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 500)
    expect(isRefocusing()).toBe(false)
  })

  it('is wired to the glyph click and honoured by the focus watcher', () => {
    // The closed shadow root puts the button out of reach of a test, so the
    // wiring is asserted at the source rather than left unchecked.
    const glyph = readFileSync(join(root, 'src/content/picker/glyph.ts'), 'utf8')
    expect(glyph).toMatch(/addEventListener\('mousedown'[\s\S]{0,400}dismissNativeAutofill\(target\)/)

    const watcher = readFileSync(join(root, 'src/content/picker/focus-watcher.ts'), 'utf8')
    expect(watcher).toMatch(/if \(isRefocusing\(\)\) return/)
  })
})
