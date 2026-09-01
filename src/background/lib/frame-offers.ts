// Frame discovery for unanchored fills.
//
// An anchored fill already knows its frame: the browser attested it on the
// message the picker sent. A popup fill does not, so instead of broadcasting
// the credential and letting frames decide, we broadcast a payload-free probe,
// collect what each frame says it can take, and deliver only to the frames
// that answered — each one only its own slice.

import { isFieldType, type FieldType } from '../../shared/contracts/fields'
import { LIMITS } from '../../shared/contracts/limits'
import { originOf } from './tabs'
import type { FillOfferMessage } from '../../shared/messages'

export interface FrameOffer {
  frameId: number
  origin: string | null
  /** Top frame, or same-origin with it: the rule login lookups already use. */
  trusted: boolean
  slice: FieldType[]
}

// Long enough for every frame on a loaded page to classify and answer, short
// enough to sit inside a click. Frames that answer later are ignored, which
// costs a fill nobody was shown rather than a credential going somewhere.
const COLLECT_MS = 150

const inflight = new Map<string, FrameOffer[]>()

/** A content script's answer. The slice is untrusted input and is validated here. */
export function record(message: FillOfferMessage, sender: chrome.runtime.MessageSender): void {
  const collected = inflight.get(message.probeId)
  if (!collected || !Array.isArray(message.slice)) return

  const frameId = sender.frameId
  if (!Number.isInteger(frameId)) return

  const slice = [...new Set(message.slice.filter(isFieldType))]
  if (!slice.length || slice.length > LIMITS.entryFields) return
  if (collected.some(offer => offer.frameId === frameId)) return

  const origin = originOf(sender.url)
  collected.push({
    frameId: frameId!,
    origin,
    trusted: frameId === 0 || (origin !== null && origin === originOf(sender.tab?.url)),
    slice,
  })
}

export async function probe(tabId: number, lane: 'login' | 'card' | 'address'): Promise<FrameOffer[]> {
  const probeId = crypto.randomUUID()
  const collected: FrameOffer[] = []
  inflight.set(probeId, collected)

  try {
    // Reaches every frame. Frames answer with their own FILL_OFFER rather than
    // through this channel, which only carries the first responder's reply.
    void chrome.tabs.sendMessage(tabId, { type: 'FILL_PROBE', probeId, lane }).catch(() => {})
    await new Promise(resolve => setTimeout(resolve, COLLECT_MS))
    return [...collected]
  } finally {
    inflight.delete(probeId)
  }
}
