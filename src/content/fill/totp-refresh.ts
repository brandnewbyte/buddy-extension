// The escape hatch for a stale code.
//
// A TOTP code is minted at fetch time and a resumed fill places it at page
// load, but the window is 30 seconds and the user may not submit for a minute.
// The field then looks correctly filled and the login fails anyway, which is a
// worse failure than not filling at all.
//
// Focusing the field is the gesture that asks for a fresh one. That rather
// than a button because placeGlyph refuses to draw on anything as small as a
// code box, so an in-field affordance is unavailable on exactly the fields
// that need it — and reaching for the field is what a user about to type a
// code does anyway.
//
// Nothing is held between the fill and the refresh: no token, no session, no
// value. The entry's identifiers are not secrets (the picker already lists
// them), the user's focus authorises the request, and the desktop re-checks
// the entry against the page before releasing anything.

import { send } from '../bridge'
import { isProgrammaticFill, wasAutofilled } from './dom'
import type { Entry } from '../../shared/types'

// A code only changes every 30s, so anything faster is wasted vault traffic —
// this is a floor on repeat asks, not a throttle on the user.
const COOLDOWN_MS = 5000

let armed: (() => void) | null = null
let lastAskedAt = 0

/** Replaces any previous arming: one TOTP field is live at a time. */
export function armTotpRefresh(el: Element, entry: Entry): void {
  disarmTotpRefresh()
  if (!(el instanceof HTMLInputElement)) return

  const onFocus = () => {
    // Our own fill focuses the field as it writes; that is not the user
    // reaching for it.
    if (isProgrammaticFill()) return
    if (navigator.userActivation && !navigator.userActivation.isActive) return

    // The user has typed over our code, or the page cleared it. Either way the
    // field is theirs now and overwriting it would be the rudest possible
    // moment to do so.
    if (!wasAutofilled(el.value)) { disarmTotpRefresh(); return }

    if (Date.now() - lastAskedAt < COOLDOWN_MS) return
    lastAskedAt = Date.now()

    void send({
      type: 'REFRESH_TOTP',
      id: entry.id,
      vaultId: entry.vaultId,
      sectionId: entry.sectionId,
    })
  }

  el.addEventListener('focus', onFocus)
  armed = () => el.removeEventListener('focus', onFocus)
}

export function disarmTotpRefresh(): void {
  armed?.()
  armed = null
}
