import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repository = fileURLToPath(new URL('..', import.meta.url))
// Extend only after the representative shared gate has released further owners.
const owners = new Set([
  'packages/core/identity-values',
  'packages/core/content-blocks',
  'packages/core/messages',
])
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const snapshot = value => {
  if (typeof value === 'function')
    return { code: value.code ?? null, implementation: value.toString() }
  if (Array.isArray(value)) return value.map(snapshot)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, snapshot(item)]))
  return value
}
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry =>
      entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)],
    )
}
function checkOwner(owner) {
  const path = relative(repository, owner).split('\\').join('/')
  if (!owners.has(path)) throw new Error(`fixed Schema build is not released for ${path}`)
  return path
}
function compilerContext(owner, graphs) {
  const require = createRequire(join(owner, 'package.json'))
  if (graphs.some(graph => graph.kind !== 'ordinary')) {
    const codegenPath = require.resolve('@omne-harness-lite/content-blocks/schema-codegen')
    return { require: createRequire(codegenPath), codegenPath }
  }
  return { require, codegenPath: undefined }
}

/** Development-only freshness reader: never used by product validation. */
export function fixedSchemaFingerprint(owner, graphs) {
  checkOwner(owner)
  const require = createRequire(join(owner, 'package.json'))
  const compiler = compilerContext(owner, graphs)
  const sources = Object.fromEntries(
    filesIn(join(owner, 'src'))
      .filter(path => path.endsWith('.ts'))
      .map(path => [relative(owner, path), sha256(readFileSync(path))]),
  )
  const resources = graphs.flatMap(graph =>
    (graph.resourceSpecifiers ?? []).map(specifier => {
      const resolver = specifier.startsWith('ajv/') ? compiler.require : require
      return {
        graph: graph.name,
        specifier,
        sha256: sha256(readFileSync(resolver.resolve(specifier))),
      }
    }),
  )
  let helper = null
  if (compiler.codegenPath !== undefined) {
    const helperPath = compiler.require.resolve('@omne-harness-lite/content-blocks/code-runtime')
    const helperOwner = dirname(dirname(helperPath))
    helper = {
      package: '@omne-harness-lite/content-blocks',
      packageJsonSha256: sha256(readFileSync(join(helperOwner, 'package.json'))),
      subpath: 'code-runtime',
      resolvedWithinPackage: relative(helperOwner, helperPath),
      generatorResolvedWithinPackage: relative(helperOwner, compiler.codegenPath),
      sourceFiles: Object.fromEntries(
        filesIn(join(helperOwner, 'src'))
          .filter(path => path.endsWith('.ts'))
          .map(path => [relative(helperOwner, path), sha256(readFileSync(path))]),
      ),
      emittedFiles: Object.fromEntries(
        filesIn(join(helperOwner, 'dist'))
          .filter(path => path.endsWith('.js'))
          .map(path => [relative(helperOwner, path), sha256(readFileSync(path))]),
      ),
    }
  }
  const exactOptions = {
    strict: false,
    allErrors: false,
    ownProperties: true,
    validateFormats: false,
    validateSchema: false,
    passContext: true,
    code: { source: true, regExp: '@omne-harness-lite/content-blocks/code-runtime#schemaPattern' },
  }
  const input = {
    package: JSON.parse(readFileSync(join(owner, 'package.json'), 'utf8')).name,
    packageJsonSha256: sha256(readFileSync(join(owner, 'package.json'))),
    driverSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    ajvVersion: JSON.parse(readFileSync(compiler.require.resolve('ajv/package.json'), 'utf8'))
      .version,
    sources,
    resources,
    helper,
    graphs: graphs.map(graph => ({
      name: graph.name,
      kind: graph.kind,
      options:
        graph.kind === 'ordinary'
          ? snapshot({ ...graph.options, code: { ...graph.options?.code, source: true } })
          : { ...exactOptions, ...(graph.kind === 'meta' ? { meta: false } : {}) },
      keywords:
        graph.kind === 'ordinary'
          ? snapshot(graph.keywords ?? [])
          : [
              'exact_minLength',
              'exact_maxLength',
              'exact_minItems',
              'exact_maxItems',
              'exact_minProperties',
              'exact_maxProperties',
              'exact_uniqueItems',
              'exact_type',
              'exact_minimum',
              'exact_maximum',
              'exact_exclusiveMinimum',
              'exact_exclusiveMaximum',
              'exact_multipleOf',
              'exact_integer',
              'exact_const',
              'exact_enum',
            ],
      resources: snapshot(graph.resources),
      definitions: snapshot(graph.definitions),
    })),
  }
  return { sha256: sha256(JSON.stringify(input)), input }
}

function ordinaryModule(owner, graph) {
  const require = createRequire(join(owner, 'package.json'))
  const { Ajv2020 } = require('ajv/dist/2020.js')
  const { default: standalone } = require('ajv/dist/standalone/index.js')
  const ajv = new Ajv2020({ ...graph.options, code: { ...graph.options?.code, source: true } })
  for (const keyword of graph.keywords ?? []) ajv.addKeyword(keyword)
  for (const resource of graph.resources) ajv.addSchema(resource)
  const names = Object.create(null)
  for (const definition of graph.definitions) {
    if (!definition.name || Object.hasOwn(names, definition.name))
      throw new TypeError('fixed Schema export names must be non-empty and unique')
    if (definition.method === 'getSchema') {
      const validator = ajv.getSchema(definition.schema)
      if (validator === undefined) throw new Error(`missing Schema definition: ${definition.name}`)
      if (validator.$async === true)
        throw new TypeError('asynchronous fixed Schemas are unsupported')
      names[definition.name] = definition.schema
    } else if (definition.method === 'compile') {
      const validator = ajv.compile(definition.schema)
      if (validator.$async === true)
        throw new TypeError('asynchronous fixed Schemas are unsupported')
      const key = `urn:omne:fixed-definition:${encodeURIComponent(definition.name)}`
      ajv.addSchema(definition.schema, key)
      names[definition.name] = key
    } else throw new TypeError(`unknown fixed Schema request method: ${definition.method}`)
  }
  return '"use strict";\nexports = module.exports = Object.create(null);\n' + standalone(ajv, names)
}
function cleanup(owner) {
  const errors = []
  for (const directory of ['dist', 'generated']) {
    try {
      rmSync(join(owner, directory), { recursive: true, force: true })
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'fixed Schema output cleanup failed')
}

/** One owner transaction, with no old-output fallback and no runtime caller cache. */
export async function buildFixedSchemas(owner) {
  owner = resolve(owner)
  checkOwner(owner)
  try {
    cleanup(owner)
    const require = createRequire(join(owner, 'package.json'))
    execFileSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
      { cwd: owner, stdio: 'inherit' },
    )
    const { schemaGraphs: graphs } = await import(
      pathToFileURL(join(owner, 'dist/schema-inputs.js')).href
    )
    if (!Array.isArray(graphs) || graphs.length === 0)
      throw new TypeError('fixed Schema owner has no graphs')
    const compiler = compilerContext(owner, graphs)
    const codegen =
      compiler.codegenPath === undefined ? undefined : compiler.require(compiler.codegenPath)
    mkdirSync(join(owner, 'generated'))
    const names = new Set()
    const outputs = []
    for (const graph of graphs) {
      if (!/^[A-Za-z0-9_-]+$/u.test(graph.name) || names.has(graph.name))
        throw new TypeError('fixed Schema graph names must be safe and unique')
      names.add(graph.name)
      let source
      if (graph.kind === 'ordinary') source = ordinaryModule(owner, graph)
      else if (graph.kind === 'exact') {
        if (graph.definitions.some(definition => definition.method !== 'compile'))
          throw new TypeError('exact graph requires original compile requests')
        source = codegen.generateSchemaModule({
          resources: graph.resources,
          definitions: graph.definitions,
        })
      } else if (graph.kind === 'meta') source = codegen.generateMetaModule()
      else throw new TypeError(`unknown fixed Schema graph kind: ${graph.kind}`)
      writeFileSync(join(owner, 'generated', `${graph.name}.cjs`), source)
      outputs.push({ name: graph.name, sha256: sha256(source) })
    }
    const fingerprint = fixedSchemaFingerprint(owner, graphs)
    writeFileSync(
      join(owner, 'generated/manifest.json'),
      JSON.stringify({ ...fingerprint, outputs }, null, 2) + '\n',
    )
    console.log(`built ${fingerprint.input.package}: ${outputs.length} fixed Schema graphs`)
  } catch (error) {
    try {
      cleanup(owner)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'fixed Schema build and cleanup failed')
    }
    throw error
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildFixedSchemas(process.cwd())
