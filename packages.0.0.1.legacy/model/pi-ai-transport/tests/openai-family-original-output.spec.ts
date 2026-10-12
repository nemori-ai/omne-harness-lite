import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { openAiFamilyRecords } from '../src/input-meters/openai-family-policy.ts'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { openaiDefinitions, openaiConfiguration } from '../src/official-models/openai.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { planRequest } from '../src/plan.ts'
import { outputBlockDigestAtRevision, projectionDigest } from '../src/projection.ts'
import { testImagePreparerFor } from './image-transport-support.ts'
import { at, input, judgedMessage, message } from './support.ts'

describe.each(Object.values(openAiFamilyRecords))(
  '$modelId finite original complete-output applicability',
  row => {
    it.each(row.original)(
      'maps original $definitionRevision/$implementationRevision to O once without a factory alias',
      async original => {
        const definition = openaiDefinitions.find(item => item.modelId === row.modelId)!
        const meter = createOpenAiInputMeter(definition)
        const profile = createOfficialProfileContent(definition, {
          providers: ['openai'],
          allowFallback: false,
          configuration: openaiConfiguration,
        })
        if ('rejected' in profile) throw Error(profile.rejected)
        const start = message('user', 'original prefix', 'u0')
        const next = message('user', 'next', 'u1')
        const reply = judgedMessage({
          type: 'assistant',
          id: 'a0',
          response: 'r0',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              kind: 'thinking',
              id: 'reason',
              text: '',
              opaque: toOpaqueJson({
                routeName: row.modelId,
                reasoning_details: [
                  {
                    type: 'reasoning.encrypted',
                    data: 'ORIGINAL_OPAQUE',
                    format: 'openai-responses-v1',
                  },
                ],
              }),
              visibility: { toHuman: false, toModel: true },
            },
            {
              kind: 'text',
              id: 'text',
              text: 'visible answer',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        })
        const base: PlanInput = {
          ...input(),
          routeName: row.modelId,
          provider: 'openai',
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          tools: [],
          messages: [start],
          snapshot: {
            ...input().snapshot,
            ...definition.capabilities,
            adaptation: profile.ok.adaptation,
            providers: ['openai'],
            allowFallback: false,
          },
        }
        const plan = (value: PlanInput) =>
          planRequest(
            value,
            [definition],
            meter,
            { signal: new AbortController().signal },
            testImagePreparerFor(planRequest),
          )
        const first = await plan(base)
        if ('rejected' in first || first.planned.requestInput.kind !== 'known')
          throw Error('fixture prefix')
        const { messages, ...envelope } = first.planned.body
        const binding = {
          ...base.snapshot.adaptation,
          definition: { modelId: row.modelId, revision: original.definitionRevision },
          implementation: { name: 'pi-ai:openai', revision: original.implementationRevision },
        }
        const history: PlanOutputHistoryGroup = {
          origin: {
            adaptation: binding,
            provider: 'openai',
            parameters: base.parameters,
            upstreamModel: row.modelId,
            servingProvider: 'OpenAI',
          },
          inputCalibration: {
            requestInput: {
              ...first.planned.requestInput,
              projectionRevision: original.projectionRevision,
              prefixDigest: projectionDigest('input-prefix', messages, original.projectionRevision),
              inputEnvelopeDigest: projectionDigest(
                'input-envelope',
                envelope,
                original.projectionRevision,
              ),
              countingBasis: {
                binding,
                model: row.modelId,
                provider: 'openai',
                meterRevision: original.algorithmRevision,
                replayRevision: original.replayRevision,
                tokenizerRevision: original.tokenizerRevision,
                transformRevision: original.transformRevision,
                projectionRevision: original.projectionRevision,
              },
            },
            observedInput:
              row.inputScope === 'scope_unknown'
                ? { kind: 'unavailable', reason: 'scope_unknown' }
                : {
                    kind: 'from_usage',
                    provenance: {
                      adapterRevision: 'openrouter-usage-reader/2',
                      fieldPaths: ['usage.prompt_tokens'],
                      upstreamModel: row.modelId,
                      servingProvider: 'OpenAI',
                    },
                  },
            outputGroup: {
              kind: 'known',
              projectionRevision: original.projectionRevision,
              source: 'reply',
              completeness: 'complete',
              usageRef: 'usage',
              blockDigests: reply.blocks.map(block =>
                outputBlockDigestAtRevision(block, original.projectionRevision),
              ),
            },
          },
          outputBlocks: reply.blocks,
          replaySelection: reply.blocks.map((_, index) => ({
            sourceBlockIndex: index,
            messageIndex: 1,
            blockIndex: index,
          })),
          usage: {
            input_tokens: 100,
            output_tokens: 18,
            reasoning_tokens: 7,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            source: 'upstream',
          },
        }
        const target = { ...base, messages: [start, reply, next], outputHistory: [history] }
        const result = await plan(target)
        const visible = await plan({ ...base, messages: [start, next] })
        if ('rejected' in result || 'rejected' in visible)
          throw Error(JSON.stringify({ result, visible }))
        expect(result.planned.measurement.mode).toBe('full')
        expect(ExactDecimal.from(result.planned.measurement.predictedInput).toString()).toBe(
          ExactDecimal.from(visible.planned.measurement.predictedInput)
            .add(ExactDecimal.from(18))
            .toString(),
        )
        expect(result.planned.serialized).toContain('ORIGINAL_OPAQUE')
        const { messages: finalUnits, ...finalEnvelope } = result.planned.body
        if (!Array.isArray(finalUnits) || result.planned.requestInput.kind !== 'known')
          throw Error('current projection required')
        const selectedUnit = finalUnits[1]
        if (selectedUnit === undefined) throw Error('selected unit required')
        const deltaInput = {
          units: [selectedUnit],
          envelope: finalEnvelope,
          precedingUnitCount: 1,
          unitIndices: [1],
          countingBasis: result.planned.requestInput.countingBasis,
          outputHistory: [history],
          historySpans: reply.blocks.map((_, selectionIndex) => ({
            groupIndex: 0,
            selectionIndex,
            start: 1,
            end: 2,
          })),
        }
        expect(writeJsonLossless(meter.measureNew(deltaInput))).toBe(
          '{"kind":"estimated","tokens":18}',
        )
        expect(
          writeJsonLossless(
            meter.measureNew({
              ...deltaInput,
              outputHistory: [
                { ...history, usage: { ...history.usage, output_tokens: 0, reasoning_tokens: 0 } },
              ],
            }),
          ),
        ).toBe('{"kind":"estimated","tokens":0}')

        expect(() =>
          createOpenAiInputMeter({
            ...definition,
            revision: original.definitionRevision,
            implementation: binding.implementation,
          }),
        ).toThrow('unsupported OpenAI')
        const unavailable = {
          ...history,
          inputCalibration: {
            ...history.inputCalibration,
            requestInput: { kind: 'unavailable' as const, reason: 'not_retained' as const },
          },
        }
        const withoutI = await plan({ ...target, outputHistory: [unavailable] })
        if ('rejected' in withoutI) throw Error(JSON.stringify(withoutI))
        expect(withoutI.planned.measurement.predictedInput).toEqual(
          result.planned.measurement.predictedInput,
        )
        const unknownBinding = {
          ...binding,
          definition: { ...binding.definition, revision: 'unknown' },
        }
        expect(
          await plan({
            ...target,
            outputHistory: [
              { ...unavailable, origin: { ...history.origin, adaptation: unknownBinding } },
            ],
          }),
        ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
      },
    )
  },
)
