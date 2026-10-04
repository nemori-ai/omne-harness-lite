// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
// MV2 and MV3 of the adopted Moonshot visible reasoning estimate (revision 2):
// counterexamples 1–7 and 9 with the equivalence oracle, then counterexample 8 on the
// methods the two factories actually return. Archived fragments are merged by the real
// reader over local TLS; nothing here is an OpenRouter or Moonshot upstream observation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readOpaqueJson,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import {
  invokeModel,
  type InvocationOutcome,
  type PlanInput,
  type PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime'
import {
  measureFull,
  type FullMeterInput,
  type InputMeter,
  type NewMeterInput,
  type ReplayMeterInput,
} from '../src/input-meter.ts'
import { createMoonshotInputMeter, projectMoonshotMeterBody } from '../src/input-meters/moonshot.ts'
import { object } from '../src/json.ts'
import { planRequest } from '../src/plan.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { directFull, fullInputWithoutSource } from './direct-full-input.ts'
import { testImagePreparerFor } from './image-transport-support.ts'
import { at, certificate, fixture, judgedMessage, policy, type CapturedRequest } from './support.ts'
import {
  moonshotDefinition,
  moonshotModels,
  moonshotRequest,
  trackedMeter,
  userTurn,
  wireOf,
  type MoonshotModel,
} from './moonshot-support.ts'
import {
  archivedFor,
  archivedReply,
  archivedStreams,
  archivedText,
  asReasoningString,
  serialized,
  visibleDetail,
  type ArchivedReplyOptions,
  type ArchivedStream,
} from './moonshot-visible-support.ts'

type Complete = Extract<InvocationOutcome, { readonly blocks: unknown }>
const [k3, k27] = moonshotModels
const unavailable = { kind: 'unavailable' }
const sizeUnavailable = {
  rejected: 'invalidInput',
  reason: 'input_size_unavailable',
  metrics: ['maxInputTokens'],
}

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function modelOf(stream: ArchivedStream): MoonshotModel {
  const model = moonshotModels.find(value => value.modelId === stream.model)
  if (!model) throw new Error(`unknown archived model ${stream.model}`)
  return model
}

function assistant(round: number, blocks: Complete['blocks']): Message {
  return judgedMessage({
    type: 'assistant',
    id: `moonshot-visible-assistant-${round}`,
    response: `moonshot-visible-response-${round}`,
    ending: 'complete',
    createdAt: at,
    blocks,
  })
}

async function plan(model: MoonshotModel, request: PlanInput, meter?: InputMeter) {
  const definition = moonshotDefinition(model)
  return planRequest(
    request,
    [definition],
    meter ?? createMoonshotInputMeter(definition),
    { signal: new AbortController().signal },
    testImagePreparerFor(planRequest),
  )
}

/**
 * One real local-TLS round: archived-shape SSE merged by the real reader. `next` then
 * plans and invokes the second round over the same transport (at most one more HTTP).
 */
async function withFirstRound<T>(
  model: MoonshotModel,
  stream: ArchivedStream,
  reply: ArchivedReplyOptions,
  next: (value: {
    readonly first: PlanInput
    readonly outcome: Complete
    readonly requests: readonly CapturedRequest[]
    readonly invoke: (request: PlanInput) => Promise<InvocationOutcome>
  }) => Promise<T>,
): Promise<T> {
  const definition = moonshotDefinition(model)
  const host = await fixture(
    cert.tls,
    (res, captured) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(archivedReply(model, host.requests.indexOf(captured) + 1, stream, reply))
    },
    {},
    undefined,
    [definition],
  )
  const transport = createPiAiTransport({
    ...host.options,
    definitions: [definition],
    inputMeters: [createMoonshotInputMeter(definition)],
  })
  const invoke = (request: PlanInput) =>
    invokeModel({
      ...request,
      transport,
      credential: 'controlled-test-only',
      signal: new AbortController().signal,
      policy: policy(),
    }).outcome
  try {
    const effort = (['low', 'high', 'max'] as const).find(value => value === stream.effort)
    const initial = moonshotRequest(model, { effort })
    const first = { ...initial, messages: [...initial.messages, userTurn(1)] }
    const outcome = await invoke(first)
    if (!('outcome' in outcome) || outcome.outcome !== 'complete')
      throw new Error(JSON.stringify(outcome))
    expect(host.requests).toHaveLength(1)
    return await next({ first, outcome, requests: host.requests, invoke })
  } finally {
    await transport.close()
    await host.close()
  }
}

function mergedDetails(outcome: Complete): JsonValue {
  const thinking = outcome.blocks.find(block => block.kind === 'thinking')
  if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
    throw new Error('reasoning details were not retained')
  const opaque = readOpaqueJson(thinking.opaque)
  if (!object(opaque)) throw new Error('opaque reasoning shape')
  return opaque.reasoning_details ?? null
}

function secondRound(first: PlanInput, outcome: Complete, observation = false): PlanInput {
  return {
    ...first,
    messages: [...first.messages, assistant(1, outcome.blocks), userTurn(2)],
    ...(observation
      ? {
          calibration: {
            kind: 'observation',
            inputCalibration: outcome.inputCalibration,
            usage: outcome.usage,
            outputBlocks: outcome.blocks,
            replaySelection: outcome.blocks.map((_block, sourceBlockIndex) => ({
              sourceBlockIndex,
              messageIndex: first.messages.length,
              blockIndex: sourceBlockIndex,
            })),
          },
        }
      : {}),
  }
}

describe('MV2 counterexample 6: equivalence oracle on the ten archived streams', () => {
  it('real reader merges each archive into exactly one detail; details count == reasoning string count', async () => {
    expect(archivedStreams).toHaveLength(10)
    expect(archivedStreams.reduce((sum, stream) => sum + stream.fragments.length, 0)).toBe(816)
    for (const stream of archivedStreams) {
      const model = modelOf(stream)
      await withFirstRound(model, stream, {}, async ({ first, outcome }) => {
        const text = archivedText(stream)
        expect(mergedDetails(outcome)).toEqual([visibleDetail(text)])
        const efforts = model.k3 ? (['low', 'high', 'max'] as const) : [undefined]
        for (const tools of [false, true])
          for (const effort of efforts) {
            const base = moonshotRequest(model, { tools, effort })
            const request = secondRound(
              { ...base, messages: [...base.messages, ...first.messages.slice(2)] },
              outcome,
            )
            const planned = await plan(model, request)
            if ('rejected' in planned)
              throw new Error(`${stream.member} ${JSON.stringify(planned)}`)
            const measurement = planned.planned.measurement
            expect(measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
            const body = planned.planned.body
            const wireAssistant = Array.isArray(body.messages)
              ? body.messages.find(item => object(item) && item.role === 'assistant')
              : undefined
            expect(wireAssistant).toMatchObject({ reasoning_details: [visibleDetail(text)] })
            expect(wireAssistant).not.toHaveProperty('reasoning')
            if (model.k3) expect(body.reasoning).toEqual({ effort })
            expect(body.tools === undefined).toBe(!tools)
            const meter = createMoonshotInputMeter(moonshotDefinition(model))
            const plain = directFull(meter, serialized(asReasoningString(body)))
            if (plain.kind !== 'estimated') throw new Error('reasoning string form unavailable')
            expect(writeJsonLossless(measurement.predictedInput)).toBe(
              writeJsonLossless(plain.tokens),
            )
          }
      })
    }
  }, 120_000)
})

describe.each(moonshotModels)('$modelId visible details at the meter', model => {
  const definition = moonshotDefinition(model)
  const [first, second] = archivedFor(model).map(archivedText)
  if (first === undefined || second === undefined) throw new Error('two archived texts required')
  const system = { role: 'system', content: 'Answer briefly.' }
  const user = (text: string) => ({ role: 'user', content: [{ type: 'text', text }] })
  const reply = (extra: JsonObject, content = 'ALPHA') => ({
    role: 'assistant',
    content,
    ...extra,
  })
  const envelope = model.k3 ? { reasoning: { effort: 'high' } } : {}
  const body = (...messages: JsonValue[]): JsonObject => ({
    model: definition.modelId,
    messages: [system, user('Turn 1.'), ...messages, user('Next.')],
    ...envelope,
  })
  const measure = (value: JsonObject) =>
    directFull(createMoonshotInputMeter(definition), serialized(value))

  it('counterexample 1: two replies are each counted once; identical parallel strings change nothing', () => {
    const detailed = body(
      reply({ reasoning_details: [visibleDetail(first)] }),
      user('Turn 2.'),
      reply({ reasoning_details: [visibleDetail(second)] }),
    )
    const counted = measure(detailed)
    if (counted.kind !== 'estimated') throw new Error('details must be counted')
    expect(measure(asReasoningString(detailed))).toEqual(counted)
    // Replacing only one detail by its string also agrees: each is independent.
    const mixed = body(
      reply({ reasoning: first }),
      user('Turn 2.'),
      reply({ reasoning_details: [visibleDetail(second)] }),
    )
    expect(measure(mixed)).toEqual(counted)
    for (const parallel of [
      { reasoning: first },
      { reasoning_content: first },
      { reasoning: first, reasoning_content: first },
    ])
      expect(
        measure(
          body(
            reply({ ...parallel, reasoning_details: [visibleDetail(first)] }),
            user('Turn 2.'),
            reply({ reasoning_details: [visibleDetail(second)] }),
          ),
        ),
      ).toEqual(counted)
    // Absent reasoning renders an empty slot: the detail text is really in the count.
    const empty = measure(body(reply({}), user('Turn 2.'), reply({})))
    if (empty.kind !== 'estimated') throw new Error('plain body must be counted')
    expect(Number(String(counted.tokens))).toBeGreaterThan(Number(String(empty.tokens)))
  })

  it('counterexample 2: a parallel string that differs, is empty or null is unavailable', () => {
    for (const parallel of [
      { reasoning: `${first}x` },
      { reasoning: first.slice(0, -1) },
      { reasoning_content: `${first}x` },
      { reasoning_content: '' },
      { reasoning: null },
      { reasoning_content: null },
      { reasoning: first, reasoning_content: `${first}x` },
      { reasoning: 7 },
    ])
      expect(
        measure(body(reply({ ...parallel, reasoning_details: [visibleDetail(first)] }))),
        JSON.stringify(parallel),
      ).toEqual(unavailable)
  })

  it('counterexample 3: every other detail shape is unavailable, on the meter and before HTTP', async () => {
    const good = visibleDetail(first)
    const shapes: [string, JsonValue][] = [
      ['id null', [{ ...good, id: null }]],
      ['signature null', [{ ...good, signature: null }]],
      ['signature', [{ ...good, signature: 'sig' }]],
      ['unknown key', [{ ...good, extra: true }]],
      ['index 1', [{ ...good, index: 1 }]],
      ['index "0"', [{ ...good, index: '0' }]],
      ['index 0.5', [{ ...good, index: new LosslessNumber('0.5') }]],
      ['other format', [{ ...good, format: 'anthropic-claude-v1' }]],
      ['summary', [{ type: 'reasoning.summary', summary: first, format: 'unknown', index: 0 }]],
      ['encrypted', [{ type: 'reasoning.encrypted', data: 'OPAQUE', format: 'unknown', index: 0 }]],
      ['summary type with text', [{ ...good, type: 'reasoning.summary' }]],
      ['two items', [good, visibleDetail(second)]],
      ['empty array', []],
      ['null', null],
      ['object', good],
      ['redacted text', [visibleDetail('[REDACTED]')]],
      ['missing index', [{ type: 'reasoning.text', text: first, format: 'unknown' }]],
      ['text not string', [{ ...good, text: 7 }]],
    ]
    for (const [name, details] of shapes) {
      const value = body(reply({ reasoning_details: details }))
      expect(projectMoonshotMeterBody(value), name).toBeUndefined()
      expect(measure(value), name).toEqual(unavailable)
    }
    // Index 0 in any exact decimal spelling is the same shape.
    const zero = measure(body(reply({ reasoning_details: [good] })))
    expect(zero.kind).toBe('estimated')
    for (const index of ['0.0', '-0', '0e3'])
      expect(
        measure(
          body(reply({ reasoning_details: [{ ...good, index: new LosslessNumber(index) }] })),
        ),
        index,
      ).toEqual(zero)

    // Planner: a stored reply replaying any array-of-objects unexplained shape is refused
    // before any HTTP, and the original messages are not changed.
    const request = moonshotRequest(model)
    for (const [name, details] of shapes) {
      if (!Array.isArray(details) || !details.length || !details.every(object)) continue
      const messages = [
        ...request.messages,
        userTurn(1),
        judgedMessage({
          type: 'assistant',
          id: 'moonshot-visible-bad',
          response: 'moonshot-visible-bad-response',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'moonshot-visible-bad-thinking',
              kind: 'thinking',
              text: first,
              opaque: { routeName: definition.modelId, reasoning_details: details },
              visibility: { toHuman: false, toModel: true },
            },
            {
              id: 'moonshot-visible-bad-text',
              kind: 'text',
              text: 'ALPHA',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        }),
        userTurn(2),
      ]
      const original = JSON.stringify(messages)
      expect(await plan(model, { ...request, messages }), name).toEqual(sizeUnavailable)
      expect(JSON.stringify(messages)).toBe(original)
    }
  })

  it('counterexample 4: details on user, tool, system or developer messages are unavailable', () => {
    const details = { reasoning_details: [visibleDetail(first)] }
    for (const message of [
      { role: 'user', content: 'a', ...details },
      { role: 'system', content: 'a', ...details },
      { role: 'developer', content: 'a', ...details },
      { role: 'tool', content: 'a', tool_call_id: 'call_a', ...details },
    ])
      expect(measure(body(message)), message.role).toEqual(unavailable)
  })

  it('counterexample 7: metering changes neither the body nor its serialized bytes', () => {
    const value = body(reply({ reasoning_details: [visibleDetail(first)] }))
    const bytes = writeJsonLossless(value)
    const snapshot = structuredClone(value)
    const projected = projectMoonshotMeterBody(value)
    expect(measure(value).kind).toBe('estimated')
    expect(writeJsonLossless(value)).toBe(bytes)
    expect(value).toEqual(snapshot)
    expect(bytes).toContain('"reasoning_details":[{"type":"reasoning.text"')
    // The copy alone carries the template slot string; the original keeps the details.
    expect(projected?.messages).not.toEqual(value.messages)
  })
})

describe.each(moonshotModels)('$modelId stream-level fragments through the real reader', model => {
  const stream = archivedFor(model)[0]
  if (!stream) throw new Error('archived stream missing')
  const text = archivedText(stream)
  const archived = (fragment: string, detail: JsonObject): JsonObject => ({
    content: '',
    role: 'assistant',
    reasoning: fragment,
    reasoning_details: [detail],
  })

  it.each([
    {
      label: 'fragments with a shared id',
      delta: (fragment: string) => archived(fragment, { ...visibleDetail(fragment), id: 'rs_1' }),
      key: 'id',
    },
    {
      label: 'id-less fragments with a late signature (R-L)',
      delta: (fragment: string, index: number, count: number) =>
        archived(
          fragment,
          index === count - 1
            ? { ...visibleDetail(fragment), signature: 'late-signature' }
            : visibleDetail(fragment),
        ),
      key: 'signature',
    },
    {
      label: 'fragments with an explicit null signature',
      delta: (fragment: string) =>
        archived(fragment, { ...visibleDetail(fragment), signature: null }),
      key: 'signature',
    },
  ])(
    'counterexample 5: $label merge into one entry with an extra key, refused before HTTP',
    async ({ delta, key }) => {
      await withFirstRound(
        model,
        stream,
        { delta },
        async ({ first, outcome, requests, invoke }) => {
          const details = mergedDetails(outcome)
          expect(Array.isArray(details) && details.length).toBe(1)
          expect(Array.isArray(details) && details[0]).toMatchObject({ text })
          expect(
            Array.isArray(details) && object(details[0]) && Object.hasOwn(details[0], key),
          ).toBe(true)
          const next = secondRound(first, outcome)
          expect(await plan(model, next)).toEqual(sizeUnavailable)
          expect(await invoke(next)).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
          })
          expect(requests).toHaveLength(1)
        },
      )
    },
  )

  it('counterexamples 5, 7 and 9: id-less unsigned fragments replay as one detail, full only', async () => {
    await withFirstRound(model, stream, {}, async ({ first, outcome, requests, invoke }) => {
      expect(mergedDetails(outcome)).toEqual([visibleDetail(text)])
      const next = secondRound(first, outcome, true)
      const original = JSON.stringify(next.messages)
      const { meter, calls } = trackedMeter(createMoonshotInputMeter(moonshotDefinition(model)))
      const planned = await plan(model, next, meter)
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      // Counterexample 9: the observation is usable, φ/δ are asked and stay unavailable.
      expect(planned.planned.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      if (planned.planned.measurement.mode !== 'full') throw new Error('full required')
      expect(planned.planned.measurement.fallbackReason).toBeUndefined()
      expect(calls.replay).toEqual([unavailable])
      expect(calls.fresh).toEqual([unavailable])
      // Counterexample 7: the planned bytes are the HTTP bytes and keep the details.
      const invoked = await invoke(next)
      if (!('outcome' in invoked) || invoked.outcome !== 'complete')
        throw new Error(JSON.stringify(invoked))
      expect(requests).toHaveLength(2)
      expect(requests[1]?.body).toBe(planned.planned.serialized)
      expect(writeJsonLossless(planned.planned.body)).toBe(planned.planned.serialized)
      expect(wireOf(requests[1]).messages).toContainEqual({
        role: 'assistant',
        content: 'Answer 1.',
        reasoning_details: [visibleDetail(text)],
      })
      expect(JSON.stringify(next.messages)).toBe(original)
    })
  })
})

describe.each([k3, k27])(
  'MV3 counterexample 8: $modelId factory methods run the shared guard',
  model => {
    it('body-only full estimates; malformed explicit history is refused; no recursion', async () => {
      const stream = archivedFor(model)[1]
      if (!stream) throw new Error('archived stream missing')
      await withFirstRound(model, stream, {}, async ({ first, outcome }) => {
        const meter = createMoonshotInputMeter(moonshotDefinition(model))
        const { meter: tracked, calls } = trackedMeter(meter)
        const inputs: { replay?: ReplayMeterInput; fresh?: NewMeterInput } = {}
        const spying: InputMeter = {
          ...tracked,
          measureReplay(value) {
            inputs.replay = value
            return tracked.measureReplay(value)
          },
          measureNew(value) {
            inputs.fresh = value
            return tracked.measureNew(value)
          },
        }
        const next = secondRound(first, outcome, true)
        const planned = await plan(model, next, spying)
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(calls.full.every(value => value.kind === 'estimated')).toBe(true)
        const fullBase = { body: planned.planned.body, serialized: planned.planned.serialized }
        const bodyOnly = meter.measureFull(fullInputWithoutSource(meter, fullBase))
        expect(bodyOnly).toMatchObject({ kind: 'estimated' })
        // The shared wrapper around the factory method: same result, no recursion.
        expect(measureFull(meter, fullInputWithoutSource(meter, fullBase))).toEqual(bodyOnly)

        if (next.calibration.kind !== 'observation') throw new Error('observation required')
        const observation = next.calibration
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
        const span = (selectionIndex: number) => ({
          groupIndex: 0,
          selectionIndex,
          start: first.messages.length,
          end: first.messages.length + 1,
        })
        const withHistory: FullMeterInput = {
          ...fullInputWithoutSource(meter, fullBase),
          outputHistory: [group],
          historySpans: group.replaySelection.map((_item, index) => span(index)),
        }
        expect(group.replaySelection.length).toBeGreaterThan(1)
        expect(meter.measureFull(withHistory)).toEqual(bodyOnly)
        const original = observation.inputCalibration.requestInput
        if (original.kind !== 'known') throw new Error('known source required')
        const bad: [string, FullMeterInput][] = [
          ['missing spans', { ...withHistory, historySpans: [] }],
          ['partial group', { ...withHistory, historySpans: withHistory.historySpans.slice(1) }],
          [
            'span beyond units',
            {
              ...withHistory,
              historySpans: withHistory.historySpans.map(item => ({ ...item, end: 99 })),
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
          [
            'source contradiction',
            {
              ...withHistory,
              outputHistory: [
                { ...group, origin: { ...group.origin, provider: 'moonshotai/other' } },
              ],
            },
          ],
          ['serialized mismatch', { ...withHistory, serialized: `${fullBase.serialized} ` }],
        ]
        for (const [name, value] of bad) expect(meter.measureFull(value), name).toEqual(unavailable)

        // φ/δ on the factory methods: malformed is invalidInput, valid is still unsupported.
        const replayInput = inputs.replay
        const freshInput = inputs.fresh
        if (!replayInput || !freshInput) throw new Error('planner inputs not captured')
        expect(meter.replayRevision).toBe('unsupported-marginal/1')
        expect(meter.measureReplay(replayInput)).toEqual(unavailable)
        expect(meter.measureNew(freshInput)).toEqual(unavailable)
        expect(
          meter.measureReplay({
            ...replayInput,
            selectionSpans: replayInput.selectionSpans.slice(1),
          }),
        ).toEqual({ kind: 'invalidInput' })
        expect(meter.measureNew({ ...freshInput, unitIndices: [] })).toEqual({
          kind: 'invalidInput',
        })
      })
    })
  },
)
