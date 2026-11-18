import { describe, expect, it } from 'vitest'
import {
  decide,
  reduce,
  type CommittedBatch,
  type Decision,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { initializationScenario } from './initialization-scenario.ts'

function modeChange(snapshot: WorkSnapshot, expectedRevision: string, name = 'mode-change') {
  return {
    kind: 'change',
    input: {
      tenant: snapshot.tenant,
      session: snapshot.session,
      operation: operationId(name),
      declaration: {
        kind: 'permission-mode',
        value: 'auto_permission',
        expectedRevision,
        authorization: evidence('login-entry'),
      },
    },
  } satisfies SessionCommand
}

function committed(snapshot: WorkSnapshot, decision: Decision): WorkSnapshot {
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const revision = String(BigInt(snapshot.revision) + 1n) as CommittedBatch['revision']
  const result = reduce(snapshot, {
    revision,
    entries: decision.entries.map((entry, index) => ({
      ...entry,
      revision,
      id: `${revision}/${index}` as CommittedBatch['entries'][number]['id'],
    })),
  })
  if (result.kind !== 'reduced') throw new Error(result.diagnostic)
  return result.snapshot
}

describe('a permission mode change against the permission revision it was read at', () => {
  it('commits at the current revision and moves the permission revision by one', () => {
    const before = initializationScenario().preview()
    const after = committed(
      before,
      decide(before, modeChange(before, before.permissions.revision), [], null, {
        compaction: null,
      }),
    )
    expect(after.permissions.revision).toBe('1')
  })

  it('answers changed when the permission revision moved since the read', () => {
    const before = initializationScenario().preview()
    const after = committed(
      before,
      decide(before, modeChange(before, '0', 'first'), [], null, { compaction: null }),
    )
    expect(decide(after, modeChange(after, '0', 'second'), [], null, { compaction: null })).toEqual(
      { kind: 'rejected', failure: { kind: 'changed', revision: after.revision } },
    )
  })

  it('answers changed for an expected revision that names no revision', () => {
    const before = initializationScenario().preview()
    expect(decide(before, modeChange(before, 'latest'), [], null, { compaction: null })).toEqual({
      kind: 'rejected',
      failure: { kind: 'changed', revision: before.revision },
    })
  })
})
