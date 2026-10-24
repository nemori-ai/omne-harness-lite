// 契约 API 快照的差异粗分类：none、additive、review。白名单门：只有正证据成立才是 additive。
//   none：两侧规范化文本相同。
//   additive：每一处差异都在「可加改动」表的白名单里（新增导出；接口、类型字面量或扩充接口里新增可选属性），
//     并且检查器对涉及的每个导出用同一种写法证明两个方向都可赋值。
//   review：其余一切。附注写明命中哪一条：白名单外改动、涉及的导出没有被比较覆盖、方向不成立、检查器未完成、
//     实例组合超限、编译诊断、导出引用了被扩充的外部接口。
// 白名单的语法判断在 api-whitelist.ts，检查器证明在 api-compare.ts，这里把两者合成结论（judge 是纯函数）。
// 这是粗分类：review 的意思是「需要人判断」，不是 PR「契约变化」的级别。拿不准一律 review。
import {
  compareSnapshots,
  type CheckerComparison,
  type CompareTarget,
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
import { whitelistDifferences, type WhitelistResult } from './api-whitelist.ts'

export type ApiChange = 'none' | 'additive' | 'review'

const RANK: Readonly<Record<ApiChange, number>> = { none: 0, additive: 1, review: 2 }

export function strongest(changes: readonly ApiChange[]): ApiChange {
  return changes.reduce<ApiChange>((a, b) => (RANK[b] > RANK[a] ? b : a), 'none')
}

/** 差异落在哪里：整份快照、一个入口、入口里的一个导出、一处对外扩充，或某个声明文件里的一条语句。 */
export type DifferenceTarget =
  | { readonly scope: 'snapshot' }
  | { readonly scope: 'entry'; readonly entry: string }
  | { readonly scope: 'export'; readonly entry: string; readonly name: string }
  | { readonly scope: 'augmentation'; readonly target: string; readonly name: string }
  | { readonly scope: 'declaration'; readonly path: string; readonly statement: string }

/**
 * added／removed／changed：增删改；marked：导出标注变了（改名、仅类型、声明来源）；
 * renamed：包名变了；missing：两边都没有快照；unresolved：还原的声明有编译诊断，检查器的结论不可信。
 */
export type DifferenceKind =
  | 'added'
  | 'removed'
  | 'changed'
  | 'marked'
  | 'renamed'
  | 'missing'
  | 'unresolved'

/**
 * review 的依据。outside-whitelist：改动不在白名单里（含删除、标注变化、包名变化、两侧都没有快照）；
 * uncovered：涉及的导出或扩充没有任何可赋值比较；direction：某个方向不成立；incomplete：检查器没有给出结论；
 * truncated：类型参数实例组合超过上限；diagnostics：还原的声明有编译诊断；
 * augmented-reference：导出引用了本次有扩充改动的外部接口。
 */
export type ReviewReason =
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
  | { readonly kind: 'augmented-reference'; readonly target: string; readonly name: string }

export type Difference =
  | {
      readonly target: DifferenceTarget
      readonly kind: DifferenceKind
      readonly change: 'additive'
      /** 检查器比较过并证明两个方向都成立时为 true。 */
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

/** 检查器还原声明要用的位置：外部包从检出根解析。 */
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

/** 比较两份快照；`undefined` 表示那一侧没有快照。两侧都没有是 review：没有可比的东西，不能当作没变。 */
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
  const whitelist = whitelistDifferences(before.files, after.files)
  const comparison = compareSnapshots({
    root: context.root,
    directory: context.directory,
    before,
    after,
    exports: structure.common,
  })
  return judge({
    structure: [...renamed, ...structure.differences],
    whitelist,
    comparison,
    textChanged: changedText(before, after),
  })
}

export interface JudgeInput {
  /** 结构上的增删与标注变化，已经按规则分好类。 */
  readonly structure: readonly Difference[]
  readonly whitelist: WhitelistResult
  readonly comparison: CheckerComparison
  /** 规范化后的声明文本有变化（参数改名、注释与布局之外）。 */
  readonly textChanged: boolean
}

/**
 * 白名单门的判定（纯函数）：结构差异照收；白名单外的语句改动各记一项 review；
 * 每个检查器结论按问题种类记 review，涉及却没有比较覆盖的也记 review，引用了被扩充外部接口的记 review；
 * 两侧文本变了而没有任何差异落到导出上时，整份记一项 additive。整份取最强。
 */
export function judge(input: JudgeInput): SnapshotDifference {
  const differences: Difference[] = [...input.structure]
  for (const item of input.whitelist.outside)
    differences.push(
      review({ scope: 'declaration', path: item.path, statement: item.statement }, item.change, [
        outside(item.why),
      ]),
    )
  for (const verdict of input.comparison.verdicts)
    differences.push(...verdictDifference(verdict, input.whitelist.changed))
  if (input.comparison.problems.length > 0)
    differences.push(
      review(WHOLE, 'unresolved', [{ kind: 'diagnostics', details: input.comparison.problems }]),
    )
  if (strongest(differences.map(item => item.change)) === 'none' && input.textChanged)
    differences.push({ target: WHOLE, kind: 'changed', change: 'additive' })
  return result(differences)
}

/** 参数改名、注释与布局之外的声明变化。 */
function changedText(before: ApiSnapshot, after: ApiSnapshot): boolean {
  const a = normalizedFiles(before.files)
  const b = normalizedFiles(after.files)
  return a.size !== b.size || [...a].some(([path, text]) => b.get(path) !== text)
}

interface Structure {
  readonly differences: Difference[]
  /** 两侧都有、标注也相同的导出：交给检查器比形状。 */
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

/** 标注相同：改名、仅类型一致，来源同为本成员（文件可以挪动）或同一个外部包。 */
function sameMarks(a: EntryExport, b: EntryExport): boolean {
  if (a.typeOnly !== b.typeOnly || a.renamedFrom !== b.renamedFrom) return false
  return sameOrigin(a.origin, b.origin)
}

function sameOrigin(a: ExportOrigin, b: ExportOrigin): boolean {
  if (a.kind === 'package' && b.kind === 'package') return a.name === b.name
  return a.kind === b.kind
}

function differenceTarget(target: CompareTarget): DifferenceTarget {
  switch (target.kind) {
    case 'export':
      return { scope: 'export', entry: target.entry, name: target.name }
    case 'augmentation':
      return { scope: 'augmentation', target: target.target, name: target.name }
    default: {
      const _exhaustive: never = target
      return _exhaustive
    }
  }
}

/** 检查器的一条结论变成差异：有任何 review 依据就是 review，否则文本变了才记一项 additive。 */
function verdictDifference(verdict: Verdict, changed: ReadonlySet<string>): Difference[] {
  const reasons = reviewReasons(verdict, changed)
  const target = differenceTarget(verdict.target)
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
  for (const item of verdict.augmentedReferences)
    reasons.push({ kind: 'augmented-reference', target: item.target, name: item.name })
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
