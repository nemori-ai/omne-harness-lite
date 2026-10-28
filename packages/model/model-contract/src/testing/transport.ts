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
  /** The stream gives one `ended` fact with this termination, then finishes. */
  | Readonly<{ kind: 'terminated'; termination: TransportTermination }>
  /** The stream runs out of facts without any `ended` fact. */
  | Readonly<{ kind: 'exhausted' }>
  /** The stream throws this error after its last fact. */
  | Readonly<{ kind: 'throws'; error: Error }>

export type ScriptedTransportScript = Readonly<{
  /** What `materialize` reports. The scripted transport reads no media and measures nothing. */
  receipt: MaterializationReceipt
  /** The facts of the stream, in order. The `ended` fact comes from `ending`, so it is not listed. */
  facts: readonly Exclude<TransportFact, { kind: 'ended' }>[]
  ending: ScriptedTransportEnding
  /** A step that answers a failure instead of going on; null lets every step succeed. */
  rejection: Readonly<{ at: 'prepare' | 'materialize'; failure: TransportFailure }> | null
}>

/** How often each step ran. A step counts when it is called, whether or not it succeeded. */
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

/**
 * The fact that closes the stream, or null when the stream just runs out. A new kind of ending
 * that this switch does not handle fails to compile, because the function would not return.
 */
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

/**
 * A transport that plays a script. `start` begins the stream at once, as the protocol requires;
 * the facts are only handed out while the consumer iterates. An abort of the signal ends the
 * stream with a confirmed interruption.
 */
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
