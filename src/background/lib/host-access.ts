// Access to pages is optional and asked for in context, not at install.
//
// The extension ships with no host permissions, so a fresh install shows an
// almost empty prompt. Onboarding asks for all-sites access to put the picker
// on the pages the user visits; declining leaves the toolbar popup working
// through activeTab, which grants one tab at a time when the user clicks us.
//
// The content scripts that need that access are therefore registered at
// runtime rather than declared in the manifest: a declared match pattern would
// put the all-sites warning back on the install prompt.

const TOKEN_SCRIPT = 'content-token.js'
const CONTENT_SCRIPT = 'content.js'

export const OPTIONAL_HOSTS = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']

const SCRIPTS = [
  // Only the top frame is ever handed a desktop-opened URL, and this has to
  // beat the page's own scripts to the fragment.
  { id: 'buddy-token', js: [TOKEN_SCRIPT], runAt: 'document_start' as const, allFrames: false },
  // Every frame: same-origin login iframes and split payment iframes both
  // need the picker and the fill.
  { id: 'buddy-content', js: [CONTENT_SCRIPT], runAt: 'document_idle' as const, allFrames: true },
]

/** Whether the all-sites grant is in place. */
export async function hasHostAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: OPTIONAL_HOSTS })
  } catch {
    return false
  }
}

export async function requestHostAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: OPTIONAL_HOSTS })
  } catch {
    return false
  }
}

/**
 * Brings the registered content scripts in line with what the user has
 * granted. Registration persists across browser restarts, so a revoked
 * permission has to actively unregister rather than merely stop re-adding.
 */
export async function syncContentScripts(): Promise<boolean> {
  const granted = await hasHostAccess()
  const ids = SCRIPTS.map(script => script.id)

  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids })
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids })

    if (!granted) return false

    await chrome.scripting.registerContentScripts(SCRIPTS.map(script => ({
      ...script,
      matches: OPTIONAL_HOSTS,
      persistAcrossSessions: true,
    })))
    return true
  } catch (err) {
    console.warn('[host-access] content script sync failed:', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Puts the content script in a tab that may not have one: the popup acting on
 * a page the user never granted us. activeTab covers this for the tab the user
 * just invoked us on. Injecting over an existing script is harmless, since the
 * script guards its own second run.
 */
export async function ensureContentScript(tabId: number, allFrames = false): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames }, files: [CONTENT_SCRIPT] })
    return true
  } catch {
    // No activeTab grant and no host permission: a restricted page, or the
    // user opened the popup without clicking into the tab.
    return false
  }
}
