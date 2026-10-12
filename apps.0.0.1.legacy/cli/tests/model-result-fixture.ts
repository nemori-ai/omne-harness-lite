import { judgeMessage } from '@omne-harness-lite/messages'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { ModelResultInput } from '@omne-harness-lite/session-runtime-local'
const now = '2026-10-08T00:00:00Z'

export function originalPending(): ModelResultInput['pending'] {
  const adaptation = {
    implementation: { name: 'controlled', revision: 'one' },
    definition: { modelId: 'controlled/model', revision: 'one' },
    configuration: { revision: 'one', values: {} },
  }
  const reply = judgeMessage({
    id: 'result-source-reply',
    type: 'assistant',
    response: 'result-source-response',
    ending: 'complete',
    createdAt: now,
    blocks: [
      {
        id: 'result-source-text',
        kind: 'text',
        text: 'actual original value',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if ('rejected' in reply || reply.ok.type !== 'assistant' || reply.ok.ending !== 'complete')
    throw new Error('bad reply fixture')
  return {
    id: 'result-source-response',
    call: { callId: 'result-source-call', runId: 'result-source-run' },
    attemptId: 1,
    dispatch: 1,
    outcome: 'complete',
    reply: reply.ok,
    route: {
      adaptation,
      profile: { origin: 'official', routeName: 'controlled/model' },
      profileSnapshot: {
        adaptation,
        providers: ['controlled'],
        allowFallback: false,
        inputModalities: ['text'],
        outputModalities: ['text'],
        maxInputTokens: 100,
        maxOutputTokens: 100,
        inputConstraints: {},
        upstreamInputLimits: {
          maxInputTokens: { status: 'unknown' },
          maxRequestBytes: { status: 'unknown' },
        },
        updatedAt: now,
      },
      provider: 'controlled',
      selectedBy: 'session',
      credentialScope: { layer: 'factory' },
      parameters: {},
    },
    timing: { sentAt: now, firstTokenAt: now, endedAt: now },
    usage: {
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      source: 'upstream',
    },
    cost: {
      cost_usd: new LosslessNumber('0.00000000000000000000000310'),
      source: 'upstream_usage',
    },
    inputCalibration: {
      requestInput: { kind: 'unavailable', reason: 'not_retained' },
      observedInput: { kind: 'unavailable', reason: 'missing_usage' },
      outputGroup: { kind: 'unavailable', reason: 'not_retained' },
    },
  }
}
