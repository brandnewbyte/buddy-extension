<template>
  <!-- Chrome caps a popup at 600px and scrolls the whole thing past that,
       which puts the pending save below the fold. Clamping here and letting
       only the match list shrink keeps the header, vault status, save offer
       and footer on screen no matter how many entries the page has. -->
  <div class="w-72 max-h-[580px] flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white font-sans select-none" v-if="res">

    <!-- Header -->
    <div class="shrink-0 flex items-start gap-2.5 px-3 py-2.5 bg-zinc-50 border-b border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800">
      <!-- Top-aligned to the title, not centred on the whole text stack: the
           mark reads as belonging to "Buddy" rather than floating beside it.
           The shield is inset in its own viewBox, so it optically settles onto
           the title's cap height without a nudge. -->
      <img :src="logo" alt="" class="w-7 h-7 object-contain shrink-0" />
      <div class="min-w-0">
        <p class="text-sm font-semibold leading-none text-zinc-900 dark:text-white">Buddy</p>
        <p class="text-xs text-zinc-500 dark:text-zinc-300 mt-0.5">{{ t('popupSubtitle') }}</p>
      </div>
    </div>

    <!-- Version mismatch: the desktop refused our protocol version -->
    <div v-if="mismatch" class="shrink-0 px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
      <p class="text-xs text-zinc-600 dark:text-zinc-300">
        {{ t('versionMismatch') }}
      </p>
    </div>

    <!-- Desktop app never installed: the extension has no vault of its own,
         so the only useful thing this popup can do is say where to get one -->
    <div v-else-if="notInstalled" class="shrink-0 px-3 py-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
      <p class="text-sm text-zinc-900 dark:text-zinc-100">{{ t('notInstalled') }}</p>
      <p class="text-xs text-zinc-500 dark:text-zinc-300">{{ t('notInstalledHint') }}</p>
      <button
        class="w-full text-xs px-3 py-1.5 rounded-md bg-primary-500 hover:bg-primary-450 text-white transition-colors cursor-pointer"
        @click="openWebsite"
      >{{ t('getBuddy') }}</button>
    </div>

    <!-- Not paired: waiting on desktop approval, or offer a manual Connect -->
    <div v-else-if="needsPairing" class="shrink-0 px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
      <p v-if="pairState === 'pairing'" class="text-xs text-zinc-600 dark:text-zinc-300">
        {{ t('pairWaiting') }}
      </p>
      <div v-else class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-600 shrink-0" />
          <span class="text-sm text-zinc-600 dark:text-zinc-300 truncate">{{ t('pairNeeded') }}</span>
        </div>
        <button
          class="shrink-0 text-xs px-2.5 py-1 rounded-md bg-zinc-200 hover:bg-zinc-300 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
          @click="connect"
        >{{ t('connect') }}</button>
      </div>
    </div>

    <!-- Row 1: Vault status -->
    <VaultStatus v-else class="shrink-0" :running="running" :vaults="ctx?.vaults ?? []" />

    <!-- Row 2: Page context. The only shrinkable child, so the fill list is
         where the scrollbar lands. basis stays auto: `flex-1` is `1 1 0%`,
         which collapses this to nothing inside an auto-height column. -->
    <div
      v-if="ctx"
      class="min-h-0 overflow-y-auto overscroll-contain px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900
             [scrollbar-width:thin] [scrollbar-color:#d4d4d8_transparent] dark:[scrollbar-color:#3f3f46_transparent]"
    >

      <!-- Entry list -->
      <template v-if="ctx.searchResults.length">
        <p class="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1.5 truncate">{{ hostname(activeTabUrl) }}</p>
        <div class="space-y-1">
          <button
            v-for="entry in ctx.searchResults"
            :key="entryKey(entry)"
            class="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white hover:bg-zinc-100 ring-1 ring-black/5 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:ring-white/5 transition-colors group text-left cursor-pointer"
            @click="fillEntry(entry)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <!-- Which vault this came from. Only shown with more than one
                   open, so a single-vault user sees no extra chrome. -->
              <span
                v-if="multiOpen"
                class="w-1 h-7 rounded-sm shrink-0"
                :style="`background: #${vaultColor(entry.vaultId)}`"
                :title="vaultName(entry.vaultId)"
              />
              <div class="min-w-0">
                <p class="text-[13px] text-zinc-900 dark:text-zinc-100 truncate leading-none">{{ loginPrimary(entry) }}</p>
                <!-- Site and section are context for the account above. The
                     section name is what separates two logins on one entry;
                     without it duplicate rows are indistinguishable. -->
                <p v-if="loginSecondary(entry)" class="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                  {{ loginSecondary(entry) }}
                </p>
              </div>
            </div>
            <span class="text-xs shrink-0 transition-colors"
              :class="fillStatus[entryKey(entry)] === 'done'
                ? 'text-emerald-600 dark:text-emerald-400'
                : fillStatus[entryKey(entry)] === 'filling'
                  ? 'text-zinc-500 dark:text-zinc-400'
                  : 'text-primary-600 group-hover:text-primary-700 dark:text-primary-300 dark:group-hover:text-primary-200'"
            >
              {{ fillStatus[entryKey(entry)] === 'done' ? '✓' : fillStatus[entryKey(entry)] === 'filling' ? '…' : t('fill') + ' →' }}
            </span>
          </button>
        </div>
      </template>

      <!-- No match -->
      <template v-else-if="!ctx.searchResults.length">
        <p class="text-xs text-zinc-500 dark:text-zinc-400 text-center py-1">{{ t('noLogins') }}</p>
      </template>

      <!-- Cards and addresses: offered by capability, not URL. This is also
           the only fill path into payment-provider iframes too small to host
           the in-page picker. -->
      <template v-for="group in capabilityGroups" :key="group.capability">
        <template v-if="group.entries.length">
          <p class="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2.5 mb-1.5">{{ group.label }}</p>
          <div class="space-y-1">
            <button
              v-for="entry in group.entries"
              :key="entryKey(entry)"
              class="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white hover:bg-zinc-100 ring-1 ring-black/5 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:ring-white/5 transition-colors group text-left cursor-pointer"
              @click="fillCapability(entry, group.capability)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span
                  v-if="multiOpen"
                  class="w-1 h-7 rounded-sm shrink-0"
                  :style="`background: #${vaultColor(entry.vaultId)}`"
                  :title="vaultName(entry.vaultId)"
                />
                <div class="min-w-0">
                  <p class="text-[13px] text-zinc-900 dark:text-zinc-100 truncate leading-none">{{ entry.title }}</p>
                  <p v-if="entry.subtitle || entry.sectionName" class="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                    {{ [entry.subtitle, entry.sectionName].filter(Boolean).join(' · ') }}
                  </p>
                </div>
              </div>
              <span class="text-xs shrink-0 transition-colors"
                :class="fillStatus[entryKey(entry)] === 'done'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : fillStatus[entryKey(entry)] === 'filling'
                    ? 'text-zinc-500 dark:text-zinc-400'
                    : 'text-primary-600 group-hover:text-primary-700 dark:text-primary-300 dark:group-hover:text-primary-200'"
              >
                {{ fillStatus[entryKey(entry)] === 'done' ? '✓' : fillStatus[entryKey(entry)] === 'filling' ? '…' : t('fill') + ' →' }}
              </span>
            </button>
          </div>
        </template>
      </template>

    </div>

    <!-- Everything with something to act on stays pinned below the list. The
         scroller's own bottom padding supplies the gap, so these carry none. -->
    <div
      v-if="ctx && (fillProblem || ctx.fillActive || ctx.pendingSave)"
      class="shrink-0 px-3 py-2.5 space-y-2.5 bg-white border-t border-zinc-200 dark:bg-zinc-950 dark:border-transparent"
    >

      <!-- Why a fill did nothing. Sits directly under the list it belongs to. -->
      <p v-if="fillProblem" class="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
        {{ fillProblem }}
      </p>

      <!-- Active autofill session -->
      <div v-if="ctx.fillActive" class="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-0 px-2.5 py-1.5">
        <p class="text-xs text-zinc-600 dark:text-zinc-300">{{ t('fillActive') }}</p>
        <button
          class="shrink-0 text-xs px-2.5 py-1 rounded-md bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
          @click="cancelFill"
        >{{ t('cancel') }}</button>
      </div>

      <!-- Pending save -->
      <div v-if="ctx.pendingSave">
        <p class="text-[11px] text-zinc-600 dark:text-zinc-300 mb-1.5">
          {{ ctx.pendingSave.kind === 'update' ? t('updatePassword') : t('saveNewLogin') }}
        </p>
        <!-- Two lines, not three: the account is what's being saved, and the
             site and destination are both context for it. -->
        <div class="rounded-lg bg-zinc-50 ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-0 px-2.5 py-2 mb-2.5">
          <p class="text-sm text-zinc-900 dark:text-zinc-100 truncate">{{ ctx.pendingSave.username }}</p>

          <div class="flex items-center gap-2 mt-1 min-w-0">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-300 truncate">
              {{ ctx.pendingSave.title || hostname(ctx.pendingSave.url) }}
            </p>

            <!-- Destination. Always shown, because "which vault did that go
                 to" is not a question the user should have to infer. A choice
                 only where one exists: an update belongs to its entry's vault,
                 and a single open vault is not a decision. -->
            <div v-if="saveDestination" class="flex items-center gap-1.5 ml-auto shrink-0 min-w-0">
              <span
                class="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-black/20 dark:ring-white/25"
                :style="`background: #${saveDestination.color}`"
              />
              <select
                v-if="saveIsChoice"
                v-model="saveVaultId"
                :title="t('saveTo')"
                :aria-label="t('saveTo')"
                class="min-w-0 text-[11px] text-zinc-800 dark:text-zinc-100 bg-zinc-200 dark:bg-zinc-700 rounded px-1.5 py-0.5 cursor-pointer"
              >
                <option v-for="vault in openVaults" :key="vault.id" :value="vault.id">{{ vault.name }}</option>
              </select>
              <span v-else class="text-[11px] text-zinc-700 dark:text-zinc-200 truncate" :title="t('saveTo')">
                {{ saveDestination.name }}
              </span>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            class="flex-1 text-xs px-3 py-1.5 rounded-md bg-primary-500 hover:bg-primary-450 text-white transition-colors cursor-pointer"
            @click="confirmSave"
          >{{ t('save') }}</button>
          <button
            class="flex-1 text-xs px-3 py-1.5 rounded-md bg-zinc-200 hover:bg-zinc-300 text-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
            @click="dismissSave"
          >{{ t('dismiss') }}</button>
        </div>
      </div>

    </div>

    <!-- Site controls. Pause is only meaningful where the picker could appear,
         so it stays hidden without the grant or on a restricted page. Settings
         stays put either way: without the grant it is the only route in the UI
         back to the permission prompt, so hiding it strands anyone who declined
         at onboarding. Paused state is shown rather than implied: a toggle whose
         only feedback is its own label leaves you guessing what just happened. -->
    <div class="shrink-0 flex items-center justify-between gap-3 px-3 py-2">
      <button
        v-if="site?.hasHostAccess && site.activeOrigin"
        :class="footerLink"
        @click="togglePause"
      >
        <span
          v-if="pausedHere"
          class="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0"
          aria-hidden="true"
        />
        {{ pausedHere ? t('resumeOnSite') : t('pauseOnSite') }}
      </button>
      <span v-else />
      <button :class="footerLink" @click="openOptions">{{ t('settings') }}</button>
    </div>

  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VaultStatus from './VaultStatus.vue'
import logo from '../assets/logo.svg'
import { t } from '../shared/i18n'
import { isOffline } from '../shared/ipc'
import type { IpcResult, SocketError } from '../shared/ipc'
import type { PopupContext, PairingState, PairingStateChangedMessage, SiteSettings, PageLanes } from '../shared/messages'
import type { EntryMeta, Capability } from '../shared/types'

const res = ref<IpcResult<PopupContext> | null>(null)
const site = ref<SiteSettings | null>(null)

const pausedHere = computed(() =>
  !!site.value?.activeOrigin && site.value.pausedOrigins.includes(site.value.activeOrigin))

async function loadSite() {
  const result = await chrome.runtime.sendMessage({ type: 'GET_SITE_SETTINGS' }) as IpcResult<SiteSettings>
  site.value = result?.ok ? result.data : null
}

// The origin is left to the background, which reads it from the attested
// active tab rather than trusting anything this popup worked out.
async function togglePause() {
  await chrome.runtime.sendMessage({ type: 'SET_ORIGIN_PAUSED', paused: !pausedHere.value })
  await loadSite()
}

function openOptions() {
  chrome.runtime.openOptionsPage()
}

const footerLink = 'flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-800 '
  + 'dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer'
const activeTabUrl = ref('')
const fillStatus = ref<Record<string, 'filling' | 'done'>>({})
const pairState = ref<PairingState>('idle')
const cards = ref<EntryMeta[]>([])
const addresses = ref<EntryMeta[]>([])

// What the page itself says it can take. Cards and addresses have no URL
// evidence behind them, so without this every card in the vault is offered on
// every page. Unprobed origins show everything: an unheard question is not a
// no, and the popup can still inject and fill on demand.
const pageLanes = ref<PageLanes | null>(null)

// Whether that question has come back at all. A null `pageLanes` means the
// probe failed and everything shows, which is the right answer to a failed
// probe and the wrong one to a pending one: the sections arrive from the
// desktop before the page has finished answering, so without this the whole
// card list paints and is then taken away 150ms later on every page with no
// card form. Nothing is shown on an unanswered question.
const lanesAnswered = ref(false)

function laneFillable(capability: Capability): boolean {
  const probed = pageLanes.value
  return !probed?.probed || probed.lanes.includes(capability)
}

const capabilityGroups = computed(() => lanesAnswered.value
  ? [
      { capability: 'card' as Capability, label: t('cards'), entries: cards.value },
      { capability: 'address' as Capability, label: t('addresses'), entries: addresses.value },
    ].filter(group => laneFillable(group.capability))
  : [])

const ctx = computed(() => res.value?.ok ? res.value.data : null)
const running = computed(() => !(res.value && !res.value.ok && isOffline(res.value.code)))
const mismatch = computed(() => res.value && !res.value.ok && res.value.code === 'UNSUPPORTED_VERSION')
const notInstalled = computed(() => res.value && !res.value.ok && res.value.code === 'NOT_INSTALLED')
const needsPairing = computed(() => res.value && !res.value.ok && res.value.code === 'PAIRING_REQUIRED')

function openWebsite() {
  void chrome.tabs.create({ url: 'https://pwbuddy.com' })
}

// Results merge every open vault, so rows need provenance — but only once
// there is more than one open to distinguish between. Sorted by name to match
// the vault rail above, which also makes "the first one" a stable default.
const openVaults = computed(() =>
  (ctx.value?.vaults ?? []).filter(v => !v.locked).sort((a, b) => a.name.localeCompare(b.name)))
const multiOpen = computed(() => openVaults.value.length > 1)

// Destination for the pending save. An update goes to its entry's own vault,
// so only a new save is a choice — and only with somewhere to choose between.
const saveVaultId = ref<string | null>(null)

const saveIsChoice = computed(() =>
  ctx.value?.pendingSave?.kind === 'new' && openVaults.value.length > 1)

const saveDestination = computed(() => {
  const pending = ctx.value?.pendingSave
  if (!pending) return null
  const id = pending.kind === 'update' ? pending.vaultId : saveVaultId.value
  // An update whose vault has since been locked has nothing truthful to show
  return openVaults.value.find(v => v.id === id) ?? null
})

// Colour and name come from the vault list already in context, so the search
// results carry only an id — no duplicated display data on the wire.
const vaultColor = (id?: string) => openVaults.value.find(v => v.id === id)?.color ?? '52525b'
const vaultName = (id?: string) => openVaults.value.find(v => v.id === id)?.name ?? ''

async function refresh() {
  res.value = await chrome.runtime.sendMessage({ type: 'GET_POPUP_CONTEXT' })
  // Preselect the last destination, falling back to the first open vault so
  // the row never renders blank. Already filtered to the open set upstream.
  saveVaultId.value = ctx.value?.lastSaveVaultId ?? openVaults.value[0]?.id ?? null
  if (needsPairing.value) {
    const state: IpcResult<PairingState> = await chrome.runtime.sendMessage({ type: 'GET_PAIRING_STATE' })
    if (state.ok) pairState.value = state.data
  }
  // After the context, not blocking it: cards/addresses render as they arrive
  if (openVaults.value.length) { void loadCapabilitySections(); void loadPageLanes() }
  else { cards.value = []; addresses.value = []; pageLanes.value = null; lanesAnswered.value = false }
}

async function loadPageLanes() {
  const r: IpcResult<PageLanes> | undefined = await chrome.runtime
    .sendMessage({ type: 'GET_PAGE_LANES' }).catch(() => undefined)
  pageLanes.value = r?.ok ? r.data : null
  lanesAnswered.value = true
}

async function loadCapabilitySections() {
  const fetch = async (capability: Capability): Promise<EntryMeta[]> => {
    const r: IpcResult<EntryMeta[]> | undefined = await chrome.runtime
      .sendMessage({ type: 'GET_CAPABILITY_SECTIONS', capability }).catch(() => undefined)
    return r?.ok ? r.data : []
  }
  ;[cards.value, addresses.value] = await Promise.all([fetch('card'), fetch('address')])
}

onMounted(async () => {
  // Stay live against the background's pairing FSM: 'paired' means our
  // PAIRING_REQUIRED context is stale — refetch for the real one.
  chrome.runtime.onMessage.addListener((message: PairingStateChangedMessage) => {
    if (message.type !== 'PAIRING_STATE_CHANGED') return
    pairState.value = message.state
    if (message.state === 'paired') void refresh()
  })
  await Promise.all([refresh(), loadSite()])
})

async function connect() {
  pairState.value = 'pairing'
  const result: IpcResult<void> | undefined =
    await chrome.runtime.sendMessage({ type: 'PAIR_REQUEST' }).catch(() => undefined)
  if (result?.ok) await refresh()
  else {
    const state: IpcResult<PairingState> | undefined =
      await chrome.runtime.sendMessage({ type: 'GET_PAIRING_STATE' }).catch(() => undefined)
    if (state?.ok) pairState.value = state.data
  }
}

// Login rows lead with the account. The site is already established by the
// page you're on, and the title is frequently just its hostname restated, so
// what the user is choosing between is which account — two logins on one site
// otherwise give two rows with identical bold text. A section with no username
// falls back to the title rather than leading with a blank line.
//
// Card and address rows keep their title first: their subtitle is a machine
// detail ("•••• 4242") and the title is the name the user thinks in.
function loginPrimary(entry: EntryMeta): string {
  return entry.username || entry.title
}

function loginSecondary(entry: EntryMeta): string {
  const rest = entry.username ? [entry.title, entry.sectionName] : [entry.sectionName]
  return rest.filter(Boolean).join(' · ')
}

// Ids are unique per vault, not globally, so the pair keys both the list and
// any per-row state — two vaults can hold the same id.
// Identity is the triple: one entry can appear more than once when it holds
// several fillable sections, so the section is what separates the rows.
function entryKey(entry: EntryMeta): string {
  return `${entry.vaultId}:${entry.id}:${entry.sectionId}`
}

// A fill that finds nothing used to leave no trace at all, which reads as the
// button being broken. The reason is short-lived and specific enough to act on.
const fillProblem = ref<string | null>(null)

const FILL_PROBLEMS: Partial<Record<SocketError, string>> = {
  FRAME_REQUIRED: 'fillFramed',
  NO_FILLABLE_FIELD: 'fillNoField',
  MULTIPLE_MATCHES: 'fillAmbiguous',
}

function reportFillProblem(code: SocketError | undefined) {
  const key = code && FILL_PROBLEMS[code]
  fillProblem.value = key ? t(key) : null
  if (fillProblem.value) setTimeout(() => { fillProblem.value = null }, 6000)
}

async function fillEntry(entry: EntryMeta) {
  const key = entryKey(entry)
  fillStatus.value[key] = 'filling'
  fillProblem.value = null
  const result: IpcResult<void> | undefined =
    await chrome.runtime.sendMessage({ type: 'START_FILL', id: entry.id, vaultId: entry.vaultId, sectionId: entry.sectionId }).catch(() => undefined)

  if (result?.ok) {
    fillStatus.value[key] = 'done'
    if (res.value?.ok) res.value.data.fillActive = true
    setTimeout(() => { delete fillStatus.value[key] }, 1500)
  } else {
    delete fillStatus.value[key]
    reportFillProblem(result?.ok === false ? result.code : undefined)
  }
}

async function fillCapability(entry: EntryMeta, capability: Capability) {
  const key = entryKey(entry)
  fillStatus.value[key] = 'filling'
  const result: IpcResult<void> | undefined = await chrome.runtime.sendMessage({
    type: 'START_CAPABILITY_FILL',
    id: entry.id, vaultId: entry.vaultId, sectionId: entry.sectionId, capability,
  }).catch(() => undefined)

  if (result?.ok) {
    fillStatus.value[key] = 'done'
    setTimeout(() => { delete fillStatus.value[key] }, 1500)
  } else {
    delete fillStatus.value[key]
  }
}

async function cancelFill() {
  await chrome.runtime.sendMessage({ type: 'CANCEL_FILL' }).catch(() => {})
  if (res.value?.ok) res.value.data.fillActive = false
}

// By reference: the background holds the captured credential for the active
// tab and only needs the go-ahead. Cleared from the UI only on success — a
// locked vault should leave the offer standing.
//
// The destination travels explicitly whenever one is on screen: omitting it
// falls back to whatever the desktop has focused, which can disagree with the
// vault we just named.
async function confirmSave() {
  if (!ctx.value?.pendingSave) return
  const result: IpcResult<unknown> | undefined = await chrome.runtime
    .sendMessage({ type: 'CONFIRM_SAVE', vaultId: saveDestination.value?.id })
    .catch(() => undefined)
  if (result?.ok && res.value?.ok) res.value.data.pendingSave = null
}

async function dismissSave() {
  await chrome.runtime.sendMessage({ type: 'DISMISS_SAVE' }).catch(() => {})
  if (res.value?.ok) res.value.data.pendingSave = null
}

function hostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}
</script>
