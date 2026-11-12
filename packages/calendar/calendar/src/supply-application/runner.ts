import {
  calendarIdSchema,
  calendarRefreshInputSchema,
  type CalendarCallContext,
  type CalendarProbeInput,
  type CalendarQueryResult,
  type CalendarSupply,
  type CalendarSupplyResult,
  type Instant,
} from '@omne-harness/calendar-contract'
import type { CalendarSupplyDependencies } from './ports.ts'
import { authorize, authorityFailed, supplyError } from './access.ts'
import { shippedCalendarSupplyPolicies } from '../supply/index.ts'
import { CALENDAR_SUPPLY_POLICY_VERSION } from './probes.ts'
import { supplyDigest } from './encoding.ts'

export type CalendarInitializedSource = Readonly<{
  input: CalendarProbeInput
  result: Awaited<ReturnType<CalendarSupply['probe']>>
}>
export type CalendarDueResult = Readonly<{
  input: CalendarProbeInput
  refresh: CalendarSupplyResult
  probe: Awaited<ReturnType<CalendarSupply['probe']>> | null
}>
const initializeInput = calendarRefreshInputSchema.unwrap().pick({ operationKey: true })
export async function initializeSources(
  deps: CalendarSupplyDependencies,
  application: CalendarSupply,
  context: CalendarCallContext,
  input: Readonly<{ operationKey: string }>,
): Promise<CalendarQueryResult<readonly CalendarInitializedSource[]>> {
  if (!initializeInput.safeParse(input).success)
    return supplyError(context, 'invalid_input', 'Invalid initialization intent')
  const guards = await authorize(deps, context, 'probe', null)
  if (authorityFailed(guards)) return { kind: 'error', error: guards }
  const results: CalendarInitializedSource[] = []
  for (const policy of shippedCalendarSupplyPolicies) {
    for (const source of policy.sources) {
      const probe = {
        calendarId: calendarIdSchema.parse(policy.calendarId),
        policyVersion: CALENDAR_SUPPLY_POLICY_VERSION,
        sourceId: source.sourceId,
        operationKey: supplyDigest({
          operation: 'initialize',
          operationKey: input.operationKey,
          calendarId: policy.calendarId,
          sourceId: source.sourceId,
        }),
      }
      results.push({ input: probe, result: await application.probe(context, probe) })
    }
  }
  return { kind: 'ok', value: results }
}
export async function runDueSources(
  deps: CalendarSupplyDependencies,
  application: CalendarSupply,
  context: CalendarCallContext,
  input: Readonly<{ limit: number }>,
  at: Instant,
): Promise<CalendarQueryResult<readonly CalendarDueResult[]>> {
  const guards = await authorize(deps, context, 'probe', null)
  if (authorityFailed(guards)) return { kind: 'error', error: guards }
  if (context.owner.kind !== 'system')
    return supplyError(context, 'forbidden', 'Supply requires system owner')
  const due = await deps.journal.due({
    systemScopeRef: context.owner.systemScopeRef,
    at,
    limit: input.limit,
  })
  if (due.kind !== 'ok') return supplyError(context, 'provider_failure', `Due journal ${due.kind}`)
  const results: CalendarDueResult[] = []
  for (const source of due.value) {
    const refresh = await application.refresh(context, {
      calendarId: source.calendarId,
      policyVersion: source.policyVersion,
      operationKey: supplyDigest({ operation: 'dueRefresh', source }),
    })
    const probe =
      refresh.kind === 'ok' && refresh.value.kind === 'recorded'
        ? await application.probe(context, source)
        : null
    results.push({ input: source, refresh, probe })
  }
  return { kind: 'ok', value: results }
}
