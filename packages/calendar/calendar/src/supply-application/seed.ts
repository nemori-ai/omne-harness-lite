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
import { Temporal } from '@js-temporal/polyfill'
import type { CalendarSupplyDependencies, CalendarStoredMaterial } from './ports.ts'
import type {
  CalendarCandidate,
  CalendarDisposition,
  CalendarOperationQuery,
} from '../persistence.ts'
import type { SupplyFinding, CalendarSupplyPolicy } from '../supply/types.ts'
import { synthesizeCalendarCandidate, classifyCalendarSupplyHorizon } from '../supply/index.ts'
import { invariantFindings } from '../supply/invariants.ts'
import { categoryAt, dates, addDays, inCoverage, finding } from '../supply/common.ts'
import { authorize, authorityFailed, supplyError } from './access.ts'
import { supplyDigest, supplyFingerprint, snapshotContent } from './encoding.ts'
import { fixedPolicy } from './probes.ts'
import { preserveSource, parseMaterials, materialHash } from './materials.ts'
import { candidateSnapshot, describeFinding, snapshotCandidate } from './candidate.ts'
import { commitPrepared, finishRun, readCurrent, type RuntimeControl } from './refresh.ts'

type SeedResult = {
  releaseRef: string
  results: readonly {
    calendarId: CalendarSeedEntry['snapshot']['calendarId']
    outcome: CalendarSupplyOutcome
    warnings: readonly string[]
  }[]
}
function releaseFindings(
  entry: CalendarSeedEntry,
  policy: CalendarSupplyPolicy,
  releaseDate: string,
): SupplyFinding[] {
  const { snapshot } = entry
  const year = releaseDate.slice(0, 4)
  const findings: SupplyFinding[] = []
  if (
    snapshot.coverageStart > `${year}-01-01` ||
    snapshot.coverageEnd < `${year}-12-31` ||
    snapshot.coverageEnd < entry.authorityCoverageEnd
  )
    findings.push(
      finding(
        'seed.releaseCoverage',
        'failed',
        'Seed must cover the full release year and known authority horizon',
      ),
    )
  const remaining = Temporal.PlainDate.from(snapshot.coverageEnd).since(
    Temporal.PlainDate.from(releaseDate),
  ).days
  const horizon = classifyCalendarSupplyHorizon({ policy, remainingCoverageDays: remaining })
  if (horizon === 'critical' || horizon === 'unknown')
    findings.push(
      finding('seed.releaseHealth', horizon === 'unknown' ? 'unknown' : 'failed', horizon),
    )
  if (horizon === 'warning')
    findings.push(
      finding(
        'seed.releaseHealth',
        'failed',
        'Release coverage warning must be declared',
        [],
        [],
        'warning',
      ),
    )
  return findings
}
function localFindings(
  entry: CalendarSeedEntry,
  policy: CalendarSupplyPolicy,
  materials: readonly CalendarStoredMaterial[],
) {
  const parsed = parseMaterials(materials)
  for (const source of policy.sources.filter(
    source => source.role === 'truth' || source.role === 'exceptionFeed',
  )) {
    if (!parsed.contributions.some(contribution => contribution.sourceId === source.sourceId))
      parsed.findings.push(
        finding('seed.sourceMissing', 'unknown', `Missing seed source ${source.sourceId}`),
      )
  }
  const built = synthesizeCalendarCandidate({
    policy,
    contributions: parsed.contributions.filter(
      source => source.role === 'truth' || source.role === 'exceptionFeed',
    ),
  })
  if (built.kind !== 'success') return [...parsed.findings, ...built.findings]
  const findings = [
    ...parsed.findings,
    ...invariantFindings({
      policy,
      candidate: built.candidate,
      oracles: [],
      independenceRegistry: [],
    }),
  ]
  const rebuilt = candidateSnapshot({
    candidate: built.candidate,
    now: entry.snapshot.synthesizedAt,
    versionId: entry.snapshot.versionId,
  })
  if (
    supplyDigest(snapshotContent(entry.snapshot)) !== entry.snapshot.contentHash ||
    rebuilt.contentHash !== entry.snapshot.contentHash ||
    rebuilt.knowledgeAsOf !== entry.snapshot.knowledgeAsOf ||
    supplyDigest(rebuilt.provenanceRefs) !== supplyDigest(entry.snapshot.provenanceRefs)
  )
    findings.push(
      finding(
        'seed.contentMismatch',
        'failed',
        'Seed snapshot does not match its raw source material and knowledge metadata',
      ),
    )
  for (const anchor of policy.validation.anchors) {
    const bad: string[] = []
    for (
      let year = Number(entry.snapshot.coverageStart.slice(0, 4));
      year <= Number(entry.snapshot.coverageEnd.slice(0, 4));
      year++
    ) {
      const day = `${String(year).padStart(4, '0')}-${anchor.monthDay}`
      const window = dates({
        start: addDays(day, -anchor.toleranceDays),
        end: addDays(day, anchor.toleranceDays),
      }).filter(value => inCoverage(value, built.candidate.coverageIntervals))
      if (
        window.length &&
        !window.some(value => categoryAt(built.candidate, value) === anchor.expectedCategory)
      )
        bad.push(day)
    }
    if (bad.length)
      findings.push(finding(anchor.anchorId, 'failed', 'Seed is missing a declared anchor', bad))
  }
  return findings
}
function sourcesForSeed(
  policy: CalendarSupplyPolicy,
  materials: readonly CalendarStoredMaterial[],
) {
  return materials.map(stored => {
    const source = policy.sources.find(item => item.sourceId === stored.material.sourceId)
    if (!source) throw new Error('Seed source not declared')
    return {
      sourceId: source.sourceId,
      role: source.role,
      lineageRef: stored.material.lineageRef,
      authorityRef: stored.material.authorityRef,
      acquiredAt: stored.material.acquiredAt,
      knowledgeAsOf: stored.material.knowledgeAsOf,
      rawHash: stored.rawHash,
      rawReference: stored.reference,
    }
  })
}
function overlapFindings(
  current: Awaited<ReturnType<typeof readCurrent>>,
  entry: CalendarSeedEntry,
  policy: CalendarSupplyPolicy,
  materials: readonly CalendarStoredMaterial[],
): SupplyFinding[] {
  if (!current.snapshot) return []
  const findings: SupplyFinding[] = []
  const previous = snapshotCandidate(current.snapshot)
  const proposed = snapshotCandidate(entry.snapshot)
  const oldRefs = new Set(
    previous.days.flatMap(day => day.provenance.map(item => item.authorityRef)),
  )
  const truths = sourcesForSeed(policy, materials).filter(source => source.role === 'truth')
  const firstPartyChanged =
    truths.length > 0 &&
    truths.every(
      source =>
        policy.sources.find(spec => spec.sourceId === source.sourceId)?.provenanceClass ===
          'firstPartyAuthority' &&
        current.candidate?.contributions.some(
          old => old.sourceId === source.sourceId && old.material.rawSha256 !== source.rawHash,
        ),
    )
  const changed = proposed.days.filter(
    day =>
      inCoverage(day.date, previous.coverageIntervals) &&
      categoryAt(previous, day.date) !== day.category,
  )
  const removed = previous.days.filter(
    day =>
      inCoverage(day.date, proposed.coverageIntervals) &&
      categoryAt(proposed, day.date) !== day.category &&
      !proposed.days.some(next => next.date === day.date),
  )
  if (
    !firstPartyChanged &&
    [...changed, ...removed].some(
      day =>
        !proposed.days
          .find(next => next.date === day.date)
          ?.provenance.some(item => !oldRefs.has(item.authorityRef)),
    )
  )
    findings.push(
      finding(
        'overlap.unsourced',
        'failed',
        'Seed changes published overlap without new authority',
        [],
        [],
        'warning',
      ),
    )
  return findings
}
async function inspectSeed(
  deps: CalendarSupplyDependencies,
  systemScopeRef: string,
  entry: CalendarSeedEntry,
  policy: CalendarSupplyPolicy,
  materials: readonly CalendarStoredMaterial[],
  releaseDate: string,
) {
  const calendarId = entry.snapshot.calendarId
  const findings = [
    ...releaseFindings(entry, policy, releaseDate),
    ...localFindings(entry, policy, materials),
  ]
  const standing = await deps.journal.health({
    systemScopeRef: systemScopeRef,
    calendarId,
  })
  if (standing.kind !== 'ok')
    findings.push(
      finding('seed.authorityHorizon', 'unknown', 'Cannot inspect known authority horizon'),
    )
  else if (
    standing.value.sources.some(
      source =>
        source.observation.authorityCoverageEnd !== null &&
        source.observation.authorityCoverageEnd > entry.snapshot.coverageEnd,
    )
  )
    findings.push(
      finding(
        'seed.authorityHorizon',
        'failed',
        'Observed authority coverage exceeds seed coverage',
      ),
    )
  const current = await readCurrent(deps, calendarId)
  const historical = await deps.repository.getSnapshot({
    calendarId,
    version: { kind: 'pinned', versionId: entry.snapshot.versionId },
  })
  if (historical.kind !== 'ok') throw new Error('Seed version identity unavailable')
  const { publicationGeneration: _generation, ...snapshot } = entry.snapshot
  if (historical.value) {
    const { publicationGeneration: _oldGeneration, ...old } = historical.value
    if (supplyDigest(old) !== supplyDigest(snapshot))
      findings.push(
        finding('seed.versionConflict', 'failed', 'Existing seed version cannot be recut'),
      )
  }
  findings.push(...overlapFindings(current, entry, policy, materials))
  let disposition: CalendarDisposition = { kind: 'publish', snapshot }
  if (findings.some(item => item.severity === 'blocker' && item.status === 'failed'))
    disposition = { kind: 'rejected' }
  else if (
    findings.some(
      item =>
        (item.severity === 'blocker' && item.status === 'unknown') ||
        item.code === 'overlap.unsourced',
    )
  )
    disposition = { kind: 'withheld' }
  else if (
    current.snapshot &&
    (current.snapshot.contentHash === snapshot.contentHash ||
      current.snapshot.knowledgeAsOf > snapshot.knowledgeAsOf ||
      current.snapshot.coverageStart < snapshot.coverageStart ||
      current.snapshot.coverageEnd > snapshot.coverageEnd)
  )
    disposition = { kind: 'noChange' }
  const sources = sourcesForSeed(policy, materials)
  const candidate: CalendarCandidate = {
    snapshot,
    sources,
    semanticBoundary: policy.semanticBoundary,
    differences: [],
    reasons: findings.map(describeFinding),
  }
  return {
    candidate,
    disposition,
    expectedGeneration: current.snapshot?.publicationGeneration ?? 0,
    findings,
  }
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
  if (previous.kind !== 'ok') return reject(`Seed journal ${previous.kind}`)
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
  if (signal?.aborted || control.stopped())
    return { calendarId, outcome: { kind: 'cancelled', phase: 'beforeCommit' }, warnings: [] }
  const materials: CalendarStoredMaterial[] = []
  for (const item of entry.materials) {
    const { contentBase64, rawHash, transportEvidence, ...metadata } = item
    const material = {
      ...metadata,
      ...(transportEvidence ? { transportEvidence } : {}),
      content: new Uint8Array(Buffer.from(contentBase64, 'base64')),
    }
    if (materialHash(material) !== rawHash) return reject('Seed raw material digest mismatch')
    materials.push(await preserveSource(deps.materials, policy, material))
  }
  const inspected = await inspectSeed(
    deps,
    context.owner.systemScopeRef,
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
