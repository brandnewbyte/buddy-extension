export type FillControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const CONTROL_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])',
  'select',
  'textarea',
].join(', ')

export function visibleControls(): FillControl[] {
  return Array.from(document.querySelectorAll<FillControl>(CONTROL_SELECTOR)).filter(isFillable)
}

// Style-based visibility, deliberately not layout-based (offsetParent /
// getClientRects), so it also runs under test DOMs with no layout engine.
// Catches display:none / visibility:hidden / [hidden] decoy-sink fields;
// offscreen-positioned decoys still slip through. readonly is allowed on
// purpose — some sites use readonly-until-focus as an anti-autofill trick.
function isFillable(el: FillControl): boolean {
  if (el.disabled) return false

  const view = el.ownerDocument.defaultView
  if (view?.getComputedStyle(el).visibility === 'hidden') return false  // inherits, one check suffices

  // display does NOT inherit — a child of display:none still reports its
  // own display — so walk the ancestors
  for (let a: Element | null = el; a && a !== el.ownerDocument.body; a = a.parentElement) {
    if ((a as HTMLElement).hidden) return false
    if (a.getAttribute('aria-hidden') === 'true') return false
    if (view?.getComputedStyle(a).display === 'none') return false
  }

  return true
}

// Values we set ourselves, so save-capture can tell an autofill apart from
// the user typing a credential worth saving. Page-lifetime memory only.
const autofilled = new Set<string>()

export function wasAutofilled(value: string): boolean {
  return autofilled.has(value)
}

// setControlValue focuses/blurs the target, which fires the same focusin
// events the picker listens for. The flag is readable synchronously during
// those events; the timestamp covers sites that react to our fill by moving
// focus themselves a beat later.
let programmatic = false
let lastProgrammaticAt = 0

export function isProgrammaticFill(): boolean {
  return programmatic || Date.now() - lastProgrammaticAt < 800
}

export function setControlValue(el: FillControl, value: string): void {
  autofilled.add(value)
  programmatic = true
  try {
    el.focus()
    if (el instanceof HTMLSelectElement) {
      setSelectValue(el, value)
    } else {
      // Use native setter so React/Vue synthetic events fire correctly
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(el, value)
      } else {
        el.value = value
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.blur()
  } finally {
    programmatic = false
    lastProgrammaticAt = Date.now()
  }
}

// Selects (country, expiry month/year) rarely share our value verbatim: try
// the option value, then its label, then numeric equality ("4" vs "04").
// No match = no change — never force a selection the page can't represent.
function setSelectValue(el: HTMLSelectElement, value: string): void {
  const wanted = value.trim().toLowerCase()
  const asNumber = /^\d+$/.test(wanted) ? parseInt(wanted, 10) : null

  for (const option of el.options) {
    const v = option.value.trim().toLowerCase()
    const label = (option.label ?? option.textContent ?? '').trim().toLowerCase()
    const vNumber = /^\d+$/.test(v) ? parseInt(v, 10) : null

    const matches = v === wanted
      || label === wanted
      || (asNumber !== null && vNumber !== null && vNumber === asNumber)
      // Year selects often hold two-digit values ("26" for 2026)
      || (asNumber !== null && asNumber >= 2000 && vNumber !== null && vNumber === asNumber % 100)

    if (matches) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      if (nativeSetter) nativeSetter.call(el, option.value)
      else el.value = option.value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
  }
}
