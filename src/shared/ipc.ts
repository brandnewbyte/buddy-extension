// Socket protocol version this extension speaks. Rides on every request so
// the desktop can reject incompatible clients with UNSUPPORTED_VERSION
// instead of misbehaving. Bump only when an additive change is impossible.
export const PROTOCOL_VERSION = 1

// One error union for the whole chain: socket server codes, native host
// codes, and DISCONNECTED synthesized by the extension when the port dies.
// Declared as a runtime allowlist so an unrecognised code on the wire is
// rejected by the envelope check rather than flowing on as a string.
export const SOCKET_ERRORS = [
  'DISCONNECTED',
  // The browser has no native host registered at all: the desktop app was
  // never installed (or was removed), as opposed to just not running.
  'NOT_INSTALLED',
  'GENERIC',
  'BAD_REQUEST',
  'VAULT_LOCKED',
  'NOT_FOUND',
  'SESSION_REQUIRED',
  'PAIRING_REQUIRED',
  'PAIRING_DISMISSED',
  'PAIRING_PENDING',
  'UNSUPPORTED_VERSION',
  'DESKTOP_NOT_RUNNING',
  'DESKTOP_LAUNCHING',
  'WRITE_ERROR',
  'TIMEOUT',
  // The desktop answered, but not in a shape this contract recognises: an
  // unknown key, an oversized value, or a field we never asked for. Always a
  // bug or a tampered channel, never a state the user can resolve.
  'INVALID_RESPONSE',
  // Browser-side, like DISCONNECTED: the only sign-in form on the page is
  // inside a cross-origin frame. A toolbar fill speaks for the tab, so it
  // cannot release into somebody else's frame; picking in the field itself
  // can, because that names the frame and its origin unambiguously.
  'FRAME_REQUIRED',
  // Browser-side: nothing on the page resolved to a field we could fill.
  'NO_FILLABLE_FIELD',
  // Browser-side: more than one form could take this entry and no field was
  // picked, so there is no defensible target.
  'MULTIPLE_MATCHES',
] as const

export type SocketError = (typeof SOCKET_ERRORS)[number]

export function isSocketError(value: unknown): value is SocketError {
  return typeof value === 'string' && (SOCKET_ERRORS as readonly string[]).includes(value)
}

// Envelope for every async IPC response, both native → background and
// background → popup/content. Callers that need the "why" branch on ok;
// callers that don't use dataOr().
export type IpcResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: SocketError }

export function dataOr<T, F>(result: IpcResult<T> | undefined, fallback: F): T | F {
  return result?.ok ? result.data : fallback
}

// Codes meaning "we couldn't talk to the desktop app at all"
const OFFLINE: SocketError[] = [
  'DISCONNECTED',
  'NOT_INSTALLED',
  'DESKTOP_NOT_RUNNING',
  'DESKTOP_LAUNCHING',
  'WRITE_ERROR',
  'TIMEOUT',
]

export function isOffline(code: SocketError): boolean {
  return OFFLINE.includes(code)
}
