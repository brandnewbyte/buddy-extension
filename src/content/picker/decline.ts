// Whether the user has turned the picker down on a form.
//
// Scoped to the form rather than the field, which is the whole point: refusing
// on a username and then having the dropdown reappear on the password beside
// it is the same refusal being ignored twice.
//
// Weak on purpose. An SPA that swaps its login form out gets a clean slate
// without us tracking navigation, and a page teardown collects everything.

let offered = new WeakSet<Element>()
let declined = new WeakSet<Element>()

/** Called when the picker actually appears for a form. */
export function markOffered(container: Element): void {
  offered.add(container)
}

export function markDeclined(container: Element): void {
  declined.add(container)
}

export function isDeclined(container: Element): boolean {
  return declined.has(container)
}

/**
 * Attributes an action on `el` to the offered form containing it, and turns
 * that form down. False when the user is acting somewhere we never offered,
 * which is a refusal of nothing.
 */
export function declineFormContaining(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (offered.has(node)) {
      declined.add(node)
      return true
    }
  }
  return false
}

/** Tests only: module state outlives a single fixture otherwise. */
export function resetDeclines(): void {
  offered = new WeakSet<Element>()
  declined = new WeakSet<Element>()
}
