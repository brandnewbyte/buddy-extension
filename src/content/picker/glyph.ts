// The in-field Buddy glyph: the one deliberate gesture that opens the picker.
//
// Focus alone no longer opens anything. The browser's own password list and
// passkey sheet are native widgets painted above the page, so a focus-opened
// dropdown stacks under them by construction and no z-index can win. Opening
// on a click means the browser's list has already been dismissed by that same
// click, and normal browsing stays quiet.
//
// Lives in its own closed shadow root, positioned by measurement, and draws
// nothing at all when there is no clearly safe spot.

import { pageIndependentCss, resetHostStyle } from '../shadow'
import { placeGlyphInPage, type GlyphPlacement } from './glyph-placement'
import glyphStyles from '../../assets/main.css?inline'
import { t } from '../../shared/i18n'
import { BUDDY_MARK } from '../../shared/mark'

// The browser's own autofill popup is bound to the focused field and closes
// when that field is blurred. Bouncing focus is what closes it; a programmatic
// refocus does not bring it back, because Chrome opens it on a user gesture on
// the field rather than on focus alone.
//
// Exported so the focus watcher can tell our own bounce apart from the user
// moving between fields, which would otherwise re-run the whole arming path.
// Applied only where the field can carry them; see position().
const DISC_CLASSES = [
  'bg-primary-500/12', 'hover:bg-primary-500/25',
  'dark:bg-primary-300/15', 'dark:hover:bg-primary-300/30',
]

let bouncingUntil = 0

export function isRefocusing(): boolean {
  return Date.now() < bouncingUntil
}

/**
 * Closes the browser's own autofill popup by taking focus off the field and
 * putting it straight back. Nothing else does it: the popup ignores synthetic
 * key events, and our mousedown handler cancels the default action that would
 * otherwise have moved focus.
 */
export function dismissNativeAutofill(target: HTMLElement): void {
  bouncingUntil = Date.now() + 300
  try {
    target.blur()
    target.focus({ preventScroll: true })
  } finally {
    bouncingUntil = Date.now() + 300
  }
}

let host: HTMLDivElement | null = null
let root: ShadowRoot | null = null
let field: HTMLElement | null = null
let detach: (() => void) | null = null

function ensureRoot(): ShadowRoot {
  if (root) return root

  host = document.createElement('div')
  resetHostStyle(host, { position: 'fixed', 'z-index': '2147483646' })
  document.body.appendChild(host)

  root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = pageIndependentCss(glyphStyles)
  root.appendChild(style)
  return root
}

/**
 * Measures with our own glyph hidden, so a re-measure never mistakes the
 * previous position for site furniture and walks itself leftwards.
 */
function measure(target: HTMLElement) {
  const previous = host?.style.visibility ?? ''
  if (host) host.style.visibility = 'hidden'
  try {
    return placeGlyphInPage(target)
  } finally {
    if (host) host.style.visibility = previous
  }
}

export function hideGlyph(): void {
  detach?.()
  detach = null
  field = null
  root?.getElementById('glyph')?.remove()
  if (host) host.style.visibility = 'hidden'
}

/** Shows the glyph on `target`, or does nothing if there is nowhere safe. */
export function showGlyph(target: HTMLElement, onOpen: () => void): void {
  const placed = measure(target)
  if (!placed) { hideGlyph(); return }

  const shadow = ensureRoot()
  hideGlyph()
  field = target

  const button = document.createElement('button')
  button.id = 'glyph'
  button.type = 'button'
  button.title = t('openPicker')
  button.setAttribute('aria-label', t('openPicker'))
  // A tinted disc behind the mark. It does two jobs: it gives the mark a
  // predictable ground to sit on, since the field's own background could be
  // any colour, and it makes the thing read as a target rather than as
  // decoration the site happened to draw.
  //
  // Every dimension is set in px. Percentages are a trap here: on a
  // position: fixed element they resolve against the viewport, not the
  // element, so a padding of 14% became ~180px a side.
  //
  // No animation: this sits in every login field the user ever focuses, and
  // something that pulses forever is nagging rather than helpful. The
  // onboarding demo animates because it teaches once.
  button.className = 'fixed border-0 cursor-pointer grid place-items-center '
    + 'transition-colors text-primary-600 dark:text-primary-300 '
    + 'hover:text-primary-700 dark:hover:text-primary-200'
  button.innerHTML = BUDDY_MARK

  // mousedown, not click: the picker has to anchor to the field, and waiting
  // for click would let the browser move focus first.
  //
  // preventDefault stops focus landing on this button, which is what we want,
  // but it also means nothing has dismissed the browser's own autofill popup:
  // that popup is tied to the focused field and only a blur closes it. So
  // bounce focus off the field and straight back. Without this the two lists
  // stack, which is the entire thing the glyph exists to avoid.
  button.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()

    dismissNativeAutofill(target)
    onOpen()
  })

  shadow.appendChild(button)
  position(button, placed)

  const reposition = () => {
    if (!field) return
    const next = measure(field)
    if (next) position(button, next)
    else hideGlyph()
  }

  window.addEventListener('scroll', reposition, { capture: true, passive: true })
  window.addEventListener('resize', reposition, { passive: true })
  const observer = new ResizeObserver(reposition)
  observer.observe(target)

  detach = () => {
    window.removeEventListener('scroll', reposition, { capture: true })
    window.removeEventListener('resize', reposition)
    observer.disconnect()
  }
}

/**
 * The mark's share of the disc. Weighted towards the mark: the disc is there
 * to give it a ground and a target, not to be the thing you notice, so it
 * reads better as a tight ring than as a badge with an icon in it.
 *
 * Nudged to keep the difference even, so the ring is a whole number of pixels
 * on both sides and the mark lands on the pixel grid.
 */
export function markSize(footprint: number, disc = true): number {
  if (!disc) return footprint
  const raw = Math.round(footprint * 0.78)
  return raw % 2 === footprint % 2 ? raw : raw - 1
}

/**
 * Every value is an absolute px string. Exported so the units can be asserted:
 * a percentage anywhere in here resolves against the viewport rather than the
 * element, which is not a mistake that shows up until it is on screen.
 */
export function glyphStyle(placed: GlyphPlacement): Record<string, string> {
  const mark = markSize(placed.size, placed.disc)
  return {
    top: `${placed.top}px`,
    left: `${placed.left}px`,
    width: `${placed.size}px`,
    height: `${placed.size}px`,
    padding: `${(placed.size - mark) / 2}px`,
  }
}

function position(button: HTMLElement, placed: GlyphPlacement): void {
  if (host) host.style.visibility = 'visible'
  for (const [property, value] of Object.entries(glyphStyle(placed))) {
    button.style.setProperty(property, value)
  }

  // The mark is sized explicitly too: its own 100% would resolve against a
  // content box that padding has already shrunk.
  // The disc only appears on fields tall enough to carry it; short fields get
  // the bare mark, which stays legible precisely because it has no ring.
  button.classList.toggle('rounded-full', placed.disc)
  for (const tint of DISC_CLASSES) button.classList.toggle(tint, placed.disc)

  const mark = button.querySelector('svg')
  if (mark) {
    const size = String(markSize(placed.size, placed.disc))
    mark.setAttribute('width', size)
    mark.setAttribute('height', size)
  }
}
