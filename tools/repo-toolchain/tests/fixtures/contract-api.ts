// 契约 API 快照测试的临时检出：真实的根编译选项、成员 package.json、手写的 dist 声明、
// 按包名的 node_modules 链接、线归属表与带 contractApi 一节的配置。
import { copyFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { snapshotContracts } from '../../src/declarations/api-snapshot.ts'
import type { ContractApiConfig } from '../../src/declarations/contract-api.ts'
import { temporaryDirectory } from './loop-canary/repository.ts'

const repository = fileURLToPath(new URL('../../../../', import.meta.url))

export interface FixtureMember {
  readonly name: string
  /** 子路径到 dist 内的声明文件，例如 `{ '.': 'index.d.ts' }`。 */
  readonly exports: Readonly<Record<string, string>>
  readonly dist?: Readonly<Record<string, string>>
}

export const CONFIG: ContractApiConfig = {
  members: 'docs/engineering/delivery-lines.json',
  snapshot: '{member}/api/{package}.api.md',
}

export function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

/** 写一个检出；`contracts` 缺省为全部成员。 */
export function contractCheckout(
  members: Readonly<Record<string, FixtureMember>>,
  contracts: readonly string[] = Object.keys(members),
  root: string = temporaryDirectory('contract-api-'),
): string {
  copyFileSync(
    join(repository, 'tools/repo-config/tsconfig.base.json'),
    join(root, 'tsconfig.base.json'),
  )
  write(
    root,
    CONFIG.members,
    JSON.stringify({ schemaVersion: 1, lines: [{ id: 'line', contracts }] }, null, 2),
  )
  write(root, 'repo-toolchain.config.json', JSON.stringify({ contractApi: CONFIG }, null, 2))
  write(root, '.gitignore', 'node_modules/\n')
  for (const [path, member] of Object.entries(members)) {
    write(
      root,
      join(path, 'package.json'),
      JSON.stringify({
        name: member.name,
        type: 'module',
        exports: Object.fromEntries(
          Object.entries(member.exports).map(([subpath, file]) => [
            subpath,
            { types: `./dist/${file}` },
          ]),
        ),
      }),
    )
    setDist(root, path, member.dist)
    const link = join(root, 'node_modules', member.name)
    mkdirSync(dirname(link), { recursive: true })
    rmSync(link, { force: true })
    symlinkSync(join(root, path), link, 'dir')
  }
  return root
}

/** 换掉一个成员的整个 dist；`undefined` 表示没有构建。 */
export function setDist(
  root: string,
  member: string,
  dist: Readonly<Record<string, string>> | undefined,
): void {
  rmSync(join(root, member, 'dist'), { recursive: true, force: true })
  if (dist === undefined) return
  for (const [file, text] of Object.entries(dist)) write(root, join(member, 'dist', file), text)
}

/** 单成员 `packages/x/a`（`@fixture/a`）的快照文本。 */
export function snapshotOf(
  dist: Readonly<Record<string, string>>,
  exports: Readonly<Record<string, string>> = { '.': 'index.d.ts' },
): string {
  const root = contractCheckout({ 'packages/x/a': { name: '@fixture/a', exports, dist } })
  const run = snapshotContracts(root, ['packages/x/a'])
  const [snapshot] = run.snapshots
  if (snapshot === undefined) throw new Error(JSON.stringify(run))
  return snapshot.text
}
