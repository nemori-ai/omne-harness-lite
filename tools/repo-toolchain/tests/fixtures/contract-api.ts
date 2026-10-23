// 契约 API 快照测试的临时检出：真实的根编译选项、成员 package.json、手写的 dist 声明、
// 按包名的 node_modules 链接、线归属表与带 contractApi 一节的配置。
import { copyFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifySnapshots } from '../../src/declarations/api-classify.ts'
import type { ApiSnapshot } from '../../src/declarations/api-format.ts'
import {
  readContractMember,
  readWorkingFile,
  snapshotContracts,
} from '../../src/declarations/api-snapshot.ts'
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

/** 按目录读出检出里的契约成员；读不出时抛出。 */
export function membersOf(root: string, directories: readonly string[]) {
  return directories.map(directory => {
    const outcome = readContractMember(readWorkingFile(root), directory)
    if (outcome.kind === 'invalid') throw new Error(outcome.problem.message)
    return outcome.member
  })
}

/** 单成员 `packages/x/a`（`@fixture/a`）的快照模型。 */
export function snapshotOf(
  dist: Readonly<Record<string, string>>,
  exports: Readonly<Record<string, string>> = { '.': 'index.d.ts' },
): ApiSnapshot {
  const root = contractCheckout({ 'packages/x/a': { name: '@fixture/a', exports, dist } })
  const [result] = snapshotContracts(root, membersOf(root, ['packages/x/a'])).results
  if (result?.kind !== 'snapshot') throw new Error(JSON.stringify(result))
  return result.snapshot
}

/** 外部包 `x`：成员 a 的依赖，不是契约成员。扩充它的 `Context`、`Events` 测对外扩充。 */
export const EXTERNAL_X =
  'export interface Context { base: string }\nexport interface Events { ready(): void }\nexport type KeysOf<T> = keyof T;\n'

type Dist = Readonly<Record<string, string>>

/** 成员 a（依赖外部包 x）的一侧：建检出并生成快照。 */
function sideOf(dist: Dist, exports: Readonly<Record<string, string>>) {
  const root = contractCheckout(
    {
      'packages/x/a': { name: '@fixture/a', exports, dist },
      'packages/x/x': {
        name: 'x',
        exports: { '.': 'index.d.ts' },
        dist: { 'index.d.ts': EXTERNAL_X },
      },
    },
    ['packages/x/a'],
  )
  const [result] = snapshotContracts(root, membersOf(root, ['packages/x/a'])).results
  if (result?.kind !== 'snapshot') throw new Error(JSON.stringify(result))
  return { root, snapshot: result.snapshot }
}

/** 两份 dist 的分类：只给 `index.d.ts` 时可以直接传文本。 */
export function classifyDists(
  before: string | Dist,
  after: string | Dist,
  exports: {
    before?: Readonly<Record<string, string>>
    after?: Readonly<Record<string, string>>
  } = {},
) {
  const dist = (value: string | Dist): Dist =>
    typeof value === 'string' ? { 'index.d.ts': value } : value
  const entry = { '.': 'index.d.ts' }
  const old = sideOf(dist(before), exports.before ?? entry)
  const next = sideOf(dist(after), exports.after ?? entry)
  return classifySnapshots(old.snapshot, next.snapshot, {
    root: next.root,
    directory: 'packages/x/a',
  })
}
