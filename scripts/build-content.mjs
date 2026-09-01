// Content scripts are built outside the CRX plugin, and for two reasons.
//
// They are registered at runtime from chrome.scripting rather than declared in
// the manifest (host access is optional, and a declared match pattern would
// put the all-sites warning back on the install prompt), so they need stable
// filenames the background can name. And the document_start scrubber has to
// run synchronously: the plugin's loader shim awaits a dynamic import, which
// would lose the race against the page's own scripts.
//
// Neither script imports anything outside src/content, so each builds to one
// self-contained IIFE.

import { build } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const ENTRIES = {
  content: 'src/content/index.ts',
  'content-token': 'src/content/token.ts',
}

const target = process.argv[2] === 'firefox' ? 'firefox' : 'chrome'

for (const [name, entry] of Object.entries(ENTRIES)) {
  await build({
    configFile: false,
    logLevel: 'warn',
    // The picker and save bar inject main.css into their shadow roots via
    // ?inline, so Tailwind has to run here too. Without it they get the
    // uncompiled source and render unstyled.
    plugins: [tailwindcss()],
    build: {
      outDir: `dist/${target}`,
      // The CRX build runs first and owns the directory.
      emptyOutDir: false,
      sourcemap: false,
      lib: {
        entry,
        formats: ['iife'],
        name: `buddy_${name.replace(/-/g, '_')}`,
        fileName: () => `${name}.js`,
      },
    },
  })
  console.log(`  content script -> dist/${target}/${name}.js`)
}
