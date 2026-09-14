import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imports, validateImport, closure } from '../src/boundaries.mjs'

const make = name => ({ root: `/repo/packages/family/${name}`, manifest: { name: `@omne-harness-lite/${name}`, exports: { './baseline': {} }, dependencies: {} } })

test('finds real import/export/type/augmentation dependencies, ignoring comments and strings', () => {
  assert.deepEqual(imports(`
    // import 'ignored';
    const example = "import 'also-ignored'";
    import type { A } from 'a'; export { B } from 'b';
    type C = import('c').C;
    declare module 'd' { interface X {} }
    await import('e'); require('f');
  `), ['a', 'b', 'c', 'd', 'e', 'f'])
})

test('public imports require a declared runtime edge; development dependencies cannot mask it', () => {
  const a = make('a'), b = make('b'), file = `${a.root}/src/index.ts`
  a.manifest.devDependencies = { [b.manifest.name]: 'workspace:*' }
  assert.throws(() => validateImport(`${b.manifest.name}/baseline`, file, a, [a,b]), /undeclared dependency/)
  validateImport(`${b.manifest.name}/baseline`, file, a, [a,b], true)
  a.manifest.dependencies[b.manifest.name] = 'workspace:*'
  validateImport(`${b.manifest.name}/baseline`, file, a, [a,b])
  assert.throws(() => validateImport(`${b.manifest.name}/src/index.ts`, file, a, [a,b]), /private package subpath/)
})

test('relative src and dist penetration and unknown product edges fail', () => {
  const a = make('a'), file = `${a.root}/src/index.ts`
  for (const specifier of ['../../b/src/index.ts', '../../b/dist/index.js']) {
    assert.throws(() => validateImport(specifier, file, a, [a]), /cross-package relative import/)
  }
  validateImport('./own.ts', file, a, [a])
  a.manifest.dependencies['@omne-harness-lite/missing'] = 'workspace:*'
  assert.throws(() => closure(a, [a]), /unknown product dependency/)
})

test('transitive closure excludes unrelated and development members and rejects cycles', () => {
  const a = make('a'), b = make('b'), c = make('c'), d = make('d')
  a.manifest.dependencies[b.manifest.name] = 'workspace:*'
  b.manifest.dependencies[c.manifest.name] = 'workspace:*'
  a.manifest.devDependencies = { [d.manifest.name]: 'workspace:*' }
  assert.deepEqual([...closure(a,[a,b,c,d])], [c,b,a])
  c.manifest.dependencies[a.manifest.name] = 'workspace:*'
  assert.throws(() => closure(a,[a,b,c,d]), /dependency cycle/)
})
