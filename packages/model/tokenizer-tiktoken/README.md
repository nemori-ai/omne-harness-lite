# @omne-harness/tokenizer-tiktoken

[中文](README_ZH.md)

## Responsibility and status

This package runs exact tiktoken counts in a bounded worker pool. The host supplies fixed family resources and explicit limits. Each family meter acquires a private lease. The package holds no vendor vocabulary and does not decide request permissions or complete input budgets.

| Capability                                                   | Verification                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| Asynchronous executor, private leases, physical close        | Real worker tests and controlled lifecycle faults             |
| Resource identity, Unicode, adjacent text and special tokens | Real js-tiktoken 1.0.21 with o200k and synthetic ranks        |
| Exact regex-piece reuse with bounded lease caches            | Cache isolation, eviction and fixed-oracle differential tests |
| Built worker entry in another process and directory          | Published-output and bounded regression tests                 |

Application load, family integration and the local pre-send latency target require their own combined verification. Package tests do not establish those results.

## Usage

The host supplies `resources` and every field of `limits`. A family supplies the exact adopted `definition`. The controller belongs to the lease owner:

```ts
import { createTiktokenExecutor } from '@omne-harness/tokenizer-tiktoken'

const created = await createTiktokenExecutor({ resources, limits })
if ('failure' in created) throw new Error(created.failure.kind)
const executor = created.ok
try {
  const acquired = executor.acquire(definition, controller.signal)
  if ('failure' in acquired) throw new Error(acquired.failure.kind)
  try {
    const result = await acquired.ok.tokenizer.count([{ kind: 'text', text: 'hello world' }])
    if ('failure' in result) throw new Error(result.failure.kind)
    useCount(result.ok.tokens)
  } finally {
    await acquired.ok.release()
  }
} finally {
  await executor.close()
}
```

Long-lived hosts share the executor across consumers and close it only during host shutdown. Families release their own leases. The Cordis entry exposes only borrowing methods; see [Cordis integration](docs/cordis.md).

## Contracts

[SPEC](SPEC.md) owns resource checks, exact counting, admission limits, cache ownership and physical cleanup. [model-contract](../model-contract/SPEC.md#分词与完整请求计量) owns the tokenizer types and common counting rules. [Public API](docs/public-api.md) indexes source definitions.

## Design

The main thread owns admission, deadlines and worker generations. Workers own vocabulary parsing, BPE and private lease caches. A lease stays on one slot, so its cache quota cannot multiply across workers. [Architecture](docs/architecture.md), [flows](docs/flows.md) and [object model](docs/object-model.md) describe the implementation.

## Configuration and operation

`createTiktokenExecutor` accepts a fixed resource array and explicit limits. The package provides no defaults. Limits cover workers, live leases, queued jobs and bytes, input size, caches, timeout, worker heap and replacement rate.

Input and cache accounting use retained UTF-16 plus object overhead, not UTF-8 size or RSS. Counts return Promises. Cancellation can return a failure before physical work ends; release waits for cleanup and close waits for actual thread exit. Node.js 24 or later is required.

## Verification

Run these commands from this member after workspace dependencies are built:

```sh
pnpm run build
pnpm run typecheck
pnpm exec vitest run --mode fast --maxWorkers=1
pnpm exec vitest run --mode slow --maxWorkers=1
```

[Tests](tests/README.md) states the real dependencies, fault seam and coverage limits. The worker tests create at most two workers per executor. They make no network requests.

## Maintenance

Keep resource digests, fixed engine adoption, count semantics and all family consumers consistent when upgrading the engine. Update SPEC and the matching tests when limits or lifecycle behavior change. The root entry must not import Cordis; the separate Cordis entry owns its service definition. Root assembly owns thread shutdown.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Key business flows and data flows
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
