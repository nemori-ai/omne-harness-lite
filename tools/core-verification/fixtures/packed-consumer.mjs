import assert from 'node:assert/strict'
import { readFile, realpath, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import { judgeArrivalEnvelope } from '@omne-harness-lite/arrival-events'

const input = JSON.parse(await readFile(new URL('./input.json', import.meta.url), 'utf8'))
const expected = input.resourceOracle.resources
assert.equal(input.resourceOracle.schemaVersion, 1)
assert.equal(input.resourceOracle.distinctResources, 29)
const negativeControl = process.argv.includes('--negative-control=content-epoch')
const records = []
const schemas = []
const resources = new Map()
const results = []
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function resource(path, specifier) {
  const loaded = schemas.find(schema => schema.file === path)
  if (loaded) {
    if (specifier.startsWith('@omne-harness-lite/')) loaded.specifier = specifier
    return
  }
  const bytes = await readFile(path)
  const schema = JSON.parse(bytes)
  const match = new URL(schema.$id).pathname.match(/[/]spec[/](.+)$/)
  assert.ok(match, 'schema fixed coordinate')
  const relative = 'spec/' + match[1]
  schemas.push({ specifier, file: path, sha256: hash(bytes), coordinate: relative })
  const existing = resources.get(schema.$id)
  if (existing)
    assert.equal(
      hash(JSON.stringify(existing)),
      hash(JSON.stringify(schema)),
      'duplicate Schema identity must have identical content',
    )
  resources.set(schema.$id, schema)
}
async function scenario(id, run) {
  try {
    await run()
    results.push({ id, status: 'passed' })
  } catch (error) {
    results.push({
      id,
      status: 'failed',
      error: { name: error.name, message: error.message, stack: error.stack },
    })
  }
}
await scenario('w6.pack.actual-runtime-exports', async () => {
  for (const member of input.members) {
    for (const subpath of member.subpaths) {
      const specifier = member.specifier + (subpath === '.' ? '' : subpath.slice(1))
      const path = await realpath(fileURLToPath(import.meta.resolve(specifier)))
      assert.ok(path.startsWith(dirname(fileURLToPath(import.meta.url)) + '/node_modules/'))
      if (subpath === './schema' || subpath.startsWith('./schema/')) await resource(path, specifier)
      else if (subpath !== './conformance') {
        const exports = Object.keys(await import(specifier)).sort()
        assert.ok(exports.length > 0)
        records.push({ specifier, file: path, exports, sha256: hash(await readFile(path)) })
      }
      if (member.name === 'asset-model' && subpath === './schema') {
        const folder = join(dirname(path), 'resources')
        for (const file of await readdir(folder))
          if (file.endsWith('.schema.json'))
            await resource(join(folder, file), 'packaged-internal-resource')
      }
    }
  }
  // The independent oracle includes retained dependency resources, even without a public subpath.
  for (const entry of expected) {
    const packageRoot = join(
      dirname(fileURLToPath(import.meta.resolve('@omne-harness-lite/' + entry.member))),
      '..',
    )
    const path = await realpath(join(packageRoot, entry.file))
    assert.ok(
      path.startsWith(dirname(fileURLToPath(import.meta.url)) + '/node_modules/'),
      'Schema resource comes from an actual installed archive',
    )
    if (!schemas.some(schema => schema.file === path))
      await resource(path, entry.publicEntry ?? 'packaged-dependency-resource')
  }
})
await scenario('w6.schema.current-and-retained-coordinates', async () => {
  for (const member of input.members) {
    for (const subpath of member.subpaths.filter(
      path => path === './schema' || path.startsWith('./schema/'),
    )) {
      const specifier = member.specifier + subpath.slice(1)
      const adopted = expected.find(entry => entry.publicEntry === specifier)
      assert.ok(adopted, specifier + ': independently declared resource')
      const coordinate =
        negativeControl && specifier === '@omne-harness-lite/content-blocks/schema'
          ? adopted.id.replace('/v3/', '/v2/')
          : adopted.id
      const actual = schemas.find(schema => schema.specifier === specifier)
      assert.ok(actual, specifier + ': resource was actually loaded')
      assert.equal(
        actual.coordinate,
        'spec/' + new URL(coordinate).pathname.split('/spec/')[1],
        specifier,
      )
    }
  }
})
await scenario('w6.schema.exact-adopted-bytes', async () => {
  assert.equal(schemas.length, expected.length, 'every declared packaged resource is loaded')
  for (const entry of expected) {
    const candidates = schemas.filter(
      schema => schema.coordinate === 'spec/' + new URL(entry.id).pathname.split('/spec/')[1],
    )
    assert.ok(candidates.length > 0, entry.id + ': actual resource present')
    for (const schema of candidates)
      assert.equal(schema.sha256, entry.sha256, entry.id + ': independent adopted bytes')
  }
})
let compiled = 0
await scenario('w6.schema.fixed-resource-closure', () => {
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true })
  for (const schema of resources.values()) ajv.addSchema(schema)
  for (const schema of resources.values())
    for (const name of Object.keys(schema.$defs ?? {})) {
      ajv.compile({ $ref: schema.$id + '#/$defs/' + name })
      compiled++
    }
  assert.ok(compiled > 100)
  assert.equal(resources.size, 29, 'independently declared current and retained resource graph')
})
await scenario('w6.schema.current3-raw-name-versus-retained2-arrival', () => {
  const raw = {
    kind: 'tool_call',
    id: 'raw',
    visibility: { toHuman: true, toModel: true },
    complete: true,
    callId: 'call',
    tool: 'bad/name',
    rawArguments: '{"x":1,"x":2}',
    unparseable: true,
  }
  assert.ok('ok' in judgeContentBlock(raw))
  const { rawArguments, unparseable, ...parsedBase } = raw
  assert.deepEqual(judgeContentBlock({ ...parsedBase, arguments: {} }), { rejected: 'malformed' })
  assert.deepEqual(
    judgeArrivalEnvelope({
      target: { kind: 'model_call', callId: 'model', dispatch: 1 },
      event: { t: 'close', index: 0, block: raw },
    }),
    { rejected: 'malformed' },
  )
  assert.equal(raw.rawArguments, '{"x":1,"x":2}')
})
await scenario('w6.pack.private-subpath-rejections', async () => {
  for (const specifier of input.forbidden)
    await assert.rejects(
      import(specifier),
      error => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
      specifier,
    )
})
process.stdout.write(
  JSON.stringify(
    {
      specEpoch: 3,
      measurementEpoch: 5,
      skillCoordinates: { reader: 3, body: 2 },
      negativeControl,
      records,
      schemas,
      resources: resources.size,
      compiled,
      forbidden: input.forbidden,
      cases: results,
    },
    null,
    2,
  ) + '\n',
)
if (results.some(result => result.status === 'failed')) process.exitCode = 1
