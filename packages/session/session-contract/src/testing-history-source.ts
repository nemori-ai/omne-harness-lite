import { tenantEquals, tenantCodec } from '@omne-harness/legal-identity'
import type { HistoryEntry } from './faces.ts'
import type {
  SessionHistoryIndex,
  SessionHistoryReads,
  SessionInputAdmission,
  SessionInputScope,
} from './history-values.ts'
import type { InputId, SessionAccess } from './identity.ts'
import type { SessionLogObservation } from './projection.ts'
import type { WorkSnapshot } from './values.ts'
import { decodeEntry } from './entries.ts'
import { digestOf } from './operations.ts'
import { evidence } from './testing-values.ts'

export interface MemorySessionHistorySource {
  /** Fixture-owned Agent facts. Calling this asserts the original event, not adapter verification. */
  observe(observation: SessionLogObservation): void
  /** The caller supplies original grant and attachment facts; none are inferred from pending. */
  admit(
    scope: Pick<SessionAccess<never>, 'tenant' | 'session'>,
    input: InputId,
    admission: SessionInputAdmission,
  ): void
  read(
    snapshot: WorkSnapshot,
    entries: readonly HistoryEntry[],
    scope: SessionInputScope,
  ): Readonly<{ index: SessionHistoryIndex; reads: SessionHistoryReads }>
}

/** Explicitly empty, non-durable Agent-history fixture, populated only through observe/admit. */
export function createMemorySessionHistorySource(): MemorySessionHistorySource {
  const scopes = new Map<
    string,
    {
      admissions: Map<InputId, SessionInputAdmission[]>
      observations: SessionLogObservation[]
    }
  >()
  const factsOf = (scope: Pick<SessionAccess<never>, 'tenant' | 'session'>) => {
    const tenant = tenantCodec.encode(scope.tenant)
    if (!tenant.ok || scope.session.length === 0) throw new TypeError('invalid history scope')
    const key = JSON.stringify([tenant.value, scope.session])
    let facts = scopes.get(key)
    if (facts === undefined) {
      facts = { admissions: new Map(), observations: [] }
      scopes.set(key, facts)
    }
    return facts
  }
  return {
    observe(observation) {
      const { observations } = factsOf(observation)
      if (!observations.some(original => digestOf(original) === digestOf(observation)))
        observations.push(observation)
    },
    admit(scope, input, admission) {
      const { admissions } = factsOf(scope)
      admissions.set(input, [...(admissions.get(input) ?? []), admission])
    },
    read(snapshot, entries, scope) {
      const { admissions, observations } = factsOf(snapshot)
      const rows = entries.flatMap(row => {
        const decoded = decodeEntry(row)
        return 'ok' in decoded ? [{ row, value: decoded.ok }] : []
      })
      const creation = rows[0]?.value
      if (
        creation?.kind !== 'session.created' ||
        !tenantEquals(creation.tenant, snapshot.tenant) ||
        creation.session !== snapshot.session
      )
        throw new TypeError('history entries belong to another tenant or Session')
      const receipt = (row: HistoryEntry) => ({
        owner: '@omne-harness/session-contract',
        record: row.id,
        revision: row.revision,
        digest: `sha256:${digestOf(row)}`,
      })
      const accepted = rows.flatMap(({ row, value }) =>
        value.kind === 'intake.routed' && 'input' in value
          ? [{ input: value.input, source: receipt(row) }]
          : [],
      )
      const root = {
        tenant: snapshot.tenant,
        session: snapshot.session,
        position: String(entries.length + observations.length),
        source: evidence(
          `fixture-root:${digestOf({ entries, observations, admissions: [...admissions] })}`,
        ),
      }
      const inputs = accepted.map(({ input, source }) => ({
        input,
        directory: `fixture-directory:${input}`,
        version: String(admissions.get(input)?.length ?? 0),
        count: String(admissions.get(input)?.length ?? 0),
        source,
        members: (admissions.get(input) ?? []).map(
          ({ ordinal, run, execution, operation, accepted, attempt }) => ({
            ordinal,
            run,
            execution,
            operation,
            accepted,
            attempt,
          }),
        ),
      }))
      const starts = rows.flatMap(({ row, value }) =>
        value.kind === 'run.started' ? [{ ...value, source: receipt(row) }] : [],
      )
      const attempts = rows.flatMap(({ row, value }) => {
        if (value.kind !== 'run.attempt-started') return []
        const start = starts.find(start => start.run === value.run)
        return start === undefined
          ? []
          : [
              {
                run: value.run,
                attempt: value.attempt,
                execution: start.execution,
                ordinal: value.ordinal,
                started: receipt(row),
              },
            ]
      })
      const executions = starts.flatMap(start => {
        const events = observations.filter(
          observation => observation.execution === start.execution && observation.run === start.run,
        )
        const latest = events.at(-1)
        if (latest === undefined) return []
        const reference = snapshot.executions?.find(item => item.run === start.run)?.execution
        const readThrough = reference?.readThrough ?? '0'
        const interpreted = rows.findLast(
          ({ value }) =>
            value.kind === 'history.annotated' && 'execution' in value && value.run === start.run,
        )
        const ended = events.find(
          observation =>
            observation.sequence !== null &&
            observation.consequences.some(item => item.kind === 'ended'),
        )
        return [
          {
            run: start.run,
            execution: start.execution,
            started: start.source,
            revision:
              reference?.revision !== null &&
              reference?.revision !== undefined &&
              BigInt(reference.revision) > BigInt(latest.revision)
                ? reference.revision
                : latest.revision,
            executionEvidence:
              reference?.revision !== null &&
              reference?.revision !== undefined &&
              BigInt(reference.revision) > BigInt(latest.revision)
                ? reference.evidence!
                : (latest.executionEvidence ?? latest.source),
            emittedThrough: events.reduce(
              (max, event) =>
                event.sequence !== null && BigInt(event.sequence) > BigInt(max)
                  ? event.sequence
                  : max,
              '0',
            ),
            readThrough,
            interpreted:
              readThrough === '0' || interpreted === undefined ? null : receipt(interpreted.row),
            ended:
              ended?.sequence == null ? null : { sequence: ended.sequence, source: ended.source },
            facts: events.flatMap(event =>
              event.sequence === null
                ? []
                : [
                    {
                      sequence: event.sequence,
                      source: event.source,
                      kinds: event.consequences.map(item => item.kind),
                    },
                  ],
            ),
          },
        ]
      })
      const batches = observations.flatMap(observation =>
        observation.consequences.flatMap(item =>
          item.kind === 'input-taken' && observation.sequence !== null
            ? [
                {
                  run: observation.run,
                  execution: observation.execution,
                  sequence: observation.sequence,
                  source: observation.source,
                  batch: item.batch,
                },
              ]
            : [],
        ),
      )
      const taken = batches.flatMap(batch => {
        const committed = rows.find(
          ({ value, row }) =>
            value.kind === 'run.batch-taken' &&
            value.run === batch.run &&
            value.batch.id === batch.batch.id &&
            digestOf(row.origin.source) === digestOf(batch.source),
        )
        return committed === undefined ? [] : [{ ...batch, commit: receipt(committed.row) }]
      })
      const index: SessionHistoryIndex = { root, inputs, executions, attempts, batches, taken }
      return {
        index,
        reads: {
          root,
          scope,
          admissions: inputs.flatMap(boundary => {
            const records = admissions.get(boundary.input) ?? []
            return records.length === 0
              ? []
              : [
                  {
                    input: boundary.input,
                    directory: boundary.directory,
                    version: boundary.version,
                    offset: '0',
                    next: null,
                    records,
                  },
                ]
          }),
          prefixes: [],
          attempts,
          taken,
        },
      }
    },
  }
}
