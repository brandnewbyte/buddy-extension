import { send } from './bridge'
import { attachPickerOnFocus, openArmedPicker, takeAnchor } from './picker/focus-watcher'
import { fill } from './fill/index'
import { visibleControls } from './fill/dom'
import { classifyPage } from './forms'
import { pageOffers } from './fill/slice'
import { attachSaveCapture } from './capture'
import { show as showSavePrompt } from './save-prompt'
import { dataOr } from '../shared/ipc'
import type { IpcResult } from '../shared/ipc'
import type { BackgroundToContentMessage } from '../shared/messages'
import type { Entry, EntrySaveMeta } from '../shared/types'

const isTopFrame = window.self === window.top

// The popup injects this script on demand into tabs the user never granted,
// which can land on a frame that already has it. Second runs would stack a
// duplicate focus listener and a duplicate message handler.
const marker = '__buddyContentLoaded'
const loaded = globalThis as typeof globalThis & { [marker]?: true }
const alreadyLoaded = loaded[marker] === true
loaded[marker] = true

async function main(): Promise<void> {
  // Subframes run a lean profile: picker, probe answers, and fill delivery
  // only. Save prompts and capture are top-frame concerns — a prompt bar
  // inside a payment iframe would be clipped to nothing, and observers in
  // every ad frame are pure cost. The background enforces the same split;
  // this just avoids pointless round trips.
  if (isTopFrame) {
    attachSaveCapture()

    // Resume a pending fill (multi-page login or desktop-initiated token).
    // Resumes are unanchored by nature: the request names what this page can
    // take, and fill() still only proceeds when one form is unambiguous.
    if (await resumePendingFill()) return

    const save = dataOr(await send<IpcResult<EntrySaveMeta | null>>({ type: 'GET_PENDING_SAVE' }), null)
    if (save) showSavePrompt(save)
  }

  // Per-origin, and failing closed: an unreachable background means no
  // dropdown rather than one the user has switched off on this site.
  if (dataOr(await send<IpcResult<boolean>>({ type: 'GET_PICKER_POLICY' }), false)) {
    attachPickerOnFocus()
  }
}

// Asks only for what this document could actually place. A page with nothing
// fillable never reaches the vault at all.
async function resumePendingFill(): Promise<boolean> {
  const offers = pageOffers(classifyPage())
  if (!offers.length) return false

  const entry = dataOr(await send<IpcResult<Entry | null>>({ type: 'GET_PENDING_FILL', offers, reason: 'load' }), null)
  if (!entry) return false

  await runFill(entry, null)
  return true
}

// fill() reports UPDATE_SESSION itself; we only keep watching for fields
// that appear later on the same page (revealed inputs, AJAX steps)
async function runFill(entry: Entry, anchor: Element | null): Promise<void> {
  const filled = await fill(entry, anchor)
  if (filled.length) watchForFields()
}

// One watcher per page: a new fill (e.g. popup pick over an existing
// session) replaces the previous observer instead of stacking alongside it
let stopWatching: (() => void) | null = null

// Watch for "revealed" or dynamically inserted fields that appear after a
// partial fill. Nothing from the previous fill is kept: when the page's set of
// fillable controls changes, we re-ask for the fields the new shape can take
// and the background decides whether anything is still owed. That costs a
// round trip per reveal and means no credential outlives the fill that used it.
//
// The signature check keeps the observer cheap: it only acts when the set of
// controls actually changes, not on every class or style mutation.
function watchForFields(): void {
  stopWatching?.()

  let timer: ReturnType<typeof setTimeout> | null = null
  let lastSignature = controlSignature()

  function controlSignature(): string {
    return visibleControls().map(el => `${el.type}:${el.name}:${el.id}`).join('|')
  }

  const observer = new MutationObserver(() => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(async () => {
      timer = null

      const signature = controlSignature()
      if (signature === lastSignature) return
      lastSignature = signature

      const offers = pageOffers(classifyPage())
      if (!offers.length) return

      // Unanchored on purpose: the field the user picked from may be gone
      // (an AJAX step replaced the form), so the unique-form rule decides.
      // Same document, so this spends nothing from the session's page budget.
      const entry = dataOr(await send<IpcResult<Entry | null>>({ type: 'GET_PENDING_FILL', offers, reason: 'reveal' }), null)
      if (entry) await fill(entry, null)
    }, 250)
  })

  const stop = () => {
    observer.disconnect()
    if (timer !== null) clearTimeout(timer)
    if (stopWatching === stop) stopWatching = null
  }
  stopWatching = stop

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'type'],
  })
}

if (!alreadyLoaded) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => main().catch(console.error))
  } else {
    main().catch(console.error)
  }
}

// FILL_READY arrives only in the frame the background chose, carrying only
// that frame's slice, so there is no "may I fill?" question left to answer
// here. FILL_PROBE is payload-free and reaches every frame: a frame answers
// with what it could take, and the background decides who hears back.
if (!alreadyLoaded) chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage, _sender, sendResponse) => {
  if (message.type === 'OPEN_PICKER') {
    openArmedPicker()
    return false
  }

  if (message.type === 'FILL_PROBE') {
    const offers = pageOffers(classifyPage(), message.lane)
    if (offers.length) send({ type: 'FILL_OFFER', probeId: message.probeId, slice: offers })
    return false
  }

  if (message.type === 'FILL_READY') {
    runFill(message.entry, takeAnchor()).then(() => sendResponse({}))
    return true
  }
})
