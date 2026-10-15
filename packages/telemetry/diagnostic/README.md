# @omne-harness/diagnostic

[中文](README_ZH.md)

Bounded failure-chain port. Issue #275 owns this member.

## Responsibility and status

Storage callers and later model callers pass a failure chain in beside their own result. This package admits, reads, and closes that chain. It does not replace `CommitResult`, assembly `CloseReport`, or a storage `incomplete` result.

Implemented: `createDiagnosticPort`, `keepBusinessResult`, and the public result types. The package tests cover queue, byte, and in-flight refusal, export failure, a missing sink, tenant denial, and close. PanQiWei authorized this member for the #275 delivery on 2026-10-15. Event names, retention duration, and production numeric limits are not accepted. This package does not import the OpenTelemetry SDK, Pino, Cordis, or either legacy tree.

## Usage

```ts
import { createDiagnosticPort, keepBusinessResult } from '@omne-harness/diagnostic'

const port = createDiagnosticPort({
  bounds: {
    profile: 'local',
    os: 'Darwin',
    node: 'v24.18.0',
    load: 'one-commit',
    overLimit: 'reject',
    maxQueue: 8,
    maxExportBytes: 4096,
    maxInFlight: 1,
  },
  sink: {
    async export(record, signal) {
      if (signal.aborted) throw new Error('closed')
      await send(record)
    },
  },
  closeDeadlineMs: 50,
})

const outcome = keepBusinessResult(commitResult, port, {
  chain: { causes: [{ role: 'origin', summary: commitResult.kind }] },
  correlation: { tenant: identity.tenant },
})
```

The caller supplies `sink`. A null sink records a visible gap and still returns the business value. `close` returns a diagnostic report. The caller closes the business resource without awaiting that promise. There is no `./cordis` entry. `package.json` `files` publishes `dist` only.

## Contracts

`src/types.ts` holds the public shapes. `admit` returns `accepted`, `rejected`, or `gap`. Rejection reasons are `queue_full`, `bytes_full`, `in_flight_full`, and `closed`. A chain starts with one `origin`. Further caller causes are `attached`. Only the port appends `export`.

`read` returns the chain only when the requested tenant equals the stored tenant. A mismatch is `denied` and includes no chain. Detail keys `secret`, `token`, and `authorization` are removed at admission.

`close` reports the last record, flush, and transport separately. A deadline is `deadline` on flush and transport, not export success. A second `close` returns the same report. This report is not an assembly `CloseReport`.

## Design

One port owns the in-memory queue, the byte count, and the in-flight count. Callers do not share that map. The sink is the only export adapter. Over-limit behavior in this member is reject. A new record that does not fit is not stored. An admitted record stays until export, export failure, or close.

## Configuration and operation

`profile`, `os`, `node`, and `load` are required non-empty strings. `maxQueue`, `maxExportBytes`, and `maxInFlight` must be finite positive numbers. `overLimit` is `reject` only. `closeDeadlineMs` must be a finite non-negative number. The package has no production default for any of these. The caller names the deployment profile those numbers belong to. Node engines for this package follow the existing new-package range `>=24.18.0 <25`.

## Verification

From this directory, `pnpm test` builds and runs the public-entry test and `tests/diagnostic-port.spec.ts`. Those tests use a synthetic sink. They do not prove that a real log backend exits. They do not choose production limits.

## Maintenance

A change to `AdmitResult`, `FailureChain`, or `DiagnosticCloseReport` must update this README, `README_ZH.md`, and `tests/diagnostic-port.spec.ts`. Storage and model packages should import this root when they gain a real caller. They should not copy the queue. Unknown items remain the event catalog, retention duration, and a production profile's numeric limits.
