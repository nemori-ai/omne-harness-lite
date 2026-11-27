import type { Answer, Contract, Entry } from '@omne-harness/dynamis'
/** What the connection lends the modules of this tree: a plugin cannot grant itself a protocol or a view of the server. */
const GRANTS_ITSELF = Object.freeze({
  only: 'deployment',
  why: 'grants-itself',
  note: 'The connection lends these to the modules of this tree; a plugin cannot put what decides what it may call.',
} as const)
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { keyText, type ProtocolKey, type ProtocolStanding } from './availability.ts'

/** The point on the client tree: one item for each protocol the server serves and this client has a client of. */
export const CONNECTION_PROTOCOLS_POINT = 'connection.protocols'

export const protocolsContract: Contract = Object.freeze({
  name: CONNECTION_PROTOCOLS_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the protocol name and its major, <name>/v<major>',
  gives: 'the client of this major of the protocol, and the revision the server has it at',
  item: Object.freeze({
    kind: 'pure',
    fields: Object.freeze({ protocol: 'string', major: 'number', client: 'object' }),
  }),
  resolve: 'conflict',
  binding: 'run',
  onError: 'a key with no item, or with two, sends nothing: a call answers unavailable',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  scopes: GRANTS_ITSELF,
  summary: 'The protocols this client can call now: served by the server, and held by this client.',
})

export const CONNECTION_SERVER_POINTS = 'connection.server-points'

/** What the server tells of its own tree, for a module that follows a point of it. */
export type ServerPoints = Readonly<{
  keys(point: string): readonly string[] | undefined
  subscribe(listener: () => void): () => void
}>

export const serverPointsContract: Contract = Object.freeze({
  name: CONNECTION_SERVER_POINTS,
  tree: 'client',
  arity: 'one',
  keyFrom: null,
  key: 'none',
  gives: 'a reading of the keys the server makes public on its points, and a way to follow them',
  item: Object.freeze({
    kind: 'pure',
    fields: Object.freeze({ keys: 'function', subscribe: 'function' }),
  }),
  resolve: 'conflict',
  binding: 'run',
  onError: 'a module that follows a point of the server does not follow it',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  scopes: GRANTS_ITSELF,
  summary:
    'What the server tells of its own tree: the keys now on each point that makes them public.',
})

export function serverPointsEntry(reading: ServerPoints): Entry<ServerPoints> {
  return {
    point: CONNECTION_SERVER_POINTS,
    key: '',
    id: '',
    scope: [],
    rank: 0,
    digest: 'connection',
    item: Object.freeze({ ...reading }),
  }
}

export type ServedProtocol = Readonly<{
  protocol: string
  major: number
  client: object
  peerRevision?: number
}>

export function servedEntry(
  key: ProtocolKey,
  client: object,
  peerRevision: number | undefined,
): Entry<ServedProtocol> {
  const item = { protocol: key.name, major: key.major, client }
  return {
    point: CONNECTION_PROTOCOLS_POINT,
    key: keyText(key),
    id: '',
    scope: [],
    rank: 0,
    digest: `${keyText(key)}@${peerRevision ?? 'unsaid'}`,
    item: Object.freeze(peerRevision === undefined ? item : { ...item, peerRevision }),
  }
}

export type Need = Readonly<{ key: ProtocolKey; optional?: true }>

/** What a page that needs a protocol is told: only a pinned need is called through. */
export type NeedStanding =
  | Readonly<{ kind: 'connecting' | 'pinned' | 'absent' | 'conflict' | 'optional-absent' }>
  | Readonly<{ kind: 'other-major'; served: readonly number[] }>

export function needStanding(need: Need, standing: ProtocolStanding): NeedStanding {
  if (standing.kind === 'other-major') return standing
  if (standing.kind === 'open') return { kind: 'pinned' }
  if (standing.kind === 'absent' && need.optional === true) return { kind: 'optional-absent' }
  return { kind: standing.kind }
}

const UNAVAILABLE = Object.freeze({ outcome: 'unavailable' as const })

type Call = (body: unknown, options?: unknown) => unknown
type Observe = (open: unknown, options: unknown) => AsyncGenerator<unknown, unknown>

async function* endsUnavailable(): AsyncGenerator<never, { kind: 'unavailable' }> {
  yield* []
  return { kind: 'unavailable' }
}

/** A client that is always there: each call goes to the one client pinned at that moment, or answers unavailable and sends nothing. */
export function alwaysClient<P extends ProtocolContract>(
  protocol: P,
  pinned: () => Answer<ServedProtocol>,
): ClientOf<P> {
  const through = (): Record<string, unknown> | undefined => {
    const answer = pinned()
    return answer.kind === 'one' ? (answer.entry.item.client as Record<string, unknown>) : undefined
  }
  const client: Record<string, unknown> = {}
  for (const name of Object.keys(protocol.operations))
    client[name] = (body: unknown, options?: unknown) => {
      const target = through()
      return target === undefined
        ? Promise.resolve(UNAVAILABLE)
        : (target[name] as Call)(body, options)
    }
  const observers: Record<string, unknown> = {}
  for (const name of Object.keys(protocol.observations))
    observers[name] = (open: unknown, options: unknown) => {
      const target = through()?.['observe'] as Record<string, Observe> | undefined
      return target === undefined ? endsUnavailable() : (target[name] as Observe)(open, options)
    }
  client['observe'] = Object.freeze(observers)
  return Object.freeze(client) as ClientOf<P>
}
