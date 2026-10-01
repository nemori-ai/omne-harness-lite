import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { usdString, usdUnits } from '../../tools/model-probe/src/budget.mjs'
import {
  definitionFor,
  exactPricing,
  profileFor,
  readFrozenJson,
  sha256,
  validateScenario,
  wholeContextReservation,
} from './paid-core.mjs'

if (process.argv.length !== 7)
  throw new Error('usage: review.mjs SCENARIO SCENARIO_SHA CATALOG CATALOG_SHA MAX_AGE_MS')
const [scenarioPath, scenarioSha, catalogPath, catalogSha, maxAgeText] = process.argv.slice(2)
const scenario = validateScenario(await readFrozenJson(scenarioPath, scenarioSha))
const definition = definitionFor(scenario)
const catalog = await readFrozenJson(catalogPath, catalogSha)
assert.equal(sha256(JSON.stringify(profileFor(scenario))), scenario.profileSha256)
const catalogDir = dirname(resolve(catalogPath))
const directoryRaw = await readFile(join(catalogDir, 'directory.raw.json'))
const endpointRaw = await readFile(join(catalogDir, 'endpoint.raw.json'))
assert.equal(sha256(directoryRaw), catalog.directoryRawSha256)
assert.equal(sha256(endpointRaw), catalog.endpointRawSha256)
const endpoint = JSON.parse(endpointRaw.toString('utf8')).data?.endpoints?.find(
  value => value.tag === scenario.expectedEndpointTag,
)
assert.ok(endpoint && endpoint.provider_name === 'Anthropic' && endpoint.status === 0)
assert.deepEqual(catalog.cards[0].endpoints[0].pricing, endpoint.pricing)
for (const [path, digest] of Object.entries(scenario.sourceSha256))
  assert.equal(sha256(await readFile(resolve(path))), digest, `source changed: ${path}`)
const price = exactPricing(catalog, scenario, Number(maxAgeText))
const estimateUsd = wholeContextReservation(price, scenario)
process.stdout.write(
  JSON.stringify(
    {
      modelId: scenario.modelId,
      caseKind: scenario.caseKind,
      reviewStatus: scenario.reviewStatus,
      scenarioSha256: scenarioSha,
      catalogSha256: catalogSha,
      observedAt: catalog.observedAt,
      endpointTag: scenario.expectedEndpointTag,
      definitionRevision: scenario.definitionRevision,
      implementation: scenario.implementation,
      profileSha256: scenario.profileSha256,
      publicWireSha256: scenario.publicWireSha256,
      approvedLocalServiceWireSha256: scenario.serviceWireSha256,
      inputTokenBoundPerRequest: definition.capabilities.maxInputTokens,
      outputTokenBoundPerRequest: scenario.maxOutputTokens,
      estimateUsdPerRequest: estimateUsd,
      maximumPlannedRequests: scenario.caseKind === 'cache_cold_warm' ? 5 : 4,
      maximumPlannedReservationUsd: usdString(
        usdUnits(estimateUsd) * BigInt(scenario.caseKind === 'cache_cold_warm' ? 5 : 4),
      ),
      note: 'Service live wire is not observable through this public assembly; its local hashes are not a live wire certificate.',
    },
    null,
    2,
  ) + '\n',
)
