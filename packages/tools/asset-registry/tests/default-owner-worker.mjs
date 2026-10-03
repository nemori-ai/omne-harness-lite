import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import amSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }

const mode = process.argv[2]
assert(['src', 'dist'].includes(mode))
const local = createRequire(import.meta.url)
const compiler = createRequire(local.resolve('@omne-harness-lite/content-blocks'))
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

// Resolve the same public AE dependency that the registry will consume.
const { defaultBodyContracts } = await import('@omne-harness-lite/asset-evaluation')
const snapshot = JSON.stringify(defaultBodyContracts)
const original = (await import('@omne-harness-lite/loop-extension/schema/v3', { with: { type: 'json' } })).default
assert.notEqual(defaultBodyContracts.loop_extension.schema, original)
assert.equal(Reflect.set(original, '$id', 'urn:changed-after-publication'), true)
assert.equal(Reflect.set(original.$defs.LoopExtensionDefinition, 'type', 'null'), true)
const api = await import(new URL(`../${mode}/index.${mode === 'src' ? 'ts' : 'js'}`, import.meta.url))
const { fixture } = await import('./support.ts')
assert.equal(compilations, 0, 'import must not construct a default owner')
const f = fixture()
assert.equal(owners.size, 1, 'fixture consumes AE through its public entry')
const prepare = () => api.buildTableContents(f.evaluation, f.order, f.definitions)
failure = new Error('first registry default construction fails')
assert.throws(prepare, error => error === failure)
assert.equal(owners.size, 2)
failure = undefined
const accepted = prepare()
assert('plans' in accepted, JSON.stringify(accepted))
assert.equal(owners.size, 3, 'failed registry owner must not be cached')
const afterFirst = compilations
assert.deepEqual(prepare(), accepted)
assert.deepEqual(api.buildTableContents(f.evaluation, [], f.definitions), { failure: 'invalidInput' })
assert.equal(compilations, afterFirst, 'successful registry owner must be reused')
assert.equal(JSON.stringify(defaultBodyContracts), snapshot)
process.stdout.write(JSON.stringify({ mode, importedCompilations: 0, owners: owners.size, retry: true, snapshot: true, cached: true }) + '\n')
