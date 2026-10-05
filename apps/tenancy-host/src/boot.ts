import { Context, type Fiber, type Logger } from '@deepseek-ai/cordis'
import { clockPreflight, ClockRollbackDetected } from '@omne-harness-lite/clock-lease'
import {
  GovernanceCenterClockTimeoutError,
  governanceCenterPreflight,
} from '@omne-harness-lite/governance-center-entry-node'
import { SERVING_EVENT, type ServingNotice } from '@omne-harness-lite/governance-center-entry'
import {
  ENTRY_OPENING_SERVICE,
  ENTRY_MAINTENANCE_SERVICE,
} from '@omne-harness-lite/governance-center-entry/cordis'
import {
  SnapshotFailure,
  composeMigrations,
  type MigrationFragment,
  type UpgradeConfirmation,
  type UpgradePending,
} from '@omne-harness-lite/storage'
import {
  STORAGE_STARTUP_SERVICE,
  STORAGE_COMPLETION_SERVICE,
} from '@omne-harness-lite/storage/cordis'
import {
  StorageStartupFailure,
  UpgradeGuardNotAttached,
  createUpgradeGuard,
  type UpgradeGuard,
} from '@omne-harness-lite/storage-sql'
import {
  composePluginTree,
  PluginTreeError,
  PluginTreePreparationError,
  PluginTreeStartError,
  PluginTreeUsageError,
  type PreparationOptions,
  type PluginTreeHandle,
} from '@omne-harness-lite/cordis-plugin-tree'
import {
  preparePluginTree,
  loadPluginTree,
  inspectPluginTree,
} from '@omne-harness-lite/cordis-plugin-tree/cordis'
import { createHostAssembly, publishHostResources } from './assembly.ts'
import { readBuildId } from './build-version.ts'
import { resolveBackupDirectory, prepareBackupDirectory } from './maintenance-config.ts'
import { MaintenanceFinalization } from './maintenance-state.ts'
import { ENV, readHostConfig, type HostEnv } from './config.ts'
import { HostStartupFailure, describeThrown } from './failure.ts'
import { verifyKeyPairing } from './keys.ts'
import { attachLog, stderrSink, type LogSink } from './log.ts'
import { DISPOSE_TIMEOUT_MS, SERVING_GRACE_MS, buildDistributionTree } from './tree.ts'
import {
  checkHostPolicy,
  HostPluginPolicyError,
  isHostPluginRole,
  isHostPluginPolicyCode,
  type HostPluginRole,
} from './policy.ts'
import {
  composedMigrationNames,
  dataFormatPreflight,
  hostMigrationFragments,
} from './migrations.ts'
import { hostSnapshotChecks } from './snapshot-checks.ts'

export interface UpgradeConfirmer {
  confirm(): Promise<UpgradeConfirmation>
}
export interface BootHooks {
  readonly extraMigrations?: readonly MigrationFragment[]
  readonly resolveModule?: PreparationOptions['resolveModule']
  /** Called synchronously after load returns, before any row apply. */
  readonly treeCreated?: (handle: PluginTreeHandle) => void
  readonly beforeConfirm?: (context: Context) => void | Promise<void>
  readonly confirmWith?: (attached: UpgradeGuard) => UpgradeConfirmer
}
export interface BootOptions {
  readonly env?: HostEnv
  readonly log?: LogSink
  readonly operator?: unknown
  readonly hooks?: BootHooks
}
export interface HostDisposal {
  readonly complete: boolean
  readonly unfinished: readonly string[]
}
export interface TenancyHost {
  readonly context: Context
  readonly fibers: Readonly<Record<string, Fiber>>
  readonly serving: ServingNotice
  readonly confirmation: UpgradeConfirmation
  dispose(): Promise<HostDisposal>
}

async function within<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => resolve('timeout'), ms)
  })
  try {
    return await Promise.race([promise, deadline])
  } finally {
    clearTimeout(timer)
  }
}
function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/u.test(value)
}
function treeFailure(
  error:
    | PluginTreeError
    | PluginTreePreparationError
    | PluginTreeStartError
    | PluginTreeUsageError
    | HostPluginPolicyError,
): HostStartupFailure {
  const stage =
    error instanceof PluginTreeStartError
      ? error.code === 'apply-failed' || error.code === 'stopped'
        ? 'plugin'
        : 'manifest'
      : error instanceof PluginTreeUsageError || error instanceof HostPluginPolicyError
        ? 'manifest'
        : error.code === 'invalid-config'
          ? 'plugin'
          : 'manifest'
  const rowId = 'rowId' in error ? error.rowId : undefined
  const item =
    error instanceof HostPluginPolicyError ? error.role : safeId(rowId) ? rowId : undefined
  return new HostStartupFailure(stage, 'plugin tree rejected', {
    cause: error,
    ...(item === undefined ? {} : { item }),
  })
}
function asFailure(error: unknown): HostStartupFailure {
  if (error instanceof HostStartupFailure) return error
  if (
    error instanceof PluginTreeError ||
    error instanceof PluginTreePreparationError ||
    error instanceof PluginTreeStartError ||
    error instanceof PluginTreeUsageError ||
    error instanceof HostPluginPolicyError
  )
    return treeFailure(error)
  return new HostStartupFailure('plugin', 'unexpected plugin failure', { cause: error })
}

/** The original named setup classifier, now selected by checked claim rather than row spelling. */
function setupFailure(
  role: HostPluginRole | undefined,
  id: string,
  error: unknown,
): HostStartupFailure {
  if (role === 'storage') {
    if (error instanceof StorageStartupFailure)
      return new HostStartupFailure(
        error.stage,
        error.snapshot === undefined
          ? error.message
          : `${error.message} (the upgrade snapshot is kept at ${error.snapshot})`,
        {
          item: id,
          cause: error,
          ...(error.snapshot === undefined ? {} : { snapshot: error.snapshot }),
        },
      )
    if (error instanceof SnapshotFailure)
      return new HostStartupFailure(
        'storage-open',
        `maintenance work root derived from OMNE_TENANCY_BACKUP_DIR (.quarantine): ${error.kind}; check the directory owner, permissions, marker, free space and other maintenance processes`,
        { item: ENV.backupDirectory, cause: error },
      )
    return new HostStartupFailure('storage-open', 'the storage could not be opened', {
      item: id,
      cause: error,
    })
  }
  if (role === 'entry' && error instanceof GovernanceCenterClockTimeoutError)
    return new HostStartupFailure(
      'clock-unreadable',
      'the center clock could not be read within the startup bound (OMNE_TENANCY_CLOCK_READY_TIMEOUT)',
      { item: id, cause: error },
    )
  return new HostStartupFailure(
    'plugin',
    `${id} failed to start${error instanceof ClockRollbackDetected ? ': ClockRollbackDetected' : ''}`,
    { item: id, cause: error },
  )
}
function recordFailure(log: Logger, failure: HostStartupFailure): HostStartupFailure {
  const cause = failure.cause
  let projection: { code?: string; rowId?: string; role?: HostPluginRole } = {}
  if (cause instanceof HostPluginPolicyError && isHostPluginPolicyCode(cause.code))
    projection = { code: cause.code, ...(isHostPluginRole(cause.role) ? { role: cause.role } : {}) }
  else if (
    cause instanceof PluginTreeError ||
    cause instanceof PluginTreePreparationError ||
    cause instanceof PluginTreeStartError ||
    cause instanceof PluginTreeUsageError
  ) {
    const codes =
      cause instanceof PluginTreeError
        ? [
            'invalid-tree',
            'duplicate-id',
            'duplicate-edit',
            'missing-target',
            'disabled-target',
            'invalid-reference',
            'invalid-config',
          ]
        : cause instanceof PluginTreePreparationError
          ? [
              'invalid-tree',
              'module-unavailable',
              'invalid-export',
              'missing-schema',
              'invalid-config',
              'invalid-declaration',
              'missing-service',
              'service-order',
              'duplicate-service',
            ]
          : cause instanceof PluginTreeStartError
            ? [
                'apply-failed',
                'dependency-unavailable',
                'missing-registration',
                'provided-service-missing',
                'stopped',
              ]
            : ['invalid-prepared', 'lifetime-mismatch', 'lifetime-used', 'missing-external-service']
    const rowId = 'rowId' in cause ? cause.rowId : undefined
    if (codes.includes(cause.code))
      projection = { code: cause.code, ...(safeId(rowId) ? { rowId } : {}) }
  }
  log.error({
    event: 'startup-failed',
    stage: failure.stage,
    ...(failure.item === undefined ? {} : { item: failure.item }),
    errorType: cause === undefined ? failure.name : describeThrown(cause).type,
    message: failure.message,
    ...(failure.snapshot === undefined ? {} : { snapshot: failure.snapshot }),
    ...projection,
  })
  return failure
}

/** Full static preparation is shared by printing and boot, before guard/directory/database creation. */
async function prepareHost(options: BootOptions) {
  const hooks = options.hooks ?? {}
  const config = await readHostConfig(options.env ?? process.env)
  verifyKeyPairing(config.keys)
  const backupDirectory = await resolveBackupDirectory(config)
  const sourceBuildId = await readBuildId()
  const fragments = [...hostMigrationFragments, ...(hooks.extraMigrations ?? [])]
  const migrationNames = composedMigrationNames(fragments)
  const distribution = buildDistributionTree(config, {
    backupDirectory,
    sourceBuildId,
    migrationNames,
  })
  const tree = composePluginTree(
    distribution,
    options.operator === undefined ? [] : options.operator,
  )
  const prepared = await preparePluginTree(tree, {
    externalServices: [
      STORAGE_STARTUP_SERVICE,
      STORAGE_COMPLETION_SERVICE,
      ENTRY_OPENING_SERVICE,
      ENTRY_MAINTENANCE_SERVICE,
    ],
    resolveModule: hooks.resolveModule ?? (reference => import(`${reference.package}/cordis`)),
  })
  const roles = checkHostPolicy(prepared, distribution)
  return { config, backupDirectory, fragments, migrationNames, prepared, roles }
}
/** Internal CLI entry; returns only the prepared safe DTO and creates no runtime resources. */
export async function describeHostPlugins(options: BootOptions = {}) {
  const context = new Context()
  const log = attachLog(context, options.log ?? stderrSink)
  try {
    return (await prepareHost(options)).prepared.rows
  } catch (error) {
    throw recordFailure(log, asFailure(error))
  }
}

interface Shutdown {
  readonly result: HostDisposal
  readonly pending: UpgradePending | 'observation-failed'
}
async function disposeTree(
  handle: PluginTreeHandle,
  resources: Fiber,
  log: Logger,
  finalization: MaintenanceFinalization,
  roles: ReadonlyMap<HostPluginRole, string>,
  guard: UpgradeGuard,
): Promise<Shutdown> {
  const timer = setTimeout(
    () =>
      log.warn({
        event: 'still-stopping',
        unfinished: inspectPluginTree(handle)
          .map(row => row.id)
          .reverse(),
      }),
    DISPOSE_TIMEOUT_MS,
  )
  try {
    const report = await handle.dispose()
    const rows = inspectPluginTree(handle)
    const failed = new Set<string>()
    for (const row of report.rows)
      if (row.result.kind === 'failed') {
        failed.add(row.id)
        log.error({ event: 'resource-close-failed', plugin: row.id, codes: row.result.codes })
      }
    if (report.assemblyErrors.length > 0) {
      for (const row of rows) failed.add(row.id)
      log.error({ event: 'assembly-close-failed', codes: report.assemblyErrors })
    }
    for (const row of [...rows].reverse()) log.info({ event: 'fiber-disposed', plugin: row.id })
    const ops = roles.get('ops'),
      storage = roles.get('storage')
    if (
      ops !== undefined &&
      rows.some(row => row.id === ops) &&
      finalization.controller !== 'clean'
    )
      failed.add(ops)
    if (
      storage !== undefined &&
      rows.some(row => row.id === storage) &&
      finalization.storage !== 'clean'
    )
      failed.add(storage)
    let pending: Shutdown['pending']
    try {
      pending = await guard.pending()
    } catch {
      pending = 'observation-failed'
      log.error({ event: 'upgrade-pending-failed' })
    }
    if (pending !== 'clear' && storage !== undefined) failed.add(storage)
    // Retain all borrowed resource ports through real tree close and guard/maintenance readback.
    try {
      await resources.dispose()
    } catch {
      for (const row of rows) failed.add(row.id)
      log.error({ event: 'assembly-close-failed', codes: ['assembly-port-dispose-failed'] })
    }
    const unfinished = rows
      .map(row => row.id)
      .reverse()
      .filter(id => failed.has(id))
    if (storage !== undefined && failed.has(storage) && !unfinished.includes(storage))
      unfinished.push(storage)
    if (unfinished.length > 0)
      log.error({
        event: 'dispose-incomplete',
        unfinished,
        controller: finalization.controller,
        storage: finalization.storage,
      })
    return { result: { complete: report.complete && unfinished.length === 0, unfinished }, pending }
  } finally {
    clearTimeout(timer)
  }
}

/** Reject only after the failed prefix actually closes; ready and closed remain distinct. */
export async function boot(options: BootOptions = {}): Promise<TenancyHost> {
  const context = new Context()
  const log = attachLog(context, options.log ?? stderrSink)
  try {
    const input = await prepareHost(options)
    await prepareBackupDirectory(input.config, input.backupDirectory)
    const guard = createUpgradeGuard()
    const finalization = new MaintenanceFinalization()
    const assembly = createHostAssembly(input.prepared.ids)
    const resources = context.plugin(ctx => {
      publishHostResources(ctx, {
        opening: assembly.signal,
        startup: {
          migrations: composeMigrations(input.fragments),
          upgrade: {
            checks: [
              dataFormatPreflight(input.migrationNames),
              clockPreflight(),
              governanceCenterPreflight,
            ],
            guard,
          },
        },
        storageCompletion: { closed: finalization.storageClosed },
        maintenance: { snapshotChecks: hostSnapshotChecks, closed: finalization.controllerClosed },
      })
    })
    try {
      await resources
      return await assemble(
        context,
        log,
        input,
        resources,
        guard,
        finalization,
        assembly,
        options.hooks ?? {},
      )
    } catch (error) {
      // assemble retains and releases these services after any claimed tree completes.
      if (assembly.lifetime.isPristine()) await resources.dispose()
      throw error
    }
  } catch (error) {
    throw recordFailure(log, asFailure(error))
  }
}

async function assemble(
  context: Context,
  log: Logger,
  input: Awaited<ReturnType<typeof prepareHost>>,
  resources: Fiber,
  guard: UpgradeGuard,
  finalization: MaintenanceFinalization,
  assembly: ReturnType<typeof createHostAssembly>,
  hooks: BootHooks,
): Promise<TenancyHost> {
  const serving = Promise.withResolvers<ServingNotice>()
  const stopWatching = context.on(SERVING_EVENT, (notice: ServingNotice) => {
    try {
      serving.resolve(notice)
      log.info({
        event: 'serving',
        centerId: notice.centerId,
        version: notice.version,
        startedAt: notice.startedAt,
      })
    } catch {
      /* Recording cannot change entry/ops behavior. */
    }
  })
  let handle: PluginTreeHandle
  try {
    handle = loadPluginTree(context, input.prepared, assembly.lifetime)
  } catch (error) {
    stopWatching()
    throw error
  }
  let closing: PromiseWithResolvers<Shutdown> | undefined
  const finish = (): Promise<Shutdown> => {
    if (closing !== undefined) return closing.promise
    closing = Promise.withResolvers<Shutdown>()
    void closing.promise.catch(() => undefined)
    void handle.dispose()
    void disposeTree(handle, resources, log, finalization, input.roles, guard).then(
      closing.resolve,
      closing.reject,
    )
    return closing.promise
  }
  const abort = async (failure: HostStartupFailure): Promise<HostStartupFailure> => {
    stopWatching()
    const { pending } = await finish()
    if (typeof pending === 'object' && failure.stage !== 'restore')
      return new HostStartupFailure(
        'upgrade-unconfirmed',
        `the upgrade is not confirmed: an upgrade snapshot or absent-database marker may remain at ${pending.pending.location}; restoration is not confirmed (startup had failed at ${failure.stage}: ${failure.message})`,
        {
          snapshot: pending.pending.location,
          cause: failure,
          ...(failure.item === undefined ? {} : { item: failure.item }),
        },
      )
    if (pending === 'observation-failed')
      return new HostStartupFailure(
        'upgrade-unconfirmed',
        'upgrade completion could not be observed',
        { cause: failure, ...(failure.item === undefined ? {} : { item: failure.item }) },
      )
    return failure
  }
  let confirmation: UpgradeConfirmation
  try {
    try {
      hooks.treeCreated?.(handle)
    } catch {
      throw new HostStartupFailure('plugin', 'plugin tree observer failed')
    }
    try {
      await handle.ready
    } catch (error) {
      if (
        error instanceof PluginTreeStartError &&
        error.code === 'apply-failed' &&
        error.rowId !== undefined &&
        assembly.failures.has(error.rowId)
      ) {
        const role = [...input.roles].find(([, id]) => id === error.rowId)?.[0]
        throw setupFailure(role, error.rowId, assembly.failures.get(error.rowId))
      }
      throw error
    }
    assembly.assertCurrent()
    log.info({ event: 'manifest-active', plugins: input.prepared.ids })
    await hooks.beforeConfirm?.(context)
    assembly.assertCurrent()
    const confirmer = hooks.confirmWith?.(guard) ?? guard
    try {
      confirmation = await confirmer.confirm()
    } catch (error) {
      throw new HostStartupFailure(
        'upgrade-confirm',
        `the upgrade confirmation failed${error instanceof UpgradeGuardNotAttached ? ': UpgradeGuardNotAttached' : ''}`,
        { cause: error },
      )
    }
    if (confirmation.snapshotTaken && !confirmation.snapshotRemoved)
      throw new HostStartupFailure(
        'upgrade-confirm',
        'the upgrade confirmation did not remove the snapshot it took',
      )
    assembly.assertCurrent()
    log.info({ event: 'upgrade-confirmed', ...confirmation })
    if (confirmation.migrated && !confirmation.snapshotTaken)
      log.warn({
        event: 'upgrade-irreversible',
        gap: 'U-3',
        message: '本次升级不可撤回（U-3）：迁移已提交且没有快照，此后的失败不会把数据撤回到升级前',
      })
    assembly.confirm()
    log.info({ event: 'open-signal' })
  } catch (error) {
    throw await abort(asFailure(error))
  }

  const notice = await within(
    Promise.race([serving.promise, assembly.stopped.then(() => 'stopped' as const)]),
    input.config.clockReadyTimeoutMs + SERVING_GRACE_MS,
  )
  if (notice === 'stopped')
    throw await abort(new HostStartupFailure('plugin', 'the assembly stopped before serving'))
  const entryId = input.roles.get('entry')
  if (notice === 'timeout')
    throw await abort(
      new HostStartupFailure(
        'serving-timeout',
        '钟读不到或回拨：重启前先核钟 (the entry did not open after the upgrade was confirmed; the clock could not be read or went backwards — check the clock before restarting)',
        entryId === undefined ? {} : { item: entryId },
      ),
    )
  try {
    assembly.assertCurrent()
  } catch (error) {
    throw await abort(asFailure(error))
  }
  const fibers: Record<string, Fiber> = {}
  for (const { id, fiber } of inspectPluginTree(handle)) fibers[id] = fiber
  let disposal: PromiseWithResolvers<HostDisposal> | undefined
  const host: TenancyHost = {
    context,
    fibers: Object.freeze(fibers),
    serving: notice,
    confirmation,
    dispose() {
      if (disposal !== undefined) return disposal.promise
      disposal = Promise.withResolvers<HostDisposal>()
      void disposal.promise.catch(() => undefined)
      const done = disposal
      stopWatching()
      void finish().then(({ result }) => {
        log.info({ event: 'disposed', complete: result.complete })
        done.resolve(result)
      }, done.reject)
      return done.promise
    },
  }
  void assembly.stopped
    .then(() => host.dispose())
    .catch(() => log.error({ event: 'host-close-observer-failed' }))
  return host
}
