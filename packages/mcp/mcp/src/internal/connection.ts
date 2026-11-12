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
} from '@omne-harness/mcp-contract'

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
  #generation: Generation
  #state: AggregateState = { kind: 'none' }
  #peer: PeerIdentity | undefined

  /** `generation` continues a count that an earlier, closed connection of the same key left. */
  constructor(key: ConnectionKey, generation: Generation = ZERO) {
    this.#key = key
    this.#generation = generation
  }

  get key(): ConnectionKey {
    return this.#key
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

  /** The peer while the connection takes requests (`ready` or `degraded`); else undefined. */
  get usablePeer(): PeerIdentity | undefined {
    const kind = this.#state.kind
    return kind === 'ready' || kind === 'degraded' ? this.#peer : undefined
  }

  /** True once `close()` ran: the connection refuses requests from then on, for good. */
  get closed(): boolean {
    return this.#state.kind === 'closed'
  }

  /**
   * A negotiation attempt begins. Answers the generation this attempt has once it is ready:
   * `ready` commits it (SPEC MC-6); a failed attempt leaves the generation as it was.
   */
  attempt(): Generation {
    this.#expect('attempt', ['none', 'lost'])
    const next = generationOf(this.#generation + 1)
    this.#state = { kind: 'preparing' }
    return next
  }

  /** Negotiation done, or the next non-call request succeeded after `degraded`. */
  ready(peer: PeerIdentity): Generation {
    const from = this.#expect('ready', ['preparing', 'degraded'])
    if (from === 'preparing') this.#generation = generationOf(this.#generation + 1)
    this.#peer = peer
    this.#state = { kind: 'ready' }
    return this.#generation
  }

  /** A non-call request failed for a while; the target and the credential still hold. */
  degrade(reason: DegradedReason): void {
    this.#expect('degrade', ['ready'])
    this.#state = { kind: 'degraded', reason }
  }

  /** The connection no longer holds. */
  lose(reason: LostReason): void {
    this.#expect('lose', ['preparing', 'ready', 'degraded'])
    this.#state = { kind: 'lost', reason }
  }

  /** Refuses new requests. The transport is closed by the holder. */
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
