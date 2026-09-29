// Root-only one-effect production invoke probe for the frozen Qwen Max planner wire.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { open, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { jsonNumberSource, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  invokeModel,
  openRouterCredentialRedactionConfig,
} from '@omne-harness-lite/model-request-runtime'
import {
  createOfficialProfileContent,
  createPiAiTransport,
  createQwenInputMeter,
  planRequest,
  qwenDefinitions,
} from '../../../../dist/index.js'
import {
  openProductionLedger,
  privateOutputDirectory,
  writePrivateEvidence,
} from '../../../../../../../tools/model-probe/src/production-gate.mjs'
import { readCredential } from '../../../../../../../tools/model-probe/src/network.mjs'
import { decimalCost, prepare } from './run.mjs'

const modelId = 'qwen/qwen3.8-max-0902'
const formalWire = new URL('./08-qwen3.8-max-0902-english-formal-plan.json', import.meta.url)
const formalSha256 = '05980a21733b774d261ec231e71a94671d9372f07051ce2ee473cf5120f56c26'
const at = '2026-09-28T00:00:00Z'
const now = () => new Date().toISOString()
const sha256 = source => createHash('sha256').update(source).digest('hex')

function inputAndDefinition() {
  const definition = qwenDefinitions.find(item => item.modelId === modelId)
  assert(definition)
  const cache =
    definition.routes.alibaba?.cache.mode === 'automatic'
      ? { mode: 'automatic' }
      : { mode: 'explicit', ttl: '5m', breakpoints: ['system'] }
  const profile = createOfficialProfileContent(definition, {
    providers: ['alibaba'],
    allowFallback: false,
    configuration: { revision: '1', values: { cache } },
  })
  assert('ok' in profile, 'Qwen profile unavailable')
  const judged = judgeMessage({
    id: 'hosted-max-english',
    type: 'user',
    createdAt: at,
    blocks: [
      {
        id: 'hosted-max-english-text',
        kind: 'text',
        text: 'Reply with the single word OK.',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  assert('ok' in judged, 'Qwen input message invalid')
  return {
    definition,
    input: {
      target: {
        kind: 'model_call',
        callId: unwrap(parseOpaqueIdentifier('qwen-formal-08', 'ModelCallId')),
        dispatch: 1,
      },
      routeName: modelId,
      provider: 'alibaba',
      parameters: { maxOutputTokens: 16 },
      tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
      tools: [],
      messages: [judged.ok],
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
    },
  }
}

export async function buildFormal() {
  const { input, definition } = inputAndDefinition()
  const meter = createQwenInputMeter(definition)
  const plan = await planRequest(input, [definition], meter, {
    signal: new AbortController().signal,
  })
  assert('planned' in plan, 'Qwen formal planner rejected input')
  const frozen = await readFile(formalWire)
  assert.equal(sha256(frozen), formalSha256)
  assert.equal(plan.planned.serialized, frozen.toString('utf8').trimEnd())
  assert.equal(sha256(plan.planned.serialized + '\n'), formalSha256)
  return { input, definition, meter, planned: plan.planned }
}

export async function dryFormal(snapshotPath) {
  const [original] = await prepare(snapshotPath)
  assert.equal(original.model, modelId)
  return { ...(await buildFormal()), estimateUsd: original.estimateUsd }
}

async function durable(output, name, data, credential) {
  let source = writeJsonLossless(data)
  if (credential) {
    source = source.replaceAll(JSON.stringify(credential).slice(1, -1), '[REDACTED]')
    source = source.replaceAll(credential, '[REDACTED]')
  }
  await writePrivateEvidence(join(output, name), `${source}\n`)
  const directory = await open(output, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

const invocationPolicy = {
  now,
  schedule: (ms, callback) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
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
const transportPolicy = {
  maxConnections: 1,
  idleConnectionTimeoutMs: 1000,
  connectTimeoutMs: 20000,
  maxErrorBodyBytes: 65536,
  maxSseEventBytes: 1048576,
  credentialRedaction: openRouterCredentialRedactionConfig,
}

export async function invokeFormal({
  prepared,
  output,
  ledger,
  credential,
  transportOptions = {},
}) {
  const { input, definition, meter, planned, estimateUsd } = prepared
  const transport = createPiAiTransport({
    ...transportOptions,
    definitions: [definition],
    inputMeters: [meter],
    policy: transportPolicy,
  })
  let reservation
  try {
    reservation = await ledger.reserve({
      model: modelId,
      provider: 'alibaba',
      stage: 'research',
      estimateUsd,
    })
    await durable(output, 'before.json', {
      reservation,
      modelId,
      plannedSha256: formalSha256,
      estimateUsd,
      startedAt: now(),
    })
    let attempts = 0
    let sentSerialized = ''
    let outcome
    let failed = false
    try {
      const audited = {
        plan: transport.plan,
        read: transport.read,
        send: (plan, key, signal) => {
          assert.equal(plan.serialized, planned.serialized)
          attempts++
          assert.equal(attempts, 1)
          sentSerialized = plan.serialized
          return transport.send(plan, key, signal)
        },
      }
      outcome = await invokeModel({
        ...input,
        transport: audited,
        credential,
        signal: AbortSignal.timeout(240000),
        policy: invocationPolicy,
      }).outcome
    } catch {
      failed = true
    }
    // The public invoke boundary yields domain facts, not a raw SSE body.
    await durable(
      output,
      'observed.json',
      {
        reservation,
        attempts,
        sentSha256: sentSerialized ? sha256(sentSerialized + '\n') : null,
        endedAt: now(),
        capture: { domainOutcome: outcome !== undefined, rawSseBody: false },
        ...(outcome === undefined ? { invocationFailed: failed } : { outcome }),
      },
      credential,
    )
    let actualUsd
    const cost = outcome?.cost?.cost_usd
    if (cost !== undefined && cost !== 'unknown')
      try {
        const source = typeof cost === 'string' ? cost : jsonNumberSource(cost)
        actualUsd = decimalCost(source)
      } catch {
        // Preserve unknown settlement rather than rounding or silently dropping a charge.
      }
    await ledger.settle(reservation, actualUsd)
    await durable(output, 'settled.json', { reservation, actualUsd: actualUsd ?? null })
    assert.equal(attempts, 1)
    assert.equal(sentSerialized, planned.serialized)
    assert.equal(outcome?.outcome, 'complete')
    assert.equal(outcome.usage?.source, 'upstream')
    assert(actualUsd !== undefined, 'Actual cost unknown; stop without replay')
    await durable(
      output,
      'pass.json',
      {
        reservation,
        plannedSha256: formalSha256,
        promptTokens: outcome.usage.input_tokens,
        servingProvider: outcome.servingProvider ?? null,
        actualUsd,
      },
      credential,
    )
    return outcome
  } finally {
    await transport.close()
  }
}

function options(args) {
  const [command, ...rest] = args
  if (!['dry', 'run'].includes(command) || rest.length % 2 !== 0)
    throw new Error('Choose dry or run with --option value pairs')
  const keys =
    command === 'dry'
      ? ['--snapshot']
      : [
          '--snapshot',
          '--credential-file',
          '--ledger',
          '--approved-ledger',
          '--output',
          '--limit-usd',
          '--research-limit-usd',
        ]
  const values = new Map()
  for (let index = 0; index < rest.length; index += 2) {
    if (!keys.includes(rest[index]) || values.has(rest[index]) || !rest[index + 1])
      throw new Error('Invalid, duplicate, or empty formal probe option')
    values.set(rest[index], rest[index + 1])
  }
  if (values.size !== keys.length) throw new Error(`Required options: ${keys.join(', ')}`)
  return { command, values }
}

async function main(args) {
  const { command, values } = options(args)
  const prepared = await dryFormal(values.get('--snapshot'))
  if (command === 'dry') {
    process.stdout.write(
      `${JSON.stringify({ mode: 'dry', requestCount: 1, plannedSha256: formalSha256, estimateUsd: prepared.estimateUsd })}\n`,
    )
    return
  }
  const output = await privateOutputDirectory(values.get('--output'))
  if ((await readdir(output)).length !== 0) throw new Error('Output directory must be empty')
  const ledger = await openProductionLedger(
    values.get('--ledger'),
    values.get('--approved-ledger'),
    {
      limitUsd: values.get('--limit-usd'),
      researchLimitUsd: values.get('--research-limit-usd'),
    },
  )
  try {
    const credential = await readCredential(values.get('--credential-file'))
    await invokeFormal({ prepared, output, ledger, credential })
    process.stdout.write(
      `${JSON.stringify({ mode: 'research-only', output, plannedSha256: formalSha256 })}\n`,
    )
  } finally {
    await ledger.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
