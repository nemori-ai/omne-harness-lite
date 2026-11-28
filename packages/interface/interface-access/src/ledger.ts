import type {
  InspectionAsked,
  InspectionNow,
  InspectionReason,
  InspectionResult,
  SeenResult,
} from '@omne-harness/interface-protocol'

export type Channel = 'look' | 'now'

export type InspectionFrame = InspectionAsked | InspectionNow

export type Pending = Readonly<{ tenant: string; client: string; due: number; want: Channel }>

export type Observer = Readonly<{ client: string; channel: Channel; revision: number }>

export type Ledger = Readonly<{
  pending: ReadonlyMap<string, Pending>
  clients: ReadonlyMap<string, readonly Observer[]>
}>

export type Seen = Exclude<SeenResult, { kind: 'cannot' }>

export type Answer =
  | Readonly<{ kind: 'image'; image: Extract<InspectionResult, { kind: 'image' }> }>
  | Readonly<{ kind: 'seen'; seen: Seen; met: boolean }>
  | Readonly<{ kind: 'cannot'; reason: InspectionReason }>
  | Readonly<{ kind: 'client-absent' }>
  | Readonly<{ kind: 'unavailable'; why: 'expired' | 'client-left' | 'too-many' }>

export type LedgerEvent =
  | Readonly<{ kind: 'ask'; tenant: string; asked: InspectionFrame; now: number }>
  | Readonly<{
      kind: 'deliver'
      tenant: string
      client: string
      request: string
      result: InspectionResult
    }>
  | Readonly<{
      kind: 'deliver-seen'
      tenant: string
      client: string
      request: string
      result: SeenResult
      met: boolean
    }>
  | Readonly<{ kind: 'expire'; request: string }>
  | Readonly<{ kind: 'leave'; tenant: string; client: string; channel: Channel }>
  | Readonly<{ kind: 'cancel'; request: string }>
  | Readonly<{
      kind: 'arrive'
      tenant: string
      client: string
      channel: Channel
      revision: number
    }>

/** What a step asks of the plugin: send a frame, settle a caller, or tell a client how its delivery went. */
export type LedgerEffect =
  | Readonly<{
      kind: 'send'
      tenant: string
      client: string
      channel: Channel
      asked: InspectionFrame
    }>
  | Readonly<{ kind: 'settle'; request: string; answer: Answer }>
  | Readonly<{ kind: 'delivered'; outcome: 'succeeded' | 'not-found' }>

export type LedgerPolicy = Readonly<{ dueMs: number; perTenant: number }>

export const EMPTY_LEDGER: Ledger = Object.freeze({ pending: new Map(), clients: new Map() })

const without = <V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> => {
  const next = new Map(map)
  next.delete(key)
  return next
}

const withEntry = <V>(map: ReadonlyMap<string, V>, key: string, value: V): ReadonlyMap<string, V> =>
  new Map(map).set(key, value)

export const channelOf = (asked: InspectionFrame): Channel => ('page' in asked ? 'look' : 'now')

const readers = (asked: InspectionFrame, observers: readonly Observer[]): readonly Observer[] => {
  const channel = channelOf(asked)
  const later = 'page' in asked && (asked.part !== undefined || asked.until !== undefined)
  return observers.filter(each => each.channel === channel && (!later || each.revision >= 2))
}

function ask(ledger: Ledger, event: Extract<LedgerEvent, { kind: 'ask' }>, policy: LedgerPolicy) {
  const { tenant, asked, now } = event
  const observers = ledger.clients.get(tenant) ?? []
  if (observers.length === 0) return settled(ledger, asked.request, { kind: 'client-absent' })
  const client = readers(asked, observers).at(-1)?.client
  if (client === undefined)
    return settled(ledger, asked.request, { kind: 'cannot', reason: 'unsupported' })
  const mine = [...ledger.pending.values()].filter(each => each.tenant === tenant).length
  if (mine >= policy.perTenant)
    return settled(ledger, asked.request, { kind: 'unavailable', why: 'too-many' })
  const want = channelOf(asked)
  const pending = withEntry(ledger.pending, asked.request, {
    tenant,
    client,
    due: now + policy.dueMs,
    want,
  })
  return {
    ledger: { ...ledger, pending },
    effects: [{ kind: 'send', tenant, client, channel: want, asked }] as const,
  }
}

const settled = (ledger: Ledger, request: string, answer: Answer) => ({
  ledger: { ...ledger, pending: without(ledger.pending, request) },
  effects: [{ kind: 'settle', request, answer }] as const,
})

const NOT_FOUND = { kind: 'delivered', outcome: 'not-found' } as const
const SUCCEEDED = { kind: 'delivered', outcome: 'succeeded' } as const

function deliver(
  ledger: Ledger,
  event: Extract<LedgerEvent, { kind: 'deliver' | 'deliver-seen' }>,
) {
  const { tenant, client, request, result } = event
  const pending = ledger.pending.get(request)
  const want: Channel = event.kind === 'deliver' ? 'look' : 'now'
  if (pending?.tenant !== tenant || pending.client !== client || pending.want !== want)
    return { ledger, effects: [NOT_FOUND] }
  const answer: Answer =
    result.kind === 'cannot'
      ? { kind: 'cannot', reason: result.reason }
      : event.kind === 'deliver-seen'
        ? { kind: 'seen', seen: result, met: event.met }
        : { kind: 'image', image: result as Extract<InspectionResult, { kind: 'image' }> }
  const done = settled(ledger, request, answer)
  return { ledger: done.ledger, effects: [...done.effects, SUCCEEDED] }
}

function leave(ledger: Ledger, event: Extract<LedgerEvent, { kind: 'leave' }>) {
  const { tenant, client, channel } = event
  const left = (ledger.clients.get(tenant) ?? []).filter(
    each => each.client !== client || each.channel !== channel,
  )
  const clients =
    left.length === 0 ? without(ledger.clients, tenant) : withEntry(ledger.clients, tenant, left)
  const lost = [...ledger.pending].filter(
    ([, each]) => each.tenant === tenant && each.client === client && each.want === channel,
  )
  const pending = new Map(ledger.pending)
  for (const [request] of lost) pending.delete(request)
  const effects = lost.map(([request]) => ({
    kind: 'settle' as const,
    request,
    answer: { kind: 'unavailable', why: 'client-left' } as const,
  }))
  return { ledger: { clients, pending }, effects }
}

/** The ledger of the requests, a total function of its events: an event for a request that is not on its way changes nothing. */
export function stepLedger(
  ledger: Ledger,
  event: LedgerEvent,
  policy: LedgerPolicy,
): Readonly<{ ledger: Ledger; effects: readonly LedgerEffect[] }> {
  switch (event.kind) {
    case 'ask':
      return ask(ledger, event, policy)
    case 'deliver':
    case 'deliver-seen':
      return deliver(ledger, event)
    case 'expire':
      return ledger.pending.has(event.request)
        ? settled(ledger, event.request, { kind: 'unavailable', why: 'expired' })
        : { ledger, effects: [] }
    case 'cancel':
      return { ledger: { ...ledger, pending: without(ledger.pending, event.request) }, effects: [] }
    case 'leave':
      return leave(ledger, event)
    case 'arrive': {
      const { tenant, client, channel, revision } = event
      const known = (ledger.clients.get(tenant) ?? []).filter(
        each => each.client !== client || each.channel !== channel,
      )
      const clients = withEntry(ledger.clients, tenant, [...known, { client, channel, revision }])
      return { ledger: { ...ledger, clients }, effects: [] }
    }
  }
}
