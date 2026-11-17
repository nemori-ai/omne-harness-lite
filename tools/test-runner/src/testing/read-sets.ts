import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import type { RunTier } from './config.ts'

export const READ_SETS_ENV = 'OMNE_TEST_READ_SETS'
export const READ_SETS_HOME_ENV = 'OMNE_TEST_READ_SETS_HOME'
export const READ_SETS_DIR = 'tmp/test-read-sets'
export const READ_SET_META = 'omneReadSet'
export const READ_KINDS = ['content', 'listing', 'presence'] as const
export type ReadKind = (typeof READ_KINDS)[number]

export const NO_RECORDER = '没有记录器'
export const EXTERNAL_IN_REPO = '仓库里有外部化的模块'
export const LOCKFILE_KEY = 'content:pnpm-lock.yaml'
export const RUNTIME_KEY = 'runtime:node'

export type Verdict = 'passed' | 'failed'

export interface RecorderMeta extends Readonly<Record<ReadKind, readonly string[]>> {
  readonly incomplete: readonly string[]
}

export interface RawFile {
  readonly file: string
  readonly verdict: Verdict | 'skipped'
  readonly modules: readonly string[]
  readonly externals: readonly string[]
  readonly recorded?: RecorderMeta
}

export interface RawReadSets {
  readonly config: readonly string[]
  readonly files: readonly RawFile[]
}

export interface RecordedFile {
  readonly verdict: Verdict
  readonly incomplete: readonly string[]
  readonly reads: readonly string[]
}

export interface ReadSetRecord {
  readonly version: 1
  readonly head: string
  readonly recordedAt: string
  readonly tree: Readonly<Record<string, string>>
  readonly files: Readonly<Record<string, RecordedFile>>
}

export type Digest = (key: string) => string

export function readSetsRequested(
  env: Readonly<Record<string, string | undefined>>,
  admission: boolean,
): boolean {
  return admission && env[READ_SETS_ENV] !== '0'
}

export function readSetHome(
  mainRoot: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const given = env[READ_SETS_HOME_ENV]
  return given === undefined || given === '' ? join(mainRoot, READ_SETS_DIR) : given
}

export function recordPath(home: string, slug: string, tier: RunTier): string {
  return join(home, `${slug}.${tier}.json`)
}

function inRepo(root: string, path: string): string | undefined {
  if (!isAbsolute(path)) return undefined
  const inside = relative(root, path).replaceAll('\\', '/')
  return inside === '' || inside.startsWith('../') || inside === '..' || isAbsolute(inside)
    ? undefined
    : inside
}

const isDependency = (inside: string) => inside.split('/').includes('node_modules')

export function readsOf(
  root: string,
  raw: RawFile,
  config: readonly string[],
): { readonly reads: string[]; readonly incomplete: string[] } {
  const reads = new Set<string>([RUNTIME_KEY])
  const incomplete = new Set<string>(raw.recorded?.incomplete ?? [NO_RECORDER])
  const add = (kind: ReadKind, path: string): boolean => {
    const inside = inRepo(root, path)
    if (inside === undefined) return false
    reads.add(isDependency(inside) ? LOCKFILE_KEY : `${kind}:${inside}`)
    return !isDependency(inside)
  }
  for (const path of [raw.file, ...raw.modules, ...config]) add('content', path)
  for (const path of raw.externals) if (add('content', path)) incomplete.add(EXTERNAL_IN_REPO)
  for (const kind of READ_KINDS) for (const path of raw.recorded?.[kind] ?? []) add(kind, path)
  return { reads: [...reads].sort(), incomplete: [...incomplete].sort() }
}

const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 32)

export function digestKey(root: string, key: string): string {
  const at = key.indexOf(':')
  const kind = key.slice(0, at)
  if (kind === 'runtime') return `${process.version} ${process.platform} ${process.arch}`
  const path = join(root, key.slice(at + 1))
  try {
    const stat = statSync(path, { throwIfNoEntry: false })
    if (stat === undefined) return 'missing'
    if (kind === 'presence') return stat.isDirectory() ? 'dir' : 'file'
    if (kind === 'listing')
      return stat.isDirectory() ? sha(readdirSync(path).sort().join('\n')) : 'file'
    return stat.isDirectory() ? 'dir' : sha(readFileSync(path))
  } catch {
    return 'unreadable'
  }
}

export function digests(root: string): Digest {
  const known = new Map<string, string>()
  return key => {
    const seen = known.get(key)
    if (seen !== undefined) return seen
    const digest = digestKey(root, key)
    known.set(key, digest)
    return digest
  }
}

export function recordOf(
  root: string,
  raw: RawReadSets,
  digest: Digest,
  at: { readonly head: string; readonly recordedAt: string },
): ReadSetRecord {
  const tree: Record<string, string> = {}
  const files: Record<string, RecordedFile> = {}
  for (const file of raw.files) {
    const inside = inRepo(root, file.file)
    if (inside === undefined || file.verdict === 'skipped') continue
    const { reads, incomplete } = readsOf(root, file, raw.config)
    for (const key of reads) tree[key] = digest(key)
    files[inside] = { verdict: file.verdict, incomplete, reads }
  }
  return { version: 1, ...at, tree, files }
}

export type Cell = 'no-record' | 'incomplete' | 'changed' | 'hit-same' | 'hit-different'

export interface FileOutcome {
  readonly file: string
  readonly cell: Cell
  readonly now: Verdict
  readonly was?: Verdict
  readonly changed?: readonly string[]
}

const CHANGED_SHOWN = 5

export function compareRecords(
  previous: ReadSetRecord | undefined,
  current: ReadSetRecord,
  digest: Digest,
): FileOutcome[] {
  return Object.keys(current.files)
    .sort()
    .map(file => {
      const now = (current.files[file] as RecordedFile).verdict
      const before = previous?.files[file]
      if (previous === undefined || before === undefined) return { file, cell: 'no-record', now }
      const was = before.verdict
      if (before.incomplete.length > 0) return { file, cell: 'incomplete', now, was }
      const changed = before.reads.filter(key => previous.tree[key] !== digest(key))
      if (changed.length > 0)
        return { file, cell: 'changed', now, was, changed: changed.slice(0, CHANGED_SHOWN) }
      return { file, cell: was === now ? 'hit-same' : 'hit-different', now, was }
    })
}

export interface MemberReadSets {
  readonly member: string
  readonly outcomes: readonly FileOutcome[]
  readonly incompleteNow: Readonly<Record<string, number>>
  readonly problem?: string
}

function incompleteCounts(record: ReadSetRecord): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const file of Object.values(record.files))
    for (const reason of file.incomplete) counts[reason] = (counts[reason] ?? 0) + 1
  return counts
}

export function describeReadSets(members: readonly MemberReadSets[]): string[] {
  const outcomes = members.flatMap(member => member.outcomes)
  const count = (cell: Cell) => outcomes.filter(outcome => outcome.cell === cell).length
  const same = count('hit-same')
  const different = outcomes.filter(outcome => outcome.cell === 'hit-different')
  const lines = [
    `读集：这一次记了 ${outcomes.length} 份用例文件（${members.filter(member => member.problem === undefined).length} 个成员）。` +
      `对着上一次的记录：会命中 ${same + different.length} 份（裁定相同 ${same} 份，不同 ${different.length} 份），` +
      `读集变了 ${count('changed')} 份，上一次读集不全 ${count('incomplete')} 份，没有上一次记录 ${count('no-record')} 份`,
  ]
  if (different.length > 0)
    lines.push(
      '命中而裁定不同（读集不全或用例不确定的证据）：',
      ...different.map(
        outcome => `  ${outcome.file}：上一次 ${outcome.was ?? '?'}，这一次 ${outcome.now}`,
      ),
    )
  const reasons: Record<string, number> = {}
  for (const member of members)
    for (const [reason, files] of Object.entries(member.incompleteNow))
      reasons[reason] = (reasons[reason] ?? 0) + files
  const listed = Object.entries(reasons).sort(([, a], [, b]) => b - a)
  if (listed.length > 0)
    lines.push(
      `这一次读集不全的原因（一份文件可以有几个）：${listed.map(([reason, files]) => `${reason} ${files} 份`).join('、')}`,
    )
  const problems = members.filter(member => member.problem !== undefined)
  if (problems.length > 0)
    lines.push(
      `没有读集的成员 ${problems.length} 个：${problems.map(member => `${member.member}（${member.problem ?? ''}）`).join('、')}`,
    )
  return lines
}

function isRecord(value: unknown): value is ReadSetRecord {
  if (typeof value !== 'object' || value === null) return false
  const { version, tree, files } = value as Partial<ReadSetRecord>
  return (
    version === 1 &&
    typeof tree === 'object' &&
    tree !== null &&
    typeof files === 'object' &&
    files !== null
  )
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export function readRecord(path: string): ReadSetRecord | undefined {
  const parsed = readJson(path)
  return isRecord(parsed) ? parsed : undefined
}

export function writeRecord(path: string, record: ReadSetRecord): void {
  mkdirSync(dirname(path), { recursive: true })
  const partial = `${path}.${process.pid}.partial`
  writeFileSync(partial, `${JSON.stringify(record)}\n`)
  renameSync(partial, path)
}

export function readRaw(path: string): RawReadSets | undefined {
  const parsed = readJson(path) as Partial<RawReadSets> | undefined
  return Array.isArray(parsed?.config) && Array.isArray(parsed.files)
    ? (parsed as RawReadSets)
    : undefined
}

export interface RecordOptions {
  readonly root: string
  readonly home: string
  readonly runDir: string
  readonly tier: RunTier
  readonly head: string
  readonly recordedAt: string
  readonly members: readonly { readonly path: string; readonly slug: string }[]
}

export function recordReadSets(options: RecordOptions): MemberReadSets[] {
  const { root, home, runDir, tier, head, recordedAt } = options
  const digest = digests(root)
  return options.members.map(({ path: member, slug }) => {
    const raw = readRaw(join(runDir, `${slug}.reads.json`))
    if (raw === undefined)
      return { member, outcomes: [], incompleteNow: {}, problem: '这次运行没有写出读集' }
    try {
      const record = recordOf(root, raw, digest, { head, recordedAt })
      const target = recordPath(home, slug, tier)
      const outcomes = compareRecords(readRecord(target), record, digest)
      writeRecord(target, record)
      return { member, outcomes, incompleteNow: incompleteCounts(record) }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { member, outcomes: [], incompleteNow: {}, problem: `记录没有写成：${reason}` }
    }
  })
}
