import { scoreWith, usernameHeuristics, passwordHeuristics, totpHeuristics } from './heuristics'
import type { FillControl } from './dom'

// Thin adapters over the signal tables in heuristics.ts — tune there, not here.

// "Worth touching at all". The classifier uses this as the floor for scored
// role assignment, which is also what gates the picker: a field only gets a
// dropdown if it resolved to a role fill would actually target. One clear
// signal (a password type, a field naming itself a login, an email input)
// clears it; an unlabeled text box does not.
export const MIN_FIELD_SCORE = 5

export function scoreUsernameField(el: FillControl): number {
  return scoreWith(usernameHeuristics, el).total
}

export function scorePasswordField(el: FillControl): number {
  return scoreWith(passwordHeuristics, el).total
}

export function scoreTotpField(el: FillControl): number {
  return scoreWith(totpHeuristics, el).total
}

export function findBestField(
  controls: FillControl[],
  scorer: (el: FillControl) => number,
  minScore = MIN_FIELD_SCORE,
): FillControl | null {
  let best: { el: FillControl; score: number } | null = null
  for (const el of controls) {
    const score = scorer(el)
    if (score >= minScore && (!best || score > best.score)) {
      best = { el, score }
    }
  }
  return best?.el ?? null
}
