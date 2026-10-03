import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import amSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }

const mode = process.argv[2]
assert(['src', 'dist'].includes(mode))
const local = createRequire(import.meta.url)
const compiler = createRequire(local.resolve('@omne-harness-lite/content-blocks'))
const owners = new Set()
let compilations = 0
let authorCompilations = 0
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
    } else authorCompilations++
    return Reflect.apply(compile, this, [schema, ...args])
  }
}

const api = await import(
  new URL(`../${mode}/index.${mode === 'src' ? 'ts' : 'js'}`, import.meta.url)
)
const { simple } = await import('./fixtures.ts')
assert.equal(compilations, 0, 'import must not construct the default owner')
const snapshot = JSON.stringify(api.defaultBodyContracts)
function assertFrozen(value) {
  if (value === null || typeof value !== 'object') return
  assert(Object.isFrozen(value))
  for (const [key, child] of Object.entries(value)) {
    assert.equal(Reflect.set(value, key, null), false)
    assert.equal(Reflect.deleteProperty(value, key), false)
    assertFrozen(child)
  }
}
for (const port of Object.values(api.defaultBodyContracts)) assertFrozen(port)
for (const [category, module, symbol] of [
  ['tool', '@omne-harness-lite/tool-definition', 'toolBodyContract'],
  ['skill', '@omne-harness-lite/skill-package/v2', 'skillBodyContract'],
  ['mcp', '@omne-harness-lite/mcp-endpoint', 'mcpBodyContract'],
  ['slash_command', '@omne-harness-lite/slash-command', 'slashCommandBodyContract'],
]) {
  const originalPort = (await import(module))[symbol]
  assert.notEqual(api.defaultBodyContracts[category].schema, originalPort.schema)
  assert.deepEqual(api.defaultBodyContracts[category].schema, originalPort.schema)
  for (const responsibility of ['judge', 'deriveDeclarations', 'references'])
    assert.equal(api.defaultBodyContracts[category][responsibility], originalPort[responsibility])
}
const original = (
  await import('@omne-harness-lite/loop-extension/schema/v3', { with: { type: 'json' } })
).default
assert.notEqual(api.defaultBodyContracts.loop_extension.schema, original)
assert.equal(Reflect.set(original, '$id', 'urn:changed-after-publication'), true)
assert.equal(Reflect.set(original.$defs.LoopExtensionDefinition, 'type', 'null'), true)
assert.equal(JSON.stringify(api.defaultBodyContracts), snapshot)

const input = simple()
const declaration = {
  name: 'review-before-action',
  position: 'before_action',
  power: 'veto',
  implementation: { kind: 'builtin', builtinName: 'review' },
}
const capability = { category: 'loop_extension', name: declaration.name }
input.root.references = [{ capability }]
input.holdings[1] = { ...input.holdings[1], capability }
input.definitions[1] = {
  ...input.definitions[1],
  capability,
  versions: [
    {
      ...input.definitions[1].versions[0],
      content: { category: 'loop_extension', extension: declaration },
    },
  ],
}
failure = new Error('first default construction fails')
assert.throws(
  () => api.evaluate(input),
  error => error === failure,
)
assert.equal(owners.size, 1)
failure = undefined
const accepted = api.evaluate(input)
assert('ok' in accepted, JSON.stringify(accepted))
assert.equal(owners.size, 2, 'a failed partial owner must not be cached')
const afterFirst = compilations
assert.deepEqual(api.evaluate(input), accepted)
assert.equal(compilations, afterFirst, 'successful default owner must be reused')
assert('invalidInput' in api.evaluate({ ...input, tenant: {} }))
assert.equal(compilations, afterFirst)
const authoredInput = simple()
const beforeAuthor = authorCompilations
assert('ok' in api.evaluate(authoredInput))
assert(authorCompilations > beforeAuthor, 'author Schema still compiles at use')
const afterAuthor = authorCompilations
assert('ok' in api.evaluate(authoredInput))
assert(authorCompilations > afterAuthor, 'author Schema has no module cache')
assert.equal(compilations, afterFirst)
const { createAssetModelJudge } = await import('@omne-harness-lite/asset-model')
createAssetModelJudge(api.defaultBodyContracts)
assert(compilations > afterFirst, 'explicit factory must still compile immediately')
assert.throws(
  () => createAssetModelJudge({ ...api.defaultBodyContracts, tool: undefined }),
  TypeError,
)
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
