import type { BackgroundMessage } from '../shared/messages'

export async function send<T = unknown>(msg: BackgroundMessage): Promise<T | undefined> {
  try {
    return await chrome.runtime.sendMessage(msg)
  } catch {
    return undefined
  }
}
