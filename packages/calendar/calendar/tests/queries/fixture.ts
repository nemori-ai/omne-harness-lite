import { vi } from 'vitest'
import {
  calendarCallContextSchema,
  calendarSnapshotSchema,
  calendarResolveSchema,
} from '@omne-harness/calendar-contract'
import type { CalendarSnapshot } from '@omne-harness/calendar-contract'
import type { CalendarReadResult, CalendarRepository } from '../../src/index.ts'

export const context = calendarCallContextSchema.parse({
  owner: { kind: 'tenant', tenantId: 'tenant-a', ownerId: 'owner-a' },
  principalRef: 'principal-a',
  actor: { kind: 'human', actorRef: 'person-a' },
  authContextRef: 'auth-a',
  requestId: 'req-a',
  originatingSessionRef: null,
})
export const snapshot = calendarSnapshotSchema.parse({
  calendarId: 'cn',
  versionId: 'v1',
  coverageStart: '2026-01-01',
  coverageEnd: '2026-12-31',
  timezone: 'Asia/Shanghai',
  weeklyDefault: [
    'workingDay',
    'workingDay',
    'workingDay',
    'workingDay',
    'workingDay',
    'nonWorkingDay',
    'nonWorkingDay',
  ],
  overrides: [],
  knowledgeAsOf: '2025-12-01T00:00:00.000Z',
  synthesizedAt: '2025-12-02T00:00:00.000Z',
  contentHash: 'a'.repeat(64),
  provenanceRefs: ['source-a'],
  publicationGeneration: 1,
})
export const request = calendarResolveSchema.parse({
  selection: { kind: 'explicit', calendarId: 'cn' },
  version: { kind: 'latest' },
  query: { kind: 'day', date: '2026-01-01' },
})
export function directory(value = snapshot) {
  return {
    calendarId: value.calendarId,
    timezone: value.timezone,
    semanticBoundary: 'CN statutory',
    current: { versionId: value.versionId, publicationGeneration: value.publicationGeneration },
  }
}
export function entry(value = snapshot) {
  return {
    calendarId: value.calendarId,
    versionId: value.versionId,
    publicationGeneration: value.publicationGeneration,
    coverageStart: value.coverageStart,
    coverageEnd: value.coverageEnd,
    knowledgeAsOf: value.knowledgeAsOf,
    synthesizedAt: value.synthesizedAt,
    contentHash: value.contentHash,
    provenanceRefs: value.provenanceRefs,
  }
}
export function repository() {
  return {
    listCalendars: vi
      .fn<CalendarRepository['listCalendars']>()
      .mockResolvedValue({ kind: 'ok', value: { items: [directory()], nextCursor: null } }),
    getCalendar: vi
      .fn<CalendarRepository['getCalendar']>()
      .mockImplementation(async ({ calendarId }) => ({
        kind: 'ok',
        value: calendarId === snapshot.calendarId ? directory() : null,
      })),
    listVersions: vi
      .fn<CalendarRepository['listVersions']>()
      .mockResolvedValue({ kind: 'ok', value: { items: [entry()], nextCursor: null } }),
    getSnapshot: vi
      .fn<CalendarRepository['getSnapshot']>()
      .mockImplementation(
        async ({ calendarId, version }): Promise<CalendarReadResult<CalendarSnapshot | null>> => ({
          kind: 'ok',
          value:
            calendarId === snapshot.calendarId &&
            (version.kind === 'current' || version.versionId === snapshot.versionId)
              ? snapshot
              : null,
        }),
      ),
    getCandidate: vi.fn<CalendarRepository['getCandidate']>(),
    listCandidates: vi.fn<CalendarRepository['listCandidates']>(),
    listPendingReactions: vi.fn<CalendarRepository['listPendingReactions']>(),
  } satisfies CalendarRepository
}
