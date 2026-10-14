# @omne-harness/kernel-basis

[中文](README_ZH.md)

Shared operation results, Cordis plugin helpers, and test-only context assembly. The behavior contract is [SPEC.md](SPEC.md). It is a candidate for issue #248. It is not an accepted implementation, and `src` still exports nothing.

## Responsibility and status

This member owns three public entries for business packages. The root exports operation results and does not import `@deepseek-ai/cordis`. `./cordis` exports `definePlugin` and `resolveOptional`. `./testing` assembles a Context for tests.

The package declares no service keys and does not take other capabilities' Service definitions. Cordis owns fiber state. The assembly close protocol owns product close order. Probe files remain in the legacy tree until #270.

#270 implements the signatures below. Importing them today fails because the entries export nothing.

## Usage

Root, after #270 replaces the empty export:

```ts
import { ack, fail, isSuccess, succeed } from '@omne-harness/kernel-basis'

const valued = succeed({ id: 'job-1' })
const empty = ack()
const broken = fail('rejected' as const)

isSuccess(valued) // true, valued.ok is { id: 'job-1' }
isSuccess(empty) // true, empty.ok is true
isSuccess(broken) // false
```

Plugin helpers:

```ts
import { definePlugin, resolveOptional } from '@omne-harness/kernel-basis/cordis'

const plugin = definePlugin({
  name: 'example',
  Config: exampleSchema,
  inject: ['clock'],
  apply(ctx) {
    const optional = resolveOptional<{ ping(): void }>(ctx, 'probe')
    optional?.ping()
  },
})
```

`./testing` loads plugins into a Context for one test and disposes the fibers it started. Product source must not import it. #270 chooses the export name.

A caller that imports only the root does not start Cordis. A caller of `./cordis` uses Cordis 4.0.4 for validation, injection, and fiber lifecycle.

## Contracts

[SPEC.md](SPEC.md) owns the result shapes, `definePlugin`, `resolveOptional`, test assembly, the consumer table, and the Cordis evidence table.

`Outcome<T, F>` is `{ ok: T } | { failure: F }`. `Ack<F>` is `{ ok: true } | { failure: F }`. `F` belongs to the caller. `isSuccess` is true when the object has `ok`.

## Design

The root does not import Cordis. A package can return a result without loading the kernel. `./cordis` holds `definePlugin` and `resolveOptional`. Required dependencies go in `inject`. Optional dependencies use `resolveOptional` at the call. `./testing` gives tests one Context startup. Product source cannot import that entry.

Cordis still owns composition, dependency injection, and lifecycle. The assembly package still owns evaluation, adoption, handoff, and the lease close protocol.

## Configuration and operation

The candidate pin is `@deepseek-ai/cordis` 4.0.4, published from commit `d0dca04e22f09fe04967090b2ee70587ecdad6cc`. Installing this package also installs Cordis, even for a root-only caller. This package adds no runtime configuration. Node.js `>=24.0.0` is the task rule for probes. This package's `engines` field still says `>=24.18.0 <25`. That field is unchanged here. The engineering toolchain owns the engines edit.

## Verification

Unit and contract tests belong to this member. #270 tests the three entries from the public imports. Root tests do not start Cordis. `./cordis` tests use Cordis 4.0.4, not a fake container. `./testing` tests show that the helper disposes fibers it started and does not close resources the caller passed in.

The current tests only assert that the draft exports nothing. They do not prove the candidate contract. `verification/cordis-4.0.4-probes.mjs` records the Cordis 4.0.4 observations in SPEC.md. Integration and end-to-end tests do not apply. This package has no storage, application service, or user journey.

## Maintenance

Accepted changes to the public contract land in SPEC.md first, then in both READMEs. #270 implements the exports, chooses the `./testing` name, and moves the probe files. Cross-member architecture pages stay with their owner. A helper with no accepted consumer does not enter the public package.
