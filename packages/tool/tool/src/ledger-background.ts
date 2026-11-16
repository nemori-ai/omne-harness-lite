import type {
  BackgroundSource,
  ConsumerRef,
  DurableEvidence,
  ForegroundReturn,
  ToolCallId,
  ToolOperationId,
  ToolTiming,
} from '@omne-harness/tool-contract'
import type { ToolTask } from '@omne-harness/tool-contract/provider'
import { deliveryId, sameFactValue } from './evidence.ts'
import type { CallRecord } from './ledger-store.ts'
import type { StateBody } from './ledger-start.ts'

export const PLACEHOLDER_DELIVERY = deliveryId(0)

export type BackgroundPlaceholder = Readonly<{
  foreground: Extract<ForegroundReturn, { kind: 'background' }>
  task: Extract<ToolTask, { kind: 'placeholder' }>
}>

export function backgroundPlaceholder(
  place: Readonly<{ call: ToolCallId; operation: ToolOperationId; consumer: ConsumerRef }>,
  source: BackgroundSource,
  evidence: DurableEvidence,
): BackgroundPlaceholder {
  const { call, operation, consumer } = place
  const delivery = { kind: 'pending', delivery: PLACEHOLDER_DELIVERY, consumer } as const
  return {
    foreground: { kind: 'background', call, source, delivery },
    task: {
      kind: 'placeholder',
      operation,
      state: 'pending',
      diagnostic: null,
      delivery: PLACEHOLDER_DELIVERY,
      consumer,
      source,
      evidence,
    },
  }
}

export type BackgroundRefusal = 'background-not-allowed' | 'ask-wait' | 'waiting'

export type BackgroundCell =
  | Readonly<{ kind: 'ended' }>
  | Readonly<{ kind: 'background' }>
  | Readonly<{ kind: 'refused'; reason: BackgroundRefusal }>
  | Readonly<{ kind: 'movable'; body: StateBody }>

const refused = (reason: BackgroundRefusal): BackgroundCell => ({ kind: 'refused', reason })

export function backgroundCell(call: CallRecord): BackgroundCell {
  const { source: _source, ...body } = call.state
  if (body.phase === 'settled') return { kind: 'ended' }
  if (body.relation === 'background') return { kind: 'background' }
  if (!call.request.availability.definition.backgroundAllowed)
    return refused('background-not-allowed')
  if (body.wait.kind === 'ask') return refused('ask-wait')
  if (body.wait.kind !== 'none') return refused('waiting')
  return { kind: 'movable', body: { ...body, relation: 'background', wait: { kind: 'none' } } }
}

export type TimingClose = Readonly<{ from: ToolTiming; closed: ToolTiming }>

export function backgroundTiming(timing: ToolTiming, close: TimingClose | undefined): ToolTiming {
  if (timing.kind !== 'running') return timing
  if (close !== undefined && sameFactValue(close.from, timing)) return close.closed
  return {
    kind: 'unknown',
    accumulatedMs: timing.accumulatedMs,
    segment: timing.segment,
    diagnostic: 'moved-to-background',
  }
}
