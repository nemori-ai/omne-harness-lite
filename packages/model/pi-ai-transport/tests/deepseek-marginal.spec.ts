import { testImagePreparerFor, imagePreparation } from './image-transport-support.ts'
import { basisFor, directFull, directNew } from './direct-full-input.ts'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deepSeekBoundaries } from '../src/input-meters/deepseek-boundary.ts'
import { renderDeepSeekV4Prompt } from '../src/input-meters/deepseek-v4-pro.ts'
import {
  createDeepSeekV41FlashInputMeter,
  renderDeepSeekV41Prompt,
} from '../src/input-meters/deepseek-v41-flash.ts'
import { projectOutput } from '../src/projection.ts'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createDeepSeekV4ProInputMeter } from '../src/input-meters/deepseek-v4-pro.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import {
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
} from '../src/official-models/deepseek.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { planRequest } from '../src/plan.ts'
import {
  at,
  certificate,
  finish,
  fixture,
  input,
  judgedMessage,
  message,
  policy,
  sse,
} from './support.ts'

const tokenized = vi.hoisted(() => [] as string[])
const counts = vi.hoisted(() => [] as number[])
vi.mock('@huggingface/tokenizers', async importOriginal => {
  const actual = await importOriginal<typeof import('@huggingface/tokenizers')>()
  return {
    ...actual,
    Tokenizer: class extends actual.Tokenizer {
      encode(...args: Parameters<InstanceType<typeof actual.Tokenizer>['encode']>) {
        tokenized.push(args[0])
        const result = super.encode(...args)
        counts.push(result.ids.length)
        return result
      }
    },
  }
})
const families = [
  {
    definition: deepseekV4Pro0813Definition,
    configuration: deepseekV4Pro0813Configuration,
    createMeter: createDeepSeekV4ProInputMeter,
    render: (body: import('@omne-harness-lite/content-blocks').JsonObject) =>
      renderDeepSeekV4Prompt(body, 'thinking'),
    scale: 1_000_000,
  },
  {
    definition: deepseekV41FlashDefinition,
    configuration: deepseekV41FlashConfiguration,
    createMeter: createDeepSeekV41FlashInputMeter,
    render: (body: import('@omne-harness-lite/content-blocks').JsonObject) =>
      renderDeepSeekV41Prompt(body, 'thinking', 'low'),
    scale: 900_000,
  },
]
describe.each(families)('$definition.modelId signed reference boundaries', family => {
  const { definition, configuration, createMeter, scale } = family
  function request(): PlanInput {
    const profile = createOfficialProfileContent(definition, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration,
    })
    if ('rejected' in profile) throw Error(profile.rejected)
    return {
      ...input(),
      routeName: definition.modelId,
      provider: 'deepinfra/fp8',
      parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      messages: [
        message('system', 'Preserve the conversation.', 'sys'),
        message('system_reminder', 'Use the completed tool result.', 'reminder'),
        message('user', 'STABLE_PREFIX_MARKER ' + 'long history '.repeat(100), 'u1'),
        judgedMessage({
          type: 'assistant',
          id: 'tool-call-message',
          response: 'prior-tool-response',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'tool-call',
              kind: 'tool_call',
              callId: 'call-lookup',
              tool: 'lookup',
              arguments: { query: 'saved' },
              complete: true,
              visibility: { toHuman: true, toModel: true },
            },
          ],
        }),
        judgedMessage({
          type: 'tool',
          id: 'tool-result-message',
          callId: 'call-lookup',
          createdAt: at,
          blocks: [
            {
              id: 'tool-result',
              kind: 'tool_result',
              callId: 'call-lookup',
              outcome: 'completed',
              visibility: { toHuman: true, toModel: true },
              blocks: [
                {
                  id: 'tool-result-text',
                  kind: 'text',
                  text: 'saved value',
                  visibility: { toHuman: true, toModel: true },
                },
              ],
            },
          ],
        }),
        message('user', 'Answer with the saved value.', 'after-tool'),
      ],
      tools: [
        {
          name: 'lookup',
          description: 'Look up saved values',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string', enum: ['saved'] } },
            required: ['query'],
            additionalProperties: false,
          },
        },
      ],
      snapshot: {
        ...input().snapshot,
        ...definition.capabilities,
        adaptation: profile.ok.adaptation,
        providers: profile.ok.providers,
        allowFallback: profile.ok.allowFallback,
        updatedAt: at,
      },
      tokenMargin: { multiplier: new LosslessNumber('1.0000000000000000001'), reserveTokens: 7 },
    }
  }
  async function planned(value: PlanInput, meter = createMeter(definition)) {
    const result = await planRequest(
      value,
      [definition],
      meter,
      {
        signal: new AbortController().signal,
      },
      testImagePreparerFor(planRequest),
    )
    if ('rejected' in result) throw Error(JSON.stringify(result))
    return result.planned
  }

  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())

  it.each([false, true])(
    'real public three rounds with tools=%s, prefix/basis negatives',
    async tools => {
      const meter = createMeter(definition)
      const full = vi.fn(meter.measureFull)
      const bound = { ...meter, measureFull: full }
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            sse({
              model: definition.modelId,
              provider: 'DeepInfra',
              choices: [{ delta: { content: 'visible answer', reasoning: 'new private thought' } }],
            }) +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 400,
                  completion_tokens: 2,
                  prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                },
              }) +
              finish(),
          ),
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [bound],
      })
      let next = await request()
      if (!tools) next = { ...next, tools: [], messages: next.messages.slice(0, 3) }
      try {
        for (let round = 1; round <= 3; round++) {
          tokenized.length = 0
          const count = full.mock.calls.length
          const p = await transport.plan(next, { signal: new AbortController().signal })
          if ('rejected' in p) throw Error(JSON.stringify(p))
          expect(p.planned.measurement.mode).toBe(round === 1 ? 'full' : 'marginal')
          const response = await invokeModel({
            ...next,
            transport,
            credential: 'local-test-key',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          if (!('outcome' in response)) throw Error(JSON.stringify(response))
          expect(response.outcome).toBe('complete')
          expect(response.inputCalibration.observedInput.kind).toBe('from_usage')
          expect(writeJsonLossless(response.usage.input_tokens)).toBe('400')
          if (round > 1) {
            expect(full.mock.calls.length).toBe(count)
            expect(tokenized.some(value => value.includes('STABLE_PREFIX_MARKER'))).toBe(false)
            expect(tokenized.some(value => value.includes('visible answer'))).toBe(true)
            expect(tokenized.some(value => value.includes(`followup ${round}`))).toBe(true)
          }
          const assistantIndex = next.messages.length
          next = {
            ...next,
            messages: [
              ...next.messages,
              judgedMessage({
                type: 'assistant',
                id: `a${round}`,
                response: `r${round}`,
                ending: 'complete',
                createdAt: at,
                blocks: response.blocks,
              }),
              message('user', `followup ${round + 1}`, `u${round + 1}`),
            ],
            calibration: {
              kind: 'observation',
              inputCalibration: response.inputCalibration,
              usage: response.usage,
              outputBlocks: response.blocks,
              replaySelection: response.blocks.map((_block, index) => ({
                sourceBlockIndex: index,
                messageIndex: assistantIndex,
                blockIndex: index,
              })),
            },
          }
        }
        expect(host.requests).toHaveLength(3)
        expect(
          (
            await planned(
              { ...next, messages: [message('user', 'changed', 'u1'), ...next.messages.slice(1)] },
              bound,
            )
          ).measurement,
        ).toMatchObject({ mode: 'full', fallbackReason: 'prefix_changed' })
        expect(
          (
            await planned(
              {
                ...next,
                tools: [
                  {
                    name: 'lookup',
                    description: 'new definition',
                    parameters: { type: 'object', properties: {} },
                  },
                ],
              },
              bound,
            )
          ).measurement,
        ).toMatchObject({ mode: 'full', fallbackReason: 'prefix_changed' })
        expect(
          (await planned(next, { ...bound, replayRevision: 'new-test-replay' })).measurement,
        ).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
        expect(
          (
            await planned(
              { ...next, parameters: { reasoningEffort: 'high', maxOutputTokens: 1024 } },
              bound,
            )
          ).measurement,
        ).toMatchObject({ mode: 'full', fallbackReason: 'prefix_changed' })
        expect(
          await planRequest(
            next,
            [definition],
            { ...bound, definitionRevision: '1' },
            { signal: new AbortController().signal },
            testImagePreparerFor(planRequest),
          ),
        ).toEqual({
          rejected: 'unavailable',
        })
        if (next.calibration.kind !== 'observation') throw Error('missing source')
        const observation = next.calibration.inputCalibration.observedInput
        if (observation.kind === 'unavailable') throw Error('known source required')
        for (const changed of [
          { servingProvider: 'other' },
          { servingProvider: 'DEEPINFRA' },
          { upstreamModel: 'openai/gpt-6-luna' },
        ]) {
          const wrongSource: PlanInput = {
            ...next,
            calibration: {
              ...next.calibration,
              inputCalibration: {
                ...next.calibration.inputCalibration,
                observedInput: {
                  ...observation,
                  provenance: { ...observation.provenance, ...changed },
                },
              },
            },
          }
          expect((await planned(wrongSource, bound)).measurement).toMatchObject({
            mode: 'full',
            fallbackReason: 'basis_changed',
          })
        }
        const forged = { ...next, calibration: { ...next.calibration, outputBlocks: [] } }
        expect(
          await planRequest(
            forged,
            [definition],
            bound,
            { signal: new AbortController().signal },
            testImagePreparerFor(planRequest),
          ),
        ).toMatchObject({
          rejected: 'invalidInput',
          reason: 'malformed',
        })
        expect(host.requests).toHaveLength(3)
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )

  it('signed finite framing, G/N empty, missing-usage multiple rounds, and substantive rewrite rejection', () => {
    const render = family.render
    const u = { role: 'user', content: 'stable' }
    const a = { role: 'assistant', content: 'answer', reasoning: 'reasoning' }
    const n = { role: 'user', content: 'next' }
    const b = deepSeekBoundaries([u, a, n], {}, 1, new Set([1]), render)!
    if ('changed' in b) throw Error('unexpected substantive change')
    expect(b.replay.removed).toBe('<｜Assistant｜><think>')
    expect(b.replay.added).toContain('reasoning')
    expect(b.fresh.removed).toContain('reasoning')
    expect(b.fresh.added).not.toContain('reasoning')
    expect(b.fresh.added).toContain('</think>answer')
    for (const side of [b.replay, b.fresh]) {
      expect(side.added).not.toContain('stable')
      expect(side.removed).not.toContain('stable')
    }
    const onlyG = deepSeekBoundaries([u, a], {}, 1, new Set([1]), render)!
    if ('changed' in onlyG) throw Error('unexpected change')
    expect(onlyG.fresh.added).toBe(onlyG.fresh.removed)
    const onlyN = deepSeekBoundaries([u, n], {}, 1, new Set(), render)!
    if ('changed' in onlyN) throw Error('unexpected change')
    expect(onlyN.replay.added).toBe(onlyN.replay.removed)
    expect(onlyN.fresh.added).toContain('next')
    expect(deepSeekBoundaries([u, n, n], {}, 1, new Set([1]), render)).toBeUndefined()
    const repeated = deepSeekBoundaries([u, a, n, a, n], {}, 1, new Set([1]), render)!
    if ('changed' in repeated) throw Error('unexpected change')
    expect(repeated.fresh.added).toContain('next')
    // The old anchor contains substantive assistant reasoning; a later user removes it.
    expect(deepSeekBoundaries([u, a, n], {}, 2, new Set(), render)).toEqual({ changed: true })
    expect(
      deepSeekBoundaries([u, { ...a, reasoning_details: [] }], {}, 1, new Set(), render),
    ).toBeUndefined()
    const tools = [
      { type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } },
    ]
    const call = {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'one', type: 'function', function: { name: 'lookup', arguments: '{}' } },
        { id: 'two', type: 'function', function: { name: 'lookup', arguments: '{}' } },
      ],
    }
    const result1 = { role: 'tool', content: 'first value', tool_call_id: 'one' }
    const result2 = { role: 'tool', content: 'second value', tool_call_id: 'two' }
    const toolBoundary = deepSeekBoundaries(
      [u, call, result1, result2],
      { tools },
      3,
      new Set(),
      render,
    )
    if (!toolBoundary || 'changed' in toolBoundary)
      throw Error('tool append should have a finite boundary')
    expect(toolBoundary.fresh.added).toContain('second value')
    expect(toolBoundary.fresh.added).not.toContain('first value')
    const reordered = deepSeekBoundaries(
      [u, call, result2, result1],
      { tools },
      3,
      new Set(),
      render,
    )
    if (definition.modelId === 'deepseek/deepseek-v4.1-flash')
      expect(reordered).toEqual({ changed: true })
    else expect(reordered).toHaveProperty('fresh')
    const interleaved = deepSeekBoundaries([u, a, n, a, n], {}, 1, new Set([1, 3]), render)
    if (!interleaved || 'changed' in interleaved)
      throw Error('ordered anchor-external replay should be supported')
    expect(interleaved.replay.added).toContain('reasoning')
    expect(interleaved.fresh.added).not.toContain('reasoning')
    const meter = createMeter(definition)
    const previousBody = { messages: [u], reasoning: { effort: 'low' } }
    const finalBody = { messages: [u, a, n], reasoning: { effort: 'low' } }
    const previousFull = directFull(meter, {
      body: previousBody,
      serialized: writeJsonLossless(previousBody),
    })
    const finalFull = directFull(meter, {
      body: finalBody,
      serialized: writeJsonLossless(finalBody),
    })
    const outputBlocks = judgedMessage({
      type: 'assistant',
      id: 'finite-output',
      response: 'finite-response',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'r',
          kind: 'thinking' as const,
          text: 'reasoning',
          visibility: { toModel: true, toHuman: true },
        },
        {
          id: 'a',
          kind: 'text' as const,
          text: 'answer',
          visibility: { toModel: true, toHuman: true },
        },
      ],
    }).blocks
    const outputGroup = projectOutput({
      blocks: outputBlocks,
      source: 'reply',
      completeness: 'complete',
    })
    if (!('projected' in outputGroup)) throw Error('output group unavailable')
    const phi = meter.measureReplay({
      countingBasis: basisFor(meter),
      units: [a],
      envelope: {},
      precedingUnitCount: 1,
      boundary: b.replay,
      outputHistory: [],
      observation: {
        kind: 'observation',
        inputCalibration: {
          requestInput: { kind: 'unavailable', reason: 'not_retained' },
          observedInput: { kind: 'unavailable', reason: 'missing_usage' },
          outputGroup: outputGroup.projected,
        },
        usage: {
          input_tokens: 'unknown',
          output_tokens: 'unknown',
          cache_read_tokens: 'unknown',
          cache_write_tokens: 'unknown',
          source: 'none',
        },
        outputBlocks,
        replaySelection: outputBlocks.map((_block, index) => ({
          sourceBlockIndex: index,
          messageIndex: 1,
          blockIndex: index,
        })),
      },
      unitIndices: [1],
      selectionSpans: outputBlocks.map((_block, index) => ({
        selectionIndex: index,
        start: 1,
        end: 2,
      })),
    })
    const delta = directNew(meter, {
      units: [n],
      envelope: {},
      precedingUnitCount: 1,
      boundary: b.fresh,
    })
    if (
      !('tokens' in previousFull) ||
      !('tokens' in finalFull) ||
      !('tokens' in phi) ||
      !('tokens' in delta)
    )
      throw Error('reference unavailable')
    // This finite structural vector must telescope exactly in the reference estimate;
    // that is not an upstream or general BPE accuracy claim.
    expect(
      ExactDecimal.from(previousFull.tokens)
        .add(ExactDecimal.from(phi.tokens))
        .add(ExactDecimal.from(delta.tokens))
        .toString(),
    ).toBe(ExactDecimal.from(finalFull.tokens).toString())
    const zero = { units: [], envelope: {}, precedingUnitCount: 1 }
    expect(
      directNew(meter, {
        ...zero,
        boundary: {
          revision: 'deepseek-reference-boundary/1',
          removed: 'many tokens here',
          added: '',
        },
      }),
    ).toMatchObject({ kind: 'estimated' })
    const negative = directNew(meter, {
      ...zero,
      boundary: {
        revision: 'deepseek-reference-boundary/1',
        removed: 'many tokens here',
        added: '',
      },
    })
    if (!('tokens' in negative)) throw Error('contribution unavailable')
    expect(ExactDecimal.from(negative.tokens).compare(ExactDecimal.from(0))).toBe(-1)
    expect(directNew(meter, zero)).toEqual({ kind: 'unavailable' })
  })

  it('planner falls back for a substantive old reasoning rewrite and retains all messages', async () => {
    const first = {
      ...(await request()),
      tools: [],
      messages: [
        message('user', 'old question', 'old-q'),
        judgedMessage({
          type: 'assistant',
          id: 'old-a',
          response: 'old-r',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'thought',
              kind: 'thinking',
              text: 'old substantive thought',
              visibility: { toHuman: false, toModel: true },
            },
            {
              id: 'text',
              kind: 'text',
              text: 'old answer',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        }),
      ],
    }
    const p = await planned(first)
    const group = projectOutput({ blocks: [], source: 'none', completeness: 'complete' })
    if (!('projected' in group)) throw Error('projection')
    const result = await planned({
      ...first,
      messages: [...first.messages, message('user', 'next question', 'next-q')],
      calibration: {
        kind: 'observation',
        inputCalibration: {
          requestInput: p.requestInput,
          observedInput: {
            kind: 'upstream_total',
            tokens: 100,
            provenance: {
              adapterRevision: 'openrouter-usage-reader/2',
              fieldPaths: ['usage.prompt_tokens'],
            },
          },
          outputGroup: group.projected,
        },
        usage: {
          source: 'upstream',
          input_tokens: 'unknown',
          output_tokens: 3,
          cache_read_tokens: 'unknown',
          cache_write_tokens: 'unknown',
        },
        outputBlocks: [],
        replaySelection: [],
      },
    })
    expect(result.measurement).toMatchObject({ mode: 'full', fallbackReason: 'prefix_changed' })
    expect(result.serialized).toContain('old substantive thought')
  })

  it.runIf(definition.modelId === 'deepseek/deepseek-v4.1-flash')(
    'meters only the new image span while checking every image byte',
    async () => {
      const red = readFileSync(
        new URL('./fixtures/deepseek-v41-flash/public-red-544.png', import.meta.url),
      )
      const blue = readFileSync(
        new URL('./fixtures/deepseek-v41-flash/public-blue-1024.png', import.meta.url),
      )
      const imageMessage = (bytes: Buffer, id: string) =>
        judgedMessage({
          type: 'user',
          id,
          createdAt: at,
          blocks: [
            {
              id: `${id}-text`,
              kind: 'text',
              text: id === 'old-image' ? 'STABLE_IMAGE' : 'new image',
              visibility: { toHuman: true, toModel: true },
            },
            {
              id: `${id}-image`,
              kind: 'image',
              mediaType: 'image/png',
              data: { inline: bytes.toString('base64') },
              visibility: { toHuman: true, toModel: true },
            },
          ],
        })
      const meter = createMeter(definition)
      const full = vi.fn(meter.measureFull)
      const bound = { ...meter, measureFull: full }
      const first = { ...(await request()), tools: [], messages: [imageMessage(red, 'old-image')] }
      const p = await planned(first, bound)
      const group = projectOutput({ blocks: [], source: 'none', completeness: 'complete' })
      if (!('projected' in group)) throw Error('projection')
      const next = (bytes: Buffer): PlanInput => ({
        ...first,
        messages: [...first.messages, imageMessage(bytes, 'new-image')],
        calibration: {
          kind: 'observation',
          inputCalibration: {
            requestInput: p.requestInput,
            observedInput: {
              kind: 'upstream_total',
              tokens: 400,
              provenance: {
                adapterRevision: 'openrouter-usage-reader/2',
                fieldPaths: ['usage.prompt_tokens'],
                servingProvider: 'DeepInfra',
                upstreamModel: definition.modelId,
              },
            },
            outputGroup: group.projected,
          },
          usage: {
            source: 'upstream',
            input_tokens: 'unknown',
            output_tokens: 3,
            cache_read_tokens: 'unknown',
            cache_write_tokens: 'unknown',
          },
          outputBlocks: [],
          replaySelection: [],
        },
      })
      tokenized.length = 0
      full.mockClear()
      const small = await planned(next(red), bound),
        large = await planned(next(blue), bound)
      expect(small.measurement.mode).toBe('marginal')
      expect(large.measurement.mode).toBe('marginal')
      expect(full).not.toHaveBeenCalled()
      expect(ExactDecimal.from(large.measurement.predictedInput).toString()).toBe(
        ExactDecimal.from(small.measurement.predictedInput).add(ExactDecimal.from(468)).toString(),
      )
      expect(large.inputLimitEvidence.imageBytes).toEqual([red.length, blue.length])
      expect(
        tokenized.some(
          value =>
            value.includes('STABLE_IMAGE') ||
            value.includes(red.toString('base64')) ||
            value.includes(blue.toString('base64')),
        ),
      ).toBe(false)
      expect(
        await planRequest(
          {
            ...next(blue),
            snapshot: { ...first.snapshot, inputConstraints: { maxImageBytes: 1 } },
          },
          [definition],
          bound,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        ),
      ).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxImageBytes'],
      })
    },
  )

  it('large actual reference token prefix never reaches the incremental tokenizer', async () => {
    const meter = createMeter(definition)
    const full = vi.fn(meter.measureFull)
    const bound = { ...meter, measureFull: full }
    const first: PlanInput = {
      ...(await request()),
      tools: [],
      messages: [message('user', 'STABLE_MILLION ' + 'x '.repeat(scale), 'million')],
    }
    tokenized.length = 0
    counts.length = 0
    const p = await planned(first, bound)
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(scale)
    const actualReferenceTokens = counts.reduce((a, b) => a + b, 0)
    expect(p.measurement.predictedInput).toBeLessThan(
      Number(definition.capabilities.maxInputTokens),
    )
    const group = projectOutput({ blocks: [], source: 'none', completeness: 'complete' })
    if (!('projected' in group)) throw Error('projection')
    const next: PlanInput = {
      ...first,
      messages: [
        ...first.messages,
        judgedMessage({
          type: 'assistant',
          id: 'answer',
          response: 'r-million',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'answer-text',
              kind: 'text',
              text: 'new answer',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        }),
        message('user', 'new question', 'question'),
      ],
      calibration: {
        kind: 'observation',
        inputCalibration: {
          requestInput: p.requestInput,
          observedInput: {
            kind: 'upstream_total',
            tokens: p.measurement.predictedInput,
            provenance: {
              adapterRevision: 'openrouter-usage-reader/2',
              fieldPaths: ['usage.prompt_tokens'],
              servingProvider: 'DeepInfra',
              upstreamModel: definition.modelId,
            },
          },
          outputGroup: group.projected,
        },
        usage: {
          source: 'upstream',
          input_tokens: 'unknown',
          output_tokens: 3,
          cache_read_tokens: 'unknown',
          cache_write_tokens: 'unknown',
        },
        outputBlocks: [],
        replaySelection: [],
      },
    }
    tokenized.length = 0
    counts.length = 0
    full.mockClear()
    expect((await planned(next, bound)).measurement.mode).toBe('marginal')
    expect(full).not.toHaveBeenCalled()
    expect(tokenized.some(value => value.includes('STABLE_MILLION'))).toBe(false)
    expect(Math.max(...tokenized.map(value => value.length))).toBeLessThan(1000)
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThan(100)
    console.info(
      JSON.stringify({
        benchmark: 'deepseek-stable-prefix',
        actualReferenceTokens,
        incrementalTokenizedTokens: counts.reduce((a, b) => a + b, 0),
        stablePrefixTokenizerCalls: 0,
        node: process.version,
      }),
    )
  }, 120_000)
})
