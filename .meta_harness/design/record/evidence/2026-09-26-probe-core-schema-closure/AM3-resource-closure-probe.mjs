import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'

const root = path.resolve(import.meta.dirname, '../..')
const design = path.join(root, '.meta_harness/design')
const inputs = []
function schema(topic, version) {
  const relative = `spec/data/${topic}/v${version}/${topic}.schema.json`
  const bytes = fs.readFileSync(path.join(design, relative))
  inputs.push({ path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
  return JSON.parse(bytes)
}
const asset = schema('asset-model', 3)
const base = [asset, schema('content-blocks', 3), schema('identity-values', 1), schema('offer-expiry', 1),
  schema('tool-definition', 3), schema('loop-extension', 3), schema('skill-package', 2),
  schema('mcp-endpoint', 2), schema('slash-command', 2), schema('connector', 2)]
const old = [schema('content-blocks', 2), schema('asset-model', 2), schema('tool-definition', 2)]
const results = []
for (let retained = 0; retained <= old.length; retained++) {
  const resources = [...base, ...old.slice(0, retained)]
  const row = { retained, ids: resources.map(value => value.$id), compiled: [], failed: [] }
  const runtime = createSchemaRuntime(resources)
  for (const name of Object.keys(asset.$defs)) {
    try {
      runtime.compile({ $ref: `${asset.$id}#/$defs/${name}` })
      row.compiled.push(name)
    } catch (error) {
      row.failed.push({ name, message: String(error) })
    }
  }
  results.push(row)
}
const report = { scope: 'Candidate AM3 fixed-definition resource compilation only; no adoption, provider judgment, Connector implementation or domain outcome claim.',
  runtime: process.version, inputs, results }
fs.writeFileSync(path.join(import.meta.dirname, 'AM3-resource-closure-probe.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(results.map(({ retained, compiled, failed }) => ({ retained, compiled: compiled.length, failed: failed.length, first: failed[0] }))))
