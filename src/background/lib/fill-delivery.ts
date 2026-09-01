// Delivery is per frame, and each frame receives only the fields it asked for.
import type { Entry, FieldType } from '../../shared/types'

export interface FrameTarget {
  frameId: number
  slice: FieldType[]
}

/**
 * Sends each target its own narrowing of `entry`. A frame that nothing in the
 * released slice matches is skipped rather than sent an empty entry.
 * Returns the frames that were actually sent something.
 */
export async function deliver(tabId: number, targets: FrameTarget[], entry: Entry): Promise<number[]> {
  const delivered: number[] = []

  for (const target of targets) {
    const fields = entry.fields.filter(field => target.slice.includes(field.type))
    if (!fields.length) continue
    delivered.push(target.frameId)
    await chrome.tabs
      .sendMessage(tabId, { type: 'FILL_READY', entry: { ...entry, fields } }, { frameId: target.frameId })
      .catch(() => {})
  }

  return delivered
}
