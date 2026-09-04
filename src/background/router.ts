import type { BackgroundMessage } from '../shared/messages'
import * as getPopupContext from './handlers/get-popup-context'
import * as getOpenVaults from './handlers/get-open-vaults'
import * as getPageLanes from './handlers/get-page-lanes'
import * as updateSession from './handlers/update-session'
import * as getEntriesForUrl from './handlers/get-entries-for-url'
import * as startFill from './handlers/start-fill'
import * as getCapabilitySections from './handlers/get-capability-sections'
import * as startCapabilityFill from './handlers/start-capability-fill'
import * as getPendingFill from './handlers/get-pending-fill'
import * as refreshTotp from './handlers/refresh-totp'
import * as getPendingSave from './handlers/get-pending-save'
import * as cancelFill from './handlers/cancel-fill'
import * as saveIcon from './handlers/save-icon'
import * as saveCandidate from './handlers/save-candidate'
import * as confirmSave from './handlers/confirm-save'
import * as launchDesktop from './handlers/launch-desktop'
import * as pendingSave from './lib/pending-save'
import * as selectVault from './handlers/select-vault'
import * as pairing from './lib/pairing'
import * as frameOffers from './lib/frame-offers'
import * as siteSettings from './handlers/site-settings'
import { pendingTokens } from './lib/pending-tokens'

// 16 random bytes, URL-safe base64, unpadded: exactly what generate_token mints.
const FILL_TOKEN = /^[A-Za-z0-9_-]{22}$/
import { activeTab, senderFrameUrl } from './lib/tabs'

export function registerRouter(): void {
  // Always answer, even on handler bugs — an unanswered port shows up as a
  // rejection on the sender's side instead of an { ok: false } envelope.
  // Never log messages or results here: several carry credentials.
  const respond = <T>(promise: Promise<T>, sendResponse: (response: T | { ok: false; code: 'GENERIC' }) => void) => {
    promise.then(sendResponse).catch((err) => {
      console.error('[router] handler failed', err instanceof Error ? err.message : err)
      sendResponse({ ok: false, code: 'GENERIC' })
    })
  }

  // Submit capture stays top-frame-or-same-origin: the save prompt renders in
  // the top document, and a captured credential is attributed to the page the
  // user believes they are on.
  //
  // Login lookup and fill are no longer gated this way. They key on the sender
  // frame's own origin instead, which is what lets a bank's login iframe fill
  // against its own saved entry. The property that mattered is unchanged: a
  // frame still never learns what the vault holds for the page embedding it,
  // because the origin comes from the attested sender and not the message.
  const trustedLoginFrame = (sender: chrome.runtime.MessageSender): boolean => {
    if (!sender.tab) return true       // popup: acts on the active tab
    if (sender.frameId === 0) return true
    return originOf(sender.url) !== null && originOf(sender.url) === originOf(sender.tab.url)
  }

  const originOf = (url: string | undefined): string | null => {
    if (!url) return null
    try { return new URL(url).origin } catch { return null }
  }

  const topFrameOnly = (sender: chrome.runtime.MessageSender): boolean =>
    !sender.tab || sender.frameId === 0

  chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
    const tabId = sender.tab?.id

    switch (message.type) {
      case 'GET_POPUP_CONTEXT':
        respond(getPopupContext.handle(), sendResponse)
        return true

      case 'GET_OPEN_VAULTS':
        respond(getOpenVaults.handle(), sendResponse)
        return true

      case 'GET_PAGE_LANES':
        respond(getPageLanes.handle(), sendResponse)
        return true

      case 'SELECT_VAULT':
        selectVault.handle(message)
        return false

      case 'UPDATE_SESSION':
        updateSession.handle(tabId, message)
        return false

      // Any frame may ask what the vault holds for *its own* origin, which it
      // already controls. What it must never learn is what the vault holds for
      // the page embedding it, and the origin here comes from the attested
      // sender rather than the message, so it cannot claim to be one.
      case 'GET_ENTRIES_FOR_URL':
        respond(getEntriesForUrl.handle(tabId, senderFrameUrl(sender) ?? message.url), sendResponse)
        return true

      case 'START_FILL':
        respond(startFill.handle(sender, message), sendResponse)
        return true

      case 'GET_CAPABILITY_SECTIONS':
        respond(getCapabilitySections.handle(message), sendResponse)
        return true

      case 'START_CAPABILITY_FILL':
        respond(startCapabilityFill.handle(sender, message), sendResponse)
        return true

      case 'GET_PENDING_FILL':
        // Frame policy lives in the handler: a login resume is top-frame only,
        // while a revealed card field is served to the frames the fill reached.
        respond(getPendingFill.handle(sender, message), sendResponse)
        return true

      case 'REFRESH_TOTP':
        // Frame-scoped rather than top-frame-only: a login living in a
        // cross-origin frame filled its own code there and has to be able to
        // replace it. senderFrameUrl keeps the request answering that frame.
        respond(refreshTotp.handle(sender, message), sendResponse)
        return true

      case 'GET_PENDING_SAVE':
        if (!topFrameOnly(sender)) { sendResponse({ ok: true, data: null }); return false }
        respond(getPendingSave.handle(sender.tab), sendResponse)
        return true

      case 'CANCEL_FILL':
        respond(cancelFill.handle(), sendResponse)
        return true

      case 'SAVE_ICON':
        saveIcon.handle(tabId, message)
        return false

      case 'SAVE_CANDIDATE':
        if (!trustedLoginFrame(sender)) return false
        void saveCandidate.handle(tabId, message)
        return false

      case 'CONFIRM_SAVE':
        respond(confirmSave.handle(tabId, message), sendResponse)
        return true

      case 'DISMISS_SAVE':
        // From the popup there's no sender.tab — it means the active tab
        if (tabId) void pendingSave.clear(tabId)
        else void activeTab().then(t => { if (t?.id) void pendingSave.clear(t.id) })
        return false

      case 'SNOOZE_SAVE':
        if (tabId) void pendingSave.snooze(tabId)
        return false

      case 'LAUNCH_DESKTOP':
        respond(launchDesktop.handle(), sendResponse)
        return true

      case 'GET_PICKER_POLICY':
        respond(siteSettings.pickerPolicy(sender), sendResponse)
        return true

      case 'GET_SITE_SETTINGS':
        respond(siteSettings.get(), sendResponse)
        return true

      case 'SET_ORIGIN_PAUSED':
        respond(siteSettings.set(message), sendResponse)
        return true

      case 'CLAIM_FILL_TOKEN':
        // Top frame only, and shaped like a token: it arrives from a content
        // script, so the page's URL is untrusted input until it is checked.
        if (topFrameOnly(sender) && tabId && FILL_TOKEN.test(message.token)) {
          void pendingTokens.set(tabId, message.token)
        }
        return false

      case 'GET_PAIRING_STATE':
        respond(pairing.getState(), sendResponse)
        return true

      case 'PAIR_REQUEST':
        respond(pairing.manualPair(), sendResponse)
        return true

      case 'FILL_OFFER':
        // Answer to a probe. The frame's identity comes from the sender.
        frameOffers.record(message, sender)
        return false
    }
  })
}