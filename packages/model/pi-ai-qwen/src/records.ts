import type { RecordFact, RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ParameterTable } from '@omne-harness/pi-ai-transport/chat-completions'
import type { QwenRecord } from './record.ts'

const O200K_RANKS_DIGEST = '6cf16f9e2292763021bb70ffed8e113a55f8d26f34110514c2518f47db1ea806'
const NO_SPECIAL_TOKENS_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
const JS_TIKTOKEN_INTEGRITY =
  'sha512-biOj/6M5qdgx5TKjDnFT1ymSpM5tbd3ylwDtrQvFQSu0Z7bBYko2dF+W/aUkXUPuk6IVpRxk/3Q2sHOzGlS36g=='

/** The o200k proxy that the OpenAI family adopts; the release registers it once for both families. */
const QWEN_TOKENIZER = {
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

/** The payload of a reasoning state: one `reasoning.text` detail as the gateway wrote it. */
export const QWEN_REASONING_FORMAT = 'qwen-reasoning-text-v1'

const PARAMETERS = {
  temperature: { support: 'unsupported' },
  'top-p': { support: 'unsupported' },
  'max-output-tokens': {
    support: 'supported',
    default: { kind: 'absent' },
    accept: { max: '131072' },
    wire: { field: 'max_tokens' },
  },
  stop: { support: 'unsupported' },
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

const PROFILE = {
  input: ['text', 'voice'],
  output: ['text'],
  context: {
    window: { provided: '1000000', upstream: { kind: 'finite', amount: '1000000' } },
    input: { provided: '983616', upstream: { kind: 'finite', amount: '983616' } },
    output: { provided: '131072', upstream: { kind: 'finite', amount: '131072' } },
  },
  limits: [
    { metric: 'voice-bytes', provided: '10485760', upstream: { kind: 'unknown' } },
    { metric: 'voice-duration-ms', provided: '300000', upstream: { kind: 'unknown' } },
  ],
  evidence:
    'OpenRouter endpoint metadata observed 2026-11-21 for qwen/qwen3.8-omni-flash on the Alibaba endpoint: a 1000000-token context, a 983616-token max prompt and a 131072-token max completion. Voice in: one WAV clip sent as input_audio was transcribed (probe p5-qwen, 2026-11-21). The 10485760-byte and 300000-ms voice limits are the offering of this project; no upstream per-clip limit is established. Image input is listed but was not measured, so it is not declared.',
} as const

const MEASURED = '2026-11-21'

const NOTES: Readonly<Record<RecordFact, string>> = {
  engine:
    'the generic chat-completions interface; no dedicated interface serves Qwen. 23 requests pinned to Alibaba (probe qwen-facts) answered text, tool calls and reasoning on it',
  efforts:
    'one request per effort (qwen-facts effort-none to effort-max): none, minimal, low, medium, high, xhigh and max answered 200; without an effort the model reasons (qwen-facts default, 18 reasoning tokens); no record maps effort none, by the project convention',
  'reasoning-off':
    'reasoning disabled, one request (qwen-facts reasoning-off): accepted, answered without reasoning details; the project convention keeps reasoning on',
  'forced-tool-choice':
    'tool_choice required, one request (qwen-facts tool-forced): 400 "The tool_choice parameter does not support being set to required or object in thinking mode"; a named function answered 200 but the model did not call it (probe p7 named-thinking), so neither counts as accepted',
  'ends-with-assistant':
    'a request ending with an assistant message, one request (qwen-facts ends-with-assistant): accepted',
  'replay-shape':
    'reasoning_details items {type reasoning.text, text, format unknown, index} (qwen-facts default); carried back as they came, one request (qwen-facts replay-2): 200 with input_transformations null',
  'replay-binding':
    'chat-completions reports no dropped reasoning; the reasoning carried back in qwen-facts replay-2 was accepted and counted as input, so no binding is declared',
  cache:
    'implicit: the same 5009-token prefix read 3584 tokens from the cache on the second request (probes p5-qwen cache-1/2 and p6q implicit-1/2); a 1443-token prefix read nothing (qwen-facts cache-1 to cache-3); the wire writes no breakpoint',
  'system-placement':
    'a system message before the first turn (qwen-facts cache-1 to cache-3) and a system or a developer message after it (probe p7 reminder-system, reminder-developer) answered 200; the role of Qwen is system',
  'usage-fields':
    'usage.prompt_tokens, completion_tokens, prompt_tokens_details.cached_tokens and cache_write_tokens, completion_tokens_details.reasoning_tokens and cost (qwen-facts default); in a stream the usage is in the last of 10 frames and the last two carry finish_reason stop (probe p7 stream)',
}

// Every fact cites the real stream of this record; the note names the probe that showed it.
function provenanceOf(name: string, revision: string): RecordProvenance {
  const evidence = `packages/model/pi-ai-qwen/tests/fixtures/records/${encodeURIComponent(name)}/${revision}/stream.sse`
  const fact = (key: RecordFact) => ({ measuredAt: MEASURED, evidence, note: NOTES[key] })
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

const NAME = 'qwen/qwen3.8-omni-flash'

export const QWEN_RECORDS = [
  {
    name: NAME,
    revision: '1',
    route: { provider: 'openrouter', model: NAME },
    status: 'current',
    serving: { order: ['alibaba'], reports: ['Alibaba'] },
    wire: {
      roles: { instruction: 'system', reminder: 'system' },
      content: 'compact',
      cache: { kind: 'none' },
      image: null,
      voice: { formats: { 'audio/wav': 'wav' } },
      fixed: [],
      usageTail: { maxFrames: 2 },
      toolNames: { rule: 'underscore/1', maxLength: 64 },
    },
    parameters: PARAMETERS,
    extensions: [],
    replay: {
      declaration: {},
      formats: { produces: QWEN_REASONING_FORMAT, accepts: [QWEN_REASONING_FORMAT] },
    },
    accepts: { forcedToolChoice: false },
    profile: PROFILE,
    rules: {
      reasoning: 'qwen-reasoning-text/1',
      usage: 'qwen-usage/1',
      toolSchema: 'object-root/1',
      check: 'none/1',
    },
    meter: {
      representation: 'qwen-visible-json/1',
      text: 'o200k-proxy/1',
      tokenizer: QWEN_TOKENIZER,
    },
    provenance: provenanceOf(NAME, '1'),
  },
] as const satisfies readonly QwenRecord[]
