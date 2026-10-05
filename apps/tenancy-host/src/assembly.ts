import {
  createAssemblyLifetime,
  type AssemblyLifetime,
  type OwnedWork,
} from '@omne-harness-lite/assembly-lifecycle'
import {
  EntryOpeningStopped,
  type EntryOpeningSignal,
  type EntryMaintenanceResources,
} from '@omne-harness-lite/governance-center-entry'
import { EntryOpening, EntryMaintenance } from '@omne-harness-lite/governance-center-entry/cordis'
import { StorageStartup, StorageCompletion } from '@omne-harness-lite/storage/cordis'
import type { StorageStartupResources, StorageCompletionPort } from '@omne-harness-lite/storage'
import type { Context } from '@deepseek-ai/cordis'

/** Observe the original setup error before the same lifetime receives registration. */
export function createHostAssembly(ids: readonly string[]) {
  const opening = Promise.withResolvers<void>()
  void opening.promise.catch(() => undefined)
  const stopped = Promise.withResolvers<void>()
  let confirmed = false
  const lifetime = createAssemblyLifetime(ids, () => {
    opening.reject(new EntryOpeningStopped())
    stopped.resolve()
  })
  const failures = new Map<string, unknown>()
  const observed: AssemblyLifetime = {
    ids: lifetime.ids,
    closed: lifetime.closed,
    isPristine: () => lifetime.isPristine(),
    tryClaim: () => lifetime.tryClaim(),
    isCurrent: () => lifetime.isCurrent(),
    close: () => lifetime.close(),
    port(id) {
      const port = lifetime.port(id)
      return {
        isCurrent: () => port.isCurrent(),
        register(work: OwnedWork) {
          let accepted = false
          void work.ready.catch(error => {
            if (accepted && !failures.has(id)) failures.set(id, error)
          })
          const receipt = port.register(work)
          accepted = true
          return receipt
        },
      }
    },
  }
  const assertCurrent = (): void => {
    if (!lifetime.isCurrent()) throw new EntryOpeningStopped()
  }
  const signal: EntryOpeningSignal = {
    isOpen: () => confirmed && lifetime.isCurrent(),
    wait: () =>
      lifetime.isCurrent() ? opening.promise : Promise.reject(new EntryOpeningStopped()),
  }
  return {
    lifetime: observed,
    signal,
    stopped: stopped.promise,
    failures,
    assertCurrent,
    confirm(): void {
      assertCurrent()
      confirmed = true
      opening.resolve()
    },
  }
}

class HostOpening extends EntryOpening {
  constructor(
    ctx: Context,
    private readonly signal: EntryOpeningSignal,
  ) {
    super(ctx)
  }
  wait = () => this.signal.wait()
  isOpen = () => this.signal.isOpen()
}
class HostStartup extends StorageStartup {
  readonly migrations: StorageStartupResources['migrations']
  readonly upgrade: StorageStartupResources['upgrade']
  constructor(ctx: Context, resources: StorageStartupResources) {
    super(ctx)
    this.migrations = resources.migrations
    this.upgrade = resources.upgrade
  }
}
class HostStorageCompletion extends StorageCompletion {
  constructor(
    ctx: Context,
    private readonly target: StorageCompletionPort,
  ) {
    super(ctx)
  }
  closed = (status: 'clean' | 'error') => this.target.closed(status)
}
class HostMaintenance extends EntryMaintenance {
  readonly snapshotChecks: EntryMaintenanceResources['snapshotChecks']
  constructor(
    ctx: Context,
    private readonly resources: EntryMaintenanceResources,
  ) {
    super(ctx)
    this.snapshotChecks = resources.snapshotChecks
  }
  closed = (status: 'clean' | 'error') => this.resources.closed(status)
}

/** Publish borrowed ports; their real work remains owned by SQL and ops. */
export function publishHostResources(
  ctx: Context,
  resources: {
    readonly opening: EntryOpeningSignal
    readonly startup: StorageStartupResources
    readonly storageCompletion: StorageCompletionPort
    readonly maintenance: EntryMaintenanceResources
  },
): void {
  new HostOpening(ctx, resources.opening)
  new HostStartup(ctx, resources.startup)
  new HostStorageCompletion(ctx, resources.storageCompletion)
  new HostMaintenance(ctx, resources.maintenance)
}
