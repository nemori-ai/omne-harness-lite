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
import { request as httpsRequest } from 'node:https'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chatRequestOf, interfacePath, renderReply } from './gateway-wire.ts'
import { startModelGateway, type GatewayAnswer, type GatewayScript } from './model-gateway.ts'

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

// Messages counts input without the tokens read from the cache (a real cache hit reports
// input_tokens 4 next to cache_read_input_tokens 1835); Responses counts them in.
const MESSAGES_KNOWN_USAGE = { ...KNOWN_USAGE, input: '32' }

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
      usage: MESSAGES_KNOWN_USAGE,
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

// Requests as the release sends them on Responses (taken from the slow cases of the release
// tree, with the system prompt, the reminder and the tool guide shortened).
const SYSTEM = '# Role and goal\n\nYou are the coding agent of OMNE Harness.'
const REMINDER =
  'Runtime context: the current values.\n<block key="session.modes" revision="1">{}</block>'
const ASK_GUIDE = 'Ask: there is no command "no-such-command".'
const RESPONSES_TOP = {
  include: ['reasoning.encrypted_content'],
  model: 'openai/gpt-6.1-sol',
  prompt_cache_key: 'a'.repeat(64),
  prompt_cache_options: { mode: 'explicit', ttl: '30m' },
  provider: { allow_fallbacks: false, order: ['openai'] },
  reasoning: { effort: 'high', summary: 'auto' },
  store: false,
  stream: true,
  tool_choice: 'auto',
}
const said = (role: string, text: string, breakpoint = false) => ({
  content: [
    {
      ...(breakpoint ? { prompt_cache_breakpoint: { mode: 'explicit' } } : {}),
      text,
      type: 'input_text',
    },
  ],
  role,
  type: 'message',
})
const answered = (text: string) => ({
  content: [{ annotations: [], text, type: 'output_text' }],
  id: 'msg_0',
  phase: 'final_answer',
  role: 'assistant',
  status: 'completed',
  type: 'message',
})
const called = (callId: string) => ({
  arguments: '{"command":"no-such-command","params":{}}',
  call_id: callId,
  id: 'fc_1',
  name: 'Ask',
  status: 'completed',
  type: 'function_call',
})
const ASK_TOOL = {
  description: 'Ask the person a question or request approval, and wait for the answer.',
  name: 'Ask',
  parameters: {
    properties: { command: { type: 'string' } },
    required: ['command'],
    type: 'object',
  },
  type: 'function',
}
const OPENING = [
  said('developer', SYSTEM),
  said('developer', REMINDER),
  said('user', 'Use a tool.'),
]
const FOLLOWING = [
  {
    encrypted_content: 'ENCRYPTED-STEP-ONE',
    format: 'openai-responses-v1',
    id: 'rs_1',
    summary: [],
    type: 'reasoning',
  },
  answered('step 1'),
  called('call_1'),
  { call_id: 'call_1', output: ASK_GUIDE, type: 'function_call_output' },
]
const CHAT_OPENING = [
  { content: SYSTEM, role: 'system' },
  { content: REMINDER, role: 'developer' },
  { content: 'Use a tool.', role: 'user' },
]

const chatOf = (path: string, body: object): unknown =>
  JSON.parse(chatRequestOf(path, JSON.stringify(body)))

describe('chatRequestOf: a Responses request, read as the chat request equal to it', () => {
  it('one user message', () => {
    const raw = JSON.stringify({ ...RESPONSES_TOP, input: [said('user', 'Say hello.', true)] })
    expect(chatRequestOf(RESPONSES, raw)).toBe(
      '{"messages":[{"content":"Say hello.","role":"user"}],"model":"openai/gpt-6.1-sol",' +
        '"reasoning":{"effort":"high"},"stream":true}',
    )
  })

  it('the system prompt, a reminder and the tools', () => {
    expect(chatOf(RESPONSES, { ...RESPONSES_TOP, input: OPENING, tools: [ASK_TOOL] })).toEqual({
      messages: CHAT_OPENING,
      model: 'openai/gpt-6.1-sol',
      reasoning: { effort: 'high' },
      stream: true,
      tools: [
        {
          function: {
            description: ASK_TOOL.description,
            name: 'Ask',
            parameters: ASK_TOOL.parameters,
          },
          type: 'function',
        },
      ],
    })
  })

  it('a later step: the reasoning, the text and the call of a reply are one assistant message, its result a tool message', () => {
    const body = { ...RESPONSES_TOP, input: [...OPENING, ...FOLLOWING], tools: [ASK_TOOL] }
    expect(chatOf(RESPONSES, body)).toMatchObject({
      messages: [
        ...CHAT_OPENING,
        {
          content: 'step 1',
          reasoning_details: [
            {
              data: 'ENCRYPTED-STEP-ONE',
              format: 'openai-responses-v1',
              id: 'rs_1',
              type: 'reasoning.encrypted',
            },
          ],
          role: 'assistant',
          tool_calls: [
            {
              function: { arguments: '{"command":"no-such-command","params":{}}', name: 'Ask' },
              id: 'call_1',
              type: 'function',
            },
          ],
        },
        { content: ASK_GUIDE, role: 'tool', tool_call_id: 'call_1' },
      ],
    })
  })

  it('a later request starts with the messages of the earlier one, though the cache breakpoint moved', () => {
    const earlier = { ...RESPONSES_TOP, input: [...OPENING.slice(0, 2), said('user', 'Go.', true)] }
    const later = {
      ...RESPONSES_TOP,
      input: [...OPENING.slice(0, 2), said('user', 'Go.'), ...FOLLOWING],
    }
    const before = chatRequestOf(RESPONSES, JSON.stringify(earlier))
    const after = chatRequestOf(RESPONSES, JSON.stringify(later))
    const messages = (text: string) => (JSON.parse(text) as { messages: unknown[] }).messages
    const kept = messages(after).slice(0, messages(before).length)
    expect(JSON.stringify(kept)).toBe(JSON.stringify(messages(before)))
    expect(after).toContain('"role":"tool"')
  })

  it('without the system prompt, a developer message that does not open the input stays a developer message', () => {
    const input = [said('user', 'Hi.'), answered('Hello.'), said('developer', REMINDER)]
    expect(chatOf(RESPONSES, { input, model: 'm' })).toEqual({
      messages: [
        { content: 'Hi.', role: 'user' },
        { content: 'Hello.', role: 'assistant' },
        { content: REMINDER, role: 'developer' },
      ],
      model: 'm',
    })
  })
})

describe('chatRequestOf: a Messages request, read as the chat request equal to it', () => {
  it('the system prompt, a signed thinking block, a call and its result', () => {
    const body = {
      max_tokens: 1024,
      model: 'anthropic/claude-opus-5.5',
      stream: true,
      system: [{ text: SYSTEM, type: 'text' }],
      messages: [
        { content: [{ text: 'Use a tool.', type: 'text' }], role: 'user' },
        {
          content: [
            { signature: 'SIGNED-ONE', thinking: '', type: 'thinking' },
            { text: 'step 1', type: 'text' },
            { id: 'toolu_1', input: { command: 'info' }, name: 'Shell', type: 'tool_use' },
          ],
          role: 'assistant',
        },
        {
          content: [
            {
              content: [{ text: 'ok', type: 'text' }],
              tool_use_id: 'toolu_1',
              type: 'tool_result',
            },
          ],
          role: 'user',
        },
      ],
      tools: [{ description: 'Run a command.', input_schema: { type: 'object' }, name: 'Shell' }],
      output_config: { effort: 'high' },
    }
    expect(chatOf(MESSAGES, body)).toEqual({
      messages: [
        { content: SYSTEM, role: 'system' },
        { content: 'Use a tool.', role: 'user' },
        {
          content: 'step 1',
          reasoning_details: [{ data: 'SIGNED-ONE', type: 'reasoning.encrypted' }],
          role: 'assistant',
          tool_calls: [
            {
              function: { arguments: '{"command":"info"}', name: 'Shell' },
              id: 'toolu_1',
              type: 'function',
            },
          ],
        },
        { content: 'ok', role: 'tool', tool_call_id: 'toolu_1' },
      ],
      model: 'anthropic/claude-opus-5.5',
      reasoning: { effort: 'high' },
      stream: true,
      tools: [
        {
          function: {
            description: 'Run a command.',
            name: 'Shell',
            parameters: { type: 'object' },
          },
          type: 'function',
        },
      ],
    })
  })
})

describe('chatRequestOf and interfacePath: what a request says about its interface', () => {
  const responsesBody = JSON.stringify({ ...RESPONSES_TOP, input: OPENING })
  const chatBody = JSON.stringify({ messages: CHAT_OPENING, model: 'm', stream: true })

  it('a chat-completions request is given as sent', () => {
    expect(chatRequestOf(CHAT, chatBody)).toBe(chatBody)
  })

  it('a Responses body on the chat-completions path speaks Responses', () => {
    expect(interfacePath(CHAT, responsesBody)).toBe(RESPONSES)
  })

  it('a Messages body on the chat-completions path speaks Messages', () => {
    const messagesBody = JSON.stringify({
      max_tokens: 1024,
      messages: [{ content: [{ text: 'hi', type: 'text' }], role: 'user' }],
      model: 'anthropic/claude-opus-5.5',
      stream: true,
      thinking: { type: 'adaptive' },
    })
    expect(interfacePath(CHAT, messagesBody)).toBe(MESSAGES)
  })

  it.each([
    ['a chat-completions body', CHAT, chatBody, CHAT],
    ['a path that names its interface', MESSAGES, responsesBody, MESSAGES],
    ['a body that is not JSON', CHAT, 'not json', CHAT],
  ])('%s keeps its path', (_case, path, body, expected) => {
    expect(interfacePath(path, body)).toBe(expected)
  })
})

describe('startModelGateway: the script reads chat, the release gets the interface it sent', () => {
  it('a Responses request on the gateway address: chat body, raw bytes, path, and a Responses reply', async () => {
    const seen: Parameters<GatewayScript>[0][] = []
    const gateway = await startModelGateway(request => {
      seen.push(request)
      return stream(sse(TEXT_ONLY))
    })
    try {
      const raw = JSON.stringify({ ...RESPONSES_TOP, input: OPENING })
      const reply = await post(gateway.url, gateway.certPath, raw)
      expect(seen).toEqual([
        {
          index: 0,
          body: chatRequestOf(RESPONSES, raw),
          rawBody: raw,
          path: '/api/v1/chat/completions',
        },
      ])
      expect((await decode(RESPONSES, reply)).texts).toEqual(['Oslo is further north.'])
    } finally {
      await gateway.close()
    }
  })
})

function post(url: string, certPath: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sent = httpsRequest(url, { method: 'POST', ca: readFileSync(certPath) }, response => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      response.on('error', reject)
    })
    sent.on('error', reject)
    sent.end(body)
  })
}
