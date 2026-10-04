import { testImagePreparerFor } from './image-transport-support.ts'
import { describe, expect, it, vi } from 'vitest'
import type { Message } from '@omne-harness-lite/messages'
import type { PlanCalibration, PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import type {PlanInput} from '@omne-harness-lite/model-request-runtime'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { projectInput, projectOutput } from '../src/projection.ts'
import {planRequest} from '../src/plan.ts'
import {type PlannedRequest} from '@omne-harness-lite/model-request-runtime'
import { measureFull, measureNew, measureReplay } from '../src/input-meter.ts'
import { type FullMeterInput, type NewMeterInput, type ReplayMeterInput } from '@omne-harness-lite/model-request-runtime'
import { at, input, judgedMessage, message } from './support.ts'
import { testDefinitions } from './definitions.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'

const definition = testDefinitions[0]
if (!definition) throw new Error('missing fixture definition')
const base = syntheticInputMeter(definition, 'openai')
const unknownUsage = {
  input_tokens: 'unknown',
  output_tokens: 19,
  cache_read_tokens: 'unknown',
  cache_write_tokens: 'unknown',
  source: 'upstream',
} as const

function assistant(id: string, text = id): Message {
  return judgedMessage({
    id,
    type: 'assistant',
    response: `${id}-response`,
    ending: 'complete',
    createdAt: at,
    blocks: [
      {
        id: `${id}-block`,
        kind: 'text',
        text,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
}

async function planned(request: PlanInput): Promise<PlannedRequest> {
  const result = await planRequest(
    request,
    testDefinitions,
    base,
    {
      signal: new AbortController().signal,
    },
    testImagePreparerFor(planRequest),
  )
  if (!('planned' in result)) throw new Error(JSON.stringify(result))
  return result.planned
}

function group(
  source: PlannedRequest,
  outputBlocks: PlanOutputHistoryGroup['outputBlocks'],
  targets: readonly { sourceBlockIndex: number; messageIndex: number; blockIndex: number }[],
  tokens: number | undefined,
): PlanOutputHistoryGroup {
  const projected = projectOutput({
    blocks: outputBlocks,
    source: 'reply',
    completeness: 'complete',
  })
  if (!('projected' in projected)) throw new Error('fixture output projection rejected')
  return {
    inputCalibration: {
      requestInput: source.requestInput,
      observedInput:
        tokens === undefined
          ? { kind: 'unavailable', reason: 'missing_usage' }
          : {
              kind: 'upstream_total',
              tokens,
              provenance: {
                adapterRevision: 'openrouter-usage-reader/2',
                fieldPaths: ['usage.prompt_tokens'],
              },
            },
      outputGroup: projected.projected,
    },
    usage: unknownUsage,
    outputBlocks,
    replaySelection: targets,
    origin: {
      adaptation: source.input.snapshot.adaptation,
      provider: source.input.provider,
      parameters: source.parameters,
    },
  }
}

function observation(source: PlanOutputHistoryGroup): PlanCalibration {
  return {
    kind: 'observation',
    inputCalibration: source.inputCalibration,
    usage: source.usage,
    outputBlocks: source.outputBlocks,
    replaySelection: source.replaySelection,
  }
}

async function historyFixture() {
  const first = await planned(input())
  const groups: PlanOutputHistoryGroup[] = []
  const messages: Message[] = [...input().messages]
  const boundaries: number[] = []
  for (let index = 0; index < 3; index++) {
    const source =
      index === 0 ? first : await planned({ ...input(), messages, outputHistory: groups })
    boundaries.push(messages.length)
    const reply = assistant(`history-${index}`)
    const position = messages.length
    messages.push(reply, message('user', `after-${index}`, `after-${index}`))
    groups.push(
      group(
        source,
        reply.blocks,
        [{ sourceBlockIndex: 0, messageIndex: position, blockIndex: 0 }],
        100 + index * 100,
      ),
    )
  }
  return { groups, messages, boundaries }
}

function groupName(value: PlanOutputHistoryGroup): string {
  const first = value.outputBlocks[0]
  if (!first) throw new Error('fixture group without a block')
  return first.id
}

describe('independent output-history coverage oracle', () => {
  it('enumerates three anchor positions and assigns each selected group to P, G or N once', async () => {
    const { groups, messages, boundaries } = await historyFixture()
    for (let groupCount = 1; groupCount <= groups.length; groupCount++) {
      const selectedGroups = groups.slice(0, groupCount)
      const selectedMessages = messages.slice(0, groupCount * 2 + 3)
      for (let anchor = 0; anchor < selectedGroups.length; anchor++) {
        const full = vi.fn(base.measureFull)
        const replay = vi.fn((value: ReplayMeterInput) => ({
          kind: 'exact' as const,
          tokens: value.units.length + 11 * value.outputHistory.length,
        }))
        const fresh = vi.fn((value: NewMeterInput) => ({
          kind: 'estimated' as const,
          tokens: value.units.length + 13 * value.outputHistory.length,
        }))
        const meter = { ...base, measureFull: full, measureReplay: replay, measureNew: fresh }
        const request: PlanInput = {
          ...input(),
          messages: selectedMessages,
          outputHistory: selectedGroups,
          calibration: observation(selectedGroups[anchor]!),
        }
        const result = await planRequest(
          request,
          testDefinitions,
          meter,
          {
            signal: new AbortController().signal,
          },
          testImagePreparerFor(planRequest),
        )
        expect('planned' in result, JSON.stringify(result)).toBe(true)
        if (!('planned' in result)) continue
        expect(result.planned.measurement.mode).toBe('marginal')
        expect(full).not.toHaveBeenCalled()
        expect(replay).toHaveBeenCalledOnce()
        expect(fresh).toHaveBeenCalledOnce()
        const replayInput = replay.mock.calls[0]![0]
        const newInput = fresh.mock.calls[0]![0]
        const boundary = boundaries[anchor]!
        // The oracle uses the fixture's source order and selected targets, not
        // the planner's region classifier or returned measurement as authority.
        expect(replayInput.outputHistory.map(groupName)).toEqual([
          groupName(selectedGroups[anchor]!),
        ])
        expect(newInput.outputHistory.map(groupName)).toEqual(
          selectedGroups.slice(anchor + 1).map(groupName),
        )
        expect(replayInput.unitIndices).toEqual([boundary])
        expect(replayInput.selectionSpans).toEqual([
          { selectionIndex: 0, start: boundary, end: boundary + 1 },
        ])
        const suffix = Array.from(
          { length: selectedMessages.length - boundary },
          (_, i) => boundary + i,
        )
        expect([...replayInput.unitIndices, ...newInput.unitIndices].sort((a, b) => a - b)).toEqual(
          suffix,
        )
        expect(newInput.unitIndices.every(index => index > boundary)).toBe(true)
        expect(newInput.historySpans.map(span => span.groupIndex)).toEqual(
          selectedGroups.slice(anchor + 1).map((_, i) => i),
        )
        const expected =
          100 +
          anchor * 100 +
          (1 + 11) +
          (selectedMessages.length - boundary - 1 + 13 * (selectedGroups.length - anchor - 1))
        expect(
          ExactDecimal.from(result.planned.measurement.predictedInput).compare(
            ExactDecimal.from(expected),
          ),
        ).toBe(0)
        expect(result.planned.serialized).toContain('history-0')
        expect(result.planned.serialized).toContain(`history-${groupCount - 1}`)
      }
    }
  })

  it('rejects every duplicate source target across one or two groups before any meter call', async () => {
    const { groups, messages } = await historyFixture()
    const full = vi.fn(base.measureFull)
    const meter = { ...base, measureFull: full }
    for (let groupCount = 1; groupCount <= 3; groupCount++) {
      const selectedGroups = groups.slice(0, groupCount)
      const selectedMessages = messages.slice(0, groupCount * 2 + 3)
      for (let duplicated = 0; duplicated < groupCount; duplicated++) {
        const current = selectedGroups[duplicated]!
        const sameGroup = selectedGroups.map((item, index) =>
          index === duplicated
            ? { ...item, replaySelection: [...item.replaySelection, item.replaySelection[0]!] }
            : item,
        )
        expect(
          await planRequest(
            { ...input(), messages: selectedMessages, outputHistory: sameGroup },
            testDefinitions,
            meter,
            { signal: new AbortController().signal },
            testImagePreparerFor(planRequest),
          ),
        ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
        if (groupCount > 1) {
          const other = duplicated === 0 ? 1 : 0
          const crossGroup = selectedGroups.map((item, index) =>
            index === other ? { ...item, replaySelection: current.replaySelection } : item,
          )
          expect(
            await planRequest(
              { ...input(), messages: selectedMessages, outputHistory: crossGroup },
              testDefinitions,
              meter,
              { signal: new AbortController().signal },
              testImagePreparerFor(planRequest),
            ),
          ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
        }
      }
    }
    expect(full).not.toHaveBeenCalled()
  })

  it('delivers every legal O group to full when there is no accurate I', async () => {
    const { groups, messages } = await historyFixture()
    const history = groups.map((value, index) =>
      index === 1
        ? {
            ...value,
            inputCalibration: {
              ...value.inputCalibration,
              observedInput: { kind: 'unavailable' as const, reason: 'missing_usage' as const },
            },
          }
        : value,
    )
    const full = vi.fn((value: FullMeterInput) => ({
      kind: 'estimated' as const,
      tokens: value.projection.units.length + 17 * value.outputHistory.length,
    }))
    const result = await planRequest(
      { ...input(), messages, outputHistory: history },
      testDefinitions,
      {
        ...base,
        measureFull: full,
      },
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    expect('planned' in result, JSON.stringify(result)).toBe(true)
    if (!('planned' in result)) return
    expect(result.planned.measurement.mode).toBe('full')
    expect(full).toHaveBeenCalledOnce()
    expect(full.mock.calls[0]![0].outputHistory.map(groupName)).toEqual(groups.map(groupName))
    expect(full.mock.calls[0]![0].outputHistory[1]?.inputCalibration.observedInput.kind).toBe(
      'unavailable',
    )
    expect(result.planned.measurement.predictedInput).toBe(messages.length + 17 * groups.length)
  })

  it('does not allocate one aggregate across P and N after a legal partial selection', async () => {
    const source = await planned(input())
    const first = assistant('split-1')
    const second = assistant('split-2')
    const before = [...input().messages, first, message('user', 'between', 'between')]
    const anchorSource = await planned({ ...input(), messages: before })
    const anchorReply = assistant('anchor')
    const selected = [...before, second, anchorReply, message('user', 'last', 'last')]
    const split = group(
      source,
      [first.blocks[0]!, second.blocks[0]!],
      [
        { sourceBlockIndex: 0, messageIndex: 3, blockIndex: 0 },
        { sourceBlockIndex: 1, messageIndex: 5, blockIndex: 0 },
      ],
      80,
    )
    const anchor = group(
      anchorSource,
      anchorReply.blocks,
      [{ sourceBlockIndex: 0, messageIndex: 6, blockIndex: 0 }],
      140,
    )
    const full = vi.fn(base.measureFull)
    const replay = vi.fn(() => ({ kind: 'exact' as const, tokens: 7 }))
    const fresh = vi.fn(() => ({ kind: 'exact' as const, tokens: 9 }))
    const result = await planRequest(
      {
        ...input(),
        messages: selected,
        calibration: observation(anchor),
        outputHistory: [split, anchor],
      },
      testDefinitions,
      { ...base, measureFull: full, measureReplay: replay, measureNew: fresh },
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    expect('planned' in result, JSON.stringify(result)).toBe(true)
    if (!('planned' in result)) return
    expect(result.planned.measurement.mode).toBe('full')
    expect(full).toHaveBeenCalledOnce()
    expect(full.mock.calls[0]![0].outputHistory.map(groupName)).toEqual([
      groupName(split),
      groupName(anchor),
    ])
    expect(replay).not.toHaveBeenCalled()
    expect(fresh).not.toHaveBeenCalled()
  })

  it('independent replay rejects an original route that contradicts the observed request', async () => {
    const source = await planned(input())
    const reply = assistant('route-guard')
    const original = group(
      source,
      reply.blocks,
      [{ sourceBlockIndex: 0, messageIndex: 3, blockIndex: 0 }],
      100,
    )
    const current: PlanInput = { ...input(), messages: [...input().messages, reply] }
    const projected = await planned(current)
    const projection = projectInput(projected.body, current, base)
    const meter = {
      ...base,
      measureFull: vi.fn(() => ({ kind: 'estimated' as const, tokens: 19 })),
      measureReplay: vi.fn(() => ({ kind: 'estimated' as const, tokens: 19 })),
      measureNew: vi.fn(() => ({ kind: 'estimated' as const, tokens: 19 })),
    }
    const replay: ReplayMeterInput = {
      countingBasis: projection.requestInput.countingBasis,
      units: [projection.units[3]!],
      envelope: projection.envelope,
      precedingUnitCount: 3,
      unitIndices: [3],
      observation: observation(original) as Extract<PlanCalibration, { kind: 'observation' }>,
      outputHistory: [original],
      selectionSpans: [{ selectionIndex: 0, start: 3, end: 4 }],
    }
    expect(measureReplay(meter, replay)).toEqual({ kind: 'estimated', tokens: 19 })
    const full: FullMeterInput = {
      body: projected.body,
      serialized: projected.serialized,
      projection,
      outputHistory: [original],
      historySpans: [{ groupIndex: 0, selectionIndex: 0, start: 3, end: 4 }],
    }
    const fresh: NewMeterInput = {
      units: [projection.units[3]!],
      envelope: projection.envelope,
      precedingUnitCount: 3,
      unitIndices: [3],
      countingBasis: projection.requestInput.countingBasis,
      outputHistory: [original],
      historySpans: [{ groupIndex: 0, selectionIndex: 0, start: 3, end: 4 }],
    }
    expect(measureFull(meter, full)).toEqual({ kind: 'estimated', tokens: 19 })
    expect(measureNew(meter, fresh)).toEqual({ kind: 'estimated', tokens: 19 })
    meter.measureReplay.mockClear()
    meter.measureFull.mockClear()
    meter.measureNew.mockClear()
    const contradicted = {
      ...original,
      origin: { ...original.origin, provider: 'different-provider' },
    }
    expect(measureReplay(meter, { ...replay, outputHistory: [contradicted] })).toEqual({
      kind: 'invalidInput',
    })
    expect(measureFull(meter, { ...full, outputHistory: [contradicted] })).toEqual({
      kind: 'unavailable',
    })
    expect(measureNew(meter, { ...fresh, outputHistory: [contradicted] })).toEqual({
      kind: 'invalidInput',
    })
    expect(meter.measureReplay).not.toHaveBeenCalled()
    expect(meter.measureFull).not.toHaveBeenCalled()
    expect(meter.measureNew).not.toHaveBeenCalled()
  })

  it('an encrypted output aggregate cannot cross an unsupported tokenizer basis', async () => {
    const selected = openaiDefinitions.find(value => value.modelId === 'openai/gpt-5.6-sol')
    if (!selected) throw new Error('missing frozen GPT-5.6 Sol definition')
    const profile = createOfficialProfileContent(selected, {
      providers: ['openai'],
      allowFallback: false,
      configuration: openaiConfiguration,
    })
    if ('rejected' in profile) throw new Error(profile.rejected)
    const meter = createOpenAiInputMeter(selected)
    const ordinary = input()
    const sourceInput: PlanInput = {
      ...ordinary,
      routeName: selected.modelId,
      snapshot: {
        ...ordinary.snapshot,
        adaptation: profile.ok.adaptation,
        providers: profile.ok.providers,
        allowFallback: profile.ok.allowFallback,
        inputModalities: profile.ok.inputModalities,
        outputModalities: profile.ok.outputModalities,
        maxInputTokens: profile.ok.maxInputTokens,
        maxOutputTokens: profile.ok.maxOutputTokens,
        inputConstraints: profile.ok.inputConstraints,
        upstreamInputLimits: profile.ok.upstreamInputLimits,
      },
    }
    const sourceResult = await planRequest(
      sourceInput,
      [selected],
      meter,
      {
        signal: new AbortController().signal,
      },
      testImagePreparerFor(planRequest),
    )
    if (!('planned' in sourceResult)) throw new Error(JSON.stringify(sourceResult))
    const source = sourceResult.planned
    const details = [
      {
        type: 'reasoning.encrypted',
        format: 'openai-responses-v1',
        data: 'opaque-fixture-only',
      },
    ]
    const encrypted = judgedMessage({
      id: 'encrypted-output',
      type: 'assistant',
      response: 'encrypted-response',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'encrypted-block',
          kind: 'thinking',
          text: '',
          opaque: { routeName: selected.modelId, reasoning_details: details },
          visibility: { toHuman: false, toModel: true },
        },
      ],
    })
    const original = group(
      source,
      encrypted.blocks,
      [{ sourceBlockIndex: 0, messageIndex: 3, blockIndex: 0 }],
      100,
    )
    const projection = projectInput(source.body, sourceInput, meter)
    const replay: ReplayMeterInput = {
      countingBasis: projection.requestInput.countingBasis,
      units: [{ role: 'assistant', content: '', reasoning_details: details }],
      envelope: projection.envelope,
      precedingUnitCount: 3,
      unitIndices: [3],
      observation: observation(original) as Extract<PlanCalibration, { kind: 'observation' }>,
      outputHistory: [original],
      selectionSpans: [{ selectionIndex: 0, start: 3, end: 4 }],
    }
    expect(meter.measureReplay(replay)).toEqual({ kind: 'estimated', tokens: 19 })
    if (original.inputCalibration.requestInput.kind !== 'known')
      throw new Error('source plan lost known request input')
    const incompatible: PlanOutputHistoryGroup = {
      ...original,
      inputCalibration: {
        ...original.inputCalibration,
        requestInput: {
          ...original.inputCalibration.requestInput,
          countingBasis: {
            ...original.inputCalibration.requestInput.countingBasis,
            tokenizerRevision: 'different-tokenizer-without-conversion-proof',
          },
        },
      },
    }
    expect(
      meter.measureReplay({
        ...replay,
        observation: observation(incompatible) as Extract<PlanCalibration, { kind: 'observation' }>,
        outputHistory: [incompatible],
      }),
    ).toEqual({ kind: 'unavailable' })
  })
})
