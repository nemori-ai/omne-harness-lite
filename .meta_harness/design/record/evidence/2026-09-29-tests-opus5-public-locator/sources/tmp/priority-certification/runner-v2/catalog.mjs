import assert from 'node:assert/strict'
import { getPublic } from '../../../tools/model-probe/src/network.mjs'
import {
  privateOutputDirectory,
  writePrivateEvidence,
} from '../../../tools/model-probe/src/production-gate.mjs'
import { sha256, supportedModelIds } from './paid-core.mjs'

if (
  process.argv.length !== 6 ||
  process.argv[2] !== '--model' ||
  process.argv[4] !== '--output-dir'
)
  throw new Error(
    'usage: catalog.mjs --model EXACT_MODEL_ID --output-dir ABSOLUTE_PRIVATE_DIRECTORY',
  )
const modelId = process.argv[3]
assert.ok(supportedModelIds.includes(modelId), 'model outside exact allowlist')
const provider = modelId.split('/')[0]
const providerName = provider === 'openai' ? 'OpenAI' : 'Anthropic'
const outputDir = await privateOutputDirectory(process.argv[5])
const directory = await getPublic('/api/v1/models')
const endpointSource = await getPublic(`/api/v1/models/${modelId}/endpoints`)
const listed = JSON.parse(directory.raw).data?.find(value => value.id === modelId)
const endpoint = JSON.parse(endpointSource.raw).data?.endpoints?.find(
  value => value.tag === provider,
)
assert.ok(listed, 'exact model absent from public directory')
assert.ok(endpoint && endpoint.provider_name === providerName && endpoint.status === 0)
assert.ok(endpoint.pricing, 'exact endpoint price missing')
const snapshot = {
  format: 1,
  captureSource: 'openrouter-public-api',
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
