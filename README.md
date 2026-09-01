# Buddy — Browser Extension

Browser companion for the Buddy password manager desktop app. The extension owns no vault and stores no secrets at rest: the desktop app holds the vault, and the extension talks to it through a native-messaging host over a local socket.

Targets: **Chrome** (MV3) and **Firefox** (MV3, ≥128).

This source is published so the extension can be reviewed, and so the packages
on the Chrome Web Store and AMO can be checked against it. It is not a
standalone product: the extension does nothing without the Buddy desktop app,
which is closed source and distributed separately. Everything here builds and
tests on its own, but a running extension needs the desktop installed and
paired. See [Verifying a published package](#verifying-a-published-package) and
[Relationship to the desktop](#relationship-to-the-desktop).

## Quick start

```bash
npm install

# Development (watch mode)
npm run dev             # Chrome (default)
npm run dev:firefox

# Production build
npm run build           # Chrome only → dist/chrome/
npm run build:firefox   # Firefox only → dist/firefox/
npm run build:all       # Both targets

# Packaging / release
npm run package:chrome  # → releases/buddy-chrome.zip  (upload to Chrome Web Store)
npm run package:firefox # → releases/buddy-firefox.zip (upload to AMO)
npm run package:all     # both

npm run typecheck
npm test
npm run verify          # store-release gate (permissions, sourcemaps, identities)
npm run release:check   # typecheck + test + build:all + verify
npx web-ext lint --source-dir dist/firefox
```

**Load unpacked in browser:**
- Chrome: `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome/`
- Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → any file in `dist/firefox/`

`dist/chrome/` carries the `key` from `manifests/chrome.json`, which pins the
extension id. That is what lets an unpacked build reach the native messaging
host, since the host allowlists exact `chrome-extension://` origins. The store
package does not carry it: the Chrome Web Store rejects a package with a `key`,
so `npm run package:chrome` strips it. That one field is the only difference
between `dist/chrome/` and the shipped zip.

## Verifying a published package

The build is reproducible. The same source produces byte-identical packages on
any machine, from any directory, so you do not have to take our word for what
is in the store listing: build it yourself and compare hashes.

```bash
npm ci                  # exact dependency tree from package-lock.json
npm run package:all
shasum -a 256 releases/buddy-chrome.zip releases/buddy-firefox.zip
```

Then download the published package (Chrome Web Store and AMO both serve the
packed file) and compare its hash to yours. They should match exactly. If they
do not, that is worth reporting.

Compare the zips rather than a zip against `dist/`. The Chrome package has its
`key` stripped, for the reason given above, so the two manifests differ by that
field by design.

What makes this hold, since neither is free: `package.json` and
`package-lock.json` pin the dependency tree, and `scripts/package.mjs` pins the
two things a zip would otherwise pick up from the machine that ran it, namely
each file's modification time and the order entries are stored in.

`web-ext build` is deliberately not used for the Firefox package. It stamps
directory entries with the current time and its entry order varies between
runs, so its archives are never byte-comparable. AMO accepts a plain zip.
`web-ext lint` is unaffected and still runs in CI.

## Releasing

Tag on `main`, matching the version in `package.json`:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

`.github/workflows/release.yml` then typechecks, tests, builds, runs the release
gate and `web-ext lint`, packages both targets, packages them a second time from
scratch and refuses to continue unless the two agree byte for byte, and creates
a **draft** GitHub release carrying both zips and a `SHA256SUMS` file.

Upload to the stores from those release assets rather than from a local build,
and publish the draft once the stores have approved. The point is that the hash
you publish is one a reader can reproduce from the same tag, which is not true
of anything built on a laptop.

The workflow refuses a tag that disagrees with `package.json`, and the release
gate holds both manifests to the same version, so all three version strings move
together or nothing ships.

## Architecture

**Stack:** Vite + CRXJS · Vue 3 · Tailwind CSS v4 · TypeScript

```
contracts/
└── native-host.json  # The desktop identity this build is pinned to (see below)

manifests/
├── chrome.json   # Chrome MV3 (stable-ID key)
└── firefox.json  # Firefox MV3 (gecko id, event-page background)

src/
├── shared/
│   ├── types.ts     # Wire types shared with the desktop (Entry, FieldType, EntryMeta)
│   ├── messages.ts  # Typed content/popup ↔ background message protocol
│   ├── ipc.ts       # IpcResult envelope, SocketError union, protocol version
│   └── contracts/   # Closed schemas for everything the desktop sends back
├── background/
│   ├── worker.ts    # Entry point: token capture, tab lifecycle
│   ├── router.ts    # Message dispatch + frame trust policy
│   ├── lib/
│   │   ├── native.ts               # Native messaging port, pairing secret, badge/cache taps
│   │   ├── pairing.ts              # Pairing ceremony FSM (one auto attempt, manual retries)
│   │   ├── autofill-session.ts     # Multi-page fill sessions (token chain, per tab)
│   │   ├── pending-save.ts         # Captured credentials awaiting user confirmation
│   │   └── search-results-cache.ts # URL → entry metadata cache (revision-invalidated)
│   └── handlers/    # One file per message type
├── content/
│   ├── index.ts     # Frame-aware entry point, FILL_READY delivery policy
│   ├── forms.ts     # THE form classifier: groups, kinds, field roles
│   ├── capture.ts   # Submit capture for save prompts (classifier-driven)
│   ├── fill/        # Anchored fill, control scoring/heuristics, DOM value setting
│   ├── picker/      # In-page dropdown (focus-gated, classification-gated)
│   └── save-prompt/ # "Save/update login?" bar
└── popup/           # Vue popup (logins, cards, addresses, pairing, states)
```

The build target is controlled by Vite mode (`--mode firefox`). Both targets share identical source — CRXJS rewrites the manifest's entry point paths at build time.

## Core invariants

- **One classifier.** `content/forms.ts` decides what a form is and which field plays which role. Picker, fill, and save capture all consume it; none may second-guess it.
- **Anchored fill.** A fill either carries the field the user invoked Buddy from (fills only that form) or it is unanchored and proceeds only when exactly one compatible form exists. Ambiguity means nothing happens.
- **Secrets stay upstream.** The desktop releases a login section only when the page URL matches the entry (scheme and host are boundaries). TOTP crosses as the current code, never the seed. Captured passwords live in the background until confirmed; content scripts and the popup see metadata only.
- **Frames are untrusted.** Login lookups and fills are honored from the top frame or same-origin frames only. Card/address flows may run in cross-origin frames (payment processors), but delivery is fenced to the anchoring frame's origin, and pickers only open on real user activation.
- **Fail closed.** No candidate form, no unique target, an unverifiable peer, an oversized message: the answer is "do nothing", not "best effort".

## Fill flows

- **Picker fill:** focus in a classified field → entries offered → pick anchors the fill to that form. Login entries are matched by URL; card/address sections by capability.
- **Popup fill:** unanchored; requires a unique compatible form. This is also the only path into payment-provider iframes too small to render the picker.
- **Multi-page login:** each redemption of the fill token returns the entry plus a successor token, so step 2 (password, TOTP) resumes after navigation. The desktop re-validates the URL at every hop.
- **Desktop-initiated:** the desktop opens `url?_bftk=<token>`; the background captures the token (webNavigation) while a DNR rule strips it before the request leaves.

## Save flow

Submit capture (top frame, classifier-gated) → background classifies against known entries: unknown username = "Save login?", known username = "Update password?" targeting that exact section. The bar auto-hides after 8s into a snooze (popup keeps offering); explicit dismissal drops the candidate.

## Relationship to the desktop

The desktop app is a separate, private repository. This one builds, tests and
packages with no reference to it, and nothing in CI here should ever need
access to it.

Two things nonetheless have to agree across that boundary, and they fail in
different ways:

**`contracts/native-host.json`** pins three identities: the native host's
registration name, and the two extension ids the host is built to accept. The
desktop keeps its own copy at the same path and compiles it in via `build.rs`.
This copy is a vendored pin, not a shared source, so the two must be changed
together by hand. `npm run verify` holds the build to all three: the Chromium id
derived from `manifests/chrome.json`'s key, the gecko id in
`manifests/firefox.json`, and the host name the built worker passes to
`connectNative`. A disagreement here is total and immediate rather than subtle,
because the extension simply cannot reach the desktop.

One caveat on the Chromium half. The published id is assigned by the Chrome Web
Store, not derived from anything in this repository, so that check covers the
unpacked build rather than the store package. Firefox is checked for real, since
AMO honours the gecko id the manifest declares.

**`src/shared/contracts/`** holds closed schemas for every response the desktop
sends. `hasExactKeys` means an unrecognised key is a rejection, not something to
salvage: a TOTP seed arriving where a code belongs is an extra key, and an extra
key collapses the whole response to null. That is a security boundary first, not
a drift detector, and it treats the desktop as untrusted input on purpose. The
side effect is that a desktop-side response key addition breaks installed
extensions until they update. That is version skew rather than anything the
repository split introduced, and the channel for handling it is
`PROTOCOL_VERSION` in `src/shared/ipc.ts`, which rides on every request and
which the desktop can refuse with `UNSUPPORTED_VERSION`. See
`src/shared/contracts/SOURCE.json` for which desktop files own which shapes.

## Native host

Connects to `com.brandnewbyte.buddy` via native messaging. Messages use a numeric `rid` for request/response correlation on the persistent port. The host is a thin line-protocol proxy to the desktop's per-user socket and verifies it is talking to the real desktop before forwarding anything (see `docs/THREAT-MODEL.md`; the host itself lives in the desktop repository).

Chrome and Firefox each need a small JSON file installed on the OS that registers the host and controls which extensions can connect to it. These live outside the extension directory — the desktop app's installer writes them; for development you can create them manually.

### Chrome

**File location (macOS):**
```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.brandnewbyte.buddy.json
```

**Contents:**
```json
{
  "name": "com.brandnewbyte.buddy",
  "description": "Buddy native messaging host",
  "path": "/path/to/buddy-native-host-binary",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://gbghjcehkafiiobmokljehkeedbcmpea/"
  ]
}
```

Find your extension ID at `chrome://extensions` (Developer mode must be on). With the `key` field set in `manifests/chrome.json`, the ID is stable across rebuilds and reloads. The private key that produced that ID must never live in the repo.

### Firefox

**File location (macOS):**
```
~/Library/Application Support/Mozilla/NativeMessagingHosts/com.brandnewbyte.buddy.json
```

**Contents:**
```json
{
  "name": "com.brandnewbyte.buddy",
  "description": "Buddy native messaging host",
  "path": "/path/to/buddy-native-host-binary",
  "type": "stdio",
  "allowed_extensions": [
    "extension@pwbuddy.com"
  ]
}
```

Firefox identifies extensions by the `gecko.id` in the manifest (`extension@pwbuddy.com`), not by a hash-derived ID, so this file never needs to change.

### Other platforms

| OS | Chrome path | Firefox path |
|----|-------------|--------------|
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` | `~/Library/Application Support/Mozilla/NativeMessagingHosts/` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/` | `~/.mozilla/native-messaging-hosts/` |
| Windows | Registry: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.brandnewbyte.buddy` → path to JSON file | Registry: `HKCU\Software\Mozilla\NativeMessagingHosts\com.brandnewbyte.buddy` → path to JSON file |
