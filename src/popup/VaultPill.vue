<template>
  <!-- Unlocked is the resting state, so it stays quiet — a filled swatch is all
       the signal it needs. Locked is the only one with something to do, so it's
       the only one that looks interactive. -->
  <div
    class="flex w-full items-center gap-1.5 min-w-0 px-1.5 py-1 rounded-md text-[12px] leading-none transition-colors"
    :class="vault.locked
      ? 'cursor-pointer text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      : 'text-zinc-700 dark:text-zinc-200'"
    :title="vault.locked ? `${vault.name} — ${t('open')}` : `${vault.name} — ${t('unlocked')}`"
    @click="vault.locked && emit('open', vault)"
  >
    <span
      class="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-black/20 dark:ring-white/25"
      :class="vault.locked && 'opacity-35'"
      :style="`background: #${vault.color}`"
    />
    <span class="truncate">{{ vault.name }}</span>

    <svg
      v-if="vault.locked"
      class="w-2.5 h-2.5 shrink-0 opacity-70 ml-auto"
      viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"
    >
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.75 7V4.9a2.25 2.25 0 0 1 4.5 0V7" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { Vault } from '../shared/types'
import { t } from '../shared/i18n'

defineProps<{ vault: Vault }>()

const emit = defineEmits<{ (e: 'open', vault: Vault): void }>()
</script>
