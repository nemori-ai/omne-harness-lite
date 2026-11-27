import type { InspectionAsked, InspectionResult } from '@omne-harness/interface-protocol'

/** One request on its way: to whom it went, for which tenant, and when it is due. */
export type Pending = Readonly<{ tenant: string; client: string; due: number }>

/** The requests on their way, and the clients of each tenant that observe, the latest to come last. */
export type Ledger = Readonly<{
  pending: ReadonlyMap<string, Pending>
  clients: ReadonlyMap<string, readonly string[]>
}>

export type Answer =
  | Readonly<{ kind: 'image'; image: Extract<InspectionResult, { kind: 'image' }> }>
  | Readonly<{ kind: 'cannot'; reason: Extract<InspectionResult, { kind: 'cannot' }>['reason'] }>
  | Readonly<{ kind: 'client-absent' }>
  | Readonly<{ kind: 'unavailable'; why: 'expired' | 'client-left' | 'too-many' }>

export type LedgerEvent =
  | Readonly<{ kind: 'ask'; tenant: string; asked: InspectionAsked; now: number }>
  | Readonly<{
      kind: 'deliver'
      tenant: string
      client: string
      request: string
      result: InspectionResult
    }>
  | Readonly<{ kind: 'expire'; request: string }>
  | Readonly<{ kind: 'leave'; tenant: string; client: string }>
  | Readonly<{ kind: 'cancel'; request: string }>
  | Readonly<{ kind: 'arrive'; tenant: string; client: string }>

/** What a step asks of the plugin: send a frame, settle a caller, or tell a client how its delivery went. */
export type LedgerEffect =
  | Readonly<{ kind: 'send'; tenant: string; client: string; asked: InspectionAsked }>
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

function ask(ledger: Ledger, event: Extract<LedgerEvent, { kind: 'ask' }>, policy: LedgerPolicy) {
  const { tenant, asked, now } = event
  const client = ledger.clients.get(tenant)?.at(-1)
  if (client === undefined) return settled(ledger, asked.request, { kind: 'client-absent' })
  const mine = [...ledger.pending.values()].filter(each => each.tenant === tenant).length
  if (mine >= policy.perTenant)
    return settled(ledger, asked.request, { kind: 'unavailable', why: 'too-many' })
  const pending = withEntry(ledger.pending, asked.request, {
    tenant,
    client,
    due: now + policy.dueMs,
  })
  return {
    ledger: { ...ledger, pending },
    effects: [{ kind: 'send', tenant, client, asked }] as const,
  }
}

const settled = (ledger: Ledger, request: string, answer: Answer) => ({
  ledger: { ...ledger, pending: without(ledger.pending, request) },
  effects: [{ kind: 'settle', request, answer }] as const,
})

const NOT_FOUND = { kind: 'delivered', outcome: 'not-found' } as const
const SUCCEEDED = { kind: 'delivered', outcome: 'succeeded' } as const

function deliver(ledger: Ledger, event: Extract<LedgerEvent, { kind: 'deliver' }>) {
  const { tenant, client, request, result } = event
  const pending = ledger.pending.get(request)
  if (pending === undefined || pending.tenant !== tenant || pending.client !== client)
    return { ledger, effects: [NOT_FOUND] }
  const answer: Answer =
    result.kind === 'image'
      ? { kind: 'image', image: result }
      : { kind: 'cannot', reason: result.reason }
  const done = settled(ledger, request, answer)
  return { ledger: done.ledger, effects: [...done.effects, SUCCEEDED] }
}

function leave(ledger: Ledger, { tenant, client }: Extract<LedgerEvent, { kind: 'leave' }>) {
  const left = (ledger.clients.get(tenant) ?? []).filter(each => each !== client)
  const clients =
    left.length === 0 ? without(ledger.clients, tenant) : withEntry(ledger.clients, tenant, left)
  const lost = [...ledger.pending].filter(
    ([, each]) => each.tenant === tenant && each.client === client,
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
      const known = (ledger.clients.get(event.tenant) ?? []).filter(each => each !== event.client)
      const clients = withEntry(ledger.clients, event.tenant, [...known, event.client])
      return { ledger: { ...ledger, clients }, effects: [] }
    }
  }
}
