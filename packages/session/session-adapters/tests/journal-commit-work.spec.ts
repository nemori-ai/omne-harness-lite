// What a joint commit of the Journal provider tells the work cache (session-storage-sql RT-04):
// the work of its Session participation, only from a commit the call sent and that committed. A
// recall, a recovered Session answer and a rolled back commit tell nothing, so nothing is folded.
import type { CommittedV2, RolledBackV2, SqlStorage } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { jointSessionWork, type JournalCommitResult } from '../src/journal-commit.ts'
import { evidence, ok } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

const work = {
  tail: '5',
  published: '3',
  bytes: 100,
  first: '9',
  last: '10',
  indexed: true,
  basis: { scope: { kind: 'pending', inputs: [] }, focus: { executions: [], event: null } },
}

function receipt(recovered: boolean): CommittedV2 {
  return {
    kind: 'committed',
    responses: [
      {
        participant: 'execution-record',
        protocol: '1',
        reply: { kind: 'participated', response: { published: '3', digest: 'e' } },
      },
      {
        participant: 'session',
        protocol: '1',
        reply: {
          kind: 'participated',
          response: { result: null, recovered, digest: 'd', work },
        },
      },
    ],
  } as unknown as CommittedV2
}

describe('the Session work of a joint commit', () => {
  it('a fresh committed commit gives the work of its Session participation', () => {
    const outcome: JournalCommitResult = {
      kind: 'committed',
      receipt: receipt(false),
      recalled: false,
    }
    expect(jointSessionWork(outcome)).toEqual(work)
  })

  it('a recall, a recovered Session answer and a rolled back commit give none', () => {
    expect(jointSessionWork({ kind: 'committed', receipt: receipt(false), recalled: true })).toBe(
      undefined,
    )
    expect(jointSessionWork({ kind: 'committed', receipt: receipt(true), recalled: false })).toBe(
      undefined,
    )
    const rolled = { ...receipt(false), kind: 'rolled_back' } as unknown as RolledBackV2
    expect(jointSessionWork({ kind: 'rolled-back', receipt: rolled })).toBe(undefined)
  })

  it('a commit without a Session participation gives none', () => {
    const only = {
      kind: 'committed',
      responses: [receipt(false).responses[0]],
    } as unknown as CommittedV2
    expect(jointSessionWork({ kind: 'committed', receipt: only, recalled: false })).toBe(undefined)
  })
})

/**
 * A Session `result` that cannot be decoded: its tenant text does not parse. The joint commit
 * reads only the `work` of the reply, so such a result must not reach the publication of the
 * Agent write (it is Session's content, not the Journal's).
 */
describe('a Session reply with a result the Journal cannot decode', () => {
  const undecodable = {
    participant: 'session',
    protocol: '1',
    reply: {
      kind: 'participated',
      response: { result: { $tenant: 'not-a-tenant' }, recovered: false, digest: 'd', work },
    },
  }

  it('still gives the work of the reply, and never throws', () => {
    const outcome = {
      kind: 'committed',
      receipt: { kind: 'committed', responses: [undecodable] },
      recalled: false,
    } as unknown as JournalCommitResult
    expect(jointSessionWork(outcome)).toEqual(work)
  })

  it('a malformed work gives none, also without throwing', () => {
    for (const bad of [null, 5, [], { ...work, tail: 'x' }, { ...work, bytes: '1' }]) {
      const reply = { ...undecodable.reply, response: { ...undecodable.reply.response, work: bad } }
      const outcome = {
        kind: 'committed',
        receipt: { kind: 'committed', responses: [{ ...undecodable, reply }] },
        recalled: false,
      } as unknown as JournalCommitResult
      expect(jointSessionWork(outcome)).toBe(undefined)
    }
  })

  it('the publication of the Agent write returns normally', async () => {
    const s = await sqlScene('undecodable-result')
    try {
      const wrapped: SqlStorage = {
        registerCombination: input => s.storage.registerCombination(input),
        query: identity => s.storage.query(identity),
        read: (request, options) => s.storage.read(request, options),
        commit: async (request, options) => {
          const result = await s.storage.commit(request, options)
          if (result.kind !== 'committed') return result
          const others = result.responses.filter(item => item.participant !== 'session')
          return { ...result, responses: [...others, undecodable] } as unknown as typeof result
        },
      }
      const journal = createSessionLogJournal<string>({
        storage: wrapped,
        tenantDomainLookup: { lookup: () => Promise.resolve({ kind: 'ready', domain: s.domain }) },
        sessionAccessCheck: {
          check: request =>
            Promise.resolve({ kind: 'allowed', evidence: evidence(`access/${request.operation}`) }),
        },
        combination: s.combination,
      }).forSession(s.access).journal
      const opened = ok(await journal.open(s.openInput))
      expect(opened.receipt.state).toBe('applied')
    } finally {
      await s.close()
    }
  })
})
