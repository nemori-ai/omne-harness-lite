import type { Clock, Instant } from '@omne-harness-lite/offer-expiry'
import {
  SERVING_EVENT as serving,
  STOPPED_EVENT as stopped,
  DEFECT_EVENT as defect,
  type GovernanceCenterId,
  type ServingNotice,
  type EntryOpeningSignal,
} from '@omne-harness-lite/governance-center-entry'
import type { GovernanceCenterEntryDependencies } from './entry-dependencies.ts'
import {
  GovernanceCenterClockTimeoutError,
  type GovernanceCenterEntryConfig,
} from './entry-config.ts'
import {
  createWork,
  GovernanceCenterWorkStopped,
  runOwned,
  releaseSubscriptions,
  type GovernanceCenterWork,
  type GovernanceCenterLogger,
} from './work.ts'
import { readOrMintCenterId } from './center-id/read-or-mint.ts'
import { RECEIVE_LIMITS } from './ops/limits.ts'
import { entryAnswerBytes, publicHealthBytes } from './routing/answers.ts'
import { decide } from './routing/decide.ts'
import { type RequestRecord, thrownValue } from './routing/record-shapes.ts'
import { ClientFace } from './transport/client-face.ts'

/** 等钟可读时的轮询间隔。 */
const CLOCK_POLL_MS = 100

async function readClock(clock: Clock): Promise<Instant | undefined> {
  try {
    const now = await clock.now()
    return now !== 'unavailable' && Number.isSafeInteger(now) ? now : undefined
  } catch {
    return undefined
  }
}

/**
 * 插件体里等钟可读（启动成功以钟可读为条件，S-34）：按间隔轮询，上界 `timeoutMs`；
 * 等待期间本 fiber 被撤 ⇒ 清掉定时器、停止（不抛出）。
 */
function waitForClock(
  isCurrent: () => boolean,
  clock: Clock,
  timeoutMs: number,
): Promise<Instant | 'timeout' | 'disposed'> {
  return new Promise(resolve => {
    let settled = false
    let tick: NodeJS.Timeout | undefined
    const deadline = setTimeout(() => {
      settled = true
      clearTimeout(tick)
      resolve('timeout')
    }, timeoutMs)
    const attempt = async () => {
      if (!isCurrent()) {
        clearTimeout(deadline)
        settled = true
        resolve('disposed')
        return
      }
      const now = await readClock(clock)
      if (settled) return
      if (!isCurrent()) {
        settled = true
        clearTimeout(deadline)
        resolve('disposed')
        return
      }
      if (now !== undefined) {
        clearTimeout(deadline)
        settled = true
        resolve(now)
        return
      }
      tick = setTimeout(() => {
        void attempt()
      }, CLOCK_POLL_MS)
    }
    void attempt()
  })
}

/**
 * 一个入口层实例的运行态：闸（在 {@link ClientFace} 里）、开门过程、通知出口与工程记录。
 * 插件实例里只有启动时定下的常量——没有任何按请求、按来者、按登录状态保存的值（S-15、S-16）。
 */
class EntryRuntime {
  readonly #dependencies: GovernanceCenterEntryDependencies
  readonly #current: () => boolean
  #draining = false
  #retirement: Promise<void> | undefined
  readonly #logger: GovernanceCenterLogger
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
    return !this.#disposing && this.#current() && this.opening.isOpen()
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    return runOwned(this.#business, work)
  }

  constructor(
    dependencies: GovernanceCenterEntryDependencies,
    isCurrent: () => boolean,
    logger: GovernanceCenterLogger,
    face: ClientFace,
    clock: Clock,
    centerId: GovernanceCenterId,
    config: GovernanceCenterEntryConfig,
    private readonly opening: EntryOpeningSignal,
  ) {
    this.#dependencies = dependencies
    this.#current = isCurrent
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

  /** EntryOpening.wait 兑现：读钟 → emit serving → 开闸。读不到按同一间隔轮询，上界 `clockReadyTimeoutMs`。 */
  startOpening(): void {
    if (this.#disposing || this.#face.gate !== 'closed' || this.#openDeadline !== undefined) return
    this.#openDeadline = setTimeout(() => this.#abandonOpening(), this.#clockReadyTimeoutMs)
    void this.#tryOpen()
  }

  async #tryOpen(): Promise<void> {
    this.#openTick = undefined
    // 每一拍先核：本 fiber 已撤或闸已不是 closed ⇒ 停止，不开门、不发通知
    if (!this.accepting || !this.#current() || this.#face.gate !== 'closed') {
      this.#stopOpening()
      return
    }
    // 独立装配的 EntryOpening.wait 可能已兑现，续延可能先于 fiber 进入 ACTIVE：等它就绪再开
    const now = this.#dependencies.isReadyToOpen() ? await readClock(this.#clock) : undefined
    if (
      !this.accepting ||
      !this.#current() ||
      this.#face.gate !== 'closed' ||
      this.#openDeadline === undefined
    )
      return
    if (now === undefined) {
      this.#openTick = setTimeout(() => {
        void this.#tryOpen()
      }, CLOCK_POLL_MS)
      return
    }
    this.#stopOpening()
    this.#startedAt = now
    const notice = this.#servingNotice(now)
    this.#notify(() => this.#dependencies.notifications.serving(notice), serving)
    if (this.accepting && !!this.#current()) this.#face.open()
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
    this.#retirement = this.#face.retire()
    void this.#retirement.catch((error: unknown) => {
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
    if (!this.accepting || this.#face.gate !== 'serving' || this.#startedAt === undefined) return
    const notice = this.#servingNotice(this.#startedAt)
    this.#notify(() => this.#dependencies.notifications.serving(notice), serving)
  }

  /** 每个请求一条工程记录；缺陷另发一次 `defect`（运维面据此计 `defectCount`）。 */
  record(record: RequestRecord): void {
    if (record.defect === true) {
      this.#logger.error('request %o', record)
      if (!this.#noticesClosed)
        this.#notify(() => this.#dependencies.notifications.defect(), defect)
    } else {
      this.#logger.info('request %o', record)
    }
  }

  /**
   * 撤除（一个 effect 内有序）。已开门：闸 serving → draining 并 emit stopped → 停止接受 → 有界等在途 → 关闭；
   * 未开门：闸置 retired、关闭已接的连接、释放端口，不等在途、不发 stopped。
   */
  stop(): void {
    if (this.#disposing) return
    this.#disposing = true
    this.#stopOpening()
    if (this.#face.gate === 'serving') {
      this.#draining = true
      this.#face.beginDraining()
      this.#notify(() => this.#dependencies.notifications.stopped(), stopped)
    }
  }

  async dispose(drainTimeoutMs: number): Promise<void> {
    this.stop()
    try {
      if (this.#draining) {
        await this.#face.drain(drainTimeoutMs)
      } else {
        await (this.#retirement ??= this.#face.retire())
      }
    } finally {
      await Promise.allSettled([...this.#business])
      this.#noticesClosed = true
    }
  }
}

export function createGovernanceCenterEntry(
  config: GovernanceCenterEntryConfig,
  dependencies: GovernanceCenterEntryDependencies,
): GovernanceCenterWork {
  let face: ClientFace | undefined
  let runtime: EntryRuntime | undefined
  const subscriptions: (() => void)[] = []
  return createWork(
    async current => {
      const assertCurrent = (): void => {
        if (!current()) throw new GovernanceCenterWorkStopped()
      }
      assertCurrent()
      const { storage, clock, services, opening, logger } = dependencies
      if (typeof storage.atomic !== 'function') throw new TypeError('entry2 requires AtomicStorage')
      assertCurrent()
      let publicHealth: Buffer | undefined
      face = await ClientFace.bind({
        accepting: () => current() && opening.isOpen(),
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
      assertCurrent()

      // 读或铸中心标识（S-28）：失败四支各抛具名错误 ⇒ FAILED，已登记的 effect 随之释放端口
      const identity = await readOrMintCenterId(storage)
      assertCurrent()

      // 启动成功以钟可读为条件（S-34）：超界 ⇒ 启动失败，说明点名是钟
      const ready = await waitForClock(current, clock, config.clockReadyTimeoutMs)
      assertCurrent()
      if (ready === 'disposed') return
      if (ready === 'timeout') throw new GovernanceCenterClockTimeoutError()

      publicHealth = publicHealthBytes(identity.centerId, config.version)
      const instance = new EntryRuntime(
        dependencies,
        current,
        logger,
        face,
        clock,
        identity.centerId,
        config,
        opening,
      )
      runtime = instance
      subscriptions.push(dependencies.notifications.onListening(() => instance.onListening()))
      assertCurrent()
      // Readiness never waits for opening; the assembly confirms only after setup completes.
      void opening
        .wait()
        .then(
          () => instance.startOpening(),
          () => undefined,
        )
        .catch(error => logger.error('entry opening failed: %s', thrownValue(error)))
      assertCurrent()
    },
    () => runtime?.stop(),
    async () => {
      if (runtime !== undefined) await runtime.dispose(config.drainTimeoutMs)
      else await face?.retire()
    },
    () => dependencies.isCurrent(),
    () => releaseSubscriptions(subscriptions),
  )
}
