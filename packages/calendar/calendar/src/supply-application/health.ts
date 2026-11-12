import { Temporal } from '@js-temporal/polyfill'
import {
  calendarHealthInputSchema,
  type CalendarCallContext,
  type CalendarHealthInput,
  type CalendarHealth,
  type CalendarQueryResult,
  type CalendarSnapshot,
  type Instant,
} from '@omne-harness/calendar-contract'
import { classifyCalendarSupplyHorizon } from '../supply/index.ts'
import type { CalendarJournalHealth, CalendarSupplyDependencies } from './ports.ts'
import type { CalendarReadResult } from '../persistence.ts'
import type { CalendarSupplyPolicy } from '../supply/types.ts'
import { authorize, authorityFailed, supplyError } from './access.ts'
import { fixedPolicy } from './probes.ts'

function supplyStanding(
  state: CalendarJournalHealth | null,
  knownSources: boolean,
): CalendarHealth['supply'] {
  if (!state) return 'unknown'
  if (
    state.consecutiveFailures ||
    state.sources.some(source => source.observation.kind === 'failed')
  )
    return 'failed'
  if (state.pendingRuns.length) return 'pending'
  return knownSources && state.lastSuccess ? 'ok' : 'unknown'
}

function coverageHealth(
  current: CalendarReadResult<CalendarSnapshot | null>,
  policy: CalendarSupplyPolicy | undefined,
  at: Instant,
) {
  const snapshot = current.kind === 'ok' ? current.value : null
  const queryAvailability: CalendarHealth['queryAvailability'] =
    current.kind !== 'ok' ? 'unavailable' : snapshot ? 'available' : 'missing'
  const remainingCoverageDays =
    snapshot && policy
      ? Temporal.PlainDate.from(snapshot.coverageEnd).since(
          Temporal.Instant.from(at).toZonedDateTimeISO(policy.timezone).toPlainDate(),
        ).days
      : null
  return {
    queryAvailability,
    reasons: current.kind === 'ok' ? [] : [`Snapshot ${current.kind}`],
    coverageStart: snapshot?.coverageStart ?? null,
    coverageEnd: snapshot?.coverageEnd ?? null,
    knowledgeAsOf: snapshot?.knowledgeAsOf ?? null,
    remainingCoverageDays,
    horizon:
      policy && remainingCoverageDays !== null
        ? classifyCalendarSupplyHorizon({ policy, remainingCoverageDays })
        : ('unknown' as const),
  }
}

function journalHealth(
  state: CalendarJournalHealth | null,
  policy: CalendarSupplyPolicy | undefined,
) {
  const knownSources = Boolean(
    policy &&
    state &&
    policy.sources.every(source => state.sources.some(item => item.sourceId === source.sourceId)),
  )
  return {
    supply: supplyStanding(state, knownSources),
    consecutiveFailures: state?.consecutiveFailures ?? 0,
    lastSuccess: state?.lastSuccess ?? null,
    pendingRuns: state?.pendingRuns.length ?? 0,
    sources: state?.sources ?? [],
    reasons: knownSources ? [] : ['Some source observations are unknown'],
  }
}

export async function supplyHealth(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  input: CalendarHealthInput,
  at: Instant,
): Promise<CalendarQueryResult<CalendarHealth>> {
  if (!calendarHealthInputSchema.safeParse(input).success)
    return supplyError(context, 'invalid_input', 'Invalid health query')
  const guards = await authorize(deps, context, 'health', input.calendarId)
  if (authorityFailed(guards)) return { kind: 'error', error: guards }
  if (context.owner.kind !== 'system')
    return supplyError(context, 'forbidden', 'Supply requires system owner')
  const policy = fixedPolicy(input.calendarId, input.policyVersion)
  const [current, journal] = await Promise.all([
    deps.repository.getSnapshot({ calendarId: input.calendarId, version: { kind: 'current' } }),
    deps.journal.health({
      systemScopeRef: context.owner.systemScopeRef,
      calendarId: input.calendarId,
    }),
  ])
  const coverage = coverageHealth(current, policy, at)
  const state = journal.kind === 'ok' ? journal.value : null
  const standing = journalHealth(state, policy)
  return {
    kind: 'ok',
    value: {
      calendarId: input.calendarId,
      observedAt: at,
      ...coverage,
      ...standing,
      reasons: [
        ...(!policy ? ['Unknown fixed policy'] : []),
        ...(journal.kind === 'ok' ? [] : [`Supply journal ${journal.kind}`]),
        ...coverage.reasons,
        ...standing.reasons,
      ],
    },
  }
}
