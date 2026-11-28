import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ParameterTable } from '@omne-harness/pi-ai-transport/chat-completions'
import { O200K_PROXY_TOKENIZER } from '@omne-harness/pi-ai-transport/family-kit'
import type { KimiRecord } from './record.ts'

/** The payload of a reasoning state: one `reasoning.text` detail as the gateway wrote it. */
export const KIMI_REASONING_FORMAT = 'kimi-reasoning-text-v1'

function parameters(maxOutput: string): ParameterTable {
  return {
    temperature: { support: 'unsupported' },
    'top-p': { support: 'unsupported' },
    'max-output-tokens': {
      support: 'supported',
      default: { kind: 'absent' },
      accept: { max: maxOutput },
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
  }
}

type Route = Readonly<{
  model: string
  tag: string
  window: string
  maxOutput: string
  required: boolean
  named: boolean
  reasoningOff: string
}>

function record(route: Route): KimiRecord {
  const name = 'moonshotai/' + route.model
  const evidence = 'packages/model/pi-ai-kimi/tests/fixtures/observations/' + route.model + '.json'
  const fact = (note: string) => ({ measuredAt: '2026-11-23', evidence, note })
  const provenance: RecordProvenance = {
    engine: fact(
      'The pinned Chat Completions route answered a text prompt, identified the synthetic image, emitted read_ticket, and answered with the value supplied in its tool result.',
    ),
    efforts: fact(
      'The low, medium, high and max requests each returned a completion and reported usage. This verifies acceptance of the fields, not distinct upstream effort levels.',
    ),
    'reasoning-off': fact(route.reasoningOff),
    'forced-tool-choice': fact(
      'The tool-required and tool-named exchanges were measured separately. The tool exchange used ordinary automatic selection.',
    ),
    'ends-with-assistant': fact(
      'See the independent assistant-last input probe and its outcome where measured.',
    ),
    'replay-shape': fact(
      'The default SSE response carried indexed reasoning.text details. The tool-result request returned the complete detail plus the original call ID.',
    ),
    'replay-binding': fact(
      'Changing the system prefix and resending the detail allowed a reply. Upstream consumption of each detail is unobservable on this interface.',
    ),
    cache: fact(
      'The cache-1 prompt was extended twice. Both continuations reported 3584 cached input tokens.',
    ),
    'system-placement': fact(
      'The initial system instructions and user message produced a tool call. Neither an explicit cache control block nor a provider-specific credential was required.',
    ),
    'usage-fields': fact(
      'The terminal stream reports prompt_tokens, completion_tokens, cost, cached_tokens, cache_write_tokens, and reasoning_tokens.' +
        (route.model === 'kimi-k2.7-code'
          ? ''
          : ' Cold input calibration compared the visible o200k representation with each recorded prompt: the largest non-reasoning residual was 115 tokens on this route’s tool-required input. This sample-bound allowance is omitted after an actual-usage prefix anchor hit.'),
    ),
  }
  const limit = (amount: string) => ({
    provided: amount,
    upstream: { kind: 'finite' as const, amount },
  })
  return {
    name,
    revision: route.model === 'kimi-k2.7-code' ? '1' : '2',
    status: 'current',
    route: { provider: 'openrouter', model: name },
    serving: { order: [route.tag], reports: ['Moonshot AI'] },
    wire: {
      roles: { instruction: 'system', reminder: 'user' },
      content: 'compact',
      cache: { kind: 'none' },
      image: { mediaTypes: ['image/png'], detail: 'auto' },
      fixed: [],
      usageTail: { maxFrames: 2 },
      toolNames: { rule: 'underscore/1', maxLength: 64 },
    },
    parameters: parameters(route.maxOutput),
    extensions: [],
    replay: {
      declaration: {},
      formats: { produces: KIMI_REASONING_FORMAT, accepts: [KIMI_REASONING_FORMAT] },
    },
    accepts: { forcedToolChoice: route.required, namedToolChoice: route.named },
    profile: {
      input: ['text', 'image'],
      output: ['text'],
      context: { window: limit(route.window), input: null, output: limit(route.maxOutput) },
      limits: [{ metric: 'image-bytes', provided: '4194304', upstream: { kind: 'unknown' } }],
      evidence:
        'Limits from the fixed endpoint directory. The PNG transport and image-token estimate were sampled independently at five image sizes. The 4 MiB limit is imposed by the adapter.',
    },
    rules: {
      reasoning: 'kimi-reasoning-text/1',
      usage: 'kimi-usage/1',
      toolSchema: 'object-root/1',
      check: 'none/1',
    },
    meter: {
      representation: 'kimi-visible-json/1',
      text: 'o200k-proxy/1',
      ...(route.model === 'kimi-k2.7-code' ? {} : { coldRequestTokens: '115' }),
      tokenizer: O200K_PROXY_TOKENIZER,
    },
    provenance,
  }
}

export const KIMI_RECORDS: readonly [KimiRecord, KimiRecord, KimiRecord] = [
  record({
    model: 'kimi-k3.1-pro',
    tag: 'moonshotai/mxfp4',
    window: '1048576',
    maxOutput: '943718',
    required: true,
    named: false,
    reasoningOff:
      'With reasoning.enabled=false the gateway returned 200 and reported zero reasoning tokens.',
  }),
  record({
    model: 'kimi-k3',
    tag: 'moonshotai',
    window: '1048576',
    maxOutput: '943718',
    required: true,
    named: true,
    reasoningOff:
      'With reasoning.enabled=false the gateway returned 200 and reported zero reasoning tokens.',
  }),
  record({
    model: 'kimi-k2.7-code',
    tag: 'moonshotai',
    window: '262144',
    maxOutput: '235929',
    required: false,
    named: false,
    reasoningOff:
      'The gateway rejected reasoning.enabled=false with HTTP 400, indicating reasoning is mandatory.',
  }),
]
