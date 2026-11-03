import { Temporal } from '@js-temporal/polyfill'
import {
  calendarHealthInputSchema,
  type CalendarCallContext,
  type CalendarHealthInput,
  type CalendarHealth,
  type CalendarQueryResult,
  type Instant,
} from '@omne-harness/calendar-contract'
import { classifyCalendarSupplyHorizon } from '../supply/index.ts'
import type { CalendarSupplyDependencies } from './ports.ts'
import { authorize, authorityFailed, supplyError } from './access.ts'
import { fixedPolicy } from './probes.ts'

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
  const snapshot = current.kind === 'ok' ? current.value : null
  const state = journal.kind === 'ok' ? journal.value : null
  const remaining =
    snapshot && policy
      ? Temporal.PlainDate.from(snapshot.coverageEnd).since(
          Temporal.Instant.from(at).toZonedDateTimeISO(policy.timezone).toPlainDate(),
        ).days
      : null
  const failures = state?.consecutiveFailures ?? 0
  const sourceFailed = state?.sources.some(source => source.observation.kind === 'failed') ?? false
  const knownSources =
    policy &&
    state &&
    policy.sources.every(source => state.sources.some(item => item.sourceId === source.sourceId))
  const reasons = [
    !policy ? 'Unknown fixed policy' : null,
    journal.kind !== 'ok' ? `Supply journal ${journal.kind}` : null,
    current.kind !== 'ok' ? `Snapshot ${current.kind}` : null,
    !knownSources ? 'Some source observations are unknown' : null,
  ].filter(value => value !== null)
  return {
    kind: 'ok',
    value: {
      calendarId: input.calendarId,
      observedAt: at,
      queryAvailability: current.kind !== 'ok' ? 'unavailable' : snapshot ? 'available' : 'missing',
      supply: !state
        ? 'unknown'
        : failures || sourceFailed
          ? 'failed'
          : state.pendingRuns.length
            ? 'pending'
            : !knownSources || !state.lastSuccess
              ? 'unknown'
              : 'ok',
      horizon:
        policy && remaining !== null
          ? classifyCalendarSupplyHorizon({ policy, remainingCoverageDays: remaining })
          : 'unknown',
      coverageStart: snapshot?.coverageStart ?? null,
      coverageEnd: snapshot?.coverageEnd ?? null,
      knowledgeAsOf: snapshot?.knowledgeAsOf ?? null,
      remainingCoverageDays: remaining,
      consecutiveFailures: failures,
      lastSuccess: state?.lastSuccess ?? null,
      pendingRuns: state?.pendingRuns.length ?? 0,
      sources: state?.sources ?? [],
      reasons,
    },
  }
}
