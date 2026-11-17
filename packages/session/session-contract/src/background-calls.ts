import type { ConsumptionId, SessionOperationId } from './identity.ts'
import type { ProducerRef } from './values.ts'

type ToolProducer = Extract<ProducerRef, { kind: 'tool' }>

/** How a person and the model recognise a call; Session keeps it as Tool gave it. */
export type BackgroundCallLabel = Readonly<{
  intent: string | null
  tool: string
  command: string | null
  preview: string
}>
export type BackgroundCallSource = 'launched' | 'control' | 'threshold' | 'foreground-limit'

export type StopInitiator = 'user' | 'agent' | 'system'

export type BackgroundCallStop = Readonly<{
  initiator: StopInitiator
  reason: string | null
  operation: SessionOperationId
}>

/** A call of the session in the background: its short number orders the calls of the session. */
export type BackgroundCallRecord = Readonly<{
  consumption: ConsumptionId
  producer: ToolProducer
  ordinal: number
  label: BackgroundCallLabel
  source: BackgroundCallSource
  stop?: BackgroundCallStop
}>

/** What Tool answers about one call now; Session keeps none of it. */
export type BackgroundCallState = Readonly<{
  phase: 'queued' | 'running' | 'settled'
  stop: 'pending' | 'accepted' | 'stopped' | null
  lastLine: string | null
}>

export type BackgroundCallStatus = 'queued' | 'running' | 'ended-pending' | 'stopping' | 'unknown'

/** How far a stop got: asked, taken by Tool, or proven by Tool. Never one merged "stopped". */
export type StopView = Readonly<{
  initiator: StopInitiator
  reason: string | null
  progress: 'requested' | 'accepted' | 'proven'
}>

export type BackgroundCallView = Readonly<{
  id: string
  producer: ToolProducer
  label: BackgroundCallLabel
  source: BackgroundCallSource
  status: BackgroundCallStatus
  stop: StopView | null
  lastLine: string | null
}>

export function shortCallId(ordinal: number): string {
  return `b${ordinal}`
}

function stopOf(record: BackgroundCallRecord, state: BackgroundCallState | null): StopView | null {
  if (record.stop === undefined) return null
  const { initiator, reason } = record.stop
  const progress =
    state?.stop === 'stopped' ? 'proven' : state?.stop === 'accepted' ? 'accepted' : 'requested'
  return { initiator, reason, progress }
}

function statusOf(state: BackgroundCallState | null): BackgroundCallStatus {
  if (state === null) return 'unknown'
  if (state.phase === 'settled') return 'ended-pending'
  if (state.stop === 'pending' || state.stop === 'accepted') return 'stopping'
  return state.phase
}

/** One call as every reader sees it; a state Tool cannot give is unknown, the rest stays. */
export function backgroundCallView(
  record: BackgroundCallRecord,
  state: BackgroundCallState | null,
): BackgroundCallView {
  return {
    id: shortCallId(record.ordinal),
    producer: record.producer,
    label: record.label,
    source: record.source,
    status: statusOf(state),
    stop: stopOf(record, state),
    lastLine: state?.lastLine ?? null,
  }
}
