import {
  CALENDAR_PROTOCOL,
  calendarRefreshInputSchema,
  type CalendarCallContext,
  type CalendarRefreshInput,
  type CalendarSupplyResult,
  type CalendarSupplyOutcome,
  type CalendarSnapshot,
  type Instant,
} from '@omne-harness/calendar-contract'
import type {
  CalendarDispositionCommand,
  CalendarCandidate,
  CalendarOperationQuery,
  CalendarOperationObservation,
} from '../persistence.ts'
import type {
  CalendarSupplyDependencies,
  CalendarStoredMaterial,
  CalendarPreparedRun,
} from './ports.ts'
import { finding } from '../supply/common.ts'
import type {
  SupplyFinding,
  CalendarSupplyPolicy,
  CalendarSupplyCandidate,
} from '../supply/types.ts'
import { authorize, authorityFailed, supplyError } from './access.ts'
import { fixedPolicy } from './probes.ts'
import { supplyDigest, supplyFingerprint } from './encoding.ts'
import { assembleCandidate, currentWithSources } from './candidate.ts'
import { parseMaterials, preserveSource } from './materials.ts'

export type RuntimeControl = Readonly<{ now(): Instant; stopped(): boolean }>
export async function finishRun(
  deps: CalendarSupplyDependencies,
  query: CalendarOperationQuery,
  outcome: CalendarOperationObservation,
  now: Instant,
): Promise<CalendarSupplyOutcome> {
  if (outcome.kind === 'recorded') {
    try {
      await deps.journal.completeRun({
        ...query,
        operationRef: outcome.receipt.operationRef,
        completedAt: now,
        disposition: outcome.receipt.disposition,
      })
    } catch {}
  }
  return outcome
}
export async function commitPrepared(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  run: CalendarPreparedRun,
  control: RuntimeControl,
  signal?: AbortSignal,
): Promise<CalendarSupplyResult> {
  const command = run.command
  const query = { address: command.address, expectedFingerprint: command.expectedFingerprint }
  const guards = await authorize(
    deps,
    context,
    command.address.operation,
    command.address.calendarId,
  )
  if (authorityFailed(guards)) return { kind: 'error', error: guards }
  const observed = await deps.persistence.observeOperation(query)
  if (observed.kind !== 'notCommitted')
    return { kind: 'ok', value: await finishRun(deps, query, observed, control.now()) }
  if (signal?.aborted || control.stopped())
    return { kind: 'ok', value: { kind: 'unknown', operationRef: observed.operationRef } }
  try {
    const result = await deps.persistence.commitDisposition(command)
    if (
      result.kind === 'rejected' &&
      ['operationKeyConflict', 'generationConflict'].includes(result.reason)
    ) {
      const winner = await deps.persistence.observeOperation(query)
      if (winner.kind !== 'notCommitted')
        return { kind: 'ok', value: await finishRun(deps, query, winner, control.now()) }
    }
    return { kind: 'ok', value: await finishRun(deps, query, result, control.now()) }
  } catch {
    try {
      return {
        kind: 'ok',
        value: await finishRun(
          deps,
          query,
          await deps.persistence.observeOperation(query),
          control.now(),
        ),
      }
    } catch {
      return { kind: 'ok', value: { kind: 'unknown', operationRef: observed.operationRef } }
    }
  }
}
async function acquireSources(
  deps: CalendarSupplyDependencies,
  policy: CalendarSupplyPolicy,
  at: Instant,
  signal?: AbortSignal,
) {
  const materials: CalendarStoredMaterial[] = []
  const findings: SupplyFinding[] = []
  for (const source of policy.sources) {
    if (signal?.aborted) break
    const adapter = deps.sourceAdapters.find(item => item.sourceId === source.sourceId)
    try {
      if (!adapter) throw new Error('Source adapter unavailable')
      const acquired = await adapter.acquire({ acquiredAt: at }, signal ? { signal } : undefined)
      if (acquired.kind !== 'acquired') throw new Error(acquired.reason)
      if (acquired.material.sourceId !== source.sourceId) throw new Error('Acquired wrong source')
      materials.push(await preserveSource(deps.materials, policy, acquired.material))
    } catch (error) {
      findings.push(
        finding('source.unavailable', 'unknown', `${source.sourceId}: ${String(error)}`),
      )
    }
  }
  return { materials, findings }
}
async function readPublishedMaterials(
  deps: CalendarSupplyDependencies,
  sources: CalendarCandidate['sources'],
): Promise<CalendarStoredMaterial[]> {
  const stored: CalendarStoredMaterial[] = []
  for (const source of sources) {
    const material = await deps.materials.read({ reference: source.rawReference })
    if (
      material.kind !== 'ok' ||
      !material.value ||
      material.value.rawHash !== source.rawHash ||
      material.value.material.sourceId !== source.sourceId ||
      material.value.material.lineageRef !== source.lineageRef ||
      material.value.material.acquiredAt !== source.acquiredAt ||
      material.value.material.authorityRef !== source.authorityRef ||
      material.value.material.knowledgeAsOf !== source.knowledgeAsOf
    )
      throw new Error('Current provenance unavailable or inconsistent')
    stored.push(material.value)
  }
  return stored
}
export async function readCurrent(
  deps: CalendarSupplyDependencies,
  calendarId: CalendarRefreshInput['calendarId'],
): Promise<{ snapshot: CalendarSnapshot | null; candidate: CalendarSupplyCandidate | null }> {
  const current = await deps.repository.getSnapshot({ calendarId, version: { kind: 'current' } })
  if (current.kind !== 'ok') throw new Error('Current version unavailable')
  if (!current.value) return { snapshot: null, candidate: null }
  const published = await deps.repository.getCandidate({
    calendarId,
    versionId: current.value.versionId,
  })
  if (
    published.kind !== 'ok' ||
    !published.value ||
    published.value.receipt.disposition !== 'published'
  )
    throw new Error('Current publication evidence unavailable')
  const sources = published.value.command.candidate.sources.filter(
    source => source.role === 'truth' || source.role === 'exceptionFeed',
  )
  const stored = await readPublishedMaterials(deps, sources)
  const parsed = parseMaterials(stored)
  if (parsed.findings.length) throw new Error('Current source provenance cannot be interpreted')
  return {
    snapshot: current.value,
    candidate: currentWithSources(
      current.value,
      parsed.contributions.filter(
        source => source.role === 'truth' || source.role === 'exceptionFeed',
      ),
    ),
  }
}
export async function refreshCalendar(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  input: CalendarRefreshInput,
  control: RuntimeControl,
  signal?: AbortSignal,
): Promise<CalendarSupplyResult> {
  const parsed = calendarRefreshInputSchema.safeParse(input)
  if (!parsed.success) return supplyError(context, 'invalid_input', 'Invalid refresh intent')
  const guards = await authorize(deps, context, 'refresh', parsed.data.calendarId)
  if (authorityFailed(guards)) return { kind: 'error', error: guards }
  if (context.owner.kind !== 'system')
    return supplyError(context, 'forbidden', 'Supply owner must be system')
  const policy = fixedPolicy(input.calendarId, input.policyVersion)
  if (!policy) return supplyError(context, 'invalid_input', 'Unknown fixed policy')
  const address: CalendarOperationQuery['address'] = {
    protocol: CALENDAR_PROTOCOL,
    systemScopeRef: context.owner.systemScopeRef,
    operation: 'refresh' as const,
    calendarId: input.calendarId,
    operationKey: input.operationKey,
  }
  const query = {
    address,
    expectedFingerprint: supplyFingerprint({
      context,
      operation: 'refresh',
      aggregateRef: input.calendarId,
      payload: { policyVersion: input.policyVersion },
    }),
  }
  const observed = await deps.persistence.observeOperation(query)
  if (observed.kind !== 'notCommitted')
    return { kind: 'ok', value: await finishRun(deps, query, observed, control.now()) }
  const existing = await deps.journal.readRun(query)
  if (existing.kind !== 'ok')
    return supplyError(context, 'provider_failure', `Prepared run ${existing.kind}`)
  if (existing.value) return commitPrepared(deps, context, existing.value, control, signal)
  if (signal?.aborted || control.stopped())
    return { kind: 'ok', value: { kind: 'cancelled', phase: 'beforeCommit' } }
  return prepareRefresh(deps, context, query, policy, guards, control, signal)
}
async function prepareRefresh(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  query: CalendarOperationQuery,
  policy: CalendarSupplyPolicy,
  guards: readonly string[],
  control: RuntimeControl,
  signal?: AbortSignal,
): Promise<CalendarSupplyResult> {
  const current = await readCurrent(deps, query.address.calendarId)
  const at = control.now()
  const acquired = await acquireSources(deps, policy, at, signal)
  if (signal?.aborted || control.stopped())
    return { kind: 'ok', value: { kind: 'cancelled', phase: 'beforeCommit' } }
  const assembled = assembleCandidate({
    policy,
    materials: acquired.materials,
    acquisitionFindings: acquired.findings,
    current: current.candidate,
    currentSnapshot: current.snapshot,
    independenceRegistry: deps.independenceRegistry,
    now: at,
    ...(deps.ids ? { versionId: deps.ids.versionId() } : {}),
  })
  const command: CalendarDispositionCommand = {
    ...query,
    expectedGeneration: current.snapshot?.publicationGeneration ?? 0,
    authorityGuardRefs: guards,
    policyHash: supplyDigest(policy),
    ...assembled,
  }
  const prepared = await deps.journal.prepareRun({ command, preparedAt: at })
  if (prepared.kind !== 'ok')
    return supplyError(context, 'provider_failure', `Prepare ${prepared.kind}: ${prepared.reason}`)
  return commitPrepared(deps, context, prepared.value, control, signal)
}
