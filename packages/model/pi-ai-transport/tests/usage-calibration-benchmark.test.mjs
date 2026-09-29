// Offline public-artifact benchmark. No HTTP, credentials or log source.
import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { judgeMessage } from '@omne-harness-lite/messages'
import { Tiktoken } from 'js-tiktoken/lite'
import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  planRequest,
  projectInput,
} from '@omne-harness-lite/pi-ai-transport'

const measurements = []
function measure(name, operation) {
  const start = performance.now(),
    cpu = process.cpuUsage(),
    memory = process.memoryUsage()
  const result = operation()
  const elapsed = performance.now() - start,
    used = process.cpuUsage(cpu),
    after = process.memoryUsage()
  measurements.push({
    name,
    wallMs: elapsed,
    cpuUserMs: used.user / 1000,
    cpuSystemMs: used.system / 1000,
    heapBefore: memory.heapUsed,
    heapAfter: after.heapUsed,
    rssAfter: after.rss,
    maxRssKiB: process.resourceUsage().maxRSS,
  })
  return result
}
const definition = anthropicDefinitions[0]
const meter = measure('cold-tokenizer-initialization', () => createAnthropicInputMeter(definition))
const at = '2026-09-29T00:00:00Z'
function message(id, text) {
  const result = judgeMessage({
    type: 'user',
    id,
    createdAt: at,
    blocks: [
      { id: `${id}-text`, kind: 'text', text, visibility: { toHuman: true, toModel: true } },
    ],
  })
  if ('rejected' in result) throw Error(result.rejected)
  return result.ok
}
// Raised offline input budget solely to exercise 1M-token computation, not to
// claim the fixed route supports 1M input on top of its 128k output reserve.
const request = {
  calibration: { kind: 'none', reason: 'no_observation' },
  tokenMargin: { multiplier: 1, reserveTokens: 0 },
  target: { kind: 'model_call', callId: 'offline-benchmark', dispatch: 1 },
  routeName: definition.modelId,
  provider: 'anthropic',
  parameters: { maxOutputTokens: 128 },
  tools: [],
  messages: [message('history', 'history '.repeat(1_000_000))],
  snapshot: {
    ...definition.capabilities,
    maxInputTokens: 2_000_000,
    providers: ['anthropic'],
    allowFallback: false,
    updatedAt: at,
    adaptation: {
      implementation: definition.implementation,
      definition: { modelId: definition.modelId, revision: definition.revision },
      configuration: {
        revision: 'offline-benchmark',
        values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
      },
    },
  },
}
function plan(input) {
  const result = planRequest(input, [definition], meter)
  if (!('planned' in result)) throw Error(JSON.stringify(result))
  return result.planned
}
let previous
for (let i = 0; i < 3; i++)
  previous = measure(i === 0 ? 'cold-full-plan' : `warm-full-plan-${i}`, () => plan(request))
const tokens = Number(ExactDecimal.from(previous.measurement.predictedInput).toString())
if (tokens < 1_000_000 || tokens > 1_010_000) throw Error(`unexpected actual token count ${tokens}`)
measure('final-body-serialization-only', () => writeJsonLossless(previous.body))
measure('final-body-projection-hash-only', () => projectInput(previous.body, request, meter))
measure('full-meter-only', () =>
  meter.measureFull({ body: previous.body, serialized: previous.serialized }),
)
const originalEncode = Tiktoken.prototype.encode
let historyTokenizerCalls = 0,
  newTokenizerCalls = 0
Tiktoken.prototype.encode = function (text, ...args) {
  if (text.includes('history ')) historyTokenizerCalls++
  else newTokenizerCalls++
  return originalEncode.call(this, text, ...args)
}
const matchedRequests = []
try {
  let nextRequest = request
  for (let i = 1; i <= 3; i++) {
    nextRequest = {
      ...nextRequest,
      messages: [...nextRequest.messages, message(`new-${i}`, `new small input ${i}`)],
      calibration: {
        kind: 'observation',
        inputCalibration: {
          requestInput: previous.requestInput,
          observedInput: {
            kind: 'upstream_total',
            tokens: tokens + i * 20,
            provenance: {
              adapterRevision: 'openrouter-usage-reader/2',
              fieldPaths: ['usage.prompt_tokens'],
            },
          },
          outputGroup: {
            kind: 'known',
            projectionRevision: 'openrouter-input-projection/2',
            source: 'none',
            completeness: 'complete',
            usageRef: 'usage',
            blockDigests: [],
          },
        },
        usage: {
          input_tokens: 'unknown',
          cache_read_tokens: 'unknown',
          cache_write_tokens: 'unknown',
          output_tokens: 4,
          source: 'upstream',
        },
        outputBlocks: [],
        replaySelection: [],
      },
    }
    previous = measure(`marginal-plan-${i}`, () => plan(nextRequest))
    if (previous.measurement.mode !== 'marginal') throw Error('incremental plan fell back')
    matchedRequests.push({ input: nextRequest, wire: previous.serialized })
  }
} finally {
  Tiktoken.prototype.encode = originalEncode
}
if (historyTokenizerCalls !== 0 || newTokenizerCalls === 0)
  throw Error('stable history was retokenized or new content not counted')
// Compare full and marginal on byte-identical final requests, outside the spy
// interval, so the positive full controls cannot hide a marginal history call.
for (const [index, matched] of matchedRequests.entries()) {
  const full = measure(`matched-full-plan-${index + 1}`, () =>
    plan({ ...matched.input, calibration: { kind: 'none', reason: 'no_observation' } }),
  )
  if (full.serialized !== matched.wire) throw Error('comparison did not use identical final input')
}
const report = {
  node: process.version,
  model: definition.modelId,
  binding: definition.implementation,
  meterRevision: meter.algorithmRevision,
  tokenizerRevision: meter.tokenizerRevision,
  actualFullTokens: tokens,
  finalMessages: previous.body.messages.length,
  finalUtf8Bytes: Buffer.byteLength(previous.serialized),
  historyTokenizerCalls,
  newTokenizerCalls,
  measurements,
  limits: [
    'Synthetic observations, no upstream request',
    'Shared host; no exclusive CPU isolation; wall/CPU/memory observations are workload samples',
    'matched-full-plan-N uses byte-identical final wire and configuration to marginal-plan-N',
    'Offline raised admission budget; not route 1M-input support',
    'Full-plan times include final construction, ownership, serialization, projection/hash, meter and byte/image checks',
    'Serialization/projection/full-meter phases measured separately on retained identical final body, not additive profiler spans',
    'No-image workload: complete image gate runs but does not measure image decoder cost',
    'Two-plan consumer cost may be estimated as two corresponding plans; real runtime measurement is separate',
  ],
}
const json = JSON.stringify(report, null, 2) + '\n'
if (process.argv[2]) writeFileSync(process.argv[2], json)
else process.stdout.write(json)
