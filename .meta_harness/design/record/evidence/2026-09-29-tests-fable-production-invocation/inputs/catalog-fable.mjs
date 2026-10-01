import assert from 'node:assert/strict'
import { getPublic } from '../../tools/model-probe/src/network.mjs'
import {
  privateOutputDirectory,
  writePrivateEvidence,
} from '../../tools/model-probe/src/production-gate.mjs'
import { modelId, sha256 } from './paid-core.mjs'

if (process.argv.length !== 4 || process.argv[2] !== '--output-dir')
  throw new Error('usage: catalog-fable.mjs --output-dir ABSOLUTE_PRIVATE_DIRECTORY')
const outputDir = await privateOutputDirectory(process.argv[3])
const directory = await getPublic('/api/v1/models')
const endpointSource = await getPublic(`/api/v1/models/${modelId}/endpoints`)
const listed = JSON.parse(directory.raw).data?.find(value => value.id === modelId)
const endpoint = JSON.parse(endpointSource.raw).data?.endpoints?.find(
  value => value.tag === 'anthropic',
)
assert.ok(listed, 'exact model absent from public directory')
assert.ok(endpoint && endpoint.provider_name === 'Anthropic' && endpoint.status === 0)
assert.ok(endpoint.pricing, 'exact endpoint price missing')
const snapshot = {
  format: 1,
  observedAt: endpointSource.observedAt,
  directoryObservedAt: directory.observedAt,
  directoryRawSha256: sha256(directory.raw),
  endpointRawSha256: sha256(endpointSource.raw),
  cards: [
    {
      id: modelId,
      state: 'directory_present',
      endpoints: [
        {
          tag: endpoint.tag,
          provider: endpoint.provider_name,
          status: endpoint.status,
          pricing: endpoint.pricing,
        },
      ],
    },
  ],
}
const bytes = JSON.stringify(snapshot, null, 2) + '\n'
await writePrivateEvidence(`${outputDir}/directory.raw.json`, directory.raw)
await writePrivateEvidence(`${outputDir}/endpoint.raw.json`, endpointSource.raw)
await writePrivateEvidence(`${outputDir}/catalog.json`, bytes)
process.stdout.write(
  `model=${modelId} catalogSha256=${sha256(bytes)} observedAt=${snapshot.observedAt}\n`,
)
