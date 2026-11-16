import { fail, succeed } from '@omne-harness/operation-result'
import type { MaterializationReceipt, TransportFailure } from '../index.ts'
import type {
  MaterializedTransport,
  ModelTransport,
  PreparedTransport,
  TransportFact,
  TransportTermination,
} from '../provider/index.ts'
import { ScriptedModelError } from './error.ts'

export type ScriptedTransportEnding =
  | Readonly<{ kind: 'terminated'; termination: TransportTermination }>
  | Readonly<{ kind: 'exhausted' }>
  | Readonly<{ kind: 'throws'; error: Error }>

export type ScriptedTransportScript = Readonly<{
  receipt: MaterializationReceipt
  facts: readonly Exclude<TransportFact, { kind: 'ended' }>[]
  ending: ScriptedTransportEnding
  rejection: Readonly<{ at: 'prepare' | 'materialize'; failure: TransportFailure }> | null
}>

export type ScriptedTransportCounts = Readonly<{
  prepare: number
  materialize: number
  start: number
  closePrepared: number
  closeMaterialized: number
}>

export type ScriptedTransport = Readonly<{
  transport: ModelTransport
  counts(): ScriptedTransportCounts
}>

const CANCELLED: TransportFact = {
  kind: 'ended',
  termination: { kind: 'interrupted', stop: 'confirmed' },
}

function lastFact(ending: ScriptedTransportEnding): TransportFact | null {
  switch (ending.kind) {
    case 'throws':
      throw ending.error
    case 'terminated':
      return { kind: 'ended', termination: structuredClone(ending.termination) }
    case 'exhausted':
      return null
  }
}

export function createScriptedTransport(script: ScriptedTransportScript): ScriptedTransport {
  const counts = { prepare: 0, materialize: 0, start: 0, closePrepared: 0, closeMaterialized: 0 }

  async function* stream(signal: AbortSignal): AsyncGenerator<TransportFact> {
    for (const fact of script.facts) {
      if (signal.aborted) {
        yield structuredClone(CANCELLED)
        return
      }
      yield structuredClone(fact)
    }
    if (signal.aborted) {
      yield structuredClone(CANCELLED)
      return
    }
    const last = lastFact(script.ending)
    if (last !== null) yield last
  }

  let materialized = false
  let started = false

  const materializedTransport: MaterializedTransport = {
    receipt: structuredClone(script.receipt),
    start(signal) {
      counts.start += 1
      if (started) throw new ScriptedModelError('repeated-step', 'this transport already started')
      started = true
      return stream(signal)
    },
    async close() {
      counts.closeMaterialized += 1
    },
  }

  const prepared: PreparedTransport = {
    async materialize() {
      counts.materialize += 1
      if (materialized)
        throw new ScriptedModelError('repeated-step', 'this transport already materialized')
      materialized = true
      if (script.rejection?.at === 'materialize')
        return fail(structuredClone(script.rejection.failure))
      return succeed(materializedTransport)
    },
    async close() {
      counts.closePrepared += 1
    },
  }

  const transport: ModelTransport = {
    async prepare() {
      counts.prepare += 1
      if (script.rejection?.at === 'prepare') return fail(structuredClone(script.rejection.failure))
      return succeed(prepared)
    },
  }

  return { transport, counts: () => ({ ...counts }) }
}
