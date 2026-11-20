import type {
  Dispatch,
  DispatchEvent,
  DispatchId,
  Instant,
  SessionRef,
  TenantId,
} from '@omne-harness/dispatch-contract'
import type { DispatchStore, StoreAnswer, StoreRead } from '../store.ts'

export type StoreConformanceCase = Readonly<{
  name: string
  /** Runs the case against a store of its own; rejects with what did not hold. */
  run(open: () => Promise<DispatchStore>): Promise<void>
}>

const T1 = 'conformance-tenant-1' as TenantId
const T2 = 'conformance-tenant-2' as TenantId
const PARENT = 'conformance-parent' as SessionRef
const at = (second: number) => `2026-11-20T00:00:${String(second).padStart(2, '0')}.000Z` as Instant

/** An accepted dispatch of the conformance parent, numbered so that identities and times differ. */
export function acceptedDispatch(number: number, change: Partial<Dispatch> = {}): Dispatch {
  return {
    id: `dsp_${String(number).padStart(64, '0')}` as DispatchId,
    tenant: T1,
    dispatcher: PARENT,
    call: `call-${number}`,
    mode: 'delegate',
    agent: 'helper',
    instruction: `work ${number}`,
    expectation: null,
    session: `conformance-child-${number}` as SessionRef,
    state: 'accepted',
    report: null,
    failure: null,
    stop: null,
    delivery: null,
    acceptedAt: at(number),
    changedAt: at(number),
    ...change,
  }
}

function same(actual: unknown, expected: unknown, what: string): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) throw new Error(`${what}: expected ${right}, got ${left}`)
}

function committed<T>(answer: StoreAnswer<T>, what: string): T {
  if (answer.kind !== 'committed') throw new Error(`${what}: the commit answered ${answer.kind}`)
  return answer.value
}

function read<T>(answer: StoreRead<T>, what: string): T {
  if (answer.kind !== 'read') throw new Error(`${what}: the read answered ${answer.kind}`)
  return answer.value
}

const ids = (rows: readonly Dispatch[]) => rows.map(row => row.id)

async function accept(store: DispatchStore, dispatch: Dispatch, maxOpen = 8, tenant = T1) {
  return committed(await store.accept(tenant, { dispatch, maxOpen }), 'accept')
}

async function apply(store: DispatchStore, id: DispatchId, event: DispatchEvent, second = 30) {
  return committed(await store.apply(T1, { of: { id }, event, at: at(second) }), event.kind)
}

/** A dispatch taken to `reported` with its delivery pending. */
async function reported(store: DispatchStore, number: number): Promise<Dispatch> {
  const dispatch = acceptedDispatch(number)
  await accept(store, dispatch)
  await apply(store, dispatch.id, { kind: 'session-created' })
  const result = await apply(store, dispatch.id, { kind: 'report', text: `report ${number}` })
  if (result.kind !== 'changed') throw new Error(`report: ${result.kind}`)
  return result.dispatch
}

export const storeConformanceCases: readonly StoreConformanceCase[] = [
  {
    name: 'registers a dispatch once, recalls the same request and refuses another under its identity',
    async run(open) {
      const store = await open()
      const dispatch = acceptedDispatch(1)
      same(await accept(store, dispatch), { kind: 'accepted', dispatch }, 'the first acceptance')
      same(await accept(store, dispatch), { kind: 'recalled', dispatch }, 'the same request again')
      const other = { ...dispatch, instruction: 'something else' }
      same(await accept(store, other), { kind: 'conflict' }, 'another request')
      same(read(await store.dispatch(T1, dispatch.id), 'read'), dispatch, 'the stored dispatch')
    },
  },
  {
    name: 'judges the count of open dispatches in the commit that registers one',
    async run(open) {
      const store = await open()
      await accept(store, acceptedDispatch(1), 2)
      await accept(store, acceptedDispatch(2), 2)
      same(await accept(store, acceptedDispatch(3), 2), { kind: 'too-many-open' }, 'the third')
      same(read(await store.dispatch(T1, acceptedDispatch(3).id), 'read'), null, 'not registered')
      same(read(await store.openOf(T1, PARENT), 'openOf'), 2, 'two open')
      same((await accept(store, acceptedDispatch(1), 2)).kind, 'recalled', 'a recall at the limit')
      await apply(store, acceptedDispatch(1).id, { kind: 'withdraw' })
      same(read(await store.openOf(T1, PARENT), 'openOf'), 1, 'one open after an end')
      same((await accept(store, acceptedDispatch(3), 2)).kind, 'accepted', 'the third after an end')
      const elsewhere = acceptedDispatch(4, { dispatcher: 'another-parent' as SessionRef })
      same((await accept(store, elsewhere, 1)).kind, 'accepted', 'the count is per dispatcher')
    },
  },
  {
    name: 'applies an event to the row it reads, and writes the next row in the same commit',
    async run(open) {
      const store = await open()
      const dispatch = acceptedDispatch(1)
      await accept(store, dispatch)
      const started = await apply(store, dispatch.id, { kind: 'session-created' }, 31)
      same(started.kind, 'changed', 'session-created')
      const stored = read(await store.dispatch(T1, dispatch.id), 'read')
      same(stored, { ...dispatch, state: 'started', changedAt: at(31) }, 'the started row')
      same((await apply(store, dispatch.id, { kind: 'session-created' })).kind, 'recalled', 'again')
      const bySession = committed(
        await store.apply(T1, {
          of: { session: dispatch.session },
          event: { kind: 'report', text: 'done' },
          at: at(32),
        }),
        'report by session',
      )
      same(bySession.kind, 'changed', 'the report of the dispatched session')
      const after = read(await store.ofSession(T1, dispatch.session), 'ofSession')
      same(after?.report, { text: 'done', origin: 'report' }, 'the report')
      same(after?.delivery, { kind: 'pending' }, 'the delivery')
    },
  },
  {
    name: 'leaves the row as it is when the event is refused or changes nothing, and answers absent for no row',
    async run(open) {
      const store = await open()
      const before = await reported(store, 1)
      const refused = await apply(store, before.id, { kind: 'withdraw' })
      same(refused, { kind: 'refused', reason: 'already-reported', dispatch: before }, 'withdraw')
      const unchanged = await apply(store, before.id, {
        kind: 'run-failed',
        cause: 'run-failed',
        detail: 'x',
      })
      same(unchanged, { kind: 'unchanged', dispatch: before }, 'a late failure')
      same(read(await store.dispatch(T1, before.id), 'read'), before, 'the row')
      same(
        await apply(store, acceptedDispatch(9).id, { kind: 'withdraw' }),
        { kind: 'absent' },
        'no row',
      )
      const noSession = await store.apply(T1, {
        of: { session: 'nobody' as SessionRef },
        event: { kind: 'report', text: 'x' },
        at: at(40),
      })
      same(committed(noSession, 'report'), { kind: 'absent' }, 'no dispatch of that session')
    },
  },
  {
    name: 'records the place of a pending delivery once and never replaces it',
    async run(open) {
      const store = await open()
      const before = await reported(store, 1)
      const result = { kind: 'delivered', to: 'result' } as const
      const first = committed(
        await store.recordDelivery(T1, { id: before.id, delivery: result, at: at(41) }),
        'recordDelivery',
      )
      same(first.kind, 'recorded', 'the first record')
      const again = committed(
        await store.recordDelivery(T1, { id: before.id, delivery: result, at: at(42) }),
        'recordDelivery',
      )
      same(again.kind, 'recalled', 'the same place again')
      for (const delivery of [
        { kind: 'delivered', to: 'input' },
        { kind: 'undeliverable' },
        { kind: 'wait-closed' },
      ] as const) {
        const other = committed(
          await store.recordDelivery(T1, { id: before.id, delivery, at: at(43) }),
          'recordDelivery',
        )
        same(other.kind, 'conflict', `another place: ${JSON.stringify(delivery)}`)
      }
      const stored = read(await store.dispatch(T1, before.id), 'read')
      same(stored?.delivery, result, 'the recorded place')
      same(stored?.changedAt, at(41), 'the time of the record')
      const absent = await store.recordDelivery(T1, {
        id: acceptedDispatch(9).id,
        delivery: result,
        at: at(44),
      })
      same(committed(absent, 'recordDelivery'), { kind: 'absent' }, 'no row')
      const started = acceptedDispatch(2)
      await accept(store, started)
      const early = committed(
        await store.recordDelivery(T1, { id: started.id, delivery: result, at: at(45) }),
        'recordDelivery',
      )
      same(early.kind, 'conflict', 'a dispatch without an outcome has no delivery to record')
    },
  },
  {
    name: 'confirms a stop that was asked for, once, and nothing else',
    async run(open) {
      const store = await open()
      const dispatch = acceptedDispatch(1)
      await accept(store, dispatch)
      await apply(store, dispatch.id, { kind: 'session-created' })
      const before = committed(await store.confirmStop(T1, { id: dispatch.id, at: at(50) }), 'stop')
      same(before?.stop, null, 'no stop was asked for')
      await apply(store, dispatch.id, { kind: 'withdraw' })
      const confirmed = committed(
        await store.confirmStop(T1, { id: dispatch.id, at: at(51) }),
        'stop',
      )
      same([confirmed?.stop, confirmed?.changedAt], ['confirmed', at(51)], 'confirmed')
      const again = committed(await store.confirmStop(T1, { id: dispatch.id, at: at(52) }), 'stop')
      same(again?.changedAt, at(51), 'confirmed once')
      const none = await store.confirmStop(T1, { id: acceptedDispatch(9).id, at: at(53) })
      same(committed(none, 'stop'), null, 'no row')
    },
  },
  {
    name: 'lists by dispatcher and by session in the order of acceptance, and filters by state',
    async run(open) {
      const store = await open()
      const third = acceptedDispatch(3)
      const first = acceptedDispatch(1)
      const second = acceptedDispatch(2, { dispatcher: 'another-parent' as SessionRef })
      for (const dispatch of [third, first, second]) await accept(store, dispatch)
      await apply(store, first.id, { kind: 'withdraw' })
      const list = async (query: Parameters<DispatchStore['list']>[1]) =>
        ids(read(await store.list(T1, query), 'list'))
      same(await list({ by: { dispatcher: PARENT } }), [first.id, third.id], 'by dispatcher')
      same(
        await list({ by: { dispatcher: PARENT }, states: ['withdrawn'] }),
        [first.id],
        'by state',
      )
      same(await list({ by: { dispatcher: PARENT }, states: [] }), [], 'no state named')
      same(
        await list({ by: { sessions: [third.session, second.session, 'nobody' as SessionRef] } }),
        [second.id, third.id],
        'by sessions',
      )
      same(await list({ by: { sessions: [] } }), [], 'no session named')
      same(await list({ by: { dispatcher: 'nobody' as SessionRef } }), [], 'an unknown dispatcher')
    },
  },
  {
    name: 'gives the dispatches that still have a step to take, and no others',
    async run(open) {
      const store = await open()
      const accepted = acceptedDispatch(1)
      await accept(store, accepted)
      const pending = await reported(store, 2)
      const delivered = await reported(store, 3)
      await store.recordDelivery(T1, {
        id: delivered.id,
        delivery: { kind: 'delivered', to: 'result' },
        at: at(41),
      })
      const stopping = acceptedDispatch(4)
      await accept(store, stopping)
      await apply(store, stopping.id, { kind: 'session-created' })
      await apply(store, stopping.id, { kind: 'withdraw' })
      await store.recordDelivery(T1, {
        id: stopping.id,
        delivery: { kind: 'wait-closed' },
        at: at(42),
      })
      const unfinished = async () => ids(read(await store.unfinished(T1), 'unfinished'))
      same(await unfinished(), [accepted.id, pending.id, stopping.id], 'three unfinished')
      await store.confirmStop(T1, { id: stopping.id, at: at(43) })
      same(await unfinished(), [accepted.id, pending.id], 'the confirmed stop is finished')
    },
  },
  {
    name: 'keeps the dispatches of one tenant out of every read and every commit of another',
    async run(open) {
      const store = await open()
      const dispatch = acceptedDispatch(1)
      await accept(store, dispatch)
      same(read(await store.dispatch(T2, dispatch.id), 'read'), null, 'by identity')
      same(read(await store.ofSession(T2, dispatch.session), 'read'), null, 'by session')
      same(read(await store.openOf(T2, PARENT), 'read'), 0, 'the count')
      same(read(await store.list(T2, { by: { dispatcher: PARENT } }), 'read'), [], 'the list')
      same(read(await store.unfinished(T2), 'read'), [], 'the unfinished')
      const event = { kind: 'withdraw' } as const
      const applied = await store.apply(T2, { of: { id: dispatch.id }, event, at: at(40) })
      same(committed(applied, 'apply'), { kind: 'absent' }, 'an event of another tenant')
      const theirs = { ...dispatch, tenant: T2 }
      same((await accept(store, theirs, 8, T2)).kind, 'accepted', 'the same identity elsewhere')
      same(read(await store.dispatch(T1, dispatch.id), 'read'), dispatch, 'the first is untouched')
    },
  },
]
