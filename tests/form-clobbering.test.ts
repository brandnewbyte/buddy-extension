import { describe, it, expect, beforeEach } from 'vitest'
import { visibleControls } from '../src/content/fill/dom'
import { classifyPage, pickerOffer } from '../src/content/forms'
import { pageOffers } from '../src/content/fill/slice'

// A <form> exposes its own controls as named properties that override the
// prototype chain ([LegacyOverrideBuiltIns] on HTMLFormElement). A control
// named "hidden" therefore makes `form.hidden` answer with that element rather
// than the boolean attribute reflection — truthy, and a visibility check
// reading the property drops every field in the form.
//
// Stripe's payment element ships <button name="hidden" type="submit">, which
// took every card form hosted in Stripe Elements out of the classifier: no
// popup card lane, no in-page picker, no fill.
//
// happy-dom does not implement the legacy override, so the browser's behaviour
// is modelled here the way the browser produces it — an own property shadowing
// the prototype accessor.
function clobber(form: HTMLFormElement, name: string): void {
  const control = form.querySelector(`[name="${name}"]`)!
  Object.defineProperty(form, name, { value: control, configurable: true })
}

describe('a form control named "hidden"', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form>
        <input name="number" autocomplete="cc-number">
        <input name="expiry" autocomplete="cc-exp">
        <input name="cvc" autocomplete="cc-csc">
        <button name="hidden" type="submit"></button>
      </form>`
    clobber(document.querySelector('form')!, 'hidden')
  })

  it('does not hide the form\'s controls', () => {
    expect(visibleControls().map(el => el.name)).toEqual(['number', 'expiry', 'cvc'])
  })

  it('leaves the card form classifiable', () => {
    const forms = classifyPage()
    expect(forms.map(f => f.kind)).toEqual(['card'])
    expect(pageOffers(forms, 'card').sort()).toEqual(['card_cvv', 'card_exp', 'card_number'])
  })

  it('still opens the picker on the card number field', () => {
    const number = document.querySelector<HTMLInputElement>('[name="number"]')!
    expect(pickerOffer(number, classifyPage())).toBe('card')
  })

  it('still honours a genuine hidden attribute', () => {
    const form = document.querySelector('form')!
    form.setAttribute('hidden', '')
    expect(visibleControls()).toEqual([])
  })
})
