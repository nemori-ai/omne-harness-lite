import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createPiAiTransport } from '../../../packages/model/pi-ai-transport/dist/index.js'
import { openLedger } from '../../../tools/model-probe/src/budget.mjs'
import { privateOutputDirectory } from '../../../tools/model-probe/src/production-gate.mjs'
import {
  certificate,
  content,
  finish,
  fixture,
  sse,
} from '../../../packages/model/pi-ai-transport/tests/support.ts'
import {
  budget,
  definitionFor,
  meterFor,
  profileFor,
  providerName,
  publicInput,
  publicPaidCase,
  requiredRunnerSourcePaths,
  sha256,
  supportedModelIds,
  transportPolicy,
  validateScenario,
} from './paid-core.mjs'
import { servicePaidCase } from './service-core.mjs'

if (process.argv.length !== 6 || process.argv[2] !== '--model' || process.argv[4] !== '--case')
  throw new Error('usage: dry-run.mjs --model EXACT_MODEL_ID --case baseline|cache_cold_warm')
const modelId = process.argv[3]
const caseKind = process.argv[5]
assert.ok(supportedModelIds.includes(modelId), 'model outside exact allowlist')
assert.ok(['baseline', 'cache_cold_warm'].includes(caseKind), 'unsupported case')
const provider = modelId.split('/')[0]
assert.ok(provider === 'anthropic' || (provider === 'openai' && caseKind === 'baseline'))
const root = process.cwd()
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const taskDir = join(root, 'tmp/priority-certification')
const caseDir = join(taskDir, 'runner-v2/generated', modelId.split('/')[1], caseKind)
await mkdir(caseDir, { recursive: true, mode: 0o700 })
const sourcePaths = [
  `packages/model/pi-ai-transport/src/official-models/${provider}.ts`,
  `packages/model/pi-ai-transport/src/input-meters/${provider}.ts`,
  'packages/model/pi-ai-transport/src/calibration.ts',
  'packages/model/pi-ai-transport/src/transport.ts',
  'packages/model/model-request-runtime/src/invoke.ts',
  'packages/model/model-request-runtime/src/service-calibration.ts',
  'packages/model/model-request-runtime/src/service-calls.ts',
  'examples/model-invocation-minimal-demo/src/bootstrap.ts',
  'examples/model-invocation-minimal-demo/src/deployment.ts',
  'examples/model-invocation-minimal-demo/src/model-call-host.ts',
  'examples/model-invocation-minimal-demo/src/model-request-text.ts',
  ...requiredRunnerSourcePaths,
  'tmp/priority-certification/runner-v2/review.mjs',
  'tmp/priority-certification/runner-v2/catalog.mjs',
  'tmp/priority-certification/runner-v2/dry-run.mjs',
]
const longPrefix =
  'Store the codeword CEDAR. Reference data: ' +
  Array.from({ length: 2_048 }, (_, index) => `term${index.toString().padStart(4, '0')}`).join(
    ' ',
  ) +
  ' Reply exactly OK.'
const turns =
  caseKind === 'cache_cold_warm'
    ? [longPrefix, 'What is the codeword? Reply with one word.', 'Repeat only the codeword.']
    : [
        'Remember CEDAR. Reply exactly OK.',
        'What is the codeword? Reply with one word.',
        'Repeat only the codeword.',
      ]
const scenario = {
  format: 1,
  caseKind,
  reviewStatus: 'pending',
  modelId,
  provider,
  definitionRevision: '',
  implementation: null,
  cache:
    provider === 'openai'
      ? { mode: 'automatic' }
      : { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] },
  ...(caseKind === 'cache_cold_warm'
    ? { cacheMinimumTokens: modelId === 'anthropic/claude-sonnet-5' ? 1_024 : 512 }
    : {}),
  reasoningEffort: 'low',
  maxOutputTokens: 256,
  turns,
  expectedEndpointTag: provider,
  publicWireSha256: '0'.repeat(64),
  serviceWireSha256: ['0'.repeat(64), '0'.repeat(64), '0'.repeat(64)],
  profileSha256: '',
  sourceSha256: {},
}
const definition = definitionFor(scenario)
scenario.definitionRevision = definition.revision
scenario.implementation = definition.implementation
for (const path of sourcePaths)
  scenario.sourceSha256[path] = sha256(await readFile(join(root, path)))
const profile = profileFor(scenario)
scenario.profileSha256 = sha256(JSON.stringify(profile))
const transport = createPiAiTransport({
  definitions: [definition],
  inputMeters: [meterFor(scenario)],
  policy: transportPolicy(),
})
try {
  const planned = transport.plan(publicInput(scenario, profile))
  assert.ok('planned' in planned, JSON.stringify(planned))
  scenario.publicWireSha256 = sha256(planned.planned.serialized)
} finally {
  await transport.close()
}
validateScenario(scenario)

const pricing = {
  prompt: '0.0000001',
  input_cache_write: '0.0000002',
  input_cache_write_1h: '0.0000003',
  completion: '0.0000005',
  request: '0',
}
const directoryRaw = JSON.stringify({ data: [{ id: modelId }] })
const endpointRaw = JSON.stringify({
  data: {
    endpoints: [{ tag: provider, provider_name: providerName(scenario), status: 0, pricing }],
  },
})
const catalog = {
  format: 1,
  captureSource: 'fixture-loopback',
  observedAt: new Date().toISOString(),
  directoryRawSha256: sha256(directoryRaw),
  endpointRawSha256: sha256(endpointRaw),
  cards: [
    {
      id: modelId,
      state: 'directory_present',
      endpoints: [{ tag: provider, provider: providerName(scenario), status: 0, pricing }],
    },
  ],
}
const cert = certificate()
const runs = []
async function positive(runNumber) {
  const directory = await mkdtemp(join(caseDir, `positive-${runNumber}-`))
  const outputDir = await privateOutputDirectory(join(directory, 'evidence'))
  const ledgerPath = join(directory, 'fixture-ledger.json')
  const ledger = await openLedger(ledgerPath, budget)
  let host
  const reservedAtHttp = []
  try {
    host = await fixture(
      cert.tls,
      async response => {
        const snapshot = JSON.parse(await readFile(ledgerPath, 'utf8'))
        const latest = snapshot.entries.at(-1)
        reservedAtHttp.push(latest?.state === 'reserved')
        assert.equal(latest?.state, 'reserved', 'durable reserve must precede HTTP')
        const index = reservedAtHttp.length - 1
        const write = index === 0 || index === (caseKind === 'cache_cold_warm' ? 2 : 1)
        response.end(
          content('OK') +
            sse({
              id: `gen-positive-${index}`,
              choices: [],
              model: modelId,
              provider: providerName(scenario),
              usage: {
                prompt_tokens: 2_000,
                completion_tokens: 2,
                prompt_tokens_details: {
                  cached_tokens: write ? 0 : 1_200,
                  cache_write_tokens: write ? 1_200 : 0,
                },
                cost: 0.0000117,
              },
            }) +
            finish(),
        )
      },
      {},
      undefined,
      [definition],
    )
    const options = { baseUrl: host.options.baseUrl, tls: host.options.tls }
    assert.equal(new URL(options.baseUrl).hostname, '127.0.0.1')
    const cold = await publicPaidCase({
      scenario,
      pricing,
      ledger,
      outputDir,
      credential: 'local-synthetic',
      transportOptions: options,
    })
    assert.equal(cold.upstreamRequestId, 'gen-positive-0')
    if (caseKind === 'cache_cold_warm') assert.equal(cold.usage.cache_write_tokens > 0, true)
    if (caseKind === 'cache_cold_warm') {
      const warm = await publicPaidCase({
        scenario,
        pricing,
        ledger,
        outputDir,
        credential: 'local-synthetic',
        transportOptions: options,
      })
      assert.equal(warm.upstreamRequestId, 'gen-positive-1')
      assert.equal(warm.usage.cache_read_tokens > 0, true)
    }
    const service = await servicePaidCase({
      scenario,
      pricing,
      ledger,
      outputDir,
      credentialBytes: Buffer.from('local-synthetic'),
      developmentTransport: options,
    })
    assert.equal(service.length, 3)
    const requestCount = caseKind === 'cache_cold_warm' ? 5 : 4
    assert.equal(host.requests.length, requestCount)
    assert.deepEqual(reservedAtHttp, Array(requestCount).fill(true))
    const serviceRequests = host.requests.slice(requestCount - 3)
    for (const [index, captured] of serviceRequests.entries()) {
      const body = JSON.parse(captured.body)
      assert.equal(body.model, modelId)
      const lastContent = body.messages?.at(-1)?.content
      assert.ok(Array.isArray(lastContent) && lastContent.length > 0)
      if (provider === 'anthropic')
        assert.deepEqual(lastContent.at(-1)?.cache_control, { type: 'ephemeral', ttl: '1h' })
      else assert.equal(lastContent.at(-1)?.cache_control, undefined)
      assert.equal(service[index]?.observedInput, 'from_usage')
      assert.equal(service[index]?.upstreamRequestId, `gen-positive-${requestCount - 3 + index}`)
      assert.equal(service[index]?.usage.cache_read_tokens, index === 0 ? 0 : 1_200)
    }
    const wires = host.requests.map(value => sha256(value.body))
    assert.equal(wires[0], scenario.publicWireSha256)
    if (caseKind === 'cache_cold_warm') assert.equal(wires[1], scenario.publicWireSha256)
    if (runNumber === 1) scenario.serviceWireSha256 = wires.slice(-3)
    else assert.deepEqual(wires.slice(-3), scenario.serviceWireSha256, 'service wire drifted')
    const snapshot = ledger.snapshot()
    assert.equal(snapshot.entries.length, requestCount)
    assert.ok(snapshot.entries.every(value => value.state === 'settled'))
    runs.push({
      directory,
      requestCount,
      serviceWireSha256: wires.slice(-3),
      reservedAtHttp,
      ledgerStates: snapshot.entries.map(value => value.state),
    })
  } finally {
    await host?.close()
    await ledger.close()
  }
}
async function unknownCost() {
  const directory = await mkdtemp(join(caseDir, 'unknown-'))
  const outputDir = await privateOutputDirectory(join(directory, 'evidence'))
  const ledger = await openLedger(join(directory, 'fixture-ledger.json'), budget)
  let host
  try {
    host = await fixture(
      cert.tls,
      response =>
        response.end(
          content('OK') +
            sse({
              choices: [],
              model: modelId,
              provider: providerName(scenario),
              usage: { prompt_tokens: 2_000, completion_tokens: 2 },
            }) +
            finish(),
        ),
      {},
      undefined,
      [definition],
    )
    await assert.rejects(
      publicPaidCase({
        scenario,
        pricing,
        ledger,
        outputDir,
        credential: 'local-synthetic',
        transportOptions: { baseUrl: host.options.baseUrl, tls: host.options.tls },
      }),
      /Actual cost unknown/,
    )
    assert.equal(host.requests.length, 1)
    assert.equal(ledger.snapshot().entries.at(-1)?.state, 'unknown')
    runs.push({ directory, unknownCostStopped: true, ledgerState: 'unknown' })
  } finally {
    await host?.close()
    await ledger.close()
  }
}
async function failureEvidence(kind) {
  const directory = await mkdtemp(join(caseDir, `${kind}-failure-`))
  const outputDir = await privateOutputDirectory(join(directory, 'evidence'))
  const ledgerPath = join(directory, 'fixture-ledger.json')
  const ledger = await openLedger(ledgerPath, budget)
  const requestId = `gen-${kind}-controlled`
  let host
  let reservedAtHttp = false
  try {
    host = await fixture(
      cert.tls,
      async response => {
        const persisted = JSON.parse(await readFile(ledgerPath, 'utf8'))
        reservedAtHttp = persisted.entries.at(-1)?.state === 'reserved'
        assert.equal(reservedAtHttp, true, 'durable reserve must precede failure HTTP')
        response.end(
          sse({ id: requestId, error: { code: 503, message: 'Rejected echo local-synthetic' } }) +
            sse('[DONE]'),
        )
      },
      {},
      undefined,
      [definition],
    )
    const options = { baseUrl: host.options.baseUrl, tls: host.options.tls }
    await assert.rejects(
      kind === 'public'
        ? publicPaidCase({
            scenario,
            pricing,
            ledger,
            outputDir,
            credential: 'local-synthetic',
            transportOptions: options,
          })
        : servicePaidCase({
            scenario,
            pricing,
            ledger,
            outputDir,
            credentialBytes: Buffer.from('local-synthetic'),
            developmentTransport: options,
          }),
      /Actual cost unknown/,
    )
    assert.equal(host.requests.length, 1, 'failure must not retry')
    const entry = ledger.snapshot().entries.at(-1)
    assert.equal(entry?.state, 'unknown')
    const evidenceFile =
      kind === 'public'
        ? join(outputDir, `public-${entry.id}.json`)
        : join(outputDir, `service-${entry.id}.json`)
    const evidenceBytes = await readFile(evidenceFile, 'utf8')
    const evidence = JSON.parse(evidenceBytes)
    assert.equal(evidence.outcome, 'failed')
    assert.equal(evidence.upstreamRequestId, requestId)
    assert.equal(evidence.inBandStatusCode, 503)
    assert.equal(evidence.httpStatus, null)
    assert.equal(evidence.failure?.inBand, true)
    assert.equal(evidence.failure?.upstreamError?.rawOmitted, true)
    assert.ok(!evidenceBytes.includes('local-synthetic'), 'secret escaped into failure evidence')
    assert.ok(
      !evidenceBytes.includes('Rejected echo'),
      'upstream body escaped into failure evidence',
    )
    if (kind === 'service') {
      assert.equal(evidence.durable, true)
      const closeFiles = (await readdir(outputDir)).filter(name =>
        name.startsWith('service-close-'),
      )
      assert.equal(closeFiles.length, 1)
      const close = JSON.parse(await readFile(join(outputDir, closeFiles[0]), 'utf8'))
      assert.equal(close.complete, true)
      assert.equal(close.hostReleasedAfterBusiness, true)
    }
    runs.push({
      directory,
      kind,
      failureEvidence: true,
      reservedAtHttp,
      ledgerState: 'unknown',
      requestId,
    })
  } finally {
    await host?.close()
    await ledger.close()
  }
}
async function httpFailureEvidence() {
  const directory = await mkdtemp(join(caseDir, 'http-failure-'))
  const outputDir = await privateOutputDirectory(join(directory, 'evidence'))
  const ledgerPath = join(directory, 'fixture-ledger.json')
  const ledger = await openLedger(ledgerPath, budget)
  let host
  try {
    host = await fixture(
      cert.tls,
      async response => {
        const persisted = JSON.parse(await readFile(ledgerPath, 'utf8'))
        assert.equal(persisted.entries.at(-1)?.state, 'reserved')
        response.writeHead(503, {
          'content-type': 'application/json',
          'x-request-id': 'req-http-controlled',
        })
        response.end(
          JSON.stringify({
            error: { code: 'overloaded_error', message: 'Rejected echo local-synthetic' },
          }),
        )
      },
      {},
      undefined,
      [definition],
    )
    await assert.rejects(
      publicPaidCase({
        scenario,
        pricing,
        ledger,
        outputDir,
        credential: 'local-synthetic',
        transportOptions: { baseUrl: host.options.baseUrl, tls: host.options.tls },
      }),
      /Actual cost unknown/,
    )
    assert.equal(host.requests.length, 1)
    const entry = ledger.snapshot().entries.at(-1)
    assert.equal(entry.state, 'unknown')
    const evidenceBytes = await readFile(join(outputDir, `public-${entry.id}.json`), 'utf8')
    const evidence = JSON.parse(evidenceBytes)
    assert.equal(evidence.outcome, 'failed')
    assert.equal(evidence.httpStatus, 503)
    assert.equal(evidence.inBandStatusCode, null)
    assert.equal(evidence.requestIdHeaders?.['x-request-id'], 'req-http-controlled')
    assert.ok(!evidenceBytes.includes('local-synthetic'))
    assert.ok(!evidenceBytes.includes('Rejected echo'))
    runs.push({ directory, kind: 'http_failure', ledgerState: 'unknown', httpStatus: 503 })
  } finally {
    await host?.close()
    await ledger.close()
  }
}
async function rejectionEvidence() {
  const directory = await mkdtemp(join(caseDir, 'pre-send-rejection-'))
  const outputDir = await privateOutputDirectory(join(directory, 'evidence'))
  const ledger = await openLedger(join(directory, 'fixture-ledger.json'), budget)
  try {
    await assert.rejects(
      publicPaidCase({ scenario, pricing, ledger, outputDir, credential: '' }),
      /Actual cost unknown/,
    )
    const entry = ledger.snapshot().entries.at(-1)
    assert.equal(entry.state, 'unknown')
    const evidence = JSON.parse(await readFile(join(outputDir, `public-${entry.id}.json`), 'utf8'))
    assert.equal(evidence.outcome, 'invalidInput')
    assert.equal(evidence.rejectionReason, 'malformed')
    assert.equal(evidence.failure, null)
    assert.equal(evidence.httpStatus, null)
    runs.push({ directory, kind: 'pre_send_rejection', ledgerState: 'unknown', noHttp: true })
  } finally {
    await ledger.close()
  }
}
try {
  await positive(1)
  await positive(2)
  await unknownCost()
  await failureEvidence('public')
  await failureEvidence('service')
  await httpFailureEvidence()
  await rejectionEvidence()
  const scenarioBytes = JSON.stringify(scenario, null, 2) + '\n'
  const catalogBytes = JSON.stringify(catalog, null, 2) + '\n'
  await writeFile(join(caseDir, 'scenario.json'), scenarioBytes, { mode: 0o600 })
  await writeFile(join(caseDir, 'fixture-catalog.json'), catalogBytes, { mode: 0o600 })
  await writeFile(join(caseDir, 'directory.raw.json'), directoryRaw, { mode: 0o600 })
  await writeFile(join(caseDir, 'endpoint.raw.json'), endpointRaw, { mode: 0o600 })
  await writeFile(
    join(caseDir, 'dry-run-result.json'),
    JSON.stringify(
      {
        sourceCommit,
        scenarioSha256: sha256(scenarioBytes),
        fixtureCatalogSha256: sha256(catalogBytes),
        runs,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  )
  process.stdout.write(
    `dry-run pass: ${modelId} ${caseKind}, 2 x ${caseKind === 'cache_cold_warm' ? 5 : 4} HTTPS sends, unknown and failed public/service stopped; scenario SHA ${sha256(scenarioBytes)}\n`,
  )
} finally {
  cert.dispose()
}
