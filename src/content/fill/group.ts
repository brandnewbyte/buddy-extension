import type { FillControl } from './dom'

// Grouping primitives shared by the classifier (../forms.ts). A "group" is a
// container element plus the fillable controls that belong to it — the unit
// classification and fill both operate on.

function containerFor(control: FillControl, allControls: FillControl[]): Element {
  const form = control.closest('form')
  if (form) return form

  // Formless control: nearest ancestor shared with another control (AJAX/SPA
  // forms). A loner gets its largest *private* ancestor instead — never
  // document.body, whose group would absorb every signal on the page
  // (including other groups' submit buttons) and win with stolen evidence.
  let last: Element = control
  let el: Element | null = control.parentElement
  while (el && el !== document.body) {
    if (allControls.some(other => other !== control && el!.contains(other))) return el
    last = el
    el = el.parentElement
  }
  return last
}

export function groupByContainer(controls: FillControl[]): Map<Element, FillControl[]> {
  const groups = new Map<Element, FillControl[]>()
  for (const control of controls) {
    const container = containerFor(control, controls)
    const group = groups.get(container) ?? []
    group.push(control)
    groups.set(container, group)
  }
  return groups
}

// A username belongs to a password, not to a page. Any layout that collapses
// to one group (a page-wide <form> wrapper, formless inputs sharing only the
// page root) puts a footer newsletter box in the running against the real
// login field. Scope candidates to whatever shares the password's nearest
// control-bearing ancestor.
export function usernameScope(controls: FillControl[]): FillControl[] {
  const password = controls.find(el => el instanceof HTMLInputElement && el.type === 'password')
  if (!password) return controls

  for (let el = password.parentElement; el && el !== document.body; el = el.parentElement) {
    const withPassword = controls.filter(c => c !== password && el.contains(c))
    if (withPassword.length) return withPassword
  }
  return controls
}
