import { Temporal } from '@js-temporal/polyfill'
import {
  instantSchema,
  calendarProbeInputSchema,
  calendarProbeObservationSchema,
  type CalendarCallContext,
  type CalendarProbeInput,
  type CalendarSourceStanding,
  type CalendarQueryResult,
  type Instant,
} from '@omne-harness/calendar-contract'
import { shippedCalendarSupplyPolicies } from '../supply/index.ts'
import type { CalendarSupplyPolicy, SupplySourcePolicy } from '../supply/types.ts'
import type { CalendarSupplyDependencies } from './ports.ts'
import { authorize, authorityFailed, supplyError } from './access.ts'
import { supplyFingerprint } from './encoding.ts'
export const CALENDAR_SUPPLY_POLICY_VERSION =
  'a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0:calendar-a1/1'
export function fixedPolicy(
  calendarId: string,
  policyVersion: string,
): CalendarSupplyPolicy | undefined {
  return policyVersion === CALENDAR_SUPPLY_POLICY_VERSION
    ? shippedCalendarSupplyPolicies.find(policy => policy.calendarId === calendarId)
    : undefined
}
function nextProbe(source: SupplySourcePolicy, policy: CalendarSupplyPolicy, at: Instant): Instant {
  const current = Temporal.Instant.from(at).toZonedDateTimeISO(policy.timezone)
  const monthDay = current.toPlainDate().toString().slice(5)
  const interval =
    source.probeCadence.segments.find(
      segment => monthDay >= segment.window.startMonthDay && monthDay <= segment.window.endMonthDay,
    )?.interval ?? source.probeCadence.defaultInterval
  const result = current.add(interval).toInstant().toString({ fractionalSecondDigits: 3 })
  return instantSchema.parse(result)
}
export async function probeSource(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  input: CalendarProbeInput,
  at: Instant,
  signal?: AbortSignal,
): Promise<CalendarQueryResult<CalendarSourceStanding>> {
  const parsed = calendarProbeInputSchema.safeParse(input)
  if (!parsed.success) return supplyError(context, 'invalid_input', 'Invalid probe command')
  const guards = await authorize(deps, context, 'probe', parsed.data.calendarId)
  if (authorityFailed(guards)) return { kind: 'error', error: guards }
  if (context.owner.kind !== 'system')
    return supplyError(context, 'forbidden', 'Supply owner must be system')
  const policy = fixedPolicy(input.calendarId, input.policyVersion)
  const spec = policy?.sources.find(source => source.sourceId === input.sourceId)
  if (!policy || !spec)
    return supplyError(context, 'invalid_input', 'Unknown fixed policy or source')
  const scope = { systemScopeRef: context.owner.systemScopeRef, calendarId: input.calendarId }
  const fingerprint = supplyFingerprint({
    context,
    operation: 'probe',
    aggregateRef: input.calendarId,
    payload: { policyVersion: input.policyVersion, sourceId: input.sourceId },
  })
  const query = { ...scope, operationKey: input.operationKey, fingerprint }
  const existing = await deps.journal.readProbe(query)
  if (existing.kind !== 'ok')
    return supplyError(
      context,
      'provider_failure',
      `Probe journal ${existing.kind}: ${existing.reason}`,
    )
  if (existing.value) return { kind: 'ok', value: existing.value }
  if (signal?.aborted)
    return supplyError(context, 'provider_failure', 'Probe cancelled before acquisition')
  const health = await deps.journal.health(scope)
  if (health.kind !== 'ok')
    return supplyError(context, 'provider_failure', 'Probe standing unavailable')
  const previous =
    health.value.sources.find(source => source.sourceId === input.sourceId)?.observation ?? null
  const adapter = deps.sourceAdapters.find(source => source.sourceId === input.sourceId)
  let observation
  try {
    observation = adapter
      ? calendarProbeObservationSchema.parse(
          await adapter.probe({ previous, observedAt: at }, signal ? { signal } : undefined),
        )
      : {
          sourceId: input.sourceId,
          observedAt: at,
          kind: 'failed' as const,
          marker: null,
          authorityCoverageEnd: null,
          reason: 'Source adapter unavailable',
        }
    if (observation.sourceId !== input.sourceId || observation.observedAt !== at)
      throw new Error('Probe source/time mismatch')
  } catch (error) {
    observation = {
      sourceId: input.sourceId,
      observedAt: at,
      kind: 'failed' as const,
      marker: null,
      authorityCoverageEnd: null,
      reason: String(error),
    }
  }
  const recorded = await deps.journal.recordProbe({
    ...query,
    policyVersion: input.policyVersion,
    observation,
    nextDue: nextProbe(spec, policy, at),
  })
  return recorded.kind === 'ok'
    ? { kind: 'ok', value: recorded.value }
    : supplyError(context, 'provider_failure', `Probe recording ${recorded.kind}`)
}
