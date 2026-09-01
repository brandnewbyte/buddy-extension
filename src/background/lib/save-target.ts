// Remembers which vault the user last saved into, so a multi-vault user isn't
// re-picking on every save. Session-scoped on purpose: it mirrors the desktop's
// open set, which is itself ephemeral, so it can't outlive the vaults it names.
const KEY = 'lastSaveVaultId'

export async function get(): Promise<string | null> {
  const stored = await chrome.storage.session.get(KEY)
  return stored?.[KEY] ?? null
}

export async function set(vaultId: string | undefined): Promise<void> {
  if (!vaultId) return
  await chrome.storage.session.set({ [KEY]: vaultId })
}
