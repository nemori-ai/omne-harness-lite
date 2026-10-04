import { expect, test } from 'vitest'
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { modelCredentialBoundary } from '../src/index.ts'
import { collectRepositorySources, REPOSITORY_RULES } from '../src/repository.ts'

const bootstrap = 'examples/model-invocation-minimal-demo/src/bootstrap.ts'
const p1r = 'packages/model/model-profile-directory/src/plugin.ts'
const ccl = 'packages/infra/credential-custodian-local/src/model-replica.ts'
const imports = `import { createCredentialBindingReader as makeReader } from '@omne-harness-lite/model-profile-directory/tx-reads';
import { createModelReplicaCustodian as makeReplica, type ModelReplicaCustodian } from '@omne-harness-lite/credential-custodian-local/model-replica';
import { localCredentialLookupPlugin as lookup } from '@omne-harness-lite/model-profile-directory/plugin';`
const app = (body: string) => `${imports}
export function createAcceptanceApplication() {
 let replica: ModelReplicaCustodian | undefined;
 async function start() { const reader = makeReader(storage); replica = await makeReplica({ readCredentialBindingIn: reader }); ctx.plugin(lookup, { readBoundReplicaIn: replica.readBoundReplicaIn }); }
 ${body}
}`
const check = (text: string, path = bootstrap) => modelCredentialBoundary.check([{ path, text }])
const valid = app(
  'function publishCredential() { return replica.storeBoundReplica(input); } async function closeResources() { await replica?.close(); }',
)

test('natural trusted construction, transfer, publication and cleanup are separate permissions', () =>
  expect(check(valid)).toEqual([]))
test.each([
  'examples/model-invocation-minimal-demo/src/bootstrap.ts',
  'model-invocation-minimal-demo/src/bootstrap.ts',
])('app-root and repository paths %s', path => expect(check(valid, path)).toEqual([]))
test('namespace, literal computed members, destructuring and ordinary aliases keep the same permissions', () => {
  const text = `import * as d from '@omne-harness-lite/model-profile-directory/tx-reads'; import * as c from '@omne-harness-lite/credential-custodian-local/model-replica'; import * as plugins from '@omne-harness-lite/model-profile-directory/plugin';
 export function createAcceptanceApplication() {
 let replica;
 async function start() { const { ['createCredentialBindingReader']: f } = d; const alias = f; const reader = alias(storage); const reader2 = reader; const g = c['createModelReplicaCustodian']; replica = await g({readCredentialBindingIn: reader2}); const { readBoundReplicaIn: borrow } = replica; const config = {readBoundReplicaIn: borrow}; ctx.plugin(plugins.localCredentialLookupPlugin, config); }
 function publishCredential() { const {storeBoundReplica: save} = replica; return save(input); }
 async function closeResources() { const end = replica['close']; await end(); }
 }`
  expect(check(text)).toEqual([])
})
test('local lookup owns reader execution and the borrowed read, including its apply configuration', () => {
  const text = `import {createCredentialBindingReader} from './tx-reads.ts'; export const localCredentialLookupPlugin = definePlugin({ async apply(ctx, config) { const reader = createCredentialBindingReader(storage); await reader(unit, tenant); await config.readBoundReplicaIn(unit, tenant, ref); } });`
  expect(check(text, p1r)).toEqual([])
})
test('CCL receives a reader dependency and may execute it without reverse imports', () => {
  expect(
    check(
      `import type {ModelReplicaOptions} from './types.ts'; export async function createModelReplicaCustodian(options: ModelReplicaOptions) { const read = options.readCredentialBindingIn; await read(unit, tenant); }`,
      ccl,
    ),
  ).toEqual([])
})
test('unrelated close methods and same-spelled unrelated classes are not credential closures', () => {
  expect(
    check(
      `class ModelReplicaCustodian { close() {} } const unrelated: ModelReplicaCustodian = new ModelReplicaCustodian(); unrelated.close(); socket.close();`,
      'packages/model/other/src/index.ts',
    ),
  ).toEqual([])
})
test('test modules are not product consumers', () =>
  expect(
    check(
      `${imports} const reader=makeReader(storage); reader(unit,tenant);`,
      'packages/model/example/tests/fixture.spec.ts',
    ),
  ).toEqual([]))

test.each([
  [
    'bootstrap reader execution',
    app('function wrong() { const reader=makeReader(storage); reader(unit, tenant); }'),
  ],
  [
    'reader execution inside allowed start',
    valid.replace(
      'replica = await makeReplica',
      'await reader(unit, tenant); replica = await makeReplica',
    ),
  ],
  [
    'read body inside bootstrap',
    app('function startReading() { return replica.readBoundReplicaIn(unit, tenant, ref); }'),
  ],
  [
    'read body inside start',
    valid.replace(
      'const reader = makeReader(storage);',
      'const reader = makeReader(storage); await replica.readBoundReplicaIn(unit, tenant, ref);',
    ),
  ],
  ['borrowed write closes', app('function publishCredential() { return replica.close(); }')],
  ['wrong cleanup name', app('function release() { return replica.close(); }')],
  [
    'store in wrong function',
    app('function ordinary() { return replica.storeBoundReplica(input); }'),
  ],
  ['reader return', valid.replace('ctx.plugin(lookup,', 'return reader; ctx.plugin(lookup,')],
  ['replica return', app('return replica;')],
  [
    'alias callback escape',
    valid.replace('ctx.plugin(lookup,', 'register(reader); ctx.plugin(lookup,'),
  ],
  [
    'close transfer to borrower',
    valid.replace(
      '{ readBoundReplicaIn: replica.readBoundReplicaIn }',
      '{ readBoundReplicaIn: replica.readBoundReplicaIn, close: replica.close }',
    ),
  ],
  [
    'reader hidden in wrong configuration property',
    valid.replace('{ readCredentialBindingIn: reader }', '{ other: reader }'),
  ],
  [
    'read closure passed to unknown loader',
    valid.replace('ctx.plugin(lookup,', 'unknownLoader(lookup,'),
  ],
  [
    'literal computed reader execution',
    valid.replace('ctx.plugin(lookup,', "reader['call'](null, unit, tenant); ctx.plugin(lookup,"),
  ],
  ['dynamic computed member', app('function closeResources() { return replica[key](); }')],
  [
    'array escape',
    valid.replace(
      'ctx.plugin(lookup,',
      'const hidden = [reader]; consume(hidden); ctx.plugin(lookup,',
    ),
  ],
  [
    'closure returned from callback',
    valid.replace('ctx.plugin(lookup,', 'consume(() => reader); ctx.plugin(lookup,'),
  ],
  [
    'object assignment escape',
    valid.replace('ctx.plugin(lookup,', 'globalThis.reader=reader; ctx.plugin(lookup,'),
  ],
  ['local reexport', `${imports} export {makeReader};`],
  ['exported alias', `${imports} export const readerFactory = makeReader;`],
  [
    'namespace reexport',
    `import * as ns from '@omne-harness-lite/model-profile-directory/tx-reads'; export { ns };`,
  ],
  [
    'direct reexport',
    `export {createCredentialBindingReader} from '@omne-harness-lite/model-profile-directory/tx-reads';`,
  ],
  [
    'dynamic import',
    `export function createAcceptanceApplication() { async function start() { const d = await import('@omne-harness-lite/model-profile-directory/tx-reads'); d.createCredentialBindingReader(storage); } }`,
  ],
  ['require', `const d = require('@omne-harness-lite/model-profile-directory/tx-reads');`],
  [
    'removed semantic outer function',
    valid.replace('createAcceptanceApplication', 'otherApplication'),
  ],
  ['renamed semantic start', valid.replace('function start()', 'function otherStart()')],
])('rejects %s', (_name, text) => expect(check(text)).not.toEqual([]))

test.each([
  `import { createModelReplicaCustodian } from '@omne-harness-lite/credential-custodian-local/model-replica'; const replica=createModelReplicaCustodian(config);`,
  `import type { ModelReplicaCustodian as Replica } from '@omne-harness-lite/credential-custodian-local/model-replica'; const replica: Replica = supplied; replica.close();`,
  `import type {ReadBoundReplicaIn} from '@omne-harness-lite/model-profile-directory/tx-reads'; const read: ReadBoundReplicaIn = supplied; read(unit,tenant,ref);`,
])('ordinary product modules cannot import or consume restricted values', text =>
  expect(check(text, 'packages/model/model-request-runtime-local/src/runtime.ts')).not.toEqual([]),
)
test.each([
  `import type {ModelReplicaCustodian} from '@omne-harness-lite/credential-custodian-local/model-replica'; export const localCredentialLookupPlugin = definePlugin({ async apply(ctx, config) { const replica: ModelReplicaCustodian = supplied; await replica.close(); } });`,
  `import {createModelReplicaCustodian} from '@omne-harness-lite/credential-custodian-local/model-replica'; export const localCredentialLookupPlugin = definePlugin({ async apply() { await createModelReplicaCustodian(options); } });`,
])('P1r cannot construct or close the borrowed component', text =>
  expect(check(text, p1r)).not.toEqual([]),
)
test.each([
  `import {createCredentialBindingReader} from '@omne-harness-lite/model-profile-directory/tx-reads';`,
  `import * as renamed from '@omne-harness-lite/model-profile-directory/tx-reads';`,
  `const reader = await import('@omne-harness-lite/model-profile-directory/tx-reads');`,
  `const reader = require('@omne-harness-lite/model-profile-directory/tx-reads');`,
])('CCL cannot reverse import directory', text => expect(check(text, ccl)).not.toEqual([]))
test('TS-resolved aliases do not evade forbidden imports', () => {
  expect(
    modelCredentialBoundary.check([
      {
        path: ccl,
        text: "import {createCredentialBindingReader as renamed} from '@readerAlias';",
        resolvedModules: {
          '@readerAlias': 'packages/model/model-profile-directory/src/tx-reads.ts',
        },
      },
    ]),
  ).not.toEqual([])
})
test('reports the offending call line', () => {
  const text = app('function closeResources() {\n replica.readBoundReplicaIn(unit,tenant,ref);\n}')
  const line =
    text.split('\n').findIndex(row => row.includes(' replica.readBoundReplicaIn(unit')) + 1
  expect(
    check(text).some(
      violation => violation.line === line && violation.message.includes('execution'),
    ),
  ).toBe(true)
})
test('lexical shadowing preserves unrelated resources', () => {
  expect(
    check(
      valid.replace('await replica?.close();', 'const replica = socket; await replica.close();'),
    ),
  ).toEqual([])
})
test('actual repository collector resolves an alias and installs the repository guard', () => {
  const root = mkdtempSync(join(tmpdir(), 'omne-model-credential-rule-'))
  try {
    const directory = join(root, 'packages/model/model-profile-directory/src')
    const source = join(root, 'examples/model-invocation-minimal-demo/src')
    mkdirSync(directory, { recursive: true })
    mkdirSync(source, { recursive: true })
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          paths: { '@reader': ['packages/model/model-profile-directory/src/tx-reads.ts'] },
        },
      }),
    )
    writeFileSync(
      join(directory, 'tx-reads.ts'),
      'export const createCredentialBindingReader = () => () => undefined;',
    )
    writeFileSync(
      join(source, 'bootstrap.ts'),
      "import {createCredentialBindingReader} from '@reader'; export function createAcceptanceApplication() { async function start() { const reader=createCredentialBindingReader(storage); reader(unit,tenant); } }",
    )
    const sources = collectRepositorySources(root)
    expect(sources.find(file => file.path === bootstrap)?.resolvedModules?.['@reader']).toBe(
      'packages/model/model-profile-directory/src/tx-reads.ts',
    )
    expect(REPOSITORY_RULES).toContain(modelCredentialBoundary)
    expect(
      modelCredentialBoundary
        .check(sources)
        .some(violation => violation.message.includes('binding-reader execution')),
    ).toBe(true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test.each([
  [
    'unknown assignment',
    valid.replace('ctx.plugin(lookup,', 'outside = reader; ctx.plugin(lookup,'),
  ],
  [
    'new constructor escape',
    valid.replace('ctx.plugin(lookup,', 'new Container(reader); ctx.plugin(lookup,'),
  ],
  ['throw escape', valid.replace('ctx.plugin(lookup,', 'throw reader; ctx.plugin(lookup,')],
  [
    'second construction',
    valid.replace(
      'ctx.plugin(lookup,',
      'await makeReplica({readCredentialBindingIn:reader}); ctx.plugin(lookup,',
    ),
  ],
  [
    'later exported assignment',
    `${imports} export let escaped; export function createAcceptanceApplication() { async function start() { escaped=makeReader(storage); } }`,
  ],
])('additional unknown escape: %s', (_name, text) => expect(check(text)).not.toEqual([]))
test('P1r configuration execution outside its semantic plugin is rejected', () =>
  expect(
    check(
      `import type {LocalCredentialLookupConfig} from './types.ts'; function other(config: LocalCredentialLookupConfig) { return config.readBoundReplicaIn(unit,tenant,ref); }`,
      p1r,
    ),
  ).not.toEqual([]))
test('CCL options cannot be handed to an unknown recipient', () =>
  expect(
    check(
      `import type {ModelReplicaOptions} from './types.ts'; export function createModelReplicaCustodian(options: ModelReplicaOptions) { consume(options); }`,
      ccl,
    ),
  ).not.toEqual([]))
test('aggregate alias cycles stay bounded and retain the escape oracle', () =>
  expect(
    check(
      valid.replace(
        'ctx.plugin(lookup,',
        'let aggregate=reader; aggregate={deep:aggregate}; consume(aggregate); ctx.plugin(lookup,',
      ),
    ),
  ).not.toEqual([]))

test('CCL publishes the three owned methods only at its component return', () =>
  expect(
    check(
      `export async function createModelReplicaCustodian(options: ModelReplicaOptions) { function storeBoundReplica() {} function readBoundReplicaIn() {} function close() {} return {storeBoundReplica,readBoundReplicaIn,close}; }`,
      ccl,
    ),
  ).toEqual([]))
test('CCL cannot register an owned restricted read or close with an unknown recipient', () =>
  expect(
    check(
      `export async function createModelReplicaCustodian(options: ModelReplicaOptions) { function close() {} register(close); }`,
      ccl,
    ),
  ).not.toEqual([]))

test('array destructuring retains restricted closure execution permissions', () =>
  expect(
    check(
      valid.replace(
        'ctx.plugin(lookup,',
        'const arr=[reader]; const [alias]=arr; alias(unit,tenant); ctx.plugin(lookup,',
      ),
    ).some(v => v.message.includes('binding-reader execution')),
  ).toBe(true))
test('CCL cannot expose a frozen options aggregate', () =>
  expect(
    check(
      `export function createModelReplicaCustodian(options: ModelReplicaOptions) { return Object.freeze(options); }`,
      ccl,
    ),
  ).not.toEqual([]))
test('CCL cannot lose a frozen options alias before unknown transfer', () =>
  expect(
    check(
      `export function createModelReplicaCustodian(options: ModelReplicaOptions) { const alias=Object.freeze({...options}); consume(alias); }`,
      ccl,
    ),
  ).not.toEqual([]))

test.each([
  "import type {ModelCatalog} from '@omne-harness-lite/model-profile-directory';",
  "import {localCredentialLookupPlugin} from '@omne-harness-lite/model-profile-directory/plugin';",
  "import {readBinding} from '../../../model/model-profile-directory/src/records.ts';",
])('CCL has no reverse directory package dependency, including root/type/private modules', text =>
  expect(check(text, ccl)).not.toEqual([]),
)

test.each([
  [
    'reader',
    'const thunk = () => reader; const illicit = thunk(); await illicit(unit, tenant);',
    'binding-reader',
  ],
  [
    'replica read',
    'const thunk = () => replica.readBoundReplicaIn; const illicit = thunk(); await illicit(unit, tenant, ref);',
    'read',
  ],
  [
    'literal read',
    "const thunk = () => replica['readBoundReplicaIn']; const illicit = thunk(); await illicit(unit, tenant, ref);",
    'read',
  ],
  [
    'destructured read',
    'const { readBoundReplicaIn: read } = replica; const thunk = () => read; const illicit = thunk(); await illicit(unit, tenant, ref);',
    'read',
  ],
  [
    'returned aggregate',
    "const thunk = () => ({ ['read']: replica.readBoundReplicaIn }); const { read: illicit } = thunk(); await illicit(unit, tenant, ref);",
    'read',
  ],
  [
    'aliased thunk',
    'const first = () => reader; const thunk = first; const illicit = thunk(); await illicit(unit, tenant);',
    'binding-reader',
  ],
  [
    'thunk in aggregate',
    'const holder = { thunk: () => reader }; const { thunk } = holder; const illicit = thunk(); await illicit(unit, tenant);',
    'binding-reader',
  ],
  [
    'conditional thunk',
    'const thunk = condition ? () => reader : () => reader; const illicit = thunk(); await illicit(unit, tenant);',
    'binding-reader',
  ],
  [
    'parenthesized result',
    'const thunk = () => (reader); const illicit = thunk(); await illicit(unit, tenant);',
    'binding-reader',
  ],
  [
    'nested thunk',
    'const thunk = () => () => reader; const illicit = thunk()(); await illicit(unit, tenant);',
    'binding-reader',
  ],
  [
    'async thunk',
    'const thunk = async () => reader; const illicit = await thunk(); await illicit(unit, tenant);',
    'binding-reader',
  ],
])(
  'expression-body %s retains permission at the resulting execution line',
  (_name, wrapper, token) => {
    const text = valid.replace('ctx.plugin(lookup,', `\n${wrapper} // HERE\nctx.plugin(lookup,`)
    const line = text.split('\n').findIndex(row => row.includes('// HERE')) + 1
    expect(check(text)).toContainEqual({
      rule: 'model-credential-boundary',
      path: bootstrap,
      line,
      message: `${token} execution is outside its permitted semantic function`,
    })
  },
)

test('namespace construction and a typed local arrow parameter cannot hide reader execution', () => {
  const text = valid
    .replace(
      imports,
      `import * as binding from '@omne-harness-lite/model-profile-directory/tx-reads';\nimport type { ReadCredentialBindingIn as BindingRead } from '@omne-harness-lite/model-profile-directory/tx-reads';\n${imports}`,
    )
    .replace('makeReader(storage)', "binding['createCredentialBindingReader'](storage)")
    .replace(
      'ctx.plugin(lookup,',
      '\nconst thunk = (selected: BindingRead) => selected; const illicit = thunk(reader); await illicit(unit, tenant); // HERE\nctx.plugin(lookup,',
    )
  const line = text.split('\n').findIndex(row => row.includes('// HERE')) + 1
  expect(
    check(text).some(v => v.line === line && v.message.includes('binding-reader execution')),
  ).toBe(true)
})

test.each([
  'const thunk = () => borrowed.close;',
  "const thunk = () => borrowed['close'];",
  'const { close: end } = borrowed; const thunk = () => end;',
])('P1r root-type alias and %s preserve forbidden close execution', wrapper => {
  const text = `import type { ModelReplicaCustodian as Borrowed } from '@omne-harness-lite/credential-custodian-local';
export const localCredentialLookupPlugin = {
 async apply(ctx, options) {
  const borrowed: Borrowed = supplied;
  ${wrapper} const illicit = thunk();
  await illicit(); // HERE
  await options.readBoundReplicaIn(unit, tenant, ref);
 }
};`
  const line = text.split('\n').findIndex(row => row.includes('// HERE')) + 1
  expect(check(text, p1r)).toContainEqual({
    rule: 'model-credential-boundary',
    path: p1r,
    line,
    message: 'close execution is outside its permitted semantic function',
  })
})

test.each([
  'const thunk = () => reader;',
  'const thunk = () => () => () => () => () => reader;',
  'const thunk = () => { return reader; };',
])('restricted return fails closed before any unknown recipient: %s', wrapper => {
  const text = valid.replace('ctx.plugin(lookup,', `\n${wrapper} // RETURN\nctx.plugin(lookup,`)
  const line = text.split('\n').findIndex(row => row.includes('// RETURN')) + 1
  expect(
    check(text).some(v => v.line === line && v.message.includes('escape through return')),
  ).toBe(true)
})

test('expression-body operation results and unrelated returned close remain valid', () => {
  const text = valid
    .replace(
      'function publishCredential() { return replica.storeBoundReplica(input); }',
      'const publishCredential = () => replica.storeBoundReplica(input);',
    )
    .replace(
      'async function closeResources() { await replica?.close(); }',
      'const closeResources = async () => await replica?.close();',
    )
    .replace(
      'ctx.plugin(lookup,',
      'const plain = () => socket.close; const end = plain(); await end(); const number = () => 1; consume(number()); ctx.plugin(lookup,',
    )
  expect(check(text)).toEqual([])
})

test('root configured aliases have collector and actual built CLI parity', () => {
  const root = mkdtempSync(join(tmpdir(), 'omne-model-credential-cli-'))
  try {
    const directory = join(root, 'packages/model/model-profile-directory/src')
    const source = join(root, 'examples/model-invocation-minimal-demo/src')
    const tool = join(root, 'tools/ts-checks')
    mkdirSync(directory, { recursive: true })
    mkdirSync(source, { recursive: true })
    mkdirSync(tool, { recursive: true })
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          paths: { '@binding': ['./packages/model/model-profile-directory/src/tx-reads.ts'] },
        },
      }),
    )
    writeFileSync(
      join(directory, 'tx-reads.ts'),
      'export const createCredentialBindingReader = () => () => undefined;',
    )
    const allowed = valid.replace('@omne-harness-lite/model-profile-directory/tx-reads', '@binding')
    const forbidden = allowed.replace(
      'ctx.plugin(lookup,',
      '\nawait reader(unit, tenant); // HERE\nctx.plugin(lookup,',
    )
    writeFileSync(join(source, 'bootstrap.ts'), forbidden)
    const roots = [root, `${root}/`]
    const inputs = roots.map(collectRepositorySources)
    for (const files of inputs) {
      expect(files.find(file => file.path === bootstrap)?.resolvedModules?.['@binding']).toBe(
        'packages/model/model-profile-directory/src/tx-reads.ts',
      )
      expect(
        modelCredentialBoundary
          .check(files)
          .some(v => v.message.includes('binding-reader execution')),
      ).toBe(true)
    }
    expect(modelCredentialBoundary.check(inputs[0] ?? [])).toEqual(
      modelCredentialBoundary.check(inputs[1] ?? []),
    )
    // The built public CLI derives its repository root with a trailing slash.
    // Copy its emitted bytes, preserving the real tools/ layout and locked dependencies.
    cpSync(fileURLToPath(new URL('../dist', import.meta.url)), join(tool, 'dist'), {
      recursive: true,
    })
    writeFileSync(join(tool, 'package.json'), JSON.stringify({ type: 'module' }))
    // The CLI also reads the tool's own configuration, which sits next to dist/ in the real layout.
    for (const config of ['acceptance-lock.config.json', 'loop.config.json']) {
      cpSync(fileURLToPath(new URL(`../${config}`, import.meta.url)), join(tool, config))
    }
    symlinkSync(
      fileURLToPath(new URL('../node_modules', import.meta.url)),
      join(root, 'node_modules'),
      'dir',
    )
    const invalid = spawnSync(
      process.execPath,
      [join(tool, 'dist/cli.js'), 'packages', 'examples'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    )
    expect(invalid.error).toBeUndefined()
    expect(invalid.status).toBe(1)
    expect(invalid.stderr).toContain('[model-credential-boundary] binding-reader execution')
    writeFileSync(join(source, 'bootstrap.ts'), allowed)
    for (const repositoryRoot of roots)
      expect(modelCredentialBoundary.check(collectRepositorySources(repositoryRoot))).toEqual([])
    const validCLI = spawnSync(
      process.execPath,
      [join(tool, 'dist/cli.js'), 'packages', 'examples'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    )
    expect(validCLI.error).toBeUndefined()
    expect(validCLI.status).toBe(0)
    expect(validCLI.stdout).toContain('PASS: ts-checks')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000) // Two runs of the built CLI (~2 s alone, over 5 s under workspace-wide load); assertions unchanged.

test('retired app and unrelated example cannot own model credential factories', () => {
  for (const path of [
    'apps/model-request-acceptance/src/bootstrap.ts',
    'examples/unrelated/src/bootstrap.ts',
  ]) {
    expect(
      modelCredentialBoundary.check([
        {
          path,
          text: "import { createModelReplicaCustodian } from '@omne-harness-lite/credential-custodian-local/model-replica'; const replica = await createModelReplicaCustodian(options);",
        },
      ]),
    ).not.toEqual([])
  }
})
