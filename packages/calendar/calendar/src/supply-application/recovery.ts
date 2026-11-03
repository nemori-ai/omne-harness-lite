import type {
  CalendarCallContext,
  CalendarSupplyResult,
  CalendarQueryResult,
} from '@omne-harness/calendar-contract'
import type { CalendarAcknowledgementResult } from '../persistence.ts'
import type { CalendarSupplyDependencies } from './ports.ts'
import { authorize, authorityFailed, supplyError } from './access.ts'
import { commitPrepared, type RuntimeControl } from './refresh.ts'
import { supplyDigest } from './encoding.ts'

export async function recoverRuns(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  limit: number,
  control: RuntimeControl,
): Promise<CalendarQueryResult<readonly CalendarSupplyResult[]>> {
  const allowed = await authorize(deps, context, 'refresh', null)
  if (authorityFailed(allowed)) return { kind: 'error', error: allowed }
  if (context.owner.kind !== 'system')
    return supplyError(context, 'forbidden', 'Supply requires system owner')
  const pending = await deps.journal.pending({
    systemScopeRef: context.owner.systemScopeRef,
    limit,
  })
  if (pending.kind !== 'ok')
    return supplyError(context, 'provider_failure', `Pending journal ${pending.kind}`)
  const results: CalendarSupplyResult[] = []
  for (const run of pending.value) {
    if (run.command.address.systemScopeRef !== context.owner.systemScopeRef)
      return supplyError(context, 'provider_failure', 'Journal returned another owner')
    results.push(await commitPrepared(deps, context, run, control))
  }
  return { kind: 'ok', value: results }
}
export async function deliverReactions(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  input: Readonly<{ limit: number; acknowledgementKey: string }>,
): Promise<
  CalendarQueryResult<
    readonly {
      id: string
      outcome: CalendarAcknowledgementResult | { kind: 'pending'; reason: string }
    }[]
  >
> {
  const allowed = await authorize(deps, context, 'reaction', null)
  if (authorityFailed(allowed)) return { kind: 'error', error: allowed }
  if (context.owner.kind !== 'system')
    return supplyError(context, 'forbidden', 'Supply requires system owner')
  const records = await deps.repository.listPendingReactions({
    systemScopeRef: context.owner.systemScopeRef,
    after: null,
    limit: input.limit,
  })
  if (records.kind !== 'ok')
    return supplyError(context, 'provider_failure', 'Pending reactions unavailable')
  const results: {
    id: string
    outcome: CalendarAcknowledgementResult | { kind: 'pending'; reason: string }
  }[] = []
  for (const record of records.value.items) {
    const run = await deps.journal.findRun({
      systemScopeRef: context.owner.systemScopeRef,
      operationRef: record.operationRef,
    })
    if (run.kind !== 'ok')
      return supplyError(context, 'provider_failure', 'Reaction ownership unavailable')
    if (!run.value) continue
    if (
      run.value.command.address.systemScopeRef !== context.owner.systemScopeRef ||
      run.value.command.address.calendarId !== record.calendarId
    )
      return supplyError(context, 'provider_failure', 'Reaction ownership mismatch')
    const guards = await authorize(deps, context, 'reaction', record.calendarId)
    if (authorityFailed(guards)) return { kind: 'error', error: guards }
    const acknowledgementKey = supplyDigest({ key: input.acknowledgementKey, id: record.id })
    const original = await deps.journal.readAcknowledgement({ id: record.id, acknowledgementKey })
    if (original.kind !== 'ok')
      return supplyError(context, 'provider_failure', `Acknowledgement journal ${original.kind}`)
    if (original.value) {
      results.push({
        id: record.id,
        outcome: await deps.persistence.acknowledgeReaction(original.value),
      })
      continue
    }
    const sink = deps.reactionSink
    if (!sink) {
      results.push({
        id: record.id,
        outcome: { kind: 'pending', reason: 'Reaction sink unavailable' },
      })
      continue
    }
    let handoff
    try {
      handoff = await sink.handoff(record)
    } catch (error) {
      handoff = { kind: 'unavailable' as const, reason: String(error) }
    }
    if (handoff.kind !== 'accepted' || !handoff.handoffRef.trim()) {
      results.push({
        id: record.id,
        outcome: {
          kind: 'pending',
          reason: handoff.kind === 'unavailable' ? handoff.reason : 'Missing handoff receipt',
        },
      })
      continue
    }
    const saved = await deps.journal.prepareAcknowledgement({
      acknowledgementKey,
      id: record.id,
      operationRef: record.operationRef,
      handoffRef: handoff.handoffRef,
      authorityGuardRefs: guards,
    })
    if (saved.kind !== 'ok') {
      results.push({
        id: record.id,
        outcome: { kind: 'pending', reason: `Acknowledgement ${saved.kind}` },
      })
      continue
    }
    results.push({
      id: record.id,
      outcome: await deps.persistence.acknowledgeReaction(saved.value),
    })
  }
  return { kind: 'ok', value: results }
}
