import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ParameterTable } from '@omne-harness/pi-ai-transport/chat-completions'
import { O200K_PROXY_TOKENIZER } from '@omne-harness/pi-ai-transport/family-kit'
import type { ImageTokenRule } from '@omne-harness/pi-ai-transport/family-kit'
import type { GlmRecord } from './record.ts'


type Route = Readonly<{
  model: string
  upstream: string
  reports: string
  window: string
  image?: ImageTokenRule
  explicitToolNone: boolean
}>

type Effort = 'low' | 'medium' | 'high' | 'max'
const unsupported = { support: 'unsupported' } as const
const absent = { kind: 'absent' } as const

const MAX_OUTPUT = '131072'
const effort = (value: Effort) => ({ field: 'reasoning.effort', value }) as const
const PARAMETERS: ParameterTable = {
  temperature: unsupported,
  'top-p': unsupported,
  stop: unsupported,
  seed: unsupported,
  'frequency-penalty': unsupported,
  'presence-penalty': unsupported,
  'max-output-tokens': {
    support: 'supported',
    default: absent,
    accept: { max: MAX_OUTPUT },
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

function provenanceFor(route: Route): RecordProvenance {
  const evidence = 'packages/model/pi-ai-glm/tests/fixtures/observations/' + route.model + '.json'
  const fact = (note: string) => ({ measuredAt: '2026-11-23', evidence, note })
  return {
    engine: fact(
      'The pinned Chat Completions stream returned read_ticket. The following response contained the value supplied only by that tool.',
    ),
    efforts: fact(
      'See the individual effort and sampling exchanges. No effective effort is inferred from HTTP acceptance.',
    ),
    'reasoning-off': fact(
      'The reasoning-off sample sends reasoning.enabled=false. An explicit reasoning-effort of none is unsupported by the adapter.',
    ),
    'forced-tool-choice': fact(
      'Required and named tool choices were rejected on this route. With tools present, an explicit none ' +
        (route.explicitToolNone ? 'completed without a call.' : 'was rejected.') +
        ' The auto fixture returned read_ticket with A17.',
    ),
    'ends-with-assistant': fact(
      'The assistant-last probe ends with a partial assistant message. See its observed finish and usage.',
    ),
    'replay-shape': fact(
      'Plain and tool streams include indexed reasoning.text; the wire and detail formats are retained per sample.',
    ),
    'replay-binding': fact(
      'Retained, altered, omitted and changed-prefix probes are independent. Internal upstream reuse is unknown.',
    ),
    cache: fact(
      'cache-1 through cache-3 append to one prefix. Only reported read and write amounts count.',
    ),
    'system-placement': fact(
      'The tool sample used a separate system message and an object-root function.',
    ),
    'usage-fields': fact(
      'Stream receipts give prompt, completion, cache and billed cost. Cold calibration covers the single tool and 17 released tool schemas using the family representation and o200k proxy.',
    ),
  }
}

function limit(amount: string) {
  return { provided: amount, upstream: { kind: 'finite' as const, amount } }
}

function record(route: Route): GlmRecord {
  const name = 'z-ai/' + route.model
  const format = route.model + '-reasoning-text/1'
  return {
    name,
    revision: '1',
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
    parameters: PARAMETERS,
    extensions: [],
    replay: { declaration: {}, formats: { produces: format, accepts: [format] } },
    accepts: { forcedToolChoice: false, namedToolChoice: false },
    profile: {
      input: route.image ? ['text', 'image'] : ['text'],
      output: ['text'],
      context: { window: limit(route.window), input: null, output: limit(MAX_OUTPUT) },
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
      reasoning: 'glm-reasoning-text/1',
      usage: 'glm-usage/1',
      toolSchema: 'object-root/1',
      check: route.explicitToolNone ? 'none/1' : 'no-explicit-tool-none/1',
    },
    meter: {
      representation: 'glm-visible-json/1',
      text: 'o200k-proxy/1',
      tokenizer: O200K_PROXY_TOKENIZER,
      // The largest observed cold residual on each route was the 17-tool case.
      coldRequestTokens: '427',
      ...(route.image ? { image: route.image } : {}),
    },
    provenance: provenanceFor(route),
  }
}

// Deltas against an otherwise identical text request across six measured sizes.
const GLM_IMAGE_TOKENS = { tilePixels: '28', tokensPerTile: '1', overheadTokens: '2' } as const

const ZAI = { upstream: 'z-ai/fp8', reports: 'Z.AI', explicitToolNone: false, window: '1048576' }

export const GLM_RECORDS = [
  record({ ...ZAI, model: 'glm-5.1', window: '202752' }),
  record({ ...ZAI, model: 'glm-5.2' }),
  record({ ...ZAI, model: 'glm-5.3' }),
  record({ ...ZAI, model: 'glm-5.3-flash', image: GLM_IMAGE_TOKENS }),
  record({ ...ZAI, model: 'glm-5.3-flashx', image: GLM_IMAGE_TOKENS }),
  record({ ...ZAI, model: 'glm-5.3-flashx-legal', image: GLM_IMAGE_TOKENS }),
  record({
    model: 'glm-5.3-prime',
    upstream: 'alibaba',
    reports: 'Alibaba',
    explicitToolNone: true,
    window: '1000000',
  }),
] as const
