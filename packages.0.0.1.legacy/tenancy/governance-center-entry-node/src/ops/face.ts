import type { EntryOpeningSignal, ServingNotice } from '@omne-harness-lite/governance-center-entry'
import type { Server, Socket } from 'node:net'
import { runOwned, type GovernanceCenterLogger } from '../work.ts'
import { withCleanup } from '../maintenance/failure.ts'
import type { OnlineMaintenance } from '../maintenance/online.ts'
import { readOpsRequest, maintenanceResultBody } from './maintenance-wire.ts'
import { fullHealthBody, type HealthSources } from './health.ts'
import { Http1Connection } from './http1.ts'
import { RECEIVE_LIMITS } from './limits.ts'
import { removeSocketFile } from './socket.ts'
import { responseBytes } from './wire.ts'

const OPS_DRAIN_TIMEOUT_MS = 3_000

/**
 * 运维面实例：`centerId`、`version`、`startedAt` 只从 `serving` 来，`defectCount` 数 `defect` 通知，都随实例消失
 * （契约：重启归零）。应答的门是「见过 `serving`、其后没有 `stopped`」。
 */
export class OpsFace {
  readonly #sources: HealthSources
  readonly #logger: GovernanceCenterLogger
  readonly #connections = new Set<Http1Connection>()
  #notice: ServingNotice | undefined
  #open = false
  #defects = 0
  #closing: Promise<void> | undefined
  readonly #business = new Set<Promise<unknown>>()

  constructor(
    sources: HealthSources,
    logger: GovernanceCenterLogger,
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
        return runOwned(this.#business, () => this.#answer(body))
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
    if (this.#closing !== undefined) return this.#closing
    const closing = Promise.withResolvers<void>()
    this.#closing = closing.promise
    void closing.promise.catch(() => undefined)
    void this.#dispose(server, path).then(closing.resolve, closing.reject)
    return closing.promise
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
