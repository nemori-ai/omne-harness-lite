// The replay fixtures of the OpenAI family, as one reviewable table. Each case extracts an inline
// SSE case of a sealed test and states the facts that the sealed behaviour becomes in contract
// facts. `pnpm run fixtures` writes the table to `tests/fixtures`; `fixtures.spec.ts` checks the
// files against the table and the engine against the files. tests/fixtures/README.md lists the
// intended differences.
import type { RequestParts } from './openai.ts'
import { message, stateBlock, textBlock } from './openai.ts'

/** Where a case lives: the one fixture of a record, or an extra case directory. */
export type Slot = 'record' | 'case'

export type FixtureCase = Readonly<{
  id: string
  slot: Slot
  record: string
  /** The sealed test file, the line range and the test name. */
  source: string
  request: RequestParts
  /** The expected request body, as plain JSON. */
  body: unknown
  stream: string
  /** The expected facts, `ended` included, as plain JSON. */
  facts: readonly unknown[]
}>

// --- SSE -------------------------------------------------------------------------------------

/** One SSE event with a JSON data line. */
function sse(frame: object): string {
  return `data: ${JSON.stringify(frame)}\n\n`
}

/** One SSE event with this exact data text. */
function raw(data: string): string {
  return `data: ${data}\n\n`
}

const DONE = raw('[DONE]')

/** The serving members the engine requires on the first frame; sealed frames lack them. */
function serving(record: string): Readonly<{ model: string; provider: string }> {
  return { model: record, provider: 'OpenAI' }
}

function choice(delta: object, finish?: string): object {
  return { choices: [finish === undefined ? { delta } : { delta, finish_reason: finish }] }
}

/** `finish()` of the sealed support: a finish frame, then the end marker. */
function finish(reason = 'stop'): string {
  return sse(choice({}, reason)) + DONE
}

/** The usage of the sealed refusal tests. The cost keeps its exact lexeme. */
const USAGE_TEXT =
  '{"prompt_tokens":123,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":20,"cache_write_tokens":3},"cost":0.000123456789123456789}'

// --- facts -----------------------------------------------------------------------------------

const SHOWN = { toHuman: true, toModel: true }
const HIDDEN = { toHuman: false, toModel: true }

function open(index: number, content: 'text' | 'thinking' | 'tool-arguments'): object {
  return { kind: 'block-open', index: String(index), mode: 'append', content }
}

function delta(index: number, text: string): object {
  return { kind: 'block-delta', index: String(index), delta: text }
}

function seal(index: number, kind: 'text' | 'thinking', text: string): object {
  return {
    kind: 'block-seal',
    index: String(index),
    block: { kind, id: `b${index}`, visibility: SHOWN, text },
  }
}

function sealCall(index: number, callId: string, name: string, args: object): object {
  return {
    kind: 'block-seal',
    index: String(index),
    block: { kind: 'tool_call', id: `b${index}`, visibility: SHOWN, callId, name, arguments: args },
  }
}

function sealState(index: number, payload: string, pairs: readonly string[] = []): object {
  return {
    kind: 'block-seal',
    index: String(index),
    block: { kind: 'reasoning_state', id: `b${index}`, visibility: HIDDEN, payload, pairs },
  }
}

function completed(reason: 'stop' | 'tool-suggestions' | 'limit'): object {
  return { kind: 'ended', termination: { kind: 'completed', reason } }
}

function failed(cause: string, diagnostic: string, upstreamStatus: string | null = null): object {
  return {
    kind: 'ended',
    termination: { kind: 'failed', fault: { cause, diagnostic, upstreamStatus } },
  }
}

// --- requests --------------------------------------------------------------------------------

const PROVIDER = { allow_fallbacks: false, order: ['openai'], require_parameters: true }

/** The request of the sealed `input()`: an instruction, a reminder, a user turn and 128 tokens. */
const BASIC: RequestParts = {
  system: [textBlock('s1', 'instruction')],
  messages: [
    message('r1', 'system_reminder', [textBlock('b1', 'keep going')]),
    message('u1', 'user', [textBlock('b2', 'hello')]),
  ],
  parameters: [{ kind: 'max-output-tokens', value: '128' }],
}

function basicBody(record: string): unknown {
  return {
    max_tokens: 128,
    messages: [
      { content: 'instruction', role: 'developer' },
      { content: 'keep going', role: 'developer' },
      { content: 'hello', role: 'user' },
    ],
    model: record,
    provider: PROVIDER,
    store: false,
    stream: true,
  }
}

function basicCase(
  input: Omit<FixtureCase, 'request' | 'body' | 'slot' | 'record'> &
    Partial<Pick<FixtureCase, 'slot' | 'record'>>,
): FixtureCase {
  const record = input.record ?? 'openai/gpt-6-astra'
  return { slot: 'case', ...input, record, request: BASIC, body: basicBody(record) }
}

// --- the encrypted replay of GPT-5.6 ---------------------------------------------------------

const ENCRYPTED_DETAIL = {
  type: 'reasoning.encrypted',
  data: 'ENCRYPTED_NEVER_TOKENIZE',
  format: 'openai-responses-v1',
  id: 'rs-local',
  index: 0,
}
/** The payload of the state part: the detail as JSON with sorted keys. */
const ENCRYPTED_PAYLOAD =
  '{"data":"ENCRYPTED_NEVER_TOKENIZE","format":"openai-responses-v1","id":"rs-local","index":0,"type":"reasoning.encrypted"}'

function encryptedReplay(record: string): FixtureCase {
  return {
    id: `encrypted-replay-${record.slice('openai/'.length)}`,
    slot: 'record',
    record,
    source:
      'openai-encrypted-replay.spec.ts:49-171 "public TLS runs three rounds, estimates O once, preserves ciphertext and rejects unverifiable mappings" (stream :55-72; round-two request :88-104, :145-158)',
    request: {
      messages: [
        message('u1', 'user', [textBlock('b1', 'STABLE_PREFIX_MARKER')]),
        message(
          'a1',
          'assistant',
          [textBlock('b0', 'visible answer'), stateBlock('b1', ENCRYPTED_PAYLOAD)],
          {
            replay: { scope: `openrouter/${record}`, format: 'openai-responses-v1', at: [1] },
          },
        ),
        message('u2', 'user', [textBlock('b2', 'next 1')]),
      ],
      parameters: [
        { kind: 'max-output-tokens', value: '1024' },
        { kind: 'reasoning-effort', value: 'low' },
      ],
    },
    body: {
      max_tokens: 1024,
      messages: [
        { content: 'STABLE_PREFIX_MARKER', role: 'user' },
        { content: 'visible answer', reasoning_details: [ENCRYPTED_DETAIL], role: 'assistant' },
        { content: 'next 1', role: 'user' },
      ],
      model: record,
      provider: PROVIDER,
      reasoning: { effort: 'low' },
      store: false,
      stream: true,
    },
    stream:
      sse({
        ...serving(record),
        ...choice({ reasoning_details: [ENCRYPTED_DETAIL], content: 'visible answer' }),
      }) +
      raw(
        '{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":400,"completion_tokens":18,"completion_tokens_details":{"reasoning_tokens":11},"prompt_tokens_details":{"cached_tokens":0,"cache_write_tokens":0},"cost":0.000123}}',
      ) +
      finish(),
    facts: [
      open(0, 'text'),
      delta(0, 'visible answer'),
      seal(0, 'text', 'visible answer'),
      sealState(1, ENCRYPTED_PAYLOAD),
      completed('stop'),
    ],
  }
}

// --- the refusal stream ----------------------------------------------------------------------

const REFUSAL = 'refusal-stream.spec.ts'

/** The first frame of a refusal case: a refusal delta with the serving members. */
function refusal(record: string, text: string): string {
  return sse({ ...serving(record), ...choice({ refusal: text }) })
}

/** The RF-V2 stream; `withId` adds the call id that the contract requires. */
function toolOrderStream(record: string, withId: boolean): string {
  const call = {
    index: 0,
    ...(withId ? { id: 'call_lookup' } : {}),
    type: 'function',
    function: { name: 'lookup', arguments: '{"x":1}' },
  }
  return (
    sse({ ...serving(record), ...choice({ reasoning: 'think' }) }) +
    sse(choice({ refusal: 'refuse', tool_calls: [call] })) +
    sse(choice({ content: 'after' })) +
    finish('tool_calls')
  )
}

const TOOL_ORDER_FACTS = [
  open(0, 'thinking'),
  delta(0, 'think'),
  open(1, 'text'),
  delta(1, 'refuse'),
  open(2, 'tool-arguments'),
  delta(2, '{"x":1}'),
  delta(1, 'after'),
]

/** RF-V4: the actual finish, a repeated finish with usage, then the end marker. */
function trailingUsage(record: string, reason: string, ending: object, id: string): FixtureCase {
  return basicCase({
    id,
    slot: 'record',
    record,
    source: `${REFUSAL}:232-252 "RF-V4 ${reason} uses actual finish and reads normal trailing usage before DONE"`,
    stream:
      refusal(record, 'actual refusal') +
      sse(choice({}, reason)) +
      raw(
        `{"choices":[{"delta":{"refusal":""},"finish_reason":"${reason}"}],"usage":${USAGE_TEXT}}`,
      ) +
      DONE,
    facts: [open(0, 'text'), delta(0, 'actual refusal'), seal(0, 'text', 'actual refusal'), ending],
  })
}

/** RF-V5: delivered text, then a tail that keeps the reply from succeeding. */
function brokenTail(
  input: Readonly<{ id: string; label: string; tail: string; facts: readonly object[] }>,
): FixtureCase {
  const record = 'openai/gpt-6-astra'
  return basicCase({
    id: input.id,
    source: `${REFUSAL}:253-286 "RF-V5 ${input.label} keeps delivered text without a successful reply or invented later usage"`,
    stream: refusal(record, 'delivered refusal') + input.tail,
    facts: [open(0, 'text'), delta(0, 'delivered refusal'), ...input.facts],
  })
}

const INVALID_REFUSALS: readonly Readonly<{ id: string; value: unknown }>[] = [
  { id: 'false', value: false },
  { id: 'true', value: true },
  { id: 'zero', value: 0 },
  { id: 'forty-two', value: 42 },
  { id: 'empty-array', value: [] },
  { id: 'array', value: ['private-invalid'] },
  { id: 'object', value: { text: 'private-invalid' } },
]

const ASTRA = 'openai/gpt-6-astra'

export const LEGACY_CASES: readonly FixtureCase[] = [
  encryptedReplay('openai/gpt-5.6-sol'),
  encryptedReplay('openai/gpt-5.6-terra'),
  encryptedReplay('openai/gpt-5.6-luna'),
  basicCase({
    id: 'rf-v1-v2-same-frame-order',
    slot: 'record',
    record: ASTRA,
    source: `${REFUSAL}:161-193 "RF-V1/V2 actual whitespace/unicode, frame order and deterministic same-frame order share one text block"`,
    stream:
      refusal(ASTRA, '拒答🙂') +
      sse(choice({ refusal: ' R ', content: 'C' })) +
      sse(choice({ content: 'later', refusal: '\n', reasoning: 'thinking' })) +
      finish(),
    facts: [
      open(0, 'text'),
      delta(0, '拒答🙂'),
      delta(0, 'C'),
      delta(0, ' R '),
      delta(0, 'later'),
      delta(0, '\n'),
      open(1, 'thinking'),
      delta(1, 'thinking'),
      seal(0, 'text', '拒答🙂C R later\n'),
      seal(1, 'thinking', 'thinking'),
      completed('stop'),
    ],
  }),
  basicCase({
    id: 'rf-v2-tool-order',
    slot: 'record',
    record: 'openai/gpt-6-astra-pro',
    source: `${REFUSAL}:194-231 "RF-V2 shared text channel keeps existing thinking and tool opening order" (call id added)`,
    stream: toolOrderStream('openai/gpt-6-astra-pro', true),
    facts: [
      ...TOOL_ORDER_FACTS,
      seal(0, 'thinking', 'think'),
      seal(1, 'text', 'refuseafter'),
      sealCall(2, 'call_lookup', 'lookup', {
        kind: 'object',
        entries: [{ key: 'x', value: { kind: 'number', lexeme: '1' } }],
      }),
      completed('tool-suggestions'),
    ],
  }),
  basicCase({
    id: 'rf-v2-tool-without-id',
    record: 'openai/gpt-6-astra-pro',
    source: `${REFUSAL}:194-231 "RF-V2 shared text channel keeps existing thinking and tool opening order" (sealed input, no call id)`,
    stream: toolOrderStream('openai/gpt-6-astra-pro', false),
    facts: [...TOOL_ORDER_FACTS, failed('upstream-protocol', 'tool-call-without-id')],
  }),
  trailingUsage('openai/gpt-6-sol', 'stop', completed('stop'), 'rf-v4-stop'),
  trailingUsage(
    'openai/gpt-6-sol-pro',
    'tool_calls',
    completed('tool-suggestions'),
    'rf-v4-tool-calls',
  ),
  trailingUsage('openai/gpt-6-luna', 'length', completed('limit'), 'rf-v4-length'),
  basicCase({
    id: 'rf-v5-content-filter',
    slot: 'record',
    record: 'openai/gpt-6-luna-pro',
    source: `${REFUSAL}:253-286 "RF-V5 content_filter keeps delivered text without a successful reply or invented later usage"`,
    stream:
      refusal('openai/gpt-6-luna-pro', 'delivered refusal') + sse(choice({}, 'content_filter')),
    facts: [
      open(0, 'text'),
      delta(0, 'delivered refusal'),
      failed('input-rejected', 'finish-reason-content_filter'),
    ],
  }),
  basicCase({
    id: 'rf-v1-whitespace',
    slot: 'record',
    record: 'openai/gpt-5.6-sol-pro',
    source: `${REFUSAL}:62-67 "RF-V1 pure whitespace is actual content"`,
    stream: refusal('openai/gpt-5.6-sol-pro', ' \t\n') + finish(),
    facts: [open(0, 'text'), delta(0, ' \t\n'), seal(0, 'text', ' \t\n'), completed('stop')],
  }),
  basicCase({
    id: 'rf-v5-late-in-band-error',
    slot: 'record',
    record: 'openai/gpt-5.6-terra-pro',
    source: `${REFUSAL}:68-84 "RF-V5 late in-band error preserves refusal and earlier facts without reading future usage"`,
    stream:
      raw(
        `{"model":"openai/gpt-5.6-terra-pro","provider":"OpenAI","choices":[{"delta":{"refusal":"already delivered"}}],"usage":${USAGE_TEXT}}`,
      ) +
      sse({ error: { code: 503, message: 'unavailable' } }) +
      sse({ choices: [], usage: { prompt_tokens: 999 } }) +
      finish(),
    facts: [
      open(0, 'text'),
      delta(0, 'already delivered'),
      failed('upstream-unavailable', 'in-band-error', '503'),
    ],
  }),
  basicCase({
    id: 'rf-v6-accounting-around-refusal',
    slot: 'record',
    record: 'openai/gpt-5.6-luna-pro',
    source: `${REFUSAL}:303-320 "RF-V6 accounting before/same/after refusal is one account and conflicts remain unavailable"`,
    stream:
      raw(
        `{"model":"openai/gpt-5.6-luna-pro","provider":"OpenAI","choices":[],"usage":${USAGE_TEXT}}`,
      ) +
      raw(`{"choices":[{"delta":{"refusal":"text"}}],"usage":${USAGE_TEXT}}`) +
      raw(
        `{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":${USAGE_TEXT.replace('"prompt_tokens":123', '"prompt_tokens":124')}}`,
      ) +
      DONE,
    facts: [open(0, 'text'), delta(0, 'text'), seal(0, 'text', 'text'), completed('stop')],
  }),
  ...(
    [
      ['missing', {}],
      ['null', { refusal: null }],
      ['empty', { refusal: '' }],
    ] as const
  ).map(([label, value]) =>
    basicCase({
      id: `rf-v1-${label}-refusal`,
      source: `${REFUSAL}:124-135 "RF-V1 ${label} neither opens a block nor passes the first-content gate"`,
      stream: sse({ ...serving(ASTRA), ...choice(value) }) + finish(),
      facts: [completed('stop')],
    }),
  ),
  ...INVALID_REFUSALS.map(({ id, value }) =>
    basicCase({
      id: `rf-v1-invalid-refusal-${id}`,
      source: `${REFUSAL}:136-160 "RF-V1 invalid ${JSON.stringify(value)} rejects before same-frame content and preserves facts"`,
      stream:
        raw(
          `{"model":"${ASTRA}","provider":"OpenAI","choices":[{"delta":{"content":"must-not-leak","refusal":${JSON.stringify(value)}}}],"usage":${USAGE_TEXT}}`,
        ) +
        sse({ choices: [], usage: { prompt_tokens: 999 } }) +
        finish(),
      facts: [failed('upstream-protocol', 'delta-shape')],
    }),
  ),
  brokenTail({
    id: 'rf-v5-error-finish',
    label: 'error finish',
    tail: sse(choice({}, 'error')),
    facts: [failed('input-rejected', 'finish-reason-error')],
  }),
  brokenTail({
    id: 'rf-v5-eof',
    label: 'EOF',
    tail: '',
    facts: [failed('stream-lost', 'ended-without-finish')],
  }),
  brokenTail({
    id: 'rf-v5-bad-json',
    label: 'bad JSON',
    tail: 'data: {bad}\n\n',
    facts: [failed('upstream-protocol', 'frame-invalid-json')],
  }),
  brokenTail({
    id: 'rf-v5-duplicate-key',
    label: 'duplicate key',
    tail: 'data: {"choices":[],"choices":[]}\n\n',
    facts: [failed('upstream-protocol', 'frame-invalid-json')],
  }),
  brokenTail({
    id: 'rf-v5-changed-finish',
    label: 'changed finish',
    tail: sse(choice({}, 'stop')) + sse(choice({}, 'length')),
    facts: [seal(0, 'text', 'delivered refusal'), failed('upstream-protocol', 'finish-changed')],
  }),
  brokenTail({
    id: 'rf-v5-late-refusal',
    label: 'late refusal',
    tail: sse(choice({}, 'stop')) + sse(choice({ refusal: 'late' })),
    facts: [
      seal(0, 'text', 'delivered refusal'),
      failed('upstream-protocol', 'content-after-finish'),
    ],
  }),
  brokenTail({
    id: 'rf-v5-done-without-finish',
    label: 'DONE without finish',
    tail: DONE,
    facts: [failed('stream-lost', 'ended-without-finish')],
  }),
  basicCase({
    id: 'rf-v5-v8-same-frame-error',
    source: `${REFUSAL}:287-302 "RF-V5/V8 same-frame error wins over refusal/content, preserves independent 503 and same-frame exact usage"`,
    stream:
      raw(
        `{"error":{"code":503,"message":"503"},"usage":${USAGE_TEXT},"choices":[{"delta":{"content":"must-not-leak","refusal":"must-not-leak"}}]}`,
      ) + sse({ choices: [], usage: { prompt_tokens: 999 } }),
    facts: [failed('upstream-unavailable', 'in-band-error', '503')],
  }),
  basicCase({
    id: 'rf-v8-reply-text-503',
    source: `${REFUSAL}:321-325 "RF-V8 legal reply text is unchanged by credential policy and diagnostics do not copy it"`,
    stream: refusal(ASTRA, '503') + finish(),
    facts: [open(0, 'text'), delta(0, '503'), seal(0, 'text', '503'), completed('stop')],
  }),
]
