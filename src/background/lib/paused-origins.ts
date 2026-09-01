// Origins where the user has switched the in-page picker off.
//
// A site whose own autocomplete fights ours, or a page where the dropdown just
// gets in the way, should be silenceable without revoking access or
// uninstalling. Paused origins suppress the picker only: the toolbar popup
// still fills, because the pause is about the page UI rather than about trust.

const KEY = 'paused_origins'
const MAX = 500

export async function pausedOrigins(): Promise<string[]> {
  const stored = await chrome.storage.local.get(KEY)
  const value = stored[KEY]
  return Array.isArray(value) ? value.filter((origin): origin is string => typeof origin === 'string') : []
}

export async function isPaused(origin: string | null): Promise<boolean> {
  if (!origin) return false
  return (await pausedOrigins()).includes(origin)
}

export async function pause(origin: string): Promise<void> {
  const current = await pausedOrigins()
  if (current.includes(origin) || current.length >= MAX) return
  await chrome.storage.local.set({ [KEY]: [...current, origin].sort() })
}

export async function resume(origin: string): Promise<void> {
  const current = await pausedOrigins()
  await chrome.storage.local.set({ [KEY]: current.filter(entry => entry !== origin) })
}
