import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import type {
  PlanInput,
  PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime-local'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createAnthropicInputMeter } from '../src/input-meters/anthropic.ts'
import originalInputs from './fixtures/anthropic/original-request-inputs.json' with { type: 'json' }
import { anthropicReplayModels } from '../src/input-meters/anthropic-replay.ts'
import { anthropicDefinitions } from '../src/official-models/anthropic.ts'
import { planRequest, type PlannedRequest } from '../src/plan.ts'
import { projectOutput } from '../src/projection.ts'
import { testImagePreparerFor } from './image-transport-support.ts'
import { at, input, judgedMessage, message } from './support.ts'

function response(model: string, id: string, kind: 'signed' | 'encrypted', tool = false): Message {
  return judgedMessage({
    type: 'assistant',
    id,
    response: `${id}-response`,
    ending: 'complete',
    createdAt: at,
    blocks: [
      {
        kind: 'thinking',
        id: `${id}-thinking`,
        text: '',
        visibility: { toHuman: false, toModel: true },
        opaque: toOpaqueJson({
          routeName: model,
          reasoning_details: [
            {
              type: kind === 'signed' ? 'reasoning.text' : 'reasoning.encrypted',
              format: 'anthropic-claude-v1',
              index: 0,
              ...(kind === 'signed'
                ? { text: '', signature: `SIGNATURE_${id}` }
                : { data: `CIPHER_${id}` }),
            },
            ...(tool
              ? [
                  {
                    type: 'reasoning.encrypted',
                    format: 'anthropic-claude-v1',
                    index: 1,
                    data: `CIPHER_${id}`,
                  },
                ]
              : []),
          ],
        }),
      },
      {
        kind: 'text',
        id: `${id}-text`,
        text: `Visible ${id}`,
        visibility: { toHuman: true, toModel: true },
      },
      ...(tool
        ? [
            {
              kind: 'tool_call',
              id: `${id}-tool`,
              callId: `${id}-call`,
              tool: 'weather',
              complete: true,
              arguments: { city: 'Paris' },
              visibility: { toHuman: true, toModel: true },
            },
          ]
        : []),
    ],
  })
}
function group(
  plan: PlannedRequest,
  reply: Message,
  position: number,
  tokens: number,
): PlanOutputHistoryGroup {
  const projected = projectOutput({
    blocks: reply.blocks,
    source: 'reply',
    completeness: 'complete',
  })
  if (!('projected' in projected)) throw Error('invalid output fixture')
  return {
    inputCalibration: {
      requestInput: plan.requestInput,
      observedInput: {
        kind: 'from_usage',
        provenance: {
          adapterRevision: 'openrouter-usage-reader/2',
          fieldPaths: ['usage.prompt_tokens'],
        },
      },
      outputGroup: projected.projected,
    },
    usage: {
      input_tokens: 100,
      output_tokens: tokens,
      reasoning_tokens: 7,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      source: 'upstream',
    },
    outputBlocks: reply.blocks,
    replaySelection: reply.blocks.map((_, index) => ({
      sourceBlockIndex: index,
      messageIndex: position,
      blockIndex: index,
    })),
    origin: {
      adaptation: plan.input.snapshot.adaptation,
      provider: 'anthropic',
      parameters: plan.parameters,
      servingProvider: 'Anthropic',
      upstreamModel: plan.input.routeName,
    },
  }
}
const observation = (g: PlanOutputHistoryGroup) => ({
  kind: 'observation' as const,
  inputCalibration: g.inputCalibration,
  usage: g.usage,
  outputBlocks: g.outputBlocks,
  replaySelection: g.replaySelection,
})

describe.each(anthropicReplayModels)('$modelId complete output contribution', row => {
  const published = anthropicDefinitions.find(d => d.modelId === row.modelId)
  if (!published) throw Error('missing Anthropic source definition')
  const definition = published
  const meter = createAnthropicInputMeter(definition)
  const configured = createOfficialProfileContent(definition, {
    providers: ['anthropic'],
    allowFallback: false,
    configuration: {
      revision: '1',
      values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
    },
  })
  if ('rejected' in configured) throw Error(configured.rejected)
  const profile = configured.ok
  function request(): PlanInput {
    const base = input()
    return {
      ...base,
      routeName: row.modelId,
      provider: 'anthropic',
      messages: [message('user', 'start', 'u1')],
      tools: [],
      parameters: { reasoningEffort: 'high', maxOutputTokens: 1024 },
      tokenMargin: { multiplier: 1, reserveTokens: 0 },
      snapshot: {
        ...base.snapshot,
        ...definition.capabilities,
        adaptation: profile.adaptation,
        providers: profile.providers,
        allowFallback: false,
      },
    }
  }
  async function plan(value: PlanInput, selectedMeter = meter) {
    return planRequest(
      value,
      [definition],
      selectedMeter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
  }
  async function planned(value: PlanInput): Promise<PlannedRequest> {
    const result = await plan(value)
    if (!('planned' in result)) throw Error(JSON.stringify(result))
    return result.planned
  }

  it('uses one complete-group contribution for signed/encrypted full and marginal regions', async () => {
    const first = await planned(request()),
      a = response(row.modelId, 'a', 'signed'),
      ga = group(first, a, 1, 18)
    const secondInput = {
      ...request(),
      messages: [...request().messages, a, message('user', 'next', 'u2')],
      outputHistory: [ga],
      calibration: observation(ga),
    }
    const second = await planned(secondInput)
    expect(second.measurement.mode).toBe('marginal')
    if (second.measurement.mode !== 'marginal') throw Error('marginal required')
    expect(second.measurement.replayContribution).toEqual({ precision: 'estimated', tokens: 18 })
    const b = response(row.modelId, 'b', 'encrypted'),
      gb = group(second, b, 3, 23)
    const value = {
      ...request(),
      messages: [...secondInput.messages, b, message('user', 'last', 'u3')],
      outputHistory: [ga, gb],
    }
    const full = await planned(value)
    const visible = await planned({
      ...request(),
      messages: value.messages.filter((_, i) => i !== 1 && i !== 3),
    })
    expect(ExactDecimal.from(full.measurement.predictedInput).toString()).toBe(
      ExactDecimal.from(visible.measurement.predictedInput).add(ExactDecimal.from(41)).toString(),
    )
    expect(writeJsonLossless(full.body)).toContain('SIGNATURE_a')
    expect(writeJsonLossless(full.body)).toContain('CIPHER_b')
    const incremental = await planned({ ...value, calibration: observation(ga) })
    expect(incremental.measurement.mode).toBe('marginal')
    if (incremental.measurement.mode !== 'marginal') throw Error('marginal required')
    expect(incremental.measurement.replayContribution).toEqual({
      precision: 'estimated',
      tokens: 18,
    })
    expect(
      ExactDecimal.from(incremental.measurement.newContribution.tokens).compare(
        ExactDecimal.from(23),
      ),
    ).toBeGreaterThan(0)
  })

  it('keeps an observed zero-O opaque-only new region estimated', async () => {
    const first = await planned(request()),
      a = response(row.modelId, 'zero-a', 'signed'),
      ga = group(first, a, 1, 18)
    const secondInput = {
      ...request(),
      messages: [...request().messages, a],
      outputHistory: [ga],
      calibration: observation(ga),
    }
    const second = await planned(secondInput),
      b = response(row.modelId, 'zero-b', 'encrypted')
    const observed = group(second, b, 2, 0)
    const gb = { ...observed, usage: { ...observed.usage, reasoning_tokens: 0 } }
    const current = await planned({
      ...secondInput,
      messages: [...secondInput.messages, b],
      outputHistory: [ga, gb],
    })
    expect(current.measurement.mode).toBe('marginal')
    if (current.measurement.mode !== 'marginal') throw Error('expected marginal fixture')
    expect(current.measurement.newContribution.precision).toBe('estimated')
    expect(ExactDecimal.from(current.measurement.newContribution.tokens).toString()).toBe('0')
  })

  it('interprets a real retained original request basis without an old factory alias', async () => {
    const first = await planned(request()),
      a = response(row.modelId, 'original', 'signed'),
      ga = group(first, a, 1, 29)
    const saved = originalInputs.rows.find(item => item.modelId === row.modelId)
    if (!saved) throw Error('missing executed original planner fixture')
    const original = saved.requestInput as typeof first.requestInput
    if (original.kind !== 'known' || !ga.origin) throw Error('known original fixture required')
    const old: PlanOutputHistoryGroup = {
      ...ga,
      origin: { ...ga.origin, adaptation: original.countingBasis.binding },
      inputCalibration: {
        ...ga.inputCalibration,
        requestInput: original,
        outputGroup: saved.outputGroup as typeof ga.inputCalibration.outputGroup,
      },
    }
    const value = {
      ...request(),
      messages: [...request().messages, a, message('user', 'next', 'u2')],
      outputHistory: [old],
    }
    if (row.requiresSignedPrefix) {
      // /2 is a valid original record, but cannot prove the stricter /3 prefix.
      // Observe the contribution separately from the planner's public failure mapping.
      const measured: unknown[] = []
      const result = await plan(value, {
        ...meter,
        measureFull: input => {
          const contribution = meter.measureFull(input)
          measured.push(contribution)
          return contribution
        },
      })
      expect(result).toHaveProperty('rejected')
      expect(measured).toContainEqual({ kind: 'unavailable' })
    } else {
      const full = await planned(value)
      expect(full.measurement.mode).toBe('full')
      const calibrated = await planned({ ...value, calibration: observation(old) })
      // The original projection version cannot seed current prefix calibration;
      // finite original O remains usable by the full-path group contribution.
      expect(calibrated.measurement.mode).toBe('full')
      expect(calibrated.measurement.predictedInput).toEqual(full.measurement.predictedInput)
    }
    expect(() =>
      createAnthropicInputMeter({
        ...definition,
        revision: '3',
        implementation: { name: 'pi-ai:anthropic', revision: 'mp4-17' },
      }),
    ).toThrow()
  })

  it('counts a complete signed/encrypted/text/tool output only once', async () => {
    const first = await planned(request()),
      a = response(row.modelId, 'tool', 'signed', true),
      ga = group(first, a, 1, 37)
    const result = judgedMessage({
      type: 'tool',
      id: 'result',
      callId: 'tool-call',
      createdAt: at,
      blocks: [
        {
          kind: 'tool_result',
          id: 'result-block',
          callId: 'tool-call',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              kind: 'text',
              id: 'result-text',
              text: 'sunny',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    })
    const outcome = await planned({
      ...request(),
      messages: [...request().messages, a, result],
      outputHistory: [ga],
      calibration: observation(ga),
    })
    expect(outcome.measurement.mode).toBe('marginal')
    if (outcome.measurement.mode !== 'marginal') throw Error('marginal required')
    expect(outcome.measurement.replayContribution).toEqual({ precision: 'estimated', tokens: 37 })
    expect(writeJsonLossless(outcome.body)).toContain('weather')
    expect(writeJsonLossless(outcome.body)).toContain('CIPHER_tool')
    expect(writeJsonLossless(outcome.body)).toContain('SIGNATURE_tool')
  })

  it('keeps unknown O and unbacked opaque histories unavailable', async () => {
    const first = await planned(request()),
      a = response(row.modelId, 'unknown', 'encrypted'),
      ga = group(first, a, 1, 18)
    const value = {
      ...request(),
      messages: [...request().messages, a, message('user', 'next', 'u2')],
    }
    expect(await plan(value)).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_size_unavailable',
    })
    expect(
      await plan({
        ...value,
        outputHistory: [{ ...ga, usage: { ...ga.usage, output_tokens: 'unknown' } }],
      }),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
  })

  it.each([
    'provider',
    'model',
    'reader',
    'effort',
    'format',
    'unsigned',
    'ciphertext',
    'unknownO',
  ] as const)('never recovers an opaque contribution with invalid %s provenance', async field => {
    const first = await planned(request()),
      a = response(row.modelId, 'guard', 'signed'),
      ga = group(first, a, 1, 18)
    if (!ga.origin) throw Error('origin fixture')
    const observed = ga.inputCalibration.observedInput
    if (observed.kind === 'unavailable') throw Error('reader fixture')
    let history: PlanOutputHistoryGroup = ga
    if (field === 'provider')
      history = { ...ga, origin: { ...ga.origin, servingProvider: 'unrelated' } }
    if (field === 'model')
      history = { ...ga, origin: { ...ga.origin, upstreamModel: 'anthropic/unknown' } }
    if (field === 'reader')
      history = {
        ...ga,
        inputCalibration: {
          ...ga.inputCalibration,
          observedInput: {
            ...observed,
            provenance: { ...observed.provenance, adapterRevision: 'unknown/1' },
          },
        },
      }
    if (field === 'effort')
      history = {
        ...ga,
        origin: {
          ...ga.origin,
          parameters: { ...ga.origin.parameters, reasoningEffort: 'none' },
        },
      }
    if (field === 'unknownO') history = { ...ga, usage: { ...ga.usage, output_tokens: 'unknown' } }
    let reply = a
    if (field === 'format' || field === 'unsigned' || field === 'ciphertext') {
      const detail =
        field === 'ciphertext'
          ? { type: 'reasoning.encrypted', format: 'anthropic-claude-v1', data: '' }
          : {
              type: 'reasoning.text',
              format: field === 'format' ? 'unknown-format' : 'anthropic-claude-v1',
              text: 'summary',
              ...(field === 'unsigned' ? {} : { signature: 'SIGNATURE_guard' }),
            }
      reply = judgedMessage({
        ...a,
        blocks: [
          {
            ...a.blocks[0],
            opaque: toOpaqueJson({ routeName: row.modelId, reasoning_details: [detail] }),
          },
          ...a.blocks.slice(1),
        ],
      })
      history = group(first, reply, 1, 18)
    }
    const result = await plan({
      ...request(),
      messages: [...request().messages, reply, message('user', 'next', 'u2')],
      outputHistory: [history],
    })
    expect(result).toHaveProperty('rejected')
  })

  it('preserves partial selection as unavailable instead of tokenizing retained signatures', async () => {
    const first = await planned(request()),
      a = response(row.modelId, 'partial', 'signed'),
      ga = group(first, a, 1, 18)
    const partial = judgedMessage({ ...a, blocks: [a.blocks[0]] })
    const history = { ...ga, replaySelection: [ga.replaySelection[0]!] }
    expect(
      await plan({
        ...request(),
        messages: [...request().messages, partial, message('user', 'next', 'u2')],
        outputHistory: [history],
      }),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
  })

  if (row.requiresSignedPrefix) {
    it.each(['reasoningEffort', 'maxOutputTokens'])(
      'PF-N1 legal %s change leaves the contribution unavailable and fails only the input-size gate',
      async field => {
        const first = await planned(request()),
          a = response(row.modelId, 'prefix', 'signed'),
          ga = group(first, a, 1, 18)
        const changed = {
          ...request(),
          parameters: {
            ...request().parameters,
            [field]: field === 'reasoningEffort' ? 'low' : 2048,
          },
          messages: [...request().messages, a, message('user', 'next', 'u2')],
          outputHistory: [ga],
          calibration: observation(ga),
        }
        // Adopted failure-layer clarification 17a71317: missing contribution
        // falls back to full; the existing size gate owns the public rejection.
        const fullContributions: unknown[] = []
        const result = await plan(changed, {
          ...meter,
          measureFull: input => {
            const contribution = meter.measureFull(input)
            fullContributions.push(contribution)
            return contribution
          },
        })
        expect(fullContributions).toEqual([{ kind: 'unavailable' }])
        expect(result).toEqual({
          rejected: 'invalidInput',
          reason: 'input_size_unavailable',
          metrics: ['maxInputTokens'],
        })
      },
    )
    it('keeps a new message between original prefix and signed group unmeasurable', async () => {
      const first = await planned(request()),
        a = response(row.modelId, 'boundary', 'signed'),
        ga = group(first, a, 2, 18)
      expect(
        await plan({
          ...request(),
          messages: [
            ...request().messages,
            message('user', 'inserted', 'insert'),
            a,
            message('user', 'next', 'u2'),
          ],
          outputHistory: [ga],
        }),
      ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
    })
  }
})
