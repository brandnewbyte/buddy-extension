import { sendToNative } from '../lib/native'
import type { IpcResult } from '../../shared/ipc'

export async function handle(): Promise<IpcResult<void>> {
  return sendToNative({ type: 'LAUNCH_DESKTOP' })
}
