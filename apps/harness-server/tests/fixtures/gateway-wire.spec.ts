import { writeJsonText } from '@omne-harness/json-text'
import type { Adoption, FixedModelRequest, Supplier } from '@omne-harness/model-contract'
import {
  judgeFixedModelRequest,
  judgeReplayDeclaration,
  type TransportFact,
} from '@omne-harness/model-contract/provider'
import {
  recordAdoption,
  recordProvider,
  type PiFamilyBinding,
  type PiModelRecordHead,
} from '@omne-harness/pi-ai-transport'
import {
  OPENROUTER_ACCOUNTING,
  type ChatCompletionsLimits,
  type FamilyMeter,
  type ParameterTable,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { bindMessages } from '@omne-harness/pi-ai-transport/messages'
import { bindResponses } from '@omne-harness/pi-ai-transport/responses'
import { replayStream } from '@omne-harness/pi-ai-transport/testing'
import { describe, expect, it } from 'vitest'
import { renderReply } from './gateway-wire.ts'
import type { GatewayAnswer } from './model-gateway.ts'

const RESPONSES = '/api/v1/responses'
const MESSAGES = '/api/v1/messages'
const CHAT = '/api/v1/chat/completions'
const OWNER = '@omne-harness/harness-server-gateway-test'
const FORMAT = 'lab-v1'

function adoption(name: string): Adoption {
  return { owner: 'gateway-test', name, revision: '1', digest: 'a'.repeat(64) }
}

const UNSUPPORTED = { support: 'unsupported' } as const
const PARAMETERS: ParameterTable = {
  temperature: UNSUPPORTED,
  'top-p': UNSUPPORTED,
  'max-output-tokens': {
    support: 'supported',
    default: { kind: 'absent' },
    accept: { max: '4096' },
    wire: { field: 'max_tokens' },
  },
  stop: UNSUPPORTED,
  'reasoning-effort': UNSUPPORTED,
  seed: UNSUPPORTED,
  'frequency-penalty': UNSUPPORTED,
  'presence-penalty': UNSUPPORTED,
}

const HEAD = {
  revision: '1',
  route: { provider: 'gateway', model: 'lab/model-a' },
  status: 'current',
  serving: { order: ['lab'], reports: ['Lab'] },
  parameters: PARAMETERS,
  extensions: [],
  accepts: { forcedToolChoice: false, endsWithAssistant: false },
  replay: { declaration: {}, formats: { produces: FORMAT, accepts: [FORMAT] }, binding: 'none' },
} as const

const LIMITS: ChatCompletionsLimits = {
  toolArguments: {
    maxBytes: 4_096,
    maxDepth: 16,
    maxItems: 256,
    maxMembers: 64,
    maxStringLength: 4_096,
    maxNumberLength: 32,
  },
  maxReasoningText: 4_096,
}

function supplierOf(record: PiModelRecordHead): Supplier {
  return {
    adoption: recordAdoption(OWNER, record),
    provider: recordProvider(record),
    model: record.route.model,
    credential: { layer: 'official' },
  }
}

function meterOf(supplier: Supplier): FamilyMeter {
  const unavailable = () =>
    Promise.resolve({
      failure: { kind: 'unavailable', dependency: 'meter', diagnostic: 'test' } as const,
    })
  return {
    instance: {
      basis: {
        supplier: {
          adoption: supplier.adoption,
          provider: supplier.provider,
          model: supplier.model,
        },
        meter: adoption('meter'),
        tokenization: { kind: 'not-used', method: adoption('method') },
        prompt: { kind: 'provider-private', estimation: adoption('estimation') },
        projection: adoption('projection'),
        mediaTransform: adoption('media-transform'),
        replay: adoption('replay'),
        evidence: adoption('evidence'),
      },
      measure: unavailable,
      measureCalibrated: unavailable,
    },
    represent: () => {
      throw new Error('decoding does not represent a request')
    },
  }
}

function requestOf(supplier: Supplier): FixedModelRequest {
  const declaration = judgeReplayDeclaration(
    { provider: HEAD.route.provider, model: HEAD.route.model, replay: {} },
    0,
  )
  if (!('ok' in declaration)) throw new Error('test declaration refused')
  const judged = judgeFixedModelRequest({
    profile: adoption('profile'),
    suppliers: [supplier],
    fallback: false,
    retryPolicy: adoption('retry'),
    parameters: [],
    system: [],
    messages: [
      {
        id: `msg_${'u1'.padEnd(22, '0')}`,
        role: 'user',
        blocks: [
          { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true }, text: 'hi' },
        ],
      },
    ],
    tools: [],
    toolChoice: 'auto',
    declarations: [declaration.ok],
    representation: adoption('representation'),
    parameterAdoptions: [],
    source: adoption('source'),
  })
  if (!('ok' in judged)) throw new Error(`test request refused: ${JSON.stringify(judged.failure)}`)
  return judged.ok
}

type Engine = Readonly<{ binding: PiFamilyBinding; request: FixedModelRequest }>

function responsesEngine(): Engine {
  const record = {
    ...HEAD,
    name: 'model-r',
    engine: 'responses',
    wire: {
      system: 'developer',
      cache: { kind: 'none' },
      image: null,
      reasoning: { summary: null },
      toolNames: { rule: 'underscore/1', maxLength: 64 },
    },
  } as const
  const supplier = supplierOf(record)
  const binding = bindResponses({
    record,
    supplier,
    meter: meterOf(supplier),
    limits: LIMITS,
    release: () => Promise.resolve(),
  })
  return { binding, request: requestOf(supplier) }
}

function messagesEngine(): Engine {
  const record = {
    ...HEAD,
    name: 'model-m',
    engine: 'messages',
    wire: {
      cache: { kind: 'none' },
      image: null,
      thinking: { display: null },
      toolNames: { rule: 'underscore/1', maxLength: 64 },
    },
  } as const
  const supplier = supplierOf(record)
  const binding = bindMessages({
    record,
    supplier,
    meter: meterOf(supplier),
    limits: LIMITS,
    release: () => Promise.resolve(),
  })
  return { binding, request: requestOf(supplier) }
}

const ENGINES: Readonly<Record<string, () => Engine>> = {
  [RESPONSES]: responsesEngine,
  [MESSAGES]: messagesEngine,
}

/** What the decoder of one interface made of a rendered stream. */
type Decoded = Readonly<{
  texts: readonly string[]
  calls: readonly Readonly<{ callId: string; name: string; arguments: string }>[]
  state: unknown
  termination: unknown
  usage: Readonly<Record<string, string>>
  cost: readonly string[]
}>

function decodedOf(facts: readonly TransportFact[]): Decoded {
  const blocks = facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact.block] : []))
  const account = facts.flatMap(fact => (fact.kind === 'account' ? [fact.value] : []))
  const state = blocks.flatMap(block => (block.kind === 'reasoning_state' ? [block.payload] : []))
  return {
    texts: blocks.flatMap(block => (block.kind === 'text' ? [block.text] : [])),
    calls: blocks.flatMap(block =>
      block.kind === 'tool_call'
        ? [{ callId: block.callId, name: block.name, arguments: writeJsonText(block.arguments) }]
        : [],
    ),
    state: state.map(payload => JSON.parse(payload) as unknown),
    termination: facts.findLast(fact => fact.kind === 'ended'),
    usage: Object.fromEntries(
      account.flatMap(report =>
        report.usage.map(item => [item.name, item.state === 'known' ? item.lexeme : 'unknown']),
      ),
    ),
    cost: account.flatMap(report =>
      report.cost.flatMap(item => (item.state === 'known' ? [item.lexeme] : [])),
    ),
  }
}

async function decode(path: string, body: string): Promise<Decoded> {
  const engine = ENGINES[path]
  if (engine === undefined) throw new Error(`no engine for ${path}`)
  const { binding, request } = engine()
  const bytes = new TextEncoder().encode(body)
  return decodedOf(await replayStream(binding, bytes, request, OPENROUTER_ACCOUNTING))
}

const sse = (frames: readonly unknown[]): string =>
  `${frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('')}data: [DONE]\n\n`

const stream = (body: string): GatewayAnswer => ({
  status: 200,
  contentType: 'text/event-stream',
  body,
})

function rendered(path: string, frames: readonly unknown[]): string {
  return renderReply(path, stream(sse(frames))).body
}

const serving = { model: 'lab/model-a', provider: 'Lab' }
const encrypted = (id: string, data: string) => ({
  type: 'reasoning.encrypted',
  id,
  index: 0,
  format: 'openai-responses-v1',
  data,
})

const TEXT_ONLY = [
  { ...serving, choices: [{ delta: { role: 'assistant', content: 'Oslo is' } }] },
  { ...serving, choices: [{ delta: { content: ' further north.' } }] },
  { choices: [{ delta: {}, finish_reason: 'stop' }] },
]

const REASONING_AND_TEXT = [
  { ...serving, choices: [{ delta: { reasoning_details: [encrypted('rs_a', 'SEALED-A')] } }] },
  { ...serving, choices: [{ delta: { content: 'Cut sho' } }] },
  { choices: [{ delta: {}, finish_reason: 'length' }] },
]

const REASONING_AND_CALLS = [
  { ...serving, choices: [{ delta: { reasoning_details: [encrypted('rs_b', 'SEALED-B')] } }] },
  {
    ...serving,
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":' },
            },
          ],
        },
      },
    ],
  },
  { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Oslo"}' } }] } }] },
  {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 1,
              id: 'call_2',
              type: 'function',
              function: { name: 'get_time', arguments: '{"zone":"CET"}' },
            },
          ],
        },
      },
    ],
  },
  { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  {
    ...serving,
    choices: [],
    usage: {
      prompt_tokens: 40,
      completion_tokens: 30,
      total_tokens: 70,
      prompt_tokens_details: { cached_tokens: 8 },
      completion_tokens_details: { reasoning_tokens: 12 },
      cost: 0.00042,
    },
  },
]

const UNKNOWN_USAGE = {
  input: 'unknown',
  output: 'unknown',
  'cache-read': 'unknown',
  'cache-write': 'unknown',
  reasoning: 'unknown',
}

const KNOWN_USAGE = {
  input: '40',
  output: '30',
  'cache-read': '8',
  'cache-write': 'unknown',
  reasoning: '12',
}

const CALLS = [
  { callId: 'call_1', name: 'get_weather', arguments: '{"city":"Oslo"}' },
  { callId: 'call_2', name: 'get_time', arguments: '{"zone":"CET"}' },
]

const message = (id: string) => ({ id, parts: 1, phase: 'final_answer', type: 'message' })
const reasoningItem = (id: string, data: string) => ({
  item: {
    encrypted_content: data,
    format: 'openai-responses-v1',
    id,
    summary: [],
    type: 'reasoning',
  },
  type: 'reasoning',
})
const thinking = (signature: string) => ({ signature, thinking: '', type: 'thinking' })
const ended = (reason: string) => ({ kind: 'ended', termination: { kind: 'completed', reason } })

describe('renderReply: the chat answer of a script, on the Responses interface', () => {
  it('a text reply decodes to its text and a stop', async () => {
    expect(await decode(RESPONSES, rendered(RESPONSES, TEXT_ONLY))).toEqual({
      texts: ['Oslo is further north.'],
      calls: [],
      state: [[message('msg_0')]],
      termination: ended('stop'),
      usage: UNKNOWN_USAGE,
      cost: [],
    })
  })

  it('reasoning then text cut by the output limit decodes to an incomplete reply at its limit', async () => {
    expect(await decode(RESPONSES, rendered(RESPONSES, REASONING_AND_TEXT))).toEqual({
      texts: ['Cut sho'],
      calls: [],
      state: [[reasoningItem('rs_a', 'SEALED-A'), message('msg_1')]],
      termination: ended('limit'),
      usage: UNKNOWN_USAGE,
      cost: [],
    })
  })

  it('reasoning then two calls, with the usage in the last frame, decodes to tool suggestions and their account', async () => {
    expect(await decode(RESPONSES, rendered(RESPONSES, REASONING_AND_CALLS))).toEqual({
      texts: [],
      calls: CALLS,
      state: [
        [
          reasoningItem('rs_b', 'SEALED-B'),
          { call_id: 'call_1', id: 'fc_1', type: 'function_call' },
          { call_id: 'call_2', id: 'fc_2', type: 'function_call' },
        ],
      ],
      termination: ended('tool-suggestions'),
      usage: KNOWN_USAGE,
      cost: ['0.00042'],
    })
  })

  it('ends with the end marker, as the gateway writes it', () => {
    expect(rendered(RESPONSES, TEXT_ONLY).endsWith('data: [DONE]\n\n')).toBe(true)
  })
})

describe('renderReply: the chat answer of a script, on the Messages interface', () => {
  it('a text reply decodes to its text and a stop', async () => {
    expect(await decode(MESSAGES, rendered(MESSAGES, TEXT_ONLY))).toEqual({
      texts: ['Oslo is further north.'],
      calls: [],
      state: [],
      termination: ended('stop'),
      usage: UNKNOWN_USAGE,
      cost: [],
    })
  })

  it('reasoning then text cut by the output limit decodes to a signed thinking block and the limit', async () => {
    expect(await decode(MESSAGES, rendered(MESSAGES, REASONING_AND_TEXT))).toEqual({
      texts: ['Cut sho'],
      calls: [],
      state: [[thinking('SEALED-A')]],
      termination: ended('limit'),
      usage: UNKNOWN_USAGE,
      cost: [],
    })
  })

  it('reasoning then two calls, with the usage in the last frame, decodes to tool suggestions and their account', async () => {
    expect(await decode(MESSAGES, rendered(MESSAGES, REASONING_AND_CALLS))).toEqual({
      texts: [],
      calls: CALLS,
      state: [[thinking('SEALED-B')]],
      termination: ended('tool-suggestions'),
      usage: KNOWN_USAGE,
      cost: ['0.00042'],
    })
  })

  it('names the upstream the chat frames name, where the interface reports it', () => {
    const start = rendered(MESSAGES, TEXT_ONLY).split('\n\n')[0]
    expect(start).toMatch(/^event: message_start\ndata: /)
    expect(JSON.parse(start?.split('\ndata: ')[1] ?? 'null')).toMatchObject({
      message: { model: 'lab/model-a', provider: 'Lab' },
    })
  })

  it('has no end marker', () => {
    expect(rendered(MESSAGES, TEXT_ONLY)).not.toContain('[DONE]')
  })
})

describe('renderReply: a reply written in two parts', () => {
  const head = [TEXT_ONLY[0]]
  const tail = TEXT_ONLY.slice(1)

  it.each([RESPONSES, MESSAGES])(
    'on %s, the two parts put together are the reply translated at once',
    async path => {
      const whole = rendered(path, TEXT_ONLY)
      const parts = renderReply(path, {
        ...stream(`data: ${JSON.stringify(head[0])}\n\n`),
        rest: { after: Promise.resolve(), body: sse(tail) },
      })
      expect(`${parts.body}${parts.rest?.body ?? ''}`).toBe(whole)
      expect((await decode(path, whole)).texts).toEqual(['Oslo is further north.'])
    },
  )

  it('keeps the promise the second part waits for', () => {
    const after = Promise.resolve()
    const parts = renderReply(RESPONSES, {
      ...stream(`data: ${JSON.stringify(head[0])}\n\n`),
      rest: { after, body: sse(tail) },
    })
    expect(parts.rest?.after).toBe(after)
  })
})

describe('renderReply: an error in the stream', () => {
  const failing = [
    { ...serving, choices: [{ delta: { content: 'Os' } }] },
    { error: { code: 'server_error', message: 'upstream went away' } },
  ]

  it('on Responses is the error event, with the chat error copied', async () => {
    const body = rendered(RESPONSES, failing)
    expect(body).toContain('"type":"error","code":"server_error","message":"upstream went away"')
    expect((await decode(RESPONSES, body)).termination).toMatchObject({
      termination: { kind: 'failed', fault: { diagnostic: 'in-band-error' } },
    })
  })

  it('on Messages is the error event, with the chat error as its error', async () => {
    const body = rendered(MESSAGES, failing)
    expect(body).toContain(
      'event: error\ndata: {"type":"error","error":{"code":"server_error","message":"upstream went away"}}',
    )
    expect((await decode(MESSAGES, body)).termination).toMatchObject({
      termination: { kind: 'failed', fault: { diagnostic: 'in-band-error' } },
    })
  })
})

describe('renderReply: what goes out as written', () => {
  const chat = stream(sse(TEXT_ONLY))

  it('the chat-completions path', () => {
    expect(renderReply(CHAT, chat)).toBe(chat)
  })

  it.each([RESPONSES, MESSAGES])('on %s, a reply whose status is an error', path => {
    const refusal = { status: 503, contentType: 'text/event-stream', body: sse(TEXT_ONLY) }
    expect(renderReply(path, refusal)).toBe(refusal)
  })

  it.each([RESPONSES, MESSAGES])('on %s, a reply that is not a stream', path => {
    const json = { status: 200, contentType: 'application/json', body: '{"choices":[]}' }
    expect(renderReply(path, json)).toBe(json)
  })
})
