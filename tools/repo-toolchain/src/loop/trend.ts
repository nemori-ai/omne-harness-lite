import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { git } from '../core/git.ts'
import type { Band } from './bands.ts'
import { BUDGET_ITEMS, type BudgetItem } from './config.ts'

export interface IndicatorSnapshot {
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
  readonly snapshots: readonly Snapshot[]
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
  | { readonly write: true }
  | { readonly write: false; readonly reason: string }

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

export function ancestorSnapshots(snapshots: readonly Snapshot[], ancestry: Ancestry): Snapshot[] {
  const latest = new Map<string, Snapshot>()
  for (const snapshot of snapshots)
    if (ancestry.has(snapshot.commit)) latest.set(snapshot.commit, snapshot)
  return [...latest.values()].sort(
    (a, b) => (ancestry.get(b.commit) ?? 0) - (ancestry.get(a.commit) ?? 0),
  )
}

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
