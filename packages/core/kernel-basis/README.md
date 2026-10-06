# @omne-harness-lite/kernel-basis

[中文](README_ZH.md)

Small reusable helpers for plugins using the official `@deepseek-ai/cordis` 4.0.4 kernel: typed operation outcomes, plugin definitions, optional service lookup, fiber state checks, and a separate test assembly entry.

## Workspace use

This is an experimental, private workspace package, currently not published on npm. In a repository checkout, use the [development setup](../../../docs/development.md), build the workspace, and declare `"@omne-harness-lite/kernel-basis": "workspace:*"` in the consuming member. Declare other packages imported by an example as direct dependencies too. Import through the public package entry; do not import sibling `src/` paths.

## Public API

| Entry        | Public API                                                  |
| ------------ | ----------------------------------------------------------- |
| Package root | `Outcome<T, F>`, `Ack<F>`, `succeed`, `fail`, `isSuccess`   |
| `./cordis`   | `PluginDefinition<C>`, `definePlugin`, `resolveOptional<T>` |
| `./cordis`   | `FIBER_STATE`, `FiberStateValue`, `fiberIsActive`           |
| `./testing`  | `bootAssembly`, `settle`, assembly types and `FIBER_STATE`  |

Import `Context`, `Fiber` and other Cordis primitives from `@deepseek-ai/cordis` directly. This package does not re-export them or register a service. `Config` accepts Standard Schema v1 validators; the examples use Zod.

The root entry has no Cordis dependency in its source, declarations or runtime imports.
Use `./cordis` for plugin and Fiber helpers. Their behavior is unchanged.

## Examples

Each TypeScript example is self-contained and uses the built public exports.

### Define a plugin and manage its service lifetime

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin, fiberIsActive, resolveOptional } from '@omne-harness-lite/kernel-basis/cordis'

class Greeting extends Service {
  static readonly provide = 'greeting'
  constructor(ctx: Context, private readonly prefix: string) {
    super(ctx, Greeting.provide)
  }
  greet(name: string): string { return `${this.prefix}, ${name}` }
}

const greeting = definePlugin({
  name: 'greeting',
  Config: z.object({ prefix: z.string().min(1) }),
  apply(ctx, config) {
    new Greeting(ctx, config.prefix)
  },
})
const ctx = new Context()
const fiber = ctx.plugin(greeting, { prefix: 'Hello' })
try {
  await fiber
  const service = resolveOptional<Greeting>(ctx, Greeting.provide)
  if (service === undefined) throw new Error('greeting unavailable')
  console.log(service.greet('Ada')) // Hello, Ada
  console.log(fiberIsActive(fiber.ctx)) // true
} finally {
  await fiber.dispose()
}
console.log(resolveOptional(ctx, 'greeting')) // undefined
```

### Keep operation failures explicit

```ts
import { fail, isSuccess, succeed, type Outcome } from '@omne-harness-lite/kernel-basis'

function lookup(available: boolean): Outcome<string, 'unavailable'> {
  return available ? succeed('ready') : fail('unavailable')
}
const result = lookup(false)
if (isSuccess(result)) console.log(result.ok)
else console.log(result.failure) // unavailable
```

### Assemble a test with required dependencies

```ts
import { z } from 'zod'
import { definePlugin, resolveOptional } from '@omne-harness-lite/kernel-basis/cordis'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'

const plugin = definePlugin({
  name: 'uses-settings',
  inject: ['settings'],
  Config: z.object({}),
  apply(ctx) {
    const settings = resolveOptional<{ greeting: string }>(ctx, 'settings')
    if (settings === undefined) throw new Error('settings unavailable')
    ctx.provide('message', settings.greeting)
  },
})
const assembly = await bootAssembly({
  services: [{ name: 'settings', value: { greeting: 'Hello' } }],
  plugins: [{ plugin, config: {} }],
})
try {
  console.log(resolveOptional<string>(assembly.ctx, 'message')) // Hello
} finally {
  await assembly.dispose()
}
```

The existing helper commitments are in [SPEC.md](SPEC.md).

## Boundaries and failures

These helpers adopt Cordis **4.0.4** semantics. Required `inject` dependencies keep a fiber pending when absent; replacing their provider unloads and reruns the plugin body. `resolveOptional` reads at call time, returns `undefined` for absent or non-active providers, and does not establish a required dependency. Its generic type is a caller assertion, not service validation. Config or plugin-body failures reject `await fiber`; config failure occurs before the body runs.

`ctx.provide` is effect managed. `isolate` controls service-instance visibility, not data or tenant authorization. Use `serial` for asynchronous control: `bail` treats a Promise itself as a bail value and does not await listeners. Fiber disposal drives separate effects concurrently; disposer failures can be logged without rejecting disposal. Do not infer ordered or successful resource cleanup from `dispose()` alone.

`FIBER_STATE` mirrors 4.0.4's const-enum values: `PENDING=0`, `LOADING=1`, `ACTIVE=2`, `FAILED=3`, `DISPOSED=4`, `UNLOADING=5`. Recheck the package's kernel probes when upgrading Cordis. Test assembly rejects startup failures or missing required dependencies and disposes loaded fibers in reverse order. It does not close the resource objects supplied through `services`; their owner must do so. `./testing` is for tests, not product runtime code.

## Development

```sh
pnpm --filter @omne-harness-lite/kernel-basis run build
pnpm --filter @omne-harness-lite/kernel-basis run typecheck
pnpm --filter @omne-harness-lite/kernel-basis run test
```

Build workspace dependencies first. These checks cover this package; integration behavior requires the actual consumer and provider.
