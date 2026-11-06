# @omne-harness/telemetry-node

[中文](README_ZH.md)

The Node provider of engineering telemetry. The first version has local outlets only and does not export OTel traces or metrics. The root entry holds the runtime and the disabled implementation. `./cordis` holds two plugin factories and the Cordis log bridge. The command `omne-telemetry-summary` aggregates records offline into a hotspot report.

## Responsibility and status

This package implements the port of [telemetry-contract](../telemetry-contract/README.md). It checks each record, puts it in a bounded queue, drains the queue to a local outlet, keeps counts, and returns a `CloseReport` at close. The local outlet is a record writer that the application supplies (stdout or stderr), or a file that a Pino 10.4.0 synchronous destination writes.

Status: candidate, first version. The design basis is line B of [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md). RFC-0013 is not accepted, so every clause of [SPEC.md](SPEC.md) is a candidate. The runtime, the disabled implementation, the log bridge and the two plugins exist and have tests.

Named consumer: the application `apps/harness-server` creates the runtime, assembles the `telemetry` row, and closes the runtime explicitly in its shutdown step.

This package does not handle OTel traces and metrics, OTLP or `health()`. It does not handle output generations or the management plane. These items are deferred, see "Deferred items" in RFC-0013.

## Usage

The application creates the runtime and holds it:

```ts
import { randomBytes } from 'node:crypto'
import { createTelemetryRuntime } from '@omne-harness/telemetry-node'

const runtime = createTelemetryRuntime({
  generation: 'g1',
  instance: { owner: 'apps/harness-server', ref: 'run-1' },
  clock: { now: () => new Date(), monotonicMs: () => performance.now() },
  randomBytes: size => randomBytes(size),
  outlet: { kind: 'writer', write: record => writeRecord(record) },
  budgets: {
    maxRecordBytes: 16_384,
    maxQueueItems: 4096,
    maxQueueBytes: 8_388_608,
    maxOpenSegments: 1024,
    maxLogTextLength: 4096,
    summaryIntervalMs: 10_000,
    maxSegmentLifetimeMs: 3_600_000,
  },
  summary: line => process.stderr.write(`${line}\n`),
})

const report = await runtime.close(5000)
```

The budget numbers in the example are examples, not defaults. The six first-version budgets have no default: the application configuration supplies the numbers. `maxSegmentLifetimeMs` is optional and defaults to 3 600 000 ms (one hour), see SPEC.md TN-1 and TN-6.

Import the Cordis integration from `@omne-harness/telemetry-node/cordis`:

```ts
import {
  createCordisLogBridge,
  createTelemetryNodePlugin,
} from '@omne-harness/telemetry-node/cordis'

const bridge = createCordisLogBridge({
  bootstrapCapacity: 256,
  write: writeRecord,
  clock,
  maxTextLength: 4096,
})
root.logger.exporter(bridge.exporter)
await root.plugin(createTelemetryNodePlugin({ runtime }))
bridge.attach(runtime, { replayBootstrap: false })
```

Independent use needs the root entry only. The root entry does not import Cordis. An installation of this package brings `@deepseek-ai/cordis` and `pino`, because `dependencies` apply to the whole package.

A deployment without telemetry uses `createDisabledTelemetry()` and `createDisabledTelemetryPlugin({ runtime })`. The disabled implementation is a present provider. Each call answers `dropped(disabled)`, and the close report counts it.

### Offline hotspot report

The command `omne-telemetry-summary` reads JSON Lines (the stdout of `serve`, or the file of the `file` outlet). It prints a report with statistics per segment. In this repository, build the package first, then run the build output:

```sh
pnpm --filter @omne-harness/telemetry-node run build
node packages/telemetry/telemetry-node/dist/summary-cli.js telemetry.log
node packages/telemetry/telemetry-node/dist/summary-cli.js --json < telemetry.log
```

The default output is a table, with segments in descending p95 order. `--json` prints the machine-readable report. `--tenant`, `--from` and `--to` select records. The pure function `summarizeTelemetry`, exported from the root entry, holds the aggregation rules, see SPEC.md TN-11. [docs/flows.md](docs/flows.md) gives the steps and the use of a function-level CPU profile. The report is for the operator on the local host only.

## Contracts

- Public types: [src/index.ts](src/index.ts) and [src/cordis.ts](src/cordis.ts). The index is [docs/public-api.md](docs/public-api.md).
- Behavior beyond the types: [SPEC.md](SPEC.md). It owns the admission order, the record shape, the drain, the counts and the summary. It also owns segments, the rules of the close report, the disabled implementation, the log bridge, the plugins and the offline hotspot aggregation. The common rules of the port belong to the SPEC of telemetry-contract.
- Errors: `createTelemetryRuntime` throws `TypeError` for invalid options and `Error` for a file that does not open. Port operations, `ingestLog` and the exporter of the log bridge do not throw. `close` does not reject. `summarizeTelemetry` does not throw: it counts each invalid line in `skipped`. `omne-telemetry-summary` exits with code 2 for a usage error and with code 1 for input that it cannot read.
- Resources: the application holds the runtime and closes it explicitly. The runtime owns the file descriptor of the `file` outlet. The application owns the stream behind the `writer` outlet.

## Design

Four modules make the runtime. `options` checks the options. `pipeline` holds the queue, the counts, the summary and close. `outlet` wraps the two outlets. `emitter` implements the port. The offline aggregation is outside the runtime: `summary` is a pure function, and `summary-cli` is its command-line entry. See [docs/architecture.md](docs/architecture.md), [docs/object-model.md](docs/object-model.md) and [docs/flows.md](docs/flows.md).

## Configuration and operation

All configuration is the options of `createTelemetryRuntime` and of `createCordisLogBridge`. SPEC.md TN-1, TN-2 and TN-6 give the meaning and the failure behavior of each budget. The runtime needs Node 24 or later. The `file` outlet needs a writable path whose parent directory exists.

The application is responsible for these items:

- The check and the source of the configuration.
- The one writer of stdout.
- The shutdown order.
- The copy of the `CloseReport` and the bridge counts into its shutdown report.

## Verification

Run in the member directory:

```sh
NO_COLOR=1 pnpm exec vitest run --mode fast
pnpm run typecheck
```

The tests are unit tests and integration tests. The file outlet uses a real temporary file. The log bridge and the plugins use a real Cordis 4.0.4 `Context`. The real legal-identity package mints the scopes. `tests/summary.spec.ts` aggregates records that the runtime writes, and `tests/summary-cli.spec.ts` calls the command in the process. `tests/public-entry.spec.ts` reads the build output `dist`, so run `pnpm run build` first. Run `pnpm run lint:deps` in the repository root to check the dependency direction. Application assembly and the shutdown order are outside the coverage of this package.

## Maintenance

A change to the record shape, to the rules of the close report or to the states of the log bridge affects `apps/harness-server`. Change the SPEC.md clauses and the tests together. For a new outlet, add one `Outlet` in `outlet.ts`, and write its confirmation boundary and transport result in SPEC TN-4 and TN-7. `health()` is deferred with OTel. Do not add it before that work reopens.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Admission to outlet, close, the bridge states
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions, validation, and implementation
├── cordis.ts             Plugin factories and the log bridge entry
├── log-bridge.ts         The Cordis log bridge
├── summary.ts            Offline hotspot aggregation
└── summary-cli.ts        The command omne-telemetry-summary
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas (none yet)
verification/             models/ and proofs/ (none yet)
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources (none)
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths.
