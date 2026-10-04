// 治理中心的启动与撤除（design「装载清单与顺序」「升级的整体性」「两步开闸」「成对的装载与撤除」）。
//   [起插件之前] config 解析、密钥配对自检                                  —— 失败：不碰数据
//   [逐条装载]   storage-sql（升级守卫：独占、遗留恢复、只读核对、快照、迁移）→ clock → … → 运维面 → 入口层
//                每条：同步查 PENDING（清单错误）→ await（FAILED ⇒ 逆序全撤，storage 撤除时恢复快照）
//   [全部 ACTIVE] guard.confirm()，断言 snapshotTaken ⇒ snapshotRemoved；migrated ∧ ¬snapshotTaken ⇒ 记「本次升级不可撤回（U-3）」
//   [确认之后]   兑现 openSignal ⇒ 入口层开闸、发 serving ⇒ 有界地等到 serving，boot() 才返回
//   [任一次逆序撤完之后] guard.pending()：仍有快照 ⇒「升级未确认，快照在 X」；仅此观察不能判定恢复是否尝试。
// 本节点无领域状态、无提交点、无锁；没有缓存、池、队列、重试。
import { Context, type Fiber, type Logger } from '@deepseek-ai/cordis'
import { clockPreflight } from '@omne-harness-lite/clock'
import {
  GovernanceCenterClockTimeoutError,
  SERVING_EVENT,
  type ServingNotice,
  governanceCenterPreflight,
} from '@omne-harness-lite/governance-center-entry'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  SnapshotFailure,
  type MigrationFragment,
  composeMigrations,
} from '@omne-harness-lite/storage'
import {
  StorageStartupFailure,
  type UpgradeConfirmation,
  type UpgradeGuard,
  createUpgradeGuard,
} from '@omne-harness-lite/storage-sql'
import { readBuildId } from './build-version.ts'
import { prepareBackupDirectory } from './maintenance-config.ts'
import { MaintenanceFinalization } from './maintenance-state.ts'
import { ENV, type HostEnv, readHostConfig } from './config.ts'
import { HostStartupFailure, describeThrown } from './failure.ts'
import { verifyKeyPairing } from './keys.ts'
import { type LogSink, attachLog, stderrSink } from './log.ts'
import {
  DISPOSE_TIMEOUT_MS,
  type HostPluginName,
  type ManifestEntry,
  SERVING_GRACE_MS,
  buildManifest,
} from './manifest.ts'
import {
  composedMigrationNames,
  dataFormatPreflight,
  hostMigrationFragments,
} from './migrations.ts'

/** 确认升级的那一方：生产路径就是挂在存储实例上的守卫本身。 */
export interface UpgradeConfirmer {
  confirm(): Promise<UpgradeConfirmation>
}

/**
 * 测试钩子：生产入口（`main`）一个都不传。只用于装配级测试里模拟「更新的版本」、在确认处停住、交错守卫对象等
 * verification 点名的演练；不改变任何政策。
 */
export interface BootHooks {
  /** 追加在合成序列末尾的片段（模拟「本版多一个片段」的升级）。 */
  readonly extraMigrations?: readonly MigrationFragment[]
  /** 改写装载清单（清单错误演练）。 */
  readonly manifest?: (entries: readonly ManifestEntry[]) => readonly ManifestEntry[]
  /** 每条 fiber 一创建就交给观察者（启动失败之后核「没有 fiber 留在 ACTIVE」）。 */
  readonly observeFiber?: (name: HostPluginName, fiber: Fiber) => void
  /** 全部 fiber ACTIVE 之后、确认之前调用并等待（「给确认处加一个测试钩子让它停住」）。 */
  readonly beforeConfirm?: (context: Context) => void | Promise<void>
  /** 换掉确认的那一方（交错守卫、注入确认结果）。 */
  readonly confirmWith?: (attached: UpgradeGuard) => UpgradeConfirmer
}

export interface BootOptions {
  /** 缺省 `process.env`。 */
  readonly env?: HostEnv
  /** 缺省进程标准错误流。 */
  readonly log?: LogSink
  readonly hooks?: BootHooks
}

export interface HostDisposal {
  /** 全部fiber真实撤完，两个维护收场槽及升级守卫均已确认。 */
  readonly complete: boolean
  /** 实际收场仍有错误或未确认的fiber，按撤除次序。 */
  readonly unfinished: readonly HostPluginName[]
}

export interface TenancyHost {
  readonly context: Context
  /** 八条 fiber（按名字）；装配给的句柄只供观察与演练，生产入口不用。 */
  readonly fibers: Readonly<Partial<Record<HostPluginName, Fiber>>>
  /** 开闸那一刻入口层发出的 `serving`。 */
  readonly serving: ServingNotice
  readonly confirmation: UpgradeConfirmation
  /** 按装载的逆序逐个撤除；重复调用得到同一次撤除。 */
  dispose(): Promise<HostDisposal>
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 有界等待：到时返回 `'timeout'`，并清掉定时器。 */
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

/** 一条 fiber 启动失败 ⇒ 具名阶段。存储插件的具名阶段原样沿用；存储别的失败统一是「存储打不开」。 */
function fiberFailure(name: HostPluginName, error: unknown): HostStartupFailure {
  const thrown = describeThrown(error)
  if (thrown.type === 'ValidationError')
    return new HostStartupFailure('plugin', `the config of ${name} is invalid: ${thrown.message}`, {
      item: name,
      cause: error,
    })
  if (name === 'storage-sql') {
    if (error instanceof StorageStartupFailure)
      return new HostStartupFailure(
        error.stage,
        error.snapshot === undefined
          ? error.message
          : `${error.message} (the upgrade snapshot is kept at ${error.snapshot})`,
        {
          item: name,
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
    return new HostStartupFailure(
      'storage-open',
      `the storage could not be opened: ${thrown.type}: ${thrown.message}`,
      { item: name, cause: error },
    )
  }
  if (name === 'governance-center-entry' && error instanceof GovernanceCenterClockTimeoutError)
    return new HostStartupFailure(
      'clock-unreadable',
      'the center clock could not be read within the startup bound (OMNE_TENANCY_CLOCK_READY_TIMEOUT)',
      { item: name, cause: error },
    )
  return new HostStartupFailure(
    'plugin',
    `${name} failed to start: ${thrown.type}: ${thrown.message}`,
    {
      item: name,
      cause: error,
    },
  )
}

/** 清单错误时点名缺的服务：插件声明的 inject 里此刻解析不到的那些。 */
function missingServices(context: Context, entry: ManifestEntry): string[] {
  const inject: unknown = (entry.plugin as { readonly inject?: unknown }).inject
  const names = Array.isArray(inject)
    ? inject.filter((name): name is string => typeof name === 'string')
    : typeof inject === 'object' && inject !== null
      ? Object.keys(inject)
      : []
  return names.filter(name => context.get(name) === undefined)
}

interface Loaded {
  readonly name: HostPluginName
  readonly fiber: Fiber
}

/**
 * 按装载的逆序逐个撤除（不 dispose 根 Context：那会让全部 disposer 并发，clock 收回租约的写可能撞上已关准入的存储）。
 * 顺序覆盖真实结算；30秒仅诊断仍在停止，不结束等待或放弃属主。
 */
async function disposeInReverse(
  loaded: readonly Loaded[],
  log: Logger,
  finalization: MaintenanceFinalization,
): Promise<HostDisposal> {
  const remaining = [...loaded].reverse()
  const failed = new Set<HostPluginName>()
  const timer = setTimeout(
    () => log.warn({ event: 'still-stopping', unfinished: remaining.map(item => item.name) }),
    DISPOSE_TIMEOUT_MS,
  )
  try {
    while (remaining.length > 0) {
      const item = remaining[0]!
      try {
        await item.fiber.dispose()
      } catch (error) {
        failed.add(item.name)
        log.error({
          event: 'fiber-dispose-failed',
          plugin: item.name,
          error: describeThrown(error).type,
        })
      }
      remaining.shift()
      log.info({ event: 'fiber-disposed', plugin: item.name })
    }
  } finally {
    clearTimeout(timer)
  }
  if (
    loaded.some(item => item.name === 'governance-center-ops') &&
    finalization.controller !== 'clean'
  )
    failed.add('governance-center-ops')
  if (loaded.some(item => item.name === 'storage-sql') && finalization.storage !== 'clean')
    failed.add('storage-sql')
  const unfinished = [...loaded]
    .reverse()
    .map(item => item.name)
    .filter(name => failed.has(name))
  if (unfinished.length > 0)
    log.error({
      event: 'dispose-incomplete',
      unfinished,
      controller: finalization.controller,
      storage: finalization.storage,
    })
  return { complete: unfinished.length === 0, unfinished }
}

/** 写恰一条启动失败记录（阶段、点名的项、错误类型、说明、快照位置），返回同一个失败供抛出。 */
function recordFailure(log: Logger, failure: HostStartupFailure): HostStartupFailure {
  const cause = failure.cause
  log.error({
    event: 'startup-failed',
    stage: failure.stage,
    ...(failure.item === undefined ? {} : { item: failure.item }),
    errorType: cause === undefined ? failure.name : describeThrown(cause).type,
    message: failure.message,
    ...(failure.snapshot === undefined ? {} : { snapshot: failure.snapshot }),
  })
  return failure
}

function asFailure(error: unknown): HostStartupFailure {
  if (error instanceof HostStartupFailure) return error
  const thrown = describeThrown(error)
  return new HostStartupFailure('plugin', `unexpected failure: ${thrown.type}: ${thrown.message}`, {
    cause: error,
  })
}

/**
 * 起治理中心。返回时入口层已开闸（中心「起来了」）；拒绝时已按逆序撤完、确认之前的升级已撤回，
 * 并已写恰一条 `startup-failed` 记录。调用方（进程入口）据此退出非零。
 */
export async function boot(options: BootOptions = {}): Promise<TenancyHost> {
  const hooks = options.hooks ?? {}
  // 根 Context 先只挂日志：起插件之前的失败与之后的失败走同一条流、同一形状；此时没有任何插件 fiber、未碰数据
  const context = new Context()
  const log = attachLog(context, options.log ?? stderrSink)

  const guard = createUpgradeGuard()
  const open = deferred<void>()
  // 入口层吸收拒绝；它没装上时拒绝也不能成为未处理的拒绝
  open.promise.catch(() => undefined)
  try {
    const config = await readHostConfig(options.env ?? process.env)
    verifyKeyPairing(config.keys)
    const backupDirectory = await prepareBackupDirectory(config)
    const sourceBuildId = await readBuildId()
    const finalization = new MaintenanceFinalization()
    const fragments = [...hostMigrationFragments, ...(hooks.extraMigrations ?? [])]
    const built = buildManifest(config, {
      migrations: composeMigrations(fragments),
      checks: [
        dataFormatPreflight(composedMigrationNames(fragments)),
        clockPreflight(),
        governanceCenterPreflight,
      ],
      guard,
      openSignal: open.promise,
      maintenance: {
        backupDirectory,
        sourceBuildId,
        migrationNames: composedMigrationNames(fragments),
        storageClosed: finalization.storageClosed,
        controllerClosed: finalization.controllerClosed,
      },
    })
    const manifest = hooks.manifest?.(built) ?? built
    return await assemble(
      context,
      log,
      manifest,
      guard,
      open,
      config.clockReadyTimeoutMs,
      hooks,
      finalization,
    )
  } catch (error) {
    throw recordFailure(log, asFailure(error))
  }
}

async function assemble(
  context: Context,
  log: Logger,
  manifest: readonly ManifestEntry[],
  guard: UpgradeGuard,
  open: Deferred<void>,
  clockReadyTimeoutMs: number,
  hooks: BootHooks,
  finalization: MaintenanceFinalization,
): Promise<TenancyHost> {
  const loaded: Loaded[] = []
  const serving = deferred<ServingNotice>()
  let stopWatching: (() => void) | undefined

  /** 失败收场：拒绝 openSignal → 逆序全撤 → 撤后核查未确认的快照。 */
  const abort = async (failure: HostStartupFailure): Promise<HostStartupFailure> => {
    open.reject(failure)
    stopWatching?.()
    await disposeInReverse(loaded, log, finalization)
    const pending = await guard.pending()
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
    return failure
  }

  let confirmation: UpgradeConfirmation
  try {
    for (const entry of manifest) {
      if (entry.name === 'governance-center-entry') {
        // serving 的监听在运维面之后、入口层之前登记：只记录、不做控制、不抛（emit 不隔离监听者）
        stopWatching = context.on(SERVING_EVENT, (notice: ServingNotice) => {
          try {
            serving.resolve(notice)
            log.info({
              event: 'serving',
              centerId: notice.centerId,
              version: notice.version,
              startedAt: notice.startedAt,
            })
          } catch {
            // 记录失败不影响入口层与运维面
          }
        })
      }
      const fiber = context.plugin(entry.plugin, entry.config)
      loaded.push({ name: entry.name, fiber })
      hooks.observeFiber?.(entry.name, fiber)
      // PENDING 是结构判定，不是等待：它需要的服务不在前面装的插件里
      if ((fiber.state as number) === FIBER_STATE.PENDING)
        throw new HostStartupFailure(
          'manifest',
          `${entry.name} is PENDING: ${missingServices(context, entry).join(', ') || 'a required service'} not provided by the plugins loaded before it`,
          { item: entry.name },
        )
      try {
        await fiber
      } catch (error) {
        throw fiberFailure(entry.name, error)
      }
    }
    log.info({ event: 'manifest-active', plugins: loaded.map(l => l.name) })

    await hooks.beforeConfirm?.(context)
    const confirmer = hooks.confirmWith?.(guard) ?? guard
    try {
      confirmation = await confirmer.confirm()
    } catch (error) {
      const thrown = describeThrown(error)
      throw new HostStartupFailure(
        'upgrade-confirm',
        `the upgrade confirmation failed: ${thrown.type}: ${thrown.message}`,
        { cause: error },
      )
    }
    if (confirmation.snapshotTaken && !confirmation.snapshotRemoved)
      throw new HostStartupFailure(
        'upgrade-confirm',
        'the upgrade confirmation did not remove the snapshot it took',
      )
    log.info({ event: 'upgrade-confirmed', ...confirmation })
    if (confirmation.migrated && !confirmation.snapshotTaken)
      log.warn({
        event: 'upgrade-irreversible',
        gap: 'U-3',
        message: '本次升级不可撤回（U-3）：迁移已提交且没有快照，此后的失败不会把数据撤回到升级前',
      })
  } catch (error) {
    throw await abort(asFailure(error))
  }

  // 确认之后才放行开闸；等不到 serving ⇒ 启动失败、逆序全撤，快照已确认、不恢复（缺口 U-4）
  open.resolve()
  log.info({ event: 'open-signal' })
  const notice = await within(serving.promise, clockReadyTimeoutMs + SERVING_GRACE_MS)
  if (notice === 'timeout')
    throw await abort(
      new HostStartupFailure(
        'serving-timeout',
        '钟读不到或回拨：重启前先核钟 (the entry did not open after the upgrade was confirmed; the clock could not be read or went backwards — check the clock before restarting)',
        { item: 'governance-center-entry' },
      ),
    )

  const fibers: Partial<Record<HostPluginName, Fiber>> = {}
  for (const { name, fiber } of loaded) fibers[name] = fiber
  let disposal: Promise<HostDisposal> | undefined
  return {
    context,
    fibers,
    serving: notice,
    confirmation,
    dispose() {
      disposal ??= (async () => {
        stopWatching?.()
        const result = await disposeInReverse(loaded, log, finalization)
        const pending = await guard.pending()
        if (pending !== 'clear') {
          const unfinished = [...new Set([...result.unfinished, 'storage-sql' as const])]
          log.error({ event: 'dispose-incomplete', unfinished, upgrade: pending })
          log.info({ event: 'disposed', complete: false })
          return { complete: false, unfinished }
        }
        log.info({ event: 'disposed', complete: result.complete })
        return result
      })()
      return disposal
    },
  }
}
