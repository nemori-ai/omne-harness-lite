// The Anthropic records: one `current` record per exact OpenRouter model, revision `1`. Pure data:
// a record changes only by a new revision, and the adoption digest covers every member. The
// models, the parameter subset, the cache rule, the limits and the group rule come from the sealed
// `official-models/anthropic.ts` and `input-meters/anthropic-replay.ts` (see provenance.json). No
// record has a prefix rule: the sealed signed-prefix models are not migrated, because the gateway
// takes a foreign tool turn with reasoning on and two of those models refuse reasoning off.
import type { ParameterTable } from '@omne-harness/pi-ai-transport/chat-completions'
import { IMAGE_MEDIA_TYPES } from './images.ts'
import type { AnthropicRecord } from './record.ts'

const OPENROUTER = 'openrouter'

/** SHA-256 of the canonical JSON of the `claude.json` ranks (camel-case shape). */
const CLAUDE_RANKS_DIGEST = 'ec4534e5c09d662b849df5596c6b589cd662b9c84cdc8514360f0e11aad0e7f7'
/** SHA-256 of the canonical JSON of the empty special-token table: the meter names no special token. */
const NO_SPECIAL_TOKENS_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
/** The npm integrity of js-tiktoken 1.0.21, the engine that the repository catalog pins. */
const JS_TIKTOKEN_INTEGRITY =
  'sha512-biOj/6M5qdgx5TKjDnFT1ymSpM5tbd3ylwDtrQvFQSu0Z7bBYko2dF+W/aUkXUPuk6IVpRxk/3Q2sHOzGlS36g=='
/** The upstream commit of anthropics/anthropic-tokenizer-typescript that `claude.json` comes from. */
const CLAUDE_TOKENIZER_COMMIT = '4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b'

/**
 * The legacy Claude BPE of `resources/tokenizers/anthropic-legacy/claude.json`. Anthropic calls it
 * a very rough approximation since Claude 3; it is not the tokenizer of these models, so every
 * count is an estimate and never a tokenizer identity.
 */
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

/**
 * The parameter subset of the sealed route. Reasoning effort `low` to `max` goes out as
 * `reasoning.effort` with the same value; `none` is not offered. The sealed drops of temperature,
 * top-p, seed and the two penalties are explicit `unsupported` entries.
 */
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

/** The replay part: Anthropic signed or encrypted groups only, and no prefix rule. */
const REPLAY = {
  // Defaults: produces `openrouter/<route.model>`, accepts only itself, foreign thinking `omit`.
  declaration: {},
  formats: { produces: 'anthropic-claude-v1', accepts: ['anthropic-claude-v1'] },
  prefix: { kind: 'none' },
} as const

/** Everything the records share besides the head. */
const COMMON = {
  serving: { order: ['anthropic'], reports: ['Anthropic', 'anthropic'] },
  wire: {
    roles: { instruction: 'system', reminder: 'user' },
    content: 'parts',
    cache: { kind: 'last-message', ttl: '1h' },
    image: { mediaTypes: IMAGE_MEDIA_TYPES, detail: 'auto' },
    fixed: [{ field: 'store', value: false }],
    usageTail: { maxFrames: 2 },
  },
  parameters: PARAMETERS,
  extensions: [],
  profile: {
    input: ['text', 'image'],
    output: ['text'],
    context: {
      window: { provided: '1000000', upstream: { kind: 'unknown' } },
      input: { provided: '872000', upstream: { kind: 'unknown' } },
      output: { provided: '128000', upstream: { kind: 'unknown' } },
    },
    limits: [{ metric: 'image-bytes', provided: '4194304', upstream: { kind: 'unknown' } }],
    evidence:
      'The sealed Anthropic definitions cite an OpenRouter route report of 2026-09-28: a shared 1000000-token window and a 128000-token output ceiling for the selected Anthropic endpoints. The report is not in the repository, so no upstream value is established. The 872000-token input limit reserves the whole output ceiling. The 4194304-byte image limit and the stop sequence limits are the offering of this project.',
  },
  replay: REPLAY,
  rules: {
    reasoning: 'anthropic-signed-group/1',
    usage: 'anthropic-usage/1',
    toolSchema: 'object-root/1',
    check: 'none/1',
  },
  meter: {
    representation: 'anthropic-visible-json/1',
    text: 'claude-legacy-bpe-estimate/1',
    image: 'claude-patch-28/1',
    tokenizer: ANTHROPIC_TOKENIZER,
  },
} as const

/** The Anthropic records. The record list is the only list of models in this package. */
export const ANTHROPIC_RECORDS = [
  {
    name: 'anthropic/claude-opus-5.5',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'anthropic/claude-opus-5.5' },
    status: 'current',
    ...COMMON,
  },
  {
    name: 'anthropic/claude-opus-5',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'anthropic/claude-opus-5' },
    status: 'current',
    ...COMMON,
  },
  {
    name: 'anthropic/claude-sonnet-5',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'anthropic/claude-sonnet-5' },
    status: 'current',
    ...COMMON,
  },
  {
    name: 'anthropic/claude-fable-5.1',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'anthropic/claude-fable-5.1' },
    status: 'current',
    ...COMMON,
  },
] as const satisfies readonly AnthropicRecord[]
