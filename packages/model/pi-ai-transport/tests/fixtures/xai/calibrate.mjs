// Root-owned paid calibration harness. Dry-run makes no network request.
// Usage: node packages/model/pi-ai-transport/tests/fixtures/xai/calibrate.mjs --dry-run
// Execute requires explicit root-owned credential/ledger/snapshot paths; never auto-retries.
import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  openProductionLedger,
  privateOutputDirectory,
} from '../../../../../../tools/model-probe/src/production-gate.mjs'
import { readCredential } from '../../../../../../tools/model-probe/src/network.mjs'
import { assertCalibrationWire, exactEndpoint, runPaidCase } from './paid-calibration.mjs'
import { createHash } from 'node:crypto'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import {
  invokeModel,
  openRouterCredentialRedactionConfig,
} from '@omne-harness-lite/model-request-runtime'
import {
  createPiAiTransport,
  createOfficialProfileContent,
} from '@omne-harness-lite/pi-ai-transport'
import { xaiDefinitions } from '../../../src/official-models/xai.ts'
import { createXaiCandidateInputMeter } from '../../../src/input-meters/xai-candidate.ts'

const at = '2026-09-28T00:00:00Z'
const visible = { toHuman: true, toModel: true }
const image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/yWQAAAAASUVORK5CYII='
const tool = {
  name: 'lookup__xai',
  description: 'Look up a value by key',
  parameters: {
    type: 'object',
    properties: { key: { type: 'string' } },
    required: ['key'],
    additionalProperties: false,
  },
}
const schedule = (ms, callback) => {
  const timer = setTimeout(callback, ms)
  return () => clearTimeout(timer)
}
const policy = {
  now: () => new Date().toISOString(),
  schedule,
  firstContentTimeoutMs: 90000,
  idleContentTimeoutMs: 90000,
  statusCauseTable: {
    400: 'request_rejected',
    401: 'credential_unavailable',
    429: 'upstream_unavailable',
    503: 'upstream_unavailable',
  },
  credentialRedaction: openRouterCredentialRedactionConfig,
  diagnostic: () => {},
}
const networkPolicy = {
  maxConnections: 1,
  idleConnectionTimeoutMs: 1000,
  connectTimeoutMs: 10000,
  maxErrorBodyBytes: 4096,
  maxSseEventBytes: 262144,
  credentialRedaction: openRouterCredentialRedactionConfig,
}
function message(raw) {
  const judged = judgeMessage(raw)
  if ('rejected' in judged) throw new Error(`invalid calibration fixture: ${judged.rejected}`)
  return judged.ok
}
function textMessage(id, type, text) {
  return message({
    id,
    type,
    createdAt: at,
    blocks: [{ id: `${id}-text`, kind: 'text', text, visibility: visible }],
  })
}
function scenarioMessages(name) {
  if (name === 'fit-short')
    return [
      textMessage('sys-short', 'system', 'Answer briefly.'),
      textMessage('usr-short', 'user', 'Reply with one word: cedar.'),
    ]
  if (name === 'fit-multilingual')
    return [
      textMessage('sys-multi', 'system', '回答要简短。Keep exact punctuation.'),
      textMessage(
        'usr-multi',
        'user',
        '请把「夏天的星空」翻译为英文，然后写一个十字以内的中文理由。',
      ),
    ]
  if (name === 'holdout-tool-history')
    return [
      textMessage('sys-history', 'system', 'Preserve the supplied tool history.'),
      textMessage('usr-before', 'user', 'Find alpha, then summarize the value.'),
      message({
        id: 'asst-call',
        type: 'assistant',
        response: 'prior-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          { id: 'asst-reason', kind: 'thinking', text: 'Lookup alpha.', visibility: visible },
          {
            id: 'asst-tool',
            kind: 'tool_call',
            callId: 'call_xai_1',
            tool: tool.name,
            complete: true,
            arguments: { key: 'alpha' },
            visibility: visible,
          },
        ],
      }),
      message({
        id: 'tool-result',
        type: 'tool',
        callId: 'call_xai_1',
        createdAt: at,
        blocks: [
          {
            id: 'result',
            kind: 'tool_result',
            callId: 'call_xai_1',
            outcome: 'completed',
            visibility: visible,
            blocks: [{ id: 'result-text', kind: 'text', text: 'alpha=42', visibility: visible }],
          },
        ],
      }),
      textMessage('usr-after', 'user', 'What was alpha?'),
    ]
  if (name === 'holdout-image')
    return [
      textMessage('sys-image', 'system', 'Answer briefly.'),
      message({
        id: 'usr-image',
        type: 'user',
        createdAt: at,
        blocks: [
          {
            id: 'usr-image-text',
            kind: 'text',
            text: 'Describe the attached image in one word.',
            visibility: visible,
          },
          {
            id: 'usr-image-data',
            kind: 'image',
            mediaType: 'image/png',
            data: { inline: image },
            visibility: visible,
          },
        ],
      }),
    ]
  throw new Error(`unknown scenario ${name}`)
}
const names = ['fit-short', 'fit-multilingual', 'holdout-tool-history', 'holdout-image']
function input(definition, name) {
  const profile = createOfficialProfileContent(definition, {
    providers: ['xai'],
    allowFallback: false,
    configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('xai-calibration-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider: 'xai',
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: at,
    },
    parameters: {
      maxOutputTokens: 128,
      ...(name === 'holdout-tool-history' ? { reasoningEffort: 'high' } : {}),
    },
    messages: scenarioMessages(name),
    tools: name === 'holdout-tool-history' ? [tool] : [],
  }
}
function record(definition, name, planned) {
  const evidence = planned.inputLimitEvidence
  return {
    modelId: definition.modelId,
    scenario: name,
    partition: name.startsWith('fit-') ? 'fit' : 'holdout',
    candidateRevision: evidence.meterRevision,
    estimatedTokens: evidence.inputTokens.kind === 'estimated' ? evidence.inputTokens.tokens : null,
    admissionTokens: evidence.admissionTokens,
    requestBytes: evidence.requestBytes,
    images: evidence.images,
    wireSha256: createHash('sha256').update(planned.serialized).digest('hex'),
  }
}
const args = process.argv.slice(2)
const execute = args.includes('--execute')
if (execute === args.includes('--dry-run'))
  throw new Error('choose exactly one of --dry-run or --execute')
function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0 && fallback !== undefined) return fallback
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--'))
    throw new Error(`required: ${name} <value>`)
  return args[index + 1]
}
const output = option('--out')
let ledger
let key
let snapshot
let snapshotSha256
const maxAgeMs = Number(option('--max-snapshot-age-ms', '86400000'))
if (execute) {
  const source = readFileSync(option('--snapshot'), 'utf8')
  snapshot = JSON.parse(source)
  snapshotSha256 = createHash('sha256').update(source).digest('hex')
  // Validate both fixed endpoints before obtaining the ledger or loading a credential.
  for (const definition of xaiDefinitions) exactEndpoint(snapshot, definition.modelId, maxAgeMs)
  const ledgerPath = option('--ledger')
  const approved = option('--approved-ledger')
  const stored = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  await privateOutputDirectory(dirname(output))
  key = await readCredential(option('--credential-file'))
  ledger = await openProductionLedger(ledgerPath, approved, {
    limitUsd: stored.limitUsd,
    researchLimitUsd: stored.researchLimitUsd,
  })
}
let journal
let completed = 0
function append(row) {
  // Identity and independent usage/fees are structured; redact possible upstream
  // request/provider echoes before serialization. Never retain raw error messages.
  if (key)
    for (const field of ['upstreamRequestId', 'servingProvider'])
      if (typeof row[field] === 'string') row[field] = row[field].replaceAll(key, '[REDACTED]')
  writeSync(journal, `${writeJsonLossless(row)}\n`)
  fsyncSync(journal)
}
try {
  journal = openSync(output, 'wx', 0o600)
  for (const definition of xaiDefinitions) {
    const meter = createXaiCandidateInputMeter(definition)
    const transport = createPiAiTransport({
      definitions: [definition],
      inputMeters: [meter],
      policy: networkPolicy,
    })
    try {
      for (const name of names) {
        const request = input(definition, name)
        const planned = transport.plan(request)
        if ('rejected' in planned) throw new Error('Fixed calibration plan refused')
        assertCalibrationWire(planned.planned.body)
        const identity = {
          ...record(definition, name, planned.planned),
          ...(execute ? { snapshotSha256 } : {}),
        }
        if (execute) {
          const endpoint = exactEndpoint(snapshot, definition.modelId, maxAgeMs)
          await runPaidCase({
            ledger,
            model: definition.modelId,
            endpoint,
            outputTokens: request.parameters.maxOutputTokens,
            identity,
            body: planned.planned.body,
            append,
            invoke: async () => {
              const invocation = invokeModel({
                ...request,
                transport,
                credential: key,
                signal: new AbortController().signal,
                policy,
              })
              // outcome resolves after invocation's finally/stream stop; transport
              // owner is drained below even when settlement or the oracle fails.
              return await invocation.outcome
            },
          })
        } else append({ stage: 'dry_plan', ...identity })
        completed++
      }
    } finally {
      await transport.close()
    }
  }
} catch {
  // Do not print arbitrary upstream/runtime exceptions or credential paths.
  process.stderr.write(
    'Calibration stopped; inspect private evidence and original ledger. No retry.\n',
  )
  process.exitCode = 1
} finally {
  if (journal !== undefined) closeSync(journal)
  if (ledger) await ledger.close()
}
console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', cases: completed, output }))
