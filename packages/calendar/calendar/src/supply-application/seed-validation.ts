import { Temporal } from '@js-temporal/polyfill'
import type { CalendarSeedEntry, CalendarSnapshot } from '@omne-harness/calendar-contract'
import type { CalendarSupplyDependencies, CalendarStoredMaterial } from './ports.ts'
import type { CalendarCandidate, CalendarDisposition } from '../persistence.ts'
import type {
  SupplyFinding,
  CalendarSupplyPolicy,
  CalendarSupplyCandidate,
} from '../supply/types.ts'
import { synthesizeCalendarCandidate, classifyCalendarSupplyHorizon } from '../supply/index.ts'
import { invariantFindings } from '../supply/invariants.ts'
import { categoryAt, dates, addDays, inCoverage, finding } from '../supply/common.ts'
import { supplyDigest, snapshotContent } from './encoding.ts'
import { parseMaterials } from './materials.ts'
import { candidateSnapshot, describeFinding, snapshotCandidate } from './candidate.ts'
import { readCurrent } from './refresh.ts'

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
  findings.push(...anchorFindings(entry, policy, built.candidate))
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
export async function inspectSeed(
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
  const disposition = seedDisposition(findings, snapshot, current.snapshot)
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
function anchorFindings(
  entry: CalendarSeedEntry,
  policy: CalendarSupplyPolicy,
  candidate: CalendarSupplyCandidate,
): SupplyFinding[] {
  const findings: SupplyFinding[] = []
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
      }).filter(value => inCoverage(value, candidate.coverageIntervals))
      if (
        window.length &&
        !window.some(value => categoryAt(candidate, value) === anchor.expectedCategory)
      )
        bad.push(day)
    }
    if (bad.length)
      findings.push(finding(anchor.anchorId, 'failed', 'Seed is missing a declared anchor', bad))
  }
  return findings
}
function seedDisposition(
  findings: readonly SupplyFinding[],
  snapshot: Omit<CalendarSnapshot, 'publicationGeneration'>,
  current: CalendarSnapshot | null,
): CalendarDisposition {
  if (findings.some(item => item.severity === 'blocker' && item.status === 'failed'))
    return { kind: 'rejected' }
  if (
    findings.some(
      item =>
        (item.severity === 'blocker' && item.status === 'unknown') ||
        item.code === 'overlap.unsourced',
    )
  )
    return { kind: 'withheld' }
  if (
    current &&
    (current.contentHash === snapshot.contentHash ||
      current.knowledgeAsOf > snapshot.knowledgeAsOf ||
      current.coverageStart < snapshot.coverageStart ||
      current.coverageEnd > snapshot.coverageEnd)
  )
    return { kind: 'noChange' }
  return { kind: 'publish', snapshot }
}
