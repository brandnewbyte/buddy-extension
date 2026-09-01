<template>
  <div class="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">

    <div v-if="!running" class="flex items-center justify-between gap-3 px-3 h-8">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-600 shrink-0" />
        <span class="text-[13px] text-zinc-600 dark:text-zinc-300 truncate">{{ t('notRunning') }}</span>
      </div>
      <button
        class="shrink-0 text-xs px-2.5 py-1 rounded-md bg-zinc-200 hover:bg-zinc-300 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
        @click="openBuddy"
      >{{ t('open') }}</button>
    </div>

    <!-- Two columns: unlocked on the left, locked on the right. Splitting by
         state does the labelling that headers otherwise would, and keeps the
         actionable ones collected in one place. Falls back to a single wrapping
         row when everything is in one state, so a lone column isn't squeezed
         into half the width for nothing. -->
    <div v-else-if="sortedVaults.length" class="px-3 py-2">
      <div v-if="split" class="grid grid-cols-2 gap-x-2 gap-y-1 items-start">
        <div class="flex flex-col gap-1 min-w-0">
          <p class="text-[10px] uppercase tracking-[.06em] text-zinc-500 dark:text-zinc-400 select-none">{{ t('unlocked') }}</p>
          <VaultPill v-for="vault in unlocked" :key="vault.id" :vault="vault" />
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <p class="text-[10px] uppercase tracking-[.06em] text-zinc-500 dark:text-zinc-400 select-none">{{ t('locked') }}</p>
          <VaultPill v-for="vault in locked" :key="vault.id" :vault="vault" @open="selectVault" />
        </div>
      </div>

      <div v-else class="flex flex-col gap-1">
        <VaultPill v-for="vault in sortedVaults" :key="vault.id" :vault="vault" @open="selectVault" />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Vault } from '../shared/types'
import VaultPill from './VaultPill.vue'
import { t } from '../shared/i18n'

const props = defineProps<{
  running: boolean
  vaults: Vault[]
}>()

// Sorted by name within each state, matching the desktop's vault rail.
const byName = (a: Vault, b: Vault) => a.name.localeCompare(b.name)

const unlocked = computed(() => props.vaults.filter(v => !v.locked).sort(byName))
const locked = computed(() => props.vaults.filter(v => v.locked).sort(byName))

// Columns only earn their keep when both states are present
const split = computed(() => unlocked.value.length > 0 && locked.value.length > 0)

const sortedVaults = computed(() => [...unlocked.value, ...locked.value])

// Only locked vaults do anything: this raises the desktop on its unlock screen.
// An open vault has nothing to action from here.
async function selectVault(vault: Vault) {
  await chrome.runtime.sendMessage({ type: 'SELECT_VAULT', id: vault.id })
  window.close()
}

async function openBuddy() {
  await chrome.runtime.sendMessage({ type: 'LAUNCH_DESKTOP' })
}
</script>
