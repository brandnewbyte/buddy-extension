import { send } from '../bridge'
import { setControlValue } from './dom'
import { classifyPage, formFor } from '../forms'
import type { ClassifiedForm, PageRole } from '../forms'
import { scrapeIcon } from '../icon'
import { flashFilled } from './flash'
import { armTotpRefresh } from './totp-refresh'
import type { Entry, EntryField, FieldType } from '../../shared/types'

// The core fill invariant: a fill either has an anchor — the field the user
// invoked Buddy from, which pins it to that one form — or it has no anchor
// and only proceeds when exactly one form on the page is compatible with the
// entry. There is no "best" form; ambiguity means nothing happens.
export async function fill(entry: Entry, anchor?: Element | null): Promise<FieldType[]> {
  const { filled, totp } = fillFields(entry, anchor ?? null)

  if (filled.length) {
    // Armed on every fill, anchored or not: a code placed by a deliberate pick
    // goes stale on exactly the same clock as a resumed one.
    if (totp) armTotpRefresh(totp, entry)

    send({ type: 'UPDATE_SESSION', filled })
    // Login entries only: a merchant's favicon says nothing about a card
    const isLogin = entry.fields.some(f => f.type === 'username' || f.type === 'password')
    if (isLogin && !entry.hasIcon) scrapeIcon(entry.id, entry.vaultId)
  }
  return filled
}

interface FillResult {
  filled: FieldType[]
  /** The control the code landed in, so a stale one can be replaced. */
  totp: Element | null
}

function fillFields(entry: Entry, anchor: Element | null): FillResult {
  const forms = classifyPage()

  const target = anchor
    ? anchoredForm(anchor, forms)
    : uniqueCompatibleForm(forms, entry)

  if (!target) return { filled: [], totp: null }

  const filled: FieldType[] = []
  let totp: Element | null = null

  for (const field of entry.fields) {
    // Unanchored means nothing the user did just now put this value here, so
    // the fill marks itself. See flash.ts.
    const touched = fillField(target, field, anchor === null)
    if (!touched.length) continue
    filled.push(field.type)
    if (field.type === 'totp') totp = touched[0]
  }

  return { filled, totp }
}

// The user picked from this field; its form is the only legitimate target.
// `unknown` still refuses — an anchor should never exist there (the picker
// gates on classification), so one arriving means our state is stale.
function anchoredForm(anchor: Element, forms: ClassifiedForm[]): ClassifiedForm | null {
  const form = formFor(anchor, forms)
  return form && form.kind !== 'unknown' ? form : null
}

// No anchor (popup fill, multi-page resume, revealed-field refill): the page
// must offer exactly one form whose kind matches what the entry carries and
// which can take at least one of its fields. Two candidates = do nothing.
function uniqueCompatibleForm(forms: ClassifiedForm[], entry: Entry): ClassifiedForm | null {
  const kinds = compatibleKinds(entry)
  const candidates = forms.filter(f =>
    kinds.includes(f.kind) && entry.fields.some(field => targetsFor(f, field).length)
  )
  return candidates.length === 1 ? candidates[0] : null
}

function compatibleKinds(entry: Entry): ClassifiedForm['kind'][] {
  const types = new Set(entry.fields.map(f => f.type))
  // Login credentials never wander into registration/card/address forms on
  // their own; card and address entries likewise stay in their lane.
  if (types.has('password') || types.has('username') || types.has('totp')) return ['login']
  if ([...types].some(t => t.startsWith('card_'))) return ['card']
  return ['address']
}

// Which controls a wire field lands in, resolution and splitting included.
function targetsFor(form: ClassifiedForm, field: EntryField): { el: Element, value: string }[] {
  const r = form.resolved
  const direct = (role: PageRole, value: string) => {
    const el = r[role]
    return el ? [{ el, value }] : []
  }

  switch (field.type) {
    case 'username': return direct('username', field.value)
    case 'password': {
      if (!r.password) return []
      // Registration confirm fields get the same value — a half-filled
      // password pair fails validation and reads as a glitch.
      const confirms = form.kind === 'registration'
        ? form.controls.filter(el =>
            el !== r.password && el instanceof HTMLInputElement && el.type === 'password')
        : []
      return [{ el: r.password, value: field.value }, ...confirms.map(el => ({ el, value: field.value }))]
    }
    case 'totp': return field.value ? direct('totp', field.value) : []
    case 'card_exp': {
      // Combined target when the page has one; otherwise split MM/YY(YY)
      // across the pair. Fail closed on unparseable values.
      if (r.card_exp) return direct('card_exp', field.value)
      const parsed = parseExpiry(field.value)
      if (!parsed) return []
      const out: { el: Element, value: string }[] = []
      if (r.card_exp_month) out.push({ el: r.card_exp_month, value: parsed.month })
      if (r.card_exp_year) out.push({ el: r.card_exp_year, value: parsed.year })
      return out
    }
    default: return direct(field.type, field.value)
  }
}

/** The controls this field landed in, empty when the form had nowhere for it. */
function fillField(form: ClassifiedForm, field: EntryField, flash: boolean): Element[] {
  const targets = targetsFor(form, field)
  for (const { el, value } of targets) {
    setControlValue(el as Parameters<typeof setControlValue>[0], value)
    if (flash) flashFilled(el)
  }
  return targets.map(target => target.el)
}

// "04/26", "4/2026", "04-26", "04 / 26" → month "04", year "2026"
function parseExpiry(value: string): { month: string, year: string } | null {
  const m = value.match(/^\s*(\d{1,2})\s*[\/\-. ]\s*(\d{2}|\d{4})\s*$/)
  if (!m) return null
  const month = m[1].padStart(2, '0')
  if (parseInt(month, 10) < 1 || parseInt(month, 10) > 12) return null
  const year = m[2].length === 2 ? `20${m[2]}` : m[2]
  return { month, year }
}
