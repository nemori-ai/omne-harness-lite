export const STREAM_ARRIVAL_STEPS = ['open', 'fill', 'close', 'trim', 'finish'] as const

export type StreamArrivalStep = (typeof STREAM_ARRIVAL_STEPS)[number]

export interface StreamArrival {
  readonly step: StreamArrivalStep
  readonly index: string
}

export type StreamArrivalJudgment =
  { readonly ok: StreamArrival } | { readonly rejected: 'step' | 'index' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Admit one streaming-delivery step. Cordis dispatch and inbound intake are not steps. */
export function judgeStreamArrival(value: unknown): StreamArrivalJudgment {
  if (!isRecord(value) || typeof value.step !== 'string') return { rejected: 'step' }
  if (!STREAM_ARRIVAL_STEPS.includes(value.step as StreamArrivalStep)) return { rejected: 'step' }
  if (typeof value.index !== 'string' || value.index.length === 0) return { rejected: 'index' }
  return { ok: { step: value.step as StreamArrivalStep, index: value.index } }
}
