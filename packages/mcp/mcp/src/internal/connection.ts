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

export type GenerationPolicy = 'on-attempt' | 'on-negotiation'

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

  get generation(): Generation {
    return this.#generation
  }

  get peer(): PeerIdentity | undefined {
    return this.#peer
  }

  get usablePeer(): PeerIdentity | undefined {
    const kind = this.#state.kind
    return kind === 'ready' || kind === 'degraded' ? this.#peer : undefined
  }

  get closed(): boolean {
    return this.#state.kind === 'closed'
  }

  attempt(): Generation {
    this.#expect('attempt', ['none', 'lost'])
    const next = generationOf(this.#generation + 1)
    if (this.#policy === 'on-attempt') this.#generation = next
    this.#state = { kind: 'preparing' }
    return next
  }

  ready(peer: PeerIdentity): Generation {
    const from = this.#expect('ready', ['preparing', 'degraded'])
    if (from === 'preparing' && this.#policy === 'on-negotiation')
      this.#generation = generationOf(this.#generation + 1)
    this.#peer = peer
    this.#state = { kind: 'ready' }
    return this.#generation
  }

  degrade(reason: DegradedReason): void {
    this.#expect('degrade', ['ready'])
    this.#state = { kind: 'degraded', reason }
  }

  lose(reason: LostReason, residual?: readonly Residual[]): void {
    this.#expect('lose', ['preparing', 'ready', 'degraded'])
    this.#state =
      residual === undefined ? { kind: 'lost', reason } : { kind: 'lost', reason, residual }
  }

  close(): void {
    this.#expect('close', ['none', 'preparing', 'ready', 'degraded', 'lost'])
    this.#state = { kind: 'closed' }
  }

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
