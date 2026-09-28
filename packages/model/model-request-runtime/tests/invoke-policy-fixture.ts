import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import {
  openRouterCredentialRedactionConfig,
  type InvocationOutcome,
  type InvocationPolicy,
  type PlanInput,
  type PlannedSemantics,
  type SendResult,
  type StreamEnd,
  type TransportAdapter,
} from '@omne-harness-lite/model-request-runtime'

export function request(): PlanInput {
  const call = parseOpaqueIdentifier('policy-call', 'ModelCallId')
  if (!('ok' in call)) throw new Error('call')
  return {
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: { kind: 'model_call', callId: call.ok, dispatch: 1 },
    routeName: 'teaching/model',
    provider: 'openai',
    parameters: {},
    messages: [],
    tools: [],
    snapshot: {
      adaptation: {
        implementation: { name: 'teaching', revision: 'one' },
        definition: { modelId: 'teaching/model', revision: 'one' },
        configuration: { revision: 'one', values: {} },
      },
      providers: ['openai'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 100,
      maxOutputTokens: 10,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      updatedAt: '2026-09-28T00:00:00Z',
    },
  }
}
export function policy(diagnostic: InvocationPolicy['diagnostic'] = () => {}): InvocationPolicy {
  return {
    now: () => '2026-09-28T00:00:00Z',
    schedule: (milliseconds, callback) => {
      const timer = setTimeout(callback, milliseconds)
      return () => clearTimeout(timer)
    },
    firstContentTimeoutMs: 10000,
    idleContentTimeoutMs: 10000,
    statusCauseTable: { '503': 'upstream_unavailable' },
    credentialRedaction: openRouterCredentialRedactionConfig,
    diagnostic,
  }
}
export function content(text = 'visible'): ArrivalEvent[] {
  const id = parseOpaqueIdentifier('policy-text', 'BlockId')
  if (!('ok' in id)) throw new Error('block')
  return [
    {
      t: 'open',
      index: 0,
      id: id.ok,
      kind: 'text',
      fill: 'append',
      visibility: { toHuman: true, toModel: true },
    },
    { t: 'fill', index: 0, payload: text },
    {
      t: 'close',
      index: 0,
      block: { id: id.ok, kind: 'text', text, visibility: { toHuman: true, toModel: true } },
    },
    {
      t: 'account',
      usage: {
        input_tokens: 503,
        output_tokens: 1,
        cache_read_tokens: 0,
        cache_write_tokens: 'unknown',
        source: 'upstream',
      },
      cost: { cost_usd: new LosslessNumber('503.00'), source: 'upstream_usage' },
    },
  ]
}
export function adapter(
  options: {
    sent?: SendResult<object>
    events?: readonly ArrivalEvent[]
    end?: StreamEnd
    pause?: () => Promise<void>
    stopped?: () => Promise<void>
  } = {},
) {
  let sends = 0,
    reads = 0,
    stopped = 0
  let lastSignal: AbortSignal | undefined
  const transport: TransportAdapter<PlannedSemantics, object> = {
    plan: input => ({ planned: { input, parameters: input.parameters } }),
    async send(_planned, _credential, signal) {
      sends++
      lastSignal = signal
      await options.pause?.()
      return options.sent ?? { response: {} }
    },
    async *read(_response, _planned, signal) {
      reads++
      try {
        for (const event of options.events ?? content()) {
          if (signal.aborted) return { aborted: true }
          yield event
        }
        return signal.aborted ? { aborted: true } : (options.end ?? { ended: 'end' })
      } finally {
        await options.stopped?.()
        stopped++
      }
    },
  }
  return {
    transport,
    sends: () => sends,
    reads: () => reads,
    stopped: () => stopped,
    signal: () => lastSignal,
  }
}
export function result(value: InvocationOutcome) {
  if (!('outcome' in value)) throw new Error('expected sent result')
  return value
}
export function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}
