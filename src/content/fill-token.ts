// Lifting a desktop-initiated fill token out of a URL fragment.
//
// Kept pure and separate from the content script that calls it so the
// rewriting can be tested directly: this runs on every page load of every
// site, and getting it wrong means breaking a fragment the page routes on.

// 16 random bytes as unpadded URL-safe base64, the shape generate_token mints.
const TOKEN = /([#&])_bftk=([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/

export interface FillTokenInFragment {
  token: string
  /** What the fragment should become, '' when nothing else was in it. */
  hash: string
}

export function stripFillToken(hash: string): FillTokenInFragment | null {
  const match = hash.match(TOKEN)
  if (!match) return null

  // Everything else is restored byte for byte. Our own separator leaves with
  // the token, except a leading '#' which stays only if something follows it.
  const remainder = hash.replace(TOKEN, (_full, separator: string) => separator === '#' ? '#' : '')
  return { token: match[2], hash: remainder === '#' ? '' : remainder }
}
