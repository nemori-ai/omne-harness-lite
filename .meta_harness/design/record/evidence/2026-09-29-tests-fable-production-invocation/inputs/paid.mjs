import assert from 'node:assert/strict'
import { lstat, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { readPrivateFile } from '../../examples/model-invocation-minimal-demo/dist/demo.js'
import {
  openProductionLedger,
  privateOutputDirectory,
  writePrivateEvidence,
} from '../../tools/model-probe/src/production-gate.mjs'
import {
  approvedLedger,
  budget,
  definition,
  exactPricing,
  modelId,
  profileFor,
  readFrozenJson,
  sha256,
  validateScenario,
  wholeContextReservation,
  publicPaidCase,
} from './paid-core.mjs'
import { servicePaidCase } from './service-core.mjs'

function argumentsFor(argv) {
  const args = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined || args.has(key))
      throw new Error('one value required for each distinct option')
    args.set(key, value)
  }
  const required = [
    '--mode',
    '--scenario',
    '--scenario-sha256',
    '--catalog',
    '--catalog-sha256',
    '--catalog-max-age-ms',
    '--ledger',
    '--credential-file',
    '--output-dir',
  ]
  assert.deepEqual([...args.keys()].sort(), required.sort(), 'exact option set required')
  assert.equal(args.get('--mode'), 'production', 'explicit production mode required')
  return Object.fromEntries([...args].map(([key, value]) => [key.slice(2), value]))
}

const args = argumentsFor(process.argv.slice(2))
assert.equal(resolve(args.ledger), approvedLedger, 'the one approved HUB ledger is required')
const scenario = validateScenario(await readFrozenJson(args.scenario, args['scenario-sha256']))
assert.ok(Array.isArray(scenario.serviceWireSha256) && scenario.serviceWireSha256.length === 3)
for (const digest of scenario.serviceWireSha256) assert.match(digest, /^[a-f0-9]{64}$/)
const catalog = await readFrozenJson(args.catalog, args['catalog-sha256'])
assert.match(catalog.directoryRawSha256, /^[a-f0-9]{64}$/)
assert.match(catalog.endpointRawSha256, /^[a-f0-9]{64}$/)
const catalogDir = dirname(resolve(args.catalog))
const directoryRaw = await readFile(join(catalogDir, 'directory.raw.json'))
const endpointRaw = await readFile(join(catalogDir, 'endpoint.raw.json'))
assert.equal(sha256(directoryRaw), catalog.directoryRawSha256)
assert.equal(sha256(endpointRaw), catalog.endpointRawSha256)
const rawListed = JSON.parse(directoryRaw.toString('utf8')).data?.find(
  value => value.id === modelId,
)
const rawEndpoint = JSON.parse(endpointRaw.toString('utf8')).data?.endpoints?.find(
  value => value.tag === scenario.expectedEndpointTag,
)
assert.ok(rawListed && rawEndpoint)
assert.equal(rawEndpoint.provider_name, 'Anthropic')
assert.equal(rawEndpoint.status, 0)
assert.deepEqual(catalog.cards[0].endpoints[0].pricing, rawEndpoint.pricing)
const maxAgeMs = Number(args['catalog-max-age-ms'])
const pricing = exactPricing(catalog, scenario, maxAgeMs)
const files = scenario.sourceSha256
assert.ok(files && typeof files === 'object' && !Array.isArray(files))
for (const [path, digest] of Object.entries(files)) {
  assert.match(path, /^(packages|examples|tmp\/priority-certification)\//)
  assert.match(digest, /^[a-f0-9]{64}$/)
  assert.equal(sha256(await readFile(resolve(path))), digest, `source changed: ${path}`)
}
assert.equal(scenario.profileSha256, sha256(JSON.stringify(profileFor(scenario))))
const estimateUsd = wholeContextReservation(pricing, scenario)
const stat = await lstat(approvedLedger)
assert.ok(stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600)
const outputDir = await privateOutputDirectory(args['output-dir'])
const ledger = await openProductionLedger(args.ledger, approvedLedger, budget)
let credentialBytes
try {
  const raw = await readPrivateFile(args['credential-file'])
  try {
    const end = raw.at(-1) === 0x0a ? raw.length - 1 : raw.length
    credentialBytes = Buffer.from(raw.subarray(0, end))
  } finally {
    raw.fill(0)
  }
  assert.ok(
    credentialBytes.length > 0 && credentialBytes.every(byte => byte >= 0x20 && byte <= 0x7e),
  )
  const manifest = {
    modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    scenarioSha256: args['scenario-sha256'],
    catalogSha256: args['catalog-sha256'],
    catalogObservedAt: catalog.observedAt,
    expectedEndpointTag: scenario.expectedEndpointTag,
    profileSha256: scenario.profileSha256,
    publicWireSha256: scenario.publicWireSha256,
    approvedLocalServiceWireSha256: scenario.serviceWireSha256,
    sourceSha256: files,
    estimateUsdPerRequest: estimateUsd,
    maximumPlannedRequests: 4,
    budget,
  }
  await writePrivateEvidence(`${outputDir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
  await publicPaidCase({
    scenario,
    pricing,
    ledger,
    outputDir,
    credential: credentialBytes.toString('ascii'),
  })
  await servicePaidCase({ scenario, pricing, ledger, outputDir, credentialBytes })
} finally {
  credentialBytes?.fill(0)
  await ledger.close()
}
