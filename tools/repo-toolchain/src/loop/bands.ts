export interface Lines {
  readonly warn: number
  readonly act: number
  readonly release: number
}

export type Band = 'normal' | 'warn' | 'act'

export const BAND_WORDS: Readonly<Record<Band, string>> = {
  normal: '正常',
  warn: '提醒',
  act: '处置',
}

export type Comparison = 'better' | 'same' | 'worse' | 'unjudged'

const RANK: Record<Band, number> = { normal: 0, warn: 1, act: 2 }

export function worse(a: Band, b: Band): Band {
  return RANK[a] >= RANK[b] ? a : b
}

function fresh(value: number, lines: Lines): Band {
  if (value >= lines.act) return 'act'
  return value >= lines.warn ? 'warn' : 'normal'
}

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
  readonly comparison?: Comparison
}

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

export function replay(values: readonly (number | undefined)[], lines: Lines): Band | undefined {
  let band: Band | undefined
  for (const value of values) if (value !== undefined) band = bandOf(value, lines, band)
  return band
}

export function validLines(lines: Lines): boolean {
  return lines.release <= lines.warn && lines.warn <= lines.act
}
