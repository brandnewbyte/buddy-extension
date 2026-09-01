// Where the in-field Buddy glyph can safely go, or whether it can go anywhere.
//
// The right edge of an input is crowded territory: reveal eyes, clear crosses,
// validation ticks, dropdown carets, unit suffixes, and other managers' own
// glyphs all live there. Guessing an inset collides with all of them, so this
// measures instead, stepping left past whatever it finds.
//
// It deliberately never mutates the page. Making room by shifting the field's
// padding-right is the other way to solve this, and it is a long tail of
// broken layouts on tight designs.
//
// The core is pure: it takes a rect, a hit-tester and a viewport, so the
// awkward cases can be tested without a layout engine.

export interface Rect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface PlacementEnv {
  rect: Rect
  /** Topmost element painted at a viewport point, as elementFromPoint gives it. */
  elementAt(x: number, y: number): Element | null
  viewport: { width: number; height: number }
}

export interface GlyphPlacement {
  /** Viewport coordinates, for a position: fixed host. */
  top: number
  left: number
  /** Diameter of the whole target, disc included where there is one. */
  size: number
  /** Whether the field is tall enough to carry the tinted disc. */
  disc: boolean
}

/** Below these a field is furniture itself: a CVV box, a segmented code input. */
const MIN_FIELD_WIDTH = 120
// A default unstyled input is about 21px tall, and plenty of real sign-in
// pages still use one. The floor only has to exclude things that are furniture
// themselves, like a CVV or one-time-code box.
const MIN_FIELD_HEIGHT = 20

/**
 * Below this the disc is what does not fit, not the mark. A ring on a 21px
 * field either crowds the text or shrinks the mark to nothing, so short fields
 * get the bare mark instead and keep it legible.
 */
const DISC_MIN_FIELD_HEIGHT = 26

/** Breathing room from the field's edge, and from anything we step past. */
const GAP = 6

/**
 * A glyph flush against a frame edge reads as part of the frame's border, so
 * it never comes closer to the viewport than it does to the field's own edge.
 */
const VIEWPORT_MARGIN = GAP

/** Text the user typed has to stay readable; a glyph over it is worse than none. */
const MIN_TEXT_ROOM = 48

/** A reveal eye plus a validation tick is about the worst real stacking. */
const MAX_STEPS = 3

/**
 * The reserved footprint, not the mark: where there is a disc, placement has to
 * keep the whole disc clear or it would overlap the very furniture it stepped
 * past. Without a disc the footprint is the mark itself.
 */
const FOOTPRINT_MIN = 20
const FOOTPRINT_MAX = 28
const BARE_MIN = 14
const BARE_MAX = 18

function footprintSize(fieldHeight: number, disc: boolean): number {
  return disc
    ? Math.round(Math.min(FOOTPRINT_MAX, Math.max(FOOTPRINT_MIN, fieldHeight * 0.68)))
    : Math.round(Math.min(BARE_MAX, Math.max(BARE_MIN, fieldHeight * 0.66)))
}

/**
 * Returns null whenever there is no clearly safe spot. Drawing nothing is the
 * correct outcome for a cramped field, a clipped one, or one whose right edge
 * is already full: the toolbar and the keyboard shortcut still reach it.
 */
export function placeGlyph(field: Element, env: PlacementEnv): GlyphPlacement | null {
  const { rect, viewport } = env
  if (rect.width < MIN_FIELD_WIDTH || rect.height < MIN_FIELD_HEIGHT) return null

  const disc = rect.height >= DISC_MIN_FIELD_HEIGHT
  const size = footprintSize(rect.height, disc)
  const centerY = rect.top + rect.height / 2
  let right = rect.right - GAP

  for (let step = 0; step <= MAX_STEPS; step += 1) {
    const left = right - size
    if (left < rect.left + MIN_TEXT_ROOM) return null

    const hit = env.elementAt(left + size / 2, centerY)

    // Nothing painted there means the point is outside the viewport, or the
    // field is clipped by an ancestor. Either way it is not ours to draw on.
    if (!hit) return null

    if (hit === field || field.contains(hit)) {
      const top = centerY - size / 2
      const offScreen = left < VIEWPORT_MARGIN
        || top < VIEWPORT_MARGIN
        || left + size > viewport.width - VIEWPORT_MARGIN
        || top + size > viewport.height - VIEWPORT_MARGIN
      return offScreen ? null : { top, left, size, disc }
    }

    // Site furniture. Step left past it and look again.
    const obstacle = hit.getBoundingClientRect()
    const next = obstacle.left - GAP
    if (next >= right) return null  // no progress; stop rather than loop
    right = next
  }

  return null
}

/** Builds the environment from the live document. */
export function placeGlyphInPage(field: Element): GlyphPlacement | null {
  const doc = field.ownerDocument
  const view = doc.defaultView
  if (!view) return null

  return placeGlyph(field, {
    rect: field.getBoundingClientRect(),
    elementAt: (x, y) => doc.elementFromPoint(x, y),
    viewport: { width: view.innerWidth, height: view.innerHeight },
  })
}
