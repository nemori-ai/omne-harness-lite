import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ParameterTable } from '@omne-harness/pi-ai-transport/chat-completions'
import { O200K_PROXY_TOKENIZER } from '@omne-harness/pi-ai-transport/family-kit'
import type { ImageTokenRule } from '@omne-harness/pi-ai-transport/family-kit'
import type { DeepSeekRecord } from './record.ts'


type Route = Readonly<{
  model: string
  revision?: string
  toolSchema?: DeepSeekRecord['rules']['toolSchema']
  upstream: string
  reports: string
  window: string
  output: string
  cold: string
  image?: ImageTokenRule
  required: boolean
  named: boolean
  efforts: readonly Effort[]
}>

type Effort = 'low' | 'medium' | 'high' | 'max'
const unsupported = { support: 'unsupported' } as const
const absent = { kind: 'absent' } as const

function parameters(route: Route): ParameterTable {
  const effort = (value: Effort) =>
    route.efforts.includes(value)
      ? { field: 'reasoning.effort' as const, value }
      : ('unsupported' as const)
  return {
    temperature: unsupported,
    'top-p': unsupported,
    stop: unsupported,
    seed: unsupported,
    'frequency-penalty': unsupported,
    'presence-penalty': unsupported,
    'max-output-tokens': {
      support: 'supported',
      default: absent,
      accept: { max: route.output },
      wire: { field: 'max_tokens' },
    },
    'reasoning-effort': {
      support: 'supported',
      default: absent,
      accept: {},
      wire: {
        none: 'unsupported',
        low: effort('low'),
        medium: effort('medium'),
        high: effort('high'),
        max: effort('max'),
      },
    },
  }
}

function provenanceFor(route: Route): RecordProvenance {
  const evidence =
    'packages/model/pi-ai-deepseek/tests/fixtures/observations/' + route.model + '.json'
  const fact = (note: string) => ({ measuredAt: '2026-11-23', evidence, note })
  return {
    engine: fact(
      'The fixed endpoint answered a text prompt and returned a tool call. Its continuation answered with the value supplied only by the tool.' +
        (route.toolSchema === 'explicit-open-object-properties/1'
          ? ' In fileToolSchema, a bare object property produced an empty string. With empty properties and additionalProperties true, the same endpoint returned the requested nested object.'
          : ''),
    ),
    efforts: fact(
      'The effort probes record the requested field, outcome and reasoning tokens. The upstream does not report its effective effort. Sampling probes record acceptance only.',
    ),
    'reasoning-off': fact(
      'The reasoning.enabled=false probe returned zero reasoning tokens. The application independently rejects an explicit reasoning-effort of none.',
    ),
    'forced-tool-choice': fact(
      'Automatic, required and named choices have distinct samples. Only an emitted call with the requested function and arguments qualifies.',
    ),
    'ends-with-assistant': fact('The assistant-last sample ends with a partial assistant message.'),
    'replay-shape': fact(
      'Indexed reasoning.text details can be replayed where returned. The samples list actual detail formats and tool frames for this route.',
    ),
    'replay-binding': fact(
      'The replay probes retain, omit, alter, or change the prefix of a reasoning detail from the same fixed endpoint. The upstream does not report whether it reused the detail.',
    ),
    cache: fact(
      'Cache samples append to the same synthetic prefix. Each observation retains the reported read and write counts when present.',
    ),
    'system-placement': fact(
      'The tool prompt uses a system instruction, ordinary user input and one object-root function.',
    ),
    'usage-fields': fact(
      'Usage is read from the stream, including cache, reasoning and billed cost as reported. Cold prompt estimates are calibrated against sampled requests.',
    ),
  }
}

function limit(amount: string) {
  return { provided: amount, upstream: { kind: 'finite' as const, amount } }
}

function record(route: Route): DeepSeekRecord {
  const name = 'deepseek/' + route.model
  const format = route.model + '-reasoning-text/1'
  return {
    name,
    revision: route.revision ?? '1',
    status: 'current',
    route: { provider: 'openrouter', model: name },
    serving: { order: [route.upstream], reports: [route.reports] },
    wire: {
      roles: { instruction: 'system', reminder: 'user' },
      content: 'compact',
      cache: { kind: 'none' },
      image: route.image ? { mediaTypes: ['image/png'], detail: 'auto' } : null,
      fixed: [],
      usageTail: { maxFrames: 2 },
      toolNames: { rule: 'underscore/1', maxLength: 64 },
    },
    parameters: parameters(route),
    extensions: [],
    replay: { declaration: {}, formats: { produces: format, accepts: [format] } },
    accepts: { forcedToolChoice: route.required, namedToolChoice: route.named },
    profile: {
      input: route.image ? ['text', 'image'] : ['text'],
      output: ['text'],
      context: { window: limit(route.window), input: null, output: limit(route.output) },
      limits: route.image
        ? [{ metric: 'image-bytes', provided: '4194304', upstream: { kind: 'unknown' } }]
        : [],
      evidence:
        'Window and output capacity come from the pinned endpoint snapshot. ' +
        (route.image
          ? 'The adapter accepts PNGs up to 4 MiB. Image calibration uses measured prompt deltas for synthetic PNGs.'
          : 'The adapter declares text input.'),
    },
    rules: {
      reasoning: 'deepseek-reasoning-text/1',
      usage: 'deepseek-usage/1',
      toolSchema: route.toolSchema ?? 'object-root/1',
      check: 'none/1',
    },
    meter: {
      representation: 'deepseek-visible-json/1',
      text: 'o200k-proxy/1',
      tokenizer: O200K_PROXY_TOKENIZER,
      coldRequestTokens: route.cold,
      ...(route.image ? { image: route.image } : {}),
    },
    provenance: provenanceFor(route),
  }
}

export const DEEPSEEK_RECORDS = [
  record({
    model: 'deepseek-v4.1-flash-1017',
    upstream: 'deepinfra/fp8',
    reports: 'DeepInfra',
    window: '1048576',
    output: '393216',
    cold: '803',
    image: { tilePixels: '384', tokensPerTile: '66', overheadTokens: '118' },
    required: true,
    named: true,
    efforts: ['low', 'medium', 'high', 'max'],
  }),
  record({
    model: 'deepseek-v4.1-flash',
    upstream: 'deepinfra/fp8',
    reports: 'DeepInfra',
    window: '1048576',
    output: '393216',
    cold: '803',
    image: { tilePixels: '384', tokensPerTile: '66', overheadTokens: '118' },
    required: true,
    named: true,
    efforts: ['low', 'medium', 'high', 'max'],
  }),
  record({
    model: 'deepseek-v4-flash-vision-exp',
    upstream: 'deepinfra/fp8',
    reports: 'DeepInfra',
    window: '1048576',
    output: '262144',
    cold: '866',
    image: { tilePixels: '512', tokensPerTile: '78', overheadTokens: '39' },
    required: true,
    named: true,
    efforts: ['low', 'medium', 'high', 'max'],
  }),
  record({
    model: 'deepseek-v4-pro-0813',
    upstream: 'deepinfra/fp8',
    reports: 'DeepInfra',
    window: '1048576',
    output: '393216',
    cold: '788',
    required: false,
    named: false,
    efforts: ['low', 'medium', 'high', 'max'],
  }),
  record({
    model: 'deepseek-v4-flash-0731',
    upstream: 'siliconflow/fp8',
    reports: 'SiliconFlow',
    window: '1048576',
    output: '393216',
    cold: '934',
    required: false,
    named: false,
    efforts: ['low', 'medium', 'high', 'max'],
  }),
  record({
    model: 'deepseek-v4-pro',
    upstream: 'deepinfra/fp8',
    reports: 'DeepInfra',
    window: '1048576',
    output: '393216',
    cold: '788',
    required: false,
    named: false,
    efforts: ['low', 'medium', 'high', 'max'],
  }),
  record({
    model: 'deepseek-v4-flash',
    upstream: 'deepinfra/fp8',
    reports: 'DeepInfra',
    window: '1048576',
    output: '393216',
    cold: '787',
    required: true,
    named: true,
    efforts: ['low', 'medium', 'high', 'max'],
  }),
  record({
    model: 'deepseek-v3.2',
    upstream: 'deepinfra/fp4',
    reports: 'DeepInfra',
    window: '163840',
    output: '147456',
    cold: '812',
    required: true,
    named: true,
    efforts: ['low', 'medium', 'high', 'max'],
  }),
  record({
    model: 'deepseek-v3.2-exp',
    revision: '2',
    toolSchema: 'explicit-open-object-properties/1',
    upstream: 'siliconflow/fp8',
    reports: 'SiliconFlow',
    window: '163840',
    output: '147456',
    cold: '880',
    required: true,
    named: true,
    efforts: ['low', 'medium', 'high', 'max'],
  }),
] as const
