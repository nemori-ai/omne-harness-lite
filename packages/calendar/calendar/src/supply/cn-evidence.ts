import { createHash } from 'node:crypto'
import { z } from 'zod'
import { finding, inCoverage, isoDate, parseSupplyJson } from './common.ts'
import { shippedCalendarSupplyPolicies } from './policies.ts'
import type { SupplyDay, SupplyFinding, SupplyInterval } from './types.ts'

export const cnValidationEvidenceSchema = z.strictObject({
  sourceId: z.literal('chinese-days'),
  version: z.string().min(1),
  coverageStart: isoDate,
  coverageEnd: isoDate,
  reference: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  content: z.string().min(1),
})
export type CnValidationEvidence = z.infer<typeof cnValidationEvidenceSchema>
export const lanceliaoEvidenceBundleSchema = z.strictObject({
  format: z.literal('lanceliao_evidence_bundle/v1'),
  primary: z.string().min(1),
  supplement: cnValidationEvidenceSchema,
})
const evidenceDaysSchema = z.object({
  holidays: z.record(isoDate, z.string()),
  workdays: z.record(isoDate, z.string()),
  inLieuDays: z.record(isoDate, z.string()),
})
const subsetCode = 'cn.in_lieu_subset_of_holidays'
const balanceCode = 'cn.compensatory_in_lieu_near_zero_sum'

function unknownEvidence(detail: string, references: readonly string[]): SupplyFinding[] {
  return [
    finding(subsetCode, 'unknown', detail, [], references),
    finding(balanceCode, 'unknown', detail, [], references, 'warning'),
  ]
}

function sameDates(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every(day => right.has(day))
}

export function cnEvidenceChecks(input: {
  evidence: CnValidationEvidence | undefined
  days: readonly SupplyDay[]
  coverage: readonly SupplyInterval[]
  primaryReference: string
}): SupplyFinding[] {
  const { evidence, days, coverage, primaryReference } = input
  if (!evidence)
    return unknownEvidence('Source has no in-lieu field or supplementary evidence', [
      primaryReference,
    ])
  const references = [primaryReference, evidence.reference]
  if (createHash('sha256').update(evidence.content, 'utf8').digest('hex') !== evidence.sha256)
    return unknownEvidence('Supplementary content hash does not match', references)
  if (
    coverage.some(
      interval => interval.start < evidence.coverageStart || interval.end > evidence.coverageEnd,
    )
  )
    return unknownEvidence('Supplementary evidence does not cover the primary range', references)
  const parsed = evidenceDaysSchema.safeParse(parseSupplyJson(evidence.content))
  if (!parsed.success) return unknownEvidence('Supplementary date mappings are invalid', references)
  const within = (values: Record<string, string>) =>
    new Set(Object.keys(values).filter(day => inCoverage(day, coverage)))
  const holidays = new Set(days.filter(day => day.category === 'holiday').map(day => day.date))
  const workdays = new Set(days.filter(day => day.category === 'workingDay').map(day => day.date))
  if (
    !sameDates(holidays, within(parsed.data.holidays)) ||
    !sameDates(workdays, within(parsed.data.workdays))
  )
    return unknownEvidence(
      'Supplementary holiday/workday mappings disagree with primary truth',
      references,
    )
  const inLieu = within(parsed.data.inLieuDays)
  const outside = [...inLieu].filter(day => !holidays.has(day))
  return [
    finding(
      subsetCode,
      outside.length ? 'failed' : 'passed',
      `Supplementary ${evidence.sourceId}@${evidence.version}; in-lieu dates must be primary holidays`,
      outside,
      references,
    ),
    balanceFinding({ inLieu, workdays, coverage, references }),
  ]
}

function balanceFinding(input: {
  inLieu: ReadonlySet<string>
  workdays: ReadonlySet<string>
  coverage: readonly SupplyInterval[]
  references: readonly string[]
}): SupplyFinding {
  const invariant = shippedCalendarSupplyPolicies
    .flatMap(policy => policy.validation.invariants)
    .find(item => item.invariantId === balanceCode)
  const maxDelta = invariant?.params.maxDelta
  const years = new Set(
    input.coverage.flatMap(interval => {
      const result: string[] = []
      for (
        let year = Number(interval.start.slice(0, 4));
        year <= Number(interval.end.slice(0, 4));
        year++
      ) {
        const key = String(year).padStart(4, '0')
        if (
          inCoverage(`${key}-01-01`, input.coverage) &&
          inCoverage(`${key}-12-31`, input.coverage)
        )
          result.push(key)
      }
      return result
    }),
  )
  if (maxDelta === undefined || !years.size)
    return finding(
      balanceCode,
      'unknown',
      'No fully covered year or policy threshold',
      [],
      input.references,
      'warning',
    )
  const count = (values: ReadonlySet<string>, year: string) =>
    [...values].filter(day => day.startsWith(`${year}-`)).length
  const bad = [...years].filter(
    year => Math.abs(count(input.workdays, year) - count(input.inLieu, year)) > maxDelta,
  )
  return finding(
    balanceCode,
    bad.length ? 'failed' : 'passed',
    `Annual compensatory/in-lieu difference must not exceed policy maxDelta ${maxDelta}`,
    bad.map(year => `${year}-01-01`),
    input.references,
    'warning',
  )
}
