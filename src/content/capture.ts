import { send } from './bridge'
import { classifyPage } from './forms'
import type { ClassifiedForm } from './forms'
import { wasAutofilled } from './fill/dom'

// Capture credentials at the moment they leave the page, so a save can be
// offered after the navigation. Uses the same classifier as picker and fill:
// only login and registration forms are worth capturing, and the values are
// read from the resolved role fields at submit time (never cached earlier —
// the user edits until the last second).
//
// SPA note: sites that submit via fetch with no form element get capture on
// Enter in a password field and on clicks of their group's own submit-shaped
// button. That's deliberately narrow; a missed save is recoverable from the
// popup, a wrong one is noise.

const SUBMIT_BUTTON = /\b(log.?in|sign.?in|sign.?up|submit|continue|next|register|create.?account)\b/i
const RESCAN_DEBOUNCE_MS = 500

const attached = new WeakSet<Element>()

export function attachSaveCapture(): void {
  scan()

  // Forms mount late on SPAs; keep attaching as they appear. childList only —
  // attribute churn can't create a form.
  const observer = new MutationObserver(() => {
    if (timer !== null) return
    timer = setTimeout(() => { timer = null; scan() }, RESCAN_DEBOUNCE_MS)
  })
  let timer: ReturnType<typeof setTimeout> | null = null

  const start = () => observer.observe(document.body, { childList: true, subtree: true })
  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start)
}

function scan(): void {
  const forms = classifyPage().filter(f => f.kind === 'login' || f.kind === 'registration')

  for (const form of forms) {
    if (attached.has(form.container)) continue
    attached.add(form.container)

    if (form.container instanceof HTMLFormElement) {
      // Not { once }: a failed validation keeps the user on the form and the
      // next submit must capture the corrected values.
      form.container.addEventListener('submit', () => capture(form.container))
    } else {
      // Formless group: Enter in one of its fields, or its own submit button
      form.container.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') capture(form.container)
      }, { capture: true })
      form.container.addEventListener('click', (e) => {
        const button = (e.target as Element).closest?.('button, input[type="submit"], [role="button"]')
        if (button && SUBMIT_BUTTON.test(button.textContent ?? (button as HTMLInputElement).value ?? '')) {
          capture(form.container)
        }
      }, { capture: true })
    }
  }
}

// Re-classify at capture time: the group's fields may have changed since the
// listener attached, and stale element references are how wrong values get
// captured. Values leave this function exactly once, into the background.
function capture(container: Element): void {
  const form = classifyPage().find(f => f.container === container)
  if (!form || (form.kind !== 'login' && form.kind !== 'registration')) return

  const fields = collectFields(form)
  const passwords = fields.filter(f => f.role === 'password' || f.role === 'new_password')
  if (!passwords.length || passwords.some(f => !f.value)) return

  // Don't offer to save credentials we just filled from the vault
  if (passwords.every(f => wasAutofilled(f.value))) return

  send({ type: 'SAVE_CANDIDATE', url: location.href, title: document.title, fields })
}

function collectFields(form: ClassifiedForm): { role: string; value: string }[] {
  const fields: { role: string; value: string }[] = []
  for (const [role, el] of Object.entries(form.resolved)) {
    if (role !== 'username' && role !== 'password' && role !== 'totp') continue
    const value = (el as HTMLInputElement).value
    if (value) fields.push({ role: form.kind === 'registration' && role === 'password' ? 'new_password' : role, value })
  }
  return fields
}
