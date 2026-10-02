// 趋势快照：一行一条 JSON，记某个提交上各指标的值与带位、各成员的预算值与带位。
// 只在工作树干净时写（不干净的度量不是任何提交的度量），同一个提交只写一次。
// 「上一次的带位」与「基线快照」都按提交祖先关系从这里找，不按记录时间。
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { git } from '../metrics/git.ts'
import type { Band } from './bands.ts'
import { BUDGET_ITEMS, type BudgetItem } from './config.ts'

export interface IndicatorSnapshot {
  /** 没有数据时为 null。 */
  readonly value: number | null
  readonly band: Band | null
}

export type MemberSnapshot = Readonly<Record<BudgetItem, number | null>> & { readonly band: Band }

export interface Snapshot {
  readonly schema: 1
  readonly commit: string
  readonly committedAt: string
  readonly recordedAt: string
  readonly branch: string
  readonly indicators: Readonly<Record<string, IndicatorSnapshot>>
  readonly members: Readonly<Record<string, MemberSnapshot>>
}

export interface TrendRead {
  /** 文件里的顺序。 */
  readonly snapshots: readonly Snapshot[]
  /** 读不了的行号（1 起）。 */
  readonly badLines: readonly number[]
}

const BANDS: readonly unknown[] = ['normal', 'warn', 'act']
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const numberOrNull = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isFinite(value))

function isIndicator(value: unknown): value is IndicatorSnapshot {
  return (
    isRecord(value) &&
    numberOrNull(value['value']) &&
    (value['band'] === null || BANDS.includes(value['band']))
  )
}

function isMember(value: unknown): value is MemberSnapshot {
  return (
    isRecord(value) &&
    BANDS.includes(value['band']) &&
    BUDGET_ITEMS.every(item => numberOrNull(value[item]))
  )
}

export function parseSnapshot(line: string): Snapshot | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (
    !isRecord(value) ||
    value['schema'] !== 1 ||
    typeof value['commit'] !== 'string' ||
    typeof value['committedAt'] !== 'string' ||
    typeof value['recordedAt'] !== 'string' ||
    typeof value['branch'] !== 'string' ||
    !isRecord(value['indicators']) ||
    !Object.values(value['indicators']).every(isIndicator) ||
    !isRecord(value['members']) ||
    !Object.values(value['members']).every(isMember)
  )
    return undefined
  return {
    schema: 1,
    commit: value['commit'],
    committedAt: value['committedAt'],
    recordedAt: value['recordedAt'],
    branch: value['branch'],
    indicators: value['indicators'] as Record<string, IndicatorSnapshot>,
    members: value['members'] as Record<string, MemberSnapshot>,
  }
}

/** 读趋势文件；文件不存在当作空的，坏行跳过并记下行号。 */
export function readTrend(path: string): TrendRead {
  if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true)
    return { snapshots: [], badLines: [] }
  const snapshots: Snapshot[] = []
  const badLines: number[] = []
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (line.trim() === '') return
      const snapshot = parseSnapshot(line)
      if (snapshot === undefined) badLines.push(index + 1)
      else snapshots.push(snapshot)
    })
  return { snapshots, badLines }
}

export type SnapshotDecision =
  { readonly write: true } | { readonly write: false; readonly reason: string }

/** 干净的工作树上，给了 `--snapshot` 或 HEAD 正是主线的头，才写；同一个提交已有就不再写。 */
export function snapshotDecision(input: {
  readonly requested: boolean
  readonly dirty: boolean
  readonly headIsPrimary: boolean
  readonly primaryBranch: string
  readonly alreadyRecorded: boolean
}): SnapshotDecision {
  if (!input.requested && !input.headIsPrimary)
    return { write: false, reason: `没要求写快照，HEAD 也不是 ${input.primaryBranch} 的头` }
  if (input.dirty) return { write: false, reason: '工作树不干净，不写快照' }
  if (input.alreadyRecorded) return { write: false, reason: '这个提交已有快照，不重复写' }
  return { write: true }
}

export function appendSnapshot(path: string, snapshot: Snapshot): void {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(snapshot)}\n`)
}

/**
 * 提交 → 它离 `tip` 有多远（0 是 `tip` 自己）。只含 `tip` 的祖先，用来判「是不是祖先」与「哪条最近」。
 */
export type Ancestry = ReadonlyMap<string, number>

export function ancestryOf(root: string, tip: string): Ancestry {
  const order = new Map<string, number>()
  git(root, ['rev-list', '--topo-order', tip])
    .split('\n')
    .forEach((sha, index) => {
      if (sha !== '') order.set(sha, index)
    })
  return order
}

/** 祖先（含 tip 自己）上的快照，从旧到新；同一提交有多条时取文件里最后一条。 */
export function ancestorSnapshots(snapshots: readonly Snapshot[], ancestry: Ancestry): Snapshot[] {
  const latest = new Map<string, Snapshot>()
  for (const snapshot of snapshots)
    if (ancestry.has(snapshot.commit)) latest.set(snapshot.commit, snapshot)
  return [...latest.values()].sort(
    (a, b) => (ancestry.get(b.commit) ?? 0) - (ancestry.get(a.commit) ?? 0),
  )
}

/** 「上一次」：最近一条是当前提交祖先（或就是当前提交）的快照。 */
export function previousSnapshot(
  snapshots: readonly Snapshot[],
  headAncestry: Ancestry,
): Snapshot | undefined {
  return ancestorSnapshots(snapshots, headAncestry).at(-1)
}

export type BaselineSnapshot =
  | { readonly kind: 'exact'; readonly snapshot: Snapshot }
  | { readonly kind: 'ancestor'; readonly snapshot: Snapshot }
  | { readonly kind: 'none' }

/**
 * 基线快照：合并点那个提交的快照；没有就取最近一条是合并点祖先的；再没有就无。
 * 当前提交自己的快照不拿来当基线——和自己比没有意义。
 */
export function baselineSnapshot(
  snapshots: readonly Snapshot[],
  mergeBase: string,
  mergeBaseAncestry: Ancestry,
  head: string,
): BaselineSnapshot {
  const candidates = snapshots.filter(snapshot => snapshot.commit !== head)
  const exact = candidates.filter(snapshot => snapshot.commit === mergeBase).at(-1)
  if (exact !== undefined) return { kind: 'exact', snapshot: exact }
  const ancestor = ancestorSnapshots(candidates, mergeBaseAncestry).at(-1)
  return ancestor === undefined ? { kind: 'none' } : { kind: 'ancestor', snapshot: ancestor }
}
