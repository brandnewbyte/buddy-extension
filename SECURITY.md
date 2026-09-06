# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Send reports to `support@pwbuddy.com` with the subject **Security report**. If
possible, include the affected version or commit, reproduction steps, impact,
and any suggested mitigation. We will acknowledge receipt and coordinate a
responsible disclosure timeline with you.

The canonical reporting details are published at
<https://pwbuddy.com/.well-known/security.txt>.

## Scope

This repository is the browser extension. It owns no vault and stores no
secrets at rest: the desktop application holds the vault, and the extension
reaches it through a native-messaging host over a local socket. Findings in the
desktop application, the native host, or the vault format belong at the same
address — one report, one thread, wherever the bug turns out to live.

[`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) states what this extension is
designed to resist and what it explicitly does not, and the invariants in the
README are the properties most worth attacking: frame trust, anchored fills,
and the single-use tokens behind every release of a credential.

## Current status

This extension has not yet completed an independent third-party audit. Public
source, tests, and reproducible builds improve inspectability but are not a
security certification.

Released packages are reproducible: the same source produces byte-identical
packages, so a build you make yourself can be compared against what the stores
distribute. See [Verifying a published package](README.md#verifying-a-published-package).
