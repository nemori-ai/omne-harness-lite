import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import {
  judgeModelRequest,
  judgeReplayDeclaration,
  type TransportFact,
} from '@omne-harness/model-contract/provider'
import {
  composeFamilies,
  type PiChatBinding,
  type PiMaterializedMedia,
} from '@omne-harness/pi-ai-transport'
import { fixtureDirectory } from '@omne-harness/pi-ai-transport/testing'
import { DEEPSEEK_RECORDS, officialDeepSeekProfiles } from '../src/index.ts'
import { FAMILY } from './support/deepseek.ts'

const route = 'deepseek/deepseek-v4.1-flash'
const record = DEEPSEEK_RECORDS.find(row => row.name === route)
if (!record) throw Error('missing recorded vision route')
const directory = join(
  fileURLToPath(new URL('./fixtures/records/', import.meta.url)),
  fixtureDirectory(record),
)
const checked = (input: unknown) => {
  const result = judgeModelRequest('llm', input)
  if ('failure' in result) throw Error(JSON.stringify(result.failure))
  return result.ok
}
const request = checked(JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8')).request)
async function withBinding(
  test: (binding: PiChatBinding) => Promise<void>,
  supplier = request.suppliers[0],
) {
  const result = await composeFamilies([FAMILY]).acquire(supplier, new AbortController().signal)
  if ('failure' in result) throw Error(JSON.stringify(result.failure))
  try {
    await test(result.ok)
  } finally {
    await result.ok.release()
  }
}
function encoded(
  binding: PiChatBinding,
  input = request,
  media: readonly PiMaterializedMedia[] = [],
) {
  const result = binding.encode({
    request: input,
    declaration: input.declarations[0],
    media,
    resent: [],
  })
  if ('failure' in result) throw Error(JSON.stringify(result.failure))
  return result.ok
}
it('refuses non-object tool schemas with the adoption that refused them', () =>
  withBinding(async binding => {
    const tool = request.tools[0]
    if (!tool) throw Error('missing recorded tool declaration')
    expect(
      binding.tools.convertToModelPayload({
        ...tool,
        argumentsSchema: { kind: 'boolean', value: true },
      }),
    ).toEqual({
      failure: { kind: 'unsupported', field: 'argumentsSchema', adapter: binding.adoption },
    })
  }))
it('rejects missing or mistyped counting fields before producing an input estimate', () =>
  withBinding(async binding => {
    const profile = officialDeepSeekProfiles({
      retryPolicy: request.retryPolicy,
      compactionTriggerPercent: '80',
    }).find(p => p.suppliers[0].model === route)
    if (!profile) throw Error('missing profile')
    const representation = encoded(binding).representation
    const limits = {
      maxBytes: 256,
      maxDepth: 8,
      maxItems: 8,
      maxMembers: 8,
      maxStringLength: 32,
      maxNumberLength: 8,
    }
    for (const json of ['{}', '{"messages":[{}]}', '{"messages":[{"content":[{"type":true}]}]}']) {
      const parsed = readJsonText(json, limits)
      if (parsed.kind !== 'ok') throw Error('invalid test JSON')
      expect(
        await binding.meter.measure({
          profile: request.profile,
          supplier: profile.suppliers[0],
          context: profile.context,
          limits: profile.limits,
          assembled: request,
          parameters: request.parameterAdoptions,
          representation: { ...representation, tokenInput: parsed.value },
        }),
      ).toMatchObject({ failure: { kind: 'invalid', field: 'tokenInput', reason: 'schema' } })
    }
  }))
it('counts the format and detail of inline and referenced images without counting their bytes as words', () =>
  withBinding(async binding => {
    const inline =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC',
      'base64',
    )
    const reference = {
      storage: 'test',
      key: 'picture',
      digest: 'fce481932ea5d07a91c7991c09fdadb4bf78f9b4cc8f927188384231f9d12679',
      bytes: String(bytes.length),
      mediaType: 'image/png',
    }
    const image = { kind: 'image', visibility: { toHuman: true, toModel: true } }
    const facts = { kind: 'image' as const, widthPixels: 1, heightPixels: 1 }
    const measurement = {
      reference,
      mediaType: reference.mediaType,
      bytes: reference.bytes,
      kind: facts.kind,
      widthPixels: '1',
      heightPixels: '1',
    }
    const referenced = { ...image, id: 'two', ref: reference, transcript: null, facts }
    const next = checked({
      ...request,
      messages: [
        {
          id: 'msg_' + 'c'.repeat(22),
          role: 'user',
          blocks: [{ ...image, id: 'one', mediaType: reference.mediaType, inline }, referenced],
        },
      ],
    })
    const media = [{ reference, bytes, mime: reference.mediaType, measurement }]
    const output = encoded(binding, next, media)
    const wire = JSON.parse(writeJsonText(output.body)).messages.at(-1).content
    const counted = JSON.parse(writeJsonText(output.representation.tokenInput)).messages.at(
      -1,
    ).content
    expect(wire).toEqual(
      [inline, bytes.toString('base64')].map(data => ({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,' + data, detail: 'auto' },
      })),
    )
    expect(counted).toEqual(
      Array.from({ length: 2 }, () => ({ type: 'image', mediaType: 'image/png', detail: 'auto' })),
    )

    const profile = officialDeepSeekProfiles({
      retryPolicy: request.retryPolicy,
      compactionTriggerPercent: '80',
    }).find(p => p.suppliers[0].model === route)
    if (!profile) throw Error('missing vision profile')
    const measure = (assembled: typeof next) =>
      binding.meter.measure({
        profile: assembled.profile,
        supplier: profile.suppliers[0],
        context: profile.context,
        limits: profile.limits,
        assembled,
        parameters: assembled.parameterAdoptions,
        representation: encoded(binding, assembled, media).representation,
      })
    const single = checked({ ...next, messages: [{ ...next.messages[0], blocks: [referenced] }] })
    const metered = await measure(single)
    if ('failure' in metered) throw Error(JSON.stringify(metered.failure))
    expect(metered.ok.checks.find(check => check.metric === 'input-tokens')?.measurement.kind).toBe(
      'estimate',
    )
    expect(await measure(next)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'image-measurement-missing' },
    })
  }))
it('preserves tool arguments, results and replay information from a recorded continuation', () =>
  withBinding(async binding => {
    const first = encoded(binding)
    const facts = JSON.parse(readFileSync(join(directory, 'facts.json'), 'utf8')) as TransportFact[]
    const blocks = facts.filter(f => f.kind === 'block-seal').map(f => f.block)
    const state = blocks.find(b => b.kind === 'reasoning_state')
    const call = blocks.find(b => b.kind === 'tool_call')
    if (!state?.payload || !call?.callId || !call.arguments)
      throw Error('missing recorded reasoning and tool call')
    const visibility = { toHuman: true, toModel: true }
    const assistant = {
      id: 'msg_' + 'a'.repeat(22),
      role: 'assistant',
      blocks,
      replay: {
        scope: 'openrouter/' + route,
        format: binding.replayFormat,
        at: [blocks.indexOf(state)],
        prefix: first.replayPrefix,
      },
    }
    const tool = {
      id: 'msg_' + 'b'.repeat(22),
      role: 'tool',
      blocks: [
        { kind: 'tool_result', id: 'result', callId: call.callId, visibility },
        { kind: 'text', id: 'ticket', text: 'ticket 428', visibility },
      ],
    }
    function continuation(turn: unknown) {
      return encoded(binding, checked({ ...request, messages: [...request.messages, turn, tool] }))
    }
    const next = continuation(assistant)
    const wire = JSON.parse(writeJsonText(next.body))
    const counted = JSON.parse(writeJsonText(next.representation.tokenInput))
    const args = writeJsonText(call.arguments)
    expect(wire.messages.at(-2)).toMatchObject({
      reasoning_details: [JSON.parse(state.payload)],
      tool_calls: [{ id: call.callId, function: { name: call.name, arguments: args } }],
    })
    expect(counted.messages.at(-2)).toEqual({
      role: 'assistant',
      reasoning_details: { opaque: 1 },
      content: [{ type: 'tool_call', id: call.callId, name: call.name, arguments: args }],
    })
    expect(counted.messages.at(-1)).toEqual({
      role: 'tool',
      content: [
        { type: 'tool_result', id: call.callId },
        { type: 'text', text: 'ticket 428' },
      ],
    })
    const thinking = blocks.find(block => block.kind === 'thinking')
    if (!thinking?.text) throw Error('missing recorded thinking')
    const plain = continuation({
      ...assistant,
      blocks: [thinking, call],
      replay: { ...assistant.replay, at: [] },
    })
    for (const projection of [plain.body, plain.representation.tokenInput]) {
      const turn = JSON.parse(writeJsonText(projection)).messages.at(-2)
      expect(turn.reasoning).toBe(thinking.text)
      expect(turn).not.toHaveProperty('reasoning_details')
    }
    const raw = '{"id":'
    const unparsed = {
      kind: 'tool_call_unparsed',
      id: 'bad',
      visibility,
      name: call.name,
      callId: call.callId,
      raw,
    }
    const damaged = continuation({ id: assistant.id, role: 'assistant', blocks: [unparsed] })
    const serialized = JSON.parse(writeJsonText(damaged.body))
    const estimate = JSON.parse(writeJsonText(damaged.representation.tokenInput))
    expect(serialized.messages.at(-2).tool_calls[0].function.arguments).toBe(raw)
    expect(estimate.messages.at(-2).content[0].arguments).toBe(raw)
  }))

it.each(
  officialDeepSeekProfiles({ retryPolicy: request.retryPolicy, compactionTriggerPercent: '80' }),
)(
  'projects open object parameters for the configured route on the wire and in the meter ($suppliers.0.model)',
  async profile => {
    const { provider, model, adoption } = profile.suppliers[0]
    const declaration = judgeReplayDeclaration(profile.suppliers[0], 0)
    if ('failure' in declaration) throw Error('invalid replay declaration')
    const bare = { type: 'object' }
    const schema = {
      type: 'object',
      properties: {
        options: bare,
        forbidden: false,
        label: { type: 'string' },
        note: { description: 'object' },
        format: { enum: [bare], default: bare },
        limited: { type: 'object', additionalProperties: false },
        nested: { type: 'object', properties: { inner: bare } },
      },
      const: { options: bare },
      default: bare,
      required: ['options'],
      additionalProperties: false,
    }
    const asJson = readJsonText(JSON.stringify(schema), {
      maxDepth: 12,
      maxMembers: 256,
      maxItems: 256,
      maxBytes: 4096,
      maxStringLength: 256,
      maxNumberLength: 12,
    })
    if (asJson.kind !== 'ok') throw Error(JSON.stringify(asJson))
    const input = checked({
      ...request,
      suppliers: [{ provider, model, adoption, credential: { layer: 'official' } }],
      representation: profile.representation,
      declarations: [declaration.ok],
      tools: [{ name: 'dispatch', description: 'Read an item.', argumentsSchema: asJson.value }],
    })
    const expected =
      model === 'deepseek/deepseek-v3.2-exp'
        ? {
            ...schema,
            properties: {
              ...schema.properties,
              options: { type: 'object', properties: {}, additionalProperties: true },
            },
          }
        : schema
    await withBinding(async binding => {
      const out = encoded(binding, input)
      const wire = JSON.parse(writeJsonText(out.body))
      const meter = JSON.parse(writeJsonText(out.representation.tokenInput))
      expect(wire.tools[0].function.parameters).toEqual(expected)
      expect(meter.tools[0].parameters).toEqual(expected)
      expect(input.tools.map(tool => JSON.parse(writeJsonText(tool.argumentsSchema)))).toEqual([
        schema,
      ])
    }, input.suppliers[0])
  },
)
