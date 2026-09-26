import assert from 'node:assert/strict'
import { readFile, realpath, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import { judgeArrivalEnvelope } from '@omne-harness-lite/arrival-events'

const input = JSON.parse(await readFile(new URL('./input.json', import.meta.url), 'utf8'))
const negativeControl = process.argv.includes('--negative-control=content-epoch')
const records = []
const schemas = []
const resources = new Map()
const results = []
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function resource(path, specifier) {
  const bytes = await readFile(path)
  const schema = JSON.parse(bytes)
  const match = new URL(schema.$id).pathname.match(/[/]spec[/](.+)$/)
  assert.ok(match, 'schema fixed coordinate')
  const relative = 'spec/' + match[1]
  schemas.push({ specifier, file: path, sha256: hash(bytes), coordinate: relative })
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
})
await scenario('w6.schema.current-and-retained-coordinates', async () => {
  const current3 = new Set([
    'content-blocks',
    'messages',
    'model-response',
    'loop-extension',
    'tool-definition',
    'asset-model',
  ])
  for (const member of input.members) {
    for (const subpath of member.subpaths.filter(
      path => path === './schema' || path.startsWith('./schema/'),
    )) {
      const specifier = member.specifier + subpath.slice(1)
      const version =
        subpath === './schema/v2'
          ? 2
          : subpath === './schema/v1'
            ? 1
            : current3.has(member.name)
              ? 3
              : member.name === 'identity-values'
                ? 1
                : 2
      const expectedVersion =
        negativeControl && specifier === '@omne-harness-lite/content-blocks/schema' ? 2 : version
      const actual = schemas.find(schema => schema.specifier === specifier)
      assert.ok(actual, specifier + ': resource was actually loaded')
      assert.equal(
        actual.coordinate,
        `spec/data/${member.name}/v${expectedVersion}/${member.name}.schema.json`,
        specifier,
      )
    }
  }
})
await scenario('w6.schema.exact-frozen-bytes', async () => {
  for (const schema of schemas) {
    assert.equal(
      schema.sha256,
      input.frozen[schema.coordinate],
      schema.coordinate + ': frozen bytes',
    )
    assert.equal(hash(await readFile(join(input.designRoot, schema.coordinate))), schema.sha256)
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
  assert.equal(
    resources.size,
    22,
    'six current3, six retained2, other fixed2 + identity1/OE1/OE2/Connector2',
  )
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
