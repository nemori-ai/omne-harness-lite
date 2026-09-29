import fs from 'node:fs'
import path from 'node:path'
import cp from 'node:child_process'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { pathToFileURL, fileURLToPath } from 'node:url'

const out = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(out, '../../../..')
const sourceCommit = cp
  .execFileSync('git', ['rev-parse', '19a3b968^{commit}'], { cwd: root, encoding: 'utf8' })
  .trim()
const gitBytes = p =>
  cp.execFileSync('git', ['show', `${sourceCommit}:${p}`], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  })
const gitText = p => gitBytes(p).toString('utf8')
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const consumer = path.join(root, 'tmp/model-request-runtime/t26-rolling/e66ddc9d/consumer')
const runtimePath = fileURLToPath(
  import.meta.resolve('@omne-harness-lite/content-blocks/schema-runtime'),
)
const jsonPath = fileURLToPath(import.meta.resolve('@omne-harness-lite/content-blocks'))
const { createSchemaRuntime } = await import(pathToFileURL(runtimePath).href)
const { readJsonStrict } = await import(pathToFileURL(jsonPath).href)
const ts = await import(pathToFileURL(fileURLToPath(import.meta.resolve('typescript'))).href)
const compiler = ts.default
const prior = JSON.parse(fs.readFileSync(path.join(out, 'prior-definition-closure.json'), 'utf8'))
const definitions = new Map()
const sourceHashes = {}
const canonicalChecks = []
const artifacts = path.join(out, 'inputs')
fs.mkdirSync(artifacts, { recursive: true })
function parse(bytes) {
  const read = readJsonStrict(bytes.toString('utf8'))
  assert(!('failed' in read), 'invalid lossless schema JSON')
  assert(
    read.ok && typeof read.ok === 'object' && !Array.isArray(read.ok),
    'schema must be an object',
  )
  return read.ok
}
const allPaths = cp
  .execFileSync('git', ['ls-tree', '-r', '--name-only', sourceCommit, '--', 'packages'], {
    cwd: root,
    encoding: 'utf8',
  })
  .trim()
  .split('\n')
for (const p of allPaths.filter(p => /\/schema\/.+\.json$/.test(p))) {
  const bytes = gitBytes(p),
    resource = parse(bytes)
  if (typeof resource.$id !== 'string') continue
  const existing = definitions.get(resource.$id)
  if (existing)
    assert.equal(existing.sha256, sha(bytes), `duplicate ID with different bytes ${resource.$id}`)
  else definitions.set(resource.$id, { resource, bytes, source: p, sha256: sha(bytes) })
}
function publicNames(pkg) {
  const p = `packages/core/${pkg}/src/schema.ts`,
    source = gitText(p)
  sourceHashes[p] = sha(Buffer.from(source))
  const ast = compiler.createSourceFile(p, source, compiler.ScriptTarget.Latest, true)
  let names
  for (const statement of ast.statements) {
    if (!compiler.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      if (!compiler.isIdentifier(decl.name) || decl.name.text !== 'SCHEMA_DEF_NAMES') continue
      assert(compiler.isCallExpression(decl.initializer), 'non-literal public compiler roots')
      const frozen = decl.initializer
      assert.equal(frozen.expression.getText(ast), 'Object.freeze')
      let array = frozen.arguments[0]
      if (compiler.isAsExpression(array)) array = array.expression
      assert(compiler.isArrayLiteralExpression(array), 'non-literal public compiler roots')
      names = array.elements.map(item => {
        assert(compiler.isStringLiteral(item))
        return item.text
      })
    }
  }
  assert(names && new Set(names).size === names.length, 'public name missing or duplicate')
  return names
}
function pointer(resource, fragment) {
  if (!fragment || fragment === '#') return resource
  assert(fragment.startsWith('#/'), `unsupported non-pointer fragment ${fragment}`)
  let node = resource
  for (const raw of decodeURIComponent(fragment.slice(2)).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    assert(
      node && typeof node === 'object' && Object.hasOwn(node, key),
      `missing pointer ${fragment}`,
    )
    node = node[key]
  }
  return node
}
const constraints = {
  dynamicRefs: [],
  recursiveRefs: [],
  nestedIds: [],
  anchors: [],
  refsInAnnotations: [],
  reachableResources: [],
}
function inspectStructure(record) {
  function walk(v, location, annotation = false, schemaContext = true) {
    if (!v || typeof v !== 'object') return
    if (Object.hasOwn(v, '$dynamicRef'))
      constraints.dynamicRefs.push({ source: record.source, location })
    if (Object.hasOwn(v, '$recursiveRef'))
      constraints.recursiveRefs.push({ source: record.source, location })
    if (location && Object.hasOwn(v, '$id'))
      constraints.nestedIds.push({ source: record.source, location })
    if (Object.hasOwn(v, '$anchor') || Object.hasOwn(v, '$dynamicAnchor'))
      constraints.anchors.push({ source: record.source, location })
    if (annotation && Object.hasOwn(v, '$ref'))
      constraints.refsInAnnotations.push({ source: record.source, location })
    for (const [k, x] of Object.entries(v))
      walk(
        x,
        location + '/' + k,
        annotation || (schemaContext && ['default', 'examples', 'const', 'enum'].includes(k)),
        !schemaContext ||
          !['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'].includes(
            k,
          ),
      )
  }
  walk(record.resource, '')
}
function closure(rootId, names) {
  const visited = new Set(),
    edges = [],
    resources = new Set()
  function visit(uri) {
    if (visited.has(uri)) return
    visited.add(uri)
    const u = new URL(uri),
      fragment = u.hash
    u.hash = ''
    const id = u.href
    const record = definitions.get(id)
    assert(record, `resource unavailable ${id}`)
    resources.add(id)
    function walk(v, location, schemaContext = true) {
      if (!v || typeof v !== 'object') return
      if (schemaContext && Object.hasOwn(v, '$ref')) {
        assert.equal(typeof v.$ref, 'string')
        const next = new URL(v.$ref, id).href
        edges.push({ from: uri, location, ref: v.$ref, to: next })
        visit(next)
      }
      for (const [k, x] of Object.entries(v))
        if (
          k !== '$ref' &&
          !(schemaContext && ['default', 'examples', 'const', 'enum'].includes(k))
        )
          walk(
            x,
            location + '/' + k,
            !schemaContext ||
              ![
                'properties',
                'patternProperties',
                '$defs',
                'definitions',
                'dependentSchemas',
              ].includes(k),
          )
    }
    walk(pointer(record.resource, fragment), fragment)
  }
  for (const name of names) visit(rootId + '#/$defs/' + name)
  return { definitions: [...visited].sort(), resources: [...resources].sort(), edges }
}
// Measurement-only fixtures: detect annotation false edges, arbitrary property names,
// pointer escaping, an unused definition, and a definition-level reference cycle.
const syntheticA = 'https://measurement.invalid/schema/a.json'
const syntheticB = 'https://measurement.invalid/schema/b.json'
definitions.set(syntheticA, {
  resource: {
    $id: syntheticA,
    $defs: {
      Root: {
        type: 'object',
        properties: { default: { $ref: syntheticB + '#/$defs/Shared' } },
        examples: [{ $ref: 'https://measurement.invalid/annotation-not-a-schema.json' }],
        default: { $ref: 'https://measurement.invalid/default-not-a-schema.json' },
        const: { $ref: 'https://measurement.invalid/constant-not-a-schema.json' },
      },
      'a/b~c': { type: 'string' },
      Escaped: { $ref: '#/$defs/a~1b~0c' },
      Unused: { $ref: 'https://measurement.invalid/unused.json' },
    },
  },
})
definitions.set(syntheticB, {
  resource: {
    $id: syntheticB,
    $defs: {
      Shared: { type: 'object', properties: { back: { $ref: syntheticA + '#/$defs/Root' } } },
    },
  },
})
const syntheticClosure = closure(syntheticA, ['Root'])
assert.deepEqual(syntheticClosure.resources, [syntheticA, syntheticB])
assert.equal(syntheticClosure.definitions.length, 2)
assert.equal(closure(syntheticA, ['Escaped']).definitions.length, 2)
assert.throws(() => closure(syntheticA, ['Absent']), /missing pointer/)
assert.throws(() => closure(syntheticA, ['Unused']), /resource unavailable/)
const measurementSelfTests = {
  annotationRefsExcluded: true,
  propertyNamedDefaultTraversed: true,
  JSONPointerEscaping: true,
  unusedDefinitionExcluded: true,
  cycleTerminates: true,
  missingPointerRejected: true,
  missingResourceRejected: true,
}
const graphs = {}
for (const pkg of ['messages', 'model-response', 'arrival-events', 'loop-extension']) {
  const rootSchemaPath = `packages/core/${pkg}/schema/${pkg}.schema.json`
  const schema = parse(gitBytes(rootSchemaPath)),
    names = publicNames(pkg),
    graph = closure(schema.$id, names)
  assert.equal(
    sha(gitBytes(`packages/core/${pkg}/src/schema.ts`)),
    prior.sourceHashes[pkg],
    `prior source changed ${pkg}`,
  )
  assert.deepEqual(names, prior.roots[pkg].publicNames)
  const abbreviated = id => id.split('/spec/')[1]
  assert.deepEqual(
    graph.resources.map(abbreviated).sort(),
    prior.roots[pkg].resources.slice().sort(),
    `independent closure differs ${pkg}`,
  )
  graphs[pkg] = { root: schema.$id, names, ...graph }
}
const combined = new Set(Object.values(graphs).flatMap(g => g.resources))
for (const id of combined) {
  const record = definitions.get(id)
  inspectStructure(record)
  const canonicalPath = '.meta_harness/design/spec/' + id.split('/spec/')[1]
  const canonical = gitBytes(canonicalPath)
  assert.equal(
    sha(record.bytes),
    sha(canonical),
    `installed-source/canonical resource differs ${id}`,
  )
  canonicalChecks.push({
    id,
    source: record.source,
    sourceSha256: record.sha256,
    canonicalPath,
    canonicalSha256: sha(canonical),
  })
  const dest = path.join(artifacts, id.split('/spec/')[1])
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, record.bytes)
}
constraints.reachableResources = [...combined].sort()
for (const key of ['dynamicRefs', 'recursiveRefs', 'nestedIds', 'anchors', 'refsInAnnotations'])
  assert.equal(constraints[key].length, 0, `closure assumptions invalid: ${key}`)
fs.writeFileSync(
  path.join(out, 'closure.json'),
  JSON.stringify({ sourceCommit, graphs, sourceHashes, canonicalChecks, constraints }, null, 2) +
    '\n',
)
const results = {
  sourceCommit,
  measurementSelfTests,
  tool: {
    node: process.version,
    typescript: compiler.version,
    packageRuntime: runtimePath,
    runtimeSHA256: sha(fs.readFileSync(runtimePath)),
  },
  positive: [],
  negative: [],
  privateMemberPositive: [],
}
for (const pkg of ['messages', 'model-response']) {
  const graph = graphs[pkg],
    resources = graph.resources.map(id => definitions.get(id).resource)
  assert.equal(resources.length, 9)
  const runtime = createSchemaRuntime(resources)
  for (const name of graph.names) {
    const validator = runtime.compile({ $ref: graph.root + '#/$defs/' + name })
    assert.equal(typeof validator.validate, 'function')
    results.positive.push({ pkg, name, resourceCount: resources.length, compiled: true })
  }
  console.log(
    `${pkg}: all ${graph.names.length} public definitions compiled with exact ${resources.length} resources`,
    true,
  )
  for (const omitted of graph.resources) {
    const runtime = createSchemaRuntime(
      graph.resources.filter(id => id !== omitted).map(id => definitions.get(id).resource),
    )
    let witness
    for (const name of graph.names) {
      try {
        runtime.compile({ $ref: graph.root + '#/$defs/' + name })
      } catch (error) {
        assert(error instanceof Error)
        assert.equal(
          error.name,
          'Error',
          `non-reference compile failure for ${omitted}: ${error.name}`,
        )
        assert.equal(error.missingSchema, omitted, `wrong causal absent resource: ${error.message}`)
        witness = {
          pkg,
          omitted,
          name,
          exception: error.constructor.name,
          missingSchema: error.missingSchema,
          missingRef: error.missingRef,
          message: error.message,
        }
        break
      }
    }
    assert(witness, `required resource removal falsely succeeded ${omitted}`)
    results.negative.push(witness)
    console.log(`${pkg}: omitted ${omitted.split('/spec/')[1]} rejected at ${witness.name}`)
  }
  if (pkg === 'model-response') {
    const original = definitions.get(graph.root).resource
    const { allOf: responseConditions, ...responseMembers } = original.$defs.ModelResponse
    const { allOf: pendingConditions, ...pendingMembers } = original.$defs.PendingModelResponse
    const { dependentRequired: failureCondition, ...failureMembers } = original.$defs.Failure
    const memberId = graph.root + '?stage=members'
    const memberSchema = {
      ...original,
      $id: memberId,
      $defs: {
        ...original.$defs,
        ModelResponse: responseMembers,
        PendingModelResponse: pendingMembers,
        Failure: failureMembers,
      },
    }
    const memberRuntime = createSchemaRuntime([...resources, memberSchema])
    for (const name of ['ModelResponse', 'PendingModelResponse']) {
      assert.equal(
        typeof memberRuntime.compile({ $ref: memberId + '#/$defs/' + name }).validate,
        'function',
      )
      results.privateMemberPositive.push({
        name,
        compiled: true,
        canonicalResources: 9,
        derivedPrivateResources: 1,
      })
    }
  }
}
assert.equal(results.positive.length, 75)
assert.equal(results.negative.length, 18)
fs.writeFileSync(path.join(out, 'execution-results.json'), JSON.stringify(results, null, 2) + '\n')
console.log(
  JSON.stringify({
    sourceCommit,
    publicDefinitionPositive: 75,
    necessaryResourceRemovalNegative: 18,
    MRPrivateStagePositive: 2,
    runtime: 'e66 independently installed public schema-runtime, source unchanged at19a',
    scope: 'finite schema compilation only; production registration and runtime not changed',
  }),
)
