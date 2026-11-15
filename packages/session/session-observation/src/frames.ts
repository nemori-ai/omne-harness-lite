import type { JsonValue } from '@omne-harness/json-text'
import {
  projectModelOutputV1,
  type CallState,
  type ModelStreamDelta,
  type ModelStreamSnapshot,
} from '@omne-harness/model-contract'
import type { RunId, SessionRevision } from '@omne-harness/session-contract'

export type StateFrame = Readonly<{
  kind: 'state'
  run: RunId | null
  revision: SessionRevision
  phase: string | null
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
