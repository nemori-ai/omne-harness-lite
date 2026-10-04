// Probe only: native generated code with mechanically copied current exact bodies.
// No product source edits, publishing transaction or performance claim.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const cb = resolve(root, 'packages/core/content-blocks')
const out = resolve(root, 'tmp/test-tiers-mutation/compiler-free-probe')
const require = createRequire(join(cb, 'package.json'))
const ts = require('typescript')
const { Ajv2020, _ } = require('ajv/dist/2020.js')
const standalone = require('ajv/dist/standalone/index.js').default
const N = require('ajv/dist/compile/names.js').default
const { strConcat } = require('ajv/dist/compile/codegen/index.js')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
mkdirSync(join(out, 'node_modules'), { recursive: true })
if (!existsSync(join(out, 'node_modules/ajv')))
  symlinkSync(join(cb, 'node_modules/ajv'), join(out, 'node_modules/ajv'), 'dir')
const compile = (text, name) => ts.transpileModule(text, {
  fileName: name, compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
}).outputText
const jsonText = readFileSync(join(cb, 'src/json.ts'), 'utf8')
writeFileSync(join(out, 'json.mjs'), compile(jsonText, 'json.ts'))
const originalExact = readFileSync(join(cb, 'src/exact-schema.ts'), 'utf8')
const fixed = originalExact.indexOf('// Only fixed dialect inputs live at module scope.')
assert.ok(fixed > 0)
const exactText = originalExact.slice(0, fixed)
  .replace(/^import \{ Ajv2020 \} from 'ajv\/dist\/2020.js'\n/mu, '')
  .replace(/^import \w+ from 'ajv\/dist\/refs\/[^\n]+\n/gmu, '')
  .replace("from './json.ts'", "from './json.mjs'")
const exactJs = compile(exactText, 'exact-runtime.ts')
assert.ok(!exactJs.includes('ajv/'), 'probe helper must not import compiler/meta resources')
writeFileSync(join(out, 'exact-runtime.mjs'), exactJs)
writeFileSync(join(out, 'pattern.mjs'), compile(
  readFileSync(join(cb, 'src/schema-pattern.ts'), 'utf8'), 'schema-pattern.ts'))
const nativeJson = await import(pathToFileURL(join(cb, 'dist/json.js')).href)
const sourceJson = await import(pathToFileURL(join(cb, 'src/json.ts')).href)
const baselineExact = await import(pathToFileURL(join(cb, 'dist/exact-schema.js')).href)
const exact = await import(pathToFileURL(join(out, 'exact-runtime.mjs')).href)
const json = await import(pathToFileURL(join(out, 'json.mjs')).href)
function projection(value, owner) {
  if (owner.LosslessNumber.is(value)) {
    const n = Number(value.source)
    return Number.isFinite(n) ? n : value.source.startsWith('-') ? -Number.MAX_VALUE : Number.MAX_VALUE
  }
  if (Array.isArray(value)) return value.map(item => projection(item, owner))
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projection(item, owner)]))
  return value
}
const helperPath = join(out, 'native-helper.mjs')
writeFileSync(helperPath, [
  "import * as json from './json.mjs';",
  "import { installExactKeywords } from './exact-runtime.mjs';",
  "export { schemaPattern } from './pattern.mjs';",
  'export const keywords = {};',
  'installExactKeywords({ addKeyword: definition => { keywords[definition.keyword] = definition.validate; } });',
  projection.toString(),
  'export function handoff(validator, text) {',
  '  const parsed = json.readJsonStrict(text);',
  '  if ("failed" in parsed) throw new Error("invalid lossless handoff");',
  '  const valid = validator.call({root: parsed.ok}, projection(parsed.ok, json)) === true;',
  '  return { valid, errors: structuredClone(validator.errors) };',
  '}',
].join('\n'))
const captured = []
exact.installExactKeywords({ addKeyword: definition => captured.push(definition) })
assert.equal(captured.length, 16)
function compiler(meta = false, original = false) {
  const ajv = new Ajv2020({
    ...(meta ? { meta: false } : {}), strict: false, allErrors: false,
    ownProperties: true, validateFormats: false, validateSchema: false,
    passContext: true, code: { source: true },
  })
  if (original) baselineExact.installExactKeywords(ajv)
  else for (const def of captured) ajv.addKeyword({
    keyword: def.keyword, schemaType: def.schemaType,
    code(cxt) {
      const fn = cxt.gen.scopeValue('func', {
        ref: def.validate, code: _`require(${helperPath}).keywords[${def.keyword}]`,
      })
      const context = cxt.gen.object([N.instancePath, strConcat(N.instancePath, cxt.it.errorPath)])
      cxt.pass(_`${fn}.call(${N.this}, ${cxt.schemaCode}, ${cxt.data}, undefined, ${context})`)
    },
  })
  return ajv
}
const parse = (owner, text) => {
  const parsed = owner.readJsonStrict(text)
  assert.ok('ok' in parsed)
  return parsed.ok
}
const transform = (owner, implementation, text) =>
  projection(implementation.exactSchema(parse(owner, text)), owner)
const oracleText = readFileSync(join(cb, 'tests/schema-runtime.spec.ts'), 'utf8')
const matrices = [...oracleText.matchAll(/it\.each\((\[[\s\S]*?\]) as const\)/gu)]
  .map(match => runInNewContext(`(${match[1]})`))
const cases = matrices.flatMap(rows => rows.filter(row => Array.isArray(row) && row.length === 3 &&
  typeof row[0] === 'string' && typeof row[1] === 'string' && typeof row[2] === 'boolean'))
const metaCases = matrices.flatMap(rows => rows.filter(row => Array.isArray(row) && row.length === 2 &&
  typeof row[0] === 'string' && typeof row[1] === 'boolean'))
cases.push(
  ['{"type":"object","properties":{"a/b~c":{"type":"array","items":{"minimum":9007199254740993}}}}', '{"a/b~c":[9007199254740992]}', false],
  ['{"type":"object","properties":{"a/b~c":{"type":"array","items":{"minimum":9007199254740993}}}}', '{"a/b~c":[9007199254740993]}', true],
  ['{"type":"object","propertyNames":{"minLength":2}}', '{"x":1}', false],
  ['{"type":"object","propertyNames":{"minLength":2}}', '{"xy":1}', true],
  ['{"$defs":{"bound":{"type":"integer","minimum":9007199254740993}},"type":"object","properties":{"n":{"$ref":"#/$defs/bound"}}}', '{"n":9007199254740992}', false],
  ['{"$defs":{"bound":{"type":"integer","minimum":9007199254740993}},"type":"object","properties":{"n":{"$ref":"#/$defs/bound"}}}', '{"n":9007199254740993}', true],
)
assert.ok(cases.length >= 60 && metaCases.length >= 6)
const generatedCompiler = compiler()
const refs = {}
const baselineValidators = []
for (const [i, [schemaText]] of cases.entries()) {
  const id = `https://probe.invalid/compiler-free/${i}`
  const g = transform(json, exact, schemaText)
  generatedCompiler.addSchema(g, id)
  refs[`Case${i}`] = id
  // Relative refs need the same owner base URI on both sides.
  const b = compiler(false, true)
  b.addSchema(transform(nativeJson, baselineExact, schemaText), id)
  baselineValidators.push(b.getSchema(id))
}
const generatedPath = join(out, 'cases.cjs')
writeFileSync(generatedPath, standalone(generatedCompiler, refs))
const metaCompiler = compiler(true)
const baselineMetaCompiler = compiler(true, true)
for (const file of ['schema.json', 'meta/applicator.json', 'meta/unevaluated.json', 'meta/content.json',
  'meta/core.json', 'meta/format-annotation.json', 'meta/meta-data.json', 'meta/validation.json']) {
  const text = readFileSync(require.resolve(`ajv/dist/refs/json-schema-2020-12/${file}`), 'utf8')
  metaCompiler.addMetaSchema(transform(json, exact, text))
  baselineMetaCompiler.addMetaSchema(transform(nativeJson, baselineExact, text))
}
const metaPath = join(out, 'meta.cjs')
const metaId = 'https://json-schema.org/draft/2020-12/schema'
writeFileSync(metaPath, standalone(metaCompiler, { Meta: metaId }))
const generated = require(generatedPath)
const generatedMeta = require(metaPath).Meta
const baselineMeta = baselineMetaCompiler.getSchema(metaId)
const { handoff } = require(helperPath)
const results = []
for (const [i, [schemaText, inputText, expected]] of cases.entries()) {
  const originalValue = parse(nativeJson, inputText)
  const originalValid = baselineValidators[i].call({ root: originalValue }, projection(originalValue, nativeJson)) === true
  assert.equal(originalValid, expected, `baseline Case${i}`)
  const originalErrors = structuredClone(baselineValidators[i].errors)
  for (const [name, owner] of [['src', sourceJson], ['dist', nativeJson]]) {
    const value = parse(owner, inputText)
    const actual = handoff(generated[`Case${i}`], owner.writeJsonLossless(value))
    assert.equal(actual.valid, expected, `${name} Case${i}`)
    assert.deepEqual(actual.errors, originalErrors, `${name} Case${i} errors`)
    assert.equal(owner.writeJsonLossless(value), inputText)
    assert.equal(owner.writeJsonLossless(parse(owner, schemaText)), schemaText)
    results.push({ identity: name, case: i, expected, ...actual })
  }
}
for (const [text, expected] of metaCases) {
  const value = parse(nativeJson, text)
  const originalValid = baselineMeta.call({ root: value }, projection(value, nativeJson)) === true
  assert.equal(originalValid, expected)
  const originalErrors = structuredClone(baselineMeta.errors)
  for (const owner of [sourceJson, nativeJson]) {
    const actual = handoff(generatedMeta, owner.writeJsonLossless(parse(owner, text)))
    assert.equal(actual.valid, expected)
    assert.deepEqual(actual.errors, originalErrors)
  }
}
// Holding an error reading must remain safe after the next invocation updates the validator.
const failedReading = results.find(item => !item.valid)
const saved = structuredClone(failedReading)
handoff(generated.Case0, '{"n":0}')
assert.deepEqual(failedReading, saved)
// A fresh process consumes helper and generated module without loading Ajv's compiler.
const isolatedScript = join(out, 'isolated-load.cjs')
writeFileSync(isolatedScript, [
  "const Module = require('node:module'); const original = Module._load; const seen = [];",
  "Module._load = function(specifier, ...args) { seen.push(specifier); return original.call(this, specifier, ...args); };",
  `const validators = require(${JSON.stringify(generatedPath)});`,
  `const {handoff} = require(${JSON.stringify(helperPath)});`,
  "const result = handoff(validators.Case0, '1.0000000000000000000001');",
  "const forbidden = seen.filter(s => /ajv.*(?:2020|core|compile|standalone)/u.test(s));",
  "if (forbidden.length) throw new Error(JSON.stringify(forbidden));",
  "console.log(JSON.stringify({result, forbidden, seen}));",
].join('\n'))
const isolated = JSON.parse(execFileSync(process.execPath, [isolatedScript], { encoding: 'utf8' }))
assert.equal(isolated.result.valid, false)
const report = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), node: process.version,
  cases: cases.length, identities: 2, metaCases: metaCases.length, keywords: captured.length,
  ordinaryAndMetaErrorsEqual: true, immediateSnapshot: true, isolated,
  source: { exactSha256: hash(originalExact), jsonSha256: hash(jsonText), oracleSha256: hash(oracleText) },
  artifacts: ['json.mjs','exact-runtime.mjs','pattern.mjs','native-helper.mjs','cases.cjs','meta.cjs','isolated-load.cjs']
    .map(file => ({ file, sha256: hash(readFileSync(join(out, file))), bytes: readFileSync(join(out, file)).length })),
  scope: 'compiler-free mechanically copied helper; 65 exact/error cases in src/dist plus 6 meta cases. No build transaction, actual package subpaths, full graph fixture or performance proof.',
  results,
}
writeFileSync(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, results: undefined, isolated: { forbidden: isolated.forbidden, loaded: isolated.seen.length } }))
