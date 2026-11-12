import { finding, inCoverage, mergeDays, normalizeCoverageIntervals } from './common.ts'
import type { CalendarSupplyPolicy, SourceContribution, SupplySynthesisResult } from './types.ts'

function validateDayProvenance(contribution: SourceContribution): void {
  if (
    contribution.days.some(day =>
      day.provenance.some(
        record =>
          record.sourceId !== contribution.sourceId ||
          record.rawSha256 !== contribution.material.rawSha256 ||
          !record.authorityRef.trim(),
      ),
    )
  )
    throw new Error('source day provenance does not match its material/source')
}

function validateContribution(
  policy: CalendarSupplyPolicy,
  contribution: SourceContribution,
): void {
  const source = policy.sources.find(item => item.sourceId === contribution.sourceId)
  if (
    !source ||
    source.role !== contribution.role ||
    !['truth', 'exceptionFeed'].includes(contribution.role)
  )
    throw new Error(`unknown or ineligible source/role ${contribution.sourceId}`)
  validateDayProvenance(contribution)
  if (JSON.stringify(policy.weeklyDefault) !== JSON.stringify(contribution.weeklyDefault))
    throw new Error('source weekly default disagrees with policy')
  const coverage = normalizeCoverageIntervals(contribution.coverageIntervals)
  if (
    !coverage.length ||
    contribution.days.some(day => !inCoverage(day.date, coverage) || !day.provenance.length)
  )
    throw new Error('source day has no coverage/provenance')
}

export function synthesizeCalendarCandidate(input: {
  readonly policy: CalendarSupplyPolicy
  readonly contributions: readonly SourceContribution[]
}): SupplySynthesisResult {
  const materials = input.contributions.map(contribution => contribution.material)
  try {
    const sourceIds = new Set<string>()
    for (const contribution of input.contributions) {
      validateContribution(input.policy, contribution)
      if (sourceIds.has(contribution.sourceId))
        throw new Error(`duplicate source contribution ${contribution.sourceId}`)
      sourceIds.add(contribution.sourceId)
    }
    const truths = input.contributions.filter(contribution => contribution.role === 'truth')
    if (!truths.length) throw new Error('no truth contribution')
    if (
      input.policy.sources
        .filter(source => source.role === 'truth')
        .some(source => !sourceIds.has(source.sourceId))
    )
      throw new Error('missing declared truth source')
    const coverageIntervals = normalizeCoverageIntervals(
      truths.flatMap(contribution => contribution.coverageIntervals),
    )
    if (coverageIntervals.length !== 1)
      throw new Error('truth coverage has a gap; weekly defaults cannot fill unknown dates')
    const days = new Map(
      mergeDays(truths.flatMap(contribution => contribution.days)).map(day => [day.date, day]),
    )
    const exceptionDays = mergeDays(
      input.contributions
        .filter(contribution => contribution.role === 'exceptionFeed')
        .flatMap(contribution => contribution.days),
    )
    for (const day of exceptionDays) {
      if (!inCoverage(day.date, coverageIntervals))
        throw new Error(`exception ${day.date} cannot extend truth coverage`)
      const previous = days.get(day.date)
      days.set(day.date, {
        ...day,
        provenance: [...(previous?.provenance ?? []), ...day.provenance],
      })
    }
    return {
      kind: 'success',
      candidate: {
        calendarId: input.policy.calendarId,
        timezone: input.policy.timezone,
        weeklyDefault: [...input.policy.weeklyDefault],
        coverageIntervals,
        days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
        contributions: [...input.contributions],
      },
    }
  } catch (error) {
    return {
      kind: 'rejected',
      materials,
      findings: [
        finding(
          'synthesis.invalid',
          'failed',
          error instanceof Error ? error.message : String(error),
          [],
          materials.map(material => material.reference),
        ),
      ],
    }
  }
}
