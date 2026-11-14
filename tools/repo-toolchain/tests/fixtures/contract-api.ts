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
import { writeSnapshots, type ContractApiConfig } from '../../src/declarations/contract-api.ts'
import {
  commit,
  repository as gitRepository,
  temporaryDirectory,
} from './loop-canary/repository.ts'

const repository = fileURLToPath(new URL('../../../../', import.meta.url))

export interface FixtureMember {
  readonly name: string
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

export const MEMBERS: Readonly<Record<string, FixtureMember>> = {
  'packages/x/a': {
    name: '@fixture/a',
    exports: { '.': 'index.d.ts' },
    dist: { 'index.d.ts': 'export interface A {\n    a: string;\n}\n' },
  },
  'packages/x/b': {
    name: '@fixture/b',
    exports: { '.': 'index.d.ts' },
    dist: { 'index.d.ts': 'export type B = 1;\n' },
  },
}

export function committedCheckout(): { root: string; base: string } {
  const root = contractCheckout(MEMBERS, Object.keys(MEMBERS), gitRepository())
  writeSnapshots(root, CONFIG)
  return { root, base: commit(root, 'snapshots') }
}

export function setContracts(root: string, contracts: readonly string[]): void {
  write(
    root,
    CONFIG.members,
    JSON.stringify({ schemaVersion: 1, lines: [{ id: 'line', contracts }] }),
  )
}

export function setDist(
  root: string,
  member: string,
  dist: Readonly<Record<string, string>> | undefined,
): void {
  rmSync(join(root, member, 'dist'), { recursive: true, force: true })
  if (dist === undefined) return
  for (const [file, text] of Object.entries(dist)) write(root, join(member, 'dist', file), text)
}

export function membersOf(root: string, directories: readonly string[]) {
  return directories.map(directory => {
    const outcome = readContractMember(readWorkingFile(root), directory)
    if (outcome.kind === 'invalid') throw new Error(outcome.problem.message)
    return outcome.member
  })
}

export function snapshotOf(
  dist: Readonly<Record<string, string>>,
  exports: Readonly<Record<string, string>> = { '.': 'index.d.ts' },
): ApiSnapshot {
  const root = contractCheckout({ 'packages/x/a': { name: '@fixture/a', exports, dist } })
  const [result] = snapshotContracts(root, membersOf(root, ['packages/x/a'])).results
  if (result?.kind !== 'snapshot') throw new Error(JSON.stringify(result))
  return result.snapshot
}

export const EXTERNAL_X =
  'export interface Context { base: string }\nexport interface Events { ready(): void }\nexport type KeysOf<T> = keyof T;\n'

type Dist = Readonly<Record<string, string>>

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
