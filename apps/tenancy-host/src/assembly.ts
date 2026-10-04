import {
  ACCOUNTS_SERVICE,
  LOGINS_SERVICE,
  CREDENTIALS_SERVICE,
} from '@omne-harness-lite/account-identity/cordis'
import { REGISTRATION_SERVICE } from '@omne-harness-lite/account-registration/cordis'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import {
  ORGANIZATIONS_SERVICE,
  MEMBERSHIPS_SERVICE,
  OFFERS_SERVICE,
  ORGANIZATION_PURGE_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import { type Context, type Fiber, type Logger } from '@deepseek-ai/cordis'
import {
  createAssemblyLifetime,
  type AssemblyCloseReport,
  type AssemblyLifetimePort,
  type OwnedWork,
} from '@omne-harness-lite/assembly-lifecycle'
import { AssemblyLifetimeService } from '@omne-harness-lite/assembly-lifecycle/cordis'
import {
  EntryOpeningStopped,
  type EntryOpeningSignal,
} from '@omne-harness-lite/governance-center-entry'
import { EntryOpening } from '@omne-harness-lite/governance-center-entry/cordis'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { HostStartupFailure } from './failure.ts'
import { HOST_PLUGIN_NAMES, type HostPluginName, type ManifestEntry } from './manifest.ts'

const provides: Record<HostPluginName, readonly string[]> = {
  'storage-sql': [STORAGE_SERVICE],
  'clock-lease': [CLOCK_SERVICE],
  'credential-verification': [CREDENTIALS_SERVICE],
  'account-identity': [ACCOUNTS_SERVICE, LOGINS_SERVICE],
  'organization-governance': [
    ORGANIZATIONS_SERVICE,
    MEMBERSHIPS_SERVICE,
    OFFERS_SERVICE,
    ORGANIZATION_PURGE_SERVICE,
  ],
  'account-registration': [REGISTRATION_SERVICE],
  'governance-center-ops': [],
  'governance-center-entry': [],
}

class HostLifetimePort extends AssemblyLifetimeService {
  constructor(
    ctx: Context,
    private readonly port: AssemblyLifetimePort,
  ) {
    super(ctx)
  }
  isCurrent = () => this.port.isCurrent()
  register = (work: OwnedWork) => this.port.register(work)
}

class HostEntryOpening extends EntryOpening {
  constructor(
    ctx: Context,
    private readonly signal: EntryOpeningSignal,
  ) {
    super(ctx)
  }
  wait = () => this.signal.wait()
  isOpen = () => this.signal.isOpen()
}

/** The handwritten T2 assembly; the T4 tree will take over its loading responsibility. */
export function createHostAssembly(
  context: Context,
  manifest: readonly ManifestEntry[],
  log: Logger,
) {
  if (
    new Set(manifest.map(row => row.name)).size !== manifest.length ||
    manifest.some(row => !HOST_PLUGIN_NAMES.includes(row.name))
  )
    throw new HostStartupFailure('manifest', 'responsibility row ids must be known and unique')
  for (const row of manifest) {
    if (!('assemblyLifecycle' in row.plugin) || row.plugin.assemblyLifecycle !== 1)
      throw new HostStartupFailure('manifest', 'a managed lifecycle binding is required', {
        item: row.name,
      })
  }
  const opening = Promise.withResolvers<void>()
  void opening.promise.catch(() => undefined)
  const stopped = Promise.withResolvers<void>()
  let confirmed = false
  const lifetime = createAssemblyLifetime(
    manifest.map(row => row.name),
    () => {
      opening.reject(new EntryOpeningStopped())
      stopped.resolve()
    },
  )
  if (!lifetime.tryClaim()) throw new Error('Fresh assembly lifetime could not be claimed')
  const signal: EntryOpeningSignal = {
    isOpen: () => confirmed && lifetime.isCurrent(),
    wait: () =>
      lifetime.isCurrent() ? opening.promise : Promise.reject(new EntryOpeningStopped()),
  }
  const openingFiber = context.plugin(ctx => {
    new HostEntryOpening(ctx, signal)
  })
  const loaded: { name: HostPluginName; fiber: Fiber }[] = []
  const ports: { name: HostPluginName; fiber: Fiber }[] = []
  const protocolErrors = new Set<AssemblyCloseReport['assemblyErrors'][number]>()
  const closed = lifetime.closed.then(async (report): Promise<AssemblyCloseReport> => {
    const errors = new Set(report.assemblyErrors)
    for (const error of protocolErrors) errors.add(error)
    for (const row of [...loaded].reverse()) {
      try {
        await row.fiber.dispose()
      } catch {
        errors.add('assembly-fiber-dispose-failed')
      }
      log.info({ event: 'fiber-disposed', plugin: row.name })
    }
    for (const row of [...ports].reverse()) {
      try {
        await row.fiber.dispose()
      } catch {
        errors.add('assembly-port-dispose-failed')
      }
    }
    try {
      await openingFiber.dispose()
    } catch {
      errors.add('assembly-port-dispose-failed')
    }
    return {
      ...report,
      complete: report.complete && errors.size === 0,
      assemblyErrors: [...errors],
    }
  })
  // Observe cleanup even when a caller only holds a row fiber during failed startup.
  void closed.catch(() => log.error({ event: 'assembly-close-observer-failed' }))
  const assertCurrent = (): void => {
    if (!lifetime.isCurrent()) throw new EntryOpeningStopped()
  }
  const assertReady = (): void => {
    assertCurrent()
    if (loaded.length !== HOST_PLUGIN_NAMES.length)
      throw new HostStartupFailure(
        'manifest',
        'all eight responsibility rows are required before confirmation',
      )
  }
  return {
    signal,
    stopped: stopped.promise,
    closed,
    assertCurrent,
    assertReady,
    confirm(): void {
      assertReady()
      confirmed = true
      opening.resolve()
    },
    async load(row: ManifestEntry, observe?: (fiber: Fiber) => void): Promise<Fiber> {
      assertCurrent()
      await openingFiber
      const scope = context.isolate(AssemblyLifetimeService.provide)
      const port = lifetime.port(row.name)
      let ready: Promise<void> | undefined
      const portFiber = scope.plugin(ctx => {
        new HostLifetimePort(ctx, {
          isCurrent: () => port.isCurrent(),
          register(work) {
            const receipt = port.register(work)
            ready = work.ready
            void ready.catch(() => undefined)
            return receipt
          },
        })
      })
      ports.push({ name: row.name, fiber: portFiber })
      await portFiber
      assertCurrent()
      const fiber = scope.plugin(row.plugin, row.config)
      loaded.push({ name: row.name, fiber })
      observe?.(fiber)
      if ((fiber.state as number) === FIBER_STATE.PENDING)
        throw new HostStartupFailure(
          'manifest',
          `${row.name} is PENDING: ${Array.isArray((row.plugin as { inject?: unknown }).inject) ? (row.plugin as { inject: string[] }).inject.filter(key => scope.get(key) === undefined).join(', ') : 'a required service'} is not provided by preceding rows`,
          { item: row.name },
        )
      await fiber
      if (ready === undefined) {
        protocolErrors.add('assembly-protocol-failed')
        throw new HostStartupFailure('manifest', 'the managed row did not register owned work', {
          item: row.name,
        })
      }
      await ready
      assertCurrent()
      if (
        (fiber.state as number) !== FIBER_STATE.ACTIVE ||
        provides[row.name].some(key => scope.get(key) === undefined)
      )
        throw new HostStartupFailure(
          'manifest',
          'a ready row is inactive or has not provided its required services',
          { item: row.name },
        )
      return fiber
    },
    dispose(): Promise<AssemblyCloseReport> {
      void lifetime.close()
      return closed
    },
  }
}
