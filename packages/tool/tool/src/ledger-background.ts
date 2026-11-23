import {
  decodeCommandCallText,
  type BackgroundSource,
  type ConsumerRef,
  type DurableEvidence,
  type FixedToolRequest,
  type ForegroundReturn,
  type ToolCallId,
  type ToolOperationId,
  type ToolTiming,
  type WaitIntent,
} from '@omne-harness/tool-contract'
import type { ToolTask } from '@omne-harness/tool-contract/provider'
import { deliveryId, sameFactValue } from './evidence.ts'
import type { CallRecord } from './ledger-store.ts'
import { type StateBody } from './ledger-state.ts'

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

/** The author's permission for this call: the tool's, narrowed to its command and given parameters. */
export function backgroundAllowed(
  request: Pick<FixedToolRequest, 'availability' | 'command' | 'arguments'>,
): boolean {
  const { definition } = request.availability
  if (!definition.backgroundAllowed) return false
  if (definition.kind === 'function') return true
  const declared = definition.commands.find(command => command.name === request.command)
  if (declared?.background === undefined) return false
  const call = decodeCommandCallText(definition, request.arguments.effective)
  if ('failure' in call || call.ok.command !== request.command) return false
  const given = new Set(call.ok.params.entries.map(entry => entry.key))
  return declared.background.unless.every(name => !given.has(name))
}

/** A command that declares `start: 'launch'` is accepted in the background, whatever the request asks. */
export function launchedInBackground(
  request: Pick<FixedToolRequest, 'availability' | 'command'>,
): boolean {
  const { definition } = request.availability
  if (!definition.backgroundAllowed || definition.kind === 'function') return false
  const declared = definition.commands.find(command => command.name === request.command)
  return declared?.background?.start === 'launch'
}

/** The relation a call is accepted in: what the request asks, or the background its command starts in. */
export function acceptedRelation(
  request: Pick<FixedToolRequest, 'availability' | 'command' | 'mode'>,
): 'foreground' | 'background' {
  return request.mode === 'background' || launchedInBackground(request)
    ? 'background'
    : 'foreground'
}

/** A call already in the background may wait only on an ask whose contract declares it may. */
export function mayWaitInBackground(wait: Pick<WaitIntent, 'kind' | 'schemas'>): boolean {
  return wait.kind === 'ask' && wait.schemas.background === 'waits'
}

export function backgroundCell(call: CallRecord): BackgroundCell {
  const { source: _source, ...body } = call.state
  if (body.phase === 'settled') return { kind: 'ended' }
  if (body.relation === 'background') return { kind: 'background' }
  if (!backgroundAllowed(call.request)) return refused('background-not-allowed')
  if (body.wait.kind === 'ask') return refused('ask-wait')
  if (body.wait.kind !== 'none') return refused('waiting')
  return { kind: 'movable', body: { ...body, relation: 'background', wait: { kind: 'none' } } }
}

export type TimingClose = Readonly<{ from: ToolTiming; closed: ToolTiming }>

export function backgroundTiming(
  timing: ToolTiming,
  close: TimingClose | undefined,
  why: 'moved-to-background' | 'withdrawn' = 'moved-to-background',
): ToolTiming {
  if (timing.kind !== 'running') return timing
  if (close !== undefined && sameFactValue(close.from, timing)) return close.closed
  return {
    kind: 'unknown',
    accumulatedMs: timing.accumulatedMs,
    segment: timing.segment,
    diagnostic: why,
  }
}
