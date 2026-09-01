import { hasHostAccess } from '../lib/host-access'
import { activeTab, originOf } from '../lib/tabs'
import * as pausedOrigins from '../lib/paused-origins'
import type { IpcResult } from '../../shared/ipc'
import type { SetOriginPausedMessage, SiteSettings } from '../../shared/messages'

export async function get(): Promise<IpcResult<SiteSettings>> {
  const tab = await activeTab()
  return {
    ok: true,
    data: {
      hasHostAccess: await hasHostAccess(),
      pausedOrigins: await pausedOrigins.pausedOrigins(),
      activeOrigin: originOf(tab?.url),
    },
  }
}

// The origin is taken from the browser-attested active tab when the caller
// doesn't name one, so the popup never has to send an origin it read itself.
export async function set(message: SetOriginPausedMessage): Promise<IpcResult<void>> {
  const origin = message.origin ?? originOf((await activeTab())?.url)
  if (!origin) return { ok: false, code: 'BAD_REQUEST' }

  await (message.paused ? pausedOrigins.pause(origin) : pausedOrigins.resume(origin))
  return { ok: true, data: undefined }
}

// A frame asking whether it may show the picker. The frame's origin comes from
// the sender, never from the message.
export async function pickerPolicy(sender: chrome.runtime.MessageSender): Promise<IpcResult<boolean>> {
  const origin = originOf(sender.url)
  if (!origin) return { ok: true, data: false }
  return { ok: true, data: !(await pausedOrigins.isPaused(origin)) }
}
