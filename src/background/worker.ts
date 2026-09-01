import { registerRouter } from './router'
import { pendingTokens } from './lib/pending-tokens'
import * as autofillSession from './lib/autofill-session'
import * as pendingSave from './lib/pending-save'
import * as capabilityTarget from './lib/capability-target'
import { syncContentScripts } from './lib/host-access'

chrome.tabs.onRemoved.addListener((tabId) => {
  pendingTokens.delete(tabId).catch(console.error)
  autofillSession.clear(tabId).catch(console.error)
  pendingSave.clear(tabId).catch(console.error)
  capabilityTarget.clear(tabId).catch(console.error)
})

// Registration persists across restarts, so this is reconciliation rather than
// setup: it also has to unregister when a permission is revoked.
chrome.runtime.onInstalled.addListener(details => {
  void syncContentScripts()
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') })
  }
})
chrome.runtime.onStartup.addListener(() => { void syncContentScripts() })
chrome.permissions.onAdded.addListener(() => { void syncContentScripts() })
chrome.permissions.onRemoved.addListener(() => { void syncContentScripts() })

// Focus no longer opens the picker, so the shortcut is what keeps it reachable
// without a mouse. Broadcast: only the frame holding focus responds.
chrome.commands?.onCommand.addListener((command) => {
  if (command !== 'open-picker') return
  void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
    if (tab?.id) void chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PICKER' }).catch(() => {})
  })
})

registerRouter()