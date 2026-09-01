import * as autofillSession from '../lib/autofill-session'
import type { UpdateSessionMessage } from '../../shared/messages'

export async function handle(tabId: number | undefined, message: UpdateSessionMessage): Promise<void> {
  if (!tabId) return
  await autofillSession.markFilled(tabId, message.filled)
}
