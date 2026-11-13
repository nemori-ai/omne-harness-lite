// The frames of session observation and 帧的翻译 (RFC-0015 §8): the one place that turns what the
// locate and the stream found into frames. A state frame goes out only when one of its four fields
// changed; the first one always goes out. Snapshots and deltas carry the model-output-v1 value.
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

/** Why the frames ran out. An aborted observation ends without one. */
export type SessionObservationEnd = 'refresh-exhausted' | 'denied' | 'unavailable'

export type StateFields = Omit<StateFrame, 'kind'>

/** A content frame, or null when the Model value has no model-output-v1 projection. */
type Content = Extract<SessionObservationFrame, { kind: 'snapshot' | 'delta' }> | null

export class FrameTranslator {
  #last: StateFields | undefined

  /** The state frame for `fields`, or null when none of the four fields changed. */
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
