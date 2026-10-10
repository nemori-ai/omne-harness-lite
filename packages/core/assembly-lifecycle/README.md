# @omne-harness-lite/assembly-lifecycle

[中文](README_ZH.md)

An explicit completion owner for an ordered assembly generation. It stops admission and waits for registered work to close in reverse order.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/assembly-lifecycle": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                                  | Purpose                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `createAssemblyLifetime`, `AssemblyLifetime`                                            | Create, claim and close one generation            |
| `AssemblyLifetimePort`, `OwnedWork`, `LifetimeRegistration`                             | Row-scoped admission and actual completion        |
| `AssemblyCloseReport`, `CloseResult`                                                    | Completion results with classified failures       |
| `AssemblyWorkStopped`                                                                   | Use error when managed work starts after stopping |
| `createRetainedWork`, `RetainedCloseControl`, `RetainedCloseAttempt` | Keep an unconfirmed original close pending and explicitly retry it |
| `./cordis`: `AssemblyLifetimeService`, `ASSEMBLY_LIFETIME_SERVICE`, `startAssemblyWork`, `startRetainedAssemblyWork` | Inject a row port and register actual work |

## Example

```ts
import assert from 'node:assert/strict'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'

const closed: string[] = []
const lifetime = createAssemblyLifetime(['database', 'consumer'], () => {})
assert.equal(lifetime.tryClaim(), true)
for (const id of lifetime.ids) {
  lifetime.port(id).register({
    ready: Promise.resolve(),
    async close() {
      closed.push(id)
    },
  })
}
const report = await lifetime.close()
assert.equal(report.complete, true)
assert.deepEqual(closed, ['consumer', 'database'])
assert.equal(lifetime.isCurrent(), false)
```

This example registers synthetic owners. Real owners must make `close()` wait for their resources and admitted work. Claim the lifetime before registration.

## Boundaries and lifecycle

Each lifetime permits one claim. Do not reuse it for provider replacement. Row ports share the generation stop state and identify close responsibility. They do not authorize tenants.

The stop callback runs after admission stops. It does not represent completed shutdown. Inspect the close report before releasing dependencies. A failed close cannot become a successful completion through Cordis fiber disposal.

This package does not discover plugins, roll back committed business data or schedule Session work. The ordering and failure contract belongs to [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/assembly-lifecycle run build
pnpm --filter @omne-harness-lite/assembly-lifecycle run typecheck
pnpm --filter @omne-harness-lite/assembly-lifecycle run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [Plugin tree loader](../cordis-plugin-tree/README.md)

## Current mechanism and architecture gap

The current coordinator fixes one row set and permits one claim. Duplicate registration, registration after stopping, setup failure, row removal, failed managed binding, and invalid retained-close delivery request a generation stop. The first stop invalidates every row port. Replacement currently waits for the old generation to close and uses a new coordinator.

This describes the current mechanism, not the system deployment policy. Placing unrelated capabilities in one coordinator makes a local removal stop unrelated admission. That conflicts with [local dependency scope](../../../docs/architecture/deployment/cordis-and-lifecycle.md#依赖换代与就绪) and [reload continuity](../../../docs/architecture/runtime/assembly-and-change.md#reload-与推进权交接). Assembly and mechanism owners must define the affected scope and transfer of admitted work. This documentation change does not change product code or resolve the gap.

Current governance bindings retain CLS until CG finishes its local CAS and verification, and retain SQL until identity and governance work completes after scrypt. These drain paths do not require unrelated capabilities to stop. [Verification](verification/README.md) separates mechanism regression from target conformance.
