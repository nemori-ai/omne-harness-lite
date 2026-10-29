import { describe, expect, it } from 'vitest'
import {
  decide,
  projectSessionLog,
  reduce,
  type HistoryEntry,
  type SessionAccess,
  type WorkSnapshot,
  type SessionLogObservation,
} from '@omne-harness/session-contract'
import {
  createMemorySessionHistorySource,
  createMemorySessionTransactions,
  createMemoryInitializationSource,
  createPolicySessionAccessCheck,
  memoryAccess,
  memoryOtherAccess,
  evidence,
  operationId,
  creation,
  ordinaryInput,
  guard,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { encodeEntry, decodeEntry } from '../src/entries.ts'
import { digestOf } from '../src/operations.ts'
import { initializationGuards } from './initialization-fixture.ts'

async function initial(access: SessionAccess<string>) {
  const initialization = createMemoryInitializationSource()
  const port = createMemorySessionTransactions<string>({
    initialization,
    accessCheck: createPolicySessionAccessCheck(() => ({
      kind: 'allowed',
      evidence: evidence('access'),
    })),
  })
  const command = {
    kind: 'create' as const,
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('create'),
      creation: creation(),
    },
  }
  initialization.controls.register(command, initializationGuards(command, null)[0]!)
  succeeded(
    await port.commit({
      access,
      command,
      guards: succeeded(await initialization.prepare(command), 'prepare'),
    }),
    'create',
  )
  succeeded(
    await port.commit({
      access,
      command: {
        kind: 'accept',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId('accept'),
          value: ordinaryInput('shared-input'),
        },
      },
      guards: [],
    }),
    'accept',
  )
  return {
    snapshot: succeeded(await port.readWork(access), 'read'),
    rows: port.controls.entriesOf(access.tenant, access.session),
  }
}

async function collidingHistory(access: SessionAccess<string>) {
  const initialState = await initial(access)
  const history = createMemorySessionHistorySource()
  const index = history.read(initialState.snapshot, initialState.rows, {
    kind: 'selected',
    inputs: initialState.snapshot.pending,
  }).index
  const snapshot = { ...initialState.snapshot, historyIndex: index }
  const start = decide(
    snapshot,
    {
      kind: 'startRun',
      input: {
        tenant: access.tenant,
        session: access.session,
        operation: operationId('start'),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'same-instance' },
      },
    },
    [guard('login', 'login-entry', 'present')],
    null,
    { compaction: null },
  )
  if (start.kind !== 'entries') throw new Error(JSON.stringify(start))
  const revision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
  const run = 'same-run' as Extract<WorkSnapshot['run'], { kind: 'active' }>['run']
  const attempt = 'same-attempt' as NonNullable<
    Extract<WorkSnapshot['run'], { kind: 'active' }>['advance']
  >['attempt']
  const rows: HistoryEntry[] = start.entries.map((encoded, at) => {
    const row = { ...encoded, revision, id: `scope-start-${at}` as HistoryEntry['id'] }
    const value = decodeEntry(row)
    if (!('ok' in value)) throw new Error('start fixture')
    const entry =
      value.ok.kind === 'run.started'
        ? { ...value.ok, run, execution: 'same-execution' }
        : value.ok.kind === 'run.attempt-started'
          ? { ...value.ok, run, attempt }
          : value.ok
    return { ...encodeEntry(entry, row.origin), revision, id: row.id }
  })
  const reduced = reduce(snapshot, { revision, entries: rows })
  if (reduced.kind !== 'reduced') throw new Error(reduced.diagnostic)
  return { snapshot: reduced.snapshot, rows: [...initialState.rows, ...rows], run, attempt }
}
const receipt = (row: HistoryEntry) => ({
  owner: '@omne-harness/session-contract',
  record: row.id,
  revision: row.revision,
  digest: `sha256:${digestOf(row)}`,
})

describe('explicit tenant and Session scope in the memory history source', () => {
  it('keeps observations, admissions, prefixes and roots independent with identical text identities', async () => {
    const scopes = [memoryAccess('a'), memoryOtherAccess('b'), memoryAccess('c', 'session-2')]
    const originals = await Promise.all(scopes.map(collidingHistory))
    const history = createMemorySessionHistorySource()
    const read = (at: number) => {
      const original = originals[at]!
      return history.read(original.snapshot, original.rows, {
        kind: 'selected',
        inputs: original.snapshot.pending,
      })
    }
    for (const [at, access] of scopes.entries()) {
      const unaffected = originals.map((_, other) => (other === at ? null : read(other)))
      const original = originals[at]!
      const start = original.rows.find(row => row.kind === 'run.started')!
      const attempt = original.rows.find(row => row.kind === 'run.attempt-started')!
      const observation: SessionLogObservation = {
        tenant: access.tenant,
        session: access.session,
        run: original.run,
        execution: 'same-execution',
        revision: '5',
        sequence: '1',
        source: evidence(`event-${at}`),
        executionEvidence: evidence(`head-${at}`),
        consequences: [
          {
            kind: 'input-taken',
            batch: {
              id: 'same-batch' as never,
              ordered: original.snapshot.pending,
              watermark: evidence(`watermark-${at}`),
            },
          },
        ],
      }
      history.observe(observation)
      history.admit(access, original.snapshot.pending[0]!, {
        ordinal: '0',
        run: original.run,
        execution: 'same-execution',
        operation: 'same-operation',
        accepted: evidence(`accepted-${at}`),
        attempt: original.attempt,
        runStarted: receipt(start),
        attemptStarted: receipt(attempt),
        attachment: 'same-attachment',
        grant: evidence(`grant-${at}`),
      })
      for (const [other, prior] of unaffected.entries())
        if (prior !== null) expect(read(other)).toEqual(prior)
      const material = read(at)
      expect(material.index.root.tenant).toEqual(access.tenant)
      expect(material.index.root.session).toBe(access.session)
      expect(material.index.root.position).toBe(String(original.rows.length + 1))
      expect(material.index.executions).toHaveLength(1)
      expect(material.index.executions[0]).toMatchObject({
        run: original.run,
        execution: 'same-execution',
        executionEvidence: evidence(`head-${at}`),
        facts: [{ source: evidence(`event-${at}`) }],
      })
      expect(material.index.inputs[0]?.members).toHaveLength(1)
      expect(material.reads.admissions[0]?.records[0]?.accepted).toEqual(evidence(`accepted-${at}`))
      const reads = {
        ...material.reads,
        prefixes: [
          {
            run: original.run,
            execution: 'same-execution',
            after: '0',
            through: '1',
            facts: [
              { sequence: '1', source: observation.source, consequences: observation.consequences },
            ],
          },
        ],
      }
      const snapshot = { ...original.snapshot, historyIndex: material.index }
      expect(projectSessionLog(snapshot, observation, reads).kind).toBe('entries')
      const foreign = scopes[(at + 1) % scopes.length]!
      expect(
        projectSessionLog(
          snapshot,
          { ...observation, tenant: foreign.tenant, session: foreign.session },
          reads,
        ),
      ).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'denied' },
      })
      expect(() =>
        history.read(
          original.snapshot,
          originals[(at + 1) % originals.length]!.rows,
          material.reads.scope,
        ),
      ).toThrow('history entries belong to another tenant or Session')
    }
  })
})
