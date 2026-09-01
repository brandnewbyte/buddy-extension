// Release gate for the store packages.
//
// A store release cannot be recalled the way a desktop build can, so the
// mistakes worth catching are the ones that stay invisible until someone
// installs the published extension: a dev-only permission left in the
// manifest, sourcemaps shipped alongside minified code, or an extension id
// that no longer matches the one the native host will talk to.
//
// Runs against a built dist/<target>. Exits non-zero and says what is wrong;
// it never edits anything.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Exactly what a published package may ask for at install. Adding to this list
// is a deliberate act with a store-review cost, never a side effect of a
// refactor.
const REQUIRED_PERMISSIONS = ['nativeMessaging', 'storage', 'scripting', 'activeTab']
const REQUIRED_OPTIONAL_HOSTS = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']

// Named rather than merely absent, so the failure explains itself instead of
// reading as a generic mismatch.
const FORBIDDEN_PERMISSIONS = [
  'webNavigation', 'declarativeNetRequestWithHostAccess', 'tabs', 'cookies', 'history', '<all_urls>',
]

// Registered at runtime from chrome.scripting, by these exact names. A missing
// file is silent at build time and total at install time: nothing injects and
// nothing says why.
const RUNTIME_CONTENT_SCRIPTS = ['content.js', 'content-token.js']

const problems = []
const fail = (message) => problems.push(message)

/** Chromium derives an extension id from the first 128 bits of the key's SHA-256. */
export function chromiumExtensionId(publicKey) {
  const digest = createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest().subarray(0, 16)
  return [...digest].map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('')
}

const walk = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(item => item.isFile())
  .map(item => join(item.parentPath, item.name))

const sameList = (actual, expected) => Array.isArray(actual)
  && actual.length === expected.length
  && [...actual].sort().join() === [...expected].sort().join()

function verify(target, manifest, version, identity, files) {
  const label = `${target} package`

  if (manifest.manifest_version !== 3) fail(`${label}: manifest_version must be 3.`)
  if (manifest.version !== version) {
    fail(`${label}: manifest version ${manifest.version} does not match package version ${version}.`)
  }

  for (const permission of FORBIDDEN_PERMISSIONS) {
    if (manifest.permissions?.includes(permission)) {
      fail(`${label}: ${permission} must not reach a store package.`)
    }
  }
  if (!sameList(manifest.permissions, REQUIRED_PERMISSIONS)) {
    fail(`${label}: permissions must be exactly [${REQUIRED_PERMISSIONS}], got [${manifest.permissions}].`)
  }
  // Host access is asked for in context, never at install. Either of these
  // reaching a package puts the all-sites warning back on the install prompt,
  // which is the entire thing this arrangement exists to avoid.
  if (manifest.host_permissions) {
    fail(`${label}: host_permissions must be optional, got [${manifest.host_permissions}].`)
  }
  if (manifest.content_scripts) {
    fail(`${label}: content scripts must be registered at runtime, not declared.`)
  }
  if (!sameList(manifest.optional_host_permissions, REQUIRED_OPTIONAL_HOSTS)) {
    fail(`${label}: optional_host_permissions must be exactly [${REQUIRED_OPTIONAL_HOSTS}], `
      + `got [${manifest.optional_host_permissions}].`)
  }

  for (const script of RUNTIME_CONTENT_SCRIPTS) {
    if (!files.some(file => file.endsWith(`/${script}`))) {
      fail(`${label}: ${script} is missing, so runtime registration would inject nothing.`)
    }
  }

  // The name the worker hands to connectNative. It is a string literal in the
  // source rather than a build input, so without this nothing would catch it
  // drifting from the host the desktop actually registers. Checked against the
  // built bundle rather than the source: what ships is what matters.
  const scripts = files.filter(file => file.endsWith('.js'))
  if (!scripts.some(file => readFileSync(file, 'utf8').includes(identity.native_host_name))) {
    fail(`${label}: no built script names the native host ${identity.native_host_name}, `
      + `so the extension would connect to a host the desktop does not register.`)
  }

  const maps = files.filter(file => file.endsWith('.map'))
  if (maps.length) fail(`${label}: sourcemaps must not ship (${maps.length} found).`)

  if (!manifest.icons || !['16', '32', '48', '128'].every(size => manifest.icons[size])) {
    fail(`${label}: icons must cover 16, 32, 48 and 128.`)
  }

  // The identity the native host accepts. A mismatch here is the failure that
  // stays invisible until install: the extension loads and simply cannot reach
  // the desktop.
  //
  // For Chromium this runs against dist/, the unpacked build, which is the only
  // artifact that carries a key: scripts/package.mjs strips it on the way into
  // the zip because the store rejects a package that has one. The published id
  // is assigned by the Chrome Web Store and nothing local can confirm it, so
  // what is checked here is that a local build reaches the host the desktop was
  // built to answer to. Firefox is checked for real, since AMO honours the
  // gecko id declared in the manifest.
  if (target === 'firefox') {
    if ('key' in manifest) fail(`${label}: a Chromium packing key must not reach the Firefox package.`)
    const gecko = manifest.browser_specific_settings?.gecko
    if (gecko?.id !== identity.firefox_extension_id) {
      fail(`${label}: gecko id ${gecko?.id} is not the host-pinned ${identity.firefox_extension_id}.`)
    }
    // Below 128 there is no optional_host_permissions, so site access could
    // never be granted and the picker could never appear.
    if (parseInt(gecko?.strict_min_version ?? '0', 10) < 128) {
      fail(`${label}: strict_min_version ${gecko?.strict_min_version} predates optional_host_permissions (128).`)
    }
  } else if (!manifest.key) {
    fail(`${label}: manifest.key is missing, so the extension id is not pinned.`)
  } else {
    const derived = chromiumExtensionId(manifest.key)
    if (derived !== identity.chrome_extension_id) {
      fail(`${label}: the id derived from manifest.key (${derived}) is not the host-pinned `
        + `${identity.chrome_extension_id}. Restore the matching key, or update `
        + `contracts/native-host.json here and in the desktop repository together, and `
        + `rebuild the desktop.`)
    }
  }
}

const targets = process.argv.slice(2)
const checked = targets.length ? targets : ['chrome', 'firefox']
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const identity = JSON.parse(readFileSync(join(root, 'contracts', 'native-host.json'), 'utf8'))

for (const target of checked) {
  const dir = join(root, 'dist', target)
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(dir)) {
    fail(`${target} package: dist/${target} does not exist. Build it first.`)
  } else if (!existsSync(manifestPath)) {
    fail(`${target} package: manifest.json is missing.`)
  } else {
    verify(target, JSON.parse(readFileSync(manifestPath, 'utf8')), version, identity, walk(dir))
  }
}

if (problems.length) {
  console.error(`\nRelease gate failed:\n${problems.map(p => `  - ${p}`).join('\n')}\n`)
  process.exit(1)
}
console.log(`Release gate passed: ${checked.join(', ')} @ ${version}`)
