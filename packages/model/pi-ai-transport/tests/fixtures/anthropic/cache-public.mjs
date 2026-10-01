import assert from 'node:assert/strict'
import { readFile, realpath, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import {
  writeJsonLossless,
  readJsonStrict,
  isNonNegativeJsonInteger,
} from '@omne-harness-lite/content-blocks'
import {
  invokeModel,
  openRouterCredentialRedactionConfig,
  createCredentialRedactionPolicy,
} from '@omne-harness-lite/model-request-runtime'
import { createPiAiTransport, createAnthropicInputMeter, planRequest } from '../../../dist/index.js'
import {
  openProductionLedger,
  privateOutputDirectory,
  writePrivateEvidence,
} from '../../../../../../tools/model-probe/src/production-gate.mjs'
import { readCredential } from '../../../../../../tools/model-probe/src/network.mjs'
import { cacheInput } from './cache-input.mjs'
import { makeManifest } from './cache-manifest.mjs'
import { decimalUsd, exactEndpoint, wholeContextReservation } from './cache-budget.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const parse = source => {
  const value = readJsonStrict(source)
  if (!('ok' in value)) throw new Error('Invalid evidence JSON')
  return value.ok
}
const count = value => {
  assert(isNonNegativeJsonInteger(value))
  const source = decimalUsd(value)
  const n = Number(source)
  assert(Number.isSafeInteger(n) && n >= 0)
  return n
}
const save = (path, value) => writePrivateEvidence(path, writeJsonLossless(value) + '\n')
export async function dryPlan(manifest) {
  const { input, definition } = cacheInput(manifest)
  assert.equal(manifest.path, 'public')
  assert.equal(manifest.implementationRevision, definition.implementation.revision)
  const meter = createAnthropicInputMeter(definition)
  assert.equal(manifest.algorithmRevision, meter.algorithmRevision)
  assert.equal(manifest.provider, 'anthropic')
  assert.equal(manifest.allowFallback, false)
  assert.equal(manifest.configuration.cache.ttl, '1h')
  const result = await planRequest(input, [definition], meter, {
    signal: new AbortController().signal,
  })
  assert('planned' in result, writeJsonLossless(result))
  return { input, definition, planned: result.planned }
}
function cachePass(phase, result, provider) {
  assert.equal(result.outcome, 'complete')
  assert.equal(result.servingProvider, provider)
  assert.equal(result.usage.source, 'upstream')
  const read = count(result.usage.cache_read_tokens),
    write = count(result.usage.cache_write_tokens)
  if (phase === 'read') assert(read > 0, 'No actual cache read')
  else {
    assert.equal(read, 0, 'Unexpected cache read')
    assert(write > 0, 'No actual cache write')
  }
}
export function validatePrevious({
  phase,
  manifest,
  before,
  observed,
  settled,
  ledger,
  identity,
  now,
  provider,
}) {
  const previous = phase === 'read' ? 'write' : 'read'
  assert.equal(before.phase, previous)
  for (const key of Object.keys(identity))
    assert.equal(before[key], identity[key], `Changed ${key}`)
  assert.equal(observed.reservation, before.reservation)
  assert.equal(settled.reservation, before.reservation)
  assert.equal(observed.attempts, 1)
  assert.equal(observed.sentSerialized, identity.plannedSerialized)
  cachePass(previous, observed.result, provider)
  const actualUsd = decimalUsd(observed.result.cost.cost_usd)
  assert.equal(settled.actualUsd, actualUsd)
  const entry = ledger.entries.find(entry => entry.id === before.reservation)
  assert(entry && entry.state === 'settled')
  assert.equal(entry.actualUsd, actualUsd)
  assert.equal(entry.estimateUsd, before.estimateUsd)
  assert.equal(entry.model, manifest.model)
  assert.equal(entry.provider, 'anthropic')
  assert.equal(entry.stage, 'acceptance')
  const elapsed = now - Date.parse(observed.endedAt)
  assert(Number.isFinite(elapsed) && elapsed >= 0)
  if (phase === 'read') assert(elapsed <= 300000, 'Read window exceeded; do not repeat write')
  else {
    const wait = 3900000
    assert(
      elapsed >= wait,
      `Expiry not due until ${new Date(Date.parse(observed.endedAt) + wait).toISOString()}`,
    )
  }
}

// One public invocation; outcome and arrival data are runtime-redacted domain values,
// never handles. Exception text passes through the same source-based credential policy.
export async function invokePhase({
  manifest,
  phase,
  output,
  ledger,
  endpoint,
  identity,
  credential,
  transportOptions = {},
  now = () => new Date().toISOString(),
}) {
  assert(['write', 'read', 'expiry'].includes(phase))
  const { input, definition, planned } = await dryPlan(manifest)
  const estimateUsd = wholeContextReservation(endpoint, manifest.parameters.maxOutputTokens)
  const bound = createCredentialRedactionPolicy(openRouterCredentialRedactionConfig).bind(
    credential,
  )
  assert('ok' in bound)
  const errorText = error => {
    const value = bound.ok.text(String(error?.stack ?? error))
    if (!('ok' in value)) throw new Error('Error redaction failed')
    return value.ok
  }
  const policy = {
    now,
    schedule: (ms, fn) => {
      const timer = setTimeout(fn, ms)
      return () => clearTimeout(timer)
    },
    firstContentTimeoutMs: 120000,
    idleContentTimeoutMs: 120000,
    statusCauseTable: {
      400: 'request_rejected',
      401: 'credential_unavailable',
      429: 'upstream_unavailable',
      503: 'upstream_unavailable',
    },
    credentialRedaction: openRouterCredentialRedactionConfig,
    diagnostic: () => {},
  }
  const transport = createPiAiTransport({
    policy: {
      maxConnections: 1,
      idleConnectionTimeoutMs: 1000,
      connectTimeoutMs: 20000,
      maxErrorBodyBytes: 65536,
      maxSseEventBytes: 1048576,
      credentialRedaction: openRouterCredentialRedactionConfig,
    },
    ...transportOptions,
    definitions: [definition],
    inputMeters: [createAnthropicInputMeter(definition)],
  })
  // Exclusive marker means a killed/failed phase is never silently replayed.
  try {
    await save(join(output, `${phase}-claimed.json`), { phase, ...identity, startedAt: now() })
    const reservation = await ledger.reserve({
      model: manifest.model,
      provider: 'anthropic',
      stage: 'acceptance',
      estimateUsd,
    })
    await save(join(output, `${phase}-before.json`), {
      phase,
      ...identity,
      reservation,
      estimateUsd,
    })
    let attempts = 0,
      sentSerialized = '',
      result,
      exception
    const events = []
    const startedAt = now()
    try {
      const audited = {
        plan: transport.plan,
        projectOutput: transport.projectOutput,
        read: transport.read,
        send: (plan, key, signal) => {
          assert.equal(plan.serialized, planned.serialized)
          attempts++
          assert.equal(attempts, 1)
          sentSerialized = plan.serialized
          return transport.send(plan, key, signal)
        },
      }
      result = await invokeModel({
        ...input,
        transport: audited,
        credential,
        signal: AbortSignal.timeout(240000),
        policy,
        onAccepted: event => events.push({ at: now(), event }),
      }).outcome
    } catch (error) {
      exception = errorText(error)
    }
    const endedAt = now()
    // Must complete before any interpretation/settlement/assertion, including failed outcomes.
    await save(join(output, `${phase}-observed.json`), {
      reservation,
      startedAt,
      endedAt,
      attempts,
      sentSerialized,
      events,
      capture: {
        domainOutcome: result !== undefined,
        rawSseBody: false,
        protocolFailureFrame: false,
      },
      ...(result !== undefined ? { result } : {}),
      ...(exception !== undefined ? { exception } : {}),
    })
    let actualUsd
    if (result?.cost?.cost_usd !== undefined && result.cost.cost_usd !== 'unknown')
      actualUsd = decimalUsd(result.cost.cost_usd)
    await ledger.settle(reservation, actualUsd)
    await save(join(output, `${phase}-settled.json`), { reservation, actualUsd })
    assert.equal(attempts, 1)
    assert.equal(sentSerialized, planned.serialized)
    cachePass(phase, result, endpoint.provider_name)
    const expiryWait = 3900000
    const summary = {
      phase,
      result: 'pass',
      actualUsd,
      ...(phase === 'read'
        ? { expiryEarliest: new Date(Date.parse(endedAt) + expiryWait).toISOString() }
        : {}),
    }
    await save(join(output, `${phase}-pass.json`), summary)
    return summary
  } finally {
    await transport.close()
  }
}

export async function sourceFingerprint() {
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
      if (entry.isDirectory()) await visit(path)
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) files.push(path)
    }
  }
  // Pin compiled production runtime, transport, and these execution helpers. A
  // frozen execution checkout stays alive through expiry while HUB moves forward.
  for (const relative of [
    '../../../dist/',
    '../../../../model-request-runtime/dist/',
    '../../../../../core/stream-assembly/dist/',
    '../../../../../core/content-blocks/dist/',
    '../../../../../core/call-accounts/dist/',
    './',
  ])
    await visit(new URL(relative, import.meta.url))
  const digester = createHash('sha256')
  for (const file of files.sort((a, b) => a.href.localeCompare(b.href))) {
    digester.update(file.pathname.split('/packages/')[1])
    digester.update(await readFile(file))
  }
  return digester.digest('hex')
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'prepare') {
    const [model, ttl, output] = args
    assert.equal(args.length, 3)
    const manifest = makeManifest(model, ttl)
    const { planned } = await dryPlan(manifest)
    const directory = await privateOutputDirectory(output)
    await save(join(directory, 'manifest.json'), manifest)
    await save(join(directory, 'plan.json'), {
      plannedSerialized: planned.serialized,
      inputLimitEvidence: planned.inputLimitEvidence,
    })
    console.log(
      writeJsonLossless({
        model,
        output: directory,
        wireSha256: hash(planned.serialized),
        inputLimitEvidence: planned.inputLimitEvidence,
      }),
    )
    return
  }
  assert.equal(
    command,
    'run',
    'Use prepare MODEL TTL OUTPUT or run --phase PHASE --output DIR --credential-file FILE --ledger FILE --approved-ledger FILE --snapshot FILE',
  )
  const flags = {}
  for (let i = 0; i < args.length; i += 2) {
    assert(args[i]?.startsWith('--') && args[i + 1])
    assert(!(args[i] in flags))
    flags[args[i]] = args[i + 1]
  }
  for (const key of ['phase', 'output', 'credential-file', 'ledger', 'approved-ledger', 'snapshot'])
    assert(flags[`--${key}`], `Missing ${key}`)
  assert.equal(Object.keys(flags).length, 6)
  const phase = flags['--phase']
  assert(['write', 'read', 'expiry'].includes(phase))
  const output = await privateOutputDirectory(flags['--output'])
  const manifestSource = await readFile(join(output, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestSource)
  const snapshotSource = await readFile(flags['--snapshot'], 'utf8')
  const snapshot = JSON.parse(snapshotSource)
  const endpoint = exactEndpoint(snapshot, manifest.model, 86400000)
  const { planned } = await dryPlan(manifest)
  const frozen = parse(await readFile(join(output, 'plan.json'), 'utf8'))
  assert.equal(frozen.plannedSerialized, planned.serialized)
  const credential = await readCredential(flags['--credential-file'])
  const identity = {
    sourceSha256: await sourceFingerprint(),
    manifestSha256: hash(manifestSource),
    snapshotSha256: hash(snapshotSource),
    plannedSerialized: planned.serialized,
    credentialFile: await realpath(flags['--credential-file']),
    credentialSha256: hash(credential),
  }
  const ledger = await openProductionLedger(flags['--ledger'], flags['--approved-ledger'], {
    limitUsd: '100',
    researchLimitUsd: '50',
  })
  try {
    if (phase !== 'write') {
      if (phase === 'expiry') {
        const write = async suffix =>
          parse(await readFile(join(output, `write-${suffix}.json`), 'utf8'))
        const readObserved = parse(await readFile(join(output, 'read-observed.json'), 'utf8'))
        validatePrevious({
          phase: 'read',
          manifest,
          before: await write('before'),
          observed: await write('observed'),
          settled: await write('settled'),
          ledger: ledger.snapshot(),
          identity,
          now: Date.parse(readObserved.startedAt),
          provider: endpoint.provider_name,
        })
      }
      const previous = phase === 'read' ? 'write' : 'read'
      const load = async suffix =>
        parse(await readFile(join(output, `${previous}-${suffix}.json`), 'utf8'))
      validatePrevious({
        phase,
        manifest,
        before: await load('before'),
        observed: await load('observed'),
        settled: await load('settled'),
        ledger: ledger.snapshot(),
        identity,
        now: Date.now(),
        provider: endpoint.provider_name,
      })
    }
    console.log(
      JSON.stringify(
        await invokePhase({ manifest, phase, output, ledger, endpoint, identity, credential }),
      ),
    )
  } finally {
    await ledger.close()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
