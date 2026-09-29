import { measureFull, measureNew } from '../src/input-meter.ts'
import { testImagePreparerFor } from './image-transport-support.ts'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { describe, expect, it } from 'vitest'
import { getEncoding } from 'js-tiktoken'
import { writeJsonLossless, toOpaqueJson } from '@omne-harness-lite/content-blocks'
import type { PlanInput, PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import type { Message } from '@omne-harness-lite/messages'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { estimateOpenAi56Replay } from '../src/input-meters/openai-replay.ts'
import type { ReplayMeterInput } from '../src/input-meter.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { planRequest, type PlannedRequest } from '../src/plan.ts'
import { projectInput, projectOutput } from '../src/projection.ts'
import { at, input, judgedMessage, message } from './support.ts'

const ids = ['openai/gpt-5.6-sol', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-luna']
const encoder = getEncoding('o200k_base')
function reply(model: string, id: string): Message {
  return judgedMessage({
    type: 'assistant',
    id,
    response: `${id}-response`,
    ending: 'complete',
    createdAt: at,
    blocks: [
      {
        kind: 'thinking',
        id: `${id}-reason`,
        text: '',
        opaque: toOpaqueJson({
          routeName: model,
          reasoning_details: [
            {
              type: 'reasoning.encrypted',
              data: `CIPHER_${id}`,
              format: 'openai-responses-v1',
              index: 0,
            },
          ],
        }),
        visibility: { toHuman: false, toModel: true },
      },
      {
        kind: 'text',
        id: `${id}-text`,
        text: `Visible ${id}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
}
function group(
  plan: PlannedRequest,
  reply: Message,
  index: number,
  output: number,
  observed?: number,
): PlanOutputHistoryGroup {
  const projected = projectOutput({
    blocks: reply.blocks,
    source: 'reply',
    completeness: 'complete',
  })
  if (!('projected' in projected)) throw Error('fixture projection')
  return {
    inputCalibration: {
      requestInput: plan.requestInput,
      observedInput:
        observed === undefined
          ? { kind: 'unavailable', reason: 'missing_usage' }
          : {
              kind: 'from_usage',
              provenance: {
                adapterRevision: 'openrouter-usage-reader/2',
                fieldPaths: ['usage.prompt_tokens'],
              },
            },
      outputGroup: projected.projected,
    },
    usage: {
      input_tokens: observed ?? 'unknown',
      output_tokens: output,
      cache_read_tokens: observed === undefined ? 'unknown' : 0,
      cache_write_tokens: observed === undefined ? 'unknown' : 0,
      reasoning_tokens: 7,
      source: 'upstream',
    },
    outputBlocks: reply.blocks,
    replaySelection: reply.blocks.map((_, i) => ({
      sourceBlockIndex: i,
      messageIndex: index,
      blockIndex: i,
    })),
    origin: {
      adaptation: plan.input.snapshot.adaptation,
      provider: 'openai',
      parameters: plan.parameters,
      servingProvider: 'OpenAI',
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
describe.each(ids)('%s explicit complete output history', model => {
  const definition = openaiDefinitions.find(d => d.modelId === model)!
  const meter = createOpenAiInputMeter(definition)
  const profile = createOfficialProfileContent(definition, {
    providers: ['openai'],
    allowFallback: false,
    configuration: openaiConfiguration,
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  const resolvedProfile = profile.ok
  function request(): PlanInput {
    const base = input()
    return {
      ...base,
      routeName: model,
      provider: 'openai',
      snapshot: {
        ...base.snapshot,
        ...definition.capabilities,
        adaptation: resolvedProfile.adaptation,
        providers: resolvedProfile.providers,
        allowFallback: false,
      },
      messages: [message('user', 'start', 'u1')],
      tools: [],
      parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      tokenMargin: { multiplier: 1.1, reserveTokens: 7 },
    }
  }
  async function planned(value: PlanInput): Promise<PlannedRequest> {
    const result = await planRequest(
      value,
      [definition],
      meter,
      {
        signal: new AbortController().signal,
      },
      testImagePreparerFor(planRequest),
    )
    if (!('planned' in result)) throw Error(JSON.stringify(result))
    return result.planned
  }
  async function history() {
    const first = await planned(await request()),
      a = reply(model, 'a'),
      ga = group(first, a, 1, 18, 100)
    const second = await planned({
      ...(await request()),
      messages: [...(await request()).messages, a, message('user', 'next', 'u2')],
      outputHistory: [ga],
    })
    const b = reply(model, 'b'),
      gb = group(second, b, 3, 23)
    const value = {
      ...(await request()),
      messages: [
        ...(await request()).messages,
        a,
        message('user', 'next', 'u2'),
        b,
        message('user', 'last', 'u3'),
      ],
      outputHistory: [ga, gb],
    }
    return { value, ga, gb }
  }
  it('owns replay input before inspecting fields and rejects multiple or inconsistent original groups', async () => {
    let getterReads = 0
    const accessor = Object.defineProperty({}, 'outputHistory', {
      enumerable: true,
      get() {
        getterReads++
        return []
      },
    })
    for (const bad of [null, {}, { units: [] }, accessor]) {
      expect(estimateOpenAi56Replay(bad, meter)).toEqual({ kind: 'unavailable' })
      expect(Reflect.apply(meter.measureReplay, undefined, [bad])).toEqual({ kind: 'unavailable' })
    }
    expect(getterReads).toBe(0)
    const { value, ga } = await history()
    let actual: ReplayMeterInput | undefined
    const result = await planRequest(
      { ...value, calibration: observation(ga) },
      [definition],
      {
        ...meter,
        measureReplay(input) {
          actual = input
          return meter.measureReplay(input)
        },
      },
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    expect(result).toHaveProperty('planned')
    if (!actual) throw Error('missing actual replay')
    expect(estimateOpenAi56Replay(actual, meter)).toEqual({ kind: 'estimated', tokens: 18 })
    const original = actual.outputHistory[0]
    if (!original) throw Error('missing original group')
    for (const bad of [
      { ...actual, outputHistory: [original, original] },
      {
        ...actual,
        outputHistory: [{ ...original, usage: { ...original.usage, output_tokens: 999 } }],
      },
    ]) {
      expect(estimateOpenAi56Replay(bad, meter)).toEqual({ kind: 'unavailable' })
      expect(meter.measureReplay(bad)).toEqual({ kind: 'unavailable' })
    }
  })
  it('covers two O groups in full and only N O in marginal with independent numeric oracles', async () => {
    const { value, ga } = await history()
    const full = await planned(value)
    const body = {
      ...full.body,
      messages: (full.body.messages as unknown[]).filter((_, i) => i !== 1 && i !== 3),
    }
    const expected = encoder.encode(writeJsonLossless(body)).length + 18 + 23
    expect(full.measurement).toMatchObject({
      mode: 'full',
      admissionTokens: Math.ceil(expected * 1.1) + 7,
    })
    expect(ExactDecimal.from(full.measurement.predictedInput).toString()).toBe(String(expected))
    expect(writeJsonLossless(full.body)).toContain('CIPHER_a')
    expect(writeJsonLossless(full.body)).toContain('CIPHER_b')
    const marginal = await planned({ ...value, calibration: observation(ga) })
    const { messages: _, tools: __, ...envelope } = marginal.body
    const remaining = (marginal.body.messages as unknown[]).filter((_, i) => i === 2 || i === 4)
    const net =
      encoder.encode(writeJsonLossless({ ...envelope, messages: remaining })).length -
      encoder.encode(writeJsonLossless({ ...envelope, messages: [] })).length +
      23
    expect(marginal.measurement.mode).toBe('marginal')
    if (marginal.measurement.mode !== 'marginal') throw Error('marginal required')
    expect(ExactDecimal.from(marginal.measurement.replayContribution.tokens).toString()).toBe('18')
    expect(ExactDecimal.from(marginal.measurement.newContribution.tokens).toString()).toBe(
      String(net),
    )
    expect(ExactDecimal.from(marginal.measurement.predictedInput).toString()).toBe(
      String(100 + 18 + net),
    )
  })
  it.each([
    {
      definition: '6',
      implementation: 'mp4-12',
      algorithm: 'openai-gpt-5.6-o200k-base-complete-output-6/response-calibration-1',
      replay: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/1',
    },
    {
      definition: '7',
      implementation: 'mp4-16',
      algorithm: 'openai-gpt-5.6-o200k-base-complete-output-history-7/response-calibration-1',
      replay: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2',
    },
    {
      definition: '8',
      implementation: 'mp4-17',
      algorithm: 'openai-gpt-5.6-o200k-base-complete-output-history-7/response-calibration-1',
      replay: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2',
    },
  ])('BR finite original $definition retains O under current preparation semantics', async row => {
    const { value, ga, gb } = await history()
    const source = ga.inputCalibration.requestInput
    if (source.kind !== 'known') throw Error('known source required')
    const binding = {
      ...ga.origin.adaptation,
      definition: { modelId: model, revision: row.definition },
      implementation: { name: 'pi-ai:openai', revision: row.implementation },
    }
    const old: PlanOutputHistoryGroup = {
      ...ga,
      origin: { ...ga.origin, adaptation: binding },
      inputCalibration: {
        ...ga.inputCalibration,
        requestInput: {
          ...source,
          countingBasis: {
            ...source.countingBasis,
            binding,
            meterRevision: row.algorithm,
            replayRevision: row.replay,
          },
        },
      },
    }
    const current = await planned({ ...value, outputHistory: [old, gb] })
    const preparer = testImagePreparerFor(planRequest)
    const descriptor = {
      algorithmRevision: preparer.algorithmRevision,
      codecRevision: preparer.codecRevision,
      policyDigest: preparer.policyDigest,
    }
    const projection = projectInput(current.body, current.input, meter, descriptor)
    const historySpans = [old, gb].flatMap((group, groupIndex) =>
      group.replaySelection.map((item, selectionIndex) => ({
        groupIndex,
        selectionIndex,
        start: item.messageIndex,
        end: item.messageIndex + 1,
      })),
    )
    const full = {
      body: current.body,
      serialized: current.serialized,
      projection,
      outputHistory: [old, gb],
      historySpans,
    }
    expect(measureFull(meter, full)).toEqual({
      kind: current.measurement.precision,
      tokens: current.measurement.predictedInput,
    })
    expect(
      measureNew(meter, {
        units: projection.units,
        envelope: projection.envelope,
        precedingUnitCount: 0,
        unitIndices: projection.units.map((_, i) => i),
        countingBasis: projection.requestInput.countingBasis,
        outputHistory: [old, gb],
        historySpans,
      }).kind,
    ).toBe('estimated')
    const selected = projection.units[1]
    if (selected === undefined) throw Error('selected unit required')
    const replay: ReplayMeterInput = {
      units: [selected],
      envelope: projection.envelope,
      precedingUnitCount: 1,
      unitIndices: [1],
      countingBasis: projection.requestInput.countingBasis,
      observation: observation(old),
      outputHistory: [old],
      selectionSpans: old.replaySelection.map((_, selectionIndex) => ({
        selectionIndex,
        start: 1,
        end: 2,
      })),
    }
    expect(estimateOpenAi56Replay(replay, meter)).toEqual({ kind: 'unavailable' })
    if (row.definition === '8') {
      const same: PlanOutputHistoryGroup = {
        ...old,
        inputCalibration: {
          ...old.inputCalibration,
          requestInput: { ...source, countingBasis: projection.requestInput.countingBasis },
        },
      }
      expect(
        estimateOpenAi56Replay(
          { ...replay, observation: observation(same), outputHistory: [same] },
          meter,
        ),
      ).toEqual({ kind: 'estimated', tokens: 18 })
    }
    const unknown: PlanOutputHistoryGroup = {
      ...old,
      origin: {
        ...old.origin,
        adaptation: { ...binding, definition: { ...binding.definition, revision: 'unlisted' } },
      },
      inputCalibration: {
        ...old.inputCalibration,
        requestInput: {
          ...source,
          countingBasis: {
            ...source.countingBasis,
            binding: { ...binding, definition: { ...binding.definition, revision: 'unlisted' } },
          },
        },
      },
    }
    expect(measureFull(meter, { ...full, outputHistory: [unknown, gb] })).toEqual({
      kind: 'unavailable',
    })
    const originOnly: PlanOutputHistoryGroup = {
      ...old,
      inputCalibration: {
        ...old.inputCalibration,
        requestInput: { kind: 'unavailable', reason: 'not_retained' },
      },
    }
    expect(measureFull(meter, { ...full, outputHistory: [originOnly, gb] }).kind).toBe('estimated')
    expect(writeJsonLossless(full.body)).toContain('CIPHER_a')
  })
  it('uses original origin with unavailable requestInput but never invents missing origin', async () => {
    const { value, gb } = await history()
    const noI: PlanOutputHistoryGroup = {
      ...gb,
      inputCalibration: {
        ...gb.inputCalibration,
        requestInput: { kind: 'unavailable', reason: 'not_retained' },
      },
    }
    expect(
      (await planned({ ...value, outputHistory: [value.outputHistory[0]!, noI] })).measurement.mode,
    ).toBe('full')
    const { origin: _, ...missing } = noI
    expect(
      await planRequest(
        { ...value, outputHistory: [value.outputHistory[0]!, missing as PlanOutputHistoryGroup] },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'malformed' })
  })
  it.each([
    {
      definition: '6',
      implementation: 'mp4-12',
      algorithm: 'openai-gpt-5.6-o200k-base-complete-output-6/response-calibration-1',
      replay: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/1',
    },
    {
      definition: '7',
      implementation: 'mp4-16',
      algorithm: 'openai-gpt-5.6-o200k-base-complete-output-history-7/response-calibration-1',
      replay: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2',
    },
  ])(
    'maps finite original definition $definition without making its factory callable',
    async source => {
      const { value, ga } = await history()
      const original = ga.inputCalibration.requestInput
      if (original.kind !== 'known') throw Error('fixture source')
      const binding = {
        ...ga.origin.adaptation,
        definition: { modelId: model, revision: source.definition },
        implementation: { name: 'pi-ai:openai', revision: source.implementation },
      }
      const old: PlanOutputHistoryGroup = {
        ...ga,
        origin: { ...ga.origin, adaptation: binding },
        inputCalibration: {
          ...ga.inputCalibration,
          requestInput: {
            ...original,
            countingBasis: {
              ...original.countingBasis,
              binding,
              meterRevision: source.algorithm,
              replayRevision: source.replay,
            },
          },
        },
      }
      expect(
        (await planned({ ...value, outputHistory: [old, value.outputHistory[1]!] })).measurement
          .mode,
      ).toBe('full')
      expect(() =>
        createOpenAiInputMeter({
          ...definition,
          revision: source.definition,
          implementation: binding.implementation,
        }),
      ).toThrow()
      const bad = {
        ...old,
        inputCalibration: {
          ...old.inputCalibration,
          requestInput: {
            ...original,
            countingBasis: {
              ...original.countingBasis,
              binding,
              meterRevision: 'invented',
              replayRevision: source.replay,
            },
          },
        },
      }
      expect(
        await planRequest(
          { ...value, outputHistory: [bad, value.outputHistory[1]!] },
          [definition],
          meter,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        ),
      ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
    },
  )
  it('does not turn partial selections, missing O or absent facts into ciphertext estimates', async () => {
    const { value, ga } = await history()
    const partial = { ...ga, replaySelection: ga.replaySelection.slice(0, 1) }
    expect(
      await planRequest(
        { ...value, outputHistory: [partial, value.outputHistory[1]!] },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({ rejected: 'invalidInput' })
    expect(
      await planRequest(
        { ...value, outputHistory: [] },
        [definition],
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_size_unavailable',
    })
    expect(
      await planRequest(
        {
          ...value,
          outputHistory: [
            { ...ga, usage: { ...ga.usage, output_tokens: 'unknown' } },
            value.outputHistory[1]!,
          ],
        },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
    expect(
      await planRequest(
        { ...value, outputHistory: [ga, ga] },
        [definition],
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
    expect(
      await planRequest(
        {
          ...value,
          outputHistory: [
            { ...ga, origin: { ...ga.origin, upstreamModel: 'openai/gpt-6-sol' } },
            value.outputHistory[1]!,
          ],
        },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
  })
  it('never borrows O after a model switch, including Pro and GPT-6 targets', async () => {
    const { value } = await history()
    for (const target of [ids.find(id => id !== model)!, `${model}-pro`, 'openai/gpt-6-sol']) {
      const selected = openaiDefinitions.find(d => d.modelId === target)!
      const supplied = createOfficialProfileContent(selected, {
        providers: ['openai'],
        allowFallback: false,
        configuration: openaiConfiguration,
      })
      if ('rejected' in supplied) throw Error(supplied.rejected)
      const changed: PlanInput = {
        ...value,
        routeName: target,
        snapshot: { ...value.snapshot, adaptation: supplied.ok.adaptation },
      }
      const result = await planRequest(
        changed,
        [selected],
        createOpenAiInputMeter(selected),
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      )
      if ('planned' in result) {
        // Existing cross-model adaptation can omit inapplicable opaque details.
        // Such a visible target must recount, never inherit the source model's O.
        expect(result.planned.measurement.mode).toBe('full')
        expect(result.planned.measurement).not.toHaveProperty('replayContribution')
        expect(result.planned.measurement).not.toHaveProperty('newContribution')
        expect(result.planned.serialized).not.toContain('CIPHER_')
        const noGroups = await planRequest(
          { ...changed, outputHistory: [] },
          [selected],
          createOpenAiInputMeter(selected),
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        )
        if (!('planned' in noGroups)) throw Error(JSON.stringify(noGroups))
        expect(result.planned.measurement.predictedInput).toEqual(
          noGroups.planned.measurement.predictedInput,
        )
      } else {
        expect(result).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
      }
      expect(writeJsonLossless(changed.messages)).toContain('CIPHER_a')
    }
  })
  it('covers text, reasoning and tool calls by O once while counting the paired result normally', async () => {
    const firstInput = {
      ...(await request()),
      tools: [
        {
          name: 'lookup',
          description: 'Lookup',
          parameters: { type: 'object', properties: { key: { type: 'string' } } },
        },
      ],
    }
    const first = await planned(firstInput)
    const output = judgedMessage({
      ...reply(model, 'with-tool'),
      blocks: [
        ...reply(model, 'with-tool').blocks,
        {
          id: 'call-block',
          kind: 'tool_call',
          callId: 'lookup_1',
          tool: 'lookup',
          arguments: { key: 'already-covered-by-O'.repeat(30) },
          complete: true,
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const result = judgedMessage({
      type: 'tool',
      id: 'result-message',
      callId: 'lookup_1',
      createdAt: at,
      blocks: [
        {
          id: 'result-block',
          kind: 'tool_result',
          callId: 'lookup_1',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              id: 'result-text',
              kind: 'text',
              text: 'a new result',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    })
    const current = await planned({
      ...firstInput,
      messages: [...firstInput.messages, output, result],
      outputHistory: [group(first, output, 1, 40)],
    })
    const remaining = {
      ...current.body,
      messages: (current.body.messages as unknown[]).filter((_, index) => index !== 1),
    }
    expect(
      ExactDecimal.from(current.measurement.predictedInput).compare(
        ExactDecimal.from(encoder.encode(writeJsonLossless(remaining)).length + 40),
      ),
    ).toBe(0)
    expect(writeJsonLossless(current.body)).toContain('already-covered-by-O')
    expect(writeJsonLossless(current.body)).toContain('a new result')
  })
})
