import {
  AssemblyLifetimeService,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { EntryOpeningSignal } from '@omne-harness-lite/governance-center-entry'
import { ENTRY_OPENING_SERVICE } from '@omne-harness-lite/governance-center-entry/cordis'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
// 运维面插件 `governance-center-ops`（入口契约 S-25、S-26；https-json/1 S-20、S-21；入口节点 design「成对的装载与撤除」）。
// inject storage、clock 及装配准入信号；不引用任何治理服务（导入白名单与事件订阅白名单，SC-2）。
// HT3请求由独立opsVersion解析，full-health/backup/backup-status三动作；只在 `serving` 与 `stopped` 之间应答——与客户端一面同起同停。
import type { Context, Logger } from '@deepseek-ai/cordis'
import type { Server, Socket } from 'node:net'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { Storage, SnapshotMaintenance, SnapshotCheck } from '@omne-harness-lite/storage'
import { withCleanup } from '../maintenance/failure.ts'
import { OnlineMaintenance } from '../maintenance/online.ts'
import { readOpsRequest, maintenanceResultBody } from './maintenance-wire.ts'
import { defect, listening, serving, stopped } from '../events.ts'
import {
  type DeploymentKeyLoad,
  type DeploymentParameters,
  type HealthSources,
  fullHealthBody,
} from './health.ts'
import { Http1Connection } from './http1.ts'
import { RECEIVE_LIMITS } from './limits.ts'
import type { ServingNotice } from './notice.ts'
import { listenOnSocket, prepareSocketPath, removeSocketFile } from './socket.ts'
import { responseBytes } from './wire.ts'

export interface GovernanceCenterOpsConfig {
  /** 套接字所在的目录（绝对路径）；只对中心的运行用户可访问。 */
  readonly socketDirectory: string
  readonly deploymentKey: DeploymentKeyLoad
  readonly deploymentParameters: DeploymentParameters
  readonly maintenance: {
    readonly backupDirectory: string
    readonly sourceBuildId: string | null
    readonly migrationNames: readonly string[]
    readonly snapshotChecks: readonly SnapshotCheck[]
    readonly onClosed: (status: 'clean' | 'error') => void
  }
}

const parameter = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

export const GovernanceCenterOpsConfigSchema: z.ZodType<GovernanceCenterOpsConfig, unknown> = z
  .object({
    socketDirectory: z.string().refine(isAbsolute, 'socketDirectory must be an absolute path'),
    deploymentKey: z.object({ present: z.literal(true), complete: z.literal(true) }).strict(),
    maintenance: z
      .object({
        backupDirectory: z.string().refine(isAbsolute),
        sourceBuildId: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .nullable(),
        migrationNames: z
          .array(z.string().regex(/^[A-Za-z0-9_]{1,128}$/))
          .min(1)
          .max(256)
          .refine(names => new Set(names).size === names.length),
        snapshotChecks: z
          .array(z.custom<SnapshotCheck>(value => typeof value === 'function'))
          .min(1),
        onClosed: z.custom<(status: 'clean' | 'error') => void>(
          value => typeof value === 'function',
        ),
      })
      .strict(),
    deploymentParameters: z
      .object({
        unactivatedRetention: parameter,
        invitationTtlDefault: parameter,
        affiliationRequestTtlDefault: parameter,
        copyNoticeTtlDefault: parameter,
        sharingInvitationTtlDefault: parameter,
      })
      .strict(),
  })
  .strict()

/** 撤除时等在途体检答完的上界：体检里最慢的一项是现探存储（它自己有 2 s 上界）。 */
const OPS_DRAIN_TIMEOUT_MS = 3_000

/**
 * 运维面实例：`centerId`、`version`、`startedAt` 只从 `serving` 来，`defectCount` 数 `defect` 通知，都随实例消失
 * （契约：重启归零）。应答的门是「见过 `serving`、其后没有 `stopped`」。
 */
class OpsFace {
  readonly #sources: HealthSources
  readonly #logger: Logger
  readonly #connections = new Set<Http1Connection>()
  #notice: ServingNotice | undefined
  #open = false
  #defects = 0
  #closing: Promise<void> | undefined
  readonly #business = new Set<Promise<unknown>>()

  constructor(
    sources: HealthSources,
    logger: Logger,
    private readonly maintenance: OnlineMaintenance,
    private readonly opening: EntryOpeningSignal,
    private readonly finalized: (failed: boolean) => void,
  ) {
    this.#sources = sources
    this.#logger = logger
  }

  /**
   * 入口层开门（或应 `listening` 重发）。同一个标识 ⇒ 恢复应答，`startedAt` 保留第一次的值；
   * 不同的标识是不可能发生的状态：记 error、保留原值、不恢复应答。
   */
  onServing(notice: ServingNotice): void {
    if (this.#notice !== undefined && this.#notice.centerId !== notice.centerId) {
      this.#logger.error(
        'serving notice carries a different center identifier; ops face stays closed',
      )
      this.#open = false
      this.maintenance.stop()
      return
    }
    this.#notice ??= notice
    this.maintenance.serving(notice.centerId)
    this.#open = true
  }

  /** 入口层关门：两张面同时停答；报文还没收齐的连接直接关闭，在途的照答。 */
  onStopped(): void {
    this.#open = false
    this.maintenance.stop()
    for (const connection of this.#connections) connection.stopReceiving()
  }

  onDefect(): void {
    this.#defects += 1
  }

  accept(socket: Socket): void {
    const connection = new Http1Connection(socket, RECEIVE_LIMITS, {
      accepting: () => this.#open && this.opening.isOpen(),
      answer: body => {
        if (!this.#open || !this.opening.isOpen()) return Promise.resolve(undefined)
        const work = this.#answer(body)
        this.#business.add(work)
        work.then(
          () => this.#business.delete(work),
          () => this.#business.delete(work),
        )
        return work
      },
    })
    this.#connections.add(connection)
    void connection.closed.then(() => this.#connections.delete(connection))
    // 客户端一面开始应答之前（或停收之后），运维面收到连接即关闭，不写任何字节
    if (!this.#open || !this.opening.isOpen()) connection.stopReceiving()
  }

  async #answer(body: Buffer): Promise<Buffer | undefined> {
    const notice = this.#notice
    if (notice === undefined) return undefined
    try {
      const reading = readOpsRequest(body)
      if (reading.kind === 'exceeds-limit') return undefined
      if (reading.kind === 'invalid-input') return responseBytes('{"status":"invalid-input"}')
      const request = reading.request
      if (request.operation === 'full-health')
        return responseBytes(await fullHealthBody(this.#sources, notice, this.#defects))
      const result =
        request.operation === 'backup'
          ? await this.maintenance.backup(request.payload)
          : await this.maintenance.backupStatus(request.payload)
      return responseBytes(maintenanceResultBody(result))
    } catch (error) {
      // Also runs if the peer disconnected while the owned operation was pending.
      this.#logger.error('ops-internal-defect')
      throw error
    }
  }

  /** 撤除：停止接受 → 停收 → 有界等在途答完 → 关闭其余连接 → 删掉套接字文件。 */
  dispose(server: Server, path: string): Promise<void> {
    this.#closing ??= this.#dispose(server, path)
    return this.#closing
  }
  async #dispose(server: Server, path: string): Promise<void> {
    this.onStopped()
    let failed = true
    try {
      await withCleanup(
        () =>
          withCleanup(
            async () => {
              try {
                await this.#drain(server)
              } finally {
                await Promise.allSettled([...this.#business])
              }
            },
            () => this.maintenance.close(),
          ),
        () => removeSocketFile(path),
      )
      failed = false
    } finally {
      this.finalized(failed)
    }
  }
  async #drain(server: Server): Promise<void> {
    const closed = new Promise<void>(resolve => server.close(() => resolve()))
    for (const connection of this.#connections) connection.stopReceiving()
    let timer: NodeJS.Timeout | undefined
    const deadline = new Promise<void>(resolve => {
      timer = setTimeout(resolve, OPS_DRAIN_TIMEOUT_MS)
    })
    await Promise.race([Promise.all([...this.#connections].map(c => c.closed)), deadline])
    clearTimeout(timer)
    for (const connection of this.#connections) connection.destroy()
    await closed
  }
}

function opsWork(ctx: Context, config: GovernanceCenterOpsConfig, assertCurrent: () => void) {
  let maintenance: OnlineMaintenance | undefined
  let path: string | undefined
  let server: Server | undefined
  let closeBound: (() => Promise<void>) | undefined
  const controller: { status: 'pending' | 'clean' | 'error' } = { status: 'pending' }
  return {
    async setup(): Promise<void> {
      const logger = ctx.logger('governance-center-ops')
      // inject 保证必需服务已就位；维护扩展仍按原判据核验。
      const storage: Storage & { readonly maintenance?: SnapshotMaintenance } = ctx.storage
      if (storage.maintenance === undefined)
        throw new Error('owned snapshot maintenance is required')
      const clock: Clock = ctx.clock
      maintenance = new OnlineMaintenance({
        ...config.maintenance,
        workDirectory: join(config.maintenance.backupDirectory, '.quarantine'),
        source: storage.maintenance,
        clock,
        report: diagnostic =>
          logger.error(
            'maintenance-residual: %s; published: %s',
            diagnostic.temporaryLocation,
            diagnostic.publishedLocation ?? '(none)',
          ),
        onClosed: status => {
          controller.status = status
        },
      })
      const face = new OpsFace(
        {
          storage,
          clock,
          deploymentKey: config.deploymentKey,
          deploymentParameters: config.deploymentParameters,
          reportProbeDefect: errorName =>
            logger.error('storage probe for the full health check failed with %s', errorName),
        },
        logger,
        maintenance,
        ctx.entryOpening,
        failed =>
          config.maintenance.onClosed(!failed && controller.status === 'clean' ? 'clean' : 'error'),
      )
      // 先挂三条监听（经 effect 纳管，随本 fiber 撤除）；只订阅事件声明模块里的三个名字
      ctx.on(serving, notice => face.onServing(notice))
      ctx.on(stopped, () => face.onStopped())
      ctx.on(defect, () => face.onDefect())

      path = await prepareSocketPath(config.socketDirectory)
      assertCurrent()
      server = await listenOnSocket(path)
      const boundServer = server
      const boundPath = path
      closeBound = () => face.dispose(boundServer, boundPath)
      assertCurrent()
      server.on('connection', socket => face.accept(socket))
      // 监听期间的服务器错误（例如接受连接时句柄耗尽）只记下，不让进程因未处理的 error 退出
      server.on('error', error => logger.error('ops socket server error: %s', error.name))
      // 握手：开着门的入口层据此重发 `serving`；处理者抛出只记 error（emit 不隔离监听者）
      try {
        ctx.emit(listening)
      } catch (error) {
        logger.error(
          'a listener of %s threw: %s',
          listening,
          error instanceof Error ? error.name : 'non-error',
        )
      }
    },
    async close(): Promise<void> {
      if (closeBound !== undefined) await closeBound()
      else if (maintenance !== undefined) {
        // No socket was acquired; never unlink a path that another process may own.
        try {
          await maintenance.close()
        } finally {
          config.maintenance.onClosed(controller.status === 'clean' ? 'clean' : 'error')
        }
      }
    },
  }
}

export const governanceCenterOpsPlugin = definePlugin<GovernanceCenterOpsConfig>({
  name: 'governance-center-entry-node-ops',
  inject: [STORAGE_SERVICE, CLOCK_SERVICE, ENTRY_OPENING_SERVICE],
  Config: GovernanceCenterOpsConfigSchema,
  async apply(ctx: Context, config) {
    const work = opsWork(ctx, config, () => ctx.fiber.assertActive())
    ctx.effect(() => work.close, 'governance-center-ops socket')
    await work.setup()
  },
})

export const managedGovernanceCenterOpsPlugin = Object.assign(
  definePlugin<GovernanceCenterOpsConfig>({
    name: 'governance-center-entry-node-ops-managed',
    inject: [
      STORAGE_SERVICE,
      CLOCK_SERVICE,
      ENTRY_OPENING_SERVICE,
      AssemblyLifetimeService.provide,
    ],
    Config: GovernanceCenterOpsConfigSchema,
    apply(ctx: Context, config) {
      const lifetime = ctx.assemblyLifetime
      const work = opsWork(ctx, config, () => {
        ctx.fiber.assertActive()
        if (!lifetime.isCurrent()) throw new Error('Assembly work has stopped')
      })
      startAssemblyWork(ctx, work.setup, work.close)
    },
  }),
  { assemblyLifecycle: 1 as const },
)
