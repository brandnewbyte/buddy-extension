<template>
  <div class="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 font-sans">
    <div class="max-w-xl mx-auto px-6 py-16 space-y-14" v-if="settings">

      <header class="flex items-center gap-3">
        <img :src="logo" alt="" class="w-11 h-11 object-contain shrink-0" />
        <h1 class="text-xl font-semibold tracking-tight">{{ t('optionsHeading') }}</h1>
      </header>

      <section class="space-y-3">
        <h2 class="text-base font-semibold">{{ t('optionsAccessTitle') }}</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {{ settings.hasHostAccess ? t('optionsAccessOn') : t('optionsAccessOff') }}
        </p>
        <button
          v-if="!settings.hasHostAccess"
          class="text-sm px-3.5 py-2 rounded-md bg-primary-500 hover:bg-primary-450 text-white transition-colors cursor-pointer"
          @click="allow"
        >{{ t('optionsAccessAllow') }}</button>
      </section>

      <section class="space-y-3">
        <h2 class="text-base font-semibold">{{ t('optionsPausedTitle') }}</h2>

        <p v-if="!settings.pausedOrigins.length" class="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {{ t('optionsPausedEmpty') }}
        </p>

        <ul v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <li
            v-for="origin in settings.pausedOrigins"
            :key="origin"
            class="flex items-center justify-between gap-4 py-2.5"
          >
            <span class="text-sm truncate text-zinc-700 dark:text-zinc-300">{{ origin }}</span>
            <button
              class="shrink-0 text-xs px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
              @click="resume(origin)"
            >{{ t('optionsResume') }}</button>
          </li>
        </ul>
      </section>

      <section class="space-y-3">
        <h2 class="text-base font-semibold">{{ t('optionsAboutTitle') }}</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {{ t('optionsAboutVersion', version) }}
        </p>
        <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <a :href="SITE_URL" target="_blank" rel="noreferrer" class="text-primary-600 hover:text-primary-500 dark:text-primary-300 dark:hover:text-primary-200 hover:underline transition-colors">{{ t('getApp') }}</a>
          <a :href="SUPPORT_URL" target="_blank" rel="noreferrer" class="text-primary-600 hover:text-primary-500 dark:text-primary-300 dark:hover:text-primary-200 hover:underline transition-colors">{{ t('optionsSupport') }}</a>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { t } from '../shared/i18n'
import logo from '../assets/logo.svg'
import { dataOr } from '../shared/ipc'
import type { IpcResult } from '../shared/ipc'
import type { SiteSettings } from '../shared/messages'

const OPTIONAL_HOSTS = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']

const SITE_URL = 'https://pwbuddy.com'
const SUPPORT_URL = 'https://pwbuddy.com/contact'

const version = chrome.runtime.getManifest().version

const settings = ref<SiteSettings | null>(null)

async function load() {
  settings.value = dataOr(
    await chrome.runtime.sendMessage({ type: 'GET_SITE_SETTINGS' }) as IpcResult<SiteSettings>,
    { hasHostAccess: false, pausedOrigins: [], activeOrigin: null },
  )
}

// Requested from the page, not the worker: Chrome only accepts this from a
// user gesture in an extension page.
async function allow() {
  try {
    await chrome.permissions.request({ origins: OPTIONAL_HOSTS })
  } catch { /* declined */ }
  await load()
}

async function resume(origin: string) {
  await chrome.runtime.sendMessage({ type: 'SET_ORIGIN_PAUSED', origin, paused: false })
  await load()
}

onMounted(load)
</script>
