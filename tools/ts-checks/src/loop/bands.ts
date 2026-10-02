// 三条带：提醒线、处置线、解除线，数值越大越差。进入处置之后要回落到解除线才解除，
// 低于处置线但高于解除线仍是处置——这样一个值在线附近来回摆，带位不跟着来回翻。
// 纯函数；「上一次的带位」与「基线上的值」由调用方从趋势里取来。

/** 一个指标或一项成员预算的三条线，要求 release ≤ warn ≤ act。 */
export interface Lines {
  readonly warn: number
  readonly act: number
  readonly release: number
}

export type Band = 'normal' | 'warn' | 'act'

/** 与基线比：好了、一样、差了；`unjudged` 是该比却没有基线上的值，不当作没变差。 */
export type Comparison = 'better' | 'same' | 'worse' | 'unjudged'

const RANK: Record<Band, number> = { normal: 0, warn: 1, act: 2 }

export function worse(a: Band, b: Band): Band {
  return RANK[a] >= RANK[b] ? a : b
}

function fresh(value: number, lines: Lines): Band {
  if (value >= lines.act) return 'act'
  return value >= lines.warn ? 'warn' : 'normal'
}

/** 带位。`previous` 是上一次的带位，没有就当作不是处置。 */
export function bandOf(value: number, lines: Lines, previous?: Band): Band {
  if (previous === 'act' && value > lines.release) return 'act'
  return fresh(value, lines)
}

export function compare(value: number, baseline: number | undefined): Comparison {
  if (baseline === undefined) return 'unjudged'
  if (value > baseline) return 'worse'
  return value < baseline ? 'better' : 'same'
}

export interface IndicatorJudgement {
  readonly band: Band
  /** 配置里不与基线比的指标没有这一项。 */
  readonly comparison?: Comparison
}

/**
 * 一个指标的带位：有三条线就按线判；`lines` 为 null 的只与基线比。
 * 与基线比变差了，带位至少是提醒。
 */
export function judgeIndicator(input: {
  readonly value: number
  readonly lines: Lines | null
  readonly previous?: Band
  readonly baseline: { readonly enabled: boolean; readonly value?: number }
}): IndicatorJudgement {
  const absolute =
    input.lines === null ? 'normal' : bandOf(input.value, input.lines, input.previous)
  if (!input.baseline.enabled) return { band: absolute }
  const comparison = compare(input.value, input.baseline.value)
  return {
    band: comparison === 'worse' ? worse(absolute, 'warn') : absolute,
    comparison,
  }
}

/** 按时间先后重放一串值，得到最后一个值的带位；`undefined` 的值跳过，带位不变。 */
export function replay(values: readonly (number | undefined)[], lines: Lines): Band | undefined {
  let band: Band | undefined
  for (const value of values) if (value !== undefined) band = bandOf(value, lines, band)
  return band
}

export function validLines(lines: Lines): boolean {
  return lines.release <= lines.warn && lines.warn <= lines.act
}
