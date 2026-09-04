// A brief ring around a field we just filled without being asked to.
//
// Only unanchored fills get one. When the user picked from the dropdown they
// watched the value land and a highlight is noise; a multi-page resume happens
// with no gesture at that moment, and an unprompted write into a page is
// exactly the thing the user should be able to notice. It is also the only
// signal that a refreshed TOTP actually arrived.
//
// Drawn as an inset box-shadow rather than a background: a tint has to win
// against the field's own colour to be visible and loses text contrast doing
// it, while a ring reads the same on any ground. Nothing about the element's
// layout is touched, so a tight design cannot be broken by it.

const RING = '0 0 0 2px #3d67b4 inset'
const HOLD_MS = 1400
const FADE_MS = 400

// Properties we set, so each one's prior inline value and priority can go back
// exactly as it was. The page's own stylesheet is untouched either way.
const PROPS = ['box-shadow', 'transition'] as const

const pending = new WeakMap<Element, ReturnType<typeof setTimeout>>()

export function flashFilled(el: Element): void {
  if (!(el instanceof HTMLElement)) return

  const previous = PROPS.map(prop => ({
    prop,
    value: el.style.getPropertyValue(prop),
    priority: el.style.getPropertyPriority(prop),
  }))

  const restore = () => {
    pending.delete(el)
    for (const { prop, value, priority } of previous) {
      if (value) el.style.setProperty(prop, value, priority)
      else el.style.removeProperty(prop)
    }
  }

  // A second fill on the same field (a TOTP refresh) restarts the ring rather
  // than letting the first timer strip it mid-flash.
  const running = pending.get(el)
  if (running !== undefined) clearTimeout(running)

  // `important` so a page that sets its own box-shadow on inputs cannot
  // silently swallow the ring; the restore drops it again either way.
  el.style.setProperty('transition', `box-shadow ${FADE_MS}ms ease-out`, 'important')
  el.style.setProperty('box-shadow', RING, 'important')

  pending.set(el, setTimeout(() => {
    el.style.setProperty('box-shadow', '0 0 0 2px transparent inset', 'important')
    pending.set(el, setTimeout(restore, FADE_MS))
  }, HOLD_MS))
}
