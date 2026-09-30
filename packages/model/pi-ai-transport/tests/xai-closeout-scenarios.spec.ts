import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel, type ModelInvocationResult } from '@omne-harness-lite/model-request-runtime'
import {
  createPiAiTransport,
  createXaiInputMeter,
  xaiDefinitions,
} from '@omne-harness-lite/pi-ai-transport'
import { createXaiHistoryCandidateInputMeter } from '../src/input-meters/xai-candidate.ts'
import { appendXaiCloseoutResponse, xaiCloseoutInput } from './fixtures/xai/closeout-scenarios.ts'
import { certificate, fixture, content, finish, policy, sse } from './support.ts'

describe.each(xaiDefinitions)('$modelId credential-free closeout scenario', definition => {
  it.each([false, true])(
    'retains encrypted blocks and groups across three research rounds; tools=%s',
    async withTools => {
      const cert = certificate()
      const details = [
        {
          type: 'reasoning.summary',
          summary: 'Keep the code',
          format: 'xai-responses-v1',
          index: 0,
        },
        {
          type: 'reasoning.encrypted',
          data: 'abcd.efgh',
          format: 'xai-responses-v1',
          id: 'reason-1',
          index: 1,
        },
      ]
      let responseCount = 0
      const host = await fixture(
        cert.tls,
        response => {
          responseCount++
          return response.end(
            sse({ choices: [{ delta: { reasoning_details: details } }] }) +
              content('ALPHA-42') +
              (withTools
                ? sse({
                    choices: [
                      {
                        delta: {
                          tool_calls: [
                            {
                              index: 0,
                              id: `lookup-${responseCount}`,
                              type: 'function',
                              function: { name: 'lookup__xai', arguments: '{"key":"alpha"}' },
                            },
                          ],
                        },
                      },
                    ],
                  })
                : '') +
              sse({
                choices: [],
                model: definition.modelId,
                provider: 'xAI',
                usage: {
                  prompt_tokens: 1600,
                  completion_tokens: 20,
                  completion_tokens_details: { reasoning_tokens: 10 },
                  prompt_tokens_details: { cached_tokens: 128, cache_write_tokens: 0 },
                  cost: 0.0001,
                },
              }) +
              finish(withTools ? 'tool_calls' : 'stop'),
          )
        },
        {},
        undefined,
        [definition],
      )
      // Unbound candidate only: this exercises a research harness, not official certification.
      const researchMeter = createXaiHistoryCandidateInputMeter(definition)
      const officialMeter = createXaiInputMeter(definition)
      if (!researchMeter || !officialMeter) throw new Error('missing xAI meter')
      const research = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [researchMeter],
      })
      const official = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [officialMeter],
      })
      let request = xaiCloseoutInput(definition.modelId, '2026-09-29T00:00:00Z')
      if (withTools)
        request = {
          ...request,
          tools: [
            {
              name: 'lookup__xai',
              description: 'Controlled lookup fixture',
              parameters: {
                type: 'object',
                properties: { key: { type: 'string' } },
                required: ['key'],
                additionalProperties: false,
              },
            },
          ],
        }
      const replies: ModelInvocationResult[] = []
      try {
        for (let round = 1; round <= 3; round++) {
          const planned = await research.plan(request, { signal: new AbortController().signal })
          if ('rejected' in planned) throw new Error(JSON.stringify(planned))
          const response = await invokeModel({
            ...request,
            transport: research,
            credential: 'local-xai-test-only',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          if (!('outcome' in response) || response.outcome !== 'complete')
            throw new Error(JSON.stringify(response))
          replies.push(response)
          expect(response.inputCalibration.observedInput.kind).toBe('from_usage')
          expect(host.requests[round - 1]?.body).toBe(planned.planned.serialized)
          if (round === 3) break
          request = appendXaiCloseoutResponse(request, response, {
            round: round + 1,
            at: '2026-09-29T00:00:00Z',
            text: 'What was the code?',
            ...(withTools
              ? {
                  toolResults: response.blocks
                    .filter(block => block.kind === 'tool_call')
                    .map(call => {
                      if (!call.complete) throw new Error('incomplete fixture tool call')
                      expect(call).toMatchObject({
                        complete: true,
                        tool: 'lookup__xai',
                        arguments: { key: 'alpha' },
                      })
                      return { callId: call.callId, text: 'alpha=42' }
                    }),
                }
              : {}),
          })
          expect(writeJsonLossless(request.outputHistory[round - 1]?.outputBlocks)).toBe(
            writeJsonLossless(response.blocks),
          )
          expect(request.outputHistory[round - 1]?.origin.parameters).toEqual(response.parameters)
          // Current real gap remains explicit: the official contribution cannot count this history.
          expect(
            await official.plan(request, { signal: new AbortController().signal }),
          ).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
            metrics: ['maxInputTokens'],
          })
        }
        expect(host.requests).toHaveLength(3)
        expect(request.outputHistory).toHaveLength(2)
        expect(request.outputHistory.map(group => group.replaySelection[0]?.messageIndex)).toEqual([
          1,
          withTools ? 4 : 3,
        ])
        const first = replies[0]
        if (!first) throw new Error('missing actual first response')
        if (withTools)
          expect(() =>
            appendXaiCloseoutResponse(request, first, {
              round: 4,
              at: '2026-09-29T00:00:00Z',
              text: 'next',
            }),
          ).toThrow('matching explicit tool results')
        for (const round of [1, 2]) {
          const wire = JSON.parse(host.requests[round]?.body ?? '{}')
          expect(wire.messages[1].reasoning_details).toEqual(details)
        }
        for (const changed of [
          { ...first, provider: 'another-provider' },
          { ...first, routeName: 'another-model' },
          {
            ...first,
            adaptation: {
              ...first.adaptation,
              definition: { ...first.adaptation.definition, revision: 'other' },
            },
          },
        ])
          expect(() =>
            appendXaiCloseoutResponse(request, changed, {
              round: 4,
              at: '2026-09-29T00:00:00Z',
              text: 'continue',
            }),
          ).toThrow(TypeError)
      } finally {
        await official.close()
        await research.close()
        await host.close()
        cert.dispose()
      }
    },
  )
})
