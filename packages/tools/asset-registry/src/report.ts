import { judgeAccountValue, type AttemptId, type RunId } from '@omne-harness-lite/call-accounts'
import { instantFromEpochMs, type Instant } from '@omne-harness-lite/offer-expiry'
import type { EffectiveAssembly } from '@omne-harness-lite/asset-evaluation'
import type { CapabilityId } from '@omne-harness-lite/asset-model'
import { closed, equal, object, own, requiredOwn } from './json.ts'
import { capability, entryName, registered, session } from './records.ts'
import {
  REGISTERED_CATEGORIES,
  type AvailabilityReport,
  type RegistrySnapshot,
  type Within,
  type RefreshRun,
} from './types.ts'
export function buildReport(
  sessionValue: string,
  runId: RunId,
  attempt: AttemptId,
  computedAt: Instant,
  snapshots: readonly RegistrySnapshot[],
  evaluation: EffectiveAssembly,
  meta: readonly CapabilityId[],
  skillGate: readonly CapabilityId[],
): AvailabilityReport {
  if (
    !session(sessionValue) ||
    !('ok' in judgeAccountValue('RunId', runId)) ||
    !('ok' in judgeAccountValue('AttemptId', attempt)) ||
    !('ok' in instantFromEpochMs(computedAt)) ||
    snapshots.length !== 6 ||
    !REGISTERED_CATEGORIES.every(
      category => snapshots.filter(snapshot => snapshot.category === category).length === 1,
    )
  )
    throw new TypeError('report requires actual identified complete snapshots')
  const tools = snapshots.find(snapshot => snapshot.category === 'tool')?.entries ?? []
  const effectivePermissions = Object.fromEntries(
    tools.map(entry => {
      const key = entryName(entry.capability)
      if (meta.some(id => equal(id, entry.capability)))
        return [
          key,
          {
            capability: entry.capability,
            item: 'execute',
            value: { allowed: ['auto'] },
            from: 'factory',
            tenantAutoWritable: false,
          },
        ]
      if (!evaluation.composition.some(id => equal(id, entry.capability)))
        return [key, 'not_in_composition']
      const value = evaluation.values.find(
        item => equal(item.capability, entry.capability) && item.item === 'execute',
      )
      if (value === undefined)
        throw new TypeError('successful evaluation lacks a composed tool execute value')
      return [key, value]
    }),
  )
  const endpoints = snapshots.find(snapshot => snapshot.category === 'mcp')?.entries ?? []
  return requiredOwn({
    session: sessionValue,
    runId,
    attempt,
    computedAt,
    snapshots: snapshots.map(({ category, filledAt }) => ({ category, filledAt })),
    availability: snapshots.flatMap(snapshot =>
      snapshot.entries.map(({ capability, availability, commandAvailability }) => ({
        capability,
        availability,
        ...(commandAvailability === undefined ? {} : { commandAvailability }),
      })),
    ),
    mcpActions: [],
    endpointHoldings: endpoints.map(entry => {
      const effective = evaluation.assets.find(asset => equal(asset.capability, entry.capability))
      return {
        capability: entry.capability,
        ...(effective === undefined ? { none: true } : { effective }),
      }
    }),
    effectivePermissions,
    skillGate,
  }) as unknown as AvailabilityReport
}
function availability(value: unknown): boolean {
  if (closed(value, ['kind'])) return value.kind === 'available'
  if (!object(value)) return false
  const key =
    value.kind === 'stand_in' ? 'for' : value.kind === 'unavailable' ? 'reason' : undefined
  if (
    key === undefined ||
    !closed(value, ['kind', key]) ||
    !Array.isArray(value[key]) ||
    value[key].length === 0
  )
    return false
  return value[key].every(
    issue =>
      closed(issue, ['dependency', 'state']) &&
      ['missing', 'unreadable'].includes(String(issue.state)),
  )
}
export function readReport(
  value: unknown,
  expectedSession: string,
): AvailabilityReport | undefined {
  const copy = own(value)
  if (
    !closed(copy, [
      'session',
      'runId',
      'attempt',
      'computedAt',
      'snapshots',
      'availability',
      'mcpActions',
      'endpointHoldings',
      'effectivePermissions',
      'skillGate',
    ]) ||
    copy.session !== expectedSession ||
    !('ok' in judgeAccountValue('RunId', copy.runId)) ||
    !('ok' in judgeAccountValue('AttemptId', copy.attempt)) ||
    !('ok' in instantFromEpochMs(copy.computedAt)) ||
    !Array.isArray(copy.snapshots) ||
    copy.snapshots.length !== 6 ||
    !copy.snapshots.every(
      item =>
        closed(item, ['category', 'filledAt']) &&
        registered(item.category) &&
        'ok' in instantFromEpochMs(item.filledAt),
    ) ||
    !REGISTERED_CATEGORIES.every(
      category =>
        (copy.snapshots as readonly unknown[]).filter(
          item => object(item) && item.category === category,
        ).length === 1,
    ) ||
    !Array.isArray(copy.availability) ||
    !Array.isArray(copy.skillGate) ||
    !copy.skillGate.every(id => capability(id) && id.category === 'skill') ||
    !Array.isArray(copy.mcpActions) ||
    copy.mcpActions.length !== 0 ||
    !Array.isArray(copy.endpointHoldings) ||
    !object(copy.effectivePermissions)
  )
    return undefined
  const ids: string[] = []
  for (const item of copy.availability) {
    if (
      !object(item) ||
      !Object.keys(item).every(key =>
        ['capability', 'availability', 'commandAvailability'].includes(key),
      ) ||
      !capability(item.capability) ||
      !registered(item.capability.category) ||
      !availability(item.availability)
    )
      return undefined
    if (
      Object.hasOwn(item, 'commandAvailability') &&
      (!object(item.commandAvailability) ||
        item.capability.category !== 'tool' ||
        !Object.values(item.commandAvailability).every(
          value =>
            (closed(value, ['kind']) && value.kind === 'available') ||
            (closed(value, ['kind', 'reason']) &&
              value.kind === 'unavailable' &&
              ['run_mode_never', 'run_mode_unreadable'].includes(String(value.reason))),
        ))
    )
      return undefined
    ids.push(`${item.capability.category}/${item.capability.name}`)
  }
  if (
    new Set(ids).size !== ids.length ||
    new Set(
      copy.skillGate.map(
        id => `${(id as unknown as CapabilityId).category}/${(id as unknown as CapabilityId).name}`,
      ),
    ).size !== copy.skillGate.length
  )
    return undefined
  return copy as unknown as AvailabilityReport
}
export function within(value: unknown, expectedSession: string): Within | undefined {
  const copy = own(value)
  if (closed(copy, ['kind']) && copy.kind === 'session') return { kind: 'session' }
  if (closed(copy, ['kind', 'report']) && copy.kind === 'run') {
    const report = readReport(copy.report, expectedSession)
    if (report !== undefined) return { kind: 'run', report }
  }
  return undefined
}
export function refreshRun(value: unknown, expectedSession: string): RefreshRun | undefined {
  const copy = own(value)
  if (!object(copy) || !('ok' in judgeAccountValue('RunId', copy.runId))) return undefined
  if (closed(copy, ['kind', 'runId']) && copy.kind === 'start') return copy as unknown as RefreshRun
  if (closed(copy, ['kind', 'runId', 'report']) && copy.kind === 'continue') {
    const report = readReport(copy.report, expectedSession)
    if (report !== undefined && equal(report.runId, copy.runId))
      return { kind: 'continue', runId: report.runId, report }
  }
  return undefined
}
