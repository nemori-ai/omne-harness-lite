import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { checkDeclarations, renderDeclarationReport } from '../src/declarations/compat.ts'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** A checkout with the real base options and one member per entry of `dists`. */
function checkout(dists: Record<string, Record<string, string> | undefined>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'declaration-compat-')))
  temporaries.push(root)
  // 根 tsconfig.base.json 只是指向共享预设的 extends；临时仓库里直接放预设本身。
  copyFileSync(
    join(repository, 'tools/repo-config/tsconfig.base.json'),
    join(root, 'tsconfig.base.json'),
  )
  for (const [member, files] of Object.entries(dists)) {
    mkdirSync(join(root, member), { recursive: true })
    if (files === undefined) continue
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(root, member, 'dist', name, '..'), { recursive: true })
      writeFileSync(join(root, member, 'dist', name), text)
    }
  }
  return root
}

it('accepts declarations that TypeScript 6 reads, including relative .ts type imports', () => {
  const root = checkout({
    'packages/core/a': {
      'index.d.ts': "export type { Shape } from './shape.ts';\n",
      'shape.d.ts': 'export interface Shape {\n    readonly side?: number;\n}\n',
    },
  })
  const report = checkDeclarations(root, ['packages/core/a'])
  expect(report).toMatchObject({ members: 1, files: 2, unbuilt: [], diagnostics: [] })
  expect(report.typescript).toMatch(/^6\./u)
})

it('reports member declarations that TypeScript 6 cannot read, with file and line', () => {
  const root = checkout({
    'packages/core/a': {
      'index.d.ts': 'export declare const ok: string;\nexport declare const bad: Missing;\n',
    },
    'packages/core/b': {
      'index.d.ts': "export type { Engine } from 'no-such-package/dist/types/index';\n",
    },
  })
  const report = checkDeclarations(root, ['packages/core/a', 'packages/core/b'])
  expect(report.diagnostics).toEqual([
    expect.objectContaining({ file: 'packages/core/a/dist/index.d.ts', line: 2, code: 2304 }),
    expect.objectContaining({ file: 'packages/core/b/dist/index.d.ts', line: 1, code: 2307 }),
  ])
  expect(renderDeclarationReport(report)[0]).toContain('2 处不兼容')
})

it('lists members without dist and leaves them out of the diagnostics', () => {
  const root = checkout({
    'packages/core/a': { 'index.d.ts': 'export {};\n' },
    'apps/x': undefined,
  })
  const report = checkDeclarations(root, ['packages/core/a', 'apps/x'])
  expect(report).toMatchObject({ members: 1, unbuilt: ['apps/x'], diagnostics: [] })
  expect(renderDeclarationReport(report).join('\n')).toContain('apps/x')
})
