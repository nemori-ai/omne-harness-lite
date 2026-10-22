// The OpenAI records: one `current` record per exact OpenRouter model, revision `1`. Pure data: a
// record changes only by a new revision, and the adoption digest covers every member. The models,
// effort sets, image rules, Pro usage scope, limits and evidence come from the sealed
// `official-models/openai.ts` and `input-meters/openai-family-policy.ts` (see provenance.json).
import type { ParameterTable } from '@omne-harness/pi-ai-transport/chat-completions'
import type { OpenAiRecord } from './record.ts'

const OPENROUTER = 'openrouter'

/** SHA-256 of the canonical JSON of the js-tiktoken `o200k_base` ranks (camel-case shape). */
const O200K_RANKS_DIGEST = '6cf16f9e2292763021bb70ffed8e113a55f8d26f34110514c2518f47db1ea806'
/** SHA-256 of the canonical JSON of the empty special-token table: the meter names no special token. */
const NO_SPECIAL_TOKENS_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
/** The npm integrity of js-tiktoken 1.0.21, the engine that the repository catalog pins. */
const JS_TIKTOKEN_INTEGRITY =
  'sha512-biOj/6M5qdgx5TKjDnFT1ymSpM5tbd3ylwDtrQvFQSu0Z7bBYko2dF+W/aUkXUPuk6IVpRxk/3Q2sHOzGlS36g=='

/**
 * o200k_base as a proxy encoding. The OpenAI tiktoken table maps gpt-5* to o200k_base; it does
 * not name GPT-6, so every count is an estimate and never a tokenizer identity.
 */
export const OPENAI_TOKENIZER = {
  adoption: {
    owner: '@omne-harness/pi-ai-openai',
    name: 'o200k-proxy',
    revision: '1',
    digest: O200K_RANKS_DIGEST,
  },
  implementation: {
    owner: 'js-tiktoken',
    name: 'js-tiktoken',
    revision: '1.0.21',
    digest: JS_TIKTOKEN_INTEGRITY,
  },
  vocabulary: {
    owner: 'js-tiktoken',
    name: 'o200k_base',
    revision: '1.0.21',
    digest: O200K_RANKS_DIGEST,
  },
  configuration: {
    owner: '@omne-harness/pi-ai-openai',
    name: 'no-special-tokens',
    revision: '1',
    digest: NO_SPECIAL_TOKENS_DIGEST,
  },
} as const

/**
 * Reasoning effort through OpenRouter `reasoning.effort`. `none` and `max` are unsupported: the
 * gateway vocabulary of the engine has no `none` and no `max` effort, and this family does not
 * write another value in their place.
 */
const STANDARD_EFFORT = {
  support: 'supported',
  default: { kind: 'absent' },
  accept: {},
  wire: {
    none: 'unsupported',
    low: { field: 'reasoning.effort', value: 'low' },
    medium: { field: 'reasoning.effort', value: 'medium' },
    high: { field: 'reasoning.effort', value: 'high' },
    max: 'unsupported',
  },
} as const

/** The common parameter table: only the output limit and the reasoning effort pass. */
const COMMON_PARAMETERS = {
  temperature: { support: 'unsupported' },
  'top-p': { support: 'unsupported' },
  'max-output-tokens': {
    support: 'supported',
    default: { kind: 'absent' },
    accept: { max: '128000' },
    wire: { field: 'max_tokens' },
  },
  stop: { support: 'unsupported' },
  'reasoning-effort': STANDARD_EFFORT,
  seed: { support: 'unsupported' },
  'frequency-penalty': { support: 'unsupported' },
  'presence-penalty': { support: 'unsupported' },
} as const satisfies ParameterTable

/** The published effort set `none`, `low`, `medium`, `high`, `max`. */
const STANDARD_PARAMETERS = COMMON_PARAMETERS

/** Astra publishes `low`, `medium`, `high` and `max`, without `none`. */
const ASTRA_PARAMETERS = {
  ...COMMON_PARAMETERS,
  'reasoning-effort': {
    ...STANDARD_EFFORT,
    wire: { ...STANDARD_EFFORT.wire, none: 'unsupported' },
  },
} as const satisfies ParameterTable

/** Everything the records share besides the head, the parameters, the usage rule and the image rule. */
const COMMON = {
  serving: { order: ['openai'], reports: ['OpenAI', 'openai'] },
  wire: {
    roles: { instruction: 'developer', reminder: 'developer' },
    content: 'compact',
    cache: { kind: 'none' },
    image: { mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], detail: 'auto' },
    fixed: [{ field: 'store', value: false }],
    usageTail: { maxFrames: 2 },
  },
  extensions: [],
  replay: {
    // Defaults: produces `openrouter/<route.model>`, accepts only itself, foreign thinking `omit`.
    declaration: {},
    formats: { produces: 'openai-responses-v1', accepts: ['openai-responses-v1'] },
    prefix: { kind: 'none' },
  },
  profile: {
    input: ['text', 'image'],
    output: ['text'],
    context: {
      window: { provided: '1050000', upstream: { kind: 'finite', amount: '1050000' } },
      input: { provided: '922000', upstream: { kind: 'finite', amount: '922000' } },
      output: { provided: '128000', upstream: { kind: 'finite', amount: '128000' } },
    },
    limits: [{ metric: 'image-bytes', provided: '4194304', upstream: { kind: 'unknown' } }],
    evidence:
      'OpenRouter endpoint metadata observed 2026-09-28 for the selected OpenAI endpoint: a 1050000-token shared window, a 922000-token max prompt and a 128000-token max completion. The 4194304-byte image limit is the offering of this project; no upstream per-image byte limit is established.',
  },
} as const

const RULES = {
  reasoning: 'openai-encrypted/1',
  usage: 'openai-usage/1',
  toolSchema: 'object-root/1',
  check: 'none/1',
} as const

const METER = {
  representation: 'openai-visible-json/1',
  text: 'o200k-proxy/1',
  image: 'gpt56-patch/1',
  tokenizer: OPENAI_TOKENIZER,
} as const

/** The OpenAI records. The record list is the only list of models in this package. */
export const OPENAI_RECORDS = [
  {
    name: 'openai/gpt-6-astra',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-6-astra' },
    status: 'current',
    ...COMMON,
    parameters: ASTRA_PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'astra-patch/1' },
  },
  {
    name: 'openai/gpt-6-astra-pro',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-6-astra-pro' },
    status: 'current',
    ...COMMON,
    parameters: ASTRA_PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'astra-patch/1' },
  },
  {
    name: 'openai/gpt-6-sol',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-6-sol' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-6-sol-pro',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-6-sol-pro' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-6-luna',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-6-luna' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-6-luna-pro',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-6-luna-pro' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-5.6-sol',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-5.6-sol' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-sol-pro',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-5.6-sol-pro' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-terra',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-5.6-terra' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-terra-pro',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-5.6-terra-pro' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-luna',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-5.6-luna' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-luna-pro',
    revision: '1',
    route: { recipient: OPENROUTER, model: 'openai/gpt-5.6-luna-pro' },
    status: 'current',
    ...COMMON,
    parameters: STANDARD_PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
] as const satisfies readonly OpenAiRecord[]
