import { describe, it, expect, beforeEach } from 'vitest'
import { placeGlyph, type PlacementEnv, type Rect } from '../src/content/picker/glyph-placement'
import { glyphStyle, markSize } from '../src/content/picker/glyph'

// The right edge of an input is crowded: reveal eyes, clear crosses, validation
// ticks, other managers' glyphs. These cover the cases where we must step past
// furniture, and the ones where the honest answer is to draw nothing at all.

function rectOf(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

// A roomy text input: 300x32 at (100, 200).
const FIELD_RECT = rectOf(100, 200, 300, 32)

let field: HTMLInputElement
let furniture: HTMLElement

function env(over: Partial<PlacementEnv> = {}): PlacementEnv {
  return {
    rect: FIELD_RECT,
    elementAt: () => field,
    viewport: { width: 1280, height: 800 },
    ...over,
  }
}

/** Hit-tester where `blocked` is occupied by furniture and the rest is field. */
function withFurnitureFrom(blockedFromX: number, furnitureRect: Rect) {
  furniture.getBoundingClientRect = () => furnitureRect as DOMRect
  return (x: number) => (x >= blockedFromX ? furniture : field)
}

beforeEach(() => {
  document.body.innerHTML = '<input id="f"><span id="eye"></span>'
  field = document.getElementById('f') as HTMLInputElement
  furniture = document.getElementById('eye') as HTMLElement
})

describe('placeGlyph', () => {
  it('sits just inside the right edge when nothing is in the way', () => {
    const placed = placeGlyph(field, env())
    expect(placed).not.toBeNull()
    // 22px target on a 32px field, 6px gap from the edge. The size is the
    // whole disc, not the mark inside it, so nothing can overlap the disc.
    expect(placed!.size).toBe(22)
    expect(placed!.disc).toBe(true)
    expect(placed!.left + placed!.size).toBe(FIELD_RECT.right - 6)
    expect(placed!.top).toBe(FIELD_RECT.top + (FIELD_RECT.height - placed!.size) / 2)
  })

  it('steps left past a reveal eye rather than sitting on it', () => {
    // Eye occupies the rightmost 30px of the field.
    const eye = rectOf(FIELD_RECT.right - 30, 204, 24, 24)
    const placed = placeGlyph(field, env({ elementAt: withFurnitureFrom(eye.left, eye) }))

    expect(placed).not.toBeNull()
    expect(placed!.left + placed!.size).toBeLessThanOrEqual(eye.left)
  })

  it('scales the target with the field rather than using a constant', () => {
    const small = placeGlyph(field, env({ rect: rectOf(100, 200, 300, 26) }))
    const tall = placeGlyph(field, env({ rect: rectOf(100, 200, 300, 56) }))
    expect(small!.size).toBe(20)   // clamped at the disc floor
    expect(tall!.size).toBe(28)    // clamped at the ceiling
  })

  it('reserves the whole disc, so it cannot overlap what it stepped past', () => {
    // The disc is the footprint. Its right edge must clear the furniture,
    // not just the mark drawn inside it.
    const eye = rectOf(FIELD_RECT.right - 30, 204, 24, 24)
    const placed = placeGlyph(field, env({ elementAt: withFurnitureFrom(eye.left, eye) }))
    expect(placed!.left + placed!.size).toBeLessThanOrEqual(eye.left)
    expect(placed!.size).toBe(22)
    expect(placed!.disc).toBe(true)
  })

  it('draws nothing on a field too small to host it', () => {
    // A CVV box inside a payment iframe.
    expect(placeGlyph(field, env({ rect: rectOf(0, 0, 60, 28) }))).toBeNull()
    expect(placeGlyph(field, env({ rect: rectOf(0, 0, 300, 18) }))).toBeNull()
  })

  it('keeps a default unstyled input, which is only about 21px tall', () => {
    // TreasuryDirect's account-number step is a bare <input size="20"> on a
    // page with no CSS reset. Excluding those loses plain old sign-in forms.
    const placed = placeGlyph(field, env({ rect: rectOf(100, 200, 170, 21) }))
    expect(placed).not.toBeNull()
    expect(placed!.disc).toBe(false)
    expect(placed!.size).toBe(14)
  })

  it('drops the disc rather than the glyph on a short field', () => {
    // The ring is what does not fit, not the mark. Shrinking the mark to keep
    // a ring would make it illegible; dropping the ring keeps it readable.
    const short = placeGlyph(field, env({ rect: rectOf(100, 200, 300, 22) }))
    const tall = placeGlyph(field, env({ rect: rectOf(100, 200, 300, 32) }))
    expect(short!.disc).toBe(false)
    expect(tall!.disc).toBe(true)
    expect(markSize(short!.size, false)).toBeGreaterThanOrEqual(14)
  })

  it('draws nothing when furniture leaves no room for the typed text', () => {
    // Furniture eating all but a sliver: a glyph here would sit over the value.
    const wide = rectOf(FIELD_RECT.left + 40, 204, 260, 24)
    expect(placeGlyph(field, env({ elementAt: withFurnitureFrom(wide.left, wide) }))).toBeNull()
  })

  it('draws nothing when the field is clipped or off screen', () => {
    // elementFromPoint returns null outside the viewport and where an
    // overflow:hidden ancestor has clipped the field away.
    expect(placeGlyph(field, env({ elementAt: () => null }))).toBeNull()
  })

  it('keeps clear of the frame edge on a full-bleed field', () => {
    // A narrow iframe whose field spans the whole width. The glyph must never
    // end up closer to the frame edge than it is to the field's own edge, or
    // it reads as part of the border.
    // Inset vertically so this isolates horizontal clearance; the vertical
    // edge rule is exercised by its own case below.
    const viewport = { width: 201, height: 80 }
    const placed = placeGlyph(field, env({ rect: rectOf(0, 25, 200, 30), viewport }))
    expect(placed).not.toBeNull()
    expect(viewport.width - (placed!.left + placed!.size)).toBeGreaterThanOrEqual(6)
  })

  it('draws nothing when the disc would ride the top or bottom frame edge', () => {
    // A field flush against the top of a short frame: the disc would sit
    // within a few pixels of the border and read as part of it.
    const viewport = { width: 400, height: 60 }
    expect(placeGlyph(field, env({ rect: rectOf(0, 0, 300, 30), viewport }))).toBeNull()
    expect(placeGlyph(field, env({ rect: rectOf(0, 25, 300, 30), viewport }))).not.toBeNull()
  })

  it('draws nothing when the field bleeds past the frame it lives in', () => {
    // The probe point falls outside the frame's viewport, so nothing is
    // painted there and elementFromPoint says so.
    const wider = rectOf(0, 0, 400, 30)
    const placed = placeGlyph(field, env({
      rect: wider,
      viewport: { width: 200, height: 60 },
      elementAt: (x) => (x > 200 ? null : field),
    }))
    expect(placed).toBeNull()
  })

  it('gives up instead of looping when stepping makes no progress', () => {
    // Pathological furniture whose rect never moves us leftward.
    const stuck = rectOf(FIELD_RECT.right, 204, 24, 24)
    furniture.getBoundingClientRect = () => stuck as DOMRect
    expect(placeGlyph(field, env({ elementAt: () => furniture }))).toBeNull()
  })

  it('accepts a hit on a descendant of the field', () => {
    const inner = document.createElement('span')
    field.appendChild(inner)
    const placed = placeGlyph(field, env({ elementAt: () => inner }))
    expect(placed).not.toBeNull()
  })
})


describe('glyphStyle', () => {
  // A percentage on a position: fixed element resolves against the viewport,
  // not the element. `padding: 14%` therefore rendered a ~180px-a-side disc
  // instead of a 3px ring. Nothing but the units catches that before it is
  // on screen.
  it('expresses every dimension in absolute pixels', () => {
    const style = glyphStyle({ top: 200, left: 370, size: 22, disc: true })
    for (const [property, value] of Object.entries(style)) {
      expect(value, property).toMatch(/^-?\d+(\.\d+)?px$/)
    }
  })

  it('leaves an even ring of disc around the mark', () => {
    const size = 22
    const style = glyphStyle({ top: 0, left: 0, size, disc: true })
    const pad = Number.parseFloat(style.padding)
    // border-box: the mark plus both rings is exactly the reserved footprint.
    expect(markSize(size) + pad * 2).toBe(size)
  })

  it('gives a bare mark no ring, so it fills its whole footprint', () => {
    const style = glyphStyle({ top: 0, left: 0, size: 14, disc: false })
    expect(style.padding).toBe('0px')
    expect(markSize(14, false)).toBe(14)
  })

  it('keeps the mark proportional across the whole size ladder', () => {
    for (const size of [20, 22, 27, 28]) {
      const mark = markSize(size)
      expect(mark).toBeGreaterThanOrEqual(16)
      expect(mark).toBeLessThan(size)
      expect((size - mark) % 2).toBe(0)  // rings stay whole pixels on both sides
      expect(size - mark).toBeLessThanOrEqual(6)  // a tight ring, not a badge
    }
  })

  it('places the disc exactly where placement measured it', () => {
    const style = glyphStyle({ top: 204.5, left: 370, size: 22, disc: true })
    expect(style.top).toBe('204.5px')
    expect(style.left).toBe('370px')
    expect(style.width).toBe('22px')
    expect(style.height).toBe('22px')
  })
})
