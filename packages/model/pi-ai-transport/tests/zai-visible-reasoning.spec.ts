// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
// ZV2 and ZV3 of the adopted ZAI visible reasoning estimate (revision 1): counterexamples 1–8
// and 10–13 with the template and equivalence oracles, then counterexample 9 on the methods
// the three factories actually return for all five leaves. Archived fragments of both evidence
// batches are merged by the real reader over local TLS; nothing here is an OpenRouter, Z.AI
// or Alibaba upstream observation.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  LosslessNumber,
  readOpaqueJson,
  toOpaqueJson,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { type InvocationOutcome, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { type PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { measureFull } from '../src/input-meter.ts'
import {
  type FullMeterInput,
  type InputMeter,
  type NewMeterInput,
  type ReplayMeterInput,
} from '@omne-harness-lite/model-request-runtime'
import {
  createZaiCommercialInputMeter,
  projectZaiCommercialBody,
  renderZaiCommercialPrompt,
} from '../src/input-meters/zai-commercial.ts'
import { glm5Tokenizer, renderGlm52Prompt } from '../src/input-meters/zai-glm52.ts'
import { renderGlm53Prompt } from '../src/input-meters/zai-glm53.ts'
import { projectZaiHistory } from '../src/input-meters/zai-release.ts'
import { object } from '../src/json.ts'
import { planRequest } from '../src/plan.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { directFull, fullInputWithoutSource } from './direct-full-input.ts'
import { histories, followupBody, jsonBody } from './fixtures/zai/history-cases.ts'
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
  at,
  certificate,
  fixture,
  judgedMessage,
  policy,
  sse,
  type CapturedRequest,
} from './support.ts'
import {
  zaiArchivedFor,
  zaiArchivedStreams,
  zaiDefinition,
  zaiFactory,
  zaiLeaf,
  zaiLeaves,
  zaiMeter,
  zaiPlainWire,
  zaiRequest,
  zaiToolResult,
  zaiUserTurn,
  zv0Leaves,
  type ZaiEffort,
  type ZaiLeaf,
} from './zai-visible-support.ts'

type Complete = Extract<InvocationOutcome, { readonly blocks: unknown }>
const unavailable = { kind: 'unavailable' }
const sizeUnavailable = {
  rejected: 'invalidInput',
  reason: 'input_size_unavailable',
  metrics: ['maxInputTokens'],
}
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const flashx = zaiLeaf('z-ai/glm-5.3-flashx')
// Prime alone moves its explicit `last_message` breakpoint every round.
const isPrime = (leaf: ZaiLeaf) => leaf.provider === 'alibaba'
const flashStream = zaiArchivedStreams.find(stream => stream.model === 'z-ai/glm-5.3-flash')
if (!flashStream) throw new Error('archived Flash stream missing')

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
  for (const leaf of zaiLeaves) zaiMeter(leaf)
}, 120_000)
afterAll(() => cert.dispose())

function assistant(round: number, blocks: Complete['blocks']): Message {
  return judgedMessage({
    type: 'assistant',
    id: `zai-visible-assistant-${round}`,
    response: `zai-visible-response-${round}`,
    ending: 'complete',
    createdAt: at,
    blocks,
  })
}

async function plan(leaf: ZaiLeaf, request: PlanInput, meter?: InputMeter) {
  return planRequest(
    request,
    [zaiDefinition(leaf)],
    meter ?? zaiMeter(leaf),
    { signal: new AbortController().signal },
    testImagePreparerFor(planRequest),
  )
}

/**
 * One real local-TLS round: archived-shape SSE merged by the real reader (or a raw `reply`).
 * `next` then plans and invokes later rounds over the same transport.
 */
async function withFirstRound<T>(
  leaf: ZaiLeaf,
  reply: ArchivedReplyOptions & { readonly stream?: ArchivedStream; readonly raw?: string },
  next: (value: {
    readonly first: PlanInput
    readonly outcome: Complete
    readonly requests: readonly CapturedRequest[]
    readonly invoke: (request: PlanInput) => Promise<InvocationOutcome>
  }) => Promise<T>,
  options: { readonly tools?: boolean; readonly effort?: ZaiEffort } = {},
): Promise<T> {
  const definition = zaiDefinition(leaf)
  const host = await fixture(
    cert.tls,
    (res, captured) => {
      const round = host.requests.indexOf(captured) + 1
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      if (round === 1 && reply.raw !== undefined) res.end(reply.raw)
      else {
        const stream = reply.stream ?? zaiArchivedFor(flashx)[0]
        if (!stream) throw new Error('archived stream missing')
        res.end(archivedReply(leaf, round, stream, reply))
      }
    },
    {},
    undefined,
    [definition],
  )
  const transport = createPiAiTransport({
    ...host.options,
    definitions: [definition],
    inputMeters: [zaiMeter(leaf)],
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
    const initial = zaiRequest(leaf, options)
    const first = { ...initial, messages: [...initial.messages, zaiUserTurn(1)] }
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
  const call = outcome.blocks.find(block => block.kind === 'tool_call')
  const followUp =
    call?.kind === 'tool_call' && call.callId !== undefined
      ? zaiToolResult(call.callId)
      : zaiUserTurn(2)
  return {
    ...first,
    messages: [...first.messages, assistant(1, outcome.blocks), followUp],
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

const goldens = z
  .object({
    jinja2: z.string(),
    templateSha256: z.string(),
    historiesSha256: z.string(),
    goldens: z.array(z.object({ id: z.string(), promptSha256: z.string() })),
    visible: z.object({
      fragmentsSha256: z.string(),
      templateSha256: z.object({
        'glm-5.2': z.string(),
        'glm-5.3': z.string(),
        'glm-5.3-flash': z.string(),
      }),
      tools: z.array(z.record(z.string(), z.unknown())),
      cases: z.array(
        z.object({
          id: z.string(),
          source: z.string(),
          geometry: z.enum(['before-last-user', 'after-last-user']),
          messages: z.array(z.record(z.string(), z.unknown())),
          prompts: z.object({
            'glm-5.2': z.string(),
            'glm-5.2-default': z.string(),
            'glm-5.3': z.string(),
            'glm-5.3-flash': z.string(),
          }),
        }),
      ),
    }),
  })
  .parse(
    JSON.parse(
      readFileSync(
        new URL('./fixtures/zai/history-template-goldens.json', import.meta.url),
        'utf8',
      ),
    ),
  )

describe('ZV2 counterexample 6: template oracle against three pinned Jinja templates', () => {
  const oracle = goldens.visible
  const withDetails = (messages: JsonValue[]) =>
    messages.map(item => {
      if (!object(item) || typeof item.reasoning !== 'string') return item
      const { reasoning, ...rest } = item
      return { ...rest, reasoning_details: [visibleDetail(reasoning)] }
    })
  const withoutReasoning = (messages: JsonValue[]) =>
    messages.map(item => {
      if (!object(item)) return item
      const { reasoning: _reasoning, ...rest } = item
      return rest
    })

  it('pins the oracle inputs: templates, both evidence batches and the Jinja version', () => {
    const file = (path: string) => readFileSync(new URL(path, import.meta.url))
    expect(sha256(file('../tokenizers/zai-glm5/glm-5.2-chat-template.jinja'))).toBe(
      oracle.templateSha256['glm-5.2'],
    )
    expect(sha256(file('../tokenizers/zai-glm5/glm-5.3-chat-template.jinja'))).toBe(
      oracle.templateSha256['glm-5.3'],
    )
    expect(goldens.templateSha256).toBe(oracle.templateSha256['glm-5.3'])
    expect(sha256(file('../tokenizers/zai-glm5/glm-5.3-flash-chat-template.jinja'))).toBe(
      oracle.templateSha256['glm-5.3-flash'],
    )
    expect(sha256(file('./fixtures/zai/visible-reasoning-fragments.json'))).toBe(
      oracle.fragmentsSha256,
    )
    expect(sha256(file('./fixtures/zai/history-complete-streams.json'))).toBe(
      goldens.historiesSha256,
    )
    // 13 archived 2026-09-27 streams (634 frames) and five 2026-09-28 streams (126 frames).
    expect(zaiArchivedStreams).toHaveLength(18)
    expect(zaiArchivedStreams.reduce((sum, stream) => sum + stream.fragments.length, 0)).toBe(760)
    expect(oracle.cases).toHaveLength(36)
  })

  it.each(oracle.cases)(
    '$id: the visible-history renderers equal each pinned template (clear_thinking=false)',
    item => {
      const stream = zaiArchivedStreams.find(value => value.member === item.source)
      if (!stream) throw new Error(`unknown archived source ${item.source}`)
      const reasoning = item.messages.find(message => message.role === 'assistant')?.reasoning
      // The oracle text is exactly the archived fragments in order.
      expect(reasoning).toBe(archivedText(stream))
      const messages = jsonBody({ messages: item.messages }).messages
      const body = (model: string, list: unknown): JsonObject =>
        jsonBody({ model, messages: list, tools: oracle.tools })
      if (!Array.isArray(messages)) throw new Error('case messages')
      const cases = [
        { key: 'glm-5.2', render: (value: JsonObject) => renderGlm52Prompt(value, 'visible') },
        {
          key: 'glm-5.3',
          render: (value: JsonObject) => renderGlm53Prompt(value, false, 'visible'),
        },
        {
          key: 'glm-5.3-flash',
          render: (value: JsonObject) => renderGlm53Prompt(value, true, 'visible'),
        },
      ] as const
      for (const { key, render } of cases) {
        const plain = render(body('z-ai/model', messages))
        if (plain === undefined) throw new Error(`${key}: no prompt`)
        expect(sha256(plain), key).toBe(item.prompts[key])
        // The one visible detail renders exactly like its reasoning string.
        expect(render(body('z-ai/model', withDetails(messages))), key).toBe(plain)
        // A refusing release admits neither representation.
        const refuse =
          key === 'glm-5.2'
            ? (value: JsonObject) => renderGlm52Prompt(value, 'refuse')
            : (value: JsonObject) => renderGlm53Prompt(value, key === 'glm-5.3-flash', 'refuse')
        expect(refuse(body('z-ai/model', messages)), key).toBeUndefined()
        expect(refuse(body('z-ai/model', withDetails(messages))), key).toBeUndefined()
      }
      // GLM-5.2's template default clears reasoning before the last user and keeps it after:
      // recorded for the ZV4 comparison only, it equals our rendering without that reasoning.
      const cleared = renderGlm52Prompt(
        body(
          'z-ai/glm-5.2',
          item.geometry === 'before-last-user' ? withoutReasoning(messages) : messages,
        ),
        'visible',
      )
      expect(sha256(cleared ?? '')).toBe(item.prompts['glm-5.2-default'])
      if (item.geometry === 'after-last-user')
        expect(item.prompts['glm-5.2-default']).toBe(item.prompts['glm-5.2'])
      else expect(item.prompts['glm-5.2-default']).not.toBe(item.prompts['glm-5.2'])
    },
  )

  it.each(histories)(
    '$id: Prime/FlashX production prompt equals the GLM-5.3 golden; estimate is public count − 1',
    row => {
      const body = followupBody(row)
      const prompt = renderZaiCommercialPrompt(body, 'visible')
      if (prompt === undefined) throw new Error('missing production prompt')
      expect(prompt).toContain(`<|assistant|><think>${row.thought}</think>${row.content.trim()}`)
      expect(sha256(prompt)).toBe(goldens.goldens.find(item => item.id === row.id)?.promptSha256)
      const leaf = zaiLeaf(row.model)
      const publicTokens = glm5Tokenizer().encode(prompt, { add_special_tokens: false }).ids.length
      // One constant, applied once: no second offset for the history.
      expect(directFull(zaiMeter(leaf), serialized(body))).toEqual({
        kind: 'estimated',
        tokens: publicTokens - 1,
      })
      // The details form of the same history counts the same.
      if (!Array.isArray(body.messages)) throw new Error('messages')
      const detailed = jsonBody({
        ...body,
        messages: body.messages.map(item =>
          object(item) && item.role === 'assistant' && item.reasoning === row.thought
            ? { role: 'assistant', content: row.content, reasoning_details: [row.detail] }
            : item,
        ),
      })
      expect(directFull(zaiMeter(leaf), serialized(detailed))).toEqual({
        kind: 'estimated',
        tokens: publicTokens - 1,
      })
    },
  )
})

describe('ZV2 counterexample 7: equivalence oracle on the archived streams of every leaf', () => {
  it('real reader merges each archive into one detail; details count == reasoning string count', async () => {
    let checked = 0
    for (const leaf of zaiLeaves) {
      const streams = zaiArchivedFor(leaf)
      expect(streams.length).toBeGreaterThan(0)
      for (const stream of streams)
        await withFirstRound(leaf, { stream }, async ({ first, outcome }) => {
          const text = archivedText(stream)
          expect(mergedDetails(outcome)).toEqual([visibleDetail(text)])
          for (const tools of [false, true])
            for (const effort of leaf.efforts) {
              const base = zaiRequest(leaf, { tools, effort })
              const request = secondRound(
                { ...base, messages: [...base.messages, ...first.messages.slice(2)] },
                outcome,
              )
              const planned = await plan(leaf, request)
              if ('rejected' in planned)
                throw new Error(`${stream.member} ${JSON.stringify(planned)}`)
              const measurement = planned.planned.measurement
              expect(measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
              if (measurement.mode !== 'full') throw new Error('full required')
              const body = planned.planned.body
              const messages = Array.isArray(body.messages) ? body.messages : []
              const wireAssistant = messages.find(item => object(item) && item.role === 'assistant')
              expect(wireAssistant).toMatchObject({ reasoning_details: [visibleDetail(text)] })
              expect(wireAssistant).not.toHaveProperty('reasoning')
              if (effort === undefined) expect(body).not.toHaveProperty('reasoning')
              else expect(body.reasoning).toEqual({ effort })
              expect(body.tools === undefined).toBe(!tools)
              // Prime keeps its one 5m marker on the last message.
              expect(planned.planned.serialized.split('"cache_control"').length).toBe(
                isPrime(leaf) ? 2 : 1,
              )
              const plain = directFull(zaiMeter(leaf), serialized(asReasoningString(body)))
              if (plain.kind !== 'estimated') throw new Error('reasoning string form unavailable')
              expect(writeJsonLossless(measurement.predictedInput)).toBe(
                writeJsonLossless(plain.tokens),
              )
              // The detail text really is counted: removing it lowers the count.
              const none = directFull(
                zaiMeter(leaf),
                serialized({
                  ...body,
                  messages: messages.map(item => {
                    if (!object(item)) return item
                    const { reasoning_details: _details, ...rest } = item
                    return rest
                  }),
                }),
              )
              if (none.kind !== 'estimated') throw new Error('plain body unavailable')
              if (text.length > 0)
                expect(Number(String(plain.tokens))).toBeGreaterThan(Number(String(none.tokens)))
              checked++
            }
        })
    }
    // GLM-5.2: 5 streams × 2 efforts; Prime: 3 × 4; FlashX: 7 × 1; GLM-5.3 (on the Flash
    // archive): 3 × 4; Flash: 3 × 1; each with/without tools.
    expect(checked).toBe((5 * 2 + 3 * 4 + 7 * 1 + 3 * 4 + 3 * 1) * 2)
  }, 300_000)
})

describe.each(zaiLeaves)('$modelId visible reasoning at the meter', leaf => {
  const streams = zaiArchivedFor(leaf)
  const [first, second] = [streams[0], streams[1] ?? streams[0]].map(stream =>
    stream ? archivedText(stream) : undefined,
  )
  if (first === undefined || second === undefined) throw new Error('archived texts required')
  const reply = (extra: JsonObject, content = 'ALPHA'): JsonObject => ({
    role: 'assistant',
    content,
    ...extra,
  })
  const user = (text: string): JsonObject => ({ role: 'user', content: [{ type: 'text', text }] })
  const wire = (history: JsonObject[], effort: ZaiEffort = undefined) =>
    zaiPlainWire(leaf, effort, history)
  const measure = (value: JsonObject) => directFull(zaiMeter(leaf), serialized(value))

  it('counterexample 1: two replies are each counted once; an identical `reasoning` changes nothing', () => {
    const detailed = wire([
      user('a'),
      reply({ reasoning_details: [visibleDetail(first)] }),
      user('b'),
      reply({ reasoning_details: [visibleDetail(second)] }),
    ])
    const counted = measure(detailed)
    if (counted.kind !== 'estimated') throw new Error('details must be counted')
    expect(measure(asReasoningString(detailed))).toEqual(counted)
    const mixed = wire([
      user('a'),
      reply({ reasoning: first }),
      user('b'),
      reply({ reasoning_details: [visibleDetail(second)] }),
    ])
    expect(measure(mixed)).toEqual(counted)
    expect(
      measure(
        wire([
          user('a'),
          reply({ reasoning: first, reasoning_details: [visibleDetail(first)] }),
          user('b'),
          reply({ reasoning: second, reasoning_details: [visibleDetail(second)] }),
        ]),
      ),
    ).toEqual(counted)
    // Absent reasoning renders an empty slot; each text adds its own tokens.
    const one = measure(
      wire([user('a'), reply({ reasoning_details: [visibleDetail(first)] }), user('b'), reply({})]),
    )
    const empty = measure(wire([user('a'), reply({}), user('b'), reply({})]))
    if (one.kind !== 'estimated' || empty.kind !== 'estimated') throw new Error('estimates')
    const tokens = (value: { tokens: unknown }) => Number(String(value.tokens))
    expect(tokens(counted)).toBeGreaterThan(tokens(one))
    expect(tokens(one)).toBeGreaterThan(tokens(empty))
    // A plain empty string is visible empty text: the same count as no reasoning.
    expect(measure(wire([user('a'), reply({ reasoning: '' }), user('b'), reply({})]))).toEqual(
      empty,
    )
  })

  it('counterexample 2: a differing, empty or null `reasoning`, or any `reasoning_content`, is unavailable', () => {
    for (const parallel of [
      { reasoning: `${first}x` },
      { reasoning: first.slice(0, -1) },
      // Compared before any trim: whitespace-only differences still differ.
      { reasoning: ` ${first}` },
      { reasoning: `${first}\n` },
      { reasoning: '' },
      { reasoning: null },
      { reasoning: 7 },
      { reasoning: [first] },
      { reasoning_content: first },
      { reasoning: first, reasoning_content: first },
      { reasoning_content: '' },
    ])
      expect(
        measure(wire([reply({ ...parallel, reasoning_details: [visibleDetail(first)] })])),
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
      ['missing format', [{ type: 'reasoning.text', text: first, index: 0 }]],
      ['missing index', [{ type: 'reasoning.text', text: first, format: 'unknown' }]],
      ['text not string', [{ ...good, text: 7 }]],
    ]
    for (const [name, details] of shapes) {
      const value = wire([reply({ reasoning_details: details })])
      expect(projectZaiHistory(value, 'visible'), name).toBeUndefined()
      expect(measure(value), name).toEqual(unavailable)
    }
    // Index 0 in any exact decimal spelling is the same shape.
    const zero = measure(wire([reply({ reasoning_details: [good] })]))
    expect(zero.kind).toBe('estimated')
    for (const index of ['0.0', '-0', '0e3'])
      expect(
        measure(
          wire([reply({ reasoning_details: [{ ...good, index: new LosslessNumber(index) }] })]),
        ),
        index,
      ).toEqual(zero)

    // Planner: a stored reply replaying any array-of-objects unexplained shape is refused
    // before any HTTP, and the original messages are not changed.
    const request = zaiRequest(leaf)
    const definition = zaiDefinition(leaf)
    for (const [name, details] of shapes) {
      if (!Array.isArray(details) || !details.length || !details.every(object)) continue
      const messages = [
        ...request.messages,
        zaiUserTurn(1),
        judgedMessage({
          type: 'assistant',
          id: 'zai-visible-bad',
          response: 'zai-visible-bad-response',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'zai-visible-bad-thinking',
              kind: 'thinking',
              text: first,
              opaque: { routeName: definition.modelId, reasoning_details: details },
              visibility: { toHuman: false, toModel: true },
            },
            {
              id: 'zai-visible-bad-text',
              kind: 'text',
              text: 'ALPHA',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        }),
        zaiUserTurn(2),
      ]
      const original = JSON.stringify(messages)
      expect(await plan(leaf, { ...request, messages }), name).toEqual(sizeUnavailable)
      expect(JSON.stringify(messages)).toBe(original)
    }
  })

  it('counterexample 4: details off assistant, a lone null `reasoning` and effort outside the domain are unavailable', () => {
    const details = { reasoning_details: [visibleDetail(first)] }
    expect(measure(wire([user('a')])).kind).toBe('estimated')
    expect(
      measure({
        ...wire([]),
        messages: [{ role: 'system', content: 'Answer briefly.', ...details }, user('Turn 1.')],
      }),
    ).toEqual(unavailable)
    expect(measure(wire([{ ...user('a'), ...details }]))).toEqual(unavailable)
    const base = wire([])
    expect(
      measure({
        ...base,
        messages: base.messages.map(item =>
          item.role === 'tool' ? { ...item, ...details } : item,
        ),
      }),
    ).toEqual(unavailable)
    expect(measure(wire([reply({ reasoning: null })]))).toEqual(unavailable)
    expect(measure(wire([reply({ reasoning: 1 })]))).toEqual(unavailable)
    // Effort outside the leaf's current domain stays unavailable, details or not.
    for (const effort of ['low', 'medium', 'high', 'max', 'none'] as const) {
      if (leaf.efforts.includes(effort)) continue
      const value = { ...wire([reply(details)]), reasoning: { effort } }
      expect(measure(value), effort).toEqual(unavailable)
    }
    for (const effort of leaf.efforts)
      expect(measure(wire([reply(details)], effort)).kind, String(effort)).toBe('estimated')
  })

  it('counterexample 8: metering changes neither the body nor its bytes; only the copy is projected', () => {
    const value = wire([reply({ reasoning_details: [visibleDetail(first)] })])
    const bytes = writeJsonLossless(value)
    const snapshot = structuredClone(value)
    expect(measure(value).kind).toBe('estimated')
    expect(writeJsonLossless(value)).toBe(bytes)
    expect(value).toEqual(snapshot)
    expect(bytes).toContain('"reasoning_details":[{"type":"reasoning.text"')
    const projected = projectZaiHistory(value, 'visible')
    expect(projected?.messages).not.toEqual(value.messages)
    if (isPrime(leaf)) {
      // The Prime cache marker leaves only the derived commercial copy.
      expect(bytes).toContain('"cache_control":{"type":"ephemeral","ttl":"5m"}')
      const copy = projectZaiCommercialBody(value, 'z-ai/glm-5.3-prime')
      expect(writeJsonLossless(copy ?? {})).not.toContain('cache_control')
      expect(writeJsonLossless(value)).toBe(bytes)
    }
  })
})

describe.each(zaiLeaves)('$modelId stream-level fragments through the real reader', leaf => {
  const stream = zaiArchivedFor(leaf).find(value => value.fragments.length > 1)
  if (!stream) throw new Error('multi-fragment archived stream missing')
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
        leaf,
        { stream, delta },
        async ({ first, outcome, requests, invoke }) => {
          const details = mergedDetails(outcome)
          expect(Array.isArray(details) && details.length).toBe(1)
          expect(Array.isArray(details) && details[0]).toMatchObject({ text })
          expect(
            Array.isArray(details) && object(details[0]) && Object.hasOwn(details[0], key),
          ).toBe(true)
          const next = secondRound(first, outcome)
          const original = JSON.stringify(next.messages)
          expect(await plan(leaf, next)).toEqual(sizeUnavailable)
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

  it('counterexample 5: two non-adjacent reasoning runs merge into one A+B entry, estimated once as sent', async () => {
    const head = { id: 'gen-local-1', object: 'chat.completion.chunk', model: leaf.modelId }
    const frame = (delta: JsonObject, finish: string | null = null, extra: JsonObject = {}) =>
      sse({ ...head, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })
    const half = Math.ceil(stream.fragments.length / 2)
    const raw =
      stream.fragments
        .slice(0, half)
        .map(fragment => frame(archived(fragment, visibleDetail(fragment))))
        .join('') +
      frame({ content: 'Partial answer. ', role: 'assistant' }) +
      stream.fragments
        .slice(half)
        .map(fragment => frame(archived(fragment, visibleDetail(fragment))))
        .join('') +
      frame({ content: 'Done.', role: 'assistant' }) +
      frame({ content: '', role: 'assistant' }, 'stop', {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        },
      }) +
      sse('[DONE]')
    const joined = stream.fragments.join('')
    await withFirstRound(leaf, { raw }, async ({ first, outcome, requests, invoke }) => {
      // The shared reader keeps one thinking block per reply and joins the id-less unsigned
      // runs across the interleaved content: exactly one entry whose text is A+B.
      expect(outcome.blocks.filter(block => block.kind === 'thinking')).toHaveLength(1)
      expect(mergedDetails(outcome)).toEqual([visibleDetail(joined)])
      const next = secondRound(first, outcome)
      const original = JSON.stringify(next.messages)
      const planned = await plan(leaf, next)
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      const measurement = planned.planned.measurement
      expect(measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      if (measurement.mode !== 'full') throw new Error('full required')
      const invoked = await invoke(next)
      if (!('outcome' in invoked) || invoked.outcome !== 'complete')
        throw new Error(JSON.stringify(invoked))
      expect(requests).toHaveLength(2)
      expect(requests[1]?.body).toBe(planned.planned.serialized)
      // The metered text is the sent text, once: the one sent detail carries A+B, and the
      // estimate equals the same wire with that detail as its `reasoning` string.
      const sent = wireOf(requests[1])
      const sentAssistants = sent.messages.filter(item => object(item) && item.role === 'assistant')
      expect(sentAssistants).toEqual([
        {
          role: 'assistant',
          content: 'Partial answer. Done.',
          reasoning_details: [visibleDetail(joined)],
        },
      ])
      const plain = directFull(zaiMeter(leaf), serialized(asReasoningString(sent.body)))
      if (plain.kind !== 'estimated') throw new Error('reasoning string form unavailable')
      expect(writeJsonLossless(measurement.predictedInput)).toBe(writeJsonLossless(plain.tokens))
      expect(JSON.stringify(next.messages)).toBe(original)
    })
  })

  it('counterexamples 5, 8 and 10: id-less unsigned fragments replay as one detail, full only', async () => {
    await withFirstRound(leaf, { stream }, async ({ first, outcome, requests, invoke }) => {
      expect(mergedDetails(outcome)).toEqual([visibleDetail(text)])
      const next = secondRound(first, outcome, true)
      const original = JSON.stringify(next.messages)
      const { meter, calls } = trackedMeter(zaiMeter(leaf))
      const planned = await plan(leaf, next, meter)
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      // Counterexample 10: the observation is usable, measurement is full; φ/δ stay
      // unavailable (Prime's moved breakpoint falls back before they are asked).
      expect(planned.planned.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      if (planned.planned.measurement.mode !== 'full') throw new Error('full required')
      if (isPrime(leaf)) {
        expect(planned.planned.measurement.fallbackReason).toBe('prefix_changed')
        expect([...calls.replay, ...calls.fresh]).toEqual([])
      } else {
        expect(planned.planned.measurement.fallbackReason).toBeUndefined()
        expect(calls.replay).toEqual([unavailable])
        expect(calls.fresh).toEqual([unavailable])
      }
      // Counterexample 8: the planned bytes are the HTTP bytes and keep the details.
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

  it('counterexample 11: a details-only stream (no parallel `reasoning`) replays as an estimate', async () => {
    await withFirstRound(
      leaf,
      {
        stream,
        delta: fragment => ({
          content: '',
          role: 'assistant',
          reasoning_details: [visibleDetail(fragment)],
        }),
      },
      async ({ first, outcome, requests, invoke }) => {
        expect(mergedDetails(outcome)).toEqual([visibleDetail(text)])
        const next = secondRound(first, outcome)
        const planned = await plan(leaf, next)
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
        const invoked = await invoke(next)
        if (!('outcome' in invoked) || invoked.outcome !== 'complete')
          throw new Error(JSON.stringify(invoked))
        expect(requests).toHaveLength(2)
        expect(requests[1]?.body).toBe(planned.planned.serialized)
      },
    )
  })
})

describe('counterexample 12: mixed opaque/plain and foreign-route opaque stay refused by planning', () => {
  it('no meter call and zero HTTP; the original messages are unchanged', async () => {
    const thinking = (id: string, text: string, routeName?: string) => ({
      id,
      kind: 'thinking',
      text,
      ...(routeName
        ? {
            opaque: toOpaqueJson({
              routeName,
              reasoning_details: [visibleDetail(text)],
            }),
          }
        : {}),
      visibility: { toHuman: false, toModel: true },
    })
    const prime = zaiLeaf('z-ai/glm-5.3-prime')
    const cases: [ZaiLeaf, Message][] = [
      [
        flashx,
        judgedMessage({
          type: 'assistant',
          id: 'mixed',
          response: 'mixed-response',
          ending: 'complete',
          createdAt: at,
          blocks: [thinking('a', 'opaque A', flashx.modelId), thinking('b', 'unique plain B')],
        }),
      ],
      [
        prime,
        judgedMessage({
          type: 'assistant',
          id: 'foreign',
          response: 'foreign-response',
          ending: 'complete',
          createdAt: at,
          blocks: [
            thinking('a', 'FlashX history', flashx.modelId),
            { id: 't', kind: 'text', text: 'ALPHA', visibility: { toHuman: true, toModel: true } },
          ],
        }),
      ],
    ]
    for (const [leaf, stored] of cases) {
      const request = zaiRequest(leaf)
      const messages = [...request.messages, zaiUserTurn(1), stored, zaiUserTurn(2)]
      const original = JSON.stringify(messages)
      const { meter, calls } = trackedMeter(zaiMeter(leaf))
      const host = await fixture(cert.tls, res => res.end('unexpected'), {}, undefined, [
        zaiDefinition(leaf),
      ])
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [zaiDefinition(leaf)],
        inputMeters: [meter],
      })
      try {
        expect(await plan(leaf, { ...request, messages }, meter)).toEqual({
          rejected: 'unavailable',
        })
        const outcome = await invokeModel({
          ...request,
          messages,
          transport,
          credential: 'controlled-test-only',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        expect(outcome).toEqual({ rejected: 'unavailable' })
        expect(calls.full).toEqual([])
        expect(host.requests).toHaveLength(0)
        expect(JSON.stringify(messages)).toBe(original)
      } finally {
        await transport.close()
        await host.close()
      }
    }
  })
})

// Counterexample 13 guarded the second batch while it kept its refusing release. After ZV0
// (2026-09-30: GLM-5.3 `max` 139 and Flash default 78 detail frames, all exactly the archived
// four-key shape) both leaves are released; this is the positive side of that split.
describe.each(zv0Leaves)('counterexample 13 after ZV0: $modelId is released', leaf => {
  const flash = leaf.modelId === 'z-ai/glm-5.3-flash'
  const text = archivedText(flashStream)
  const tokens = (prompt: string | undefined) => {
    if (prompt === undefined) throw new Error('template rendering refused')
    return glm5Tokenizer().encode(prompt, { add_special_tokens: false }).ids.length
  }
  it('definition 3 / mp4-18 at new unique coordinates; the retired refusing release throws', () => {
    expect(zaiDefinition(leaf)).toMatchObject({
      revision: '3',
      implementation: { name: 'pi-ai:zai', revision: 'mp4-18' },
    })
    const meter = zaiMeter(leaf)
    const template = flash ? 'glm-5.3-flash-public-template' : 'glm-5.3-public-template'
    expect(meter.algorithmRevision).toBe(`${template}-2`)
    // The tokenizer and template are unchanged: the basis stays pinned at the old default.
    expect(meter.tokenizerRevision).toBe(`tokenizer-basis/${template}-1`)
    expect(meter.evidence).toContain('visible reasoning history')
    expect(meter.evidence).toContain(
      flash
        ? 'ZV0 2026-09-30 default effort: one Z.AI stream, 78/78 detail frames'
        : 'ZV0 2026-09-30 effort max: one Z.AI stream, 139/139 detail frames',
    )
    for (const retired of [
      { revision: '2', implementation: { name: 'pi-ai:zai', revision: 'mp4-17' } },
      { revision: '3', implementation: { name: 'pi-ai:zai', revision: 'mp4-17' } },
      { revision: '2', implementation: { name: 'pi-ai:zai', revision: 'mp4-18' } },
    ])
      expect(() => zaiFactory(leaf)({ ...zaiDefinition(leaf), ...retired })).toThrow(TypeError)
  })

  it('plain and details history are estimated at the template think-slot rendering', () => {
    const meter = zaiMeter(leaf)
    const measure = (value: JsonObject) => directFull(meter, serialized(value))
    for (const effort of leaf.efforts) {
      // Input without reasoning keeps its pre-release value.
      expect(measure(zaiPlainWire(leaf, effort))).toEqual({ kind: 'estimated', tokens: 199 })
      const plainBody = zaiPlainWire(leaf, effort, [
        { role: 'assistant', content: 'ALPHA', reasoning: text },
      ])
      const prompt = renderGlm53Prompt(plainBody, flash, 'visible')
      expect(prompt).toContain(`<|assistant|><think>${text}</think>ALPHA`)
      const expected = { kind: 'estimated', tokens: tokens(prompt) }
      expect(tokens(prompt)).toBeGreaterThan(199)
      for (const history of [
        { role: 'assistant', content: 'ALPHA', reasoning: text },
        { role: 'assistant', content: 'ALPHA', reasoning_details: [visibleDetail(text)] },
        {
          role: 'assistant',
          content: 'ALPHA',
          reasoning: text,
          reasoning_details: [visibleDetail(text)],
        },
      ])
        expect(measure(zaiPlainWire(leaf, effort, [history])), String(effort)).toEqual(expected)
    }
  })

  it('round 2 through the real reader and planner is full/estimated at the slot rendering and sent', async () => {
    await withFirstRound(
      leaf,
      { stream: flashStream },
      async ({ first, outcome, requests, invoke }) => {
        expect(mergedDetails(outcome)).toEqual([visibleDetail(text)])
        const next = secondRound(first, outcome)
        const planned = await plan(leaf, next)
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        const measurement = planned.planned.measurement
        expect(measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
        if (measurement.mode !== 'full') throw new Error('full required')
        const slot = renderGlm53Prompt(asReasoningString(planned.planned.body), flash, 'visible')
        expect(slot).toContain(`<think>${text}</think>`)
        expect(writeJsonLossless(measurement.predictedInput)).toBe(writeJsonLossless(tokens(slot)))
        const sent = await invoke(next)
        expect(sent).toMatchObject({ outcome: 'complete' })
        expect(requests).toHaveLength(2)
        // The wire keeps the one merged detail; only the meter's copy became a string.
        expect(requests[1]?.body).toBe(planned.planned.serialized)
        expect(planned.planned.serialized).toContain(
          '"reasoning_details":[{"type":"reasoning.text"',
        )
      },
    )
  })
})

describe.each(zaiLeaves)(
  'ZV3 counterexample 9: $modelId factory methods run the shared guard',
  leaf => {
    it('body-only full equals the pre-wiring value; malformed explicit history is refused; no recursion', async () => {
      // The method under test is the one the factory returns, not a planner or wrapper.
      const meter = zaiFactory(leaf)(zaiDefinition(leaf))
      // The public-template count is 199 on every leaf; Prime/FlashX subtract their one token.
      const pinned = isPrime(leaf) || leaf.modelId === flashx.modelId ? 198 : 199
      for (const effort of leaf.efforts) {
        const body = zaiPlainWire(leaf, effort)
        const input = fullInputWithoutSource(meter, serialized(body))
        // Values of the same bodies from the unwired 63980767 factories: no leaf changed.
        expect(meter.measureFull(input)).toEqual({ kind: 'estimated', tokens: pinned })
        expect(measureFull(meter, input)).toEqual({ kind: 'estimated', tokens: pinned })
      }
      const stream = zaiArchivedFor(leaf)[0]
      if (!stream) throw new Error('archived stream missing')
      await withFirstRound(
        leaf,
        { stream },
        async ({ first, outcome }) => {
          const tracked = trackedMeter(meter)
          const inputs: { replay?: ReplayMeterInput; fresh?: NewMeterInput } = {}
          const spying: InputMeter = {
            ...tracked.meter,
            measureReplay(value) {
              inputs.replay = value
              return tracked.meter.measureReplay(value)
            },
            measureNew(value) {
              inputs.fresh = value
              return tracked.meter.measureNew(value)
            },
          }
          const next = secondRound(first, outcome, true)
          const planned = await plan(leaf, next, spying)
          if ('rejected' in planned) throw new Error(JSON.stringify(planned))
          expect(tracked.calls.full.every(value => value.kind === 'estimated')).toBe(true)
          const fullBase = { body: planned.planned.body, serialized: planned.planned.serialized }
          const bodyOnly = meter.measureFull(fullInputWithoutSource(meter, fullBase))
          expect(bodyOnly).toMatchObject({ kind: 'estimated' })
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
                    replaySelection: group.replaySelection.map(item => ({
                      ...item,
                      blockIndex: 0,
                    })),
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
                outputHistory: [{ ...group, origin: { ...group.origin, provider: 'z-ai/other' } }],
              },
            ],
            ['serialized mismatch', { ...withHistory, serialized: `${fullBase.serialized} ` }],
          ]
          for (const [name, value] of bad)
            expect(meter.measureFull(value), name).toEqual(unavailable)

          // φ/δ on the factory methods: malformed is invalidInput, valid is still unsupported.
          expect(meter.replayRevision).toBe('unsupported-marginal/1')
          const replayInput = inputs.replay
          const freshInput = inputs.fresh
          if (isPrime(leaf)) {
            // Prime's moved breakpoint falls back before the planner asks φ/δ.
            expect(replayInput).toBeUndefined()
            return
          }
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
        },
        { tools: true },
      )
    })
  },
)
