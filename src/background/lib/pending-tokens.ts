const key = (tabId: number) => `pending:${tabId}`

export const pendingTokens = {
  set: (tabId: number, token: string) => chrome.storage.session.set({ [key(tabId)]: token }),

  get: async (tabId: number): Promise<string | undefined> => {
    const result = await chrome.storage.session.get(key(tabId))
    return result[key(tabId)] as string | undefined
  },
  
  delete: (tabId: number) => chrome.storage.session.remove(key(tabId)),
}
