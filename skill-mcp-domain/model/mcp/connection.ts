// MCP 限界上下文：MCP 连接聚合（Connection）。
// 有状态、只活在一次运行的内存里，所以用类（仓库约定：类只给有状态聚合与 Cordis Service）。
// 聚合只做状态转移，不做 IO；IO 由应用服务 Connections 经端口完成后再告诉聚合。

import { fail, succeed, assertNever, type Outcome } from '../shared.ts'
import type { StopScope } from './ports.ts'
import type { ConnectionKey, Generation, PeerIdentity } from './values.ts'

/**
 * 代际何时加一，按传输与对端时代不同——用策略表达（开闭：加一种传输就加一种策略）。
 * - on-attempt：stdio，每次启动尝试（包括失败的尝试）都加一；
 * - on-negotiation：Streamable HTTP，每次协商成功（旧对端为 initialize 完成）才加一。
 */
export type GenerationPolicy = 'on-attempt' | 'on-negotiation'

export type LostReason =
  | 'prepare-failed'
  | 'process-exited'
  | 'pipe-broken'
  | 'no-common-version'
  | 'authorization-required'
  | 'negotiation-invalidated'
  | 'session-terminated'

export type ConnectionState =
  | Readonly<{ kind: 'preparing' }>
  | Readonly<{ kind: 'ready'; peer: PeerIdentity }>
  | Readonly<{ kind: 'degraded'; peer: PeerIdentity; reason: string }>
  | Readonly<{ kind: 'lost'; reason: LostReason }>
  | Readonly<{ kind: 'closed'; confirmed: StopScope }>

export type IllegalTransition = Readonly<{ kind: 'illegal-transition'; from: ConnectionState['kind']; event: string }>

export class Connection {
  readonly #key: ConnectionKey
  readonly #policy: GenerationPolicy
  #generation: Generation
  #state: ConnectionState

  private constructor(key: ConnectionKey, policy: GenerationPolicy) {
    this.#key = key
    this.#policy = policy
    this.#generation = 0 as Generation
    this.#state = { kind: 'lost', reason: 'prepare-failed' } // 立即被 begin() 覆盖
  }

  /** 唯一入口：新建即进入第一次准备。 */
  static begin(key: ConnectionKey, policy: GenerationPolicy): Connection {
    const connection = new Connection(key, policy)
    connection.#enterPreparing()
    return connection
  }

  get key(): ConnectionKey {
    return this.#key
  }
  get generation(): Generation {
    return this.#generation
  }
  get state(): ConnectionState {
    return this.#state
  }

  /** 迟到响应按代际识别：旧代际的响应不改变新状态，也不发布新清单。 */
  accepts(generation: Generation): boolean {
    return generation === this.#generation && (this.#state.kind === 'ready' || this.#state.kind === 'degraded')
  }

  /** 准备成功。HTTP 在这里加一代。 */
  markReady(peer: PeerIdentity): Outcome<Generation, IllegalTransition> {
    if (this.#state.kind !== 'preparing') return this.#illegal('ready')
    if (this.#policy === 'on-negotiation') this.#bump()
    this.#state = { kind: 'ready', peer }
    return succeed(this.#generation)
  }

  /** 非调用的协议请求暂时失败，目标与凭据仍有效。调用失败不走这里。 */
  markDegraded(reason: string): Outcome<void, IllegalTransition> {
    const state = this.#state
    if (state.kind !== 'ready') return this.#illegal('degraded')
    this.#state = { kind: 'degraded', peer: state.peer, reason }
    return succeed(undefined)
  }

  /** 下一次非调用的协议请求成功。 */
  recover(): Outcome<void, IllegalTransition> {
    const state = this.#state
    if (state.kind !== 'degraded') return this.#illegal('recover')
    this.#state = { kind: 'ready', peer: state.peer }
    return succeed(undefined)
  }

  markLost(reason: LostReason): Outcome<void, IllegalTransition> {
    switch (this.#state.kind) {
      case 'preparing':
      case 'ready':
      case 'degraded':
        this.#state = { kind: 'lost', reason }
        return succeed(undefined)
      case 'lost':
      case 'closed':
        return this.#illegal('lost')
      default:
        return assertNever(this.#state)
    }
  }

  /** 重建。stdio 在这里加一代，不等准备成功。 */
  rebuild(): Outcome<void, IllegalTransition> {
    if (this.#state.kind !== 'lost') return this.#illegal('rebuild')
    this.#enterPreparing()
    return succeed(undefined)
  }

  /** 只记录实际确认的停止范围；关闭不证明远端调用已停。 */
  close(confirmed: StopScope): Outcome<void, IllegalTransition> {
    if (this.#state.kind === 'closed') return this.#illegal('close')
    this.#state = { kind: 'closed', confirmed }
    return succeed(undefined)
  }

  #enterPreparing(): void {
    if (this.#policy === 'on-attempt') this.#bump()
    this.#state = { kind: 'preparing' }
  }
  #bump(): void {
    this.#generation = (this.#generation + 1) as Generation
  }
  #illegal(event: string): Outcome<never, IllegalTransition> {
    return fail({ kind: 'illegal-transition', from: this.#state.kind, event })
  }
}
