import { randomUUID } from 'node:crypto'
import {
  calendarSnapshotSchema,
  type CalendarSnapshot,
  type Instant,
} from '@omne-harness/calendar-contract'
import { synthesizeCalendarCandidate, validateCalendarCandidate } from '../supply/index.ts'
import type {
  CalendarSupplyCandidate,
  CalendarSupplyPolicy,
  SourceContribution,
  SupplyFinding,
  SupplyIndependenceRegistration,
} from '../supply/types.ts'
import type { CalendarCandidate, CalendarDisposition } from '../persistence.ts'
import type { CalendarStoredMaterial } from './ports.ts'
import { parseMaterials } from './materials.ts'
import { snapshotContent, supplyDigest } from './encoding.ts'

export function snapshotCandidate(snapshot: CalendarSnapshot): CalendarSupplyCandidate {
  return {
    calendarId: snapshot.calendarId,
    timezone: snapshot.timezone,
    weeklyDefault: snapshot.weeklyDefault,
    coverageIntervals: [{ start: snapshot.coverageStart, end: snapshot.coverageEnd }],
    days: snapshot.overrides.map(day => ({
      date: day.date,
      category: day.classification,
      provenance: day.provenanceRefs.map(authorityRef => ({
        sourceId: 'published',
        authorityRef,
        note: day.notes.join('; '),
        rawSha256: snapshot.contentHash,
      })),
    })),
    contributions: [],
  }
}
export function candidateSnapshot(input: {
  candidate: CalendarSupplyCandidate
  now: Instant
  versionId?: string
}): Omit<CalendarSnapshot, 'publicationGeneration'> {
  const { candidate } = input
  const interval = candidate.coverageIntervals.at(0)
  if (!interval || candidate.coverageIntervals.length !== 1)
    throw new Error('Snapshot requires continuous coverage')
  const knowledge = candidate.contributions
    .map(source => source.material.knowledgeAsOf)
    .sort()
    .at(0)
  if (!knowledge) throw new Error('Snapshot requires source knowledge metadata')
  const content = {
    calendarId: candidate.calendarId,
    timezone: candidate.timezone,
    coverageStart: interval.start,
    coverageEnd: interval.end,
    weeklyDefault: candidate.weeklyDefault,
    overrides: candidate.days.map(day => ({
      date: day.date,
      classification: day.category,
      provenanceRefs: [...new Set(day.provenance.map(item => item.authorityRef))].sort(),
      notes: [...new Set(day.provenance.map(item => item.note))].sort(),
    })),
  }
  const snapshot = calendarSnapshotSchema.parse({
    ...content,
    contentHash: supplyDigest(content),
    versionId: input.versionId ?? randomUUID(),
    synthesizedAt: input.now,
    knowledgeAsOf: knowledge,
    provenanceRefs: [
      ...new Set(candidate.contributions.map(source => source.material.reference)),
    ].sort(),
    publicationGeneration: 0,
  })
  const { publicationGeneration: _generation, ...proposed } = snapshot
  return proposed
}
export function assembleCandidate(input: {
  policy: CalendarSupplyPolicy
  materials: readonly CalendarStoredMaterial[]
  acquisitionFindings: readonly SupplyFinding[]
  current: CalendarSupplyCandidate | null
  currentSnapshot: CalendarSnapshot | null
  independenceRegistry: readonly SupplyIndependenceRegistration[]
  now: Instant
  versionId?: string
}): { candidate: CalendarCandidate; disposition: CalendarDisposition } {
  const parsed = parseMaterials(input.materials)
  const synthesized = synthesizeCalendarCandidate({
    policy: input.policy,
    contributions: parsed.contributions.filter(
      source => source.role === 'truth' || source.role === 'exceptionFeed',
    ),
  })
  const sources = input.materials.map(stored => {
    const spec = input.policy.sources.find(source => source.sourceId === stored.material.sourceId)
    if (!spec) throw new Error('Undeclared stored source')
    return {
      sourceId: spec.sourceId,
      role: spec.role,
      lineageRef: stored.material.lineageRef,
      authorityRef: stored.material.authorityRef,
      acquiredAt: stored.material.acquiredAt,
      knowledgeAsOf: stored.material.knowledgeAsOf,
      rawHash: stored.rawHash,
      rawReference: stored.reference,
    }
  })
  const findings = [...input.acquisitionFindings, ...parsed.findings]
  if (synthesized.kind !== 'success')
    return {
      candidate: {
        snapshot: null,
        semanticBoundary: input.policy.semanticBoundary,
        sources,
        differences: [],
        reasons: [...findings, ...synthesized.findings].map(describeFinding),
      },
      disposition: { kind: 'rejected' },
    }
  const report = validateCalendarCandidate({
    policy: input.policy,
    candidate: synthesized.candidate,
    oracles: parsed.contributions.filter(source => source.role === 'oracle'),
    independenceRegistry: input.independenceRegistry,
    ...(input.current ? { current: input.current } : {}),
  })
  findings.push(...report.findings)
  const snapshot = candidateSnapshot({
    candidate: synthesized.candidate,
    now: input.now,
    ...(input.versionId ? { versionId: input.versionId } : {}),
  })
  const candidate = {
    snapshot,
    semanticBoundary: input.policy.semanticBoundary,
    sources,
    differences: report.overlapChanges.map(
      change => `${change.date}:${change.previousCategory}->${change.candidateCategory}`,
    ),
    reasons: findings.map(describeFinding),
  }
  return {
    candidate,
    disposition: candidateDisposition(findings, report.kind, snapshot, input.currentSnapshot),
  }
}
function candidateDisposition(
  findings: readonly SupplyFinding[],
  reportKind: ReturnType<typeof validateCalendarCandidate>['kind'],
  snapshot: Omit<CalendarSnapshot, 'publicationGeneration'>,
  currentSnapshot: CalendarSnapshot | null,
): CalendarDisposition {
  if (
    findings.some(item => item.severity === 'blocker' && item.status === 'failed') ||
    reportKind === 'rejected'
  )
    return { kind: 'rejected' }
  if (
    findings.some(item => item.severity === 'blocker' && item.status === 'unknown') ||
    reportKind !== 'success'
  )
    return { kind: 'withheld' }
  if (currentSnapshot && supplyDigest(snapshotContent(currentSnapshot)) === snapshot.contentHash)
    return { kind: 'noChange' }
  return { kind: 'publish', snapshot }
}

export function describeFinding(item: SupplyFinding): string {
  return `${item.code}:${item.status}:${item.severity}:${item.detail}`
}
export function currentWithSources(
  snapshot: CalendarSnapshot,
  contributions: readonly SourceContribution[],
): CalendarSupplyCandidate {
  return { ...snapshotCandidate(snapshot), contributions }
}
