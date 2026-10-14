import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectRepositorySources } from '../src/repository.ts'
import { noLegacyDependency } from '../src/rules/no-legacy-dependency.ts'
import type { SourceFile } from '../src/rule.ts'

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

  it('rejects a source import and a source path, and allows the new scope plus a doc mention', () => {
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
    expect(noLegacyDependency.check([imported, path]).map(item => item.path)).toEqual([
      imported.path,
      path.path,
    ])
    expect(noLegacyDependency.check([current, note])).toEqual([])
  })

  it('does not exempt a former consumer path, and finds none in the current repository', () => {
    const parked = file(
      'tools/core-verification/src/w1-public-consumer.ts',
      "import { fail } from '@omne-harness-lite/kernel-basis'\n",
    )
    expect(noLegacyDependency.check([parked]).map(item => item.path)).toEqual([parked.path])
    const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
    expect(noLegacyDependency.check(collectRepositorySources(root))).toEqual([])
  })
})
