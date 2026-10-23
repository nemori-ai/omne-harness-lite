// 契约 API 快照的差异粗分类：none、additive、review。
// 结构上的增删（入口、导出、整份快照、标注）在这里按规则定；同名导出与扩充的形状由检查器双向比较（api-compare.ts）：
// 两向都可赋值是 additive（声明文本也相同时是 none），任一向不成立是 review。
// 这是粗分类：review 的意思是「需要人判断」，不是 PR「契约变化」的级别。拿不准一律 review。
import { compareSnapshots, type CompareTarget, type Verdict } from './api-compare.ts'
import {
  byCodeUnit,
  renderSnapshot,
  type ApiSnapshot,
  type EntryExport,
  type EntrySection,
  type ExportOrigin,
} from './api-format.ts'
import { normalizedFiles } from './api-normalize.ts'

export type ApiChange = 'none' | 'additive' | 'review'

const RANK: Readonly<Record<ApiChange, number>> = { none: 0, additive: 1, review: 2 }

export function strongest(changes: readonly ApiChange[]): ApiChange {
  return changes.reduce<ApiChange>((a, b) => (RANK[b] > RANK[a] ? b : a), 'none')
}

/** 差异落在哪里：整份快照、一个入口、入口里的一个导出，或一处对外扩充。 */
export type DifferenceTarget =
  | { readonly scope: 'snapshot' }
  | { readonly scope: 'entry'; readonly entry: string }
  | { readonly scope: 'export'; readonly entry: string; readonly name: string }
  | { readonly scope: 'augmentation'; readonly target: string; readonly name: string }

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

export interface Difference {
  readonly target: DifferenceTarget
  readonly kind: DifferenceKind
  readonly change: Exclude<ApiChange, 'none'>
  /** 检查器比较过时：新值能否交给旧读方、旧写方的值能否被新声明接受。 */
  readonly readers?: boolean
  readonly writers?: boolean
  readonly notes?: readonly string[]
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

/** 比较两份快照；`undefined` 表示那一侧没有快照。两侧都没有是 review：没有可比的东西，不能当作没变。 */
export function classifySnapshots(
  before: ApiSnapshot | undefined,
  after: ApiSnapshot | undefined,
  context: ClassifyContext,
): SnapshotDifference {
  if (before === undefined && after === undefined)
    return result([{ target: WHOLE, kind: 'missing', change: 'review' }])
  if (before === undefined) return result([{ target: WHOLE, kind: 'added', change: 'additive' }])
  if (after === undefined) return result([{ target: WHOLE, kind: 'removed', change: 'review' }])
  const renamed: Difference[] =
    before.packageName === after.packageName
      ? []
      : [{ target: WHOLE, kind: 'renamed', change: 'review' }]
  if (renderSnapshot(before) === renderSnapshot({ ...after, packageName: before.packageName }))
    return result(renamed)
  const structure = compareEntries(before, after)
  const checked = compareShapes(before, after, structure.common, context)
  const differences = [...renamed, ...structure.differences, ...checked]
  if (strongest(differences.map(item => item.change)) === 'none' && changedText(before, after))
    differences.push({
      target: WHOLE,
      kind: 'changed',
      change: 'additive',
      notes: ['声明有变化，检查器没有发现不兼容'],
    })
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
    if (a !== undefined && b !== undefined) compareExports(structure, a, b)
    else if (a !== undefined)
      structure.differences.push({
        target: { scope: 'entry', entry: subpath },
        kind: 'removed',
        change: 'review',
      })
    else
      structure.differences.push({
        target: { scope: 'entry', entry: subpath },
        kind: 'added',
        change: 'additive',
      })
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
      structure.differences.push({ target, kind: 'removed', change: 'review' })
    else if (!sameMarks(a, b))
      structure.differences.push({ target, kind: 'marked', change: 'review' })
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

function compareShapes(
  before: ApiSnapshot,
  after: ApiSnapshot,
  exports: readonly { entry: string; name: string }[],
  context: ClassifyContext,
): Difference[] {
  const comparison = compareSnapshots({
    root: context.root,
    directory: context.directory,
    before,
    after,
    exports,
  })
  const differences = comparison.verdicts.flatMap(verdictDifference)
  if (comparison.problems.length > 0)
    differences.push({
      target: WHOLE,
      kind: 'unresolved',
      change: 'review',
      notes: comparison.problems,
    })
  return differences
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

function verdictDifference(verdict: Verdict): Difference[] {
  const compatible = verdict.readers && verdict.writers
  if (compatible && verdict.same) return []
  const detail = {
    readers: verdict.readers,
    writers: verdict.writers,
    ...(verdict.notes.length > 0 ? { notes: verdict.notes } : {}),
  }
  return [
    {
      target: differenceTarget(verdict.target),
      kind: 'changed',
      change: compatible ? 'additive' : 'review',
      ...detail,
    },
  ]
}
