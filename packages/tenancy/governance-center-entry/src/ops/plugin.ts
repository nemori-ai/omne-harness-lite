// 运维面插件 `governance-center-ops`（入口契约 S-25、S-26；https-json/1 S-20、S-21；入口节点 design「成对的装载与撤除」）。
// 只 inject `storage`、`clock`；不引用任何治理服务（导入白名单与事件订阅白名单，SC-2）。
// 本机套接字上不看请求内容，任何能成帧的请求都答完整体检；只在 `serving` 与 `stopped` 之间应答——与客户端一面同起同停。
import type { Context, Logger } from '@deepseek-ai/cordis'
import type { Server, Socket } from 'node:net'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { Storage } from '@omne-harness-lite/storage'
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
}

const parameter = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

export const GovernanceCenterOpsConfigSchema: z.ZodType<GovernanceCenterOpsConfig, unknown> = z
  .object({
    socketDirectory: z.string().refine(isAbsolute, 'socketDirectory must be an absolute path'),
    deploymentKey: z.object({ present: z.literal(true), complete: z.literal(true) }).strict(),
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

  constructor(sources: HealthSources, logger: Logger) {
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
      return
    }
    this.#notice ??= notice
    this.#open = true
  }

  /** 入口层关门：两张面同时停答；报文还没收齐的连接直接关闭，在途的照答。 */
  onStopped(): void {
    this.#open = false
    for (const connection of this.#connections) connection.stopReceiving()
  }

  onDefect(): void {
    this.#defects += 1
  }

  accept(socket: Socket): void {
    const connection = new Http1Connection(socket, RECEIVE_LIMITS, {
      accepting: () => this.#open,
      answer: async () => {
        const notice = this.#notice
        if (notice === undefined) return undefined
        return responseBytes(await fullHealthBody(this.#sources, notice, this.#defects))
      },
    })
    this.#connections.add(connection)
    void connection.closed.then(() => this.#connections.delete(connection))
    // 客户端一面开始应答之前（或停收之后），运维面收到连接即关闭，不写任何字节
    if (!this.#open) connection.stopReceiving()
  }

  /** 撤除：停止接受 → 停收 → 有界等在途答完 → 关闭其余连接 → 删掉套接字文件。 */
  async dispose(server: Server, path: string): Promise<void> {
    this.#open = false
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
    await removeSocketFile(path)
  }
}

export const governanceCenterOpsPlugin = definePlugin<GovernanceCenterOpsConfig>({
  name: 'governance-center-ops',
  inject: ['storage', 'clock'],
  Config: GovernanceCenterOpsConfigSchema,
  async apply(ctx: Context, config) {
    const logger = ctx.logger('governance-center-ops')
    // 服务实例经 inject 取得（`ctx.get` 不带类型）；按各 owner 公开的服务面类型收下
    const storage: Storage = ctx.get('storage')
    const clock: Clock = ctx.get('clock')
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
    )
    // 先挂三条监听（经 effect 纳管，随本 fiber 撤除）；只订阅事件声明模块里的三个名字
    ctx.on(serving, notice => face.onServing(notice))
    ctx.on(stopped, () => face.onStopped())
    ctx.on(defect, () => face.onDefect())

    const path = await prepareSocketPath(config.socketDirectory)
    const server = await listenOnSocket(path)
    server.on('connection', socket => face.accept(socket))
    // 监听期间的服务器错误（例如接受连接时句柄耗尽）只记下，不让进程因未处理的 error 退出
    server.on('error', error => logger.error('ops socket server error: %s', error.name))
    try {
      ctx.effect(() => () => face.dispose(server, path), 'governance-center-ops socket')
    } catch (error) {
      // 登记时本 fiber 已被撤（INACTIVE_EFFECT）：自己收掉再重抛
      await face.dispose(server, path)
      throw error
    }

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
})
