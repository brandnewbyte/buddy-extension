// Making injected UI immune to the page it lands in.
//
// A closed shadow root isolates less than it looks like it does, and two leaks
// in particular decide how big our picker renders:
//
//   1. `rem` does NOT respect the shadow boundary. It always resolves against
//      the document root, so a page with `html { font-size: 62.5% }` — the old
//      Sass trick for round rem maths, still common — renders our entire UI at
//      62.5%. Tailwind sizes *and spaces* in rem, so text, padding and gaps all
//      shrink together, which is why it reads as "small" rather than "small
//      text".
//
//   2. Inherited properties cross the boundary through the host. `all: unset`
//      resolves to `inherit` for anything inherited, so font-family,
//      line-height, colour and letter-spacing all come from the page.
//
// Neither is fixable from inside the shadow root, so both are handled here.

/** 1rem at the browser default. Tailwind's scale is authored against this. */
const ROOT_FONT_PX = 16

/**
 * Rewrites rem to px so the stylesheet stops tracking the host page's root
 * font size. Media-query rem already resolves against the initial font size
 * rather than the root element's, so those convert to exactly what they meant.
 * `em` is left alone: it resolves within the shadow tree, which is where we
 * want it once the host below stops inheriting.
 */
export function pageIndependentCss(css: string): string {
  return css.replace(/(-?[\d.]+)rem\b/g, (_match, value: string) =>
    `${Number.parseFloat(value) * ROOT_FONT_PX}px`)
}

/**
 * `initial` rather than `unset`: `unset` still inherits everything inheritable,
 * which is the whole problem. Extra declarations are applied after, so a host
 * that needs to be positioned still can be.
 */
export function resetHostStyle(host: HTMLElement, extra: Record<string, string>): void {
  host.style.setProperty('all', 'initial')
  for (const [property, value] of Object.entries(extra)) {
    host.style.setProperty(property, value)
  }
}
