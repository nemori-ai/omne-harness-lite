// The replay fixtures of the Anthropic family, as one reviewable table. Each case extracts an
// inline SSE case of a sealed test and states the facts that the sealed behaviour becomes in
// contract facts. `pnpm run fixtures` writes the table to `tests/fixtures`; `fixtures.spec.ts`
// checks the files against the table and the engine against the files. tests/fixtures/README.md
// lists the intended differences.
import type { RequestParts } from './anthropic.ts'
import {
  callBlock,
  imageBlock,
  message,
  resultBlock,
  stateBlock,
  textBlock,
  thinkingBlock,
} from './anthropic.ts'

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

const FORMAT = 'anthropic-claude-v1'
const LATE = 'anthropic-stream-late-signature.spec.ts'
const CURRENT = 'anthropic-family-current.spec.ts'
const SONNET = 'anthropic/claude-sonnet-5'

// --- JSON value trees ------------------------------------------------------------------------

/** The json-text value tree of plain JSON, as facts and declarations carry it. */
function tree(value: unknown): unknown {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  if (typeof value === 'object')
    return {
      kind: 'object',
      entries: Object.entries(value).map(([key, item]) => ({ key, value: tree(item) })),
    }
  throw new Error(`no JSON value: ${String(value)}`)
}

/** The payload of a sealed group: the items as one JSON array, each with sorted keys. */
function groupPayload(items: readonly Readonly<Record<string, unknown>>[]): string {
  return JSON.stringify(
    items.map(item =>
      Object.fromEntries(Object.entries(item).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    ),
  )
}

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
  return { model: record, provider: 'Anthropic' }
}

function choice(delta: object, finish?: string): object {
  return { choices: [finish === undefined ? { delta } : { delta, finish_reason: finish }] }
}

/** `finish()` of the sealed support: a finish frame, then the end marker. */
function finish(reason = 'stop'): string {
  return sse(choice({}, reason)) + DONE
}

/** One reasoning detail per frame, as the sealed `reasoning()` helper streams them. */
function reasoningFrames(record: string, details: readonly object[]): string {
  return details
    .map((detail, index) =>
      sse({ ...(index === 0 ? serving(record) : {}), ...choice({ reasoning_details: [detail] }) }),
    )
    .join('')
}

/** The usage frame of the sealed three-round test: no choices, the serving members, the usage. */
function roundUsage(record: string, round: number): string {
  return sse({
    choices: [],
    ...serving(record),
    usage: {
      prompt_tokens: 1000 * round,
      completion_tokens: 30 + round,
      completion_tokens_details: { reasoning_tokens: 7 },
      prompt_tokens_details: {
        cached_tokens: round === 1 ? 0 : 20,
        cache_write_tokens: round === 1 ? 20 : 0,
      },
    },
  })
}

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

function sealCall(index: number, callId: string, name: string, args: unknown): object {
  return {
    kind: 'block-seal',
    index: String(index),
    block: {
      kind: 'tool_call',
      id: `b${index}`,
      visibility: SHOWN,
      callId,
      name,
      arguments: tree(args),
    },
  }
}

function sealState(index: number, payload: string, pairs: readonly string[] = []): object {
  return {
    kind: 'block-seal',
    index: String(index),
    block: { kind: 'reasoning_state', id: `b${index}`, visibility: HIDDEN, payload, pairs },
  }
}

/** The token counts of an account in the order of the usage rule; `null` is unknown. */
type Counts = Readonly<{
  input: string | null
  output: string | null
  cacheRead: string | null
  cacheWrite: string | null
  reasoning: string | null
}>

const NO_COUNTS: Counts = {
  input: null,
  output: null,
  cacheRead: null,
  cacheWrite: null,
  reasoning: null,
}

/** The counts of the round usage: the prompt less the cache read and write is the input. */
function roundCounts(round: number): Counts {
  const read = round === 1 ? 0 : 20
  const write = round === 1 ? 20 : 0
  return {
    input: String(1000 * round - read - write),
    output: String(30 + round),
    cacheRead: String(read),
    cacheWrite: String(write),
    reasoning: '7',
  }
}

function counted(name: string, lexeme: string | null): object {
  return lexeme === null
    ? { name, state: 'unknown', unit: 'token' }
    : { name, state: 'known', lexeme, unit: 'token' }
}

/** The account that the decoder gives before the termination of a finished response. */
function account(counts: Counts, cost: string | null = null): object {
  return {
    kind: 'account',
    event: 'usage',
    value: {
      usage: [
        counted('input', counts.input),
        counted('output', counts.output),
        counted('cache-read', counts.cacheRead),
        counted('cache-write', counts.cacheWrite),
        counted('reasoning', counts.reasoning),
      ],
      cost:
        cost === null
          ? []
          : [{ state: 'known', lexeme: cost, unit: 'openrouter-credit', source: 'supplier' }],
      trimmed: { state: 'unknown', unit: 'token' },
      place: 'openrouter/Anthropic',
      duration: { state: 'unknown' },
      revision: '1',
    },
  }
}

function completed(reason: 'stop' | 'tool-suggestions' | 'limit'): object {
  return { kind: 'ended', termination: { kind: 'completed', reason } }
}

function failed(cause: string, diagnostic: string): object {
  return {
    kind: 'ended',
    termination: { kind: 'failed', fault: { cause, diagnostic, upstreamStatus: null } },
  }
}

// --- requests --------------------------------------------------------------------------------

const PROVIDER = { allow_fallbacks: false, order: ['anthropic'], require_parameters: true }
const CACHE = { type: 'ephemeral', ttl: '1h' }

function text(value: string, cached = false): object {
  return cached
    ? { type: 'text', text: value, cache_control: CACHE }
    : { type: 'text', text: value }
}

/** The request of the sealed `input()`: an instruction, a reminder, a user turn and 128 tokens. */
const BASIC: RequestParts = {
  system: [textBlock('s1', 'instruction')],
  messages: [
    message('r1', 'system_reminder', [textBlock('b1', 'keep going')]),
    message('u1', 'user', [textBlock('b2', 'hello')]),
  ],
  parameters: [{ kind: 'max-output-tokens', value: '128' }],
}

/** The reminder goes out as a user message; every content is an array of parts. */
function basicBody(record: string): unknown {
  return {
    max_tokens: 128,
    messages: [
      { content: [text('instruction')], role: 'system' },
      { content: [text('keep going')], role: 'user' },
      { content: [text('hello', true)], role: 'user' },
    ],
    model: record,
    provider: PROVIDER,
    store: false,
    stream: true,
  }
}

function basicCase(
  input: Omit<FixtureCase, 'request' | 'body' | 'slot' | 'record'> &
    Partial<Pick<FixtureCase, 'record'>>,
): FixtureCase {
  const record = input.record ?? SONNET
  return { slot: 'case', ...input, record, request: BASIC, body: basicBody(record) }
}

// --- the three rounds of the sealed family test ----------------------------------------------

const LOOKUP_SCHEMA = {
  type: 'object',
  properties: { query: { type: 'string' } },
  required: ['query'],
  additionalProperties: false,
}

const LOOKUP_TOOL = {
  name: 'lookup__exact',
  description: 'Look up an exact value',
  argumentsSchema: tree(LOOKUP_SCHEMA),
}

const LOOKUP_WIRE = {
  type: 'function',
  function: {
    name: 'lookup__exact',
    description: 'Look up an exact value',
    parameters: LOOKUP_SCHEMA,
  },
}

const ROUND_PARAMETERS = [
  { kind: 'max-output-tokens', value: '512' },
  { kind: 'reasoning-effort', value: 'high' },
] as const

const SYSTEM = 'Answer briefly. Stable certification prefix.'

function leafOf(record: string): string {
  return record.slice('anthropic/'.length)
}

/** The joined round-1 item: id-less text fragments, then the signature alone. */
function roundOneItem(record: string): Readonly<Record<string, unknown>> {
  return {
    type: 'reasoning.text',
    text: 'Plan the lookup. Check CEDAR.',
    format: FORMAT,
    index: 0,
    signature: `SIG-R1-${leafOf(record)}`,
  }
}

function roundOneFragments(record: string): readonly object[] {
  return [
    { type: 'reasoning.text', text: 'Plan the lookup. ', format: FORMAT, index: 0 },
    { type: 'reasoning.text', text: 'Check CEDAR.', format: FORMAT, index: 0 },
    { type: 'reasoning.text', signature: `SIG-R1-${leafOf(record)}`, format: FORMAT, index: 0 },
  ]
}

function roundTwoItem(record: string): Readonly<Record<string, unknown>> {
  return {
    type: 'reasoning.encrypted',
    id: 'enc-2',
    data: `ENC-R2-${leafOf(record)}`,
    format: FORMAT,
    index: 0,
  }
}

function roundThreeItems(record: string): readonly Readonly<Record<string, unknown>>[] {
  return [
    {
      type: 'reasoning.text',
      id: 'think-a',
      text: 'First block.',
      format: FORMAT,
      index: 0,
      signature: `SIG-R3-A-${leafOf(record)}`,
    },
    {
      type: 'reasoning.text',
      id: 'think-b',
      text: 'Second block.',
      format: FORMAT,
      index: 1,
      signature: `SIG-R3-B-${leafOf(record)}`,
    },
  ]
}

function replayOf(record: string, at: readonly number[]): object {
  return { replay: { scope: `openrouter/${record}`, format: FORMAT, at } }
}

/** Round 1 with the lookup tool: late-signed thinking, then a tool call. */
function roundOneWithTool(record: string): FixtureCase {
  return {
    id: `three-rounds-r1-tools-${leafOf(record)}`,
    slot: 'record',
    record,
    source: `${CURRENT}:468-503 "Anthropic three rounds through public invokeModel over local TLS (4 / mp4-18)" tools=true, round 1 (request :106-150, reply :171-233)`,
    request: {
      system: [textBlock('s1', SYSTEM)],
      messages: [message('u1', 'user', [textBlock('b1', 'Turn 1.')])],
      tools: [LOOKUP_TOOL],
      parameters: ROUND_PARAMETERS,
    },
    body: {
      max_tokens: 512,
      messages: [
        { content: [text(SYSTEM)], role: 'system' },
        { content: [text('Turn 1.', true)], role: 'user' },
      ],
      model: record,
      provider: PROVIDER,
      reasoning: { effort: 'high' },
      store: false,
      stream: true,
      tool_choice: 'auto',
      tools: [LOOKUP_WIRE],
    },
    stream:
      reasoningFrames(record, roundOneFragments(record)) +
      sse(
        choice({
          tool_calls: [
            {
              index: 0,
              id: 'toolu_1',
              function: { name: 'lookup__exact', arguments: '{"query":"CEDAR"}' },
            },
          ],
        }),
      ) +
      roundUsage(record, 1) +
      finish('tool_calls'),
    facts: [
      open(0, 'thinking'),
      delta(0, 'Plan the lookup. '),
      delta(0, 'Check CEDAR.'),
      open(1, 'tool-arguments'),
      delta(1, '{"query":"CEDAR"}'),
      seal(0, 'thinking', 'Plan the lookup. Check CEDAR.'),
      sealCall(1, 'toolu_1', 'lookup__exact', { query: 'CEDAR' }),
      sealState(2, groupPayload([roundOneItem(record)]), ['b0']),
      account(roundCounts(1)),
      completed('tool-suggestions'),
    ],
  }
}

/** Round 2 without tools: round 1 (with an image) goes back signed, the reply is encrypted. */
function roundTwo(record: string): FixtureCase {
  const one = roundOneItem(record)
  const two = roundTwoItem(record)
  return {
    id: `three-rounds-r2-${leafOf(record)}`,
    slot: 'record',
    record,
    source: `${CURRENT}:468-503 "Anthropic three rounds through public invokeModel over local TLS (4 / mp4-18)" tools=false, round 2 (history :253-306, reply :171-233, replay check :416-430)`,
    request: {
      system: [textBlock('s1', SYSTEM)],
      messages: [
        message('u1', 'user', [textBlock('b1', 'Turn 1.'), imageBlock('i1')]),
        message(
          'a1',
          'assistant',
          [
            thinkingBlock('k1', 'Plan the lookup. Check CEDAR.'),
            textBlock('t1', 'Answer 1.'),
            stateBlock('s1', groupPayload([one]), ['k1']),
          ],
          replayOf(record, [2]),
        ),
        message('u2', 'user', [textBlock('b2', 'Turn 2.')]),
      ],
      parameters: ROUND_PARAMETERS,
    },
    body: {
      max_tokens: 512,
      messages: [
        { content: [text(SYSTEM)], role: 'system' },
        {
          content: [
            text('Turn 1.'),
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' },
            },
          ],
          role: 'user',
        },
        { content: [text('Answer 1.')], reasoning_details: [one], role: 'assistant' },
        { content: [text('Turn 2.', true)], role: 'user' },
      ],
      model: record,
      provider: PROVIDER,
      reasoning: { effort: 'high' },
      store: false,
      stream: true,
    },
    stream:
      reasoningFrames(record, [two]) +
      sse(choice({ content: 'Answer 2.' })) +
      roundUsage(record, 2) +
      finish(),
    facts: [
      open(0, 'text'),
      delta(0, 'Answer 2.'),
      seal(0, 'text', 'Answer 2.'),
      sealState(1, groupPayload([two])),
      account(roundCounts(2)),
      completed('stop'),
    ],
  }
}

/** Round 3 with the lookup tool: both earlier groups go back, the reply has two signed blocks. */
function roundThreeWithTool(record: string): FixtureCase {
  const items = roundThreeItems(record)
  return {
    id: `three-rounds-r3-tools-${leafOf(record)}`,
    slot: 'record',
    record,
    source: `${CURRENT}:468-503 "Anthropic three rounds through public invokeModel over local TLS (4 / mp4-18)" tools=true, round 3 (tool result :308-332, reply :171-233, replay check :416-430)`,
    request: {
      system: [textBlock('s1', SYSTEM)],
      messages: [
        message('u1', 'user', [textBlock('b1', 'Turn 1.')]),
        message(
          'a1',
          'assistant',
          [
            thinkingBlock('k1', 'Plan the lookup. Check CEDAR.'),
            callBlock('c1', 'toolu_1', 'lookup__exact'),
            stateBlock('s1', groupPayload([roundOneItem(record)]), ['k1']),
          ],
          replayOf(record, [2]),
        ),
        message('t1', 'tool', [resultBlock('r1', 'toolu_1'), textBlock('b2', 'CEDAR => COPPER')]),
        message(
          'a2',
          'assistant',
          [textBlock('t2', 'Answer 2.'), stateBlock('s2', groupPayload([roundTwoItem(record)]))],
          replayOf(record, [1]),
        ),
        message('u3', 'user', [textBlock('b3', 'Turn 3.')]),
      ],
      tools: [LOOKUP_TOOL],
      parameters: ROUND_PARAMETERS,
    },
    body: {
      max_tokens: 512,
      messages: [
        { content: [text(SYSTEM)], role: 'system' },
        { content: [text('Turn 1.')], role: 'user' },
        {
          content: [],
          reasoning_details: [roundOneItem(record)],
          role: 'assistant',
          tool_calls: [
            {
              function: { arguments: '{"q":"x"}', name: 'lookup__exact' },
              id: 'toolu_1',
              type: 'function',
            },
          ],
        },
        { content: [text('CEDAR => COPPER')], role: 'tool', tool_call_id: 'toolu_1' },
        {
          content: [text('Answer 2.')],
          reasoning_details: [roundTwoItem(record)],
          role: 'assistant',
        },
        { content: [text('Turn 3.', true)], role: 'user' },
      ],
      model: record,
      provider: PROVIDER,
      reasoning: { effort: 'high' },
      store: false,
      stream: true,
      tool_choice: 'auto',
      tools: [LOOKUP_WIRE],
    },
    stream:
      reasoningFrames(record, items) +
      sse(choice({ content: 'Answer 3.' })) +
      roundUsage(record, 3) +
      finish(),
    facts: [
      open(0, 'thinking'),
      delta(0, 'First block.'),
      delta(0, 'Second block.'),
      open(1, 'text'),
      delta(1, 'Answer 3.'),
      seal(0, 'thinking', 'First block.Second block.'),
      seal(1, 'text', 'Answer 3.'),
      sealState(2, groupPayload(items), ['b0']),
      account(roundCounts(3)),
      completed('stop'),
    ],
  }
}

/**
 * The observed shape: id-less thinking text, then the signature alone; the finish chunk arrives
 * twice and only the second carries the usage.
 */
function observedLateSignature(record: string): FixtureCase {
  const item = {
    type: 'reasoning.text',
    text: 'observed thinking ',
    format: FORMAT,
    index: 0,
    signature: 'SIGNATURE_OBSERVED',
  }
  return {
    id: 'observed-late-signature',
    slot: 'record',
    record,
    source: `${LATE}:272-390 "%s two-turn actual local TLS replay of streamed reasoning details" case "the observed id-less text then signature-only fragments" (:325-349, first request :429-434); the repeated finish with usage follows the observed gateway tail`,
    request: {
      messages: [message('u0', 'user', [textBlock('b0', 'start')])],
      parameters: [
        { kind: 'max-output-tokens', value: '128' },
        { kind: 'reasoning-effort', value: 'high' },
      ],
    },
    body: {
      max_tokens: 128,
      messages: [{ content: [text('start', true)], role: 'user' }],
      model: record,
      provider: PROVIDER,
      reasoning: { effort: 'high' },
      store: false,
      stream: true,
    },
    stream:
      reasoningFrames(record, [
        { type: 'reasoning.text', text: 'observed thinking ', format: FORMAT, index: 0 },
        { type: 'reasoning.text', signature: 'SIGNATURE_OBSERVED', format: FORMAT, index: 0 },
      ]) +
      sse(choice({ content: 'answer 1' })) +
      sse(choice({ content: '' }, 'stop')) +
      raw(
        '{"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":31,"completion_tokens_details":{"reasoning_tokens":7},"prompt_tokens_details":{"cached_tokens":0,"cache_write_tokens":0},"cost":0.000858}}',
      ) +
      DONE,
    facts: [
      open(0, 'thinking'),
      delta(0, 'observed thinking '),
      open(1, 'text'),
      delta(1, 'answer 1'),
      seal(0, 'thinking', 'observed thinking '),
      seal(1, 'text', 'answer 1'),
      sealState(2, groupPayload([item]), ['b0']),
      account(
        { input: '100', output: '31', cacheRead: '0', cacheWrite: '0', reasoning: '7' },
        '0.000858',
      ),
      completed('stop'),
    ],
  }
}

// --- joining reasoning detail fragments ------------------------------------------------------

/** The fragment head of the sealed late-signature tests, with an id. */
const BASE = {
  type: 'reasoning.text',
  id: 'one-thinking-block',
  index: 0,
  format: FORMAT,
  extension: { source: 'controlled' },
}
const { id: _id, ...UNIDENTIFIED } = BASE
/** The head of the first group of the sealed two-turn replay cases. */
const THINKING_A = {
  type: 'reasoning.text',
  id: 'thinking-a',
  index: 0,
  format: FORMAT,
  extension: { source: 'controlled' },
}
const OBSERVED_TEXT = {
  type: 'reasoning.text',
  text: 'Thinking about CEDAR. ',
  format: FORMAT,
  index: 0,
}
const OBSERVED_SIGNATURE = {
  type: 'reasoning.text',
  signature: 'SIGNATURE_OBSERVED',
  format: FORMAT,
  index: 0,
}

/** A basic request whose stream is these details and a finish; the facts follow `visible`. */
function detailsCase(
  input: Readonly<{
    id: string
    source: string
    details: readonly object[]
    /** The visible thinking pieces, in order; empty for none. */
    visible: readonly string[]
    /**
     * The sealed group, or `null` when the group is not replayable. Without visible thinking the
     * finish fails, so no group is sealed.
     */
    group: readonly Readonly<Record<string, unknown>>[] | null
  }>,
): FixtureCase {
  const thinking = input.visible.length > 0
  // Without visible thinking the reply has no block, so the `stop` finish fails and seals nothing.
  const facts = thinking
    ? [
        open(0, 'thinking'),
        ...input.visible.map(piece => delta(0, piece)),
        seal(0, 'thinking', input.visible.join('')),
        ...(input.group === null ? [] : [sealState(1, groupPayload(input.group), ['b0'])]),
        account(NO_COUNTS),
        completed('stop'),
      ]
    : [account(NO_COUNTS), failed('upstream-protocol', 'finish-without-content')]
  return basicCase({
    id: input.id,
    source: `${LATE}:${input.source}`,
    stream: reasoningFrames(SONNET, input.details) + finish(),
    facts,
  })
}

const JOIN_CASES: readonly FixtureCase[] = [
  detailsCase({
    id: 'ls-same-id-late-signature',
    source:
      '70-76 "joins same-id text followed by its late signature without losing extension metadata"',
    details: [
      { ...BASE, text: 'first ', signature: null },
      { ...BASE, text: 'second', signature: 'signed-one' },
    ],
    visible: ['first ', 'second'],
    group: [{ ...BASE, text: 'first second', signature: 'signed-one' }],
  }),
  detailsCase({
    id: 'ls-same-id-repeat-signature',
    source: '78-84 "joins same-id text fragments that carry the same nonempty signature"',
    details: [
      { ...BASE, text: 'first ', signature: 'signed-one' },
      { ...BASE, text: 'second', signature: 'signed-one' },
    ],
    visible: ['first ', 'second'],
    group: [{ ...BASE, text: 'first second', signature: 'signed-one' }],
  }),
  detailsCase({
    id: 'ls-reconstructed-late-signed-group',
    source:
      '272-390 "%s two-turn actual local TLS replay of streamed reasoning details" case "one reconstructed late-signed group" (:292-323)',
    details: [
      { ...THINKING_A, text: 'first ' },
      { ...THINKING_A, text: 'middle ', signature: null },
      { ...THINKING_A, text: 'last', signature: 'SIGNATURE_A' },
    ],
    visible: ['first ', 'middle ', 'last'],
    group: [{ ...THINKING_A, text: 'first middle last', signature: 'SIGNATURE_A' }],
  }),
  detailsCase({
    id: 'ls-idless-repeat-signature',
    source: '99-106 "joins id-less same-index fragments that repeat one signature (R-L)"',
    details: [
      { ...UNIDENTIFIED, text: 'first ', signature: 'signed-one' },
      { ...UNIDENTIFIED, text: 'second', signature: 'signed-one' },
    ],
    visible: ['first ', 'second'],
    group: [{ ...UNIDENTIFIED, text: 'first second', signature: 'signed-one' }],
  }),
  detailsCase({
    id: 'ls-idless-null-then-signed',
    source: '195-202 "fills a null id-less signature from a later same-index signature (R-L)"',
    details: [
      { ...UNIDENTIFIED, text: 'first ', signature: null },
      { ...UNIDENTIFIED, text: 'second', signature: 'signed-one' },
    ],
    visible: ['first ', 'second'],
    group: [{ ...UNIDENTIFIED, text: 'first second', signature: 'signed-one' }],
  }),
  detailsCase({
    id: 'ls-observed-three-fragments',
    source:
      '133-150 "rebuilds the observed id-less text then signature-only fragments into one signed detail"',
    details: [OBSERVED_TEXT, { ...OBSERVED_TEXT, text: 'Second delta.' }, OBSERVED_SIGNATURE],
    visible: ['Thinking about CEDAR. ', 'Second delta.'],
    group: [
      {
        ...OBSERVED_TEXT,
        text: 'Thinking about CEDAR. Second delta.',
        signature: 'SIGNATURE_OBSERVED',
      },
    ],
  }),
  detailsCase({
    id: 'ls-unsigned-after-signature',
    source:
      '152-158 "starts a new id-less entry for an unsigned fragment after the late signature"',
    details: [OBSERVED_TEXT, OBSERVED_SIGNATURE, { ...OBSERVED_TEXT, text: 'next block' }],
    visible: ['Thinking about CEDAR. ', 'next block'],
    group: null,
  }),
  detailsCase({
    id: 'ls-signature-other-index',
    source: '160-163 "keeps a late signature on a different index distinct"',
    details: [OBSERVED_TEXT, { ...OBSERVED_SIGNATURE, index: 1 }],
    visible: ['Thinking about CEDAR. '],
    group: null,
  }),
  detailsCase({
    id: 'ls-second-signature-distinct',
    source: '172-178 "keeps a different second signature distinct after the first one arrived"',
    details: [
      OBSERVED_TEXT,
      OBSERVED_SIGNATURE,
      { ...OBSERVED_SIGNATURE, signature: 'SIGNATURE_OTHER' },
    ],
    visible: ['Thinking about CEDAR. '],
    group: null,
  }),
  detailsCase({
    id: 'ls-distinct-signed-details',
    source:
      '272-390 "%s two-turn actual local TLS replay of streamed reasoning details" case "two truly distinct signed details" (:351)',
    details: [
      {
        type: 'reasoning.text',
        id: 'thinking-a',
        index: 0,
        format: FORMAT,
        extension: { source: 'controlled' },
        text: 'first',
        signature: 'SIGNATURE_A',
      },
      {
        type: 'reasoning.text',
        id: 'thinking-b',
        index: 1,
        format: FORMAT,
        extension: { source: 'controlled' },
        text: 'second',
        signature: 'SIGNATURE_B',
      },
    ],
    visible: ['first', 'second'],
    group: [
      {
        type: 'reasoning.text',
        id: 'thinking-a',
        index: 0,
        format: FORMAT,
        extension: { source: 'controlled' },
        text: 'first',
        signature: 'SIGNATURE_A',
      },
      {
        type: 'reasoning.text',
        id: 'thinking-b',
        index: 1,
        format: FORMAT,
        extension: { source: 'controlled' },
        text: 'second',
        signature: 'SIGNATURE_B',
      },
    ],
  }),
  detailsCase({
    id: 'ls-encrypted-discrete',
    source:
      '259-270 "keeps same-id encrypted details discrete and leaves summary joining unchanged" (encrypted half)',
    details: [
      { ...BASE, type: 'reasoning.encrypted', data: 'cipher' },
      { ...BASE, type: 'reasoning.encrypted', data: 'cipher' },
    ],
    visible: [],
    group: [
      { ...BASE, type: 'reasoning.encrypted', data: 'cipher' },
      { ...BASE, type: 'reasoning.encrypted', data: 'cipher' },
    ],
  }),
]

// --- the boundaries of the sealed family test ------------------------------------------------

/** The first reply of `secondRound`: the given frames, then `Answer 1.`, the round usage, finish. */
function firstReply(frames: string): string {
  return frames + sse(choice({ content: 'Answer 1.' })) + roundUsage(SONNET, 1) + finish()
}

const BOUNDARY_CASES: readonly FixtureCase[] = [
  basicCase({
    id: 'fc-unsigned-group',
    source: `${CURRENT}:746-753 "refuses an unsigned reasoning.text group before the next HTTP request" (first reply)`,
    stream: firstReply(
      reasoningFrames(SONNET, [
        { type: 'reasoning.text', text: 'unsigned', format: FORMAT, index: 0 },
      ]),
    ),
    facts: [
      open(0, 'thinking'),
      delta(0, 'unsigned'),
      open(1, 'text'),
      delta(1, 'Answer 1.'),
      seal(0, 'thinking', 'unsigned'),
      seal(1, 'text', 'Answer 1.'),
      account(roundCounts(1)),
      completed('stop'),
    ],
  }),
  basicCase({
    id: 'fc-redacted-encrypted',
    source: `${CURRENT}:755-765 "refuses a [REDACTED] encrypted placeholder before the next HTTP request (R-M)" (first reply)`,
    stream: firstReply(
      reasoningFrames(SONNET, [
        {
          type: 'reasoning.text',
          text: 'signed',
          signature: 'SIG-claude-sonnet-5',
          format: FORMAT,
          index: 0,
        },
        { type: 'reasoning.encrypted', data: '[REDACTED]', format: FORMAT, index: 1 },
      ]),
    ),
    facts: [
      open(0, 'thinking'),
      delta(0, 'signed'),
      open(1, 'text'),
      delta(1, 'Answer 1.'),
      seal(0, 'thinking', 'signed'),
      seal(1, 'text', 'Answer 1.'),
      account(roundCounts(1)),
      completed('stop'),
    ],
  }),
  basicCase({
    id: 'fc-refusal-as-text',
    source: `${CURRENT}:804-818 "replays an upstream refusal as ordinary assistant text without a cache or signed group" (first reply)`,
    stream: firstReply(
      sse({ ...serving(SONNET), ...choice({ refusal: 'I cannot help with that.' }) }),
    ),
    facts: [
      open(0, 'text'),
      delta(0, 'I cannot help with that.'),
      delta(0, 'Answer 1.'),
      seal(0, 'text', 'I cannot help with that.Answer 1.'),
      account(roundCounts(1)),
      completed('stop'),
    ],
  }),
]

// --- usage -----------------------------------------------------------------------------------

const USAGE_CASES: readonly FixtureCase[] = [
  basicCase({
    id: 'usage-cache-read-and-write',
    source:
      'usage-anthropic-public.spec.ts:28-139 "official Anthropic public invocation response re-anchoring over actual TLS" (first response)',
    stream:
      sse({ ...serving(SONNET), ...choice({ content: 'answer 1' }) }) +
      sse({
        choices: [],
        ...serving(SONNET),
        usage: {
          prompt_tokens: 100,
          completion_tokens: 4,
          prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 5 },
        },
      }) +
      finish(),
    facts: [
      open(0, 'text'),
      delta(0, 'answer 1'),
      seal(0, 'text', 'answer 1'),
      account({ input: '75', output: '4', cacheRead: '20', cacheWrite: '5', reasoning: null }),
      completed('stop'),
    ],
  }),
  basicCase({
    id: 'usage-negative-remainder',
    source:
      'https.spec.ts:819-869 "diagnoses negative input-token relationships without fabricating zero counts" (accounts.ts:17-36)',
    stream:
      sse({ ...serving(SONNET), ...choice({ content: 'ok' }) }) +
      raw(
        '{"usage":{"prompt_tokens":9007199254740993,"prompt_tokens_details":{"cached_tokens":9007199254740994,"cache_write_tokens":0},"completion_tokens":1,"cost":0.00000000000000000012345}}',
      ) +
      finish(),
    facts: [
      open(0, 'text'),
      delta(0, 'ok'),
      seal(0, 'text', 'ok'),
      account(
        {
          input: null,
          output: '1',
          cacheRead: '9007199254740994',
          cacheWrite: '0',
          reasoning: null,
        },
        '0.00000000000000000012345',
      ),
      { kind: 'diagnostic', value: { kind: 'usage-inconsistent', field: 'input' } },
      completed('stop'),
    ],
  }),
]

export const LEGACY_CASES: readonly FixtureCase[] = [
  roundOneWithTool('anthropic/claude-opus-5.5'),
  roundTwo('anthropic/claude-opus-5'),
  observedLateSignature(SONNET),
  roundThreeWithTool('anthropic/claude-fable-5.1'),
  ...JOIN_CASES,
  ...BOUNDARY_CASES,
  ...USAGE_CASES,
]
