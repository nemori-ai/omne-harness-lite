import type { RecordFact, RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ParameterTable } from '@omne-harness/pi-ai-transport/chat-completions'
import { IMAGE_MEDIA_TYPES } from './images.ts'
import type { AnthropicRecord } from './record.ts'

const OPENROUTER = 'openrouter'

const CLAUDE_RANKS_DIGEST = 'ec4534e5c09d662b849df5596c6b589cd662b9c84cdc8514360f0e11aad0e7f7'
const NO_SPECIAL_TOKENS_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
const JS_TIKTOKEN_INTEGRITY =
  'sha512-biOj/6M5qdgx5TKjDnFT1ymSpM5tbd3ylwDtrQvFQSu0Z7bBYko2dF+W/aUkXUPuk6IVpRxk/3Q2sHOzGlS36g=='
const CLAUDE_TOKENIZER_COMMIT = '4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b'

export const ANTHROPIC_TOKENIZER = {
  adoption: {
    owner: '@omne-harness/pi-ai-anthropic',
    name: 'claude-legacy-bpe',
    revision: '1',
    digest: CLAUDE_RANKS_DIGEST,
  },
  implementation: {
    owner: 'js-tiktoken',
    name: 'js-tiktoken',
    revision: '1.0.21',
    digest: JS_TIKTOKEN_INTEGRITY,
  },
  vocabulary: {
    owner: 'anthropics/anthropic-tokenizer-typescript',
    name: 'claude.json',
    revision: CLAUDE_TOKENIZER_COMMIT,
    digest: CLAUDE_RANKS_DIGEST,
  },
  configuration: {
    owner: '@omne-harness/pi-ai-anthropic',
    name: 'no-special-tokens',
    revision: '1',
    digest: NO_SPECIAL_TOKENS_DIGEST,
  },
} as const

const PARAMETERS = {
  temperature: { support: 'unsupported' },
  'top-p': { support: 'unsupported' },
  'max-output-tokens': {
    support: 'supported',
    default: { kind: 'absent' },
    accept: { max: '128000' },
    wire: { field: 'max_tokens' },
  },
  stop: {
    support: 'supported',
    default: { kind: 'absent' },
    accept: { maxItems: 16, maxLength: 1024 },
    wire: { field: 'stop' },
  },
  'reasoning-effort': {
    support: 'supported',
    default: { kind: 'absent' },
    accept: {},
    wire: {
      none: 'unsupported',
      low: { field: 'reasoning.effort', value: 'low' },
      medium: { field: 'reasoning.effort', value: 'medium' },
      high: { field: 'reasoning.effort', value: 'high' },
      max: { field: 'reasoning.effort', value: 'max' },
    },
  },
  seed: { support: 'unsupported' },
  'frequency-penalty': { support: 'unsupported' },
  'presence-penalty': { support: 'unsupported' },
} as const satisfies ParameterTable

/** The payload of a reasoning state on the Messages interface: its thinking blocks, in order. */
export const ANTHROPIC_REASONING_FORMAT = 'anthropic-messages-v1'

const COMMON = {
  engine: 'messages',
  serving: { order: ['anthropic'], reports: ['Anthropic', 'anthropic'] },
  wire: {
    cache: { kind: 'last-message', ttl: '1h' },
    image: { mediaTypes: IMAGE_MEDIA_TYPES },
    thinking: { display: 'summarized' },
    toolNames: { rule: 'underscore/1', maxLength: 64 },
  },
  parameters: PARAMETERS,
  extensions: [],
  profile: {
    input: ['text', 'image'],
    output: ['text'],
    context: {
      window: { provided: '1000000', upstream: { kind: 'finite', amount: '1000000' } },
      input: { provided: '872000', upstream: { kind: 'unknown' } },
      output: { provided: '128000', upstream: { kind: 'finite', amount: '128000' } },
    },
    limits: [{ metric: 'image-bytes', provided: '4194304', upstream: { kind: 'unknown' } }],
    evidence:
      'Anthropic models overview (https://platform.claude.com/docs/en/about-claude/models/overview) and model pages (https://platform.claude.com/docs/en/models/<model>/overview) observed 2026-11-03: a 1M-token context window and a 128K-token max output on the synchronous Messages API for every model of these records. OpenRouter endpoint metadata (https://openrouter.ai/api/v1/models/<route>/endpoints) observed 2026-11-03 for the Anthropic endpoint agrees: a 1000000-token context and a 128000-token max completion, with no max prompt; the same endpoint metadata for claude-fable-5.2, observed 2026-11-18, gives the same two values. No upstream input limit is published; the 872000-token input limit reserves the whole output ceiling. The 4194304-byte image limit and the stop sequence limits are the offering of this project.',
  },
  meter: {
    representation: 'anthropic-visible-json/1',
    text: 'claude-legacy-bpe-estimate/1',
    image: 'claude-patch-28/1',
    tokenizer: ANTHROPIC_TOKENIZER,
  },
} as const

const MEASURED = '2026-11-18'

const MATRIX: Readonly<Partial<Record<RecordFact, string>>> = {
  efforts: 'one request per effort: low to max accepted; minimal and none refused with 400',
  'reasoning-off':
    'thinking disabled, one request; no record maps effort none, by the project convention',
  'forced-tool-choice': 'tool_choice any and tool, one request each',
  'ends-with-assistant':
    'a request ending with an assistant message, one request: 400 "does not support assistant message prefill"',
  'replay-binding':
    'a reasoning block carried after an earlier message was edited, one request: kept means no binding, dropped and reported means bound to the prefix',
}

// Every fact cites the real stream of this record on the Messages interface; the facts that
// stream cannot show also name the measurement that showed them.
function provenanceOf(model: string, revision: string): RecordProvenance {
  const record = encodeURIComponent(`anthropic/${model}`)
  const evidence = `packages/model/pi-ai-anthropic/tests/fixtures/records/${record}/${revision}/stream.sse`
  const fact = (name: RecordFact) => {
    const note = MATRIX[name]
    return note === undefined
      ? { measuredAt: MEASURED, evidence }
      : { measuredAt: MEASURED, evidence, note }
  }
  return {
    engine: fact('engine'),
    efforts: fact('efforts'),
    'reasoning-off': fact('reasoning-off'),
    'forced-tool-choice': fact('forced-tool-choice'),
    'ends-with-assistant': fact('ends-with-assistant'),
    'replay-shape': fact('replay-shape'),
    'replay-binding': fact('replay-binding'),
    cache: fact('cache'),
    'system-placement': fact('system-placement'),
    'usage-fields': fact('usage-fields'),
  }
}

function replayOf(binding: 'prefix' | 'none') {
  return {
    declaration: {},
    formats: { produces: ANTHROPIC_REASONING_FORMAT, accepts: [ANTHROPIC_REASONING_FORMAT] },
    binding,
  } as const
}

type Measured = Readonly<{
  model: string
  revision: string
  forcedToolChoice: boolean
  binding: 'prefix' | 'none'
}>

function recordOf(item: Measured) {
  return {
    name: `anthropic/${item.model}`,
    revision: item.revision,
    route: { provider: OPENROUTER, model: `anthropic/${item.model}` },
    status: 'current',
    ...COMMON,
    accepts: { forcedToolChoice: item.forcedToolChoice, endsWithAssistant: false },
    replay: replayOf(item.binding),
    provenance: provenanceOf(item.model, item.revision),
  } as const satisfies AnthropicRecord
}

export const ANTHROPIC_RECORDS = [
  recordOf({
    model: 'claude-fable-5.2',
    revision: '1',
    forcedToolChoice: false,
    binding: 'prefix',
  }),
  recordOf({
    model: 'claude-fable-5.1',
    revision: '3',
    forcedToolChoice: false,
    binding: 'prefix',
  }),
  recordOf({ model: 'claude-opus-5.5', revision: '3', forcedToolChoice: false, binding: 'prefix' }),
  recordOf({ model: 'claude-opus-5', revision: '3', forcedToolChoice: true, binding: 'none' }),
  recordOf({
    model: 'claude-sonnet-5.5',
    revision: '2',
    forcedToolChoice: false,
    binding: 'prefix',
  }),
  recordOf({ model: 'claude-sonnet-5', revision: '3', forcedToolChoice: true, binding: 'none' }),
  recordOf({ model: 'claude-haiku-5.5', revision: '2', forcedToolChoice: true, binding: 'prefix' }),
] as const satisfies readonly AnthropicRecord[]
