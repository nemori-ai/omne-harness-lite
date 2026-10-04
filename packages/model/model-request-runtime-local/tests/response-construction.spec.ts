import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { ModelCallDispatchedRecord } from '@omne-harness-lite/messages'
import { invokeModel } from '../src/invoke.ts'
import {
  constructAnchoredInterruption,
  constructAssistantReply,
  constructModelResponse,
} from '../src/response-construction.ts'
import { request, policy, adapter } from './invoke-policy-fixture.ts'
import type {ModelInvocationResult} from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  capture,
  dispatched as dispatchedFixture,
  jsonObject,
  response as responseFixture,
} from './log-codec-fixture.ts'

async function inputs() {
  const plan = request()
  const message = parseOpaqueIdentifier('response-message', 'MessageId')
  if (!('ok' in message)) throw new Error('message')
  const result = await invokeModel({
    ...plan,
    transport: adapter().transport,
    credential: 'credential',
    signal: new AbortController().signal,
    policy: policy(),
  }).outcome
  if (!('outcome' in result)) throw new Error('result')
  const dispatched: ModelCallDispatchedRecord = {
    kind: 'model_call_dispatched',
    call: plan.target.callId,
    dispatch: 1,
    response: 'response-fixed',
    provider: plan.provider,
    parameters: plan.parameters,
    profile: { origin: 'official', routeName: plan.routeName },
    profileSnapshot: plan.snapshot,
    adaptation: plan.snapshot.adaptation,
    selectedBy: 'session',
    credentialScope: { layer: 'factory' },
  }
  return { dispatched, result, messageId: message.ok, firstTokenAt: '2026-09-28T00:00:00Z' }
}
describe('MR5 pure complete construction (actual provenance belongs to caller)', () => {
  it('keeps confirmed user interruption distinct from system abandonment', async () => {
    const input = await inputs()
    const interrupted: ModelInvocationResult = {
      ...input.result,
      outcome: 'interrupted',
      ending: 'interrupted_by_user',
    }
    const confirmed = { ...input, result: interrupted, interruptInitiator: 'user' as const }
    const pending = constructAssistantReply(confirmed)
    expect(pending).toMatchObject({ ending: 'interrupted_by_user' })
    const userResponse = constructModelResponse(confirmed, 'persisted')
    if (!('response' in userResponse)) throw new Error('confirmed user response rejected')
    expect(userResponse.response).toMatchObject({
      outcome: 'interrupted',
      initiator: 'user',
      reply: { ending: 'interrupted_by_user' },
    })
    const system = constructModelResponse({ ...input, result: interrupted }, null)
    if (!('response' in system)) throw new Error('system interruption rejected')
    expect(system.response).toMatchObject({ outcome: 'interrupted', initiator: 'run_cancelled' })
    expect(system.response).not.toHaveProperty('reply')
  })
  it('no hidden default disposition, complete AssistantMessage and exact opened time', async () => {
    const input = await inputs()
    expect(constructModelResponse(input, null)).toEqual({ rejected: 'invalidInput' })
    const reply = constructAssistantReply(input)
    expect(reply).toMatchObject({
      id: 'response-message',
      response: 'response-fixed',
      ending: 'complete',
    })
    const complete = constructModelResponse(input, {
      vetoed: { by: 'moderation', reason: 'explicit' },
    })
    if (!('response' in complete)) throw new Error('declared response')
    expect(complete.response).toHaveProperty('outcome', 'complete')
    expect(complete.response).not.toHaveProperty('failure')
    expect(complete.response.timing.firstTokenAt).toBe(input.firstTokenAt)
    expect(complete.response.route).not.toHaveProperty('servingProvider')
  })
  it('missing opened cannot be made into success; inconsistent failure cannot be forced into the union', async () => {
    const input = await inputs()
    expect(constructModelResponse({ ...input, firstTokenAt: null }, 'persisted')).toEqual({
      rejected: 'invalidInput',
    })
    const { ending: _ending, ...withoutEnding } = input.result
    const failed: ModelInvocationResult = {
      ...withoutEnding,
      outcome: 'failed',
      failure: { cause: 'upstream_unavailable' },
    }
    expect(constructModelResponse({ ...input, result: failed }, null)).toEqual({
      rejected: 'invalidInput',
    })
  })
  it('time order and exact legal RFC3339 representation remain writer obligations', async () => {
    const input = await inputs()
    for (const firstTokenAt of ['not-an-instant', '2026-09-27T00:00:00Z', '2026-09-29T00:00:00Z'])
      expect(constructModelResponse({ ...input, firstTokenAt }, 'persisted')).toEqual({
        rejected: 'invalidInput',
      })
  })
})

describe('MR8 anchored interruption construction', () => {
  const original = capture('record', dispatchedFixture).record
  if (original?.kind !== 'model_call_dispatched') throw new Error('durable dispatched fixture')
  const planned = {
    parameters: {
      temperature: new LosslessNumber('0.50'),
      extra: { retained: { k: new LosslessNumber('9007199254740993') } },
    },
    parameterAdjustments: original.parameterAdjustments,
    droppedParameters: original.droppedParameters,
  }
  it('keeps adapted fixed parameters for zero-send and never fabricates usage or sentAt', () => {
    const made = constructAnchoredInterruption({
      dispatched: original,
      planned,
      observed: null,
      sendState: 'send_unknown',
      firstTokenAt: null,
      endedAt: '2026-09-27T00:00:02Z',
      initiator: 'run_cancelled',
    })
    if (!('response' in made)) throw new Error('expected anchored interruption')
    expect(made.response.timing.sentAt).toBeNull()
    expect(made.response.usage.input_tokens).toBe('unknown')
    expect(made.response.cost.cost_usd).toBe('unknown')
    expect(writeJsonLossless(made.response.route.parameters)).toBe(
      writeJsonLossless(jsonObject(responseFixture.route).parameters),
    )
    expect(made.response.route.parameterAdjustments).toEqual(original.parameterAdjustments)
    expect(made.response.route.droppedParameters).toEqual(original.droppedParameters)
    expect(
      constructAnchoredInterruption({
        dispatched: original,
        planned: { ...planned, parameters: original.parameters },
        observed: null,
        sendState: 'send_unknown',
        firstTokenAt: null,
        endedAt: '2026-09-27T00:00:02Z',
        initiator: 'run_cancelled',
      }),
    ).toEqual({ rejected: 'invalidInput' })
  })
  it('preserves actual source facts and rejects reversed known timing', () => {
    const observed = {
      sentAt: '2026-09-27T00:00:00Z',
      inputCalibration: {
        requestInput: { kind: 'unavailable', reason: 'not_retained' },
        observedInput: { kind: 'unavailable', reason: 'missing_usage' },
        outputGroup: { kind: 'unavailable', reason: 'not_retained' },
      } as const,
      usage: {
        input_tokens: 0,
        output_tokens: 1,
        cache_read_tokens: 'unknown' as const,
        cache_write_tokens: 0,
        source: 'upstream' as const,
      },
      cost: {
        cost_usd: new LosslessNumber('0.0000000000000000000000000310'),
        source: 'upstream_usage' as const,
      },
      rawHeaders: { 'x-test': ['one', 'two'] },
      upstreamRequestId: 'upstream-request',
    }
    const made = constructAnchoredInterruption({
      dispatched: original,
      observed,
      firstTokenAt: '2026-09-27T00:00:01Z',
      endedAt: '2026-09-27T00:00:02Z',
      initiator: 'runtime_lost',
    })
    if (!('response' in made)) throw new Error('expected known original facts')
    expect(made.response.timing.sentAt).toBe(observed.sentAt)
    expect(made.response.usage.input_tokens).toBe(0)
    expect(writeJsonLossless(made.response.cost.cost_usd)).toBe(
      writeJsonLossless(observed.cost.cost_usd),
    )
    expect(made.response.raw?.headers).toEqual(observed.rawHeaders)
    expect(
      constructAnchoredInterruption({
        dispatched: original,
        observed,
        firstTokenAt: '2026-09-27T00:00:03Z',
        endedAt: '2026-09-27T00:00:02Z',
        initiator: 'runtime_lost',
      }),
    ).toEqual({ rejected: 'invalidInput' })
  })
})
