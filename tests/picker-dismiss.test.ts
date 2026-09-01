import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The picker's outside-click listener lives on its own frame's document. Where
// the login form is in an iframe, the rest of the page is a different document
// and clicking it fires nothing here, so the dropdown used to sit there open
// over a page the user had already moved on from. Frame blur is what covers
// the gap, and these pin that it is wired and torn down.

const chromeStub = {
  runtime: { sendMessage: () => Promise.resolve(undefined) },
  i18n: { getMessage: (key: string) => key },
} as unknown as typeof chrome

let picker: typeof import('../src/content/picker/entry-picker')
const windowListeners = new Map<string, number>()

beforeEach(async () => {
  vi.stubGlobal('chrome', chromeStub)
  document.body.innerHTML = '<input id="anchor" type="email">'
  windowListeners.clear()

  const add = window.addEventListener.bind(window)
  const remove = window.removeEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type, ...rest) => {
    windowListeners.set(type, (windowListeners.get(type) ?? 0) + 1)
    return add(type, ...(rest as [never]))
  })
  vi.spyOn(window, 'removeEventListener').mockImplementation((type, ...rest) => {
    windowListeners.set(type, (windowListeners.get(type) ?? 0) - 1)
    return remove(type, ...(rest as [never]))
  })

  picker = await import('../src/content/picker/entry-picker')
})

afterEach(() => {
  picker.hide()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function anchor(): HTMLElement {
  return document.getElementById('anchor') as HTMLElement
}

describe('picker dismissal across frames', () => {
  it('listens for its own frame losing focus', () => {
    picker.show([], anchor(), () => {})
    expect(windowListeners.get('blur')).toBe(1)
  })

  it('removes that listener when it hides, so it cannot stack', () => {
    picker.show([], anchor(), () => {})
    picker.hide()
    expect(windowListeners.get('blur')).toBe(0)
  })

  it('does not accumulate listeners when reopened', () => {
    // mount() hides first, so showing twice must still leave exactly one.
    picker.show([], anchor(), () => {})
    picker.show([], anchor(), () => {})
    expect(windowListeners.get('blur')).toBe(1)
  })

  it('hides on blur without needing a click in this document', () => {
    picker.show([], anchor(), () => {})
    window.dispatchEvent(new Event('blur'))
    expect(windowListeners.get('blur')).toBe(0)
  })
})
