# Security Policy

## Supported Versions

Security fixes target the latest supported release line. The planned `1.0.0`
release is the first stable line for the public SDK, CLI, and capsule contract.

| Version | Supported |
|---------|-----------|
| 1.x | Yes, after first stable publication |
| 0.x | Best effort before 1.0.0 |

## Reporting A Vulnerability

Do not file public issues for vulnerabilities involving capsule replay,
untrusted capsule parsing, URL restoration, credential exposure, or package
supply-chain compromise.

Report privately by email:

- `pie.vyas@gmail.com`

Please include:

- affected package and version
- reproduction steps or proof of concept
- expected impact
- whether the issue involves a public capsule, private capsule, or live browser
  session

You should receive an acknowledgement within 7 days. Confirmed high-impact
issues will be handled with a coordinated fix, changelog entry, and release.

## Threat Model Summary

DBAR handles sensitive browser evidence and may replay capsule-provided state.

Main untrusted inputs:

- serialized `.capsule` files
- capsule manifest fields
- archived response bodies and snapshots
- URLs captured in browser state
- assertion files passed to `dbar eval`

Current mitigations:

- capsule structure is validated before use
- dangerous state-restoration protocols are blocked
- common cloud metadata hosts are blocked during state restoration
- known auth headers are redacted in root capsule validation warnings
- Browserbase `connectUrl` values are masked by the integration
- no browser-harness dependency or backend is part of the trusted runtime

Residual risks:

- capsules can still contain cookies, localStorage values, URL query values,
  response bodies, screenshots, and PII
- DBAR is not a sandbox for replaying hostile content
- unsupported browser surfaces such as service workers, WebSockets, SSE,
  IndexedDB, and downloads are outside the 1.0.0 deterministic replay contract

Replay untrusted capsules only in isolated browser profiles and networks.
