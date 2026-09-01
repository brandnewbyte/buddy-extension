// Where the page vocabulary meets the wire vocabulary.
//
// `PageRole` describes what a control is; `FieldType` describes what the vault
// releases. The mapping is many-to-one: a registration form's new_password and
// a login form's password both request `password`, and the three expiry roles
// all request the single `card_exp` the client splits back apart.
//
// A slice is what the extension asks the desktop for. It is derived from the
// classifier's own `resolved` map rather than written by hand, so it cannot
// name a field fill would not target.

import type { ClassifiedForm, PageRole } from '../forms'
import type { FieldType } from '../../shared/types'

const ROLE_TO_FIELD: Record<PageRole, FieldType> = {
  username: 'username',
  password: 'password',
  new_password: 'password',
  totp: 'totp',
  card_name: 'card_name',
  card_number: 'card_number',
  card_exp: 'card_exp',
  card_exp_month: 'card_exp',
  card_exp_year: 'card_exp',
  card_cvv: 'card_cvv',
  street: 'street',
  street2: 'street2',
  city: 'city',
  region: 'region',
  postal_code: 'postal_code',
  country: 'country',
}

export type FillLane = 'login' | 'card' | 'address'

// Mirrors the lanes pickerOffer() answers with, so a slice covers exactly the
// offer the user acted on: picking a card on a checkout page that also holds
// an address asks for card fields only.
const LANE_ROLES: Record<FillLane, PageRole[]> = {
  login: ['username', 'password', 'new_password', 'totp'],
  card: ['card_name', 'card_number', 'card_exp', 'card_exp_month', 'card_exp_year', 'card_cvv'],
  address: ['street', 'street2', 'city', 'region', 'postal_code', 'country'],
}

const FORM_LANES: Record<ClassifiedForm['kind'], FillLane[]> = {
  login: ['login'],
  registration: ['login'],
  card: ['card', 'address'],
  address: ['address'],
  unknown: [],
}

/** The wire fields `form` can take in `lane`, in no particular order. */
export function sliceFor(form: ClassifiedForm, lane: FillLane): FieldType[] {
  const roles = LANE_ROLES[lane]
  const fields = new Set<FieldType>()
  for (const role of Object.keys(form.resolved) as PageRole[]) {
    if (roles.includes(role)) fields.add(ROLE_TO_FIELD[role])
  }
  return [...fields]
}

/**
 * Everything this document could fill right now, across every lane, counting
 * only forms that are unambiguous within their lane. Used by the unanchored
 * paths (page-load resume, revealed fields, popup probe) to say what they are
 * willing to receive before any secret is requested.
 */
export function pageOffers(forms: ClassifiedForm[], lane?: FillLane): FieldType[] {
  const lanes: FillLane[] = lane ? [lane] : ['login', 'card', 'address']
  const fields = new Set<FieldType>()

  for (const candidate of lanes) {
    const inLane = forms.filter(form =>
      FORM_LANES[form.kind].includes(candidate) && sliceFor(form, candidate).length > 0)
    // The unanchored rule, unchanged: exactly one candidate form or nothing.
    if (inLane.length !== 1) continue
    for (const field of sliceFor(inLane[0], candidate)) fields.add(field)
  }

  return [...fields]
}
