// Reproducible packaging.
//
// The build output is already byte-identical across machines and paths, so the
// only thing between that and a package anyone can verify by hash is the
// archive itself. Two things leak in: zip records each file's mtime, and it
// stores entries in whatever order the filesystem hands back. Both are pinned
// here, so the same source yields the same bytes anywhere.
//
// The Chromium `key` is stripped on the way in. It pins the extension id for
// unpacked builds, which is the only reason a local build can reach the native
// messaging host (which allowlists exact chrome-extension:// origins), but the
// Chrome Web Store rejects any package carrying one. So dist/chrome stays
// loadable with a pinned id and the zip that ships does not have it. This is
// the one field by which the two differ.
//
// web-ext build is deliberately not used for the Firefox package. It stamps
// directory entries with the current time and its entry order varies run to
// run, neither of which it offers a way to turn off. AMO accepts a plain zip.
// web-ext lint, which is the part that earns its keep, still runs in CI.

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const NAMES = { chrome: 'buddy-chrome.zip', firefox: 'buddy-firefox.zip' }

// Arbitrary and simply stable, well clear of the 1980 floor a DOS timestamp
// can express so no local timezone can push it below what zip can record.
const FIXED = new Date('2020-01-01T00:00:00Z')

const target = process.argv[2]
if (!NAMES[target]) {
  console.error(`usage: package.mjs <${Object.keys(NAMES).join('|')}>`)
  process.exit(1)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist', target)
const staging = join(root, 'dist', `.package-${target}`)
const out = join(root, 'releases', NAMES[target])

// Staged rather than edited in place: dist/<target> is what a developer loads
// unpacked, and packaging must not quietly take its pinned id away.
rmSync(staging, { recursive: true, force: true })
cpSync(dist, staging, { recursive: true })

if (target === 'chrome') {
  const manifestPath = join(staging, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  delete manifest.key
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  if ('key' in JSON.parse(readFileSync(manifestPath, 'utf8'))) {
    console.error('package.mjs: manifest.key survived the strip; the store would reject this.')
    process.exit(1)
  }
}

const files = readdirSync(staging, { recursive: true, withFileTypes: true })
  .filter(item => item.isFile())
  .map(item => relative(staging, join(item.parentPath, item.name)))
  .sort()

for (const file of files) utimesSync(join(staging, file), FIXED, FIXED)

mkdirSync(join(root, 'releases'), { recursive: true })
// zip updates an existing archive in place rather than replacing it, which
// would carry stale entries forward.
rmSync(out, { force: true })
execFileSync('zip', ['-qX', out, ...files], { cwd: staging })
rmSync(staging, { recursive: true, force: true })

console.log(`Packaged -> releases/${NAMES[target]} (${files.length} files)`)
