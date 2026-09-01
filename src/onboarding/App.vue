<template>
  <div class="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 font-sans">
    <div class="max-w-xl mx-auto px-6 py-16 space-y-14">

      <header class="flex items-center gap-3">
        <img :src="logo" alt="" class="w-11 h-11 object-contain shrink-0" />
        <div>
          <h1 class="text-xl font-semibold tracking-tight">{{ t('onboardHeading') }}</h1>
          <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{{ t('onboardSub') }}</p>
        </div>
      </header>

      <section class="space-y-11">
        <!-- Where the vault lives. Said first because it is the thing that
             makes the permission ask below reasonable. -->
        <article class="flex gap-4">
          <StepMark :n="1" />
          <div class="space-y-2">
            <h2 class="text-base font-semibold">{{ t('onboardVaultTitle') }}</h2>
            <p class="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{{ t('onboardVaultBody') }}</p>
            <VaultDiagram class="pt-2" />
          </div>
        </article>

        <article class="flex gap-4">
          <StepMark :n="2" />
          <div class="space-y-3">
            <h2 class="text-base font-semibold">{{ t('onboardAccessTitle') }}</h2>
            <p class="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{{ t('onboardAccessBody') }}</p>
            <GlyphDemo class="pt-1 pb-1" />

            <p v-if="granted" class="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {{ t('onboardAccessGranted') }}
            </p>
            <button
              v-else
              class="text-sm px-3.5 py-2 rounded-md bg-primary-500 hover:bg-primary-450 text-white transition-colors cursor-pointer"
              @click="allow"
            >{{ t('onboardAccessAllow') }}</button>
          </div>
        </article>

        <article class="flex gap-4">
          <StepMark :n="3" />
          <div class="space-y-2">
            <h2 class="text-base font-semibold">{{ t('onboardToolbarTitle') }}</h2>
            <p class="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{{ t('onboardToolbarBody') }}</p>
          </div>
        </article>
      </section>

      <footer class="pt-2">
        <button
          class="text-sm px-3.5 py-2 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
          @click="close"
        >{{ t('onboardDone') }}</button>
      </footer>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { t } from '../shared/i18n'
import logo from '../assets/logo.svg'
import VaultDiagram from './VaultDiagram.vue'
import GlyphDemo from './GlyphDemo.vue'

const OPTIONAL_HOSTS = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']

const granted = ref(false)

// The grant has to be requested from the page itself: Chrome only accepts
// permissions.request() from a user gesture in an extension page, never from
// the service worker.
async function allow() {
  try {
    granted.value = await chrome.permissions.request({ origins: OPTIONAL_HOSTS })
  } catch {
    granted.value = false
  }
}

function close() {
  window.close()
}

onMounted(async () => {
  granted.value = await chrome.permissions.contains({ origins: OPTIONAL_HOSTS }).catch(() => false)
})

const StepMark = (props: { n: number }) => h('span', {
  class: 'shrink-0 w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 '
    + 'dark:text-zinc-400 text-xs font-semibold grid place-items-center',
}, props.n)
</script>
