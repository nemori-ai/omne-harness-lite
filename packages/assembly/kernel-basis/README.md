# @omne-harness/kernel-basis

[中文](README_ZH.md)

Cordis plugin helpers and test-only context assembly. The behavior contract is [SPEC.md](SPEC.md). The [#248 contract](https://github.com/nemori-ai/omne-harness-lite/issues/248#issuecomment-6176737639) is accepted. The root export is empty. `./cordis` exports `definePlugin`, `resolveOptional`, and the caller-fiber registration helper `registerInCallerFiber` with its `Admission` type ([#626 helper adoption](https://github.com/nemori-ai/omne-harness-lite/issues/626#issuecomment-6369465540)). `./testing` exports `startTestAssembly`. Operation results are in [`@omne-harness/operation-result`](../../common/operation-result/README.md).

## Responsibility and status

This member serves Cordis integration and tests. Its root entry is empty and does not import `@deepseek-ai/cordis`. The public surface is in `./cordis` and `./testing`. `./cordis` exports `definePlugin`, `resolveOptional`, `registerInCallerFiber` and `Admission`. `./testing` exports `startTestAssembly` for tests. Product source must not import `./testing`.

The package declares no service keys and does not take other capabilities' Service definitions. Cordis owns fiber state. The assembly close protocol owns product close order.

## Usage

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

`registerInCallerFiber(ctx, admit, withdrawal)` registers one contribution of a directory Service inside an effect of the calling fiber: `admit` runs synchronously once and answers `entered`, `recognised` or `refused`; only an entered entry keeps the effect, whose disposer calls `withdrawal(entry)` once. The result is an `Outcome` of `@omne-harness/operation-result`. The lifecycle and failure boundary are in [SPEC.md](SPEC.md#调用方-fiber-登记辅助).

`startTestAssembly` loads test plugins into a new Context and disposes the fibers it started, in reverse start order. Product source must not import `./testing`.

The root entry has no exports. A caller of `./cordis` uses Cordis 4.0.4 for validation, injection, and fiber lifecycle.

## Contracts

[SPEC.md](SPEC.md) owns `definePlugin`, `resolveOptional`, `registerInCallerFiber`, test assembly, the consumer table, and the Cordis evidence table. The result shapes and their constructors belong to `@omne-harness/operation-result`.

## Design

The root is empty. `./cordis` holds `definePlugin`, `resolveOptional` and `registerInCallerFiber`. Required dependencies go in `inject`. Optional dependencies use `resolveOptional` at the call. `./testing` holds `startTestAssembly`. Product source cannot import that entry.

Cordis still owns composition, dependency injection, and lifecycle. The assembly package still owns evaluation, adoption, handoff, and the lease close protocol.

## Configuration and operation

The package depends on `@deepseek-ai/cordis` 4.0.4, published from commit `d0dca04e22f09fe04967090b2ee70587ecdad6cc`. Installing this package installs Cordis and `@omne-harness/operation-result`, because `./cordis` returns `Outcome`. This package serves only Cordis integration and tests. A caller that needs only operation results installs `@omne-harness/operation-result`. This package adds no runtime configuration. Node.js `>=24.0.0` is the task rule for probes. This package's `engines` field is `>=24.18.0 <25`. That field is unchanged here. The engineering toolchain owns the engines edit.

## Verification

Unit and contract tests belong to this member. `./cordis` and `./testing` tests import the public entry and use Cordis 4.0.4, not a fake container. The root test asserts that the root has no runtime exports, and that the generated root files do not mention Cordis. `verification/cordis-4.0.4-probes.mjs` records the earlier Cordis 4.0.4 observations in SPEC.md. Integration and end-to-end tests do not apply. This package has no storage, application service, or user journey.

## Maintenance

Accepted changes to the public contract land in SPEC.md first, then in both READMEs. Cross-member architecture pages stay with their owner.
