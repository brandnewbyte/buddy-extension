// Thin wrapper over chrome.i18n so UI code stays terse and falls back to the
// key name if a message is missing (visible in dev instead of blank text).
export function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key
}
