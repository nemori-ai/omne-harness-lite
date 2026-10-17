// 成员预算：每个成员四项，各有三条线。任一项处于「处置」的成员超预算。
// 上一次的带位按趋势里这个成员各项的历史值重放得到（快照只记成员的总带位，各项的带位由值与线还原）。
// 「解除之后又进入处置」反复发生的，是清理解决不了的结构问题，上报而不派清理。
// 配置为与基线比时，基线快照里有的成员只在变差时进提醒、没变差就算正常；处置照绝对线判，
// 所以超预算的条件与「上一次的带位」的重放都不受它影响。
import { compare, replay, worse, bandOf, type Band, type Lines } from './bands.ts'
import { BUDGET_ITEMS, type BudgetItem } from './config.ts'
import type { MemberSnapshot, Snapshot } from './trend.ts'

export const BUDGET_LABELS: Readonly<Record<BudgetItem, string>> = {
  overAlert: '超 alert 的函数数',
  risk: '风险值',
  duplication: '重复行占比（%）',
  testsWithoutAssertions: '没有断言的测试数',
}

export type BudgetValues = Readonly<Record<BudgetItem, number | undefined>>

/**
 * 一个成员拿什么与基线比：配置里不比（off）、没有基线快照（none）、
 * 或基线快照里这个成员的条目（快照里没有这个成员，即新成员，为 undefined）。
 */
export type MemberBaseline =
  | { readonly kind: 'off' }
  | { readonly kind: 'none' }
  | { readonly kind: 'snapshot'; readonly entry: MemberSnapshot | undefined }

/** 一项预算与基线比的结果；`new` 是基线快照里没有这个成员，`unjudged` 写明为什么没比。 */
export type ItemComparison =
  | { readonly result: 'better' | 'same' | 'worse'; readonly baseline: number }
  | { readonly result: 'new' }
  | { readonly result: 'unjudged'; readonly reason: string }

export interface MemberBudget {
  readonly member: string
  /** undefined：这一项这次没有数据。 */
  readonly values: BudgetValues
  readonly bands: Readonly<Record<BudgetItem, Band | undefined>>
  /** 与基线比；配置里不比时缺席，这一项没有数据时为 undefined。 */
  readonly comparisons?: Readonly<Record<BudgetItem, ItemComparison | undefined>>
  /** 各项里最差的带位。 */
  readonly band: Band
  /** 处于处置的项。 */
  readonly over: readonly BudgetItem[]
  /** 历史上加这一次，「解除之后又进入处置」的次数。 */
  readonly relapses: number
  /** 超预算且反复变红达到上限。 */
  readonly structural: boolean
}

/** 一串带位里「处置 → 非处置 → 处置」的再进入次数。 */
export function countRelapses(bands: readonly Band[]): number {
  let relapses = 0
  let wasAct = false
  let released = false
  for (const band of bands) {
    if (band === 'act') {
      if (released) relapses += 1
      wasAct = true
      released = false
    } else if (wasAct) released = true
  }
  return relapses
}

function comparisonOf(
  value: number,
  item: BudgetItem,
  baseline: Exclude<MemberBaseline, { kind: 'off' }>,
): ItemComparison {
  if (baseline.kind === 'none') return { result: 'unjudged', reason: '没有基线快照' }
  if (baseline.entry === undefined) return { result: 'new' }
  const before = baseline.entry[item]
  if (before === null) return { result: 'unjudged', reason: '基线快照里这一项没有数据' }
  const result = compare(value, before)
  return result === 'unjudged'
    ? { result, reason: '基线快照里这一项没有数据' }
    : { result, baseline: before }
}

/** 绝对线判出处置的照旧是处置；其余比基线差了是提醒，没变差是正常，新成员与未判的照绝对线。 */
function againstBaseline(absolute: Band, comparison: ItemComparison): Band {
  if (absolute === 'act') return absolute
  switch (comparison.result) {
    case 'worse':
      return 'warn'
    case 'better':
    case 'same':
      return 'normal'
    default:
      return absolute
  }
}

/**
 * @param history 当前提交的祖先（含它自己）上的快照，从旧到新。
 * @param head 当前提交；它自己的旧快照参与重放上一次的带位，但不算进再进入的次数（这一次会替代它）。
 * @param baseline 与基线比的依据；「上一次的带位」照旧按绝对线重放，不受它影响。
 */
export function judgeMember(input: {
  readonly member: string
  readonly values: BudgetValues
  readonly budget: Readonly<Record<BudgetItem, Lines>>
  readonly history: readonly Snapshot[]
  readonly head: string
  readonly relapseLimit: number
  readonly baseline: MemberBaseline
}): MemberBudget {
  const past = input.history.map(snapshot => snapshot.members[input.member])
  const bands = {} as Record<BudgetItem, Band | undefined>
  const comparisons = {} as Record<BudgetItem, ItemComparison | undefined>
  let band: Band = 'normal'
  for (const item of BUDGET_ITEMS) {
    const value = input.values[item]
    bands[item] = undefined
    comparisons[item] = undefined
    if (value === undefined) continue
    const previous = replay(
      past.map(entry => entry?.[item] ?? undefined),
      input.budget[item],
    )
    let current = bandOf(value, input.budget[item], previous)
    if (input.baseline.kind !== 'off') {
      const comparison = comparisonOf(value, item, input.baseline)
      comparisons[item] = comparison
      current = againstBaseline(current, comparison)
    }
    bands[item] = current
    band = worse(band, current)
  }
  const sequence = input.history
    .filter(snapshot => snapshot.commit !== input.head)
    .flatMap(snapshot => {
      const entry = snapshot.members[input.member]
      return entry === undefined ? [] : [entry.band]
    })
  const relapses = countRelapses([...sequence, band])
  const over = BUDGET_ITEMS.filter(item => bands[item] === 'act')
  return {
    member: input.member,
    values: input.values,
    bands,
    ...(input.baseline.kind === 'off' ? {} : { comparisons }),
    band,
    over,
    relapses,
    structural: over.length > 0 && relapses >= input.relapseLimit,
  }
}
