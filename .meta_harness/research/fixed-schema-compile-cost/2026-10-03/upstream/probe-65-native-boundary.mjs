// Narrow probe of #65 r2's identity handoff, not production precompilation or a performance reading.
// Reuses current CB oracle literals and exact bodies; native helper still imports today's compiler.
// Run directly from this worktree with one CPU; the owner forbids test-slot admission for this session.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'

const root = process.cwd()
const cb = resolve(root, 'packages/core/content-blocks')
const out = resolve(root, 'tmp/test-tiers-mutation/native-boundary-probe')
mkdirSync(join(out, 'node_modules'), { recursive: true })
if (!existsSync(join(out, 'node_modules/ajv')))
  symlinkSync(resolve(cb, 'node_modules/ajv'), join(out, 'node_modules/ajv'), 'dir')
const require = createRequire(join(cb, 'package.json'))
const { Ajv2020, _ } = require('ajv/dist/2020.js')
const standaloneCode = require('ajv/dist/standalone/index.js').default
const N = require('ajv/dist/compile/names.js').default
const { strConcat } = require('ajv/dist/compile/codegen/index.js')
const load = file => import(pathToFileURL(file).href)
const sourceJson = await load(join(cb, 'src/json.ts'))
const nativeJson = await load(join(cb, 'dist/json.js'))
const exact = await load(join(cb, 'dist/exact-schema.js'))
const { createSchemaRuntime } = await load(join(cb, 'src/schema-runtime.ts'))
const parse = (json, text) => {
  const result = json.readJsonStrict(text)
  assert.ok('ok' in result)
  return result.ok
}
function projection(value, json) {
  if (json.LosslessNumber.is(value)) {
    const n = Number(value.source)
    return Number.isFinite(n) ? n : value.source.startsWith('-') ? -Number.MAX_VALUE : Number.MAX_VALUE
  }
  if (Array.isArray(value)) return value.map(item => projection(item, json))
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projection(item, json)]))
  return value
}

const helperPath = join(out, 'native-helper.mjs')
writeFileSync(helperPath, [
  `import * as json from ${JSON.stringify(pathToFileURL(join(cb, 'dist/json.js')).href)};`,
  `import { installExactKeywords } from ${JSON.stringify(pathToFileURL(join(cb, 'dist/exact-schema.js')).href)};`,
  'export const keywords = {};',
  'installExactKeywords({ addKeyword: def => { keywords[def.keyword] = def.validate; } });',
  projection.toString(),
  'export function handoff(validator, text) {',
  '  const read = json.readJsonStrict(text);',
  '  if ("failed" in read) throw new Error("internal lossless handoff failed");',
  '  const valid = validator.call({ root: read.ok }, projection(read.ok, json)) === true;',
  '  return { valid, errors: structuredClone(validator.errors) };',
  '}',
].join('\n'))
const captured = []
exact.installExactKeywords({ addKeyword: def => captured.push(def) })
function ajv(meta = false) {
  const compiler = new Ajv2020({
    ...(meta ? { meta: false } : {}),
    strict: false, allErrors: false, ownProperties: true, validateFormats: false,
    validateSchema: false, passContext: true, code: { source: true },
  })
  for (const def of captured) compiler.addKeyword({
    keyword: def.keyword,
    schemaType: def.schemaType,
    code(cxt) {
      const fn = cxt.gen.scopeValue('func', {
        ref: def.validate,
        code: _`require(${helperPath}).keywords[${def.keyword}]`,
      })
      const context = cxt.gen.object([N.instancePath, strConcat(N.instancePath, cxt.it.errorPath)])
      cxt.pass(_`${fn}.call(${N.this}, ${cxt.schemaCode}, ${cxt.data}, undefined, ${context})`)
    },
  })
  return compiler
}

const oracleSource = readFileSync(join(cb, 'tests/schema-runtime.spec.ts'), 'utf8')
const matrices = [...oracleSource.matchAll(/it\.each\((\[[\s\S]*?\]) as const\)/gu)]
  .map(match => runInNewContext(`(${match[1]})`))
const cases = matrices.flatMap(rows => rows.filter(row =>
  Array.isArray(row) && row.length === 3 && typeof row[0] === 'string' && typeof row[1] === 'string' && typeof row[2] === 'boolean'))
const metaCases = matrices.flatMap(rows => rows.filter(row =>
  Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && typeof row[1] === 'boolean'))
assert.ok(cases.length >= 30 && metaCases.length >= 6)
cases.push(
  ['{"type":"object","properties":{"a/b~c":{"type":"array","items":{"minimum":9007199254740993}}}}', '{"a/b~c":[9007199254740992]}', false],
  ['{"type":"object","properties":{"a/b~c":{"type":"array","items":{"minimum":9007199254740993}}}}', '{"a/b~c":[9007199254740993]}', true],
)
const compiler = ajv()
const refs = {}
for (const [i, [schema]] of cases.entries()) {
  const id = `https://probe.invalid/r2/${i}`
  compiler.addSchema(projection(exact.exactSchema(parse(nativeJson, schema)), nativeJson), id)
  refs[`Case${i}`] = id
}
writeFileSync(join(out, 'cases.cjs'), standaloneCode(compiler, refs))
const metaCompiler = ajv(true)
const metaFiles = ['schema.json', 'meta/applicator.json', 'meta/unevaluated.json', 'meta/content.json', 'meta/core.json', 'meta/format-annotation.json', 'meta/meta-data.json', 'meta/validation.json']
for (const file of metaFiles) {
  const text = readFileSync(require.resolve(`ajv/dist/refs/json-schema-2020-12/${file}`), 'utf8')
  metaCompiler.addMetaSchema(exact.exactSchema(parse(nativeJson, text)))
}
writeFileSync(join(out, 'meta.cjs'), standaloneCode(metaCompiler, { Meta: 'https://json-schema.org/draft/2020-12/schema' }))
const generated = require(join(out, 'cases.cjs'))
const generatedMeta = require(join(out, 'meta.cjs')).Meta
const { handoff } = require(helperPath)
const runtime = createSchemaRuntime([])
const rawResults = cases.slice(0, 2).map(([, text], i) => {
  const rootValue = parse(sourceJson, text)
  return generated[`Case${i}`].call({ root: rootValue }, projection(rootValue, sourceJson))
})
assert.deepEqual(rawResults, [true, false], 'old raw-root handoff must reproduce both B1 failures')
const results = []
for (const [i, [schemaText, inputText, expected]] of cases.entries()) {
  const schema = parse(sourceJson, schemaText)
  const sourceValue = parse(sourceJson, inputText)
  const reference = runtime.compile(schema).validate(sourceValue)
  assert.equal(reference, expected)
  for (const [name, json] of [['src', sourceJson], ['dist', nativeJson]]) {
    const value = parse(json, inputText)
    const actual = handoff(generated[`Case${i}`], json.writeJsonLossless(value))
    assert.equal(actual.valid, expected, `${name} Case${i}`)
    assert.equal(json.writeJsonLossless(value), inputText)
    results.push({ name, case: i, expected, ...actual })
  }
  assert.equal(sourceJson.writeJsonLossless(schema), schemaText)
}
for (const [text, expected] of metaCases) {
  assert.equal(runtime.metaValidate(parse(sourceJson, text)), expected)
  for (const json of [sourceJson, nativeJson])
    assert.equal(handoff(generatedMeta, json.writeJsonLossless(parse(json, text))).valid, expected)
}
const report = {
  head: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, oldRawRoot: rawResults,
  cases: cases.length, twoDomainCases: results.length, metaCases: metaCases.length,
  scope: 'identity handoff only; no import-cost, compiler-free helper, or build-failure claim',
  results,
}
writeFileSync(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, results: undefined }))
