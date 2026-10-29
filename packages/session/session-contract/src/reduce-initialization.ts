import type { CommittedBatch } from './judgments.ts'
import type { HistoryEntry } from './faces.ts'
import type { WorkSnapshot } from './values.ts'
import type { SessionEntry } from './entries.ts'
import { toJsonValue } from './entries.ts'
import { decide } from './decide.ts'
import { INITIALIZATION_PROTOCOL, type InitializationGuardFacts } from './initialization-schema.ts'
import {
  initializationKey,
  sameInitializationValue as same,
  tenantText,
} from './initialization-plan.ts'
import { digestOf } from './operations.ts'

function historicalGuard(facts: InitializationGuardFacts) {
  return {
    owner: 'session-initialization',
    participant: 'session-evidence',
    protocol: INITIALIZATION_PROTOCOL,
    facts: toJsonValue(facts),
  }
}

export function validateInitializationBatch(
  previous: WorkSnapshot | null,
  batch: CommittedBatch,
  decoded: readonly SessionEntry[],
): string | null {
  try {
    const created = decoded.find(entry => entry.kind === 'session.created')
    const outcomes = decoded.filter(entry => entry.kind === 'session.initialization-item')
    let decision
    if (created !== undefined) {
      if (previous !== null || decoded[0] !== created || created.initializationProtocol !== 1)
        return 'invalid initialization creation position or protocol'
      const expected = created.creation.initialization?.results ?? []
      const facts: InitializationGuardFacts = {
        version: 1,
        command: 'create',
        binding: {
          tenant: tenantText(created.tenant),
          session: created.session,
          operation: created.operation,
          createOperation: created.operation,
        },
        input: created.input,
        initialAdoption: created.initialAdoption,
        requirements: created.requirements,
        plan: created.plan,
        results: expected.map(result => {
          const found = outcomes.find(
            entry => initializationKey(entry.result) === initializationKey(result),
          )
          if (found === undefined) throw new Error('creation result has no initialization fact')
          return found.outcome
        }),
      }
      decision = decide(
        null,
        {
          kind: 'create',
          input: {
            tenant: created.tenant,
            session: created.session,
            operation: created.operation,
            creation: created.creation,
          },
        },
        [historicalGuard(facts)],
        null,
        { compaction: null },
      )
    } else if (outcomes.length > 0) {
      const entry = outcomes[0]
      if (entry === undefined || outcomes.length !== 1 || previous === null)
        return 'initialization completion has no unique original item'
      const command = {
        kind: 'completeInitialization' as const,
        input: {
          tenant: previous.tenant,
          session: previous.session,
          operation: entry.operation,
          result: entry.result,
        },
      }
      const facts: InitializationGuardFacts = {
        version: 1,
        command: command.kind,
        binding: {
          tenant: tenantText(previous.tenant),
          session: previous.session,
          operation: entry.operation,
          createOperation: entry.createOperation,
        },
        input: toJsonValue({ ...command.input, tenant: tenantText(previous.tenant) }),
        initialAdoption: null,
        requirements: null,
        plan: [entry.plan],
        results: [entry.outcome],
      }
      decision = decide(previous, command, [historicalGuard(facts)], null, { compaction: null })
    } else {
      return decoded.some(entry => 'initialization' in entry && entry.initialization !== undefined)
        ? 'initialization success facts have no corresponding result'
        : null
    }
    if (decision.kind !== 'entries')
      return `invalid initialization history: ${JSON.stringify(decision)}`
    const actual = batch.entries.map(({ id: _id, revision: _revision, ...entry }) => entry)
    return same(actual, decision.entries)
      ? null
      : 'initialization batch facts, bindings or references are inconsistent'
  } catch (error) {
    return `missing or malformed initialization history: ${error instanceof Error ? error.message : String(error)}`
  }
}

function entryEvidence(snapshot: WorkSnapshot, entry: HistoryEntry) {
  return {
    owner: '@omne-harness/session-contract',
    record: JSON.stringify([tenantText(snapshot.tenant), snapshot.session, entry.id]),
    revision: entry.revision,
    digest: `sha256:${digestOf(entry)}`,
  }
}

export function initializationProjection(
  snapshot: WorkSnapshot,
  entry: SessionEntry,
  row: HistoryEntry,
  batch: CommittedBatch,
): WorkSnapshot['initialization'] {
  const state = snapshot.initialization
  if (state === undefined) return undefined
  if (entry.kind === 'session.initialization-item') {
    const first = batch.entries[0]
    const last = batch.entries.at(-1)
    if (first === undefined || last === undefined)
      throw new Error('empty committed initialization batch')
    return {
      ...state,
      results: [
        ...state.results,
        {
          operation: entry.operation,
          outcome: entry.outcome,
          facts: entry.facts,
          entry: entryEvidence(snapshot, row),
          revision: row.revision,
          range: { first: first.id, last: last.id },
        },
      ],
    }
  }
  if (entry.kind === 'session.context-registration-changed' && entry.initialization !== undefined)
    return {
      ...state,
      registrations: [
        ...state.registrations,
        {
          plan: entry.initialization.plan,
          prepared: entry.initialization.prepared,
          decision: entry.initialization.decision,
          entry: entryEvidence(snapshot, row),
        },
      ],
    }
  return state
}
