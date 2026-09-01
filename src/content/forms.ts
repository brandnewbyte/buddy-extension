// The one form classifier. Picker, fill, and save-capture all consume this —
// there is deliberately no second opinion anywhere else, so "which form is
// this and which field does what" can only be answered one way per page.
//
// Role names are the desktop's wire vocabulary (shared/types.ts FieldType)
// verbatim wherever the two coincide; page-only roles (new_password, the
// split expiry pair) extend it. A parallel naming scheme is what drifted
// before.

import { visibleControls } from './fill/dom'
import type { FillControl } from './fill/dom'
import { groupByContainer, usernameScope } from './fill/group'
import { scoreWith, groupHeuristics, fieldHints, fieldIdentityHints } from './fill/heuristics'
import type { GroupContext } from './fill/heuristics'
import { MIN_FIELD_SCORE, scoreUsernameField, scorePasswordField, scoreTotpField, findBestField } from './fill/score'

export type PageRole =
  | 'username' | 'password' | 'new_password' | 'totp'
  | 'card_name' | 'card_number' | 'card_exp' | 'card_exp_month' | 'card_exp_year' | 'card_cvv'
  | 'street' | 'street2' | 'city' | 'region' | 'postal_code' | 'country'

export type FormKind = 'login' | 'registration' | 'card' | 'address' | 'unknown'

export interface ClassifiedForm {
  container: Element
  kind: FormKind
  controls: FillControl[]
  /// One element per role this form can fill: ambiguity is resolved here,
  /// once, so picker and fill can never disagree about a target.
  resolved: Partial<Record<PageRole, FillControl>>
}

// ─── Field roles ──────────────────────────────────────────────────────────────

// The autocomplete attribute is authoritative when present: it's the site
// telling autofill software exactly what it wants. Token lists are scanned
// whole so "billing address-line1" still resolves.
const AC_ROLES: Record<string, PageRole> = {
  'username': 'username',
  'email': 'username',
  'current-password': 'password',
  'new-password': 'new_password',
  'one-time-code': 'totp',
  'cc-number': 'card_number',
  'cc-csc': 'card_cvv',
  'cc-exp': 'card_exp',
  'cc-exp-month': 'card_exp_month',
  'cc-exp-year': 'card_exp_year',
  'cc-name': 'card_name',
  'cc-given-name': 'card_name',
  'cc-family-name': 'card_name',
  'street-address': 'street',
  'address-line1': 'street',
  'address-line2': 'street2',
  'address-level2': 'city',
  'address-level1': 'region',
  'postal-code': 'postal_code',
  'country': 'country',
  'country-name': 'country',
}

function acRole(el: FillControl): PageRole | null {
  const tokens = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/)
  for (const token of tokens) {
    const role = AC_ROLES[token]
    if (role) return role
  }
  return null
}

// Regex fallbacks for roles with no scored table. Self-evident names only —
// a field these match is unambiguous on its own. Order matters where one
// pattern is a substring of another (street2 before street).
const CARD_ROLES: [PageRole, RegExp][] = [
  // "credit card" by itself describes a whole widget and consequently appears
  // in shared styling classes on holder-name and expiry controls. A number role
  // needs number/PAN evidence of its own.
  ['card_number', /card.?num|cc.?num|cardnumber|\bpan\b/],
  ['card_cvv',    /\bcvv\b|\bcvc\b|\bcvn\b|\bcsc\b|security.?code|card.?code/],
  ['card_name',   /name.?on.?card|card.?holder|cc.?name|cardname/],
]

const ADDRESS_ROLES: [PageRole, RegExp][] = [
  ['street2',     /address.?line.?2|\baddr.?2\b|apartment|\bapt\b|\bsuite\b|\bunit\b/],
  ['street',      /street|address.?line.?1|\baddr(ess)?.?1\b|street.?address|shipping.?address|billing.?address/],
  ['city',        /\bcity\b|\btown\b/],
  ['region',      /\bstate\b|province|\bregion\b|\bcounty\b/],
  ['postal_code', /\bzip\b|postal/],
  ['country',     /\bcountry\b/],
]

// Only assigned inside groups already known to be card forms: "account holder",
// "month", or "expiry" alone is too generic to trust elsewhere on a page.
const CARD_CONTEXT_ROLES: [PageRole, RegExp][] = [
  // Account-holder language is only card-specific once a confident card field
  // has established the group context. This avoids treating bank-account and
  // identity forms as payment-card forms.
  ['card_name',      /\baccount.?holder(?:.?name)?\b|\bholder.?name\b/],
  // Covers expMonth, expiry_month, expirationDate-month, and their year
  // equivalents after fieldHints() normalizes identifier boundaries.
  ['card_exp_month', /\bexp(?:iry|iration)?(?:.?date)?.?(?:month|mm)\b|\bmm\b/],
  ['card_exp_year',  /\bexp(?:iry|iration)?(?:.?date)?.?(?:year|yy(?:yy)?)\b|\byy(?:yy)?\b/],
  ['card_exp',       /\bexp(iry|iration)?\b|valid.?(thru|until)|\bmm\s*\/\s*yy/],
]

function matchRoles(el: FillControl, table: [PageRole, RegExp][]): PageRole | null {
  const hints = fieldHints(el)
  for (const [role, pattern] of table) {
    if (pattern.test(hints)) return role
  }
  return null
}

/// First-pass role for a field considered in isolation.
function fieldRole(el: FillControl): PageRole | null {
  const ac = acRole(el)
  if (ac) return ac

  if (el instanceof HTMLInputElement && el.type === 'password') return 'password'

  const card = matchRoles(el, CARD_ROLES)
  if (card) return card

  // Preserve support for terse fields such as name="credit_card", but only
  // when that broad phrase belongs to the control itself. Looking for it in
  // fieldHints() would let a shared widget class turn every card control into
  // the number field.
  if (el instanceof HTMLInputElement && /credit.?card|debit.?card/.test(fieldIdentityHints(el))) {
    return 'card_number'
  }

  // Scored login roles: the floor keeps unlabeled text boxes out entirely.
  // Password here catches type=text fields behind visibility toggles whose
  // only evidence is a password-shaped name or label.
  const scores: [PageRole, number][] = [
    ['username', scoreUsernameField(el)],
    ['password', scorePasswordField(el)],
    ['totp', scoreTotpField(el)],
  ]
  const [bestRole, bestScore] = scores.reduce((a, b) => (b[1] > a[1] ? b : a))
  if (bestScore >= MIN_FIELD_SCORE) return bestRole

  // "Email address" fields hint 'address'; they were username's to claim above
  if (!/email/i.test(fieldHints(el))) {
    const address = matchRoles(el, ADDRESS_ROLES)
    if (address) return address
  }

  return null
}

// ─── Form classification ──────────────────────────────────────────────────────

export function classifyPage(): ClassifiedForm[] {
  const controls = visibleControls()
  const groups = groupByContainer(controls)
  const containers = [...groups.keys()]

  return [...groups].map(([container, groupControls]) =>
    classifyGroup(container, groupControls, containers)
  )
}

function classifyGroup(container: Element, controls: FillControl[], containers: Element[]): ClassifiedForm {
  const roles = new Map<FillControl, PageRole>()
  for (const el of controls) {
    const role = fieldRole(el)
    if (role) roles.set(el, role)
  }

  // Second pass: a group with any confident card field gets its ambiguous
  // expiry/holder fields resolved; outside card context they stay unroled.
  const cardContext = [...roles.values()].some(r => r.startsWith('card_'))
  if (cardContext) {
    for (const el of controls) {
      const role = matchRoles(el, CARD_CONTEXT_ROLES)
      if (!role) continue

      const existing = roles.get(el)
      if (!existing) {
        roles.set(el, role)
      } else if (role === 'card_name' && existing === 'username') {
        // The generic login scorer reads "accountHolderName" as username-like.
        // Once another field has proved this is a card group, the more specific
        // account-holder meaning wins. Never make this override outside that
        // established context.
        roles.set(el, role)
      }
    }
  }

  const ctx: GroupContext = { container, controls, containers }
  const kind = classifyKind(ctx, roles)

  return { container, kind, controls, resolved: resolveRoles(kind, controls, roles) }
}

function classifyKind(ctx: GroupContext, roles: Map<FillControl, PageRole>): FormKind {
  const count = (role: PageRole) => [...roles.values()].filter(r => r === role).length
  const distinctCard = new Set([...roles.values()].filter(r => r.startsWith('card_'))).size
  const distinctAddress = new Set(
    [...roles.values()].filter(r => ['street', 'street2', 'city', 'region', 'postal_code', 'country'].includes(r))
  ).size

  if (count('card_number') || distinctCard >= 2) return 'card'

  if (count('new_password') || count('password') >= 2) return 'registration'

  const { total, breakdown } = scoreWith(groupHeuristics, ctx)
  if (count('password') === 1) {
    // A lone password field with register-shaped surroundings ("Sign up",
    // /signup action) is a registration form even without a confirm field.
    return total < 0 ? 'registration' : 'login'
  }

  if (count('totp')) return 'login'

  // Password-less username step (split logins): needs actual auth evidence
  // beyond "an email fits here", or every newsletter box becomes a login.
  if (count('username')) {
    const authEvidence = breakdown.some(b =>
      (b.name === 'login-button' || b.name === 'login-hint') && b.signal > 0
    ) || [...roles.entries()].some(([el, r]) => r === 'username' && acRole(el) === 'username')
    if (authEvidence && total > 0) return 'login'
  }

  if (distinctAddress >= 2) return 'address'

  return 'unknown'
}

// ─── Role resolution ──────────────────────────────────────────────────────────

function resolveRoles(
  kind: FormKind,
  controls: FillControl[],
  roles: Map<FillControl, PageRole>,
): Partial<Record<PageRole, FillControl>> {
  const resolved: Partial<Record<PageRole, FillControl>> = {}

  const of = (role: PageRole) => [...roles.entries()].filter(([, r]) => r === role).map(([el]) => el)

  // Username: prefer the candidate sharing the password's own block — in a
  // page-wide form the footer newsletter email is also a candidate, and
  // proximity to the password is the evidence scores can't express.
  const usernames = of('username')
  if (usernames.length) {
    const scoped = usernameScope(controls).filter(el => usernames.includes(el))
    const pool = scoped.length ? scoped : usernames
    resolved.username = findBestField(pool, scoreUsernameField) ?? pool[0]
  }

  // Password: in a registration form the first new-password field is the one
  // to fill (fill echoes it into the confirm field); in a login form the
  // best-scoring password field wins.
  const passwords = [...of('new_password'), ...of('password')]
  if (passwords.length) {
    resolved.password = kind === 'registration'
      ? passwords[0]
      : findBestField(of('password'), scorePasswordField) ?? passwords[0]
  }

  const totps = of('totp')
  if (totps.length) resolved.totp = findBestField(totps, scoreTotpField) ?? totps[0]

  // Everything else is document-order first: these roles are only assigned on
  // self-evident names, so duplicates are near-nonexistent (a second match is
  // usually a shipping/billing pair, where first-in-order is the safe pick).
  for (const [el, role] of roles) {
    if (role === 'username' || role === 'password' || role === 'new_password' || role === 'totp') continue
    if (!resolved[role]) resolved[role] = el
  }

  return resolved
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/// The innermost classified form containing el, or null.
export function formFor(el: Element, forms: ClassifiedForm[]): ClassifiedForm | null {
  const containing = forms.filter(f => f.container.contains(el))
  return containing.find(f =>
    !containing.some(other => other !== f && f.container.contains(other.container))
  ) ?? null
}

/// The role el itself resolved to in its form, or null. This is the picker
/// gate: no resolved role, no dropdown — the same rule fill targets by.
export function resolvedRole(el: Element, form: ClassifiedForm): PageRole | null {
  for (const [role, target] of Object.entries(form.resolved)) {
    if (target === el) return role as PageRole
  }
  return null
}

const LOGIN_ROLES: PageRole[] = ['username', 'password', 'totp']
const ADDRESS_ROLES_LIST: PageRole[] = ['street', 'street2', 'city', 'region', 'postal_code', 'country']

/// What focusing el should offer, if anything. One function so the picker,
/// fill, and the tests can never drift apart:
///  - 'login' on the resolved login-role fields of a login form — or a
///    registration form, where filling an existing credential is legitimate
///    but strictly the user's anchored call
///  - 'card' on resolved card fields of a card form
///  - 'address' on resolved address fields of an address form, or of a card
///    form (checkouts routinely put both in one container)
export function pickerOffer(el: Element, forms: ClassifiedForm[]): 'login' | 'card' | 'address' | null {
  const form = formFor(el, forms)
  if (!form) return null
  const role = resolvedRole(el, form)
  if (!role) return null

  if ((form.kind === 'login' || form.kind === 'registration') && LOGIN_ROLES.includes(role)) return 'login'
  if (form.kind === 'card' && role.startsWith('card_')) return 'card'
  if ((form.kind === 'address' || form.kind === 'card') && ADDRESS_ROLES_LIST.includes(role)) return 'address'
  return null
}

export function offersLoginPicker(el: Element, forms: ClassifiedForm[]): boolean {
  return pickerOffer(el, forms) === 'login'
}
