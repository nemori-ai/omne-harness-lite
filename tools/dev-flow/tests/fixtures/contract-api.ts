import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contractApiCommand, contractApiEnv } from '../../src/integration/contract-api.ts'

const BASE_TSCONFIG = fileURLToPath(
  new URL('../../../../tools/repo-config/tsconfig.base.json', import.meta.url),
)
export const SNAPSHOT_TEMPLATE = '{member}/api/{package}.api.md'
type Member = { name: string; dist: string }
export const MEMBERS: Record<string, Member> = {
  'pkg/a': { name: '@fixture/a', dist: 'export interface A {\n    a: string;\n}\n' },
  'pkg/b': { name: '@fixture/b', dist: 'export type B = 1;\n' },
  'pkg/c': { name: '@fixture/c', dist: 'export declare const c: number;\n' },
}
export const A_ADDITIVE = 'export interface A {\n    a: string;\n    b?: number;\n}\n'
export const snapshotOf = (member: string) => `${member}/api/${member.slice(4)}.api.md`

export function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

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
