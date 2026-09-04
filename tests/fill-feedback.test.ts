import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flashFilled } from '../src/content/fill/flash'

describe('flashFilled', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function input(style = ''): HTMLInputElement {
    const el = document.createElement('input')
    if (style) el.setAttribute('style', style)
    document.body.appendChild(el)
    return el
  }

  it('rings the field, then leaves no trace of itself', () => {
    const el = input()
    flashFilled(el)
    expect(el.style.getPropertyValue('box-shadow')).toContain('inset')

    vi.advanceTimersByTime(5000)
    expect(el.style.getPropertyValue('box-shadow')).toBe('')
    expect(el.style.getPropertyValue('transition')).toBe('')
  })

  it("restores the page's own inline box-shadow, priority included", () => {
    // A site styling its inputs inline must get its styling back, not a
    // stripped attribute — the ring is borrowed, not taken.
    const el = input('box-shadow: 0 0 3px red !important')
    flashFilled(el)
    vi.advanceTimersByTime(5000)

    expect(el.style.getPropertyValue('box-shadow')).toBe('0 0 3px red')
    expect(el.style.getPropertyPriority('box-shadow')).toBe('important')
  })

  it('wins against a page that styles inputs itself', () => {
    // Without `important` a site's own !important box-shadow swallows the ring
    // and an unprompted fill becomes invisible.
    const el = input()
    flashFilled(el)
    expect(el.style.getPropertyPriority('box-shadow')).toBe('important')
  })

  it('restarts rather than being cut short by the previous flash', () => {
    // A TOTP refresh flashes a field that is already mid-flash; the first
    // timer must not strip the ring the second one just drew.
    const el = input()
    flashFilled(el)
    vi.advanceTimersByTime(1300)
    flashFilled(el)

    vi.advanceTimersByTime(300)
    expect(el.style.getPropertyValue('box-shadow')).toContain('#3d67b4')
  })
})
