import type { EntryMeta, Vault } from '../../shared/types'
import type { OpenVaults } from '../../shared/messages'
import type { IpcResult } from '../../shared/ipc'
import { dataOr } from '../../shared/ipc'
import { send } from '../bridge'
import { t } from '../../shared/i18n'
import pickerStyles from '../../assets/main.css?inline'
import { pageIndependentCss, resetHostStyle } from '../shadow'

// ─── State ────────────────────────────────────────────────────────────────────

let shadowHost: HTMLDivElement | null = null
let shadowRoot: ShadowRoot | null = null
let cleanup: (() => void) | null = null

// ─── Public API ───────────────────────────────────────────────────────────────

// Open vaults, fetched once per page. Results carry only a vaultId — the
// content script has no vault list otherwise — and this rarely changes mid-page,
// so the first picker pays one round trip and the rest are instant.
let openVaults: Vault[] | null = null

async function loadVaults(): Promise<Vault[]> {
  if (openVaults) return openVaults

  const data = dataOr(await send<IpcResult<OpenVaults>>({ type: 'GET_OPEN_VAULTS' }), null)
  openVaults = data?.vaults ?? []

  return openVaults
}

export function show(
  entries: EntryMeta[],
  anchor: HTMLElement,
  onPick: (entry: EntryMeta) => void,
  onDecline?: () => void,
): void {
  const rows = entries.map(e => buildRow(e, onPick))
  mount(anchor, rows, onDecline)

  // Two entries for the same site in different vaults are otherwise
  // indistinguishable when they share a username. Patched in after mount so the
  // picker still appears instantly; only rendered when there's more than one
  // vault open to tell apart.
  void (async () => {
    const vaults = await loadVaults()
    if (vaults.length < 2) return

    entries.forEach((entry, i) => {
      const vault = vaults.find(v => v.id === entry.vaultId)
      if (!vault) return

      const slot = rows[i]?.querySelector('[data-vault-slot]')
      if (!slot) return

      slot.setAttribute('style', `background: #${vault.color}`)
      slot.setAttribute('title', vault.name)
      slot.classList.remove('hidden')
    })
  })()
}

// Vault is locked: one action row instead of entries
export function showLocked(
  anchor: HTMLElement,
  onOpen: () => void,
  onDecline?: () => void,
): void {
  mount(anchor, [buildNoticeRow(t('vaultLocked'), t('openToUnlock'), onOpen)], onDecline)
}

// Desktop went away, usually between the list being drawn and a row being
// clicked. Silence there reads as the extension being broken, so the picker
// says what happened in the place the user is already looking.
export function showOffline(
  anchor: HTMLElement,
  onOpen: () => void,
  onDecline?: () => void,
): void {
  mount(anchor, [buildNoticeRow(t('notRunning'), t('open'), onOpen)], onDecline)
}

function mount(anchor: HTMLElement, rows: HTMLElement[], onDecline?: () => void): void {
  const root = ensureShadowRoot()
  hide()

  const picker = document.createElement('div')
  picker.id = 'picker'
  picker.className = 'fixed z-[2147483647] flex flex-col font-sans text-sm'
  picker.style.maxWidth = '320px'

  const caret = document.createElement('div')
  caret.className = 'leading-none text-primary-500 dark:text-primary-700 ml-8'
  caret.innerHTML = `<svg width="12" height="7" viewBox="0 0 12 7" fill="currentColor"><path d="M6 0L12 7H0L6 0Z"/></svg>`

  const content = document.createElement('div')
  content.className = 'bg-white dark:bg-zinc-900 border border-primary-500 dark:border-primary-700 border-solid rounded-lg overflow-hidden'

  content.appendChild(buildHeader())
  for (const row of rows) {
    content.appendChild(row)
  }

  picker.append(caret, content)
  root.appendChild(picker)

  positionPicker(picker, anchor)
  attachListeners(picker, anchor, onDecline)
}

export function hide(): void {
  shadowRoot?.getElementById('picker')?.remove()
  cleanup?.()
  cleanup = null
}

// ─── Positioning ──────────────────────────────────────────────────────────────

function positionPicker(picker: HTMLElement, anchor: HTMLElement): void {
  const { bottom, left, width } = anchor.getBoundingClientRect()
  picker.style.top = `${bottom + 0}px`
  picker.style.left = `${left + 0}px`
  picker.style.minWidth = `${Math.max(width, 230)}px`
}

// ─── DOM builders ─────────────────────────────────────────────────────────────

function buildHeader(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-white uppercase tracking-[.06em] bg-primary-600 select-none'
  el.innerHTML = `
    <svg class="opacity-50 shrink-0" width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M4.5 6V4a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    Autofill with Buddy
  `
  return el
}

function buildRow(entry: EntryMeta, onPick: (entry: EntryMeta) => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'group flex items-center gap-2.5 px-2 py-1.5 cursor-pointer border-b border-gray-50 dark:border-zinc-800 last:border-b-0 hover:bg-blue-100 active:bg-blue-100 dark:hover:bg-zinc-800 dark:active:bg-zinc-800 select-none transition-colors duration-100 z-100'
  row.setAttribute('role', 'option')

  // The avatar carries the vault dot on its corner rather than a separate
  // column — same idiom as the desktop's grid tiles, and it costs no width in
  // a narrow picker.
  const avatarWrap = document.createElement('div')
  avatarWrap.className = 'relative shrink-0'

  const avatar = document.createElement('div')
  avatar.className = 'w-[30px] h-[30px] rounded-[7px] bg-blue-100 text-blue-500 dark:bg-primary-900 dark:text-primary-300 text-[13px] font-bold flex items-center justify-center uppercase'
  avatar.textContent = entry.title.charAt(0)

  // Filled in by show() once the vault list arrives, and only with more than
  // one vault open. A ring rather than a bare swatch: the picker sits on white,
  // so a pale vault colour needs an outline to read at all, and a dark one
  // still reads through it.
  const vaultDot = document.createElement('div')
  vaultDot.className = 'hidden absolute -bottom-[2px] -right-[2px] w-[11px] h-[11px] rounded-full border-2 border-white dark:border-zinc-900 ring-1 ring-black/20 dark:ring-white/25'
  vaultDot.setAttribute('data-vault-slot', '')

  avatarWrap.appendChild(avatar)
  avatarWrap.appendChild(vaultDot)

  const text = document.createElement('div')
  text.className = 'min-w-0 flex flex-col'

  // A login leads with the account: on a login page the site is already
  // established, so what's being chosen between is which account, and two
  // logins on one site would otherwise render as identical bold lines. Card
  // and address rows have no username and keep their title first, since their
  // subtitle is a machine detail ("•••• 4242") and the title is the name the
  // user thinks in.
  //
  // The section name disambiguates two logins on one entry ("Work" vs
  // "Personal"); without it both rows would still read identically.
  const secondary = (entry.username ? [entry.title, entry.sectionName] : [entry.subtitle, entry.sectionName])
    .filter(Boolean).join(' · ')

  const primary = document.createElement('div')
  primary.className = 'font-medium text-gray-900 dark:text-zinc-100 truncate'
  primary.textContent = entry.username || entry.title
  text.appendChild(primary)

  if (secondary) {
    const support = document.createElement('div')
    support.className = 'text-xs text-gray-500 dark:text-zinc-400 truncate'
    support.textContent = secondary
    text.appendChild(support)
  }

  const chevron = document.createElement('div')
  chevron.className = 'shrink-0 ml-auto text-blue-500 dark:text-primary-300 opacity-0 group-hover:opacity-100 transition-opacity duration-100'
  chevron.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`

  row.appendChild(avatarWrap)
  row.appendChild(text)
  row.appendChild(chevron)

  // mousedown keeps the input focused while the pick is handled
  row.addEventListener('mousedown', (e) => {
    e.preventDefault()
    onPick(entry)
    hide()
  })

  return row
}

// The picker's one-row states: nothing to pick, one thing to do about it.
function buildNoticeRow(heading: string, hint: string, onOpen: () => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'group flex items-center gap-2.5 px-2 py-2 cursor-pointer hover:bg-blue-100 active:bg-blue-100 dark:hover:bg-zinc-800 dark:active:bg-zinc-800 select-none transition-colors duration-100'
  row.setAttribute('role', 'option')

  const text = document.createElement('div')
  text.className = 'min-w-0 flex flex-col'

  const title = document.createElement('div')
  title.className = 'font-medium text-gray-900 dark:text-zinc-100 truncate'
  title.textContent = heading
  text.appendChild(title)

  const subtitle = document.createElement('div')
  subtitle.className = 'text-xs text-gray-500 dark:text-zinc-400 truncate'
  subtitle.textContent = hint
  text.appendChild(subtitle)

  row.appendChild(text)

  row.addEventListener('mousedown', (e) => {
    e.preventDefault()
    onOpen()
    hide()
  })

  return row
}

// ─── Shadow root ──────────────────────────────────────────────────────────────

function ensureShadowRoot(): ShadowRoot {
  if (shadowRoot) return shadowRoot

  shadowHost = document.createElement('div')
  resetHostStyle(shadowHost, { position: 'fixed', 'z-index': '2147483647' })
  document.body.appendChild(shadowHost)

  shadowRoot = shadowHost.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = pageIndependentCss(pickerStyles)
  shadowRoot.appendChild(style)

  return shadowRoot
}

// ─── Listeners ────────────────────────────────────────────────────────────────

function attachListeners(picker: HTMLElement, anchor: HTMLElement, onDecline?: () => void): void {
  const onScroll = () => positionPicker(picker, anchor)

  // Clicking elsewhere is navigation, not refusal: it hides, and the picker
  // is still available on the next focus.
  //
  // This only ever sees clicks in *this* frame's document. Where the login
  // form is in an iframe — a bank hosting sign-in on a sibling domain — the
  // rest of the page is a different document entirely and clicking it fires
  // nothing here. That is what onBlur below is for.
  const onMousedown = (e: MouseEvent) => {
    if (shadowHost && e.composedPath().includes(shadowHost)) return
    if (e.composedPath().includes(anchor)) return
    hide()
  }

  // Focus leaving this frame covers everything the mousedown above cannot: a
  // click anywhere in the embedding page, a click into a sibling frame, a tab
  // switch, or leaving the browser. The picker is anchored to a field in this
  // document, so once the user is not in this document it has nothing left to
  // point at.
  const onBlur = () => hide()

  // Escape is refusal, said out loud. It silences the form rather than the box.
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    onDecline?.()
    hide()
  }

  // capture:true on scroll catches events from any scrollable ancestor
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('blur', onBlur)
  document.addEventListener('mousedown', onMousedown, { capture: true })
  document.addEventListener('keydown', onKeydown, { capture: true })

  cleanup = () => {
    window.removeEventListener('scroll', onScroll, { capture: true })
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('mousedown', onMousedown, { capture: true })
    document.removeEventListener('keydown', onKeydown, { capture: true })
  }
}
