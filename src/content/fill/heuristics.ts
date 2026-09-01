// The single tuning surface for fill resolution. Every signal shares one
// shape so weights live in flat tables here rather than scattered through
// scoring code — and so a labeled fixture corpus can eventually fit these
// weights offline (the test() outputs are a feature vector; the weights are
// the parameters of a plain linear model).
//
// test() must return a bounded signal: 0/1 for booleans, otherwise clamped
// to [-1, 1] by the engine. Evidence is presence-based on purpose — three
// "Sign in" buttons are not three times the evidence of one, and unbounded
// counts let a single noisy signal drown out every other heuristic.

import type { FillControl } from './dom'

export interface Heuristic<Ctx> {
  name: string
  weight: number
  test(ctx: Ctx): number
}

export interface ScoreBreakdown {
  name: string
  signal: number
  contribution: number
}

export interface Scored {
  total: number
  breakdown: ScoreBreakdown[]
}

export function scoreWith<Ctx>(heuristics: Heuristic<Ctx>[], ctx: Ctx): Scored {
  const breakdown = heuristics.map(h => {
    const signal = Math.max(-1, Math.min(1, h.test(ctx)))
    return { name: h.name, signal, contribution: signal * h.weight }
  })
  return {
    total: breakdown.reduce((sum, b) => sum + b.contribution, 0),
    breakdown,
  }
}

// ─── Group signals ────────────────────────────────────────────────────────────

export interface GroupContext {
  container: Element
  controls: FillControl[]
  // All group containers on the page. Ownership checks stop a large
  // container from absorbing signals (buttons, hints) that visibly belong
  // to another group nested inside it.
  containers: Element[]
}

function owns(ctx: GroupContext, el: Element): boolean {
  return !ctx.containers.some(c =>
    c !== ctx.container && ctx.container.contains(c) && c.contains(el)
  )
}

function ownButtons(ctx: GroupContext): string[] {
  return [...ctx.container.querySelectorAll('button, input[type="submit"], input[type="button"]')]
    .filter(b => owns(ctx, b))
    .map(b => [b.textContent, b.getAttribute('value'), b.getAttribute('aria-label')].join(' ').toLowerCase())
}

function containerHint(ctx: GroupContext): string {
  return [ctx.container.getAttribute('action'), ctx.container.id, ctx.container.getAttribute('name')]
    .join(' ')
    .toLowerCase()
}

function passwordCount(ctx: GroupContext): number {
  return ctx.controls.filter(el => el instanceof HTMLInputElement && el.type === 'password').length
}

export const groupHeuristics: Heuristic<GroupContext>[] = [
  { name: 'login-button',    weight: 10, test: ctx => ownButtons(ctx).some(t => /\b(log.?in|sign.?in|continue|next)\b/.test(t)) ? 1 : 0 },
  { name: 'register-button', weight: -8, test: ctx => ownButtons(ctx).some(t => /\b(register|sign.?up|create.?account|join|get.?started)\b/.test(t)) ? 1 : 0 },
  { name: 'login-hint',      weight:  5, test: ctx => /login|signin|auth|session/.test(containerHint(ctx)) ? 1 : 0 },
  { name: 'register-hint',   weight: -5, test: ctx => /register|signup|join|create/.test(containerHint(ctx)) ? 1 : 0 },
  { name: 'single-password', weight:  3, test: ctx => passwordCount(ctx) === 1 ? 1 : 0 },
  { name: 'password-pair',   weight: -10, test: ctx => passwordCount(ctx) >= 2 ? 1 : 0 },  // confirm-password = registration
  { name: 'compact',         weight:  2, test: ctx => ctx.controls.length <= 3 ? 1 : 0 },
  { name: 'sprawling',       weight: -3, test: ctx => ctx.controls.length >= 6 ? 1 : 0 },
]

// ─── Field signals ────────────────────────────────────────────────────────────

export function fieldHints(el: FillControl): string {
  return normalizedFieldHints(el, true)
}

// Identity hints deliberately omit CSS classes. Class names are useful weak
// evidence in the general scorer, but broad phrases such as "credit-card" are
// commonly shared by every control in a payment widget. Callers use this when
// a phrase is meaningful on the field itself but unsafe as styling evidence.
export function fieldIdentityHints(el: FillControl): string {
  return normalizedFieldHints(el, false)
}

function normalizedFieldHints(el: FillControl, includeClass: boolean): string {
  return [
    el.name,
    el.id,
    'placeholder' in el ? el.placeholder : '',
    includeClass ? el.className : '',
    el.getAttribute('autocomplete') ?? '',
    el.getAttribute('aria-label') ?? '',
    el.getAttribute('title') ?? '',
    labelText(el),
  ].map(normalizeHint).join(' ')
}

function normalizeHint(value: string): string {
  return value
    // DOM identifiers routinely use camelCase as well as snake_case and
    // kebab-case. Preserve those semantic boundaries before lowercasing so
    // expirationDate_month reads as "expiration date month", not the opaque
    // "expirationdate month".
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
}

// SPA inputs frequently carry no name or id, leaving the visible label as the
// only real evidence. `labels` covers both `for=` and a wrapping <label>.
function labelText(el: FillControl): string {
  return el.labels ? [...el.labels].map(l => l.textContent ?? '').join(' ') : ''
}

function autocomplete(el: FillControl): string {
  return (el.getAttribute('autocomplete') ?? '').toLowerCase()
}

// Search boxes and other typeaheads: the site is already showing its own
// dropdown over this field, so ours would be fighting it.
function isTypeahead(el: FillControl): boolean {
  const role = (el.getAttribute('role') ?? '').toLowerCase()
  return role === 'combobox' || role === 'searchbox' || el.hasAttribute('aria-autocomplete')
}

export const usernameHeuristics: Heuristic<FillControl>[] = [
  { name: 'ac-username',   weight: 10, test: el => autocomplete(el) === 'username' || autocomplete(el) === 'email' ? 1 : 0 },
  { name: 'hint-user',     weight:  8, test: el => /user|login|account/i.test(fieldHints(el)) ? 1 : 0 },
  // A bare type=email means "an email belongs here", which every newsletter
  // box on the page says too. Weaker than a field that names itself a login.
  { name: 'type-email',    weight:  5, test: el => el.type === 'email' ? 1 : 0 },
  // Same weight as type-email: a field labelled "Email" and a field typed
  // email are the same claim, and either alone has to clear the fill floor.
  { name: 'hint-email',    weight:  5, test: el => /email/i.test(fieldHints(el)) ? 1 : 0 },
  { name: 'type-password', weight: -10, test: el => el.type === 'password' ? 1 : 0 },  // "login" in a password field's class must not attract the username
  { name: 'search-field',  weight: -10, test: el => el.type === 'search' || /search/i.test(fieldHints(el)) ? 1 : 0 },
  { name: 'marketing',     weight:  -8, test: el => /newsletter|subscri|mailing.?list/i.test(fieldHints(el)) ? 1 : 0 },
  { name: 'typeahead',     weight:  -5, test: el => isTypeahead(el) ? 1 : 0 },
]

export const passwordHeuristics: Heuristic<FillControl>[] = [
  { name: 'type-password', weight: 10, test: el => el.type === 'password' ? 1 : 0 },
  { name: 'ac-password',   weight: 10, test: el => /password/.test(autocomplete(el)) ? 1 : 0 },
  // Visibility toggles flip type to text, leaving the name as the only
  // evidence — on its own that has to clear the fill floor. Whole-word `pass`
  // so passport/passenger fields don't qualify.
  { name: 'hint-password', weight:  5, test: el => /password|passwd|pwd|\bpass\b/i.test(fieldHints(el)) ? 1 : 0 },
]

export const totpHeuristics: Heuristic<FillControl>[] = [
  { name: 'ac-otp',        weight: 10, test: el => autocomplete(el) === 'one-time-code' ? 1 : 0 },
  { name: 'hint-otp',      weight:  5, test: el => /totp|otp|two.?factor|2fa|verification|authenticat|code/i.test(fieldHints(el)) ? 1 : 0 },
  { name: 'hint-code',     weight:  2, test: el => /\bcode\b/i.test(fieldHints(el)) ? 1 : 0 },
  { name: 'otp-length',    weight:  3, test: el => 'maxLength' in el && el.maxLength >= 6 && el.maxLength <= 8 ? 1 : 0 },
  { name: 'numeric',       weight:  3, test: el => el.inputMode === 'numeric' ? 1 : 0 },
]
