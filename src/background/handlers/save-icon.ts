import { sendToNative } from '../lib/native'
import type { SaveIconMessage } from '../../shared/messages'

const MAX_ICON_BYTES = 256 * 1024  // 256KB, well under 1MB native msg limit

export async function handle(_tabId: number | undefined, message: SaveIconMessage): Promise<void> {
  const data = await fetchIconAsBase64(message.url)

  if (data) {
    sendToNative({ type: 'SAVE_ENTRY_ICON', id: message.id, vaultId: message.vaultId, data })
  }
}

async function fetchIconAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()

    if (!blob.type.startsWith('image/') || blob.size > MAX_ICON_BYTES) 
      return null

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
