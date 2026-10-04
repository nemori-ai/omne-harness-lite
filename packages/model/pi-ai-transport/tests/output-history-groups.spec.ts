import { testImagePreparerFor } from './image-transport-support.ts'
import { describe, expect, it, vi } from 'vitest'
import type { Message } from '@omne-harness-lite/messages'
import type {PlanInput} from '@omne-harness-lite/model-request-runtime'
import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { NewMeterInput, ReplayMeterInput } from '@omne-harness-lite/model-request-runtime'
import { measureFull, measureNew, measureReplay } from '../src/input-meter.ts'
import { projectInput } from '../src/projection.ts'
import { projectOutput } from '../src/projection.ts'
import {planRequest} from '../src/plan.ts'
import {type PlannedRequest} from '@omne-harness-lite/model-request-runtime'
import { input, judgedMessage, message, at } from './support.ts'
import { testDefinitions } from './definitions.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'

const definition = testDefinitions[0]
if (!definition) throw new Error('missing fixture definition')
const base = syntheticInputMeter(definition, 'openai')
const unknownUsage = {
  input_tokens: 'unknown',
  output_tokens: 6,
  cache_read_tokens: 'unknown',
  cache_write_tokens: 'unknown',
  source: 'upstream',
} as const

function reply(id: string): Message {
  return judgedMessage({
    id,
    type: 'assistant',
    response: `${id}-response`,
    ending: 'complete',
    createdAt: at,
    blocks: [
      {
        id: `${id}-text`,
        kind: 'text',
        text: `answer ${id}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
}

function group(
  planned: PlannedRequest,
  output: Message,
  messageIndex: number,
  observedTokens?: number,
): PlanOutputHistoryGroup {
  const projected = projectOutput({
    blocks: output.blocks,
    source: 'reply',
    completeness: 'complete',
  })
  if (!('projected' in projected)) throw new Error('output group fixture rejected')
  return {
    inputCalibration: {
      requestInput: planned.requestInput,
      observedInput:
        observedTokens === undefined
          ? { kind: 'unavailable', reason: 'missing_usage' }
          : {
              kind: 'upstream_total',
              tokens: observedTokens,
              provenance: {
                adapterRevision: 'openrouter-usage-reader/2',
                fieldPaths: ['usage.prompt_tokens'],
              },
            },
      outputGroup: projected.projected,
    },
    usage: unknownUsage,
    outputBlocks: output.blocks,
    replaySelection: [{ sourceBlockIndex: 0, messageIndex, blockIndex: 0 }],
    origin: {
      adaptation: planned.input.snapshot.adaptation,
      provider: planned.input.provider,
      parameters: planned.parameters,
    },
  }
}

async function planned(request: PlanInput, meter = base): Promise<PlannedRequest> {
  const result = await planRequest(
    request,
    testDefinitions,
    meter,
    {
      signal: new AbortController().signal,
    },
    testImagePreparerFor(planRequest),
  )
  if (!('planned' in result)) throw new Error(JSON.stringify(result))
  return result.planned
}

function observation(source: PlanOutputHistoryGroup) {
  return {
    kind: 'observation' as const,
    inputCalibration: source.inputCalibration,
    usage: source.usage,
    outputBlocks: source.outputBlocks,
    replaySelection: source.replaySelection,
  }
}

describe('shared output-history coverage', () => {
  it('keeps a no-I group and all older O in full input without changing the wire', async () => {
    const first = await planned(input())
    const a = reply('a')
    const user2 = message('user', 'second', 'u2')
    const aGroup = group(first, a, 3, 100)
    const second = await planned({
      ...input(),
      messages: [...input().messages, a, user2],
      outputHistory: [aGroup],
    })
    const b = reply('b')
    const bGroup = group(second, b, 5)
    const full = vi.fn(base.measureFull)
    const meter = { ...base, measureFull: full }
    const request = {
      ...input(),
      messages: [...input().messages, a, user2, b, message('user', 'third', 'u3')],
      outputHistory: [aGroup, bGroup],
    }
    const result = await planned(request, meter)
    expect(result.measurement.mode).toBe('full')
    expect(full).toHaveBeenCalledOnce()
    expect(full.mock.calls[0]?.[0].outputHistory).toHaveLength(2)
    expect(full.mock.calls[0]?.[0].outputHistory[1]?.inputCalibration.observedInput.kind).toBe(
      'unavailable',
    )
    expect(result.body.messages).toHaveLength(request.messages.length)
    expect(request.outputHistory[1]?.origin.provider).toBe('openai')
  })

  it('assigns P to I, the anchor group to replay, and later O to new only once', async () => {
    const first = await planned(input())
    const a = reply('a')
    const user2 = message('user', 'second', 'u2')
    const aGroup = group(first, a, 3, 100)
    const second = await planned({
      ...input(),
      messages: [...input().messages, a, user2],
      outputHistory: [aGroup],
    })
    const b = reply('b')
    const bGroup = group(second, b, 5)
    const full = vi.fn(base.measureFull)
    const replay = vi.fn((_value: ReplayMeterInput) => ({ kind: 'exact' as const, tokens: 7 }))
    const fresh = vi.fn((_value: NewMeterInput) => ({ kind: 'estimated' as const, tokens: 13 }))
    const meter = { ...base, measureFull: full, measureReplay: replay, measureNew: fresh }
    const request: PlanInput = {
      ...input(),
      calibration: observation(aGroup),
      messages: [...input().messages, a, user2, b, message('user', 'third', 'u3')],
      outputHistory: [aGroup, bGroup],
      tokenMargin: { multiplier: 1.1, reserveTokens: 3 },
    }
    const result = await planned(request, meter)
    expect(result.measurement).toMatchObject({
      mode: 'marginal',
      replayContribution: { tokens: 7 },
      newContribution: { tokens: 13 },
    })
    expect(
      ExactDecimal.from(result.measurement.predictedInput).compare(ExactDecimal.from(120)),
    ).toBe(0)
    expect(
      ExactDecimal.from(result.measurement.admissionTokens).compare(ExactDecimal.from(135)),
    ).toBe(0)
    expect(full).not.toHaveBeenCalled()
    expect(replay).toHaveBeenCalledOnce()
    expect(fresh).toHaveBeenCalledOnce()
    expect(replay.mock.calls[0]?.[0].outputHistory).toEqual([aGroup])
    expect(fresh.mock.calls[0]?.[0].outputHistory).toEqual([bGroup])
    expect(fresh.mock.calls[0]?.[0].historySpans).toHaveLength(1)
    const bAnchored = group(second, b, 5, 200)
    const reanchored = await planned(
      {
        ...request,
        calibration: observation(bAnchored),
        outputHistory: [aGroup, bAnchored],
      },
      meter,
    )
    expect(reanchored.measurement.mode).toBe('marginal')
    expect(replay.mock.calls[1]?.[0].outputHistory).toEqual([bAnchored])
    expect(fresh.mock.calls[1]?.[0].outputHistory).toEqual([])
  })

  it('rejects duplicate targets and known digest errors before any meter runs', async () => {
    const first = await planned(input())
    const a = reply('a')
    const source = group(first, a, 3, 100)
    const full = vi.fn(base.measureFull)
    const replay = vi.fn((_value: ReplayMeterInput) => ({ kind: 'exact' as const, tokens: 1 }))
    const fresh = vi.fn((_value: NewMeterInput) => ({ kind: 'exact' as const, tokens: 1 }))
    const meter = { ...base, measureFull: full, measureReplay: replay, measureNew: fresh }
    const request: PlanInput = {
      ...input(),
      messages: [...input().messages, a, message('user', 'next', 'next')],
      outputHistory: [source],
    }
    const duplicate = { ...source, outputBlocks: source.outputBlocks.map(block => ({ ...block })) }
    const badDigest = {
      ...source,
      inputCalibration: {
        ...source.inputCalibration,
        outputGroup: {
          ...source.inputCalibration.outputGroup,
          blockDigests: ['bad-digest'],
        },
      },
    }
    expect(
      await planRequest(
        { ...request, outputHistory: [source, duplicate] },
        testDefinitions,
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    expect(
      await planRequest(
        { ...request, outputHistory: [badDigest] },
        testDefinitions,
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      ),
    ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    expect(full).not.toHaveBeenCalled()
    expect(replay).not.toHaveBeenCalled()
    expect(fresh).not.toHaveBeenCalled()
  })

  it('classifies malformed standalone full and marginal facts before the model closure', async () => {
    const first = await planned(input())
    const a = reply('a')
    const source = group(first, a, 3, 100)
    const full = vi.fn(base.measureFull)
    const replay = vi.fn((_value: ReplayMeterInput) => ({ kind: 'exact' as const, tokens: 1 }))
    const fresh = vi.fn((_value: NewMeterInput) => ({ kind: 'exact' as const, tokens: 1 }))
    const meter = { ...base, measureFull: full, measureReplay: replay, measureNew: fresh }
    const request: PlanInput = {
      ...input(),
      messages: [...input().messages, a],
      outputHistory: [source],
    }
    const projection = projectInput(
      { messages: [{ role: 'assistant', content: 'answer a' }] },
      request,
      meter,
    )
    const bad = {
      ...source,
      inputCalibration: {
        ...source.inputCalibration,
        outputGroup: {
          ...source.inputCalibration.outputGroup,
          blockDigests: ['corrupt'],
        },
      },
    }
    const historySpans = [{ groupIndex: 0, selectionIndex: 0, start: 0, end: 1 }]
    const body = { messages: [{ role: 'assistant', content: 'answer a' }] }
    const serialized = JSON.stringify(body)
    expect(
      measureFull(meter, { body, serialized, projection, outputHistory: [bad], historySpans }),
    ).toEqual({ kind: 'unavailable' })
    expect(
      measureReplay(meter, {
        countingBasis: projection.requestInput.countingBasis,
        units: projection.units,
        envelope: projection.envelope,
        precedingUnitCount: 0,
        observation: observation(bad),
        outputHistory: [bad],
        unitIndices: [0],
        selectionSpans: [{ selectionIndex: 0, start: 0, end: 1 }],
      }),
    ).toEqual({ kind: 'invalidInput' })
    expect(
      measureNew(meter, {
        units: projection.units,
        envelope: projection.envelope,
        precedingUnitCount: 0,
        unitIndices: [0],
        countingBasis: projection.requestInput.countingBasis,
        outputHistory: [bad],
        historySpans,
      }),
    ).toEqual({ kind: 'invalidInput' })
    expect(full).not.toHaveBeenCalled()
    expect(replay).not.toHaveBeenCalled()
    expect(fresh).not.toHaveBeenCalled()
  })
})
