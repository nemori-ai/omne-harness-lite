// 成员预算：每个成员四项，各有三条线。任一项处于「处置」的成员超预算。
// 上一次的带位按趋势里这个成员各项的历史值重放得到（快照只记成员的总带位，各项的带位由值与线还原）。
// 「解除之后又进入处置」反复发生的，是清理解决不了的结构问题，上报而不派清理。
import { replay, worse, bandOf, type Band, type Lines } from './bands.ts'
import { BUDGET_ITEMS, type BudgetItem } from './config.ts'
import type { Snapshot } from './trend.ts'

export const BUDGET_LABELS: Readonly<Record<BudgetItem, string>> = {
  overAlert: '超 alert 的函数数',
  risk: '风险值',
  duplication: '重复行占比（%）',
  testsWithoutAssertions: '没有断言的测试数',
}

export type BudgetValues = Readonly<Record<BudgetItem, number | undefined>>

export interface MemberBudget {
  readonly member: string
  /** undefined：这一项这次没有数据。 */
  readonly values: BudgetValues
  readonly bands: Readonly<Record<BudgetItem, Band | undefined>>
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

/**
 * @param history 当前提交的祖先（含它自己）上的快照，从旧到新。
 * @param head 当前提交；它自己的旧快照参与重放上一次的带位，但不算进再进入的次数（这一次会替代它）。
 */
export function judgeMember(input: {
  readonly member: string
  readonly values: BudgetValues
  readonly budget: Readonly<Record<BudgetItem, Lines>>
  readonly history: readonly Snapshot[]
  readonly head: string
  readonly relapseLimit: number
}): MemberBudget {
  const past = input.history.map(snapshot => snapshot.members[input.member])
  const bands = {} as Record<BudgetItem, Band | undefined>
  let band: Band = 'normal'
  for (const item of BUDGET_ITEMS) {
    const value = input.values[item]
    if (value === undefined) {
      bands[item] = undefined
      continue
    }
    const previous = replay(
      past.map(entry => entry?.[item] ?? undefined),
      input.budget[item],
    )
    const current = bandOf(value, input.budget[item], previous)
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
    band,
    over,
    relapses,
    structural: over.length > 0 && relapses >= input.relapseLimit,
  }
}
