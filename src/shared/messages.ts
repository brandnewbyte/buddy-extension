import type { Vault, Entry, EntryMeta, EntrySaveMeta, FieldType } from './types'

// ─── Content → Background ────────────────────────────────────────────────────
export interface SelectVaultMessage {
  type: 'SELECT_VAULT'
  id: string
}

// Open vaults, for surfaces that need to name or choose one. The content
// script has no vault list of its own, so this is where it gets colours and
// names — results themselves carry only a vaultId.
export interface GetOpenVaultsMessage {
  type: 'GET_OPEN_VAULTS'
}

export interface OpenVaults {
  vaults: Vault[]
  // Only the save prompt uses this; the picker ignores it.
  lastSaveVaultId: string | null
}

export interface GetPopupContextMessage {
  type: 'GET_POPUP_CONTEXT'
}

export interface GetPageLanesMessage {
  type: 'GET_PAGE_LANES'
}

// What the active tab could actually take, per capability lane.
export interface PageLanes {
  // False when no content script could be reached, in which case an empty
  // `lanes` says nothing about the page and must not be read as absence.
  probed: boolean
  lanes: import('./types').Capability[]
}

export interface UpdateSessionMessage {
  type: 'UPDATE_SESSION'
  filled: import('./types').FieldType[]
}

export interface GetEntriesForUrlMessage {
  type: 'GET_ENTRIES_FOR_URL'
  url: string
}

export interface StartFillMessage {
  type: 'START_FILL'
  id: string
  vaultId: string
  sectionId: string
  // What the sending frame's anchored form can take. Absent from the popup,
  // which has no form in view and discovers frames by probe instead.
  slice?: FieldType[]
}

// Card/address sections, listed by what they can fill instead of by URL
export interface GetCapabilitySectionsMessage {
  type: 'GET_CAPABILITY_SECTIONS'
  capability: import('./types').Capability
}

export interface StartCapabilityFillMessage {
  type: 'START_CAPABILITY_FILL'
  id: string
  vaultId: string
  sectionId: string
  capability: import('./types').Capability
  slice?: FieldType[]
}

export interface GetPendingFillMessage {
  type: 'GET_PENDING_FILL'
  // Everything this document is willing to receive. The background narrows it
  // further against the session's remaining work before asking the desktop, so
  // a resumed fill only ever carries the fields this page can actually take.
  offers: FieldType[]
  // 'reveal' is the same document asking again because its fields changed, and
  // spends nothing: a re-read must not age the session, the same rule
  // pendingSave.countDocument applies to the popup. Anything else charges a
  // document, so a missing or unrecognised reason spends the budget faster
  // rather than never.
  reason?: 'load' | 'reveal'
}

// The entry whose code went stale. Identifiers only — the content script has
// held these since the fill that placed the code, and the picker already lists
// them, so nothing secret is being handed back.
export interface RefreshTotpMessage {
  type: 'REFRESH_TOTP'
  id: string
  vaultId: string
  sectionId: string
}

export interface GetPendingSaveMessage {
  type: 'GET_PENDING_SAVE'
}

export interface CancelFillMessage {
  type: 'CANCEL_FILL'
}

export interface SaveIconMessage {
  type: 'SAVE_ICON'
  id: string
  vaultId: string
  url: string
}

export interface SaveCandidateMessage {
  type: 'SAVE_CANDIDATE'
  url: string
  title: string
  fields: { role: string; value: string }[]
}

// Confirms the background's stored candidate for the sender's tab (active tab
// when sent from the popup). By reference on purpose: the credential itself
// never travels back through this message.
export interface ConfirmSaveMessage {
  type: 'CONFIRM_SAVE'
  // Chosen destination. The one field that is a user decision rather than
  // something the background already holds.
  vaultId?: string
}

export interface DismissSaveMessage {
  type: 'DISMISS_SAVE'
}

// The in-page bar auto-hid without a decision: stop showing it on this tab's
// pages, but keep the candidate alive for the popup until it expires.
export interface SnoozeSaveMessage {
  type: 'SNOOZE_SAVE'
}

export interface LaunchDesktopMessage {
  type: 'LAUNCH_DESKTOP'
}

// A desktop-initiated fill token, lifted out of the URL fragment by the
// document_start content script before the page could read it.
export interface ClaimFillTokenMessage {
  type: 'CLAIM_FILL_TOKEN'
  token: string
}

// ─── Site settings ───────────────────────────────────────────────────────────

// Asked by a frame before it attaches the picker. The answer is per origin and
// fails closed: an unreachable background means no dropdown.
export interface GetPickerPolicyMessage {
  type: 'GET_PICKER_POLICY'
}

export interface SetOriginPausedMessage {
  type: 'SET_ORIGIN_PAUSED'
  // Absent means the active tab's origin, which is how the popup asks.
  origin?: string
  paused: boolean
}

export interface GetSiteSettingsMessage {
  type: 'GET_SITE_SETTINGS'
}

export interface SiteSettings {
  hasHostAccess: boolean
  pausedOrigins: string[]
  /** The active tab's origin, when there is one we could pause. */
  activeOrigin: string | null
}

// ─── Pairing (popup ↔ background) ────────────────────────────────────────────

export type PairingState = 'idle' | 'pairing' | 'dismissed' | 'paired'

export interface GetPairingStateMessage {
  type: 'GET_PAIRING_STATE'
}

// Manual "Connect" from the popup: clears a dismissal and re-runs the ceremony
export interface PairRequestMessage {
  type: 'PAIR_REQUEST'
}

// Broadcast (background → popup) whenever the pairing FSM changes state
export interface PairingStateChangedMessage {
  type: 'PAIRING_STATE_CHANGED'
  state: PairingState
}

// ─── Frame discovery (content → background) ──────────────────────────────────

// A frame's answer to FILL_PROBE. The frame names what it can take; the
// background takes the frame's identity from the browser-attested sender and
// never from this message.
export interface FillOfferMessage {
  type: 'FILL_OFFER'
  probeId: string
  slice: FieldType[]
}

export type BackgroundMessage =
  | SelectVaultMessage
  | GetPopupContextMessage
  | GetPageLanesMessage
  | GetOpenVaultsMessage
  | UpdateSessionMessage
  | GetEntriesForUrlMessage
  | StartFillMessage
  | GetCapabilitySectionsMessage
  | StartCapabilityFillMessage
  | GetPendingFillMessage
  | RefreshTotpMessage
  | GetPendingSaveMessage
  | CancelFillMessage
  | SaveIconMessage
  | SaveCandidateMessage
  | ConfirmSaveMessage
  | DismissSaveMessage
  | SnoozeSaveMessage
  | LaunchDesktopMessage
  | ClaimFillTokenMessage
  | GetPickerPolicyMessage
  | SetOriginPausedMessage
  | GetSiteSettingsMessage
  | GetPairingStateMessage
  | PairRequestMessage
  | FillOfferMessage

// ─── Background → Content ────────────────────────────────────────────────────

// Delivered to one frame, chosen in the background from a browser-attested
// sender or a probe answer. `entry.fields` holds only that frame's slice, so a
// split-field payment provider's sibling iframes each receive their own piece
// and nothing else. A frame that was not chosen is never sent the message, so
// no frame has to decide whether it is allowed to fill.
export interface FillReadyMessage {
  type: 'FILL_READY'
  entry: Entry
}

// Asks every frame what it could fill. Carries no secrets, so broadcasting it
// discloses nothing; answers come back as FillOfferMessage.
export interface FillProbeMessage {
  type: 'FILL_PROBE'
  probeId: string
  lane: 'login' | 'card' | 'address'
}

// The keyboard equivalent of clicking the in-field glyph. Broadcast to every
// frame; only the one holding focus acts on it.
export interface OpenPickerMessage {
  type: 'OPEN_PICKER'
}

export type BackgroundToContentMessage = FillReadyMessage | FillProbeMessage | OpenPickerMessage

// ─── Response shapes ─────────────────────────────────────────────────────────
// All router responses are IpcResult<T> (see ipc.ts). Only compound payloads
// need a named shape; the rest reuse types.ts directly.

export interface PopupContext {
  vaults: Vault[]
  searchResults: EntryMeta[]
  fillActive: boolean
  pendingSave: EntrySaveMeta | null
  // Preselects the popup's save destination, on the same terms as the in-page
  // bar: null once the vault it names is no longer open.
  lastSaveVaultId: string | null
}

