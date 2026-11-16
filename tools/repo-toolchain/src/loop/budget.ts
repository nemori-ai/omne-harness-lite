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

export type MemberBaseline =
  | { readonly kind: 'off' }
  | { readonly kind: 'none' }
  | { readonly kind: 'snapshot'; readonly entry: MemberSnapshot | undefined }

export type ItemComparison =
  | { readonly result: 'better' | 'same' | 'worse'; readonly baseline: number }
  | { readonly result: 'new' }
  | { readonly result: 'unjudged'; readonly reason: string }

export interface MemberBudget {
  readonly member: string
  readonly values: BudgetValues
  readonly bands: Readonly<Record<BudgetItem, Band | undefined>>
  readonly comparisons?: Readonly<Record<BudgetItem, ItemComparison | undefined>>
  readonly band: Band
  readonly over: readonly BudgetItem[]
  readonly relapses: number
  readonly structural: boolean
}

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
