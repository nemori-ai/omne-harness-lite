// @module-tag slow
// 归慢层：每条用例在临时检出里用 TypeScript 6 编译成员的声明。快层账本（dcffba381／77d603dac）里整份合计 7.3／16.7 秒，4 条全超单条预算（2.5 秒）（tools/test-runner/README_ZH.md「归层」）。
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
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

/**
 * Workspace members that import each other by package name. Each member exports `source` before
 * `types`, as the repository's members do, and `node_modules/<name>` links to the member.
 */
function workspace(members: Record<string, { name: string; src: string; dist: string }>): string {
  const root = checkout(
    Object.fromEntries(
      Object.entries(members).map(([path, m]) => [path, { 'index.d.ts': m.dist }]),
    ),
  )
  for (const [path, member] of Object.entries(members)) {
    writeFileSync(
      join(root, path, 'package.json'),
      JSON.stringify({
        name: member.name,
        type: 'module',
        exports: { '.': { source: './src/index.ts', types: './dist/index.d.ts' } },
      }),
    )
    mkdirSync(join(root, path, 'src'))
    writeFileSync(join(root, path, 'src', 'index.ts'), member.src)
    mkdirSync(join(root, 'node_modules', member.name, '..'), { recursive: true })
    symlinkSync(join(root, path), join(root, 'node_modules', member.name), 'dir')
  }
  return root
}

// Each case builds real TypeScript programs, which takes seconds under a loaded full run.
describe('declaration compatibility', { timeout: 60_000 }, () => {
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

  it('reads no member src: imports between members resolve to the other member dist', () => {
    // a's declarations import b, and b's augment c. The `source` condition would send those imports
    // to b/src, so the old code read both copies of b's augmentation, and TypeScript reports the
    // copy it reads second as TS2717 (here that is b/src, counted as external). Every src holds a
    // type error that nothing reads: `external: 0` and no diagnostics mean no member src entered.
    const unread = "export const unread: number = 'src is not read';\n"
    const augmentation = (body: string) =>
      'export interface Placement {\n    readonly where: string;\n}\n' +
      "declare module '@fixture/c' {\n    interface Blocks {\n        'b.placement': Placement;\n    }\n}\n" +
      body
    const root = workspace({
      'packages/core/a': {
        name: '@fixture/a',
        src: "export type { Placement } from '@fixture/b';\n" + unread,
        dist: "export type { Placement } from '@fixture/b';\n",
      },
      'packages/core/b': {
        name: '@fixture/b',
        src: augmentation(unread),
        dist: augmentation(''),
      },
      'packages/core/c': {
        name: '@fixture/c',
        src: 'export interface Blocks {\n}\n' + unread,
        dist: 'export interface Blocks {\n}\n',
      },
    })
    const report = checkDeclarations(root, [
      'packages/core/a',
      'packages/core/b',
      'packages/core/c',
    ])
    expect(report).toMatchObject({ members: 3, files: 3, diagnostics: [], external: 0 })
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
})
