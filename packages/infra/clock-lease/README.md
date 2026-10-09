# @omne-harness-lite/clock-lease

[中文](README_ZH.md)

An asynchronous Clock provider with a durable time floor. `await clock.now()` returns
current wall-clock milliseconds or `'unavailable'`. A backward clock step remains
visible. The provider never invents a later time to hide it.

This private ESM package requires Node 24, Linux, and util-linux `flock` on PATH.
It uses [storage-sql](../storage-sql/README.md) for asynchronous SQLite operations.
See [SPEC.md](SPEC.md) for behavior and [the development guide](../../../docs/development.md)
for workspace commands.

## Open an independent resource

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLeaseClock } from '@omne-harness-lite/clock-lease'

const directory = await mkdtemp(join(tmpdir(), 'omne-clock-example-'))
const file = join(directory, 'clock.sqlite')
const clock = await openLeaseClock({ file, initialize: {} })
try {
  console.log(await clock.now())
  console.log(await clock.checkpoint())
} finally {
  await clock.close()
  await rm(directory, { recursive: true, force: true })
}
```

Use `initialize` only for explicit creation or migration. Omit it when opening an
existing resource. A missing manifest or initialized database causes startup to
fail. Preserve the database and its `.clock.json` manifest together.

`initialize.floor` imports a legacy or backup `ClockCheckpoint`. `minimum` adopts
a backup floor when opening an existing resource. Both complete before the clock
can return time. Adoption never reduces an existing higher floor.

The resource owns its storage and closes it after the clock stops and drains.
SQLite uses FULL durability. This depends on the storage stack honoring sync;
the tests do not prove physical power-loss behavior.

## Integrate through Cordis

`clockPlugin` and `managedClockPlugin` are exported from `./cordis`. They supply
`CLOCK_SERVICE` from `@omne-harness-lite/offer-expiry/cordis`.

```ts
const fiber = ctx.plugin(clockPlugin, {
  file: '/private/deployment/clock.sqlite',
  initialize: true, // Explicit first creation or legacy migration only.
})
await fiber
const time = await ctx.clock.now()
```

The plugin injects `storage` for the legacy floor during explicit initialization.
Include `clockMigrations` in the business migration history for this import.
Running requests use the independent clock database. They can await the clock
inside a business write transaction without waiting for that same write lock.

`managedClockPlugin` also injects the assembly lifetime. It retains startup and
real shutdown through that owner. Runtime unavailability does not dispose the
plugin. Retained references return unavailable after shutdown begins.

## Algorithm and boundaries

Each request samples the wall clock. If the confirmed durable range still covers
that sample, no database operation is needed. Otherwise, concurrent requests share
one durable reservation and sample again after it completes. A request makes at
most two reservations. There is no renewal timer.

`LEASE_WIDTH_MS` is 10,000. After an unclean restart, the clock can wait until the
wall clock reaches the previous upper bound. A wall time before the previous
persisted write causes `ClockRollbackDetected`. Storage defects latch the instance.
Temporary failures preserve its confirmed bound.

`LeaseClock` remains available for callers that own a dedicated Storage. These
callers own start, exclusion, durability, and storage shutdown. Do not give it the
business database. `TimeSources` controls readings for tests; its monotonic member
is not used to extrapolate wall time.

`clockPreflight` and `clockSnapshotCheck` inspect the legacy business table.
They cannot replace the independent checkpoint in a current backup. The backup
consumer must require `Clock.checkpoint` and preserve the exported floor.

Run this member's `build`, `typecheck`, and `test` scripts. The direct constructor,
Cordis service, native resource lifecycle, and backup consumer require separate
validation.
