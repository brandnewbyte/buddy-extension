<template>
  <!-- Decorative: the paragraph above carries the meaning. Deliberately no
       filled surfaces — chips read as buttons, and nothing here is clickable. -->
  <div class="flex items-start gap-3 text-zinc-400 dark:text-zinc-500" aria-hidden="true">
    <figure :class="node">
      <svg v-bind="glyph">
        <rect x="2.5" y="3.5" width="19" height="16" rx="2" />
        <path d="M2.5 8h19" />
      </svg>
      <figcaption :class="label">{{ t('onboardDiagramPage') }}</figcaption>
    </figure>

    <Arrow />

    <figure :class="node">
      <svg v-bind="glyph">
        <path d="M9 3.5h3.2a1.8 1.8 0 1 1 3.6 0H19a1.5 1.5 0 0 1 1.5 1.5v3.2a1.8 1.8 0 1 0 0 3.6V15a1.5 1.5 0
                 0 1-1.5 1.5h-3.2a1.8 1.8 0 1 0-3.6 0H9A1.5 1.5 0 0 1 7.5 15v-3.2a1.8 1.8 0 1 1 0-3.6V5A1.5
                 1.5 0 0 1 9 3.5Z" />
      </svg>
      <figcaption :class="label">{{ t('onboardDiagramExtension') }}</figcaption>
    </figure>

    <Arrow />

    <!-- The destination, and the only thing here holding a secret. -->
    <figure :class="[node, 'text-primary-500 dark:text-primary-300']">
      <svg v-bind="glyph">
        <path d="M12 2.8 20 5.6v6.1c0 4.5-3.4 7.9-8 9.5-4.6-1.6-8-5-8-9.5V5.6Z" />
        <path d="M9.6 11.4V9.2a2.4 2.4 0 0 1 4.8 0v2.2" />
        <rect x="8.4" y="11.4" width="7.2" height="5.4" rx="1.3" />
      </svg>
      <figcaption :class="label">{{ t('onboardDiagramApp') }}</figcaption>
    </figure>
  </div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { t } from '../shared/i18n'

const node = 'flex flex-col items-center gap-1.5 min-w-0'
const label = 'text-[11px] leading-none whitespace-nowrap text-zinc-500 dark:text-zinc-400'

const glyph = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.4,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
}

// Sits on the glyph row rather than the column, so the labels below stay clear.
const Arrow = () => h('svg', {
  width: 22, height: 8, viewBox: '0 0 22 8', fill: 'none', class: 'shrink-0 mt-2',
}, [
  h('path', {
    d: 'M1 4h18M16 1l3 3-3 3',
    stroke: 'currentColor',
    'stroke-width': 1.2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: 'text-zinc-300 dark:text-zinc-600',
  }),
])
</script>
