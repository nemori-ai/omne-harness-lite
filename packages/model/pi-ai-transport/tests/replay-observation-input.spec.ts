import { testImagePreparerFor } from './image-transport-support.ts'
import { describe, expect, it, vi } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { PlanCalibration } from '@omne-harness-lite/model-request-runtime'
import type {PlanInput} from '@omne-harness-lite/model-request-runtime'
import { planRequest, projectOutput } from '../src/index.ts'
import { type PlannedRequest } from '@omne-harness-lite/model-request-runtime'
import { type InputMeter, type ReplayMeterInput } from '@omne-harness-lite/model-request-runtime'
import { input, message, judgedMessage, at } from './support.ts'
import { testDefinitions } from './definitions.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'

const stable = 'STABLE-PREFIX-MUST-NOT-REACH-MARGINAL-TOKENIZER'
const blocks = judgedMessage({
  type: 'assistant',
  id: 'a',
  response: 'r',
  ending: 'complete',
  createdAt: at,
  blocks: [
    { id: 'b0', kind: 'text', text: 'first', visibility: { toModel: true, toHuman: true } },
    { id: 'b1', kind: 'text', text: 'second', visibility: { toModel: true, toHuman: true } },
  ],
}).blocks
const usage = {
  input_tokens: 80,
  cache_read_tokens: 17,
  cache_write_tokens: 3,
  output_tokens: 13,
  reasoning_tokens: 8,
  source: 'upstream' as const,
}
async function mustPlan(request: PlanInput, meter: InputMeter): Promise<PlannedRequest> {
  const result = await planRequest(
    request,
    testDefinitions,
    meter,
    {
      signal: new AbortController().signal,
    },
    testImagePreparerFor(planRequest),
  )
  if (!('planned' in result)) throw Error(writeJsonLossless(result))
  return result.planned
}
function assistant(selected: readonly number[], id = 'answer') {
  return judgedMessage({
    type: 'assistant',
    id,
    response: `response-${id}`,
    ending: 'complete',
    createdAt: at,
    blocks: selected.map(index => blocks[index]),
  })
}
async function setup() {
  const base = syntheticInputMeter(testDefinitions[0]!, 'openai')
  const full = vi.fn(base.measureFull)
  const replay = vi.fn((_arg: ReplayMeterInput) => ({ kind: 'estimated' as const, tokens: 7 }))
  const fresh = vi.fn((_arg: Parameters<InputMeter['measureNew']>[0]) => ({
    kind: 'estimated' as const,
    tokens: 3,
  }))
  const meter: InputMeter = { ...base, measureFull: full, measureReplay: replay, measureNew: fresh }
  const original = { ...input(), messages: [message('user', stable)] }
  const first = await mustPlan(original, meter)
  const output = projectOutput({ blocks, source: 'reply', completeness: 'complete' })
  if (!('projected' in output)) throw Error('output projection required')
  const observation: Extract<PlanCalibration, { kind: 'observation' }> = {
    kind: 'observation',
    inputCalibration: {
      requestInput: first.requestInput,
      observedInput: {
        kind: 'from_usage',
        provenance: {
          adapterRevision: 'openrouter-usage-reader/2',
          fieldPaths: [
            'usage.prompt_tokens',
            'usage.prompt_tokens_details.cached_tokens',
            'usage.prompt_tokens_details.cache_write_tokens',
          ],
          upstreamRequestId: 'same-response',
          upstreamModel: original.routeName,
          servingProvider: 'OpenAI',
        },
      },
      outputGroup: output.projected,
    },
    usage,
    outputBlocks: blocks,
    replaySelection: [
      { sourceBlockIndex: 0, messageIndex: 1, blockIndex: 0 },
      { sourceBlockIndex: 1, messageIndex: 1, blockIndex: 1 },
    ],
  }
  const request: PlanInput = {
    ...original,
    calibration: observation,
    messages: [...original.messages, assistant([0, 1]), message('user', 'new input', 'next')],
    tokenMargin: { multiplier: 1.1, reserveTokens: 7 },
  }
  return { meter, full, replay, fresh, request, observation, first }
}
function assertDeepFrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) assertDeepFrozen(child)
}
function sourceOrder(arg: ReplayMeterInput): number[] {
  // A controlled consumer inspects actual target order, independently of selection-array order.
  return [...arg.observation.replaySelection]
    .sort((a, b) => a.messageIndex - b.messageIndex || a.blockIndex - b.blockIndex)
    .map(selected => selected.sourceBlockIndex)
}

describe('explicit original observation in the replay meter input', () => {
  it('actual planner owns/deep-freezes same-response facts, G and mapping; I + phi + delta applies margin once', async () => {
    const f = await setup()
    const caller = JSON.parse(writeJsonLossless(f.request)) as PlanInput
    if (caller.calibration.kind !== 'observation') throw Error('source required')
    const raw = caller.calibration
    f.replay.mockImplementation(arg => {
      assertDeepFrozen(arg)
      expect(arg.observation).not.toBe(raw)
      expect(arg.observation.usage).not.toBe(raw.usage)
      expect(arg.observation.outputBlocks[0]).not.toBe(raw.outputBlocks[0])
      expect(arg.observation.inputCalibration).toEqual(f.observation.inputCalibration)
      expect(arg.observation.usage).toEqual(usage)
      expect(arg.observation.outputBlocks).toEqual(blocks)
      expect(arg.unitIndices).toEqual([1])
      expect(arg.selectionSpans).toEqual([
        { selectionIndex: 0, start: 1, end: 2 },
        { selectionIndex: 1, start: 1, end: 2 },
      ])
      expect(sourceOrder(arg)).toEqual([0, 1])
      expect(Reflect.set(arg.observation.usage, 'output_tokens', 999)).toBe(false)
      expect(Reflect.set(arg.unitIndices, 0, 99)).toBe(false)
      expect(Reflect.set(raw.usage, 'output_tokens', 999)).toBe(true)
      expect(Reflect.set(raw.outputBlocks[0]!, 'text', 'caller mutation')).toBe(true)
      expect(Reflect.set(caller.messages[1]!.blocks[0]!, 'text', 'target mutation')).toBe(true)
      return { kind: 'estimated', tokens: 7 }
    })
    const next = await mustPlan(caller, f.meter)
    expect(next.measurement).toMatchObject({ mode: 'marginal' })
    expect(ExactDecimal.from(next.measurement.predictedInput).compare(ExactDecimal.from(110))).toBe(
      0,
    )
    expect(
      ExactDecimal.from(next.measurement.admissionTokens).compare(ExactDecimal.from(128)),
    ).toBe(0)
    expect(f.full).toHaveBeenCalledTimes(1)
    expect(f.replay).toHaveBeenCalledTimes(1)
    expect(f.fresh).toHaveBeenCalledTimes(1)
    const replay = f.replay.mock.calls[0]![0]
    const fresh = f.fresh.mock.calls[0]![0]
    expect(writeJsonLossless(replay)).not.toContain(stable)
    expect(writeJsonLossless(fresh)).not.toContain(stable)
    expect(writeJsonLossless(replay.units)).not.toContain('caller mutation')
    expect(writeJsonLossless(replay.units)).not.toContain('target mutation')
    expect(replay.observation.usage.output_tokens).toBe(13)
    expect(replay.observation.usage.reasoning_tokens).toBe(8)
    expect(next.serialized).not.toContain('caller mutation')
    expect(next.serialized).not.toContain('target mutation')
    expect('observation' in fresh).toBe(false)
    expect('selectionSpans' in fresh).toBe(false)
  })

  it('selection-array order does not claim actual output order', async () => {
    const f = await setup()
    const next = await mustPlan(
      {
        ...f.request,
        calibration: {
          ...f.observation,
          replaySelection: [...f.observation.replaySelection].reverse(),
        },
      },
      f.meter,
    )
    expect(next.measurement.mode).toBe('marginal')
    const arg = f.replay.mock.calls[0]![0]
    expect(arg.observation.replaySelection.map(s => s.sourceBlockIndex)).toEqual([1, 0])
    expect(sourceOrder(arg)).toEqual([0, 1])
    expect(arg.selectionSpans.map(s => s.selectionIndex)).toEqual([0, 1])
  })

  it('preserves delivered/partial group and unknown original output usage without filling facts', async () => {
    const f = await setup()
    const originalGroup = f.observation.inputCalibration.outputGroup
    if (originalGroup.kind !== 'known') throw Error('group required')
    const { reasoning_tokens: _reasoning, ...withoutReasoning } = usage
    const calibration: typeof f.observation = {
      ...f.observation,
      usage: { ...withoutReasoning, output_tokens: 'unknown' },
      inputCalibration: {
        ...f.observation.inputCalibration,
        outputGroup: { ...originalGroup, source: 'delivered', completeness: 'partial' },
      },
    }
    const replay = vi.fn((arg: ReplayMeterInput) => {
      expect(arg.observation.usage.output_tokens).toBe('unknown')
      expect('reasoning_tokens' in arg.observation.usage).toBe(false)
      expect(arg.observation.inputCalibration.outputGroup).toMatchObject({
        source: 'delivered',
        completeness: 'partial',
        usageRef: 'usage',
      })
      return { kind: 'unavailable' as const }
    })
    expect(
      (await mustPlan({ ...f.request, calibration }, { ...f.meter, measureReplay: replay }))
        .measurement.mode,
    ).toBe('full')
    expect(replay).toHaveBeenCalledTimes(1)
  })

  for (const kind of ['partial', 'duplicate', 'reordered'] as const) {
    it(`${kind} G stays distinguishable; a consumer without that mapping falls back instead of applying aggregate O`, async () => {
      const f = await setup()
      const selected = kind === 'partial' ? [1] : kind === 'reordered' ? [1, 0] : [0, 1, 0]
      const replayMessages = selected.map((source, index) => assistant([source], `target-${index}`))
      const request = {
        ...f.request,
        messages: [f.request.messages[0]!, ...replayMessages, message('user', 'next', 'next')],
        calibration: {
          ...f.observation,
          replaySelection: selected.map((source, index) => ({
            sourceBlockIndex: source,
            messageIndex: index + 1,
            blockIndex: 0,
          })),
        },
      }
      const spy = vi.fn((arg: ReplayMeterInput) => {
        expect(sourceOrder(arg)).toEqual(selected)
        expect(arg.observation.outputBlocks).toHaveLength(2)
        expect(arg.unitIndices).toEqual(selected.map((_v, i) => i + 1))
        expect(arg.selectionSpans).toEqual(
          selected.map((_v, i) => ({ selectionIndex: i, start: i + 1, end: i + 2 })),
        )
        return { kind: 'unavailable' as const }
      })
      const next = await mustPlan(request, { ...f.meter, measureReplay: spy })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(next.measurement.mode).toBe('full')
    })
  }

  it('a changed original output block is rejected before any meter receives source facts', async () => {
    const f = await setup()
    const altered = {
      ...f.observation,
      outputBlocks: [{ ...blocks[0]!, text: 'forged original' }, blocks[1]!],
    }
    expect(
      await planRequest(
        { ...f.request, calibration: altered },
        testDefinitions,
        f.meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      ),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
    expect(f.replay).not.toHaveBeenCalled()
    expect(f.full).toHaveBeenCalledTimes(1)
  })

  it('duplicate target ownership is invalid input; target mutation or uncovered merged units never reach phi', async () => {
    const f = await setup()
    expect(
      await planRequest(
        {
          ...f.request,
          calibration: {
            ...f.observation,
            replaySelection: [f.observation.replaySelection[0]!, f.observation.replaySelection[0]!],
          },
        },
        testDefinitions,
        f.meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    const changed = judgedMessage({
      ...f.request.messages[1],
      blocks: [{ ...blocks[0], text: 'changed target' }, blocks[1]],
    })
    expect(
      (
        await mustPlan(
          { ...f.request, messages: [f.request.messages[0]!, changed, f.request.messages[2]!] },
          f.meter,
        )
      ).measurement.mode,
    ).toBe('full')
    expect(
      (
        await mustPlan(
          {
            ...f.request,
            calibration: {
              ...f.observation,
              replaySelection: [f.observation.replaySelection[0]!],
            },
          },
          f.meter,
        )
      ).measurement.mode,
    ).toBe('full')
    expect(f.replay).not.toHaveBeenCalled()
  })

  it('inconsistent original input usage and output provenance cannot reach phi', async () => {
    const f = await setup()
    const inconsistent = { ...f.observation, usage: { ...usage, input_tokens: 'unknown' as const } }
    expect(
      await planRequest(
        { ...f.request, calibration: inconsistent },
        testDefinitions,
        f.meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      ),
    ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    const original = f.observation.inputCalibration.observedInput
    if (original.kind === 'unavailable') throw Error('known source required')
    const wrongProvider = {
      ...f.observation,
      inputCalibration: {
        ...f.observation.inputCalibration,
        observedInput: {
          ...original,
          provenance: { ...original.provenance, servingProvider: 'another-provider' },
        },
      },
    }
    expect(
      (await mustPlan({ ...f.request, calibration: wrongProvider }, f.meter)).measurement,
    ).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
    expect(f.replay).not.toHaveBeenCalled()
  })
})
