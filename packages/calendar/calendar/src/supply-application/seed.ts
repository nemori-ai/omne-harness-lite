import {
  CALENDAR_PROTOCOL,
  calendarImportSeedInputSchema,
  calendarSeedPackSchema,
  type CalendarCallContext,
  type CalendarImportSeedInput,
  type CalendarSeedEntry,
  type CalendarSupplyOutcome,
  type CalendarQueryResult,
} from '@omne-harness/calendar-contract'
import type { CalendarSupplyDependencies, CalendarStoredMaterial } from './ports.ts'
import type { CalendarOperationQuery } from '../persistence.ts'
import type { CalendarSupplyPolicy } from '../supply/types.ts'
import { authorize, authorityFailed, supplyError } from './access.ts'
import { supplyDigest, supplyFingerprint } from './encoding.ts'
import { fixedPolicy } from './probes.ts'
import { preserveSource, materialHash } from './materials.ts'
import { describeFinding } from './candidate.ts'
import { commitPrepared, finishRun, type RuntimeControl } from './refresh.ts'
import { inspectSeed } from './seed-validation.ts'

type SeedResult = {
  releaseRef: string
  results: readonly {
    calendarId: CalendarSeedEntry['snapshot']['calendarId']
    outcome: CalendarSupplyOutcome
    warnings: readonly string[]
  }[]
}
async function resumeSeed(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  query: CalendarOperationQuery,
  control: RuntimeControl,
  signal?: AbortSignal,
): Promise<SeedResult['results'][number] | null> {
  const calendarId = query.address.calendarId
  const observed = await deps.persistence.observeOperation(query)
  if (observed.kind !== 'notCommitted') {
    const retained = await deps.journal.readRun(query)
    return {
      calendarId,
      outcome: await finishRun(deps, query, observed, control.now()),
      warnings:
        retained.kind === 'ok' && retained.value
          ? retained.value.command.candidate.reasons.filter(
              reason => reason.includes(':failed:warning:') || reason.includes(':unknown:warning:'),
            )
          : ['Seed warning evidence unavailable'],
    }
  }
  const previous = await deps.journal.readRun(query)
  if (previous.kind !== 'ok')
    return {
      calendarId,
      outcome: { kind: 'rejected', reason: 'invalid', message: `Seed journal ${previous.kind}` },
      warnings: [],
    }
  if (previous.value) {
    const resumed = await commitPrepared(deps, context, previous.value, control, signal)
    return {
      calendarId,
      outcome:
        resumed.kind === 'ok'
          ? resumed.value
          : { kind: 'rejected', reason: resumed.error.code, message: resumed.error.message },
      warnings: previous.value.command.candidate.reasons.filter(
        reason => reason.includes(':failed:warning:') || reason.includes(':unknown:warning:'),
      ),
    }
  }
  return null
}
async function preserveSeedMaterials(
  deps: CalendarSupplyDependencies,
  policy: CalendarSupplyPolicy,
  entry: CalendarSeedEntry,
): Promise<
  { kind: 'ok'; materials: CalendarStoredMaterial[] } | { kind: 'invalid'; reason: string }
> {
  const materials: CalendarStoredMaterial[] = []
  for (const item of entry.materials) {
    const { contentBase64, rawHash, transportEvidence, ...metadata } = item
    const material = {
      ...metadata,
      ...(transportEvidence ? { transportEvidence } : {}),
      content: new Uint8Array(Buffer.from(contentBase64, 'base64')),
    }
    if (materialHash(material) !== rawHash)
      return { kind: 'invalid', reason: 'Seed raw material digest mismatch' }
    materials.push(await preserveSource(deps.materials, policy, material))
  }
  return { kind: 'ok', materials }
}
async function seedEntry(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  input: CalendarImportSeedInput,
  entry: CalendarSeedEntry,
  releaseDate: string,
  control: RuntimeControl,
  signal?: AbortSignal,
): Promise<SeedResult['results'][number]> {
  const calendarId = entry.snapshot.calendarId
  const reject = (reason: string): SeedResult['results'][number] => ({
    calendarId,
    outcome: { kind: 'rejected', reason: 'invalid', message: reason },
    warnings: [],
  })
  const guards = await authorize(deps, context, 'importSeed', calendarId)
  if (authorityFailed(guards)) return reject(guards.code)
  if (context.owner.kind !== 'system') return reject('Supply requires system owner')
  const policy = fixedPolicy(calendarId, entry.policyVersion)
  if (!policy || entry.policyHash !== supplyDigest(policy))
    return reject('Unknown or mismatched seed policy')
  const address: CalendarOperationQuery['address'] = {
    protocol: CALENDAR_PROTOCOL,
    operation: 'importSeed' as const,
    systemScopeRef: context.owner.systemScopeRef,
    calendarId,
    operationKey: input.operationKey,
  }
  const query = {
    address,
    expectedFingerprint: supplyFingerprint({
      context,
      operation: 'importSeed',
      aggregateRef: calendarId,
      payload: {
        packRef: input.packRef,
        packHash: input.packHash,
        releaseRef: input.releaseRef,
        policyVersion: entry.policyVersion,
      },
    }),
  }
  const resumed = await resumeSeed(deps, context, query, control, signal)
  if (resumed) return resumed
  if (signal?.aborted || control.stopped())
    return { calendarId, outcome: { kind: 'cancelled', phase: 'beforeCommit' }, warnings: [] }
  return publishSeed(deps, context, { query, entry, policy, guards, releaseDate }, control, signal)
}
async function publishSeed(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  input: {
    query: CalendarOperationQuery
    entry: CalendarSeedEntry
    policy: CalendarSupplyPolicy
    guards: readonly string[]
    releaseDate: string
  },
  control: RuntimeControl,
  signal?: AbortSignal,
): Promise<SeedResult['results'][number]> {
  const { query, entry, policy, guards, releaseDate } = input
  const calendarId = entry.snapshot.calendarId
  const reject = (message: string): SeedResult['results'][number] => ({
    calendarId,
    outcome: { kind: 'rejected', reason: 'invalid', message },
    warnings: [],
  })
  const preserved = await preserveSeedMaterials(deps, policy, entry)
  if (preserved.kind === 'invalid') return reject(preserved.reason)
  const materials = preserved.materials
  const inspected = await inspectSeed(
    deps,
    query.address.systemScopeRef,
    entry,
    policy,
    materials,
    releaseDate,
  )
  const { candidate, disposition, expectedGeneration, findings } = inspected
  const prepared = await deps.journal.prepareRun({
    command: {
      ...query,
      expectedGeneration,
      policyHash: entry.policyHash,
      authorityGuardRefs: guards,
      candidate,
      disposition,
    },
    preparedAt: control.now(),
  })
  if (prepared.kind !== 'ok') return reject(`Seed preparation ${prepared.kind}`)
  const result = await commitPrepared(deps, context, prepared.value, control, signal)
  return {
    calendarId,
    outcome:
      result.kind === 'ok'
        ? result.value
        : { kind: 'rejected', reason: result.error.code, message: result.error.message },
    warnings: findings
      .filter(item => item.severity === 'warning' && item.status !== 'passed')
      .map(describeFinding),
  }
}
export async function importSeeds(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  input: CalendarImportSeedInput,
  control: RuntimeControl,
  signal?: AbortSignal,
): Promise<CalendarQueryResult<SeedResult>> {
  if (!calendarImportSeedInputSchema.safeParse(input).success)
    return supplyError(context, 'invalid_input', 'Invalid seed intent')
  const guards = await authorize(deps, context, 'importSeed', null)
  if (authorityFailed(guards)) return { kind: 'error', error: guards }
  const read = await deps.materials.readSeed({ packRef: input.packRef, packHash: input.packHash })
  if (read.kind !== 'ok')
    return supplyError(context, 'provider_failure', 'Seed pack unavailable or hash mismatch')
  const pack = calendarSeedPackSchema.safeParse(read.value)
  if (!pack.success || pack.data.releaseRef !== input.releaseRef)
    return supplyError(context, 'invalid_input', 'Invalid seed manifest or release identity')
  const results: SeedResult['results'][number][] = []
  for (const entry of pack.data.calendars)
    results.push(
      await seedEntry(deps, context, input, entry, pack.data.releaseDate, control, signal),
    )
  return { kind: 'ok', value: { releaseRef: input.releaseRef, results } }
}
