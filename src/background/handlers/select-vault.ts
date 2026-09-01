import { sendToNative } from '../lib/native'
import type { SelectVaultMessage } from '../../shared/messages'

export async function handle(message: SelectVaultMessage): Promise<void> {
  await sendToNative({ 
    type: 'SELECT_VAULT', 
    id: message.id 
  })
}
