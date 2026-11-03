import { createHash } from 'node:crypto'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'
import { shippedCalendarSupplyPolicies } from './policies.ts'
import type {
  SourceContribution,
  SourceParseInput,
  SourceParseResult,
  SupplyCategory,
  SupplyDay,
  SupplyFinding,
  SupplyInterval,
  SupplyMaterial,
} from './types.ts'

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    try {
      Temporal.PlainDate.from(value)
      return true
    } catch {
      return false
    }
  })
const instant = z.string().refine(value => {
  try {
    Temporal.Instant.from(value)
    return true
  } catch {
    return false
  }
})
const materialSchema = z.object({
  acquiredAt: instant,
  knowledgeAsOf: instant,
  reference: z.string().min(1),
})
export function date(value: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(isoDate.parse(value))
}
export function addDays(value: string, days: number): string {
  return date(value).add({ days }).toString()
}
export function dates(interval: SupplyInterval): string[] {
  const result: string[] = []
  for (
    let value = date(interval.start);
    Temporal.PlainDate.compare(value, date(interval.end)) <= 0;
    value = value.add({ days: 1 })
  )
    result.push(value.toString())
  return result
}
export function inCoverage(value: string, intervals: readonly SupplyInterval[]): boolean {
  return intervals.some(interval => interval.start <= value && value <= interval.end)
}
export function finding(
  code: string,
  status: 'passed' | 'failed' | 'unknown',
  detail: string,
  dates: readonly string[] = [],
  references: readonly string[] = [],
  severity: 'blocker' | 'warning' = 'blocker',
): SupplyFinding {
  return { code, status, detail, dates, references, severity }
}
export function decode(input: SourceParseInput, encoding = 'utf-8'): string {
  return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(input.content)
}
export function parseSupplyJson(text: string): unknown {
  const parsed = readJsonText(text, {
    maxBytes: 67_108_864,
    maxDepth: 64,
    maxItems: 2_000_000,
    maxMembers: 100_000,
    maxStringLength: 16_777_216,
    maxNumberLength: 64,
  })
  if (parsed.kind !== 'ok') throw new Error(`invalid source JSON: ${JSON.stringify(parsed)}`)
  return JSON.parse(writeJsonText(parsed.value))
}
export function decodeJson(input: SourceParseInput): unknown {
  return parseSupplyJson(decode(input))
}
export function mergeDays(days: readonly SupplyDay[]): SupplyDay[] {
  const merged = new Map<string, SupplyDay>()
  for (const day of days) {
    isoDate.parse(day.date)
    const previous = merged.get(day.date)
    if (previous && previous.category !== day.category)
      throw new Error(`conflicting categories for ${day.date}`)
    merged.set(day.date, {
      ...day,
      provenance: [...(previous?.provenance ?? []), ...day.provenance],
    })
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date))
}
export function sourceParser(
  sourceId: string,
  input: SourceParseInput,
  parse: (material: SupplyMaterial) => {
    days: readonly SupplyDay[]
    coverageIntervals: readonly SupplyInterval[]
    checks?: readonly SupplyFinding[]
  },
): SourceParseResult {
  const material = {
    rawSha256: createHash('sha256').update(input.content).digest('hex'),
    acquiredAt: input.acquiredAt,
    knowledgeAsOf: input.knowledgeAsOf,
    reference: input.reference,
  }
  try {
    materialSchema.parse(input)
    if (Temporal.Instant.compare(input.knowledgeAsOf, input.acquiredAt) > 0)
      throw new Error('knowledgeAsOf is later than acquiredAt')
    const policy = shippedCalendarSupplyPolicies.find(item =>
      item.sources.some(source => source.sourceId === sourceId),
    )
    const source = policy?.sources.find(item => item.sourceId === sourceId)
    if (!policy || !source) throw new Error(`undeclared source ${sourceId}`)
    const parsed = parse(material)
    for (const interval of parsed.coverageIntervals) {
      isoDate.parse(interval.start)
      isoDate.parse(interval.end)
      if (interval.start > interval.end) throw new Error('inverted source coverage')
    }
    if (!parsed.coverageIntervals.length) throw new Error('source has no evidenced coverage')
    const days = mergeDays(parsed.days)
    if (days.some(day => !inCoverage(day.date, parsed.coverageIntervals) || !day.provenance.length))
      throw new Error('day outside source coverage or missing provenance')
    const contribution: SourceContribution = {
      sourceId,
      role: source.role,
      lineageRef: source.lineage,
      weeklyDefault: [...policy.weeklyDefault],
      material,
      coverageIntervals: parsed.coverageIntervals,
      days,
      checks: parsed.checks ?? [],
    }
    return { kind: 'success', contribution }
  } catch (error) {
    return {
      kind: 'rejected',
      material,
      findings: [
        finding(
          'source.invalid',
          'failed',
          error instanceof Error ? error.message : String(error),
          [],
          [input.reference],
        ),
      ],
    }
  }
}
export function sourceDay(
  sourceId: string,
  material: SupplyMaterial,
  day: string,
  category: SupplyCategory,
  authorityRef: string,
  note: string,
): SupplyDay {
  return {
    date: isoDate.parse(day),
    category,
    provenance: [{ sourceId, authorityRef, note, rawSha256: material.rawSha256 }],
  }
}
export function categoryAt(
  candidate: {
    readonly days: readonly SupplyDay[]
    readonly weeklyDefault: readonly SupplyCategory[]
  },
  value: string,
): SupplyCategory {
  const override = candidate.days.find(day => day.date === value)
  const category = override?.category ?? candidate.weeklyDefault[date(value).dayOfWeek - 1]
  if (!category) throw new Error('weeklyDefault must contain seven categories')
  return category
}

export function normalizeCoverageIntervals(intervals: readonly SupplyInterval[]): SupplyInterval[] {
  const ordered = intervals
    .map(interval => {
      isoDate.parse(interval.start)
      isoDate.parse(interval.end)
      if (interval.start > interval.end) throw new Error('inverted coverage interval')
      return { ...interval }
    })
    .sort((a, b) => a.start.localeCompare(b.start))
  const result: SupplyInterval[] = []
  for (const interval of ordered) {
    const last = result.at(-1)
    if (last && date(interval.start).since(date(last.end)).days <= 1)
      result[result.length - 1] = {
        start: last.start,
        end: last.end > interval.end ? last.end : interval.end,
      }
    else result.push(interval)
  }
  return result
}
