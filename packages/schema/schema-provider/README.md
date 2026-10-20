# @omne-harness/schema-provider

[中文](README_ZH.md)

This package checks one `JsonRead` and caches the compiled artifact for one execution domain. Public types live in `src/index.ts`. Behavior that types do not express lives in [SPEC.md](SPEC.md). Module structure lives in [docs/architecture.md](docs/architecture.md).

The root entry implements the static validation, admission, cache, and lease behavior in [SPEC.md](SPEC.md). Dynamic profiles remain closed. Snapshot counts do not bound compilation memory.

## Responsibility and status

This package is the Schema provider. The scope is [the technical foundation](../../../docs/architecture/technical-foundations.md#schema提供者的检查与准入).

It does not read text, own business shapes, or check Cordis plugin configuration. The root entry does not import Cordis.

## Usage

The execution domain creates one provider and passes that same object to callers in the domain. Every budget field is required. This package supplies no default magnitudes.

```ts
import { readJsonText } from "@omne-harness/json-text"
import {
  createSchemaProvider,
  defineSchema,
  validate,
  zodDefinition,
} from "@omne-harness/schema-provider"

const provider = createSchemaProvider({
  maxSnapshots: 32,
  maxConstructDepth: 32,
  maxConstructNodes: 256,
  failureBackoffMs: 50,
  maxAttempts: 3,
})

const chatMessage = defineSchema({
  id: "chat.message",
  load: async () =>
    zodDefinition({
      revision: "3",
      numbers: "exact-or-reject",
      schema: chatMessageZod,
    }),
})

const read = readJsonText(text, limits)
const verdict = await validate(provider, chatMessage, read)
```

`lease` holds one snapshot for repeated synchronous `check` calls. A shape owner calls `refresh` when publishing a new revision. The execution domain calls `close` to stop new admission.

## Contracts

The root entry owns the public shape. Results, refusal, cancellation, and slots are in [SPEC.md](SPEC.md).

`valid.value` is the projected value. This package discards engine output. Callers use `SchemaIssue.code` and `path`. They do not parse prose.

## Design

One execution domain has one `SchemaProvider`. Each shape id has one slot. The slot stores the current snapshot, at most one in-flight task, the failure record, and old snapshots that still have leases. The module split is in [docs/architecture.md](docs/architecture.md).

## Configuration and operation

The execution domain passes `SchemaBudget`. `maxSnapshots` counts entries. It is not a byte size. Dynamic schemas stay closed until a full compile-memory bound exists.

This package requires Node.js `>=24.18.0 <25`, the same range as the template and `@omne-harness/json-text`. Backoff is read on the next call. The package has no timer.

## Verification

turbo builds first, then runs vitest: `pnpm turbo run test --filter=@omne-harness/schema-provider`. `pnpm test` in this directory runs vitest only and does not build. The tests call the public exports. They observe how many times `load` runs, and the returned `kind`, `reason`, `path`, `issues`, `value`, and `superseded`.

The tests cover these behaviors:

- The root entry exports the public function names.
- A strict object returns `valid` with the projected value. `.default` returns `refused` with `unsupported-construct`. A failed `JsonRead` returns `unreadable` and the original failure.
- Two overlapping first checks of one id call `load` once. Aborting one caller returns `cancelled` for that caller. The other check uses the shared snapshot.
- A compile failure returns `unavailable` with `compile-failed` until `failureBackoffMs` has elapsed. After `maxAttempts`, the result is `refused` with `attempts-exhausted`.
- `close` makes a later `validate` return `refused` with `closed`. A second `close` stays closed. A check that already joined finishes on the snapshot it joined.
- `exact-or-reject` returns `precision` when an integer cannot be a JavaScript number. An exact integer stays that number. `lexeme` passes the source lexeme to the checker, and `valid.value` is that lexeme.
- `lease` checks the admitted revision. After `refresh`, a new `validate` uses the new revision, `superseded` is true, and the outstanding `check` still returns the old revision.
- With `maxSnapshots` set to the leased snapshot alone, a new shape returns `refused` with `budget-exhausted`. The outstanding `check` still succeeds.
- An acyclic JSON Schema returns `valid` or `invalid` with `path` `compiled`. A cyclic JSON Schema returns `refused` with `runtime-path-closed`. Ajv runs with coercion, defaults, and removal of additional keys disabled.
- An invalid result uses only `type`, `empty`, `precision`, `constraint`, or `unrecognized-key`. Each issue has `path` and `code`.

This package has no end-to-end journey and no storage service, so it has no integration test and no end-to-end test.

## Maintenance

When a public result or refusal reason changes, update `SPEC.md`, the root entry, and the tests together. Field changes in a business shape stay with that shape's owner. Do not move plugin-config checks or text formatting into this package.
