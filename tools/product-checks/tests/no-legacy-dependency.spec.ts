import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectRepositorySources } from '../src/repository.ts'
import { noLegacyDependency } from '../src/rules/no-legacy-dependency.ts'
import type { SourceFile } from '@omne-harness/repo-toolchain/core/rule'

const file = (path: string, text: string): SourceFile => ({ path, text })

describe('no-legacy-dependency', () => {
  it('rejects a package manifest that depends on a legacy package or tree', () => {
    const manifest = file(
      'packages/common/json-text/package.json',
      JSON.stringify({
        dependencies: { '@omne-harness-lite/content-blocks': 'workspace:*' },
        devDependencies: { helper: 'file:packages.0.0.1.legacy/core/storage' },
      }),
    )
    expect(noLegacyDependency.check([manifest]).map(item => item.message)).toEqual([
      'dependencies 重新引入了 legacy 包或旧目录：@omne-harness-lite/content-blocks',
      'devDependencies 重新引入了 legacy 包或旧目录：helper',
    ])
  })

  it('rejects a source path, leaves import edges to dependency-cruiser, and allows the new scope plus a doc mention', () => {
    const imported = file(
      'packages/common/json-text/src/index.ts',
      "import { x } from '@omne-harness-lite/storage'\n",
    )
    const path = file('scripts/read-old.mjs', "const root = 'packages.0.0.1.legacy/core/storage'\n")
    const current = file(
      'packages/common/json-text/src/index.ts',
      "import { IDENTITY_TYPE_NAMES } from '@omne-harness/legal-identity'\n",
    )
    const note = file('docs/workspace.md', '旧目录留在 packages.0.0.1.legacy/ 供核对。\n')
    expect(noLegacyDependency.check([imported, path]).map(item => item.path)).toEqual([path.path])
    expect(noLegacyDependency.check([current, note])).toEqual([])
  })

  it.each([
    "readFileSync('../../../packages.0.0.1.legacy/core/a.ts', 'utf8')",
    "fs.readFile(new URL('../../../apps.0.0.1.legacy/cli/a.ts', import.meta.url))",
    "readFileSync(join(root, 'packages.0.0.1.legacy', path), 'utf8')",
    "const old = '../../../packages.0.0.1.legacy/core/a.ts'; readFileSync(old, 'utf8')",
    "const old = '../../../apps.0.0.1.legacy/'; const path = `${old}cli/a.ts`; fs.readFileSync(path)",
    "import { readFileSync as read } from 'node:fs'; read('../../../packages.0.0.1.legacy/a.ts')",
    'new URL(`../../../packages.0.0.1.legacy/${path}`, import.meta.url)',
  ])('rejects a test that consumes an archived path: %s', text => {
    expect(
      noLegacyDependency.check([file('tools/check/tests/rule.spec.ts', text)]).length,
    ).toBeGreaterThan(0)
  })

  it('keeps legacy text as test data and resolves local path declarations without crossing scopes', () => {
    const text = `
const bad = { path: 'packages.0.0.1.legacy/core/a.ts', text: "readFileSync('apps.0.0.1.legacy/a.ts')" }
function input() { const path = 'packages.0.0.1.legacy/a.ts'; return { path } }
function current() { const path = './current.ts'; return readFileSync(path) }
const path = 'packages.0.0.1.legacy/a.ts'
function passed(path: string) { return readFileSync(path) }
`
    expect(noLegacyDependency.check([file('tools/check/tests/rule.spec.ts', text)])).toEqual([])
  })

  it.each([
    "readFile('./current.ts', 'utf8', () => { check({ path: 'packages.0.0.1.legacy/a.ts' }) })",
    "const input = { path: './current.ts', text: 'packages.0.0.1.legacy/a.ts' }; readFileSync(input.path)",
    "const input = { path: './current.ts', text: 'packages.0.0.1.legacy/a.ts' }; readFileSync(input['path'])",
    "const path = 'packages.0.0.1.legacy/a.ts'; function read({ path }) { return readFileSync(path) }; read({ path: './current.ts' })",
    "const path = 'packages.0.0.1.legacy/a.ts'; { const { path } = { path: './current.ts' }; readFileSync(path) }",
    "const path = 'packages.0.0.1.legacy/a.ts'; function read([path]) { return readFileSync(path) }",
    "const path = 'packages.0.0.1.legacy/a.ts'; { const [path] = ['./current.ts']; readFileSync(path) }",
    "const path = 'packages.0.0.1.legacy/a.ts'; for (const { path } of [{ path: './current.ts' }]) { readFileSync(path) }",
    "const path = 'packages.0.0.1.legacy/a.ts'; try {} catch ({ path }) { readFileSync(path) }",
    "const path = 'packages.0.0.1.legacy/a.ts'; for (const [path] in { current: true }) { readFileSync(path) }",
    "const path = 'packages.0.0.1.legacy/a.ts'; for (let { path } = { path: './current.ts' }; false;) { readFileSync(path) }",
  ])('does not treat unrelated data or a shadowed binding as the file path: %s', text => {
    expect(noLegacyDependency.check([file('tools/check/tests/rule.spec.ts', text)])).toEqual([])
  })

  it.each([
    "const input = { path: 'packages.0.0.1.legacy/a.ts', text: './current.ts' }; readFileSync(input.path)",
    "const input = { path: 'apps.0.0.1.legacy/a.ts', text: './current.ts' }; readFileSync(input['path'])",
  ])('rejects an archived path selected from a local object: %s', text => {
    expect(noLegacyDependency.check([file('tools/check/tests/rule.spec.ts', text)])).toHaveLength(1)
  })

  it('still detects an initialized legacy path in a for statement', () => {
    const text = "for (let path = 'packages.0.0.1.legacy/a.ts'; false;) { readFileSync(path) }"
    expect(noLegacyDependency.check([file('tools/check/tests/rule.spec.ts', text)])).toHaveLength(1)
  })

  it('includes the root manifest in the repository dependency check', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'legacy-manifest-')))
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          devDependencies: { '@omne-harness-lite/storage': 'workspace:*' },
        }),
      )
      expect(noLegacyDependency.check(collectRepositorySources(root))).toEqual([
        expect.objectContaining({ path: 'package.json', rule: 'no-legacy-dependency' }),
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // Slow because the second half scans every source file in the repository: about 3 seconds alone,
  // past the fast tier's per-case budget, and past 5 seconds when the whole gate runs in parallel.
  it(
    'does not exempt a former consumer path, and finds none in the current repository',
    {
      tags: ['slow'],
    },
    () => {
      const parked = file(
        'tools/core-verification/src/w1-public-consumer.ts',
        "const old = '../../packages.0.0.1.legacy/core/kernel-basis/src/index.ts'\n",
      )
      expect(noLegacyDependency.check([parked]).map(item => item.path)).toEqual([parked.path])
      const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
      expect(noLegacyDependency.check(collectRepositorySources(root))).toEqual([])
    },
  )
})
