// @module-tag slow
// 归慢层：重 CPU：用真实分词器逐条计量推理内容与参考历史。
// DV2/DV3 of the adopted DeepSeek visible reasoning estimate (revision 2): the captured
// `reasoning.text` detail is metered only as reference reasoning_content, on a meter copy.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Tokenizer } from '@huggingface/tokenizers'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  LosslessNumber,
  readOpaqueJson,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import type {
  PlanInput,
  PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  createDeepSeekSupplemental,
  deepSeekBoundaries,
  projectDeepSeekMeterBody,
} from '../src/input-meters/deepseek-boundary.ts'
import {
  createDeepSeekV4ProInputMeter,
  renderDeepSeekV4Prompt,
} from '../src/input-meters/deepseek-v4-pro.ts'
import {
  createDeepSeekV41FlashInputMeter,
  renderDeepSeekV41Prompt,
} from '../src/input-meters/deepseek-v41-flash.ts'
import type {
  FullMeterInput,
  InputMeter,
  NewMeterInput,
  ReplayMeterInput,
} from '../src/input-meter.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import {
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
} from '../src/official-models/deepseek.ts'
import { planRequest } from '../src/plan.ts'
import { outputBlockDigest, projectOutput } from '../src/projection.ts'
import { object } from '../src/json.ts'
import { testImagePreparerFor } from './image-transport-support.ts'
import { directFull, directNew, fullInputWithoutSource } from './direct-full-input.ts'
import { at, input, judgedMessage, message } from './support.ts'
import { recordTokenizerInput } from './tokenizer-input.ts'

const { texts: tokenized } = recordTokenizerInput()

type Mode = 'chat' | 'thinking'
const families = [
  {
    definition: deepseekV4Pro0813Definition,
    configuration: deepseekV4Pro0813Configuration,
    createMeter: createDeepSeekV4ProInputMeter,
    fixtures: 'deepseek-v4',
    tokenizer: 'deepseek-v4',
    supplemental: createDeepSeekSupplemental(['type', 'text']),
    // Official vectors: file, official render mode, and the render used for that vector.
    official: [
      { file: 'test_input_1.json', mode: 'thinking' as Mode },
      { file: 'test_input_2.json', mode: 'thinking' as Mode },
    ],
    officialRender: (body: JsonObject, mode: Mode) => renderDeepSeekV4Prompt(body, mode),
    meterRender: (body: JsonObject, mode: Mode) => renderDeepSeekV4Prompt(body, mode),
    // Exact first-round visible detail captured from the real Pro response (2026-09-28).
    captured: 'I need to look up the code for record "ORCHID".',
  },
  {
    definition: deepseekV41FlashDefinition,
    configuration: deepseekV41FlashConfiguration,
    createMeter: createDeepSeekV41FlashInputMeter,
    fixtures: 'deepseek-v41-flash',
    tokenizer: 'deepseek-v41-flash',
    supplemental: createDeepSeekSupplemental(['type', 'text', 'image_url']),
    official: [
      { file: 'test_input_1.json', mode: 'thinking' as Mode },
      { file: 'test_input_2.json', mode: 'chat' as Mode },
    ],
    officialRender: (body: JsonObject, mode: Mode) => renderDeepSeekV41Prompt(body, mode),
    meterRender: (body: JsonObject, mode: Mode) => renderDeepSeekV41Prompt(body, mode, 'low'),
    captured: 'We need answer only returned code. Need call lookup_code with name',
  },
]

/** The exact captured wire shape; every other shape must stay unexplained. */
function detail(text: string): JsonObject {
  return { type: 'reasoning.text', text, format: 'unknown', index: 0 }
}

describe.each(families)('$definition.modelId visible reasoning detail estimate', family => {
  const { definition, createMeter } = family
  const read = (name: string) =>
    readFileSync(new URL(`./fixtures/${family.fixtures}/${name}`, import.meta.url), 'utf8')
  const pinnedTokenizer = () => {
    const root = new URL(`../tokenizers/${family.tokenizer}/`, import.meta.url)
    return new Tokenizer(
      JSON.parse(readFileSync(new URL('tokenizer.json', root), 'utf8')),
      JSON.parse(readFileSync(new URL('tokenizer_config.json', root), 'utf8')),
    )
  }
  function official(name: string): { messages: JsonValue[]; tools?: JsonValue[] } {
    const copied = copyJsonValue(JSON.parse(read(name)))
    if ('failed' in copied) throw Error('invalid official vector')
    const value = copied.ok
    if (Array.isArray(value)) return { messages: [...value] }
    if (!object(value) || !Array.isArray(value.messages)) throw Error('invalid official vector')
    return {
      messages: [...value.messages],
      ...(Array.isArray(value.tools) ? { tools: [...value.tools] } : {}),
    }
  }
  /** Replace each reference reasoning_content with the captured details wire shape. */
  function asDetails(messages: readonly JsonValue[]): JsonValue[] {
    return messages.map(item => {
      if (!object(item) || typeof item.reasoning_content !== 'string') return item
      const { reasoning_content: text, ...rest } = item
      return { ...rest, reasoning_details: [detail(text)] }
    })
  }
  function request(tools: boolean): PlanInput {
    const profile = createOfficialProfileContent(definition, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration: family.configuration,
    })
    if ('rejected' in profile) throw Error(profile.rejected)
    const base = input()
    return {
      ...base,
      routeName: definition.modelId,
      provider: 'deepinfra/fp8',
      parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      messages: [message('user', 'STABLE_PREFIX_MARKER ' + 'long history '.repeat(400), 'u1')],
      tools: tools
        ? [
            {
              name: 'lookup_code',
              description: 'Look up a record code',
              parameters: {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
                additionalProperties: false,
              },
            },
          ]
        : [],
      snapshot: {
        ...base.snapshot,
        ...definition.capabilities,
        adaptation: profile.ok.adaptation,
        providers: profile.ok.providers,
        allowFallback: profile.ok.allowFallback,
        updatedAt: at,
      },
    }
  }
  async function plan(value: PlanInput, meter: InputMeter) {
    return planRequest(
      value,
      [definition],
      meter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
  }
  async function planned(value: PlanInput, meter: InputMeter) {
    const result = await plan(value, meter)
    if ('rejected' in result) throw Error(JSON.stringify(result))
    return result.planned
  }
  function reply(id: string, details: readonly JsonValue[], text = family.captured): Message {
    return judgedMessage({
      type: 'assistant',
      id,
      response: `${id}-response`,
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: `${id}-thinking`,
          kind: 'thinking',
          text,
          opaque: { routeName: definition.modelId, reasoning_details: details },
          visibility: { toHuman: false, toModel: true },
        },
        {
          id: `${id}-text`,
          kind: 'text',
          text: `visible answer ${id}`,
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
  }
  function spied(meter: InputMeter) {
    const full = vi.fn(meter.measureFull)
    const replay = vi.fn(meter.measureReplay)
    const fresh = vi.fn(meter.measureNew)
    return {
      full,
      replay,
      fresh,
      bound: { ...meter, measureFull: full, measureReplay: replay, measureNew: fresh },
    }
  }
  /** Round 2 of a real planner sequence: P, one visible-detail reply G, new user N. */
  async function secondRound(tools: boolean, usage?: { output: number; reasoning: number }) {
    const meter = createMeter(definition)
    const first = request(tools)
    const p1 = await planned(first, meter)
    const answer = reply('a1', [detail(family.captured)])
    const output = projectOutput({
      blocks: answer.blocks,
      source: 'reply',
      completeness: 'complete',
    })
    if (!('projected' in output)) throw Error('output group unavailable')
    const next: PlanInput = {
      ...first,
      messages: [...first.messages, answer, message('user', 'FOLLOWUP_TWO', 'u2')],
      calibration: {
        kind: 'observation',
        inputCalibration: {
          requestInput: p1.requestInput,
          observedInput: {
            kind: 'from_usage',
            provenance: {
              adapterRevision: 'openrouter-usage-reader/2',
              fieldPaths: ['usage.prompt_tokens'],
              servingProvider: 'DeepInfra',
              upstreamModel: definition.modelId,
            },
          },
          outputGroup: output.projected,
        },
        usage: {
          source: 'upstream',
          input_tokens: 7723,
          output_tokens: usage?.output ?? 62,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          reasoning_tokens: usage?.reasoning ?? 13,
        },
        outputBlocks: answer.blocks,
        replaySelection: answer.blocks.map((_block, index) => ({
          sourceBlockIndex: index,
          messageIndex: 1,
          blockIndex: index,
        })),
      },
    }
    return { meter, first, p1, answer, next }
  }

  it.each(family.official)(
    'official encoder vector $file: captured detail form equals the reference reasoning_content',
    ({ file, mode }) => {
      const source = official(file)
      const detailMessages = asDetails(source.messages)
      expect(detailMessages).not.toEqual(source.messages)
      const tools = source.tools ? { tools: source.tools } : {}
      const projected = projectDeepSeekMeterBody({ messages: detailMessages, ...tools })
      if (!projected) throw Error('captured detail form must be explained')
      expect(projected.messages).toEqual(source.messages)
      expect(family.officialRender(projected, mode)).toBe(
        read(file.replace('input', 'output').replace('.json', '.txt')),
      )

      // Meter full: detail form counts exactly the reference prompt plus the unchanged
      // supplemental; the supplemental never carries reasoning text or detail metadata.
      const envelope = {
        model: definition.modelId,
        provider: { order: ['deepinfra/fp8'], allow_fallbacks: false },
        ...(mode === 'thinking' ? { reasoning: { effort: 'low' } } : {}),
        stream: true,
      }
      const meter = createMeter(definition)
      const referenceBody = { ...envelope, messages: source.messages, ...tools }
      const detailBody = { ...envelope, messages: detailMessages, ...tools }
      const extra = family.supplemental(referenceBody)
      const prompt = family.meterRender(referenceBody, mode)
      if (!extra || prompt === undefined) throw Error('reference unavailable')
      const extraJson = writeJsonLossless(extra)
      // The envelope's own `reasoning` parameter stays; no detail text or metadata enters,
      // and unprojected raw details are never a serialized-length token proxy.
      for (const leaked of ['reasoning_details', 'reasoning_content', 'reasoning.text', 'unknown'])
        expect(extraJson).not.toContain(leaked)
      expect(writeJsonLossless(family.supplemental(detailBody) ?? null)).toBe('null')
      const encoder = pinnedTokenizer()
      const expected =
        encoder.encode(prompt, { add_special_tokens: false }).ids.length +
        encoder.encode(extraJson, { add_special_tokens: false }).ids.length
      const serialized = writeJsonLossless(detailBody)
      tokenized.length = 0
      expect(directFull(meter, { body: detailBody, serialized })).toEqual({
        kind: 'estimated',
        tokens: expected,
      })
      expect(tokenized).toEqual([prompt, extraJson])
      // Only the meter copy changed: the actual body and serialized bytes are untouched.
      expect(writeJsonLossless(detailBody)).toBe(serialized)
      expect(serialized).toContain('"reasoning_details"')
      expect(serialized).not.toContain('"reasoning_content"')
    },
  )

  it('rejects every other detail shape before HTTP, in full, boundary and planner paths', async () => {
    const meter = createMeter(definition)
    const text = family.captured
    const good = detail(text)
    const rejected: [string, JsonValue][] = [
      ['summary type', { ...good, type: 'reasoning.summary' }],
      ['encrypted', { type: 'reasoning.encrypted', data: 'PRIVATE', format: 'unknown', index: 0 }],
      ['other format', { ...good, format: 'openai-responses-v1' }],
      ['format case', { ...good, format: 'Unknown' }],
      ['index one', { ...good, index: 1 }],
      ['index string', { ...good, index: '0' }],
      ['index fraction', { ...good, index: new LosslessNumber('0.5') }],
      ['extra id', { ...good, id: null }],
      ['extra signature', { ...good, signature: 'sig' }],
      ['missing format', { type: 'reasoning.text', text, index: 0 }],
      ['missing index', { type: 'reasoning.text', text, format: 'unknown' }],
      ['text not string', { ...good, text: 7 }],
      ['text null', { ...good, text: null }],
      ['not object', 'reasoning.text'],
    ]
    const bodies: [string, JsonObject][] = [
      ...rejected.map(([name, item]): [string, JsonObject] => [
        name,
        { role: 'assistant', content: 'a', reasoning_details: [item] },
      ]),
      ['two details', { role: 'assistant', content: 'a', reasoning_details: [good, good] }],
      ['empty details', { role: 'assistant', content: 'a', reasoning_details: [] }],
      ['details not array', { role: 'assistant', content: 'a', reasoning_details: good }],
      ['user role', { role: 'user', content: 'a', reasoning_details: [good] }],
      ['tool role', { role: 'tool', content: 'a', tool_call_id: 'x', reasoning_details: [good] }],
      [
        'plus reasoning',
        { role: 'assistant', content: 'a', reasoning: text, reasoning_details: [good] },
      ],
      [
        'plus reasoning_content',
        { role: 'assistant', content: 'a', reasoning_content: text, reasoning_details: [good] },
      ],
    ]
    const u = { role: 'user', content: 'stable' }
    const n = { role: 'user', content: 'next' }
    for (const [name, assistant] of bodies) {
      const body = { messages: [u, assistant, n], reasoning: { effort: 'low' } }
      expect(projectDeepSeekMeterBody(body), name).toBeUndefined()
      expect(directFull(meter, { body, serialized: writeJsonLossless(body) }), name).toEqual({
        kind: 'unavailable',
      })
      const render = (value: JsonObject) => family.meterRender(value, 'thinking')
      expect(
        deepSeekBoundaries([u, assistant, n], {}, 1, new Set([1]), render),
        name,
      ).toBeUndefined()
      const replayRender = deepSeekBoundaries([u, n], {}, 1, new Set(), render)
      if (!replayRender || 'changed' in replayRender) throw Error('plain boundary unavailable')
      expect(
        directNew(meter, {
          units: [assistant, n],
          envelope: {},
          precedingUnitCount: 1,
          boundary: replayRender.fresh,
        }),
        name,
      ).toEqual({ kind: 'unavailable' })
    }
    // Value 0 in any exact JSON spelling is the same index; this is not a new shape.
    for (const index of [
      new LosslessNumber('0.0'),
      new LosslessNumber('-0'),
      new LosslessNumber('0e3'),
    ])
      expect(
        projectDeepSeekMeterBody({
          messages: [
            u,
            { role: 'assistant', content: 'a', reasoning_details: [{ ...good, index }] },
          ],
        }),
      ).toBeDefined()

    // Planner: every unexplained detail stored on a reply is refused before any HTTP.
    const unexplained = [...rejected.map(([, item]) => [item]), [good, good]]
    for (const details of unexplained) {
      const value = request(true)
      const result = await plan(
        {
          ...value,
          messages: [...value.messages, reply('bad', details), message('user', 'n', 'n')],
        },
        meter,
      )
      expect(result).toEqual({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxInputTokens'],
      })
    }
  })

  it.each([true, false])(
    'tools=%s: marginal keeps raw wire, details and digests, and adds no O or reasoning term',
    async tools => {
      const { meter, p1, answer, next } = await secondRound(tools)
      const thinking = answer.blocks[0]
      if (thinking?.kind !== 'thinking' || thinking.opaque === undefined) throw Error('fixture')
      const opaqueBefore = writeJsonLossless(readOpaqueJson(thinking.opaque))
      const digestsBefore = answer.blocks.map(block => outputBlockDigest(block))
      const { bound, full } = spied(meter)
      tokenized.length = 0
      const p2 = await planned(next, bound)
      expect(p2.measurement).toMatchObject({ mode: 'marginal', precision: 'estimated' })
      expect(full).not.toHaveBeenCalled()
      expect(tokenized.some(value => value.includes('STABLE_PREFIX_MARKER'))).toBe(false)
      // Actual wire: the exact captured detail, never the meter-only reasoning_content.
      expect(p2.serialized).toContain(
        `"reasoning_details":[{"type":"reasoning.text","text":${JSON.stringify(family.captured)},"format":"unknown","index":0}]`,
      )
      expect(p2.serialized).not.toContain('reasoning_content')
      expect(writeJsonLossless(p2.body)).toBe(p2.serialized)
      expect(writeJsonLossless(readOpaqueJson(thinking.opaque))).toBe(opaqueBefore)
      expect(answer.blocks.map(block => outputBlockDigest(block))).toEqual(digestsBefore)
      if (next.calibration.kind !== 'observation') throw Error('fixture')
      expect(next.calibration.inputCalibration.outputGroup).toMatchObject({
        blockDigests: digestsBefore,
      })
      // With tools the reference keeps prior reasoning, so the text is metered once in φ.
      if (tools) expect(tokenized.some(value => value.includes(family.captured))).toBe(true)
      for (const value of tokenized) {
        expect(value).not.toContain('reasoning.text')
        expect(value).not.toContain('"format"')
      }
      // Original O / reasoning_tokens are retained facts, not an extra input term.
      const larger = await secondRound(tools, { output: 50_000, reasoning: 40_000 })
      const p2Large = await planned(larger.next, larger.meter)
      expect(p2Large.measurement).toMatchObject({ mode: 'marginal' })
      expect(p2Large.measurement.predictedInput).toEqual(p2.measurement.predictedInput)
      if (p2.measurement.mode !== 'marginal' || p2Large.measurement.mode !== 'marginal')
        throw Error('marginal required')
      expect(p2Large.measurement.replayContribution).toEqual(p2.measurement.replayContribution)
      expect(p2Large.measurement.newContribution).toEqual(p2.measurement.newContribution)
      // The reference estimate telescopes: previous full + φ + δ = current full.
      const previousFull = directFull(meter, { body: p1.body, serialized: p1.serialized })
      const currentFull = directFull(meter, { body: p2.body, serialized: p2.serialized })
      if (!('tokens' in previousFull) || !('tokens' in currentFull)) throw Error('full unavailable')
      expect(
        ExactDecimal.from(previousFull.tokens)
          .add(ExactDecimal.from(p2.measurement.replayContribution.tokens))
          .add(ExactDecimal.from(p2.measurement.newContribution.tokens))
          .toString(),
      ).toBe(ExactDecimal.from(currentFull.tokens).toString())
    },
  )

  it('direct factory full, replay and new run the shared source guard', async () => {
    const { meter, next } = await secondRound(true)
    const { bound, replay, fresh } = spied(meter)
    const p2 = await planned(next, bound)
    if (p2.measurement.mode !== 'marginal') throw Error('marginal required')
    const replayInput = replay.mock.calls[0]?.[0]
    const newInput = fresh.mock.calls[0]?.[0]
    if (!replayInput || !newInput) throw Error('planner inputs not captured')
    expect(meter.measureReplay(replayInput)).toEqual({
      kind: 'estimated',
      tokens: p2.measurement.replayContribution.tokens,
    })
    expect(meter.measureNew(newInput)).toEqual({
      kind: 'estimated',
      tokens: p2.measurement.newContribution.tokens,
    })
    // Malformed explicit history on the factory's own replay method: rejected, not metered.
    const observation = replayInput.observation
    const badReplay: [string, ReplayMeterInput][] = [
      [
        'duplicate target',
        {
          ...replayInput,
          observation: {
            ...observation,
            replaySelection: observation.replaySelection.map(item => ({ ...item, blockIndex: 0 })),
          },
        },
      ],
      ['span order', { ...replayInput, selectionSpans: [...replayInput.selectionSpans].reverse() }],
      ['span count', { ...replayInput, selectionSpans: replayInput.selectionSpans.slice(1) }],
      [
        'tampered group',
        {
          ...replayInput,
          observation: { ...observation, outputBlocks: [...observation.outputBlocks].reverse() },
        },
      ],
      ['unit index', { ...replayInput, unitIndices: [0] }],
    ]
    for (const [name, value] of badReplay)
      expect(meter.measureReplay(value), name).toEqual({ kind: 'invalidInput' })
    // A different original basis is not same-effective: unavailable, never a raw count.
    const original = observation.inputCalibration.requestInput
    if (original.kind !== 'known') throw Error('known source required')
    expect(
      meter.measureReplay({
        ...replayInput,
        observation: {
          ...observation,
          inputCalibration: {
            ...observation.inputCalibration,
            requestInput: {
              ...original,
              countingBasis: {
                ...original.countingBasis,
                replayRevision: 'deepseek-reference-boundary/1',
              },
            },
          },
        },
      }),
    ).toEqual({ kind: 'unavailable' })

    // New: history spans must name an explicit group and allowed unit.
    const group: PlanOutputHistoryGroup = {
      inputCalibration: observation.inputCalibration,
      usage: observation.usage,
      outputBlocks: observation.outputBlocks,
      replaySelection: observation.replaySelection,
      origin: {
        adaptation: next.snapshot.adaptation,
        provider: next.provider,
        parameters: next.parameters,
      },
    }
    const badNew: [string, NewMeterInput][] = [
      [
        'orphan span',
        { ...newInput, historySpans: [{ groupIndex: 0, selectionIndex: 0, start: 2, end: 3 }] },
      ],
      ['unspanned group', { ...newInput, outputHistory: [group] }],
      ['index count', { ...newInput, unitIndices: [] }],
      ['prefix index', { ...newInput, unitIndices: newInput.unitIndices.map(() => 0) }],
    ]
    for (const [name, value] of badNew)
      expect(meter.measureNew(value), name).toEqual({ kind: 'invalidInput' })

    // Full: body-only is legitimate; an explicit valid group adds nothing; malformed is refused.
    const fullBase = { body: p2.body, serialized: p2.serialized }
    const bodyOnly = directFull(meter, fullBase)
    expect(bodyOnly).toMatchObject({ kind: 'estimated' })
    const withHistory: FullMeterInput = {
      ...fullInputWithoutSource(meter, fullBase),
      outputHistory: [group],
      historySpans: group.replaySelection.map((_item, selectionIndex) => ({
        groupIndex: 0,
        selectionIndex,
        start: 1,
        end: 2,
      })),
    }
    expect(meter.measureFull(withHistory)).toEqual(bodyOnly)
    const badFull: [string, FullMeterInput][] = [
      ['missing spans', { ...withHistory, historySpans: [] }],
      [
        'span beyond units',
        {
          ...withHistory,
          historySpans: withHistory.historySpans.map(span => ({ ...span, end: 99 })),
        },
      ],
      [
        'duplicate target',
        {
          ...withHistory,
          outputHistory: [
            {
              ...group,
              replaySelection: group.replaySelection.map(item => ({ ...item, blockIndex: 0 })),
            },
          ],
        },
      ],
      [
        'tampered group',
        {
          ...withHistory,
          outputHistory: [{ ...group, outputBlocks: [...group.outputBlocks].reverse() }],
        },
      ],
      ['serialized mismatch', { ...withHistory, serialized: p2.serialized + ' ' }],
    ]
    for (const [name, value] of badFull)
      expect(meter.measureFull(value), name).toEqual({ kind: 'unavailable' })
  })

  it.each([true, false])(
    'tools=%s: three rounds keep P with its visible detail out of the tokenizer; changes fall back to full',
    async tools => {
      const { meter, next } = await secondRound(tools)
      const p2 = await planned(next, meter)
      expect(p2.measurement.mode).toBe('marginal')
      // Round 3: P now contains the round-2 reply's visible detail.
      const later = reply(
        'a2',
        [detail('ROUND_THREE_VISIBLE_THOUGHT')],
        'ROUND_THREE_VISIBLE_THOUGHT',
      )
      const output = projectOutput({
        blocks: later.blocks,
        source: 'reply',
        completeness: 'complete',
      })
      if (!('projected' in output)) throw Error('output group unavailable')
      const round3: PlanInput = {
        ...next,
        messages: [...next.messages, later, message('user', 'FOLLOWUP_THREE', 'u3')],
        calibration: {
          kind: 'observation',
          inputCalibration: {
            requestInput: p2.requestInput,
            observedInput: {
              kind: 'from_usage',
              provenance: {
                adapterRevision: 'openrouter-usage-reader/2',
                fieldPaths: ['usage.prompt_tokens'],
                servingProvider: 'DeepInfra',
                upstreamModel: definition.modelId,
              },
            },
            outputGroup: output.projected,
          },
          usage: {
            source: 'upstream',
            input_tokens: 7800,
            output_tokens: 20,
            cache_read_tokens: 7680,
            cache_write_tokens: 0,
          },
          outputBlocks: later.blocks,
          replaySelection: later.blocks.map((_block, index) => ({
            sourceBlockIndex: index,
            messageIndex: next.messages.length,
            blockIndex: index,
          })),
        },
      }
      const { bound, full } = spied(meter)
      tokenized.length = 0
      const p3 = await planned(round3, bound)
      expect(p3.measurement.mode).toBe('marginal')
      expect(full).not.toHaveBeenCalled()
      for (const value of tokenized) {
        expect(value).not.toContain('STABLE_PREFIX_MARKER')
        expect(value).not.toContain(family.captured)
        expect(value.length).toBeLessThan(1000)
      }
      expect(tokenized.some(value => value.includes('FOLLOWUP_THREE'))).toBe(true)

      // Prefix, tools and basis changes are full; history and the detail stay on the wire.
      const fallbacks: [PlanInput, string][] = [
        [
          { ...round3, messages: [message('user', 'changed', 'u1'), ...round3.messages.slice(1)] },
          'prefix_changed',
        ],
        [
          {
            ...round3,
            tools: [
              {
                name: 'lookup_code',
                description: 'changed',
                parameters: { type: 'object', properties: {} },
              },
            ],
          },
          'prefix_changed',
        ],
      ]
      if (round3.calibration.kind !== 'observation') throw Error('fixture')
      const original = round3.calibration.inputCalibration.requestInput
      if (original.kind !== 'known') throw Error('known source required')
      for (const replayRevision of ['deepseek-reference-boundary/1', 'unrelated-replay/1'])
        fallbacks.push([
          {
            ...round3,
            calibration: {
              ...round3.calibration,
              inputCalibration: {
                ...round3.calibration.inputCalibration,
                requestInput: {
                  ...original,
                  countingBasis: { ...original.countingBasis, replayRevision },
                },
              },
            },
          },
          'basis_changed',
        ])
      for (const [value, reason] of fallbacks) {
        const result = await planned(value, meter)
        expect(result.measurement, reason).toMatchObject({ mode: 'full', fallbackReason: reason })
        expect(result.serialized).toContain(JSON.stringify(family.captured))
        expect(result.serialized).toContain('ROUND_THREE_VISIBLE_THOUGHT')
      }
    },
  )
})
