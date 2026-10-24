// Contract members with real declarations in a temporary checkout, and the installed, pinned
// `omne-contract-api` that writes their snapshots. The provider under test resolves the same CLI.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contractApiCommand, contractApiEnv } from '../../src/integration/contract-diff.ts'

const BASE_TSCONFIG = fileURLToPath(
  new URL('../../../repo-config/tsconfig.base.json', import.meta.url),
)
export const SNAPSHOT_TEMPLATE = '{member}/api/{package}.api.md'
type Member = { name: string; dist: string }
export const MEMBERS: Record<string, Member> = {
  'pkg/a': { name: '@fixture/a', dist: 'export interface A {\n    a: string;\n}\n' },
  'pkg/b': { name: '@fixture/b', dist: 'export type B = 1;\n' },
  'pkg/c': { name: '@fixture/c', dist: 'export declare const c: number;\n' },
}
/** `pkg/a` with one optional property more: an additive change. */
export const A_ADDITIVE = 'export interface A {\n    a: string;\n    b?: number;\n}\n'
export const snapshotOf = (member: string) => `${member}/api/${member.slice(4)}.api.md`

export function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

/**
 * Writes the members, `tsconfig.base.json` and the `contractApi` configuration. The line table
 * at `config.members` is written only when `lines` is given. The members resolve each other
 * through `node_modules` links, which the checkout must ignore.
 */
export function contracts(
  root: string,
  config: { members: string; snapshot: string; [key: string]: unknown },
  lines?: unknown,
): void {
  copyFileSync(BASE_TSCONFIG, join(root, 'tsconfig.base.json'))
  write(root, 'repo-toolchain.config.json', JSON.stringify({ contractApi: config }, null, 2))
  if (lines !== undefined) write(root, config.members, JSON.stringify(lines, null, 2))
  for (const [path, member] of Object.entries(MEMBERS)) {
    write(
      root,
      join(path, 'package.json'),
      JSON.stringify({
        name: member.name,
        type: 'module',
        exports: { '.': { types: './dist/index.d.ts' } },
      }),
    )
    write(root, join(path, 'dist/index.d.ts'), member.dist)
    const link = join(root, 'node_modules', member.name)
    mkdirSync(dirname(link), { recursive: true })
    rmSync(link, { force: true })
    symlinkSync(join(root, path), link, 'dir')
  }
}

/** Rewrites the snapshots from the members' dist with the installed CLI. */
export function writeSnapshots(root: string): void {
  const command = contractApiCommand()
  if (!('file' in command)) throw new Error(command.reason)
  const result = spawnSync(command.file, [...command.args, '--write', '--root', root], {
    cwd: root,
    encoding: 'utf8',
    env: contractApiEnv(root),
  })
  if (result.status !== 0) throw new Error(`omne-contract-api --write failed: ${result.stderr}`)
}
