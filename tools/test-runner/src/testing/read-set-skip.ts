import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { RunTier } from './config.ts'
import type { MemberRun } from './ledger.ts'
import {
  readRecord,
  recordPath,
  type CachedResult,
  type Digest,
  type ReadSetRecord,
  type RecordedFile,
} from './read-sets.ts'

export const HISTORY_DIR = 'history'
export const HISTORY_KEPT = 4

export interface Floor {
  readonly global: readonly string[]
  readonly member: (member: string) => readonly string[]
}

export interface Reuse {
  readonly entry: RecordedFile & { readonly cached: CachedResult }
  readonly tree: Readonly<Record<string, string>>
  readonly from: { readonly head: string; readonly recordedAt: string }
}

export function ownerOf(path: string, members: readonly string[]): string | undefined {
  let owner: string | undefined
  for (const member of members)
    if ((path === member || path.startsWith(`${member}/`)) && member.length > (owner?.length ?? -1))
      owner = member
  return owner
}

export function floorReads(
  reads: readonly string[],
  members: readonly string[],
  floor: Floor,
): string[] {
  const keys = new Set(reads)
  for (const path of floor.global) keys.add(`content:${path}`)
  const owners = new Set<string>()
  for (const key of reads) {
    const at = key.indexOf(':')
    if (key.slice(0, at) === 'runtime') continue
    const owner = ownerOf(key.slice(at + 1), members)
    if (owner !== undefined) owners.add(owner)
  }
  for (const owner of owners) for (const path of floor.member(owner)) keys.add(`content:${path}`)
  return [...keys].sort()
}

const sorted = (env: Readonly<Record<string, string>>) =>
  JSON.stringify(Object.entries(env).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

export function reusableFiles(
  records: readonly ReadSetRecord[],
  digest: Digest,
  env: Readonly<Record<string, string>>,
): Map<string, Reuse> {
  const wanted = sorted(env)
  const reuse = new Map<string, Reuse>()
  const files = new Set(records.flatMap(record => Object.keys(record.files)))
  for (const file of [...files].sort()) {
    const matching = records.filter(record => {
      const entry = record.files[file]
      return (
        entry !== undefined &&
        entry.incomplete.length === 0 &&
        record.env !== undefined &&
        sorted(record.env) === wanted &&
        entry.reads.every(key => record.tree[key] === digest(key))
      )
    })
    if (matching.some(record => record.files[file]?.verdict === 'failed')) continue
    const hit = matching.find(record => record.files[file]?.cached !== undefined)
    const entry = hit?.files[file]
    if (hit === undefined || entry?.cached === undefined) continue
    reuse.set(file, {
      entry: { ...entry, cached: entry.cached },
      tree: Object.fromEntries(entry.reads.map(key => [key, hit.tree[key] ?? ''])),
      from: { head: hit.head, recordedAt: hit.recordedAt },
    })
  }
  return reuse
}

export function historyDir(home: string, slug: string, tier: RunTier): string {
  return join(home, HISTORY_DIR, `${slug}.${tier}`)
}

export function readHistory(home: string, slug: string, tier: RunTier): ReadSetRecord[] {
  const dir = historyDir(home, slug, tier)
  let names: string[]
  try {
    names = readdirSync(dir).filter(name => name.endsWith('.json'))
  } catch {
    names = []
  }
  return [
    readRecord(recordPath(home, slug, tier)),
    ...names
      .sort()
      .reverse()
      .map(name => readRecord(join(dir, name))),
  ].filter(record => record !== undefined)
}

export function archiveLatest(home: string, slug: string, tier: RunTier): void {
  const latest = recordPath(home, slug, tier)
  const record = readRecord(latest)
  if (record === undefined) return
  const dir = historyDir(home, slug, tier)
  mkdirSync(dir, { recursive: true })
  renameSync(
    latest,
    join(dir, `${record.recordedAt.replaceAll(':', '')}-${record.head.slice(0, 9)}.json`),
  )
  const names = readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
  for (const name of names.slice(0, Math.max(0, names.length - HISTORY_KEPT)))
    rmSync(join(dir, name), { force: true })
}

function expand(root: string, pattern: string): string[] {
  if (!pattern.includes('*')) return [pattern]
  const slash = pattern.lastIndexOf('/')
  const dir = slash < 0 ? '' : pattern.slice(0, slash)
  const name = new RegExp(
    `^${pattern
      .slice(slash + 1)
      .replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
      .replaceAll('*', '[^/]*')}$`,
    'u',
  )
  if (dir.includes('*')) return []
  try {
    return readdirSync(join(root, dir))
      .filter(entry => name.test(entry))
      .map(entry => (dir === '' ? entry : `${dir}/${entry}`))
      .sort()
  } catch {
    return []
  }
}

export function floorOf(root: string, globalPaths: readonly string[]): Floor {
  return {
    global: [...new Set(globalPaths.flatMap(pattern => expand(root, pattern)))].sort(),
    member: member => [`${member}/package.json`, ...expand(root, `${member}/tsconfig*.json`)],
  }
}

export interface ReuseContext {
  readonly root: string
  readonly home: string
  readonly tier: RunTier
  readonly members: readonly string[]
  readonly slug: (member: string) => string
  readonly env: Readonly<Record<string, string>>
  readonly digest: Digest
}

export function planReuse(context: ReuseContext): Map<string, Map<string, Reuse>> {
  const plan = new Map<string, Map<string, Reuse>>()
  for (const member of context.members) {
    const records = readHistory(context.home, context.slug(member), context.tier)
    const reused = reusableFiles(records, context.digest, context.env)
    if (reused.size > 0) plan.set(member, reused)
  }
  return plan
}

export function skippedOf(
  plan: ReadonlyMap<string, ReadonlyMap<string, Reuse>>,
  member: string,
): Set<string> {
  return new Set([...(plan.get(member)?.keys() ?? [])].map(file => file.slice(member.length + 1)))
}

export function carriedOf(
  plan: ReadonlyMap<string, ReadonlyMap<string, Reuse>>,
  member: string,
): Pick<ReadSetRecord, 'files' | 'tree'> | undefined {
  const reused = plan.get(member)
  if (reused === undefined) return undefined
  return {
    files: Object.fromEntries([...reused].map(([file, { entry }]) => [file, entry])),
    tree: Object.assign({}, ...[...reused.values()].map(({ tree }) => tree)) as Record<
      string,
      string
    >,
  }
}

export function describeReuse(plan: ReadonlyMap<string, ReadonlyMap<string, Reuse>>): string[] {
  const all = [...plan.values()].flatMap(reused => [...reused.values()])
  if (all.length === 0) return []
  const tests = all.reduce((sum, { entry }) => sum + entry.cached.result.assertionResults.length, 0)
  const runs = new Set(all.map(({ from }) => `${from.recordedAt} ${from.head.slice(0, 9)}`))
  const latest = [...runs].sort().at(-1) ?? ''
  return [
    `按读集跳过：${plan.size} 个成员里 ${all.length} 份用例文件（${tests} 条用例）没跑，结果取自 ${runs.size} 次准入里的记录（读到的每一项与环境都没变；最近一次 ${latest}）`,
  ]
}

export function reuseMeta(plan: ReadonlyMap<string, ReadonlyMap<string, Reuse>>) {
  return {
    files: [...plan.values()].reduce((sum, reused) => sum + reused.size, 0),
    members: Object.fromEntries(
      [...plan].map(([member, reused]) => [
        member,
        [...reused].map(([file, { from }]) => ({
          file,
          head: from.head,
          recordedAt: from.recordedAt,
        })),
      ]),
    ),
  }
}

export function cachedRun(
  member: string,
  root: string,
  reused: ReadonlyMap<string, Reuse>,
): MemberRun | undefined {
  if (reused.size === 0) return undefined
  const entries = [...reused].sort(([a], [b]) => (a < b ? -1 : 1))
  const timings = entries.flatMap(([file, { entry }]) =>
    entry.cached.timing === undefined ? [] : [{ ...entry.cached.timing, file: join(root, file) }],
  )
  return {
    member,
    exitCode: 0,
    wallSeconds: 0,
    report: {
      testResults: entries.map(([file, { entry }]) => ({
        ...entry.cached.result,
        name: join(root, file),
      })),
    },
    ...(timings.length === 0 ? {} : { timing: { files: timings } }),
  }
}
