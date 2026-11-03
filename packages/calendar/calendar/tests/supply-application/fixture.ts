import { readFileSync } from 'node:fs'
import {
  calendarCallContextSchema,
  calendarIdSchema,
  instantSchema,
  type CalendarSnapshot,
  type CalendarSeedPack,
  type CalendarSourceStanding,
} from '@omne-harness/calendar-contract'
import type {
  CalendarDispositionCommand,
  CalendarOperationQuery,
  CalendarPublicationReceipt,
  CalendarPendingReaction,
  CalendarReactionAcknowledgement,
} from '../../src/persistence.ts'
import type {
  CalendarSupplyDependencies,
  CalendarPreparedRun,
  CalendarStoredMaterial,
  CalendarJournalHealth,
} from '../../src/supply-application/ports.ts'
import { materialHash } from '../../src/supply-application/materials.ts'
import { supplyDigest } from '../../src/supply-application/encoding.ts'
import { shippedCalendarSupplyPolicies } from '../../src/supply/index.ts'
import {
  CALENDAR_SUPPLY_POLICY_VERSION,
  createCalendarSupplyApplication,
} from '../../src/supply-application/index.ts'

export const context = calendarCallContextSchema.parse({
  principalRef: 'system-maintainer',
  owner: { kind: 'system', systemScopeRef: 'test-scope' },
  actor: { kind: 'system', actorRef: 'test-runner' },
  authContextRef: 'test-authority',
  requestId: 'r1',
  originatingSessionRef: null,
})
export const intent = {
  calendarId: calendarIdSchema.parse('us-federal-holidays'),
  policyVersion: CALENDAR_SUPPLY_POLICY_VERSION,
  operationKey: 'refresh-1',
}
export function world() {
  let at = instantSchema.parse('2026-01-01T00:00:00.000Z')
  const policy = shippedCalendarSupplyPolicies.find(item => item.calendarId === intent.calendarId)
  if (!policy) throw new Error('US policy missing')
  const runs = new Map<string, CalendarPreparedRun>()
  const completed = new Map<string, string>()
  const receipts = new Map<string, CalendarPublicationReceipt>()
  const snapshots = new Map<string, CalendarSnapshot>()
  const raw = new Map<string, CalendarStoredMaterial>()
  const acknowledgements = new Map<string, CalendarReactionAcknowledgement>()
  const probeReceipts = new Map<string, { fingerprint: string; standing: CalendarSourceStanding }>()
  const sourceStates = new Map<string, CalendarSourceStanding>()
  const pending = new Map<string, CalendarPendingReaction>()
  const calls = { acquire: 0, commit: 0, observe: 0, probe: 0, ack: 0, handoff: 0 }
  const flags = {
    deny: false,
    unknown: false,
    loseCommitReply: false,
    handoffFails: true,
    journalFails: false,
    adapterFails: false,
  }
  let seedPack: CalendarSeedPack | null = null
  let current: CalendarSnapshot | null = null
  let failures = 0
  let lastSuccess: typeof at | null = null
  const key = (query: CalendarOperationQuery) => supplyDigest(query.address)
  const operationRef = (query: CalendarOperationQuery) => `calendar-operation:${key(query)}`
  const sourceBytes = (id: string): Uint8Array => {
    if (id === 'usc-6103-computed-rules')
      return new TextEncoder().encode(JSON.stringify({ start: '2025-01-01', end: '2026-12-31' }))
    if (id === 'opm-federal-holidays-ics')
      return readFileSync(
        new URL('../supply/fixtures/holidays_capture_20260821.ics', import.meta.url),
      )
    return new TextEncoder().encode(
      JSON.stringify({
        kind: 'federal_register_eo_bundle',
        schema_version: 1,
        pages: [
          {
            results: [
              {
                title: 'Unrelated order: controlled zero-closure observation',
                document_number: 'test-only',
                publication_date: '2026-01-01',
              },
            ],
            next_page_url: null,
          },
        ],
        bodies: {},
      }),
    )
  }
  const deps: CalendarSupplyDependencies = {
    authority: {
      async check() {
        return flags.deny
          ? { kind: 'denied', reason: 'revoked' }
          : { kind: 'allowed', authorityGuardRefs: ['test-guard'] }
      },
    },
    clock: { now: () => at },
    ids: { versionId: () => `v-${calls.acquire}` },
    independenceRegistry: [
      {
        truthSourceId: 'usc-6103-computed-rules',
        oracleSourceId: 'opm-federal-holidays-ics',
        independent: true,
        evidenceRef: 'test-only-independent-oracle-registration',
      },
    ],
    sourceAdapters: policy.sources.map(source => ({
      sourceId: source.sourceId,
      async probe({ observedAt }) {
        calls.probe++
        return {
          sourceId: source.sourceId,
          observedAt,
          kind: flags.adapterFails ? 'failed' : 'unchanged',
          marker: 'm1',
          authorityCoverageEnd: null,
          reason: flags.adapterFails ? 'offline' : null,
        }
      },
      async acquire() {
        calls.acquire++
        return flags.adapterFails
          ? { kind: 'unavailable', reason: 'offline' }
          : {
              kind: 'acquired',
              material: {
                sourceId: source.sourceId,
                content: sourceBytes(source.sourceId),
                acquiredAt: at,
                knowledgeAsOf: instantSchema.parse('2025-12-01T00:00:00.000Z'),
                mediaType:
                  source.sourceId === 'opm-federal-holidays-ics'
                    ? 'text/calendar'
                    : 'application/json',
                lineageRef: source.lineage,
                authorityRef: `test-authority:${source.sourceId}`,
              },
            }
      },
    })),
    materials: {
      async preserve(material) {
        const rawHash = materialHash(material)
        const reference = `material:${rawHash}`
        const value = { material, rawHash, reference }
        raw.set(reference, value)
        return { kind: 'ok', value }
      },
      async read({ reference }) {
        return { kind: 'ok', value: raw.get(reference) ?? null }
      },
      async readSeed() {
        return seedPack
          ? { kind: 'ok', value: seedPack }
          : { kind: 'unavailable', reason: 'no pack' }
      },
    },
    journal: {
      async findRun({ systemScopeRef, operationRef: ref }) {
        return {
          kind: 'ok',
          value:
            [...runs.values()].find(
              run =>
                run.command.address.systemScopeRef === systemScopeRef &&
                operationRef(run.command) === ref,
            ) ?? null,
        }
      },
      async readRun(query) {
        const existing = runs.get(key(query))
        return existing && existing.command.expectedFingerprint !== query.expectedFingerprint
          ? { kind: 'conflict', reason: 'fingerprint' }
          : { kind: 'ok', value: existing ?? null }
      },
      async prepareRun(run) {
        const previous = runs.get(key(run.command))
        if (previous && previous.command.expectedFingerprint !== run.command.expectedFingerprint)
          return { kind: 'conflict', reason: 'fingerprint' }
        if (!previous) runs.set(key(run.command), structuredClone(run))
        return { kind: 'ok', value: previous ?? run }
      },
      async completeRun(input) {
        if (flags.journalFails) return { kind: 'unavailable', reason: 'injected outage' }
        if (!completed.has(key(input))) {
          completed.set(key(input), input.operationRef)
          if (input.disposition === 'published' || input.disposition === 'noChange') {
            failures = 0
            lastSuccess = input.completedAt
          } else failures++
        }
        return { kind: 'ok', value: null }
      },
      async readProbe(input) {
        const old = probeReceipts.get(input.operationKey)
        return old && old.fingerprint !== input.fingerprint
          ? { kind: 'conflict', reason: 'fingerprint' }
          : { kind: 'ok', value: old?.standing ?? null }
      },
      async recordProbe(input) {
        const old = probeReceipts.get(input.operationKey)
        if (old)
          return old.fingerprint === input.fingerprint
            ? { kind: 'ok', value: old.standing }
            : { kind: 'conflict', reason: 'fingerprint' }
        const previous = sourceStates.get(input.observation.sourceId)
        const standing = {
          sourceId: input.observation.sourceId,
          observation: input.observation,
          nextDue: input.nextDue,
          consecutiveFailures:
            input.observation.kind === 'failed' ? (previous?.consecutiveFailures ?? 0) + 1 : 0,
          lastSuccess:
            input.observation.kind === 'failed'
              ? (previous?.lastSuccess ?? null)
              : input.observation.observedAt,
        }
        sourceStates.set(standing.sourceId, standing)
        probeReceipts.set(input.operationKey, { fingerprint: input.fingerprint, standing })
        return { kind: 'ok', value: standing }
      },
      async health() {
        const value: CalendarJournalHealth = {
          sources: [...sourceStates.values()],
          consecutiveFailures: failures,
          lastSuccess,
          pendingRuns: [...runs.entries()]
            .filter(([id]) => !completed.has(id))
            .map(([, run]) => run),
        }
        return { kind: 'ok', value }
      },
      async due() {
        return { kind: 'ok', value: [] }
      },
      async pending({ systemScopeRef }) {
        return {
          kind: 'ok',
          value: [...runs.entries()]
            .filter(
              ([id, run]) =>
                !completed.has(id) && run.command.address.systemScopeRef === systemScopeRef,
            )
            .map(([, run]) => run),
        }
      },
      async readAcknowledgement(input) {
        return { kind: 'ok', value: acknowledgements.get(input.acknowledgementKey) ?? null }
      },
      async prepareAcknowledgement(input) {
        const old = acknowledgements.get(input.acknowledgementKey)
        if (old && supplyDigest(old) !== supplyDigest(input))
          return { kind: 'conflict', reason: 'payload' }
        acknowledgements.set(input.acknowledgementKey, input)
        return { kind: 'ok', value: old ?? input }
      },
    },
    repository: {
      async getSnapshot(input) {
        return {
          kind: 'ok',
          value:
            input.version.kind === 'current'
              ? current
              : (snapshots.get(input.version.versionId) ?? null),
        }
      },
      async getCalendar() {
        return { kind: 'ok', value: null }
      },
      async listCalendars() {
        return { kind: 'ok', value: { items: [], nextCursor: null } }
      },
      async listVersions() {
        return { kind: 'ok', value: { items: [], nextCursor: null } }
      },
      async getCandidate(input) {
        const receipt = [...receipts.values()].find(item =>
          'candidateRef' in input
            ? item.candidateRef === input.candidateRef
            : item.disposition === 'published' &&
              item.address.calendarId === input.calendarId &&
              item.current?.versionId === input.versionId,
        )
        const command = receipt
          ? runs.get(key({ address: receipt.address, expectedFingerprint: receipt.fingerprint }))
              ?.command
          : undefined
        return {
          kind: 'ok',
          value:
            receipt && command ? { candidateRef: receipt.candidateRef, command, receipt } : null,
        }
      },
      async listCandidates() {
        return { kind: 'ok', value: { items: [], nextCursor: null } }
      },
      async listPendingReactions() {
        return { kind: 'ok', value: { items: [...pending.values()], nextCursor: null } }
      },
    },
    persistence: {
      async observeOperation(query) {
        calls.observe++
        if (flags.unknown) return { kind: 'unknown', operationRef: operationRef(query) }
        const receipt = receipts.get(key(query))
        if (receipt)
          return receipt.fingerprint === query.expectedFingerprint
            ? { kind: 'recorded', receipt, replayed: true }
            : { kind: 'rejected', reason: 'operationKeyConflict', message: 'intent changed' }
        return { kind: 'notCommitted', operationRef: operationRef(query) }
      },
      async commitDisposition(command: CalendarDispositionCommand) {
        calls.commit++
        const existing = receipts.get(key(command))
        if (existing) return { kind: 'recorded', receipt: existing, replayed: true }
        if (command.expectedGeneration !== (current?.publicationGeneration ?? 0))
          return { kind: 'rejected', reason: 'generationConflict', message: 'concurrent publisher' }
        const ref = operationRef(command)
        const publish = command.disposition.kind === 'publish'
        if (publish && command.disposition.kind === 'publish') {
          current = {
            ...command.disposition.snapshot,
            publicationGeneration: command.expectedGeneration + 1,
          }
          snapshots.set(current.versionId, current)
        }
        const receipt: CalendarPublicationReceipt = {
          operationRef: ref,
          address: command.address,
          fingerprint: command.expectedFingerprint,
          candidateRef: `candidate:${key(command)}`,
          disposition: publish ? 'published' : command.disposition.kind,
          current: current
            ? { versionId: current.versionId, publicationGeneration: current.publicationGeneration }
            : null,
          outboxId: publish ? `outbox:${key(command)}` : null,
        }
        receipts.set(key(command), receipt)
        if (receipt.outboxId && current)
          pending.set(receipt.outboxId, {
            id: receipt.outboxId,
            operationRef: ref,
            calendarId: command.address.calendarId,
            versionId: current.versionId,
            publicationGeneration: current.publicationGeneration,
          })
        if (flags.loseCommitReply) return { kind: 'unknown', operationRef: ref }
        return { kind: 'recorded', receipt, replayed: false }
      },
      async acknowledgeReaction(input) {
        calls.ack++
        pending.delete(input.id)
        return { kind: 'acknowledged' }
      },
    },
    reactionSink: {
      async handoff(input) {
        calls.handoff++
        return flags.handoffFails
          ? { kind: 'unavailable', reason: 'offline' }
          : { kind: 'accepted', handoffRef: `handoff:${input.id}` }
      },
    },
  }
  return {
    deps,
    calls,
    flags,
    runs,
    raw,
    pending,
    receipts,
    app: () => createCalendarSupplyApplication(deps),
    current: () => current,
    setSeed: (pack: CalendarSeedPack) => {
      seedPack = pack
    },
    setTime: (value: string) => {
      at = instantSchema.parse(value)
    },
  }
}
