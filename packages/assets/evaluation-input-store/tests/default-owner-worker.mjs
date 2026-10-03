import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import amSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }

const [mode, directory] = process.argv.slice(2)
assert(['src', 'dist'].includes(mode))
assert(directory)
const compiler = createRequire(import.meta.resolve('@omne-harness-lite/content-blocks'))
const owners = new Set()
let compilations = 0
let failure
for (const name of ['ajv', 'ajv/dist/2020.js']) {
  const loaded = compiler(name)
  const Actual = loaded.default ?? loaded
  const compile = Actual.prototype.compile
  Actual.prototype.compile = function (schema, ...args) {
    if (schema?.$ref?.startsWith(`${amSchema.$id}#/$defs/`)) {
      owners.add(this)
      compilations++
      if (failure !== undefined) throw failure
    }
    return Reflect.apply(compile, this, [schema, ...args])
  }
}

// Mutate the original resource after AE publication but before this consumer imports.
const { defaultBodyContracts } = await import('@omne-harness-lite/asset-evaluation')
const snapshot = JSON.stringify(defaultBodyContracts)
const original = (
  await import('@omne-harness-lite/loop-extension/schema/v3', { with: { type: 'json' } })
).default
assert.notEqual(defaultBodyContracts.loop_extension.schema, original)
assert.equal(Reflect.set(original, '$id', 'urn:changed-after-publication'), true)
assert.equal(Reflect.set(original.$defs.LoopExtensionDefinition, 'type', 'null'), true)
const api = await import(
  new URL(`../${mode}/index.${mode === 'src' ? 'ts' : 'js'}`, import.meta.url)
)
const { boot, deployments } = await import('./support.ts')
assert.equal(compilations, 0, 'import must not construct a default owner')
const tenant = JSON.parse(await readFile(join(directory, 'tenant.json'), 'utf8'))
// An empty setup manifest needs no AM judgment. The real reader below validates
// the deployed manifest at construction, as its existing public contract requires.
const host = await boot(join(directory, 'state.sqlite'), [])
const deps = { ...host.deps, deployedOfficial: deployments }
let reader
let secondReader
try {
  assert.equal(compilations, 0, 'empty setup manifest must not construct a default owner')
  failure = new Error('first input-store default construction fails')
  assert.throws(
    () => api.createEvaluationInputReader(deps),
    error => error === failure,
  )
  assert.equal(owners.size, 1)
  failure = undefined
  reader = api.createEvaluationInputReader(deps)
  assert.equal(owners.size, 2, 'failed input-store owner must not be cached')
  const accepted = await reader.read('session_a', tenant)
  assert('input' in accepted, JSON.stringify(accepted))
  assert.equal(owners.size, 3, 'the input read also uses one AE owner')
  const afterFirst = compilations
  secondReader = api.createEvaluationInputReader(deps)
  assert.deepEqual(await secondReader.read('session_a', tenant), accepted)
  assert.deepEqual(await reader.read('session_a', tenant), accepted)
  assert.deepEqual(await reader.read('session_a', {}), { failure: 'invalidInput' })
  assert.equal(compilations, afterFirst, 'successful owners must be reused')
  assert.equal(JSON.stringify(defaultBodyContracts), snapshot)
  process.stdout.write(
    JSON.stringify({
      mode,
      importedCompilations: 0,
      owners: owners.size,
      retry: true,
      snapshot: true,
      cached: true,
    }) + '\n',
  )
} finally {
  await secondReader?.close()
  await reader?.close()
  await host.close()
}
