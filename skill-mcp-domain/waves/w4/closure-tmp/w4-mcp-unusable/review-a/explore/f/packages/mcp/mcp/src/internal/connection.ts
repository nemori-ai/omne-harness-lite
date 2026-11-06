// The Connection aggregate: the state machine of one MCP connection and its generation. It makes
// no I/O. The connection table drives it after each port call. The state machine and the
// invariants are the group design "MCP 连接"; the reasons are SPEC S7.
import {
  isGeneration,
  type ConnectionKey,
  type ConnectionState,
  type DegradedReason,
  type Generation,
  type LostReason,
  type PeerIdentity,
  type Residual,
} from '@omne-harness/mcp-contract'

/**
 * When the generation grows. `on-attempt` is stdio: every launch attempt, failed ones included.
 * `on-negotiation` is Streamable HTTP: every successful negotiation.
 */
export type GenerationPolicy = 'on-attempt' | 'on-negotiation'

/** The five reported states of SPEC S7, and `closed`, which the status view never shows. */
export type AggregateState = ConnectionState | Readonly<{ kind: 'closed' }>

type Event = 'attempt' | 'ready' | 'degrade' | 'lose' | 'close'

function generationOf(value: number): Generation {
  if (!isGeneration(value)) throw new RangeError('the connection generation is exhausted')
  return value
}

const ZERO = generationOf(0)

export class Connection {
  readonly #key: ConnectionKey
  readonly #policy: GenerationPolicy
  #generation: Generation
  #state: AggregateState = { kind: 'none' }
  #peer: PeerIdentity | undefined

  /** `generation` continues a count that an earlier, closed connection of the same key left. */
  constructor(key: ConnectionKey, policy: GenerationPolicy, generation: Generation = ZERO) {
    this.#key = key
    this.#policy = policy
    this.#generation = generation
  }

  get key(): ConnectionKey {
    return this.#key
  }

  get policy(): GenerationPolicy {
    return this.#policy
  }

  get state(): AggregateState {
    return this.#state
  }

  /** The committed generation: the one a late result is compared with. */
  get generation(): Generation {
    return this.#generation
  }

  get peer(): PeerIdentity | undefined {
    return this.#peer
  }

  /**
   * A launch or negotiation attempt begins. Answers the generation this attempt has once it is
   * ready: under `on-attempt` it is committed now, failed attempts included; under
   * `on-negotiation` it is committed by `ready`.
   */
  attempt(): Generation {
    this.#expect('attempt', ['none', 'lost'])
    const next = generationOf(this.#generation + 1)
    if (this.#policy === 'on-attempt') this.#generation = next
    this.#state = { kind: 'preparing' }
    return next
  }

  /** Negotiation done, or the next non-call request succeeded after `degraded`. */
  ready(peer: PeerIdentity): Generation {
    const from = this.#expect('ready', ['preparing', 'degraded'])
    if (from === 'preparing' && this.#policy === 'on-negotiation')
      this.#generation = generationOf(this.#generation + 1)
    this.#peer = peer
    this.#state = { kind: 'ready' }
    return this.#generation
  }

  /** A non-call request failed for a while; the target and the credential still hold. */
  degrade(reason: DegradedReason): void {
    this.#expect('degrade', ['ready'])
    this.#state = { kind: 'degraded', reason }
  }

  /** The connection no longer holds. `residual` is what a failed preparation left behind. */
  lose(reason: LostReason, residual?: readonly Residual[]): void {
    this.#expect('lose', ['preparing', 'ready', 'degraded'])
    this.#state =
      residual === undefined ? { kind: 'lost', reason } : { kind: 'lost', reason, residual }
  }

  /** Refuses new requests. The transport and the process are closed by the holder. */
  close(): void {
    this.#expect('close', ['none', 'preparing', 'ready', 'degraded', 'lost'])
    this.#state = { kind: 'closed' }
  }

  /** True when a result produced on `generation` belongs to the present, usable connection. */
  isCurrent(generation: Generation): boolean {
    const kind = this.#state.kind
    return generation === this.#generation && (kind === 'ready' || kind === 'degraded')
  }

  #expect(event: Event, from: readonly AggregateState['kind'][]): AggregateState['kind'] {
    const kind = this.#state.kind
    if (!from.includes(kind))
      throw new TypeError(`MCP connection: ${event} is not a transition from ${kind}`)
    return kind
  }
}
