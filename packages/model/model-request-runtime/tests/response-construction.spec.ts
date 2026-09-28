import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { ModelCallDispatchedRecord } from '@omne-harness-lite/messages'
import { invokeModel } from '../src/invoke.ts'
import { constructAssistantReply, constructModelResponse } from '../src/response-construction.ts'
import { request, policy, adapter } from './invoke-policy-fixture.ts'
import type { ModelInvocationResult } from '../src/types.ts'

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
