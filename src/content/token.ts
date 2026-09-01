// Desktop-initiated fills arrive as a URL fragment. This runs at
// document_start, before any of the page's own scripts, and takes the token
// out of the URL immediately: the page never gets to read it, and a fragment
// the page routes on is never left in a shape it would misparse.
//
// A fragment is never sent to a server, so unlike the query parameter it
// replaces, the token does not reach the network even before this runs. That
// is what lets the extension drop both the declarativeNetRequest rule that
// used to strip it and the webNavigation permission that used to watch for it.

import { stripFillToken } from './fill-token'

const found = stripFillToken(location.hash)
if (found) {
  history.replaceState(null, '', `${location.pathname}${location.search}${found.hash}`)
  void chrome.runtime.sendMessage({ type: 'CLAIM_FILL_TOKEN', token: found.token })
}
