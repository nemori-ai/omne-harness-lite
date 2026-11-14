import type { ParameterTable } from '@omne-harness/pi-ai-transport/chat-completions'
import type { OpenAiRecord } from './record.ts'

const OPENROUTER = 'openrouter'

const O200K_RANKS_DIGEST = '6cf16f9e2292763021bb70ffed8e113a55f8d26f34110514c2518f47db1ea806'
const NO_SPECIAL_TOKENS_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
const JS_TIKTOKEN_INTEGRITY =
  'sha512-biOj/6M5qdgx5TKjDnFT1ymSpM5tbd3ylwDtrQvFQSu0Z7bBYko2dF+W/aUkXUPuk6IVpRxk/3Q2sHOzGlS36g=='

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

const EFFORT = {
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
  stop: { support: 'unsupported' },
  'reasoning-effort': EFFORT,
  seed: { support: 'unsupported' },
  'frequency-penalty': { support: 'unsupported' },
  'presence-penalty': { support: 'unsupported' },
} as const satisfies ParameterTable

const COMMON = {
  serving: { order: ['openai'], reports: ['OpenAI', 'openai'] },
  wire: {
    roles: { instruction: 'system', reminder: 'developer' },
    content: 'compact',
    cache: { kind: 'none' },
    image: { mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], detail: 'auto' },
    fixed: [{ field: 'store', value: false }],
    usageTail: { maxFrames: 2 },
    toolNames: { rule: 'underscore/1', maxLength: 64 },
  },
  extensions: [],
  replay: {
    declaration: {},
    formats: { produces: 'openai-responses-v1', accepts: ['openai-responses-v1'] },
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

const GPT61_LIMITS =
  'OpenAI model pages and OpenRouter endpoint metadata observed 2026-11-03 for the selected OpenAI endpoint: a 1050000-token shared window, a 922000-token max prompt and a 128000-token max completion. The 4194304-byte image limit is the offering of this project; no upstream per-image byte limit is established.'

const GPT61_SOL_PROFILE = { ...COMMON.profile, evidence: GPT61_LIMITS } as const

const GPT61_TERRA_PROFILE = {
  ...COMMON.profile,
  evidence: `${GPT61_LIMITS} The image rule sol-luna-auto-proxy/1 is an inference: the OpenAI image guide of 2026-11-03 does not name gpt-6.1-terra and GPT-6 has no Terra model, so the rule of GPT-6 Sol and Luna stands in.`,
} as const

export const OPENAI_RECORDS = [
  {
    name: 'openai/gpt-6-astra',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6-astra' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'astra-patch/1' },
  },
  {
    name: 'openai/gpt-6-astra-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6-astra-pro' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'astra-patch/1' },
  },
  {
    name: 'openai/gpt-6-sol',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6-sol' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-6-sol-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6-sol-pro' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-6-luna',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6-luna' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-6-luna-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6-luna-pro' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-6.1-sol',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6.1-sol' },
    status: 'current',
    ...COMMON,
    profile: GPT61_SOL_PROFILE,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-6.1-terra',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6.1-terra' },
    status: 'current',
    ...COMMON,
    profile: GPT61_TERRA_PROFILE,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  {
    name: 'openai/gpt-5.6-sol',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-sol' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-sol-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-sol-pro' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-terra',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-terra' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-terra-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-terra-pro' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-luna',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-luna' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-luna-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-luna-pro' },
    status: 'current',
    ...COMMON,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
] as const satisfies readonly OpenAiRecord[]
