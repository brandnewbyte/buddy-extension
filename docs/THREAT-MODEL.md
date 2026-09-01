# Threat model: browser extension and IPC chain

This document states plainly what the extension's security mechanisms defend against and, just as importantly, what they do not. It covers the chain:

```
web page ⇄ content script ⇄ background worker ⇄ native host ⇄ desktop socket ⇄ vault
```

## What is checkable here, and what is not

This repository holds the browser extension only. The native messaging host and
the desktop app it proxies to are closed source and shipped separately, so the
statements below are of two kinds. Mixing them silently would overstate what
publishing this source proves, so they are separated here and the distinction
holds for the rest of the document.

**Checkable against this source**, which is to say everything the extension
itself does:

- That the extension holds no vault, no keys and no secrets at rest, and what it
  does hold transiently.
- The permission surface: no host access at install, content scripts registered
  at runtime, and `scripts/verify-release.mjs` asserting both against the built
  package rather than the source.
- Closed-schema validation of every native response: exact keys, capped lengths,
  and a field set that must be a subset of what was requested
  (`src/shared/contracts/`).
- The frame trust policy: rechecking the browser-attested sender on every
  request, keying lookups to the asking frame's own origin, single-frame
  delivery, and the payload-free probe that refuses when more than one frame
  answers.
- User-activation gating on the picker, and the per-frame paused-origin check
  that fails closed.
- Closed shadow roots for injected UI, the scope of submit capture, and the
  `_bftk` fragment claim.
- That the package published to a store was built from this source, by
  rebuilding it and comparing hashes. See the README.

**Asserted here but not verifiable from this source.** These are properties of
the desktop and the native host:

- The URL and capability gates that decide whether anything is released at all.
- Slicing as enforced on the desktop side: that it returns only the intersection
  of the requested slice with the command's own allowlist, and that TOTP crosses
  as the current code rather than the seed.
- Fill token minting and redemption: 128-bit, single-use, short-lived, wiped on
  vault lock, URL revalidated when redeemed.
- Peer verification on both platforms: the socket directory's ownership and
  mode, the Windows pipe first-instance assertion and executable check, and
  "cannot verify means reject" in release builds.
- Message size caps on the hops past the extension.
- Vault locking, and the pairing approval modal.

The extension's own defenses are deliberately built not to depend on that second
list holding. Closed-schema validation is the clearest case: it treats the
desktop as untrusted input on purpose, so a field the page never asked for is
rejected regardless of why it was sent. That does not make the desktop's
guarantees checkable. It bounds what their failure can reach.

## Principles

1. **The desktop owns the vault.** The extension holds no vault, no keys, and no secrets at rest. Everything it handles is transient and scoped to a user action.
2. **Fail closed.** Ambiguity (two candidate forms, an unverifiable peer, an oversized message, a squatted rendezvous) resolves to doing nothing.
3. **Reach is granted, not assumed.** The extension installs with no access to any page. All-sites access is optional, asked for in context during onboarding, and revocable; the content scripts that need it are registered at runtime, so declining leaves them unregistered rather than merely idle. Without the grant the toolbar popup still fills, through `activeTab`, one tab at a time and only when the user clicks us.
4. **Disclosure is scoped by purpose, and then by shape.** A login fill releases one section, URL-gated. A card fill releases only card roles, capability-gated. On top of that, every release is *sliced*: the page's classifier names the roles the target form can actually take, and the desktop returns the intersection of that slice with the command's own allowlist. An entry never crosses whole. TOTP crosses as the current code, never the seed, and the browser rejects a response carrying any field it did not ask for. Save prompts show metadata; the captured password stays in the background until confirmed.
5. **Delivery is addressed, not broadcast.** A released slice goes to one frame, chosen in the background from a browser-attested sender or a payload-free probe. No frame is sent a credential it then has to decline.

## Adversaries and what stops them

### A hostile web page

- Content-script UI (picker, save bar) lives in closed shadow roots. The page cannot read it, but it **can** remove or overlay it, and can always read values filled into its own fields. Filling a page is disclosure to that page by definition; the URL gate on the desktop is what ensures we only disclose to pages the entry names.
- **Slicing is minimization, not authorization.** The slice is computed by the content script, so a content script under an attacker's control could name every role. What slicing buys is that the normal path never moves a field the page has nowhere to put, which bounds what a delivery bug or a compromised frame can reach. The gates that actually decide whether anything is released remain the URL match, the pairing, and the vault lock.
- The picker opens only on real user activation (`navigator.userActivation`), so a page scripting `.focus()` on a crafted field cannot enumerate offers. It is also suppressed entirely on origins the user has paused, checked per frame against the background before it attaches and failing closed if that answer cannot be had.
- URL matching treats scheme and host as boundaries: an entry saved on `https://example.com` is never offered to `http://example.com` or a subdomain. Path never gates, only ranks.
- Messages from content scripts carry no authority. The background rechecks the browser-attested `sender` (tab, frame, URL) on every request; credential release for logins is keyed to the tab's top-level URL.

### A hostile iframe inside an honest page

- **Login lookups and fills are keyed on the asking frame's own origin**, taken from the browser-attested sender and never from the message. A cross-origin iframe therefore still cannot learn what the vault holds for the page embedding it: it can only ever see, and receive, the entry saved for its own site. This is what lets a bank that hosts its sign-in form on a sibling domain be filled at all, and it is safe in the direction that matters, because an attacker's frame only ever gets back the credential for the attacker's own origin.
- A cross-origin frame is reachable **only by picking inside it**. The toolbar popup speaks for the tab rather than for a frame, so it stays on the top document; releasing the top page's credential into a frame it does not own is the case the old blanket rule existed to prevent, and that case is still refused.
- Submit capture stays top-frame-or-same-origin. The save prompt renders in the top document and a captured credential is attributed to the page the user believes they are on, so a framed login can be filled but is not yet offered for saving.
- A login release reaches exactly one frame. An anchored pick names its frame on the message the browser attested; a popup pick discovers frames with a payload-free probe and refuses to release at all unless exactly one trusted frame answers.
- Card/address flows do run in cross-origin frames (payment processors live there). Guardrails: listing is URL-free metadata, offering requires user activation inside that frame, and delivery is fenced to the origin of the frame the user picked in. Each participating frame receives only the roles it declared it could fill, so a provider's split card form is completed without any one frame seeing the whole card. A popup-initiated card fill is broader by explicit user intent, and still requires an unambiguous card form per frame.
- Residual risk: a page that embeds an attacker iframe styled as its payment form can receive a card fill the user intends for the page. This is inherent to filling framed checkouts; a compromised checkout page could equally skim its own fields.

### An opportunistic local process (same machine, any user)

- The Unix socket lives in a per-user directory (`/tmp/buddy-{uid}`, mode 0700) that both ends refuse unless owned by the current user. A squatter causes a clean failure, never impersonation.
- On Windows the desktop asserts first instance on the pipe name, and the native host verifies the pipe server's executable is the installed Buddy desktop before sending a byte. A squatter yields denial of service, not credential theft.
- The desktop verifies the connecting peer is the installed native-host binary (uid + executable path). In release builds, "cannot verify" means "reject".
- Message sizes are capped on every hop.

### A malicious process running as the same user

**Out of scope, by design.** A same-user process can read the browser's extension storage, inject into the browser, replace binaries, or keylog. No local IPC scheme survives that. The honest statement of the guarantees:

- The pairing secret gates casual access: a process must have been approved once through the visible desktop modal (or steal the secret from extension storage, which requires the access above).
- Vault locking is the real boundary. A locked vault releases nothing regardless of pairing, peers, or sockets.
- Pairing approval is deliberate user sign-off, not cryptographic attestation: client identity (browser, version, extension ID) is self-reported. Unclaimed approvals expire after ten minutes and bind to the extension ID shown in the approval modal.

### A compromised extension update

Also largely out of scope: our own extension, updated maliciously, holds a valid pairing and the user's trust. Mitigations are operational (store review, publisher account hygiene, open source for scrutiny), plus: a major version bump re-enters the pairing ceremony, and the desktop's URL/capability gates still bound what any single request can extract.

## Token and session properties

- Fill tokens are 128-bit, single-use, short-lived, and wiped on vault lock. Redemption re-validates the URL server-side, so a tab that navigates elsewhere burns its session instead of carrying credentials to it.
- Nothing released is kept once it is written. A form that reveals a further field after a partial fill causes a fresh request for the new shape rather than a held remainder waiting in the page, which costs a round trip per reveal. For card and address fills, what survives between those requests is the section's identifiers and the frames the fill reached: metadata, never values.
- Every native response is validated against a closed schema for the request that asked for it: exact keys, capped lengths, and a field set that must be a subset of the requested slice. An unrecognised shape fails as `INVALID_RESPONSE` rather than being salvaged. The pairing secret is accepted only on the reply to an outstanding pairing request.
- The desktop-initiated `_bftk` token rides the URL fragment, which browsers never send to a server. A `document_start` content script lifts it out and rewrites the URL before any of the page's own scripts run, so the page cannot read it and never sees a fragment it would misparse. The token is claimed only from the top frame and only when it matches the exact shape the desktop mints.

## Known accepted limitations

- A same-user attacker is not stopped (see above); this matches every desktop-vault password manager.
- The badge and cached entry metadata are eventually consistent; a revision stamp on every reply bounds the staleness to the next interaction.
- Offscreen-positioned decoy fields (not display-hidden) can still be scored; the anchored-fill invariant bounds the damage to the form the user explicitly invoked.
- Denial of service by a local squatter (socket dir or pipe name) is detectable and logged but not preventable.
- A locally built extension carries the same id as the published one. The store's public key is committed here on purpose, so development builds exercise the real native-host path rather than a parallel one that could silently diverge, and the pairing modal therefore cannot tell a local build from the store build. The alternative, a second id the shipped desktop also trusts, would widen what a release binary accepts for no gain, since a contributor runs the shipped desktop and not a debug one. What bounds this is unchanged: loading an unpacked extension needs the local access already out of scope above, pairing still needs visible user approval, and the URL and capability gates still bound what any request can extract.
