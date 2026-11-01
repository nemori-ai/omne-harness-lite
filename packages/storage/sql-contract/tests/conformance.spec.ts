// The conformance suite: it passes for the memory double, and each deliberately wrong provider is
// caught by the scenario that owns the violated property (SPEC 16.1, third column).
import { describe, expect, it } from 'vitest'
import type {
  CommitRequestV2,
  CommitResultV2,
  QueryResultV2,
  SqlIdentity,
  SqlStorage,
} from '@omne-harness/sql-contract'
import {
  createMemorySqlStorage,
  runSqlStorageConformance,
  type SqlConformanceSubject,
} from '@omne-harness/sql-contract/testing'

type Wrap = (inner: SqlStorage, close: () => Promise<unknown>) => Partial<SqlStorage>

function subjectWith(wrap?: Wrap, controlOverride?: 'noop-close'): SqlConformanceSubject {
  return {
    durability: 'none',
    async create({ materials }) {
      const { storage, control } = await createMemorySqlStorage({ materials })
      if (wrap === undefined) return { storage, control }
      const wrapped: SqlStorage = {
        registerCombination: input => storage.registerCombination(input),
        commit: (input, options) => storage.commit(input, options),
        query: input => storage.query(input),
        read: (input, options) => storage.read(input, options),
        ...wrap(storage, () => control.close({ initiator: 'disposal' })),
      }
      return {
        storage: wrapped,
        control:
          controlOverride === 'noop-close'
            ? { close: () => Promise.resolve({ kind: 'closed' }), assemblyReportSettled() {} }
            : control,
      }
    },
  }
}

async function failedIds(subject: SqlConformanceSubject): Promise<string[]> {
  try {
    await runSqlStorageConformance(subject)
    return []
  } catch (error) {
    const failures = (error as { failures?: { id: string }[] }).failures
    if (failures === undefined) throw error
    return failures.map(failure => failure.id)
  }
}

describe('runSqlStorageConformance', () => {
  it('passes for the memory double', async () => {
    await expect(runSqlStorageConformance(subjectWith())).resolves.toBeUndefined()
  })

  it('rejects a subject that declares an unknown durability', async () => {
    const subject = { ...subjectWith(), durability: 'forever' } as unknown as SqlConformanceSubject
    await expect(runSqlStorageConformance(subject)).rejects.toThrow(/durability/)
  })

  it('names every failed scenario, not only the first one', async () => {
    const ids = await failedIds(
      subjectWith(inner => ({
        query: () => Promise.reject(new Error('broken')),
        commit: (input, options) =>
          inner.commit(
            { ...input, identity: { ...input.identity, operationKey: 'same' } },
            options,
          ),
      })),
    )
    expect(ids.length).toBeGreaterThan(1)
  })
})

describe('violating providers are caught', () => {
  const sameKey = (identity: SqlIdentity): SqlIdentity => ({ ...identity, operationKey: 'same' })

  it('C01: a provider that ignores a dimension of the identity', async () => {
    const ids = await failedIds(
      subjectWith(inner => ({
        commit: (input, options) =>
          inner.commit({ ...input, identity: sameKey(input.identity) }, options),
      })),
    )
    expect(ids).toContain('C01')
  })

  it('C02: a provider whose digest depends on the order of commands', async () => {
    const seen = new Map<string, string>()
    const ids = await failedIds(
      subjectWith(inner => ({
        commit: async (input: CommitRequestV2, options): Promise<CommitResultV2> => {
          const key = JSON.stringify(input.identity)
          const order = JSON.stringify(input.commands.map(c => c.participant))
          const before = seen.get(key)
          seen.set(key, before ?? order)
          if (before !== undefined && before !== order) {
            const existing = await inner.query(input.identity)
            if (existing.kind === 'committed' || existing.kind === 'rolled_back')
              return { kind: 'identity_conflict', identity: input.identity, existing }
          }
          return inner.commit(input, options)
        },
      })),
    )
    expect(ids).toContain('C02')
  })

  it('C02: a provider that accepts a fact that is not JSON', async () => {
    const ids = await failedIds(
      subjectWith(inner => ({
        commit: (input, options) =>
          inner.commit(
            {
              ...input,
              commands: input.commands.map(c => ({
                ...c,
                facts: JSON.parse(JSON.stringify(c.facts)) as typeof c.facts,
              })),
            },
            options,
          ),
      })),
    )
    expect(ids).toContain('C02')
  })

  it('C03: a provider that reports the participants in the order of the request', async () => {
    const ids = await failedIds(
      subjectWith(inner => ({
        commit: async (input, options) => {
          const result = await inner.commit(input, options)
          if (result.kind !== 'committed') return result
          const [first, ...rest] = [...result.responses].reverse()
          return first === undefined ? result : { ...result, responses: [first, ...rest] }
        },
      })),
    )
    expect(ids).toContain('C03')
  })

  it('C04: a provider that reports a rollback as committed', async () => {
    const ids = await failedIds(
      subjectWith(inner => ({
        commit: async (input, options) => {
          const result = await inner.commit(input, options)
          if (result.kind !== 'rolled_back') return result
          const { responses, ...rest } = result
          const participated = responses.map(entry => ({
            ...entry,
            reply: { kind: 'participated' as const, response: null },
          }))
          const [first, ...others] = participated
          if (first === undefined) return result
          return { ...rest, kind: 'committed', responses: [first, ...others] }
        },
      })),
    )
    expect(ids).toContain('C04')
  })

  it('C05: a provider that rewrites the original response on recognition', async () => {
    const ids = await failedIds(
      subjectWith(inner => ({
        query: async (identity): Promise<QueryResultV2> => {
          const result = await inner.query(identity)
          if (result.kind !== 'rolled_back') return result
          const responses = result.responses.map(entry =>
            entry.reply.kind === 'conflict'
              ? { ...entry, reply: { kind: 'conflict' as const, basis: { why: 'changed' } } }
              : entry,
          )
          return { ...result, responses } as unknown as QueryResultV2
        },
      })),
    )
    expect(ids).toContain('C05')
  })

  it('C06: a provider that answers not_committed for a committed operation', async () => {
    const proofs = {
      writerGenerationExcluded: true,
      oldTransactionTerminated: true,
      databaseRecoveryFinished: true,
      authoritativeReadSucceeded: true,
      operationNotQueued: true,
    } as const
    const ids = await failedIds(
      subjectWith(() => ({
        query: identity => Promise.resolve({ kind: 'not_committed', identity, proofs }),
      })),
    )
    expect(ids).toContain('C06')
  })

  it('C07: a provider that lets a violation of the fact port go through', async () => {
    const ids = await failedIds(
      subjectWith(inner => ({
        commit: async (input, options) => {
          const result = await inner.commit(input, options)
          if (result.kind !== 'rolled_back') return result
          const last = result.responses[result.responses.length - 1]
          if (last?.reply.kind === 'failed' && last.reply.category === 'fact_violation')
            return { kind: 'unknown', identity: input.identity, diagnostic: null }
          return result
        },
      })),
    )
    expect(ids).toContain('C07')
  })

  it('C12: a provider that ignores a signal that is already aborted', async () => {
    const ids = await failedIds(subjectWith(inner => ({ commit: input => inner.commit(input) })))
    expect(ids).toContain('C12')
  })

  it('C14: a provider that keeps working after close', async () => {
    const ids = await failedIds(subjectWith(() => ({}), 'noop-close'))
    expect(ids).toContain('C14')
  })

  it('C16: a provider whose other scope sees the domain of a tenant', async () => {
    const ids = await failedIds(
      subjectWith(inner => ({
        query: identity =>
          inner.query({ ...identity, scope: { kind: 'tenant', tenant: 'tenant-a' } }),
        commit: (input, options) =>
          inner.commit(
            {
              ...input,
              identity: { ...input.identity, scope: { kind: 'tenant', tenant: 'tenant-a' } },
            },
            options,
          ),
      })),
    )
    expect(ids).toContain('C16')
  })
})
