import { describe, it, expect } from 'vitest'
import { originPathOf, senderFrameUrl } from '../src/background/lib/tabs'

// A framed login belongs to the frame's own origin. These pin the rule that
// makes that safe: the origin comes from the browser-attested sender, never
// from anything a content script said about itself.

const TOP = 'https://cards.barclaycardus.com/'
const FRAME = 'https://www.barclaycardus.com/servicing/login'

describe('originPathOf', () => {
  it('keeps scheme, host and path, and drops query and fragment', () => {
    expect(originPathOf('https://example.com/login?next=/x#top')).toBe('https://example.com/login')
  })

  it('treats a port as part of the host', () => {
    expect(originPathOf('https://example.com:8443/login')).toBe('https://example.com:8443/login')
  })

  it('returns null for anything unparseable or absent', () => {
    expect(originPathOf(undefined)).toBeNull()
    expect(originPathOf('not a url')).toBeNull()
  })
})

describe('senderFrameUrl', () => {
  it('takes a cross-origin frame at its own origin, not its parent’s', () => {
    // The Barclaycard shape: a www. login iframe inside a cards. page. The
    // fill is keyed on the frame, so it can only ever release the credential
    // saved for the frame's own site.
    const sender = { tab: { url: TOP }, frameId: 3, url: FRAME } as chrome.runtime.MessageSender
    expect(senderFrameUrl(sender)).toBe('https://www.barclaycardus.com/servicing/login')
  })

  it('ignores the tab url entirely, so a frame cannot inherit its parent', () => {
    const sender = { tab: { url: TOP }, frameId: 3, url: FRAME } as chrome.runtime.MessageSender
    expect(senderFrameUrl(sender)).not.toContain('cards.barclaycardus.com')
  })

  it('answers for the top frame the same way', () => {
    const sender = { tab: { url: TOP }, frameId: 0, url: TOP } as chrome.runtime.MessageSender
    expect(senderFrameUrl(sender)).toBe('https://cards.barclaycardus.com/')
  })

  it('speaks for no frame when the popup is the sender', () => {
    // The popup acts on the tab, so it has no frame origin to key on and the
    // caller falls back to the top document rather than guessing.
    expect(senderFrameUrl({ url: 'chrome-extension://abc/popup.html' } as chrome.runtime.MessageSender)).toBeNull()
    expect(senderFrameUrl(undefined)).toBeNull()
  })

  it('returns null when the browser reported no url for the frame', () => {
    expect(senderFrameUrl({ tab: { url: TOP }, frameId: 2 } as chrome.runtime.MessageSender)).toBeNull()
  })
})
