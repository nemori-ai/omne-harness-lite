import { fail, succeed } from '@omne-harness/operation-result'
import type {
  Admission,
  ControlState,
  DispatchRecord,
  Lookup,
  ModelCalls,
  Reply,
} from '../index.ts'
import type { Admit, CallAccess, ModelOperationId, Mutation } from '../root.ts'
import {
  commit,
  denied,
  isReserved,
  openCall,
  reservedOperation,
  resolve,
  retried,
  scoped,
  stateOf,
  type CallRecord,
  type Core,
} from './core.ts'
import { mintRevision } from './mint.ts'
import { conflictOf, performWrite, remember, sameParameters, writeOf } from './writes.ts'

function newRecord<P>(core: Core<P>, scope: string, input: Admit<P>): CallRecord<P> {
  return {
    tenant: input.tenant,
    scope,
    call: input.call,
    admission: input.operation,
    consumer: structuredClone(input.consumer),
    revision: 1,
    lifecycle: { phase: 'accepted' },
    control: { kind: 'none' },
    custody: { kind: 'producer' },
    blocks: [],
    dispatches: [],
    instance: core.instance,
    handles: new Map(),
    observers: new Set(),
    reads: new Map(),
    fill: new Map(),
    evidence: [],
  }
}

export function createCalls<P>(core: Core<P>): ModelCalls<P> {
  async function admit(input: Admit<P>): Reply<Admission> {
    if (isReserved(input.operation)) return reservedOperation('operation')
    const target = resolve(core, input, 'admit')
    if (target === null) return denied('admit')
    const { scope, record } = target
    retried(core, scope, input.operation, input.call)
    const parameters = {
      call: input.call,
      request: input.request,
      consumer: input.consumer,
      capacity: input.capacity,
    }
    const known = core.operations.get(scoped(scope, input.operation))
    if (known !== undefined)
      return sameParameters(known, parameters)
        ? succeed({ call: input.call, revision: mintRevision(known.revision), recovered: true })
        : conflictOf(input.operation, known.record)
    if (record !== null) return conflictOf(input.operation, record)
    if (core.state.quiescing)
      return fail({
        kind: 'unavailable',
        dependency: 'model-provider',
        diagnostic: 'the provider is quiescing and accepts no new calls',
      })
    return performWrite(core, writeOf(scope, 'admit', input), (): Admission => {
      const created = newRecord(core, scope, input)
      core.records.set(scoped(scope, input.call), created)
      remember(core, scope, input.operation, created, parameters)
      return { call: input.call, revision: mintRevision(created.revision), recovered: false }
    })
  }

  async function inspect(
    input: CallAccess<P> & Readonly<{ admission: ModelOperationId }>,
  ): Reply<Lookup> {
    if (isReserved(input.admission)) return reservedOperation('admission')
    const target = resolve(core, input, 'inspect')
    if (target === null) return denied('inspect')
    const record = target.record
    if (record === null || record.admission !== input.admission)
      return succeed<Lookup>({ kind: 'not-accepted', operation: input.admission })
    return succeed<Lookup>({ kind: 'found', state: stateOf(record) })
  }

  async function dispatches(input: CallAccess<P>): Reply<readonly DispatchRecord[]> {
    const record = openCall(core, input, 'dispatches')
    if (record === null) return denied('dispatches')
    return succeed<readonly DispatchRecord[]>(structuredClone(record.dispatches))
  }

  async function cancel(input: Mutation<P>): Reply<ControlState> {
    if (isReserved(input.operation)) return reservedOperation('operation')
    const target = resolve(core, input, 'cancel')
    if (target === null || target.record === null) return denied('cancel')
    const { scope, record } = target
    retried(core, scope, input.operation, input.call)
    const parameters = { call: input.call }
    const known = core.operations.get(scoped(scope, input.operation))
    if (known !== undefined)
      return sameParameters(known, parameters)
        ? succeed<ControlState>(structuredClone(record.control))
        : conflictOf(input.operation, known.record)
    return performWrite(core, writeOf(scope, 'cancel', input), (): ControlState => {
      if (record.control.kind === 'none') {
        record.control = {
          kind: 'requested',
          operation: input.operation,
          propagation: 'pending',
          upstream: 'unknown',
        }
        commit(record)
      }
      remember(core, scope, input.operation, record, parameters)
      return structuredClone(record.control)
    })
  }

  return { admit, inspect, dispatches, cancel }
}
