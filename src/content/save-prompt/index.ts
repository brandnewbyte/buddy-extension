import { send } from '../bridge'
import type { EntrySaveMeta, Vault } from '../../shared/types'
import type { IpcResult } from '../../shared/ipc'
import { t } from '../../shared/i18n'
import { dataOr } from '../../shared/ipc'
import type { OpenVaults } from '../../shared/messages'
import { scrapeIcon } from '../icon'
import promptStyles from '../../assets/main.css?inline'
import { pageIndependentCss, resetHostStyle } from '../shadow'

const AUTO_HIDE_MS = 8000

let shadowHost: HTMLDivElement | null = null
let shadowRoot: ShadowRoot | null = null
let autoHideTimer: ReturnType<typeof setTimeout> | null = null

export function show(data: EntrySaveMeta): void {
  const root = ensureShadowRoot()

  const host = (() => { try { return new URL(data.url).host } catch { return data.url } })()

  const bar = document.createElement('div')
  bar.className = 'flex items-center gap-3 w-full px-4 py-2.5 bg-primary-600 text-white font-semibold text-sm font-sans'

  const label = document.createElement('span')
  label.className = 'flex-1 truncate'
  label.textContent = data.kind === 'update'
    ? t('updatePasswordFor', [data.title || host, data.username])
    : t('saveLoginFor', [data.title || host, data.username])

  // Destination. Always shown once known: saving into an unseen vault is the
  // failure mode this exists to prevent, and "there was only one" is something
  // the user has to be told rather than left to infer. Solid inset fill over
  // the bar's own blue, so it reads as a control and not as more label text.
  const destination = document.createElement('div')
  destination.className = 'flex items-center gap-1.5 shrink-0 min-w-0 max-w-40 px-1.5 py-1 rounded-md '
    + 'bg-primary-800 ring-1 ring-inset ring-white/30'
  destination.hidden = true

  const swatch = document.createElement('span')
  swatch.className = 'w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-white/30'

  // Opaque rather than transparent: the native option list inherits this
  // background, and on a transparent select that renders white on white.
  const vaultSelect = document.createElement('select')
  vaultSelect.className = 'min-w-0 bg-primary-800 text-white text-xs cursor-pointer [color-scheme:dark]'
  vaultSelect.title = t('saveTo')
  vaultSelect.setAttribute('aria-label', t('saveTo'))
  vaultSelect.hidden = true

  const vaultLabel = document.createElement('span')
  vaultLabel.className = 'min-w-0 truncate text-white text-xs'
  vaultLabel.title = t('saveTo')
  vaultLabel.hidden = true

  destination.append(swatch, vaultSelect, vaultLabel)

  const btnSave = document.createElement('button')
  btnSave.className = 'shrink-0 px-3 py-1 rounded-md bg-white text-blue-600 text-xs font-semibold hover:bg-blue-50 cursor-pointer disabled:opacity-50'
  btnSave.textContent = t('save')
  // Held until we know whether there's a destination to choose — an early
  // click would otherwise silently save into whatever vault the desktop has
  // focused, before the picker had a chance to appear.
  btnSave.disabled = true

  // Whatever the bar ends up naming is what travels with the confirmation.
  // Leaving it unset falls back to the desktop's focused vault, which can
  // disagree with the vault on screen.
  let destinationId: string | undefined

  const paint = (vault: Vault | undefined) => {
    if (!vault) return
    destinationId = vault.id
    swatch.style.background = `#${vault.color}`
  }

  void (async () => {
    const targets = dataOr(await send<IpcResult<OpenVaults>>({ type: 'GET_OPEN_VAULTS' }), null)
    btnSave.disabled = false
    if (!targets) return

    // An update belongs to its entry's vault, so it has one candidate and no
    // decision. A new save may go anywhere currently open.
    const choices = data.kind === 'update'
      ? targets.vaults.filter(v => v.id === data.vaultId)
      : targets.vaults

    if (!choices.length) return

    if (choices.length === 1) {
      paint(choices[0])
      vaultLabel.textContent = choices[0].name
      vaultLabel.hidden = false
    } else {
      for (const vault of choices) {
        const option = document.createElement('option')
        option.value = vault.id
        option.textContent = vault.name
        option.selected = vault.id === targets.lastSaveVaultId
        vaultSelect.appendChild(option)
      }
      paint(choices.find(v => v.id === vaultSelect.value) ?? choices[0])
      vaultSelect.addEventListener('change', () =>
        paint(choices.find(v => v.id === vaultSelect.value)))
      vaultSelect.hidden = false
    }

    destination.hidden = false
  })()

  const btnDismiss = document.createElement('button')
  btnDismiss.className = 'shrink-0 px-3 py-1 rounded-md text-white/70 text-xs hover:text-white cursor-pointer'
  btnDismiss.textContent = t('notNow')

  bar.append(label, destination, btnSave, btnDismiss)
  root.appendChild(bar)

  btnSave.addEventListener('click', async () => {
    if (autoHideTimer !== null) { clearTimeout(autoHideTimer); autoHideTimer = null }
    btnSave.disabled = true

    // By reference: the background holds the captured credential and sends it
    // to the desktop itself — only the destination choice travels from here.
    const result = await send<IpcResult<{ id: string, vaultId: string }>>({
      type: 'CONFIRM_SAVE',
      // Unset only when no vault was resolved at all — the desktop then uses
      // its focused vault, which is where new entries go there too.
      vaultId: destinationId,
    })

    if (result?.ok) {
      scrapeIcon(result.data.id, result.data.vaultId)
      hide()
      return
    }

    // Leave the bar up (no auto-hide) so the user actually sees the failure
    // instead of it vanishing on its own — e.g. they need to unlock the vault
    // and hit Save again.
    btnSave.disabled = false
    label.textContent = result?.code === 'VAULT_LOCKED'
      ? `${t('vaultLocked')} — ${t('openToUnlock')}`
      : t('saveFailed')
  })

  btnDismiss.addEventListener('click', () => {
    send({ type: 'DISMISS_SAVE' })
    hide()
  })

  // Auto-hide is a snooze: the bar had its chance and won't reappear on the
  // next page, but the candidate survives in the popup until it expires.
  autoHideTimer = setTimeout(() => {
    send({ type: 'SNOOZE_SAVE' })
    hide()
  }, AUTO_HIDE_MS)
}

export function hide(): void {
  if (autoHideTimer !== null) { clearTimeout(autoHideTimer); autoHideTimer = null }
  shadowHost?.remove()
  shadowHost = null
  shadowRoot = null
}

function ensureShadowRoot(): ShadowRoot {
  if (shadowRoot) return shadowRoot

  shadowHost = document.createElement('div')
  resetHostStyle(shadowHost, {
    position: 'fixed', top: '0', left: '0', right: '0', 'z-index': '2147483647',
  })
  document.body.appendChild(shadowHost)

  shadowRoot = shadowHost.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = pageIndependentCss(promptStyles)
  shadowRoot.appendChild(style)

  return shadowRoot
}
