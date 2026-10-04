import { imagePreparation } from './image-transport-support.ts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime-local'
import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  createOfficialProfileContent,
  createPiAiTransport,
} from '../src/index.ts'
import {
  certificate,
  fixture,
  input,
  message,
  judgedMessage,
  content,
  sse,
  finish,
  policy,
  at,
} from './support.ts'
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
describe('official Anthropic public invocation response re-anchoring over actual TLS', () => {
  for (const definition of anthropicDefinitions)
    it(definition.modelId, async () => {
      const profile = createOfficialProfileContent(definition, {
        providers: ['anthropic'],
        allowFallback: false,
        configuration: {
          revision: 'cache',
          values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
        },
      })
      if ('rejected' in profile) throw Error(profile.rejected)
      const meter = createAnthropicInputMeter(definition),
        full = vi.fn(meter.measureFull)
      let calls = 0
      const host = await fixture(
        cert.tls,
        res => {
          calls++
          res.end(
            content(`answer ${calls}`) +
              sse({
                choices: [],
                model: definition.modelId,
                provider: 'Anthropic',
                usage: {
                  prompt_tokens: 100 * calls,
                  completion_tokens: 4,
                  prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 5 },
                },
              }) +
              finish(),
          )
        },
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [{ ...meter, measureFull: full }],
      })
      let request: PlanInput = {
        ...input(),
        routeName: definition.modelId,
        provider: 'anthropic',
        parameters: { maxOutputTokens: 64 },
        messages: [message('user', 'first', 'u0')],
        snapshot: {
          ...input().snapshot,
          ...definition.capabilities,
          adaptation: profile.ok.adaptation,
          providers: profile.ok.providers,
          allowFallback: profile.ok.allowFallback,
        },
      }
      try {
        for (let round = 0; round < 3; round++) {
          const planned = await transport.plan(request, { signal: new AbortController().signal })
          if ('rejected' in planned) throw Error(JSON.stringify(planned))
          expect(planned.planned.measurement.mode).toBe(round === 0 ? 'full' : 'marginal')
          const result = await invokeModel({
            ...request,
            transport,
            credential: 'local-synthetic',
            signal: new AbortController().signal,
            policy: policy(),
            onAccepted: () => {},
          }).outcome
          if (!('outcome' in result) || result.outcome !== 'complete')
            throw Error(JSON.stringify(result))
          expect(result.inputCalibration.observedInput.kind).toBe('from_usage')
          expect(result.inputCalibration.requestInput).toEqual(planned.planned.requestInput)
          const reply = judgedMessage({
            type: 'assistant',
            id: `a${round}`,
            response: `r${round}`,
            ending: 'complete',
            createdAt: at,
            blocks: result.blocks,
          })
          request = {
            ...request,
            calibration: {
              kind: 'observation',
              inputCalibration: result.inputCalibration,
              usage: result.usage,
              outputBlocks: result.blocks,
              replaySelection: result.blocks.map((_block, sourceBlockIndex) => ({
                sourceBlockIndex,
                messageIndex: request.messages.length,
                blockIndex: sourceBlockIndex,
              })),
            },
            messages: [
              ...request.messages,
              reply,
              message('user', `next ${round}`, `u${round + 1}`),
            ],
          }
        }
        // One explicit plan and invokeModel's own plan on the first request only.
        expect(full).toHaveBeenCalledTimes(2)
        expect(host.requests).toHaveLength(3)
        for (const recorded of host.requests)
          expect(recorded.body).toContain('"cache_control":{"type":"ephemeral","ttl":"1h"}')
      } finally {
        await host.close()
      }
    })
})
