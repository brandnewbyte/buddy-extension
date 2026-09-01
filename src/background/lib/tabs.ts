// Popup-originated messages have no sender.tab; they act on the active tab.
export async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  })
  return tab
}

// Canonical url form used for entry matching and cache keys:
// scheme + host + path, no query/hash.
export function originPathOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    const { protocol, host, pathname } = new URL(url)
    return `${protocol}//${host}${pathname}`
  } catch {
    return null
  }
}

export function originPath(tab: chrome.tabs.Tab | undefined): string | null {
  return originPathOf(tab?.url)
}

/**
 * The url of the frame a message actually came from, as the browser reports
 * it. A framed login belongs to the frame's own origin, not to the page
 * embedding it, so this is what both the lookup and the release are keyed on.
 * Null for the popup, which speaks for no frame.
 */
export function senderFrameUrl(sender: chrome.runtime.MessageSender | undefined): string | null {
  return sender?.tab ? originPathOf(sender.url) : null
}

/** Origin of a browser-attested URL, or null if there isn't one. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null
  try { return new URL(url).origin } catch { return null }
}
