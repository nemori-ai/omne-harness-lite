import { describe, it, expect, vi } from 'vitest'
import { LosslessNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { canonicalProjection, projectOutput } from '../src/projection.ts'
import { createReadFactsAccumulator } from '../src/read-facts.ts'
import { anthropicDefinitions } from '../src/official-models/anthropic.ts'
import { createAnthropicInputMeter } from '../src/input-meters/anthropic.ts'
import { planRequest, type PlannedRequest } from '../src/plan.ts'
import { input, message, at, judgedMessage } from './support.ts'
import { testDefinitions } from './definitions.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'

const noUsage = {
  input_tokens: 'unknown',
  output_tokens: 4,
  cache_read_tokens: 'unknown',
  cache_write_tokens: 'unknown',
  source: 'upstream',
} as const
function anchor(planned: PlannedRequest, tokens: number) {
  return {
    kind: 'observation' as const,
    inputCalibration: {
      requestInput: planned.requestInput,
      observedInput: {
        kind: 'upstream_total' as const,
        tokens,
        provenance: {
          adapterRevision: 'openrouter-usage-reader/2',
          fieldPaths: ['usage.prompt_tokens'] as const,
        },
      },
      outputGroup: {
        kind: 'known' as const,
        projectionRevision: 'openrouter-input-projection/2',
        source: 'none' as const,
        completeness: 'complete' as const,
        usageRef: 'usage' as const,
        blockDigests: [],
      },
    },
    usage: noUsage,
    outputBlocks: [],
    replaySelection: [],
  }
}
function plan(
  request: PlanInput,
  definitions = testDefinitions,
  meter = syntheticInputMeter(definitions[0]!, request.provider),
) {
  const result = planRequest(request, definitions, meter)
  if (!('planned' in result)) throw new Error(JSON.stringify(result))
  return result.planned
}
describe('response calibration actual planner', () => {
  it('canonicalizes code-point keys, including integer names, and preserves number spelling', () => {
    expect(
      canonicalProjection({ '2': 'two', '10': 'ten', z: 'é', a: new LosslessNumber('1e3') }),
    ).toBe('{"10":"ten","2":"two","a":1e3,"z":"é"}')
    expect(canonicalProjection({ a: 1000 })).not.toBe(
      canonicalProjection({ a: new LosslessNumber('1e3') }),
    )
    const getter = {
      get dangerous() {
        throw Error('not accessed')
      },
    }
    expect(() => canonicalProjection(getter)).toThrow('non-JSON')
  })
  it('signed contributions and one margin; never tokenizes anchor; content/basis changes full', () => {
    const base = syntheticInputMeter(testDefinitions[0]!, 'openai')
    const full = vi.fn(base.measureFull)
    const delta = vi.fn((_input: import('../src/input-meter.ts').MarginalMeterInput) => ({
      kind: 'estimated' as const,
      tokens: -3,
    }))
    const meter = { ...base, measureFull: full, measureNew: delta }
    const first = plan(input(), testDefinitions, meter)
    const request = {
      ...input(),
      calibration: anchor(first, 100),
      messages: [...input().messages, message('user', 'next', 'next')],
      tokenMargin: { multiplier: 1.1, reserveTokens: 7 },
    }
    const next = plan(request, testDefinitions, meter)
    expect(next.measurement.mode).toBe('marginal')
    expect(ExactDecimal.from(next.measurement.predictedInput).compare(ExactDecimal.from(97))).toBe(
      0,
    )
    expect(
      ExactDecimal.from(next.measurement.admissionTokens).compare(ExactDecimal.from(114)),
    ).toBe(0)
    expect(full).toHaveBeenCalledTimes(1)
    expect(delta.mock.calls[0]?.[0].units).toHaveLength(1)
    const edited = plan(
      { ...request, messages: [message('user', 'edited'), ...request.messages.slice(1)] },
      testDefinitions,
      meter,
    )
    expect(edited.measurement).toMatchObject({ mode: 'full', fallbackReason: 'prefix_changed' })
    const revised = plan(request, testDefinitions, { ...meter, replayRevision: 'different' })
    expect(revised.measurement).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
  })
  it('a failed marginal component returns full without inventing a prefix change', () => {
    const base = syntheticInputMeter(testDefinitions[0]!, 'openai')
    const first = plan(input(), testDefinitions, base)
    const next = plan(
      {
        ...input(),
        calibration: anchor(first, 100),
        messages: [...input().messages, message('user', 'new', 'n')],
      },
      testDefinitions,
      base,
    )
    expect(next.measurement.mode).toBe('full')
    expect(next.measurement.fallbackReason).toBeUndefined()
  })
  for (const definition of anthropicDefinitions)
    it(`${definition.modelId}: real official full→marginal→marginal with rolling cache`, () => {
      const meter = createAnthropicInputMeter(definition)
      const original = input()
      let request: PlanInput = {
        ...original,
        routeName: definition.modelId,
        provider: 'anthropic',
        parameters: { maxOutputTokens: 128 },
        messages: [message('system', 'instruction'), message('user', 'question', 'u1')],
        snapshot: {
          ...original.snapshot,
          ...definition.capabilities,
          providers: ['anthropic'],
          updatedAt: at,
          adaptation: {
            implementation: definition.implementation,
            definition: { modelId: definition.modelId, revision: definition.revision },
            configuration: {
              revision: 'c1',
              values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
            },
          },
        },
      }
      const measured = vi.fn(meter.measureFull)
      const bound = { ...meter, measureFull: measured }
      let previous = plan(request, [definition], bound)
      expect(previous.measurement.mode).toBe('full')
      for (let i = 2; i <= 3; i++) {
        request = {
          ...request,
          calibration: anchor(previous, 100 * i),
          messages: [...request.messages, message('user', `next ${i}`, `u${i}`)],
        }
        const next = plan(request, [definition], bound)
        expect(next.measurement.mode).toBe('marginal')
        const last = (next.body.messages as readonly JsonObject[]).at(-1)!
        expect(last.content).toEqual([
          { type: 'text', text: `next ${i}`, cache_control: { type: 'ephemeral', ttl: '1h' } },
        ])
        previous = next
      }
      // A nonempty assistant is an array from its first send; moving the
      // breakpoint away must not change the historical representation.
      const assistant = judgedMessage({
        type: 'assistant',
        id: 'assistant-tail',
        response: 'response-tail',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'answer',
            kind: 'text',
            text: 'answer',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      request = {
        ...request,
        calibration: anchor(previous, 400),
        messages: [...request.messages, assistant],
      }
      previous = plan(request, [definition], bound)
      expect(previous.measurement.mode).toBe('marginal')
      expect((previous.body.messages as readonly JsonObject[]).at(-1)?.content).toEqual([
        { type: 'text', text: 'answer', cache_control: { type: 'ephemeral', ttl: '1h' } },
      ])
      request = {
        ...request,
        calibration: anchor(previous, 420),
        messages: [...request.messages, message('user', 'after assistant', 'after-assistant')],
      }
      previous = plan(request, [definition], bound)
      expect(previous.measurement.mode).toBe('marginal')
      expect((previous.body.messages as readonly JsonObject[]).at(-2)?.content).toEqual([
        { type: 'text', text: 'answer' },
      ])
      const call = judgedMessage({
        type: 'assistant',
        id: 'call-message',
        response: 'call-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'call',
            kind: 'tool_call',
            callId: 'c1',
            tool: 'lookup',
            complete: true,
            unparseable: true,
            rawArguments: '{}',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      const result = judgedMessage({
        type: 'tool',
        id: 'result',
        callId: 'c1',
        createdAt: at,
        blocks: [
          {
            id: 'result-block',
            kind: 'tool_result',
            callId: 'c1',
            outcome: 'completed',
            visibility: { toHuman: true, toModel: true },
            blocks: [
              {
                id: 'result-text',
                kind: 'text',
                text: 'tool answer',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          },
        ],
      })
      request = {
        ...request,
        calibration: anchor(previous, 440),
        messages: [...request.messages, call, result],
      }
      previous = plan(request, [definition], bound)
      expect(previous.measurement.mode).toBe('marginal')
      expect((previous.body.messages as readonly JsonObject[]).at(-1)?.content).toEqual([
        { type: 'text', text: 'tool answer', cache_control: { type: 'ephemeral', ttl: '1h' } },
      ])
      request = {
        ...request,
        calibration: anchor(previous, 460),
        messages: [...request.messages, message('user', 'after tool', 'after-tool')],
      }
      previous = plan(request, [definition], bound)
      expect(previous.measurement.mode).toBe('marginal')
      expect((previous.body.messages as readonly JsonObject[]).at(-2)?.content).toEqual([
        { type: 'text', text: 'tool answer' },
      ])
      expect(measured).toHaveBeenCalledTimes(1)
    })
  it('binds a replay group to actual selected complete message units and does not add aggregate O', () => {
    const base = syntheticInputMeter(testDefinitions[0]!, 'openai')
    const phi = vi.fn(() => ({ kind: 'estimated' as const, tokens: 7 })),
      delta = vi.fn(() => ({ kind: 'estimated' as const, tokens: 11 }))
    const meter = { ...base, measureReplay: phi, measureNew: delta }
    const first = plan(input(), testDefinitions, meter)
    const reply = judgedMessage({
      type: 'assistant',
      id: 'reply',
      response: 'response',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'reply-text',
          kind: 'text',
          text: 'answer',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const projected = projectOutput({
      blocks: reply.blocks,
      source: 'reply',
      completeness: 'complete',
    })
    if (!('projected' in projected)) throw Error('projection rejected')
    const initial = anchor(first, 100)
    const calibration = {
      ...initial,
      inputCalibration: { ...initial.inputCalibration, outputGroup: projected.projected },
      outputBlocks: reply.blocks,
      replaySelection: [
        { sourceBlockIndex: 0, messageIndex: input().messages.length, blockIndex: 0 },
      ],
    }
    const next = plan(
      {
        ...input(),
        calibration,
        messages: [...input().messages, reply, message('user', 'after', 'after')],
      },
      testDefinitions,
      meter,
    )
    expect(next.measurement.mode).toBe('marginal')
    expect(ExactDecimal.from(next.measurement.predictedInput).compare(ExactDecimal.from(118))).toBe(
      0,
    )
    expect(phi).toHaveBeenCalledTimes(1)
    expect(delta).toHaveBeenCalledTimes(1)
    const forged = { ...calibration, outputBlocks: [{ ...reply.blocks[0]!, text: 'forged' }] }
    expect(planRequest({ ...input(), calibration: forged }, testDefinitions, meter)).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
  })
  it('marginal mode still checks full actual request bytes', () => {
    const base = syntheticInputMeter(testDefinitions[0]!, 'openai'),
      meter = { ...base, measureNew: () => ({ kind: 'exact' as const, tokens: 1 }) }
    const first = plan(input(), testDefinitions, meter)
    const request = {
      ...input(),
      calibration: anchor(first, 100),
      messages: [...input().messages, message('user', 'new', 'new')],
      snapshot: {
        ...input().snapshot,
        inputConstraints: { ...input().snapshot.inputConstraints, maxRequestBytes: 10 },
      },
    }
    expect(planRequest(request, testDefinitions, meter)).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      metric: 'maxRequestBytes',
      basis: 'exact',
    })
  })
  it('output digests preserve order and all opaque content', () => {
    const blocks = message().blocks
    const result = projectOutput({ blocks, source: 'reply', completeness: 'partial' })
    expect(result).toMatchObject({
      projected: { kind: 'known', source: 'reply', completeness: 'partial', usageRef: 'usage' },
    })
    expect(projectOutput({ blocks, source: 'none', completeness: 'complete' })).toEqual({
      invalidInput: { reason: 'malformed' },
    })
  })
})
describe('one reader facts accumulator', () => {
  it('keeps partial cache counters unknown and complete prompt total exact', () => {
    const state = createReadFactsAccumulator(() => {}, false)
    state.observe({
      prompt_tokens: 100,
      completion_tokens: 4,
      prompt_tokens_details: { cached_tokens: 60 },
    })
    expect(state.read()).toMatchObject({
      usage: { input_tokens: 'unknown', cache_read_tokens: 60, cache_write_tokens: 'unknown' },
      observedInput: { kind: 'upstream_total', tokens: 100 },
    })
    state.observe({
      prompt_tokens: 100,
      prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 },
    })
    expect(state.read()).toMatchObject({
      usage: { cache_read_tokens: 60, cache_write_tokens: 10 },
      observedInput: { kind: 'from_usage' },
    })
    expect(
      ExactDecimal.from(state.read().usage.input_tokens as number).compare(ExactDecimal.from(30)),
    ).toBe(0)
  })
  it('repeated cumulative not added; conflicting input preserves prior facts but invalidates observation', () => {
    const state = createReadFactsAccumulator(() => {}, false)
    state.observe({ prompt_tokens: 10, completion_tokens: 3 })
    state.observe({ prompt_tokens: 10, completion_tokens: 3 })
    expect(state.read().observedInput).toMatchObject({ kind: 'upstream_total', tokens: 10 })
    state.observe({ prompt_tokens: 11, completion_tokens: 3 })
    expect(state.read().observedInput).toEqual({
      kind: 'unavailable',
      reason: 'inconsistent_usage',
    })
    expect(state.read().usage.output_tokens).toBe(3)
  })
  it('response-cache zero differs from an independently known actual input zero', () => {
    const hit = createReadFactsAccumulator(() => {}, true),
      fresh = createReadFactsAccumulator(() => {}, false)
    hit.observe({ prompt_tokens: 0 })
    fresh.observe({ prompt_tokens: 0 })
    expect(hit.read().observedInput).toEqual({ kind: 'unavailable', reason: 'response_cache' })
    expect(fresh.read().observedInput).toMatchObject({ kind: 'upstream_total', tokens: 0 })
    expect(createReadFactsAccumulator(() => {}, false).read().observedInput).toEqual({
      kind: 'unavailable',
      reason: 'missing_usage',
    })
  })
})

describe('real selected Anthropic tokenizer work', () => {
  it('never sends million-token stable history back into the tokenizer after re-anchor', async () => {
    const { Tiktoken } = await import('js-tiktoken/lite')
    const spy = vi.spyOn(Tiktoken.prototype, 'encode')
    try {
      const definition = anthropicDefinitions[0]!,
        meter = createAnthropicInputMeter(definition),
        original = input()
      // Offline workload only: a raised test admission cap avoids pretending this 1M input
      // is supported by the official 872k input budget. No network is involved.
      const history = 'history '.repeat(1_000_000)
      let request: PlanInput = {
        ...original,
        routeName: definition.modelId,
        provider: 'anthropic',
        parameters: { maxOutputTokens: 128 },
        messages: [message('system', 'instruction'), message('user', history, 'huge')],
        snapshot: {
          ...original.snapshot,
          ...definition.capabilities,
          maxInputTokens: 2_000_000,
          providers: ['anthropic'],
          adaptation: {
            implementation: definition.implementation,
            definition: { modelId: definition.modelId, revision: definition.revision },
            configuration: {
              revision: 'offline-benchmark-cap',
              values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
            },
          },
        },
      }
      let previous = plan(request, [definition], meter)
      const count = Number(previous.measurement.predictedInput)
      expect(count).toBeGreaterThanOrEqual(1_000_000)
      expect(count).toBeLessThan(1_010_000)
      expect(spy.mock.calls.some(call => call[0].includes(history))).toBe(true)
      spy.mockClear()
      for (let i = 0; i < 2; i++) {
        request = {
          ...request,
          calibration: anchor(previous, count + i * 20),
          messages: [...request.messages, message('user', `new ${i}`, `tiny-${i}`)],
        }
        previous = plan(request, [definition], meter)
        expect(previous.measurement.mode).toBe('marginal')
      }
      expect(spy.mock.calls.length).toBeGreaterThan(0)
      expect(
        spy.mock.calls.every(call => call[0].length < 1000 && !call[0].includes('history ')),
      ).toBe(true)
    } finally {
      spy.mockRestore()
    }
  }, 30000)
})
