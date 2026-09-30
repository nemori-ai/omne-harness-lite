// QC-V4 and QC-V5 of the adopted Qwen commercial public-template estimate (candidate
// revision 1): the open page's counterexamples 1–10 rerun on the six commercial leaves with
// each leaf's settings, the new counterexamples 11–16 and 18, and the factory methods called
// directly (counterexample 8). Streams are QC-V0-shaped fragments merged by the real reader
// over local TLS; nothing here is an OpenRouter or Alibaba upstream observation.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Tokenizer } from '@huggingface/tokenizers'
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
import {
  createQwenInputMeter,
  projectQwenMeterBody,
  renderQwenPrompt,
} from '../src/input-meters/qwen.ts'
import { object } from '../src/json.ts'
import { planRequest } from '../src/plan.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { directFull, fullInputWithoutSource } from './direct-full-input.ts'
import { testImagePreparerFor } from './image-transport-support.ts'
import { lookupTool, trackedMeter, wireOf } from './moonshot-support.ts'
import {
  archivedReply,
  archivedText,
  asReasoningString,
  serialized,
  visibleDetail,
  type ArchivedReplyOptions,
  type ArchivedStream,
} from './moonshot-visible-support.ts'
import {
  explicitCache,
  qwenCommercialDefinition,
  qwenCommercialMeter,
  qwenCommercialModels,
  qwenCommercialRequest,
  qwenCommercialStreamsFor,
  qwenFamilySettings,
  type QwenCommercialModel,
} from './qwen-commercial-support.ts'
import { qwenToolResult, qwenUserTurn } from './qwen-visible-support.ts'
import { at, certificate, fixture, judgedMessage, policy, type CapturedRequest } from './support.ts'

type Complete = Extract<InvocationOutcome, { readonly blocks: unknown }>
const unavailable = { kind: 'unavailable' }
const sizeUnavailable = {
  rejected: 'invalidInput',
  reason: 'input_size_unavailable',
  metrics: ['maxInputTokens'],
}
const provider = { order: ['alibaba'], allow_fallbacks: false, require_parameters: true }

let cert: ReturnType<typeof certificate>
let tokenizer: Tokenizer
beforeAll(() => {
  cert = certificate()
  for (const model of qwenCommercialModels) qwenCommercialMeter(model)
  const directory = new URL('../tokenizers/qwen-38-24t/', import.meta.url)
  tokenizer = new Tokenizer(
    JSON.parse(readFileSync(new URL('tokenizer.json', directory), 'utf8')),
    JSON.parse(readFileSync(new URL('tokenizer_config.json', directory), 'utf8')),
  )
}, 120_000)
afterAll(() => cert.dispose())

function assistant(round: number, blocks: Complete['blocks']): Message {
  return judgedMessage({
    type: 'assistant',
    id: `qwen-commercial-assistant-${round}`,
    response: `qwen-commercial-response-${round}`,
    ending: 'complete',
    createdAt: at,
    blocks,
  })
}

async function plan(model: QwenCommercialModel, request: PlanInput, meter?: InputMeter) {
  return planRequest(
    request,
    [qwenCommercialDefinition(model)],
    meter ?? qwenCommercialMeter(model),
    { signal: new AbortController().signal },
    testImagePreparerFor(planRequest),
  )
}

/** One real local-TLS round; `next` may plan and invoke one more over the same transport. */
async function withFirstRound<T>(
  model: QwenCommercialModel,
  stream: ArchivedStream,
  reply: ArchivedReplyOptions,
  next: (value: {
    readonly first: PlanInput
    readonly outcome: Complete
    readonly requests: readonly CapturedRequest[]
    readonly invoke: (request: PlanInput) => Promise<InvocationOutcome>
  }) => Promise<T>,
): Promise<T> {
  const definition = qwenCommercialDefinition(model)
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
    inputMeters: [qwenCommercialMeter(model)],
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
    const initial = qwenCommercialRequest(model)
    const first = { ...initial, messages: [...initial.messages, qwenUserTurn(1)] }
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
    messages: [...first.messages, assistant(1, outcome.blocks), qwenUserTurn(2)],
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

const system = { role: 'system', content: 'Answer briefly.' }
const user = (text: string) => ({ role: 'user', content: [{ type: 'text', text }] })
const reply = (extra: JsonObject, content = 'ALPHA') => ({ role: 'assistant', content, ...extra })
const call = {
  id: 'call_a',
  type: 'function',
  function: { name: 'lookup__exact', arguments: '{"query":"a"}' },
}
const toolMessage = { role: 'tool', content: 'value=42', tool_call_id: 'call_a' }

describe.each(qwenCommercialModels)('$modelId visible details at the meter', model => {
  const definition = qwenCommercialDefinition(model)
  const settings = qwenFamilySettings[model.family]
  const lastTurnOnly = !settings.preserveThinking
  const [first, second] = qwenCommercialStreamsFor(model).map(archivedText)
  if (first === undefined || second === undefined) throw new Error('two texts required')
  const body = (...messages: JsonValue[]): JsonObject => ({
    model: definition.modelId,
    provider,
    stream: true,
    messages: [system, user('Turn 1.'), ...messages, user('Next.')],
  })
  // In-turn tool loop: the reply follows the last user query (no new query after it).
  const inTurn = (extra: JsonObject): JsonObject => ({
    model: definition.modelId,
    provider,
    stream: true,
    messages: [system, user('Turn 1.'), reply({ ...extra, tool_calls: [call] }, ''), toolMessage],
  })
  const measure = (value: JsonObject) => directFull(qwenCommercialMeter(model), serialized(value))
  const tokens = (value: JsonObject) => {
    const result = measure(value)
    if (result.kind !== 'estimated') throw new Error('estimate required')
    return Number(String(result.tokens))
  }

  it('counterexample 1: each reply counted once by its branch; an identical `reasoning` changes nothing', () => {
    const detailed = body(
      reply({ reasoning_details: [visibleDetail(first)] }),
      user('Turn 2.'),
      reply({ reasoning_details: [visibleDetail(second)] }),
    )
    const counted = measure(detailed)
    if (counted.kind !== 'estimated') throw new Error('details must be counted')
    expect(measure(asReasoningString(detailed))).toEqual(counted)
    expect(
      measure(
        body(
          reply({ reasoning: first }),
          user('Turn 2.'),
          reply({ reasoning_details: [visibleDetail(second)] }),
        ),
      ),
    ).toEqual(counted)
    expect(
      measure(
        body(
          reply({ reasoning: first, reasoning_details: [visibleDetail(first)] }),
          user('Turn 2.'),
          reply({ reasoning: second, reasoning_details: [visibleDetail(second)] }),
        ),
      ),
    ).toEqual(counted)
    const empty = tokens(body(reply({}), user('Turn 2.'), reply({})))
    // Both replies precede the last query: 3.8 counts each text, 3.7 drops both (QG1).
    if (lastTurnOnly) expect(Number(String(counted.tokens))).toBe(empty)
    else expect(Number(String(counted.tokens))).toBeGreaterThan(empty)
    // Within the current turn every leaf counts the detail text.
    expect(tokens(inTurn({ reasoning_details: [visibleDetail(first)] }))).toBeGreaterThan(
      tokens(inTurn({})),
    )
  })

  it('counterexample 2: a differing, empty or null `reasoning`, or any `reasoning_content`, is unavailable', () => {
    for (const parallel of [
      { reasoning: `${first}x` },
      { reasoning: first.slice(0, -1) },
      { reasoning: ` ${first}` },
      { reasoning: `${first}\n` },
      { reasoning: '' },
      { reasoning: null },
      { reasoning: 7 },
      { reasoning_content: first },
      { reasoning: first, reasoning_content: first },
      { reasoning_content: '' },
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
      ['id', [{ ...good, id: 'rs_1' }]],
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
      expect(projectQwenMeterBody(value), name).toBeUndefined()
      expect(measure(value), name).toEqual(unavailable)
    }
    const zero = measure(body(reply({ reasoning_details: [good] })))
    expect(zero.kind).toBe('estimated')
    for (const index of ['0.0', '-0', '0e3'])
      expect(
        measure(
          body(reply({ reasoning_details: [{ ...good, index: new LosslessNumber(index) }] })),
        ),
        index,
      ).toEqual(zero)

    const request = qwenCommercialRequest(model)
    for (const [name, details] of shapes) {
      if (!Array.isArray(details) || !details.length || !details.every(object)) continue
      const messages = [
        ...request.messages,
        qwenUserTurn(1),
        judgedMessage({
          type: 'assistant',
          id: 'qwen-commercial-bad',
          response: 'qwen-commercial-bad-response',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'qwen-commercial-bad-thinking',
              kind: 'thinking',
              text: first,
              opaque: { routeName: definition.modelId, reasoning_details: details },
              visibility: { toHuman: false, toModel: true },
            },
            {
              id: 'qwen-commercial-bad-text',
              kind: 'text',
              text: 'ALPHA',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        }),
        qwenUserTurn(2),
      ]
      const original = JSON.stringify(messages)
      expect(await plan(model, { ...request, messages }), name).toEqual(sizeUnavailable)
      expect(JSON.stringify(messages)).toBe(original)
    }
  })

  it('counterexample 4: details on user, tool or system messages, and effort outside the route domain, are unavailable', () => {
    const details = { reasoning_details: [visibleDetail(first)] }
    expect(measure(body(user('a'))).kind).toBe('estimated')
    expect(measure({ ...body(), messages: [{ ...system, ...details }, user('Turn 1.')] })).toEqual(
      unavailable,
    )
    expect(measure(body({ ...user('a'), ...details }))).toEqual(unavailable)
    const withTool = (extra: JsonObject) =>
      body(reply({ tool_calls: [call] }, ''), { ...toolMessage, ...extra })
    expect(measure(withTool({})).kind).toBe('estimated')
    expect(measure(withTool(details))).toEqual(unavailable)

    const plain = body(reply(details))
    const baseline = measure(plain)
    expect(baseline.kind).toBe('estimated')
    const is0902 = model.modelId === 'qwen/qwen3.8-max-0902'
    for (const effort of ['high', 'max'])
      expect(measure({ ...plain, reasoning: { effort } }), effort).toEqual(
        is0902 ? baseline : unavailable,
      )
    for (const reasoning of [
      { effort: 'none' },
      { effort: 'low' },
      { effort: 'medium' },
      { effort: 'xhigh' },
      { effort: 'high', summary: 'auto' },
      { enabled: true },
      'high',
      null,
    ])
      expect(measure({ ...plain, reasoning }), JSON.stringify(reasoning)).toEqual(unavailable)
  })

  it('counterexample 7: metering changes neither the body nor its serialized bytes', () => {
    const value = body(reply({ reasoning_details: [visibleDetail(first)] }))
    const bytes = writeJsonLossless(value)
    const snapshot = structuredClone(value)
    const projected = projectQwenMeterBody(value)
    expect(measure(value).kind).toBe('estimated')
    expect(writeJsonLossless(value)).toBe(bytes)
    expect(value).toEqual(snapshot)
    expect(bytes).toContain('"reasoning_details":[{"type":"reasoning.text"')
    expect(projected?.messages).not.toEqual(value.messages)
  })

  it('counterexample 11: last-turn thinking drops reasoning before the last query and keeps it after', () => {
    const withReasoning = [
      body(reply({ reasoning_details: [visibleDetail(first)] })),
      body(reply({ reasoning: first })),
    ]
    const stripped = tokens(body(reply({})))
    for (const value of withReasoning)
      if (lastTurnOnly) expect(tokens(value)).toBe(stripped)
      else expect(tokens(value)).toBeGreaterThan(stripped)
    // After the last query both branches render the same think block.
    const turn = projectQwenMeterBody(inTurn({ reasoning_details: [visibleDetail(first)] }))
    if (!turn) throw new Error('projection')
    const rendered = renderQwenPrompt(turn, settings)
    expect(rendered).toBe(renderQwenPrompt(turn, { ...settings, preserveThinking: true }))
    expect(rendered).toContain(`<think>\n${first.trim()}\n</think>`)
  })

  it('counterexample 12: last query skips wrapped users and tool messages, counts reminders, indexes from system', () => {
    const last = { ...settings, preserveThinking: false }
    const thinks = (messages: JsonValue[]) => {
      const projected = projectQwenMeterBody({
        model: definition.modelId,
        provider,
        messages,
      })
      return projected && renderQwenPrompt(projected, last)?.split('<think>\n').length
    }
    const reasoned = reply({ reasoning: first, tool_calls: [call] }, '')
    const wrapped = user('<tool_response>\nvalue=42\n</tool_response>')
    const reminder = {
      role: 'user',
      content: [
        { type: 'text', text: '[system_reminder "review"]' },
        { type: 'text', text: 'Stay exact.' },
      ],
    }
    // The generation prompt opens one think block; a kept reply adds one more.
    expect(thinks([system, user('Q.'), reasoned, wrapped])).toBe(3)
    expect(thinks([system, user('Q.'), reasoned, toolMessage])).toBe(3)
    expect(thinks([system, user('Q.'), reasoned, toolMessage, reminder])).toBe(2)
    // Same verdicts with and without a leading system message (indices include system).
    expect(thinks([user('Q.'), reasoned, toolMessage])).toBe(3)
    expect(thinks([user('Q.'), reasoned, toolMessage, reminder])).toBe(2)
    expect(thinks([system, reply({ reasoning: first }), user('Q.')])).toBe(2)
    expect(thinks([system, user('Q.'), reply({ reasoning: first })])).toBe(3)
  })

  it('counterexample 13: no instruction and no system block without system text and tools', () => {
    const none = { ...settings, effortInstruction: 'none' as const }
    const prompt = (messages: JsonValue[], tools?: JsonValue) => {
      const projected = projectQwenMeterBody({
        model: definition.modelId,
        provider,
        messages,
        ...(tools === undefined ? {} : { tools }),
      })
      return projected && renderQwenPrompt(projected, none)
    }
    const history = [user('Q.'), reply({ reasoning: first }), user('Next.')]
    expect(prompt(history)?.startsWith('<|im_start|>user\nQ.')).toBe(true)
    expect(
      prompt([
        { role: 'system', content: [{ type: 'text', text: ' \n' }] },
        ...history,
      ])?.startsWith('<|im_start|>user\nQ.'),
    ).toBe(true)
    expect(prompt([system, ...history])?.startsWith('<|im_start|>system\nAnswer briefly.')).toBe(
      true,
    )
    const tool = {
      type: 'function',
      function: { name: 'lookup__exact', parameters: { type: 'object' } },
    }
    expect(prompt(history, [tool])?.startsWith('<|im_start|>system\n# Tools\n')).toBe(true)
    expect(prompt(history, [tool])).not.toContain('Reasoning effort')
    // The bound instruction: 3.8 opens the system block with xhigh, 3.7 renders none.
    const bound = projectQwenMeterBody({ model: definition.modelId, provider, messages: history })
    if (!bound) throw new Error('projection')
    expect(renderQwenPrompt(bound, settings)?.includes('Reasoning effort is set to xhigh.')).toBe(
      !lastTurnOnly,
    )
  })

  it('counterexample 16: structural preconditions kept from the final-JSON estimator', () => {
    const cached = (extra: JsonObject, role = 'system') => ({
      ...body(),
      messages: [
        {
          role,
          content: [{ type: 'text', text: 'Answer briefly.', ...extra }],
        },
        user('Turn 1.'),
      ],
    })
    const control = { cache_control: { type: 'ephemeral', ttl: '5m' } }
    expect(measure(cached(control))).toEqual(
      explicitCache(definition) ? measure(cached({})) : unavailable,
    )
    for (const [name, value] of [
      ['user cache control', cached(control, 'user')],
      ['1h ttl', cached({ cache_control: { type: 'ephemeral', ttl: '1h' } })],
      ['no ttl', cached({ cache_control: { type: 'ephemeral' } })],
      ['other type', cached({ cache_control: { type: 'persistent', ttl: '5m' } })],
      ['extra key', cached({ cache_control: { type: 'ephemeral', ttl: '5m', scope: 'x' } })],
      [
        'require_parameters absent',
        { ...body(), provider: { ...provider, require_parameters: undefined } },
      ],
      [
        'require_parameters false',
        { ...body(), provider: { ...provider, require_parameters: false } },
      ],
      ['extra provider key', { ...body(), provider: { ...provider, sort: 'price' } }],
      [
        'image',
        {
          ...body(),
          messages: [
            {
              role: 'user',
              content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
            },
            user('Turn 1.'),
          ],
        },
      ],
      [
        'tool cache control',
        {
          ...body(),
          tools: [
            {
              type: 'function',
              function: { name: 'lookup__exact', parameters: { type: 'object' } },
              ...control,
            },
          ],
        },
      ],
      [
        'extra function key',
        {
          ...body(),
          tools: [
            {
              type: 'function',
              function: { name: 'lookup__exact', parameters: { type: 'object' }, strict: true },
            },
          ],
        },
      ],
      [
        'call without id',
        body(
          reply({ tool_calls: [{ type: call.type, function: call.function }] }, ''),
          toolMessage,
        ),
      ],
      // Wire key order: a JavaScript object would list the index key first, unlike the
      // source string that Python parses in order.
      [
        'array-index argument key',
        body(
          reply(
            {
              tool_calls: [
                { ...call, function: { name: 'lookup__exact', arguments: '{"b":1,"0":{"z":2}}' } },
              ],
            },
            '',
          ),
          toolMessage,
        ),
      ],
      // A lone surrogate has no Python str/UTF-8 form for the wire-order tojson.
      [
        'lone surrogate in a tool schema',
        {
          ...body(),
          tools: [
            {
              type: 'function',
              function: { name: 'lookup__exact', description: 'x\ud800', parameters: {} },
            },
          ],
        },
      ],
      ['stream not boolean', { ...body(), stream: 'yes' }],
      ['unknown body key', { ...body(), temperature: 0 }],
    ] as const) {
      const cleaned = JSON.parse(JSON.stringify(value))
      expect(measure(cleaned), name).toEqual(unavailable)
    }
  })

  it('counterexample 18: old or unknown revisions fail at construction', () => {
    expect(definition).toMatchObject({
      revision: '4',
      implementation: { name: 'pi-ai:qwen', revision: 'mp4-20' },
    })
    for (const [revision, implementation] of [
      ['3', 'mp4-17'],
      ['4', 'mp4-17'],
      ['3', 'mp4-20'],
      ['4', 'mp4-19'],
      ['5', 'mp4-20'],
    ] as const)
      expect(() =>
        createQwenInputMeter({
          ...definition,
          revision,
          implementation: { name: 'pi-ai:qwen', revision: implementation },
        }),
      ).toThrow(TypeError)
    expect(() =>
      createQwenInputMeter({
        ...definition,
        implementation: { name: 'pi-ai:other', revision: 'mp4-20' },
      }),
    ).toThrow(TypeError)
  })
})

describe.each(qwenCommercialModels)(
  '$modelId stream-level fragments through the real reader',
  model => {
    const stream = qwenCommercialStreamsFor(model)[0]
    if (!stream) throw new Error('stream missing')
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
            const original = JSON.stringify(next.messages)
            expect(await plan(model, next)).toEqual(sizeUnavailable)
            expect(await invoke(next)).toMatchObject({
              rejected: 'invalidInput',
              reason: 'input_size_unavailable',
            })
            expect(requests).toHaveLength(1)
            expect(JSON.stringify(next.messages)).toBe(original)
          },
        )
      },
    )

    it('counterexamples 5, 7 and 9: id-less unsigned fragments replay as one detail, full only', async () => {
      await withFirstRound(model, stream, {}, async ({ first, outcome, requests, invoke }) => {
        expect(mergedDetails(outcome)).toEqual([visibleDetail(text)])
        const next = secondRound(first, outcome, true)
        const original = JSON.stringify(next.messages)
        const { meter, calls } = trackedMeter(qwenCommercialMeter(model))
        const planned = await plan(model, next, meter)
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
        if (planned.planned.measurement.mode !== 'full') throw new Error('full required')
        expect(planned.planned.measurement.fallbackReason).toBeUndefined()
        expect(calls.replay).toEqual([unavailable])
        expect(calls.fresh).toEqual([unavailable])
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

    it('counterexample 10: a details-only stream (no parallel `reasoning`) replays as an estimate', async () => {
      await withFirstRound(
        model,
        stream,
        {
          delta: fragment => ({
            content: '',
            role: 'assistant',
            reasoning_details: [visibleDetail(fragment)],
          }),
        },
        async ({ first, outcome, requests, invoke }) => {
          expect(mergedDetails(outcome)).toEqual([visibleDetail(text)])
          const next = secondRound(first, outcome)
          const planned = await plan(model, next)
          if ('rejected' in planned) throw new Error(JSON.stringify(planned))
          expect(planned.planned.measurement).toMatchObject({
            mode: 'full',
            precision: 'estimated',
          })
          const invoked = await invoke(next)
          if (!('outcome' in invoked) || invoked.outcome !== 'complete')
            throw new Error(JSON.stringify(invoked))
          expect(requests).toHaveLength(2)
          expect(requests[1]?.body).toBe(planned.planned.serialized)
        },
      )
    })

    it('counterexample 15: narrowed shapes are refused by the planner before HTTP, history kept', async () => {
      await withFirstRound(model, stream, {}, async ({ first, outcome, requests, invoke }) => {
        const definition = qwenCommercialDefinition(model)
        const thinking = (id: string, details: JsonValue) => ({
          id,
          kind: 'thinking',
          text: '',
          opaque: { routeName: definition.modelId, reasoning_details: details },
          visibility: { toHuman: false, toModel: true },
        })
        const answer = {
          id: 'answer',
          kind: 'text',
          text: 'ALPHA',
          visibility: { toHuman: true, toModel: true },
        }
        const toolCall = (extra: JsonObject) => ({
          id: 'call',
          kind: 'tool_call',
          callId: 'call_bad',
          complete: true,
          visibility: { toHuman: true, toModel: true },
          ...extra,
        })
        const good = visibleDetail(text)
        const narrowed: [string, readonly unknown[]][] = [
          [
            'summary',
            [
              thinking('t', [
                { type: 'reasoning.summary', summary: text, format: 'unknown', index: 0 },
              ]),
              answer,
            ],
          ],
          ['id-bearing detail', [thinking('t', [{ ...good, id: 'rs_1' }]), answer]],
          ['two details in one block', [thinking('t', [good, good]), answer]],
          [
            'two detail blocks',
            [thinking('t1', [good]), thinking('t2', [visibleDetail('more')]), answer],
          ],
          ['array arguments', [toolCall({ tool: 'lookup__exact', arguments: ['a'] })]],
          [
            'unparseable arguments',
            [toolCall({ tool: 'lookup__exact', rawArguments: '{"query":', unparseable: true })],
          ],
        ]
        for (const [name, blocks] of narrowed) {
          const calls = blocks.some(block => object(block) && block.kind === 'tool_call')
          const request: PlanInput = {
            ...first,
            tools: [lookupTool],
            messages: [
              ...first.messages,
              judgedMessage({
                type: 'assistant',
                id: `narrowed-${name}`,
                response: `narrowed-${name}`,
                ending: 'complete',
                createdAt: at,
                blocks,
              }),
              ...(calls ? [qwenToolResult('call_bad')] : []),
              qwenUserTurn(2),
            ],
          }
          const original = JSON.stringify(request.messages)
          expect(await plan(model, request), name).toEqual(sizeUnavailable)
          expect(await invoke(request), name).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
          })
          expect(JSON.stringify(request.messages)).toBe(original)
        }
        expect(requests).toHaveLength(1)
        // Positive controls: the well-formed reply of the first round, and an object-argument
        // call with its result, are still estimates.
        expect(await plan(model, secondRound(first, outcome))).toHaveProperty('planned')
        const objectCall = judgedMessage({
          type: 'assistant',
          id: 'object-call',
          response: 'object-call',
          ending: 'complete',
          createdAt: at,
          blocks: [toolCall({ tool: 'lookup__exact', arguments: { query: 'a' } })],
        })
        expect(
          await plan(model, {
            ...first,
            tools: [lookupTool],
            messages: [...first.messages, objectCall, qwenToolResult('call_bad'), qwenUserTurn(2)],
          }),
        ).toHaveProperty('planned')
      })
    })
  },
)

describe.each(qwenCommercialModels)(
  'QC-V5 counterexample 8: $modelId factory methods called directly',
  model => {
    it('body-only full estimates on the new basis; malformed explicit history is refused; no recursion', async () => {
      const stream = qwenCommercialStreamsFor(model)[1]
      if (!stream) throw new Error('stream missing')
      await withFirstRound(model, stream, {}, async ({ first, outcome }) => {
        // The method under test is the one the factory returns, not a planner or wrapper.
        const definition = qwenCommercialDefinition(model)
        const meter = createQwenInputMeter(definition)
        expect(meter).toMatchObject({
          modelId: model.modelId,
          definitionRevision: '4',
          implementation: { name: 'pi-ai:qwen', revision: 'mp4-20' },
          algorithmRevision: `${model.modelId.slice('qwen/'.length)}-public-template-1`,
          tokenizerRevision:
            model.family === '3.8'
              ? 'tokenizer-basis/qwen-commercial-38-template-wire-order-1'
              : 'tokenizer-basis/qwen-commercial-37-template-wire-order-1',
          replayRevision: 'unsupported-marginal/1',
          transformRevision: 'openrouter-wire/2',
        })
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
        // The new basis: the pinned template under this leaf's settings, counted by an
        // independent tokenizer handle.
        const projected = projectQwenMeterBody(
          Object.fromEntries(Object.entries(fullBase.body).filter(([key]) => key !== 'reasoning')),
        )
        const prompt = projected && renderQwenPrompt(projected, qwenFamilySettings[model.family])
        if (prompt === undefined) throw new Error('new-basis prompt')
        expect(bodyOnly).toEqual({
          kind: 'estimated',
          tokens: tokenizer.encode(prompt, { add_special_tokens: false }).ids.length,
        })
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
              outputHistory: [{ ...group, origin: { ...group.origin, provider: 'alibaba-other' } }],
            },
          ],
          ['serialized mismatch', { ...withHistory, serialized: `${fullBase.serialized} ` }],
          [
            'unexplained details',
            {
              ...fullInputWithoutSource(meter, {
                body: {
                  ...fullBase.body,
                  messages: [
                    ...(Array.isArray(fullBase.body.messages) ? fullBase.body.messages : []),
                    reply({ reasoning_details: [{ ...visibleDetail('x'), id: 'rs' }] }),
                  ],
                },
                serialized: '',
              }),
            },
          ],
        ]
        for (const [name, value] of bad) expect(meter.measureFull(value), name).toEqual(unavailable)

        const replayInput = inputs.replay
        const freshInput = inputs.fresh
        if (!replayInput || !freshInput) throw new Error('planner inputs not captured')
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
