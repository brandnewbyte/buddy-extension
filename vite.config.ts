import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import chromeManifest from './manifests/chrome.json'
import firefoxManifest from './manifests/firefox.json'

export default defineConfig(({ mode }) => {
  const isFirefox = mode === 'firefox'

  return {
    plugins: [
      vue(),
      tailwindcss(),
      // JSON imports widen literal fields to string, which the plugin's
      // manifest type rejects; the manifests are the source of truth.
      crx({ manifest: (isFirefox ? firefoxManifest : chromeManifest) as ManifestV3Export }),
    ],
    build: {
      outDir: isFirefox ? 'dist/firefox' : 'dist/chrome',
      emptyOutDir: true,
      rollupOptions: {
        // The popup and options page are reachable from the manifest, so the
        // plugin finds them. Onboarding is opened by the worker on install and
        // has to be named here or it never gets built.
        input: { onboarding: resolve(__dirname, 'onboarding.html') },
      },
    },
  }
})
