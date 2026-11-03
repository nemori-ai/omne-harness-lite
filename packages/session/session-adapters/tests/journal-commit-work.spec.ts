// What a joint commit of the Journal provider tells the work cache (session-storage-sql RT-04):
// the work of its Session participation, only from a commit the call sent and that committed. A
// recall, a recovered Session answer and a rolled back commit tell nothing, so nothing is folded.
import type { CommittedV2, RolledBackV2 } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { jointSessionWork, type JournalCommitResult } from '../src/journal-commit.ts'

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
