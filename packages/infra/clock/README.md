# @omne-harness-lite/clock

[中文](README_ZH.md)

A unified clock service for operations that must use the same time source. It
returns epoch milliseconds through `Clock.now(): Instant | 'unavailable'` and
persists a lease before returning times within that lease. A backward wall-clock
step produces `'unavailable'` until the clock catches up, rather than returning a
smaller time.

This is currently a private, unpublished ESM workspace package. Use its public
package import from a workspace consumer after building the checkout; an npm
release is not available. See the [development guide](../../../docs/development.md)
for the Node and pnpm toolchain. The provider uses the shared
[storage protocol](../../core/storage/README.md); the examples use
[storage-sql](../storage-sql/README.md) with disposable SQLite files.

## Public API

| Purpose                    | Exports                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Direct provider            | `LeaseClock`, `LeaseClockOptions`, `ClockLogger`                                         |
| Time-source injection      | `TimeSources`, `systemTimeSources`                                                       |
| Startup rollback detection | `ClockRollbackDetected`, `isRolledBack`                                                  |
| Owned schema               | `clockMigrations`, `clockLeaseMigration`, `CLOCK_LEASE_TABLE`, `ClockLeaseTable`         |
| Lease settings             | `LEASE_WIDTH_MS` (10,000), `RENEW_PERIOD_MS` (3,333)                                     |
| Cordis integration         | `clockPlugin`, `ClockConfig`, `CLOCK_SERVICE` (`'clock'`)                                |
| Read-only validation       | `clockPreflight`, `CLOCK_PREFLIGHT_CHECK`, `clockSnapshotCheck`, `CLOCK_SNAPSHOT_TABLES` |

## Use the provider with a controlled time source

This example runs real SQLite storage while controlling the time readings. It
demonstrates the same rollback path used by the default system time source.
`upgrade: false` is for this disposable fixture; production storage should use an
owned upgrade guard.

```ts
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LeaseClock, clockMigrations, type TimeSources } from '@omne-harness-lite/clock'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'

const directory = await mkdtemp(join(tmpdir(), 'omne-clock-example-'))
let storage: SqlStorage | undefined
let clock: LeaseClock | undefined
let wall = 1_900_000_000_000
const sources: TimeSources = { wall: () => wall, monotonic: () => 0n }
try {
  storage = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'clock.sqlite'),
    migrations: composeMigrations(clockMigrations),
    upgrade: false,
  })
  clock = new LeaseClock({ storage, sources })
  assert.equal(clock.now(), 'unavailable')
  await clock.start()
  assert.equal(clock.now(), wall)
  wall -= 100
  assert.equal(clock.now(), 'unavailable')
  wall += 100
  assert.equal(clock.now(), wall)
  console.log(clock.now())
} finally {
  await clock?.close()
  await storage?.close()
  await rm(directory, { recursive: true, force: true })
}
```

The caller owns `start()` and `close()` when using `LeaseClock` directly. Close
the clock before its storage: closing clears the renewal timer, waits for its
scheduled renewal, and attempts to reclaim the lease it last wrote. It does not
close the supplied storage. Use one start/close lifecycle per instance and await
manually invoked `renew()` before closing.

## Provide the clock through Cordis

Merge the clock’s migrations with the application’s migrations, load storage,
then load the clock. This example uses the adopted Cordis 4.0.4 lifecycle API and
explicitly disposes the clock before storage.

```ts
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { CLOCK_SERVICE, clockMigrations, clockPlugin } from '@omne-harness-lite/clock'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { composeMigrations } from '@omne-harness-lite/storage'
import { createUpgradeGuard, storageSqlPlugin } from '@omne-harness-lite/storage-sql'

const directory = await mkdtemp(join(tmpdir(), 'omne-clock-plugin-example-'))
const ctx = new Context()
const guard = createUpgradeGuard()
let storageFiber: Fiber | undefined
let clockFiber: Fiber | undefined
try {
  storageFiber = ctx.plugin(storageSqlPlugin, {
    dialect: 'sqlite',
    file: join(directory, 'clock.sqlite'),
    migrations: composeMigrations(clockMigrations),
    upgrade: { checks: [], guard },
  })
  await storageFiber
  clockFiber = ctx.plugin(clockPlugin, {})
  await clockFiber
  const clock = ctx.get(CLOCK_SERVICE) as Clock | undefined
  assert.ok(clock)
  const now = clock.now()
  assert.notEqual(now, 'unavailable')
  const confirmation = await guard.confirm()
  assert.ok(!confirmation.snapshotTaken || confirmation.snapshotRemoved)
  console.log(now)
} finally {
  await clockFiber?.dispose()
  await storageFiber?.dispose()
  // Cordis logs disposer failures; retain the fixture if recovery is pending.
  assert.equal(await guard.pending(), 'clear')
  await rm(directory, { recursive: true, force: true })
}
```

`clockPlugin` requires the `storage` service and supplies `clock` only after
startup succeeds. Missing storage leaves its fiber pending; a startup exception
fails loading. Provider replacement causes Cordis to dispose and reload dependent
plugins. During operation, `'unavailable'` is a clock result: it does not remove
the service or dispose the plugin. Disposing it removes the provided service and
retained references return `'unavailable'`.

## Availability and persistence boundaries

Each `now()` reads the current wall clock. Successful readings from one running
instance never decrease and never exceed its known persisted lease. The
`monotonic` injection field remains part of `TimeSources`, but this implementation
does not use it to extrapolate time. `systemTimeSources` reads the environment;
it does not guarantee that the environment’s clock is accurate.

At startup, a wall reading earlier than persisted `written_at` throws
`ClockRollbackDetected`. After an unclean process restart, the clock can remain
unavailable while the wall clock catches up to the old lease, normally up to the
lease width. A forward step beyond the lease is unavailable until renewal;
correcting that step backward can cause a much longer wait.

Scheduled renewal failures are reported through `logger` and `onRenewFailure`.
A temporary storage failure can exhaust the lease; a `StorageDefect` latches the
clock unavailable and stops its timer. Explicit `renew()` failures reject to its
caller. Lease-reclamation failures during close are reported through the same
diagnostics. Callers must handle `'unavailable'` using their operation’s failure
policy and keep issuance and expiry checks on the same clock.

The restart guarantee depends on the persisted lease surviving. SQLite’s default
`synchronous: 'normal'` does not promise survival of recent commits after an OS
crash or power loss. `full` strengthens durability only when the storage stack
honors synchronization requests; physical power-loss behavior has not been
verified. This provider gives neither a real-time accuracy bound nor ordering
across independently running clock instances or distributed nodes. It owns one
storage-wide lease row, with no tenant-specific clock identity; applications own
tenant isolation and consumer policy.

`clockPreflight()` provides a read-only check for migration startup: absent table
or row passes, and a definite rollback refuses. `clockSnapshotCheck` checks a
SQLite snapshot’s clock table and persisted floor; it does not authorize reopening
an application from a snapshot.

For package development, run this member's `build`, `typecheck`, and `test`
scripts. Lease timing is fixed in this version; `ClockConfig` accepts only `{}`.
