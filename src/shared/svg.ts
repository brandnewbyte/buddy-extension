// Inline SVG without innerHTML.
//
// Every SVG in this extension is a developer-authored constant, but AMO's
// linter flags innerHTML assignment unconditionally — it cannot tell a
// constant from page input, and a reviewer reading "unsafe assignment" on a
// password manager stops to ask why. DOMParser reaches the same DOM without
// the pattern, and keeps the markup readable as markup rather than as a pile
// of createElementNS calls.
//
// image/svg+xml parses as XML: no scripts run, and a malformed document
// yields a parsererror root rather than executing anything.
const SVG_NS = 'http://www.w3.org/2000/svg'

export function svgNode(markup: string): SVGSVGElement {
  const trimmed = markup.trim()

  // A namespace comes only from the document itself. innerHTML hid this: the
  // HTML parser puts <svg> in the SVG namespace implicitly, an XML parser
  // never does, so markup with no xmlns parses into an element named "svg" in
  // no namespace at all — well-formed, guard-passing, and invisible.
  const openTag = trimmed.slice(0, trimmed.indexOf('>') + 1)
  const source = / xmlns\s*=/.test(openTag)
    ? trimmed
    : trimmed.replace('<svg', `<svg xmlns="${SVG_NS}"`)

  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = doc.documentElement

  // Guards a malformed constant during development, nothing more — every
  // caller passes a literal. A parse failure yields a <parsererror> root, so
  // this catches that too. The namespace is asserted rather than assumed: a
  // wrong one is the failure that renders nothing while looking correct in
  // every DOM inspector.
  if (root.localName !== 'svg') {
    throw new Error(`svgNode expects a single <svg> root, got <${root.localName}>`)
  }
  if (root.namespaceURI !== SVG_NS) {
    throw new Error(`svgNode expects the SVG namespace, got ${root.namespaceURI}`)
  }

  return document.importNode(root, true) as unknown as SVGSVGElement
}
