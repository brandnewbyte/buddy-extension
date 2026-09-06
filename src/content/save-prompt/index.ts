import { send } from '../bridge'
import type { EntrySaveMeta, Vault } from '../../shared/types'
import type { IpcResult } from '../../shared/ipc'
import { t } from '../../shared/i18n'
import { dataOr } from '../../shared/ipc'
import type { OpenVaults } from '../../shared/messages'
import { scrapeIcon } from '../icon'
import promptStyles from '../../assets/main.css?inline'
import { pageIndependentCss, resetHostStyle } from '../shadow'
import { svgNode } from '../../shared/svg'
import { BUDDY_MARK } from '../../shared/mark'

// Long enough to notice, read and decide. The count only runs while the prompt
// is being ignored: pointer or focus inside holds it open indefinitely.
const AUTO_HIDE_MS = 20000

let shadowHost: HTMLDivElement | null = null
let shadowRoot: ShadowRoot | null = null
let autoHideTimer: ReturnType<typeof setTimeout> | null = null

function stopAutoHide(): void {
  if (autoHideTimer !== null) { clearTimeout(autoHideTimer); autoHideTimer = null }
}

// Auto-hide is a snooze: the prompt had its chance and won't reappear on the
// next page, but the candidate survives in the popup until it expires.
function startAutoHide(): void {
  stopAutoHide()
  autoHideTimer = setTimeout(() => {
    send({ type: 'SNOOZE_SAVE' })
    hide()
  }, AUTO_HIDE_MS)
}

export function show(data: EntrySaveMeta): void {
  const root = ensureShadowRoot()

  const host = (() => { try { return new URL(data.url).host } catch { return data.url } })()

  const card = document.createElement('div')
  card.className = 'flex flex-col gap-2.5 w-80 max-w-[90vw] p-3 rounded-xl shadow-2xl '
    + 'bg-primary-600 text-white font-sans'

  // Brand and question share a line. Each is thin on its own, and a card this
  // small cannot afford a row that carries one short phrase.
  const header = document.createElement('div')
  header.className = 'flex items-center gap-2'

  // Says who is asking. This is a credential prompt drawn over someone else's
  // page: unmarked, it is shaped like something the page itself could have
  // drawn, and a user running two managers cannot tell which one wants their
  // password. The mark carries that alone — it is the same shape onboarding
  // teaches people to look for in a login field, so it needs no wordmark to
  // be recognised, and the row is worth more spent on the question.
  //
  // Tinted rather than white: the mark knocks its lock out in #fff, so a white
  // shield would swallow it.
  const mark = document.createElement('span')
  mark.className = 'block shrink-0 w-4 h-4 text-primary-300'
  mark.appendChild(svgNode(BUDDY_MARK))

  // The question alone, at the card's largest size. What is being saved sits
  // below in its own hierarchy — one bold run-on sentence emphasises nothing.
  const question = document.createElement('p')
  question.className = 'min-w-0 truncate text-sm font-semibold'
  question.textContent = data.kind === 'update' ? t('updatePassword') : t('saveNewLogin')

  // Two lines, as in the popup: the account is what's being saved, and the
  // site is context for it. The destination goes on the action row, where it
  // has a whole side to itself.
  const detail = document.createElement('div')
  detail.className = 'rounded-lg bg-primary-800 ring-1 ring-inset ring-white/15 px-2.5 py-2'

  const account = document.createElement('p')
  account.className = 'text-sm text-white truncate'
  account.textContent = data.username

  const site = document.createElement('p')
  site.className = 'mt-0.5 text-[11px] text-white/70 truncate'
  site.textContent = data.title || host

  // Destination. Always shown once known: saving into an unseen vault is the
  // failure mode this exists to prevent, and "there was only one" is something
  // the user has to be told rather than left to infer. Solid inset fill over
  // the card's own blue, so it reads as a control and not as more label text.
  const destination = document.createElement('div')
  destination.className = 'flex items-center gap-1.5 mr-auto min-w-0 max-w-40 px-1.5 py-1 rounded-md '
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

  // Whatever the card ends up naming is what travels with the confirmation.
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

  const actions = document.createElement('div')
  actions.className = 'flex items-center justify-end gap-2'
  actions.append(destination, btnSave, btnDismiss)

  header.append(mark, question)
  detail.append(account, site)
  card.append(header, detail, actions)
  root.appendChild(card)

  // Set once the prompt has earned a permanent stay — a failed save has to be
  // read, so no later pointer or focus change may restart the countdown.
  let pinned = false

  btnSave.addEventListener('click', async () => {
    stopAutoHide()
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

    // Leave the prompt up (no auto-hide) so the user actually sees the failure
    // instead of it vanishing on its own — e.g. they need to unlock the vault
    // and hit Save again.
    pinned = true
    btnSave.disabled = false
    question.className = 'min-w-0 text-sm font-semibold text-amber-200 break-words'
    question.textContent = result?.code === 'VAULT_LOCKED'
      ? `${t('vaultLocked')} — ${t('openToUnlock')}`
      : t('saveFailed')
  })

  btnDismiss.addEventListener('click', () => {
    send({ type: 'DISMISS_SAVE' })
    hide()
  })

  // Hovering or focusing holds the prompt open. The vault picker is why this
  // matters most: its native option list can stay open past the whole timeout,
  // so without a hold the prompt could vanish mid-choice. Focus is tracked
  // alongside the pointer because that list draws outside the card, and the
  // pointer leaving it should not start the count while the select still holds
  // focus.
  let hovering = false
  let focused = false
  const release = () => { if (!pinned && !hovering && !focused) startAutoHide() }
  card.addEventListener('pointerenter', () => { hovering = true; stopAutoHide() })
  card.addEventListener('pointerleave', () => { hovering = false; release() })
  card.addEventListener('focusin', () => { focused = true; stopAutoHide() })
  card.addEventListener('focusout', () => { focused = false; release() })

  startAutoHide()
}

export function hide(): void {
  stopAutoHide()
  shadowHost?.remove()
  shadowHost = null
  shadowRoot = null
}

function ensureShadowRoot(): ShadowRoot {
  if (shadowRoot) return shadowRoot

  shadowHost = document.createElement('div')
  resetHostStyle(shadowHost, {
    position: 'fixed', top: '16px', right: '16px', 'z-index': '2147483647',
  })
  document.body.appendChild(shadowHost)

  shadowRoot = shadowHost.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = pageIndependentCss(promptStyles)
  shadowRoot.appendChild(style)

  return shadowRoot
}
