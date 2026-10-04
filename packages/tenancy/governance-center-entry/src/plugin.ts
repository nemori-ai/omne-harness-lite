import { STORAGE_SERVICE, type StorageService } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
// 入口层插件 `governance-center-entry`（入口契约全篇；入口节点 design「插件边界」「就绪与开门为什么分两步」「成对的装载与撤除」）。
// 独立、不 provide 的 fiber；必需 inject 它消费的全部面——任一缺席即 PENDING，客户端一面整体不应答（S-34 起来即整体）。
// 插件体只做到「就绪」：端口绑好不受理、中心标识读或铸好、钟可读，然后返回；开门挂在装配传入的 `openSignal` 上。
import type { Context, Logger } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin, fiberIsActive } from '@omne-harness-lite/kernel-basis/cordis'
import type { Clock, Instant } from '@omne-harness-lite/offer-expiry'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { readOrMintCenterId } from './center-id/read-or-mint.ts'
import type { GovernanceCenterId } from './center-id/table.ts'
import { defect, listening, serving, stopped } from './events.ts'
import type { ServingNotice } from './ops/notice.ts'
import { RECEIVE_LIMITS } from './ops/limits.ts'
import { entryAnswerBytes, publicHealthBytes } from './routing/answers.ts'
import { decide } from './routing/decide.ts'
import { type RequestRecord, thrownValue } from './routing/record.ts'
import type { EntryServices } from './routing/routes.ts'
import { ClientFace } from './transport/client-face.ts'

/** 入口层加载时等待中心时钟超界；装配按类型归类，不依赖说明文字。 */
export class GovernanceCenterClockTimeoutError extends Error {
  override readonly name = 'GovernanceCenterClockTimeoutError'

  constructor() {
    super('governance-center-entry: the center clock could not be read within clockReadyTimeoutMs')
  }
}

export interface GovernanceCenterEntryConfig {
  /** 监听地址与端口（部署配置；端口 0 由系统分配，只给测试用）。 */
  readonly listen: { readonly host: string; readonly port: number }
  /** TLS 证书链与私钥（PEM，部署配置输入，不是部署密钥）。 */
  readonly tls: { readonly certificateChainPem: string; readonly privateKeyPem: string }
  /** 中心所装版本的标识（公开体检里的 `version`）。 */
  readonly version: string
  /** 停机排空上界（毫秒）。 */
  readonly drainTimeoutMs: number
  /** 启动时与开门那一刻等钟可读的上界（毫秒）；须严格大于时钟的租约宽度（装配核）。 */
  readonly clockReadyTimeoutMs: number
  /** 装配放行开门的信号：全部 fiber ACTIVE 且升级快照确认之后兑现；拒绝即不开门。 */
  readonly openSignal: PromiseLike<unknown>
}

const positiveMs = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

/**
 * `openSignal` 是运行时对象：用 `z.custom` 描述，校验通过的值原样（同一引用）交给插件体——zod object 会重建对象，
 * 装配手里那个 Promise 就兑现不到入口层（A-1 取证，storage-sql probe `upgrade.guard-binding`）。
 */
const openSignal = z.custom<PromiseLike<unknown>>(
  value =>
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function',
  'openSignal must be a thenable constructed by the assembly',
)

export const GovernanceCenterEntryConfigSchema: z.ZodType<GovernanceCenterEntryConfig, unknown> = z
  .object({
    listen: z
      .object({ host: z.string().min(1), port: z.number().int().min(0).max(65535) })
      .strict(),
    tls: z
      .object({ certificateChainPem: z.string().min(1), privateKeyPem: z.string().min(1) })
      .strict(),
    version: z.string().min(1),
    drainTimeoutMs: positiveMs,
    clockReadyTimeoutMs: positiveMs,
    openSignal,
  })
  .strict()

/** 等钟可读时的轮询间隔。 */
const CLOCK_POLL_MS = 100

function readClock(clock: Clock): Instant | undefined {
  try {
    const now = clock.now()
    return now !== 'unavailable' && Number.isSafeInteger(now) ? now : undefined
  } catch {
    return undefined
  }
}

/** 本 fiber 已被撤除（插件体执行期间状态是 LOADING，所以看 uid，不看 ACTIVE）。 */
function fiberDisposed(ctx: Context): boolean {
  return ctx.fiber.uid === null
}

/**
 * 插件体里等钟可读（启动成功以钟可读为条件，S-34）：按间隔轮询，上界 `timeoutMs`；
 * 等待期间本 fiber 被撤 ⇒ 清掉定时器、停止（不抛出）。
 */
function waitForClock(
  ctx: Context,
  clock: Clock,
  timeoutMs: number,
): Promise<Instant | 'timeout' | 'disposed'> {
  return new Promise(resolve => {
    let tick: NodeJS.Timeout | undefined
    const deadline = setTimeout(() => {
      clearTimeout(tick)
      resolve('timeout')
    }, timeoutMs)
    const attempt = () => {
      if (fiberDisposed(ctx)) {
        clearTimeout(deadline)
        resolve('disposed')
        return
      }
      const now = readClock(clock)
      if (now !== undefined) {
        clearTimeout(deadline)
        resolve(now)
        return
      }
      tick = setTimeout(attempt, CLOCK_POLL_MS)
    }
    attempt()
  })
}

/**
 * 一个入口层实例的运行态：闸（在 {@link ClientFace} 里）、开门过程、通知出口与工程记录。
 * 插件实例里只有启动时定下的常量——没有任何按请求、按来者、按登录状态保存的值（S-15、S-16）。
 */
class EntryRuntime {
  readonly #ctx: Context
  readonly #logger: Logger
  readonly #face: ClientFace
  readonly #clock: Clock
  readonly #centerId: GovernanceCenterId
  readonly #version: string
  readonly #clockReadyTimeoutMs: number
  #startedAt: Instant | undefined
  #openTick: NodeJS.Timeout | undefined
  #openDeadline: NodeJS.Timeout | undefined
  /** 撤除已开始：不再开门。 */
  #disposing = false
  /** 撤除已返回：之后仍在跑的请求再遇到缺陷，只写工程记录、不再 emit。 */
  #noticesClosed = false
  readonly #business = new Set<Promise<unknown>>()

  get accepting(): boolean {
    return !this.#disposing
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    const job = work()
    this.#business.add(job)
    job.then(
      () => this.#business.delete(job),
      () => this.#business.delete(job),
    )
    return job
  }

  constructor(
    ctx: Context,
    logger: Logger,
    face: ClientFace,
    clock: Clock,
    centerId: GovernanceCenterId,
    config: GovernanceCenterEntryConfig,
  ) {
    this.#ctx = ctx
    this.#logger = logger
    this.#face = face
    this.#clock = clock
    this.#centerId = centerId
    this.#version = config.version
    this.#clockReadyTimeoutMs = config.clockReadyTimeoutMs
  }

  /** 四条通知都是 emit：处理者抛出只记 error，不改变入口层的行为（basis `emit-listener-throw-propagates`）。 */
  #notify(emitting: () => void, name: string): void {
    try {
      emitting()
    } catch (error) {
      this.#logger.error('a listener of %s threw %s', name, thrownValue(error))
    }
  }

  #servingNotice(startedAt: Instant): ServingNotice {
    return { centerId: this.#centerId, version: this.#version, startedAt }
  }

  /** `openSignal` 兑现：读钟 → emit serving → 开闸。读不到按同一间隔轮询，上界 `clockReadyTimeoutMs`。 */
  startOpening(): void {
    if (this.#disposing || this.#face.gate !== 'closed' || this.#openDeadline !== undefined) return
    this.#openDeadline = setTimeout(() => this.#abandonOpening(), this.#clockReadyTimeoutMs)
    this.#tryOpen()
  }

  #tryOpen(): void {
    this.#openTick = undefined
    // 每一拍先核：本 fiber 已撤或闸已不是 closed ⇒ 停止，不开门、不发通知
    if (this.#disposing || fiberDisposed(this.#ctx) || this.#face.gate !== 'closed') {
      this.#stopOpening()
      return
    }
    // 重跑时 openSignal 早已兑现，续延可能先于 fiber 进入 ACTIVE：等它就绪再开
    const now = fiberIsActive(this.#ctx) ? readClock(this.#clock) : undefined
    if (now === undefined) {
      this.#openTick = setTimeout(() => this.#tryOpen(), CLOCK_POLL_MS)
      return
    }
    this.#stopOpening()
    this.#startedAt = now
    const notice = this.#servingNotice(now)
    this.#notify(() => this.#ctx.emit(serving, notice), serving)
    this.#face.open()
  }

  /** 开门那一刻钟超界读不到：闸 closed → retired、释放端口、记一条原因为钟的 error，不发任何通知（N-12）。 */
  #abandonOpening(): void {
    this.#openDeadline = undefined
    if (this.#openTick !== undefined) clearTimeout(this.#openTick)
    this.#openTick = undefined
    if (this.#disposing || this.#face.gate !== 'closed') return
    this.#logger.error(
      'the center did not open: the clock could not be read within clockReadyTimeoutMs (cause: clock)',
    )
    this.#face.retire().catch((error: unknown) => {
      this.#logger.error('releasing the listener failed: %s', thrownValue(error))
    })
  }

  #stopOpening(): void {
    if (this.#openTick !== undefined) clearTimeout(this.#openTick)
    if (this.#openDeadline !== undefined) clearTimeout(this.#openDeadline)
    this.#openTick = undefined
    this.#openDeadline = undefined
  }

  /** 运维面装载时的握手：闸是 serving ⇒ 重发同一份 `serving`。 */
  onListening(): void {
    if (this.#face.gate !== 'serving' || this.#startedAt === undefined) return
    const notice = this.#servingNotice(this.#startedAt)
    this.#notify(() => this.#ctx.emit(serving, notice), serving)
  }

  /** 每个请求一条工程记录；缺陷另发一次 `defect`（运维面据此计 `defectCount`）。 */
  record(record: RequestRecord): void {
    if (record.defect === true) {
      this.#logger.error('request %o', record)
      if (!this.#noticesClosed) this.#notify(() => this.#ctx.emit(defect), defect)
    } else {
      this.#logger.info('request %o', record)
    }
  }

  /**
   * 撤除（一个 effect 内有序）。已开门：闸 serving → draining 并 emit stopped → 停止接受 → 有界等在途 → 关闭；
   * 未开门：闸置 retired、关闭已接的连接、释放端口，不等在途、不发 stopped。
   */
  async dispose(drainTimeoutMs: number): Promise<void> {
    this.#disposing = true
    this.#stopOpening()
    try {
      if (this.#face.gate === 'serving') {
        this.#face.beginDraining()
        this.#notify(() => this.#ctx.emit(stopped), stopped)
        await this.#face.drain(drainTimeoutMs)
      } else {
        await this.#face.retire()
      }
    } finally {
      await Promise.allSettled([...this.#business])
      this.#noticesClosed = true
    }
  }
}

export const governanceCenterEntryPlugin = definePlugin<GovernanceCenterEntryConfig>({
  name: 'governance-center-entry',
  inject: [
    STORAGE_SERVICE,
    CLOCK_SERVICE,
    'credentials',
    'logins',
    'accounts',
    'registration',
    'organizations',
    'memberships',
    'offers',
  ],
  Config: GovernanceCenterEntryConfigSchema,
  async apply(ctx: Context, config) {
    const logger = ctx.logger('governance-center-entry')
    // inject 保证必需服务已就位；AtomicStorage 扩展仍按原判据核验。
    const clock: Clock = ctx.clock
    const storage: AtomicStorage = ctx.storage as StorageService & AtomicStorage
    if (typeof storage.atomic !== 'function') throw new TypeError('entry2 requires AtomicStorage')
    const services: EntryServices = {
      accounts: ctx.get('accounts'),
      logins: ctx.get('logins'),
      registration: ctx.get('registration'),
      credentials: ctx.get('credentials'),
      organizations: ctx.get('organizations'),
      memberships: ctx.get('memberships'),
      offers: ctx.get('offers'),
    }

    let runtime: EntryRuntime | undefined
    let publicHealth: Buffer | undefined
    const face = await ClientFace.bind({
      host: config.listen.host,
      port: config.listen.port,
      tls: config.tls,
      limits: RECEIVE_LIMITS,
      answer: body => {
        const current = runtime
        const health = publicHealth
        if (current === undefined || health === undefined || !current.accepting)
          return Promise.resolve(undefined)
        return current.run(async () => {
          try {
            const decision = await decide(body, { services, publicHealth: health, storage })
            current.record(decision.record)
            return decision.bytes
          } catch (error) {
            current.record({
              stage: 'operation',
              answer: 'unavailable',
              observed: { call: 'operation', value: thrownValue(error) },
              defect: true,
            })
            return entryAnswerBytes('unavailable')
          }
        })
      },
      closedWithoutAnswer: reason =>
        logger.debug('connection closed without an answer: %s', reason),
      serverError: error => logger.error('client face server error: %s', error.name),
    })
    // 紧接着登记撤除；登记时本 fiber 已被撤（INACTIVE_EFFECT）⇒ 自己释放端口再重抛
    try {
      ctx.effect(
        () => async () => {
          if (runtime === undefined) await face.retire()
          else await runtime.dispose(config.drainTimeoutMs)
        },
        'governance-center-entry listener',
      )
    } catch (error) {
      await face.retire()
      throw error
    }

    // 读或铸中心标识（S-28）：失败四支各抛具名错误 ⇒ FAILED，已登记的 effect 随之释放端口
    const identity = await readOrMintCenterId(storage)

    // 启动成功以钟可读为条件（S-34）：超界 ⇒ 启动失败，说明点名是钟
    const ready = await waitForClock(ctx, clock, config.clockReadyTimeoutMs)
    if (ready === 'disposed') return
    if (ready === 'timeout') throw new GovernanceCenterClockTimeoutError()

    publicHealth = publicHealthBytes(identity.centerId, config.version)
    const current = new EntryRuntime(ctx, logger, face, clock, identity.centerId, config)
    runtime = current
    ctx.on(listening, () => current.onListening())
    // 开门挂在 openSignal 上，插件体不 await 它（否则本 fiber 停在 LOADING，装配等不到全部 ACTIVE）；
    // 拒绝 ⇒ 闸保持关着、不记不发，由续延吸收，不留未处理的拒绝
    Promise.resolve(config.openSignal).then(
      () => current.startOpening(),
      () => undefined,
    )
  },
})
