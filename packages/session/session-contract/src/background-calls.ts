import type { ConsumptionId } from './identity.ts'
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

/** A call of the session in the background: its short number orders the calls of the session. */
export type BackgroundCallRecord = Readonly<{
  consumption: ConsumptionId
  producer: ToolProducer
  ordinal: number
  label: BackgroundCallLabel
  source: BackgroundCallSource
}>

/** What Tool answers about one call now; Session keeps none of it. */
export type BackgroundCallState = Readonly<{
  phase: 'queued' | 'running' | 'settled'
  stop: 'pending' | 'accepted' | 'stopped' | null
  lastLine: string | null
}>

export type BackgroundCallStatus = 'queued' | 'running' | 'ended-pending' | 'stopping' | 'unknown'

export type BackgroundCallView = Readonly<{
  id: string
  producer: ToolProducer
  label: BackgroundCallLabel
  source: BackgroundCallSource
  status: BackgroundCallStatus
  lastLine: string | null
}>

export function shortCallId(ordinal: number): string {
  return `b${ordinal}`
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
    lastLine: state?.lastLine ?? null,
  }
}
