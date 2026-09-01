<template>
  <!-- A cropped, zoomed mock of a real login field: the point is to teach the
       shape of the thing to look for, so the mark here is the same module the
       content script draws. -->
  <figure class="not-prose">
    <div class="relative overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900 px-5 py-6">
      <!-- Oversized and clipped left and right, so it reads as a detail lifted
           out of a page rather than a form we are asking them to fill in. -->
      <div class="-mx-6 scale-[1.15] origin-left">
        <p class="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
          {{ t('onboardDemoLabel') }}
        </p>

        <div
          class="relative flex items-center h-9 rounded-md bg-white dark:bg-zinc-800
                 border border-zinc-300 dark:border-zinc-700 pl-3 pr-9 max-w-[260px]"
        >
          <span class="text-[13px] text-zinc-400 dark:text-zinc-500 truncate">
            {{ t('onboardDemoValue') }}
          </span>

          <span class="absolute right-2 grid place-items-center w-[18px] h-[18px]">
            <span class="pulse absolute inset-[-7px] rounded-full bg-primary-500/25" />
            <span class="relative w-full h-full text-primary-600 dark:text-primary-300" v-html="BUDDY_MARK" />
          </span>
        </div>
      </div>
    </div>

    <figcaption class="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
      {{ t('onboardDemoCaption') }}
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { t } from '../shared/i18n'
import { BUDDY_MARK } from '../shared/mark'
</script>

<style scoped>
/* A slow halo rather than a bounce: it should draw the eye on a page someone
   is reading, not compete with it. */
@keyframes pulse {
  0%, 70%, 100% { transform: scale(.7); opacity: 0 }
  35%           { transform: scale(1);  opacity: 1 }
}

.pulse {
  animation: pulse 2.6s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .pulse { animation: none; opacity: .55 }
}
</style>
