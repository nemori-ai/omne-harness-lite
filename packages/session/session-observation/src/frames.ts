import type { JsonValue } from '@omne-harness/json-text'
import {
  projectModelOutputV1,
  type CallState,
  type DispatchProgress,
  type ModelStreamDelta,
  type ModelStreamSnapshot,
} from '@omne-harness/model-contract'
import type { RunId, SessionRevision } from '@omne-harness/session-contract'

export type StateFrame = Readonly<{
  kind: 'state'
  run: RunId | null
  revision: SessionRevision
  phase: string | null
  attempts: DispatchProgress | null
  target: Readonly<{ projection: 'model-output-v1' }> | null
}>

export type SessionObservationFrame =
  | StateFrame
  | Readonly<{ kind: 'snapshot'; projection: 'model-output-v1'; value: JsonValue }>
  | Readonly<{ kind: 'delta'; projection: 'model-output-v1'; value: JsonValue }>
  | Readonly<{ kind: 'gap'; reason: 'buffer' | 'source-history' }>
  | Readonly<{ kind: 'refreshing' }>

export type SessionObservationEnd = 'refresh-exhausted' | 'denied' | 'unavailable'

export type StateFields = Omit<StateFrame, 'kind'>

// What the observation keeps of the state of the main call.
export type CallView = Readonly<{
  phase: CallState['phase'] | null
  attempts: DispatchProgress | null
}>

export const callViewOf = (state: Pick<CallState, 'phase' | 'attempts'>): CallView => ({
  phase: state.phase,
  attempts: state.attempts ?? null,
})

function sameProgress(a: DispatchProgress | null, b: DispatchProgress | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.allowed === b.allowed &&
    a.made === b.made &&
    a.notBefore === b.notBefore &&
    a.last?.cause === b.last?.cause &&
    a.last?.upstreamStatus === b.last?.upstreamStatus &&
    a.last?.diagnostic === b.last?.diagnostic
  )
}

type Content = Extract<SessionObservationFrame, { kind: 'snapshot' | 'delta' }> | null

export class FrameTranslator {
  #last: StateFields | undefined

  state(fields: StateFields): StateFrame | null {
    const last = this.#last
    if (
      last !== undefined &&
      last.run === fields.run &&
      last.revision === fields.revision &&
      last.phase === fields.phase &&
      sameProgress(last.attempts, fields.attempts) &&
      (last.target === null) === (fields.target === null)
    )
      return null
    this.#last = fields
    return { kind: 'state', ...fields }
  }

  snapshot(value: ModelStreamSnapshot): Content {
    const projected = projectModelOutputV1(value)
    return 'ok' in projected
      ? { kind: 'snapshot', projection: 'model-output-v1', value: projected.ok }
      : null
  }

  delta(value: ModelStreamDelta, basePhase: CallState['phase']): Content {
    const projected = projectModelOutputV1(value, basePhase)
    return 'ok' in projected
      ? { kind: 'delta', projection: 'model-output-v1', value: projected.ok }
      : null
  }
}
