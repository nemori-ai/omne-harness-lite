// Executes resource/definition assembly with recording compiler stubs.
// Captured graphs are construction inputs, never validation/equivalence evidence.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname, relative, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const task = resolve(root, 'tmp/test-tiers-mutation')
const ts = createRequire(resolve(root, 'tools/ts-checks/package.json'))('typescript')
const inventory = JSON.parse(readFileSync(join(task, 'inventory-65.json'), 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const out = join(task, 'captured-graphs-65')
mkdirSync(out, { recursive: true })
const rows = []
for (const row of inventory.rows) {
  const cache = new Map(), graphs = [], inputs = new Map(), skipped = new Set()
  const owner = resolve(root, row.path)
  const jsonModule = resolve(root, 'packages/core/content-blocks/src/json.ts')
  function input(path) {
    const bytes = readFileSync(path)
    inputs.set(path, { path: relative(root, path), bytes: bytes.length, sha256: sha(bytes) })
    return bytes.toString('utf8')
  }
  const describe = value => {
    if (typeof value === 'function') return { functionSource: value.toString() }
    if (value === undefined) return null
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(describe)
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,describe(v)]))
  }
  function graph(kind, options) {
    const record = { ordinal: graphs.length, kind, options: describe(options), keywords: [], resources: [], definitions: [], unvalidatedInvocations: [] }
    graphs.push(record)
    function validation(schema) {
      record.definitions.push({ method: this, schema: describe(schema) })
      const fn = value => { record.unvalidatedInvocations.push(describe(value)); return true }
      fn.errors = null; fn.schema = schema
      return fn
    }
    return {
      addKeyword(definition) { record.keywords.push(typeof definition === 'string' ? definition : {keyword:definition.keyword,schemaType:definition.schemaType,valid:definition.valid,errors:definition.errors}); return this },
      addSchema(resource) { record.resources.push({ meta: false, value: describe(resource) }); return this },
      addMetaSchema(resource) { record.resources.push({ meta: true, value: describe(resource) }); return this },
      getSchema(ref) { return validation.call('getSchema', { $ref: ref }) },
      compile(schema) { return validation.call('compile', schema) },
      compileExact(schema) { return { validate: validation.call('runtime.compile', schema) } },
    }
  }
  function load(path) {
    path = resolve(path)
    if (cache.has(path)) return cache.get(path).exports
    const module = { exports: {} }; cache.set(path, module)
    if (path.endsWith('.json')) { module.exports = JSON.parse(input(path)); return module.exports }
    const original = input(path)
    const text = original.replace(/const require = createRequire\(import\.meta\.url\)\n/gu, '')
      .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(path).href))
    const js = ts.transpileModule(text, { fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, esModuleInterop: true },
    }).outputText
    const requireFrom = createRequire(path)
    function captureRequire(specifier) {
      if (specifier === 'ajv/dist/2020.js') return { Ajv2020: class { constructor(options) { return graph('ordinary-ajv', options) } } }
      if (specifier === '@omne-harness-lite/content-blocks/schema-runtime') return {
        createSchemaRuntime(resources, options) {
          const recorder = graph('exact-runtime', options ?? {})
          resources.forEach(resource => recorder.addSchema(resource))
          return { compile: schema => recorder.compileExact(schema), metaValidate() { throw new Error('meta validation cannot run in graph capture') } }
        },
      }
      if (row.path.includes('/session-tenancy-table/') && ['@omne-harness-lite/identity-values','@omne-harness-lite/storage'].includes(specifier)) { skipped.add(specifier); return {} }
      if (specifier === '@omne-harness-lite/content-blocks') return load(jsonModule)
      if (specifier === '@omne-harness-lite/call-accounts') return load(resolve(root,'packages/core/call-accounts/src/decimal.ts'))
      if (specifier.endsWith('.json') || /\/schema(?:\/.*)?$/u.test(specifier)) return load(requireFrom.resolve(specifier))
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const next = resolve(dirname(path), specifier)
        if (row.path === 'apps/cli/src/tui/forms.ts' && !next.endsWith('.json')) {
          skipped.add(relative(root,next)); return {}
        }
        return load(next)
      }
      return requireFrom(specifier)
    }
    new Function('require','module','exports','__filename','__dirname',js)(captureRequire,module,module.exports,path,dirname(path))
    return module.exports
  }
  let failure
  try {
    const exports = load(owner)
    if (row.path.endsWith('/exact-schema.ts')) exports.createExactMetaValidator()
    // Current lazy ordinary owners permit all finite definitions; record their full owned range.
    if (graphs.length === 1 && graphs[0].kind === 'ordinary-ajv' && graphs[0].definitions.length === 0) {
      const resources = graphs[0].resources.map(item=>item.value)
      const selected = row.path.includes('/governance-center-entry/')
        ? resources.find(item=>typeof item.$id==='string' && item.$id.includes('governance-center-entry.schema.json'))
        : resources[0]
      const names = exports.SCHEMA_DEF_NAMES ?? Object.keys(selected?.$defs ?? {})
      graphs[0].deferredDefinitionRange = names.map(name=>({ name, schema: {$ref:`${selected.$id}#/$defs/${name}`} }))
    }
  } catch (error) { failure = {name:error.name,message:error.message,stack:error.stack} }
  const result = { path: row.path, sourceSha256: row.sourceSha256, inputs:[...inputs.values()], skippedNonInitializationImports:[...skipped], graphs, failure }
  const file = row.path.replaceAll('/','__')+'.json'
  writeFileSync(join(out,file),JSON.stringify(result,null,2)+'\n')
  rows.push({path:row.path,file,graphs:graphs.length,resourceInstances:graphs.reduce((n,g)=>n+g.resources.length,0),definitions:graphs.reduce((n,g)=>n+g.definitions.length+(g.deferredDefinitionRange?.length??0),0),failure})
}
const report = { head: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,
  scope:'Actual initialization/resource assembly with recording compiler stubs. No Ajv validation, native artifact, equivalence or compile-cost claim; CLI forms unvalidated invocation explicitly recorded.',rows }
writeFileSync(join(out,'index.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
if (rows.some(row=>row.failure)) process.exitCode=1
