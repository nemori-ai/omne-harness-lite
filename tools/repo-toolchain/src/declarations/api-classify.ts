import {
  compareSnapshots,
  oldSideScope,
  type CheckerComparison,
  type Verdict,
  type VerdictProblem,
} from './api-compare.ts'
import {
  byCodeUnit,
  renderSnapshot,
  type ApiSnapshot,
  type EntryExport,
  type EntrySection,
  type ExportOrigin,
} from './api-format.ts'
import { normalizedFiles } from './api-normalize.ts'
import {
  whitelistDifferences,
  type StatementChange,
  type WhitelistResult,
} from './api-whitelist.ts'

export type ApiChange = 'none' | 'additive' | 'review'

const RANK: Readonly<Record<ApiChange, number>> = { none: 0, additive: 1, review: 2 }

export function strongest(changes: readonly ApiChange[]): ApiChange {
  return changes.reduce<ApiChange>((a, b) => (RANK[b] > RANK[a] ? b : a), 'none')
}

export type DifferenceTarget =
  | { readonly scope: 'snapshot' }
  | { readonly scope: 'entry'; readonly entry: string }
  | { readonly scope: 'export'; readonly entry: string; readonly name: string }
  | { readonly scope: 'declaration'; readonly path: string; readonly statement: string }

export type DifferenceKind =
  | 'added'
  | 'removed'
  | 'changed'
  | 'marked'
  | 'renamed'
  | 'missing'
  | 'unresolved'

export type ReviewReason =
  | { readonly kind: 'global-scope-change'; readonly why: string }
  | { readonly kind: 'outside-whitelist'; readonly why: string }
  | { readonly kind: 'uncovered' }
  | {
      readonly kind: 'direction'
      readonly readers: boolean
      readonly writers: boolean
      readonly details: readonly string[]
    }
  | { readonly kind: 'incomplete'; readonly details: readonly string[] }
  | { readonly kind: 'truncated'; readonly limit: number; readonly total: number }
  | { readonly kind: 'diagnostics'; readonly details: readonly string[] }

export type Difference =
  | {
      readonly target: DifferenceTarget
      readonly kind: DifferenceKind
      readonly change: 'additive'
      readonly proved?: true
    }
  | {
      readonly target: DifferenceTarget
      readonly kind: DifferenceKind
      readonly change: 'review'
      readonly reasons: readonly [ReviewReason, ...ReviewReason[]]
    }

export interface SnapshotDifference {
  readonly change: ApiChange
  readonly differences: readonly Difference[]
}

export interface ClassifyContext {
  readonly root: string
  readonly directory: string
}

function result(differences: readonly Difference[]): SnapshotDifference {
  return { change: strongest(differences.map(item => item.change)), differences }
}

const WHOLE = { scope: 'snapshot' } as const

const outside = (why: string): ReviewReason => ({ kind: 'outside-whitelist', why })

function review(
  target: DifferenceTarget,
  kind: DifferenceKind,
  reasons: readonly [ReviewReason, ...ReviewReason[]],
): Difference {
  return { target, kind, change: 'review', reasons }
}

export function classifySnapshots(
  before: ApiSnapshot | undefined,
  after: ApiSnapshot | undefined,
  context: ClassifyContext,
): SnapshotDifference {
  if (before === undefined && after === undefined)
    return result([review(WHOLE, 'missing', [outside('两侧都没有快照')])])
  if (before === undefined) return result([{ target: WHOLE, kind: 'added', change: 'additive' }])
  if (after === undefined) return result([review(WHOLE, 'removed', [outside('整份快照删除了')])])
  const renamed: Difference[] =
    before.packageName === after.packageName
      ? []
      : [review(WHOLE, 'renamed', [outside('包名变了')])]
  if (renderSnapshot(before) === renderSnapshot({ ...after, packageName: before.packageName }))
    return result(renamed)
  const structure = compareEntries(before, after)
  const whitelist = whitelistDifferences(before.files, after.files, {
    exported: exportedNames(before),
    resolve: oldSideScope({
      root: context.root,
      directory: context.directory,
      files: before.files,
    }),
  })
  const judging = {
    structure: [...renamed, ...structure.differences],
    whitelist,
    textChanged: changedText(before, after),
  }
  if (whitelist.global.length > 0) return judge({ ...judging, comparison: undefined })
  const comparison = compareSnapshots({
    root: context.root,
    directory: context.directory,
    before,
    after,
    exports: structure.common,
  })
  return judge({ ...judging, comparison })
}

export interface JudgeInput {
  readonly structure: readonly Difference[]
  readonly whitelist: WhitelistResult
  readonly comparison: CheckerComparison | undefined
  readonly textChanged: boolean
}

export function judge(input: JudgeInput): SnapshotDifference {
  const differences: Difference[] = [...input.structure]
  const declaration = (item: StatementChange) =>
    ({ scope: 'declaration', path: item.path, statement: item.statement }) as const
  for (const item of input.whitelist.global)
    differences.push(
      review(declaration(item), item.change, [{ kind: 'global-scope-change', why: item.why }]),
    )
  for (const item of input.whitelist.outside)
    differences.push(review(declaration(item), item.change, [outside(item.why)]))
  if (input.comparison !== undefined) {
    for (const verdict of input.comparison.verdicts)
      differences.push(...verdictDifference(verdict, input.whitelist.changed))
    if (input.comparison.problems.length > 0)
      differences.push(
        review(WHOLE, 'unresolved', [{ kind: 'diagnostics', details: input.comparison.problems }]),
      )
  }
  if (strongest(differences.map(item => item.change)) === 'none' && input.textChanged)
    differences.push({ target: WHOLE, kind: 'changed', change: 'additive' })
  return result(differences)
}

function exportedNames(snapshot: ApiSnapshot): ReadonlyMap<string, readonly string[]> {
  const names = new Map<string, string[]>()
  for (const entry of snapshot.entries)
    for (const item of entry.exports) {
      const entries = names.get(item.name) ?? []
      entries.push(entry.subpath)
      names.set(item.name, entries)
    }
  return names
}

function changedText(before: ApiSnapshot, after: ApiSnapshot): boolean {
  const a = normalizedFiles(before.files)
  const b = normalizedFiles(after.files)
  return a.size !== b.size || [...a].some(([path, text]) => b.get(path) !== text)
}

interface Structure {
  readonly differences: Difference[]
  readonly common: { entry: string; name: string }[]
}

function compareEntries(before: ApiSnapshot, after: ApiSnapshot): Structure {
  const structure: Structure = { differences: [], common: [] }
  const old = new Map(before.entries.map(entry => [entry.subpath, entry]))
  const next = new Map(after.entries.map(entry => [entry.subpath, entry]))
  for (const subpath of [...new Set([...old.keys(), ...next.keys()])].sort(byCodeUnit)) {
    const a = old.get(subpath)
    const b = next.get(subpath)
    const target = { scope: 'entry', entry: subpath } as const
    if (a !== undefined && b !== undefined) compareExports(structure, a, b)
    else if (a !== undefined)
      structure.differences.push(review(target, 'removed', [outside('入口删除了')]))
    else structure.differences.push({ target, kind: 'added', change: 'additive' })
  }
  return structure
}

function compareExports(structure: Structure, before: EntrySection, after: EntrySection): void {
  const old = new Map(before.exports.map(item => [item.name, item]))
  const next = new Map(after.exports.map(item => [item.name, item]))
  for (const name of [...new Set([...old.keys(), ...next.keys()])].sort(byCodeUnit)) {
    const a = old.get(name)
    const b = next.get(name)
    const target = { scope: 'export', entry: after.subpath, name } as const
    if (a === undefined) structure.differences.push({ target, kind: 'added', change: 'additive' })
    else if (b === undefined)
      structure.differences.push(review(target, 'removed', [outside('导出删除了')]))
    else if (!sameMarks(a, b))
      structure.differences.push(
        review(target, 'marked', [outside('导出的标注变了（改名、仅类型或声明来源）')]),
      )
    else if (b.origin.kind !== 'package') structure.common.push({ entry: after.subpath, name })
  }
}

function sameMarks(a: EntryExport, b: EntryExport): boolean {
  if (a.typeOnly !== b.typeOnly || a.renamedFrom !== b.renamedFrom) return false
  return sameOrigin(a.origin, b.origin)
}

function sameOrigin(a: ExportOrigin, b: ExportOrigin): boolean {
  if (a.kind === 'package' && b.kind === 'package') return a.name === b.name
  return a.kind === b.kind
}

function verdictDifference(verdict: Verdict, changed: ReadonlySet<string>): Difference[] {
  const reasons = reviewReasons(verdict, changed)
  const target = {
    scope: 'export',
    entry: verdict.target.entry,
    name: verdict.target.name,
  } as const
  const [first, ...rest] = reasons
  if (first !== undefined) return [review(target, 'changed', [first, ...rest])]
  return verdict.same ? [] : [{ target, kind: 'changed', change: 'additive', proved: true }]
}

function reviewReasons(verdict: Verdict, changed: ReadonlySet<string>): ReviewReason[] {
  const reasons: ReviewReason[] = []
  const grouped = groupProblems(verdict.problems)
  if (grouped.direction.length > 0)
    reasons.push({
      kind: 'direction',
      readers: verdict.readers,
      writers: verdict.writers,
      details: grouped.direction,
    })
  if (grouped.incomplete.length > 0)
    reasons.push({ kind: 'incomplete', details: grouped.incomplete })
  reasons.push(...grouped.truncated)
  const involved = !verdict.same || verdict.reaches.some(id => changed.has(id))
  if (involved && verdict.comparisons === 0 && reasons.length === 0)
    reasons.push({ kind: 'uncovered' })
  return reasons
}

function groupProblems(problems: readonly VerdictProblem[]): {
  direction: string[]
  incomplete: string[]
  truncated: ReviewReason[]
} {
  const grouped = {
    direction: [] as string[],
    incomplete: [] as string[],
    truncated: [] as ReviewReason[],
  }
  for (const problem of problems) {
    switch (problem.kind) {
      case 'direction':
        grouped.direction.push(`${problem.label}：${problem.why}`)
        break
      case 'incomplete':
        grouped.incomplete.push(problem.why)
        break
      case 'truncated':
        grouped.truncated.push({ kind: 'truncated', limit: problem.limit, total: problem.total })
        break
      default: {
        const _exhaustive: never = problem
        return _exhaustive
      }
    }
  }
  return grouped
}
