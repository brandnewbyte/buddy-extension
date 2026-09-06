// Badge colours, dark enough to carry white text and to sit beside the brand
// navy rather than shout over it. Chrome picks a text colour per background on
// its own and lands on black for a bright fill, so the colour is set here
// explicitly instead.
const STATE_COLOURS = {
  unlocked: '#059669',
  locked: '#b45309',
  offline: '#b91c1c',
} as const

const BADGE_TEXT = '#ffffff'

export function setBadge(state: 'offline' | 'locked' | 'unlocked'): void {
  // Per-tab badge text wins over the global text, so a stale match count
  // would hide the state the user actually needs to see. Only 'unlocked'
  // keeps them: a count on a ready vault is exactly what they're for.
  if (state !== 'unlocked') clearTabCounts()

  chrome.action.setBadgeTextColor({ color: BADGE_TEXT })

  switch(state) {
    case 'unlocked':
      chrome.action.setBadgeText({ text: 'RDY' })
      chrome.action.setBadgeBackgroundColor({ color: STATE_COLOURS.unlocked })
      break
    case 'locked':
      chrome.action.setBadgeText({ text: 'LCKD' })
      chrome.action.setBadgeBackgroundColor({ color: STATE_COLOURS.locked })
      break
    case 'offline':
      chrome.action.setBadgeText({ text: 'D/C' })
      chrome.action.setBadgeBackgroundColor({ color: STATE_COLOURS.offline })
      break
  }
}

// Tabs currently carrying a count, so the overrides can be lifted when the
// global state changes under them. Dies with the worker, as the cache it
// describes does.
const counted = new Set<number>()

// Per-tab entry count, shown once we know the matches for a page. Overrides
// the global text for that tab only; Chrome clears it on navigation.
export function setTabCount(tabId: number, count: number): void {
  if (count <= 0) return
  counted.add(tabId)
  chrome.action.setBadgeText({ tabId, text: String(count) })
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#3d67b4' })
  chrome.action.setBadgeTextColor({ tabId, color: BADGE_TEXT })
}

// Hands every counted tab back to the global badge. Closed tabs reject; the
// point is the surviving ones.
export function clearTabCounts(): void {
  for (const tabId of counted) {
    void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {})
  }
  counted.clear()
}