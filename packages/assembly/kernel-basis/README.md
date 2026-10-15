# @omne-harness/kernel-basis

[中文](README_ZH.md)

Shared operation results, Cordis plugin helpers, and test-only context assembly. The behavior contract is [SPEC.md](SPEC.md). The [#248 contract](https://github.com/nemori-ai/omne-harness-lite/issues/248#issuecomment-6176737639) is accepted. `./cordis` exports `definePlugin` and `resolveOptional`. Root operation results and `./testing` are not implemented.

## Responsibility and status

This member has three public entries for business packages. `./cordis` exports `definePlugin` and `resolveOptional`. The root does not import `@deepseek-ai/cordis`. Root operation results are not implemented. `./testing` is a registered entry without a named consumer, so it is not implemented.

The package declares no service keys and does not take other capabilities' Service definitions. Cordis owns fiber state. The assembly close protocol owns product close order.

## Usage

Root operation results are not implemented. The accepted shapes are below, and this package does not export them.

```ts
import { ack, fail, isSuccess, succeed } from '@omne-harness/kernel-basis'

const valued = succeed({ id: 'job-1' })
const empty = ack()
const broken = fail('rejected' as const)

isSuccess(valued) // true, valued.ok is { id: 'job-1' }
isSuccess(empty) // true, empty.ok is true
isSuccess(broken) // false
```

Plugin helpers from `./cordis`:

```ts
import { definePlugin, resolveOptional } from '@omne-harness/kernel-basis/cordis'

const plugin = definePlugin({
  name: 'example',
  Config: {
    '~standard': {
      version: 1 as const,
      vendor: 'example',
      validate: (value: unknown) => ({ value: value as { timeoutMs: number } }),
    },
  },
  inject: ['clock'],
  apply(ctx, config) {
    const optional = resolveOptional<{ ping(): void }>(ctx, 'probe')
    optional?.ping()
    void config.timeoutMs
  },
})
```

`./testing` is not implemented. Product source must not import it.

A caller that imports only the root does not start Cordis. A caller of `./cordis` uses Cordis 4.0.4 for validation, injection, and fiber lifecycle.

## Contracts

[SPEC.md](SPEC.md) owns the result shapes, `definePlugin`, `resolveOptional`, test assembly, the consumer table, and the Cordis evidence table.

`Outcome<T, F>` is `{ ok: T } | { failure: F }`. `Ack<F>` is `{ ok: true } | { failure: F }`. `F` belongs to the caller. `isSuccess` is true when the object has `ok`.

## Design

The root does not import Cordis. `./cordis` holds `definePlugin` and `resolveOptional`. Required dependencies go in `inject`. Optional dependencies use `resolveOptional` at the call. `./testing` is not implemented. Product source cannot import that entry.

Cordis still owns composition, dependency injection, and lifecycle. The assembly package still owns evaluation, adoption, handoff, and the lease close protocol.

## Configuration and operation

The package depends on `@deepseek-ai/cordis` 4.0.4, published from commit `d0dca04e22f09fe04967090b2ee70587ecdad6cc`. Installing this package also installs Cordis, even for a root-only caller. This package adds no runtime configuration. Node.js `>=24.0.0` is the task rule for probes. This package's `engines` field is `>=24.18.0 <25`. That field is unchanged here. The engineering toolchain owns the engines edit.

## Verification

Unit and contract tests belong to this member. `./cordis` tests import the public entry and use Cordis 4.0.4, not a fake container. The root test asserts that the root module does not export `definePlugin` or `resolveOptional`, and that the generated root files do not mention Cordis. `./testing` is not implemented. `verification/cordis-4.0.4-probes.mjs` records the earlier Cordis 4.0.4 observations in SPEC.md. Integration and end-to-end tests do not apply. This package has no storage, application service, or user journey.

## Maintenance

Accepted changes to the public contract land in SPEC.md first, then in both READMEs. Root operation results and `./testing` stay out of the package until a named consumer exists. Cross-member architecture pages stay with their owner.
