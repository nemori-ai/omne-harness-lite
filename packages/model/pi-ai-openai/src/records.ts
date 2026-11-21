import type { RecordFact, RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ParameterTable } from '@omne-harness/pi-ai-transport/chat-completions'
import type { ImageRuleName } from './images.ts'
import type { OpenAiRecord, OpenAiResponsesRecord, ProfileData } from './record.ts'

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

const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

const ENDPOINT_PROFILE = {
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
} as const

const CHAT = {
  serving: { order: ['openai'], reports: ['OpenAI', 'openai'] },
  wire: {
    roles: { instruction: 'system', reminder: 'developer' },
    content: 'compact',
    cache: { kind: 'none' },
    image: { mediaTypes: IMAGE_MEDIA_TYPES, detail: 'auto' },
    fixed: [{ field: 'store', value: false }],
    usageTail: { maxFrames: 2 },
    toolNames: { rule: 'underscore/1', maxLength: 64 },
  },
  extensions: [],
  replay: {
    declaration: {},
    formats: { produces: 'openai-responses-v1', accepts: ['openai-responses-v1'] },
  },
  profile: ENDPOINT_PROFILE,
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

const GPT61_SOL_PROFILE = { ...ENDPOINT_PROFILE, evidence: GPT61_LIMITS } as const

const GPT61_TERRA_PROFILE = {
  ...ENDPOINT_PROFILE,
  evidence: `${GPT61_LIMITS} The image rule sol-luna-auto-proxy/1 is an inference: the OpenAI image guide of 2026-11-03 does not name gpt-6.1-terra and GPT-6 has no Terra model, so the rule of GPT-6 Sol and Luna stands in.`,
} as const

function gpt62Profile(model: string) {
  return {
    ...GPT61_SOL_PROFILE,
    evidence: `OpenRouter endpoint metadata observed 2026-11-18 for openai/${model}: a 1050000-token context, a 922000-token max prompt and a 128000-token max completion on the OpenAI endpoint; image input listed. The image rule sol-luna-auto-proxy/1 is an inference: the OpenAI site gives no image rule for GPT-6.2, so the rule of GPT-6.1 Sol stands in.`,
  } as const
}

/** The payload of a reasoning state on the Responses interface: the output items of one reply. */
export const OPENAI_REASONING_FORMAT = 'openai-responses-items-v1'

const RESPONSES = {
  engine: 'responses',
  serving: { order: ['openai'], reports: ['OpenAI'] },
  wire: {
    system: 'developer',
    cache: { kind: 'automatic' },
    image: { mediaTypes: IMAGE_MEDIA_TYPES },
    reasoning: { summary: 'auto' },
    toolNames: { rule: 'underscore/1', maxLength: 64 },
  },
  parameters: PARAMETERS,
  extensions: [],
  accepts: { forcedToolChoice: true, endsWithAssistant: true },
} as const

const MEASURED = '2026-11-18'

const MATRIX: Readonly<Partial<Record<RecordFact, string>>> = {
  efforts: 'one request per effort: minimal to max accepted',
  'reasoning-off':
    'reasoning disabled, one request: gpt-6.2-astra, gpt-6-astra, gpt-6.2-sol and gpt-6.1-sol refused with 400 "Reasoning is mandatory for this endpoint and cannot be disabled.", the others accepted; no record maps effort none, by the project convention',
  'forced-tool-choice': 'tool_choice required and a named function, one request each: accepted',
  'ends-with-assistant': 'a request ending with an assistant message, one request: accepted',
  'replay-binding':
    'reasoning items carried after an earlier message was edited, one request: on gpt-6.2-astra and gpt-6.2-sol the input tokens fell by 7 to 16, read as dropped, so bound to the prefix; on the others they counted as usual, so no binding',
  cache:
    'a three-turn session on the release service (live model matrix): with automatic caching and a session key the later requests read 0.996 of their input from the cache on gpt-6.1-terra and gpt-6.2-sol; an explicit breakpoint moved to the newest message each turn read nothing on gpt-6.1-terra',
  'system-placement': 'one developer message asking for capital letters: the reply was in capitals',
}

// Every fact cites the real stream of this record on the Responses interface; the facts that
// stream cannot show also name the measurement that showed them.
function provenanceOf(name: string, revision: string): RecordProvenance {
  const evidence = `packages/model/pi-ai-openai/tests/fixtures/records/${encodeURIComponent(name)}/${revision}/stream.sse`
  const fact = (key: RecordFact) => {
    const note = MATRIX[key]
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
    formats: { produces: OPENAI_REASONING_FORMAT, accepts: [OPENAI_REASONING_FORMAT] },
    binding,
  } as const
}

/** A PDF the model reads natively; one file up to 32 MiB is the offering of this project, no upstream limit is established. */
const PDF = { mediaTypes: ['application/pdf'], maxBytes: 33554432 } as const

type Measured = Readonly<{
  model: string
  revision: string
  binding: 'prefix' | 'none'
  profile: ProfileData
  image: ImageRuleName
  /** Files read natively, and the request that showed it. */
  files?: Readonly<{ evidence: string }>
}>

function recordOf(item: Measured) {
  const name = `openai/${item.model}`
  return {
    name,
    revision: item.revision,
    route: { provider: OPENROUTER, model: name },
    status: 'current',
    ...RESPONSES,
    ...(item.files === undefined ? {} : { wire: { ...RESPONSES.wire, file: PDF } }),
    replay: replayOf(item.binding),
    profile:
      item.files === undefined
        ? item.profile
        : { ...item.profile, evidence: `${item.profile.evidence} ${item.files.evidence}` },
    meter: { ...METER, image: item.image },
    provenance: provenanceOf(name, item.revision),
  } as const satisfies OpenAiResponsesRecord
}

export const OPENAI_RECORDS = [
  recordOf({
    model: 'gpt-6-astra',
    revision: '3',
    binding: 'none',
    profile: ENDPOINT_PROFILE,
    image: 'astra-patch/1',
  }),
  {
    name: 'openai/gpt-6-astra-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6-astra-pro' },
    status: 'current',
    ...CHAT,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'astra-patch/1' },
  },
  recordOf({
    model: 'gpt-6-sol',
    revision: '3',
    binding: 'none',
    profile: ENDPOINT_PROFILE,
    image: 'sol-luna-auto-proxy/1',
  }),
  {
    name: 'openai/gpt-6-sol-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6-sol-pro' },
    status: 'current',
    ...CHAT,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  recordOf({
    model: 'gpt-6-luna',
    revision: '3',
    binding: 'none',
    profile: ENDPOINT_PROFILE,
    image: 'sol-luna-auto-proxy/1',
  }),
  {
    name: 'openai/gpt-6-luna-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-6-luna-pro' },
    status: 'current',
    ...CHAT,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'sol-luna-auto-proxy/1' },
  },
  recordOf({
    model: 'gpt-6.1-sol',
    revision: '3',
    binding: 'none',
    profile: GPT61_SOL_PROFILE,
    image: 'sol-luna-auto-proxy/1',
  }),
  recordOf({
    model: 'gpt-6.1-terra',
    revision: '3',
    binding: 'none',
    profile: GPT61_TERRA_PROFILE,
    image: 'sol-luna-auto-proxy/1',
  }),
  {
    name: 'openai/gpt-5.6-sol',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-sol' },
    status: 'current',
    ...CHAT,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'openai-usage/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  {
    name: 'openai/gpt-5.6-sol-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-sol-pro' },
    status: 'current',
    ...CHAT,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  recordOf({
    model: 'gpt-5.6-terra',
    revision: '3',
    binding: 'none',
    profile: ENDPOINT_PROFILE,
    image: 'gpt56-patch/1',
  }),
  {
    name: 'openai/gpt-5.6-terra-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-terra-pro' },
    status: 'current',
    ...CHAT,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  recordOf({
    model: 'gpt-5.6-luna',
    revision: '4',
    binding: 'none',
    profile: ENDPOINT_PROFILE,
    image: 'gpt56-patch/1',
    files: {
      evidence:
        'PDF in: probes/sample.pdf sent as input_file with plugins file-parser engine native, one request on 2026-11-21, answered its passphrase (probe p8 responses-luna; the same file as a chat file part, p8 chat-luna).',
    },
  }),
  {
    name: 'openai/gpt-5.6-luna-pro',
    revision: '1',
    route: { provider: OPENROUTER, model: 'openai/gpt-5.6-luna-pro' },
    status: 'current',
    ...CHAT,
    parameters: PARAMETERS,
    rules: { ...RULES, usage: 'unknown-scope/1' },
    meter: { ...METER, image: 'gpt56-patch/1' },
  },
  recordOf({
    model: 'gpt-6.2-astra',
    revision: '2',
    binding: 'prefix',
    profile: gpt62Profile('gpt-6.2-astra'),
    image: 'sol-luna-auto-proxy/1',
  }),
  recordOf({
    model: 'gpt-6.2-sol',
    revision: '2',
    binding: 'prefix',
    profile: gpt62Profile('gpt-6.2-sol'),
    image: 'sol-luna-auto-proxy/1',
  }),
] as const satisfies readonly OpenAiRecord[]
