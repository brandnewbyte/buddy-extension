import { show, showLocked, showOffline, hide } from './entry-picker'
import { showGlyph, hideGlyph, isRefocusing } from './glyph'
import { send } from '../bridge'
import { classifyPage, formFor, pickerOffer } from '../forms'
import { sliceFor } from '../fill/slice'
import { isProgrammaticFill } from '../fill/dom'
import { declineFormContaining, isDeclined, markDeclined, markOffered } from './decline'
import { isOffline } from '../../shared/ipc'
import type { IpcResult } from '../../shared/ipc'
import type { EntryMeta, Capability } from '../../shared/types'

const PICKER_INPUT_TYPES = new Set(['text', 'email', 'password', 'tel', 'number'])

// A frame smaller than the dropdown can't render it; those fills go through
// the toolbar popup instead (split-field payment iframes are input-sized).
const MIN_FRAME_W = 240
const MIN_FRAME_H = 120

function isPickerControl(el: Element | null): el is HTMLElement {
  if (!el) return false
  if (el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && PICKER_INPUT_TYPES.has((el as HTMLInputElement).type)
}

// The field a pick was made from, waiting for its FILL_READY. Consumed by the
// content entry point so the fill stays pinned to the form the user invoked
// Buddy on — this handoff is what makes fills anchored.
let pendingAnchor: Element | null = null

// What a click on the glyph, or the keyboard shortcut, would open. Held rather
// than recomputed so the shortcut cannot open a list for a field the user has
// since left.
let armed: { el: Element; open: () => void } | null = null

/** The keyboard route in, now that focus alone no longer opens anything. */
export function openArmedPicker(): void {
  if (armed && armed.el === document.activeElement) armed.open()
}

export function takeAnchor(): Element | null {
  const anchor = pendingAnchor
  pendingAnchor = null
  return anchor
}

// Entries are fetched on first focus, not page load: no vault traffic until
// the user shows intent, and a locked vault surfaces right where they're
// looking. Dismissing only hides until the next focus — the popup badge
// still shows the match count either way. The picker stays armed for the
// page's whole life (a second account is one refocus away); our own fill's
// focus/blur storm is filtered out via isProgrammaticFill.
export function attachPickerOnFocus(): void {
  function onFocusIn(e: Event) {
    if (isProgrammaticFill()) return
    // Our own focus bounce, dismissing the browser's autofill popup. Re-running
    // the arming path here would tear the glyph down and rebuild it under the
    // user's cursor mid-click.
    if (isRefocusing()) return
    tryShow(e.target as Element)
  }

  async function tryShow(el: Element | null): Promise<void> {
    if (!isPickerControl(el)) { dismiss(); return }

    // Only real user engagement opens the picker: a page (or an embedded
    // iframe) calling .focus() from script doesn't get to enumerate what the
    // vault could offer here.
    if (navigator.userActivation && !navigator.userActivation.isActive) { dismiss(); return }

    if (window.self !== window.top && (innerWidth < MIN_FRAME_W || innerHeight < MIN_FRAME_H)) {
      dismiss(); return
    }

    // Classification is the gate: the field must have resolved to a role in
    // a form we'd actually fill — the same test fill itself applies — so the
    // dropdown can never appear somewhere a pick would do nothing.
    const forms = classifyPage()
    const offer = pickerOffer(el, forms)
    if (!offer) { dismiss(); return }

    // What the anchored form can take. It rides on the pick so the desktop
    // releases that slice and nothing else; derived from the same classifier
    // the fill will target, so the two cannot disagree.
    const form = formFor(el, forms)
    if (!form) { dismiss(); return }

    const slice = sliceFor(form, offer)
    if (!slice.length) { dismiss(); return }

    // Already turned down on this form during this page's life. The toolbar
    // still fills, and the badge still shows the match count.
    if (isDeclined(form.container)) { dismiss(); return }

    const res = offer === 'login'
      // Background caches per url, so repeat focuses are cheap. A locked
      // result is deliberately not cached — unlock is picked up on next focus.
      ? await send<IpcResult<EntryMeta[]>>({
          type: 'GET_ENTRIES_FOR_URL',
          url: `${location.protocol}//${location.host}${location.pathname}`,
        })
      : await send<IpcResult<EntryMeta[]>>({
          type: 'GET_CAPABILITY_SECTIONS',
          capability: offer,
        })

    if (el !== document.activeElement) return

    if (res && !res.ok && res.code === 'VAULT_LOCKED') {
      hideGlyph()
      showLocked(el as HTMLElement, () => { send({ type: 'LAUNCH_DESKTOP' }) })
      return
    }

    const entries = res?.ok ? res.data : []
    if (!entries.length) { dismiss(); return }

    // Focus arms the glyph and nothing more. Opening the list is a deliberate
    // click, which is also the gesture that dismisses the browser's own
    // password dropdown, so the two never stack.
    const open = () => openPicker(el as HTMLElement, form, offer, slice, entries)
    armed = { el, open }
    showGlyph(el as HTMLElement, open)
  }

  function openPicker(
    el: HTMLElement,
    form: NonNullable<ReturnType<typeof formFor>>,
    offer: 'login' | 'card' | 'address',
    slice: ReturnType<typeof sliceFor>,
    entries: EntryMeta[],
  ): void {
    markOffered(form.container)

    show(entries, el, (item) => {
      pendingAnchor = el
      void pick(el, item)
    }, () => markDeclined(form.container))

    // The list can outlive the desktop that produced it: it's drawn on focus
    // and clicked whenever the user gets round to it. A pick that lands after
    // the app has gone away used to fail in silence, leaving a dropdown that
    // simply does nothing. Say so where the click happened.
    async function pick(anchor: HTMLElement, item: EntryMeta): Promise<void> {
      const res = offer === 'login'
        ? await send<IpcResult<void>>({
            type: 'START_FILL',
            id: item.id, vaultId: item.vaultId, sectionId: item.sectionId, slice,
          })
        : await send<IpcResult<void>>({
            type: 'START_CAPABILITY_FILL',
            id: item.id, vaultId: item.vaultId, sectionId: item.sectionId,
            capability: offer as Capability,
            slice,
          })

      // No reply at all means the background itself is gone, which the user
      // can do exactly as much about as a stopped desktop.
      if (res?.ok) return
      if (res && !res.ok && !isOffline(res.code) && res.code !== 'VAULT_LOCKED') return

      hideGlyph()
      const notice = res && !res.ok && res.code === 'VAULT_LOCKED' ? showLocked : showOffline
      notice(anchor, () => { send({ type: 'LAUNCH_DESKTOP' }) })
    }
  }

  // One place to take everything down, so a path that gives up on the picker
  // never leaves an orphaned glyph pointing at a field we would not fill.
  function dismiss(): void {
    armed = null
    hide()
    hideGlyph()
  }

  // Typing is a refusal too, and the one users actually perform: they ignore
  // the dropdown and key the username in by hand. Without this the picker
  // reappears on the password field beside it, which reads as nagging.
  //
  // isProgrammaticFill covers the input events our own fill dispatches, so a
  // successful fill never gets mistaken for the user declining it. Picking an
  // entry deliberately does not mark the form declined: a second account is
  // still one refocus away.
  function onInput(e: Event) {
    if (isProgrammaticFill()) return
    const target = e.target
    if (target instanceof Element && declineFormContaining(target)) dismiss()
  }

  // A field the page autofocused is refused by the user-activation gate in
  // tryShow: on a fresh load there has been no interaction yet, and that gate
  // is what stops a page learning whether we hold an entry for it simply by
  // focusing an input. The user's first real interaction settles that
  // question, so the field they were already sitting on gets another look
  // rather than making them blur and come back to it.
  //
  // pointerdown lands before focusin, so a click straight onto that field
  // arms it here and the focusin that may never fire isn't needed.
  function onFirstActivation() {
    document.removeEventListener('pointerdown', onFirstActivation, true)
    document.removeEventListener('keydown', onFirstActivation, true)
    void tryShow(document.activeElement)
  }

  document.addEventListener('focusin', onFocusIn, { capture: true })
  document.addEventListener('input', onInput, { capture: true })
  document.addEventListener('pointerdown', onFirstActivation, { capture: true })
  document.addEventListener('keydown', onFirstActivation, { capture: true })
  tryShow(document.activeElement)
}
