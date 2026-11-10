// The `./participants` entry: the participant vocabulary that a committer outside this member uses.
// The command facts it builds are the ones the `session` module executes, its decoder reads every
// reply kind, and the entry pulls no provider implementation in.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commandDigest, type SessionCommand } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionId,
  testingTenant,
} from '@omne-harness/session-contract/testing'
import type { RecordedReply } from '@omne-harness/sql-contract'
import rawParticipant from '../src/worker/participant.ts'
import ordinaryBasis from '../src/worker/ordinary-basis.ts'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import type { JsonValue } from '@omne-harness/sql-contract'
import { migratedPort } from './fixtures/sqlite-storage.ts'

// Module-level tests execute both owned participants with transaction-local facts.
const participant: ParticipantModule = {
  ...rawParticipant,
  execute(facts, port) {
    const shared = new Map<string, JsonValue>()
    const transaction = {
      ...port,
      requireFact: (key: { key: string; protocol: string }) => {
        const value = shared.get(JSON.stringify(key))
        if (value === undefined) throw new Error('missing test fact')
        return value
      },
      provideFact: (key: { key: string; protocol: string }, value: JsonValue) => {
        shared.set(JSON.stringify(key), value)
      },
    }
    const prepared = ordinaryBasis.execute(
      { commands: [{ participant: 'session', facts }] },
      transaction,
    )
    return prepared.kind === 'participated' ? rawParticipant.execute(facts, transaction) : prepared
  },
}

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const tenant = testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')

function createCommand(): { command: SessionCommand; guards: never[] } {
  const command: SessionCommand = {
    kind: 'create',
    input: {
      tenant,
      session: sessionId('participants-1'),
      operation: operationId('create-participants-1'),
      creation: creation(),
    },
  }
  const guards = [
    initializationFixtureGuard(
      initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
    ),
  ] as never[]
  return { command, guards }
}

describe('the ./participants entry', () => {
  it('exports the vocabulary and nothing that builds a port', async () => {
    const entry = (await import('@omne-harness/session-storage-sql/participants')) as Record<
      string,
      unknown
    >
    expect(Object.keys(entry).sort()).toEqual([
      'EXECUTION_BATCH_MAX_FACTS',
      'EXECUTION_FACT_MAX_BYTES',
      'EXECUTION_RECORD_HANDLERS',
      'EXECUTION_RECORD_PARTICIPANT',
      'EXECUTION_RECORD_PROTOCOL',
      'ExecutionCurrentSchema',
      'SESSION_COMMIT_BASIS',
      'SESSION_COMMIT_RESULT',
      'SESSION_EXECUTION_CURRENT_FACT',
      'SESSION_EXECUTION_GUARD',
      'SESSION_EXECUTION_HANDLER',
      'SESSION_HISTORY_ROOT_HANDLER',
      'SESSION_INPUT_HANDLER',
      'SESSION_LOG_PARTICIPANTS',
      'SESSION_ORDINARY_BASIS',
      'SESSION_PARTICIPANT',
      'SESSION_PERMISSION_CURRENT_FACT',
      'SESSION_PERMISSION_CURRENT_HANDLER',
      'SESSION_PERMISSION_GUARD',
      'SESSION_PERMISSION_MODE_HANDLER',
      'SESSION_PROTOCOL',
      'SESSION_READ_PROTOCOL',
      'SESSION_WORK_HANDLER',
      'SessionCommitBasisSchema',
      'SessionCommitResultSchema',
      'blobDigest',
      'decodeExecutionBlobsReply',
      'decodeExecutionRecordBlob',
      'decodeExecutionRecordEvents',
      'decodeExecutionRecordFacts',
      'decodeExecutionRecordOpen',
      'decodeExecutionRecordOperation',
      'decodeExecutionRecordReply',
      'decodePreadmissionRecord',
      'decodePreadmissionReply',
      'decodeSessionExecution',
      'decodeSessionHistoryRoot',
      'decodeSessionInput',
      'decodeSessionPermissionCurrent',
      'decodeSessionPermissionMode',
      'decodeSessionReply',
      'decodeSessionWork',
      'executionCurrentGuardFacts',
      'executionRecordBlobFacts',
      'executionRecordFacts',
      'preadmissionFacts',
      'readCachedSessionWork',
      'registerSessionWorkIndex',
      'sessionCheckDigest',
      'sessionCheckFacts',
      'sessionCommandFacts',
      'sessionCommitCommands',
      'sessionCommitDigest',
      'sessionPermissionGuardFacts',
    ])
    expect(entry['SESSION_LOG_PARTICIPANTS']).toEqual([
      'execution-record',
      'session-ordinary-basis',
      'session',
    ])
  })

  it('imports pure intake rules, the codec and the work cache: no port, context or commit module', () => {
    const text = readFileSync(join(root, 'src', 'participants.ts'), 'utf8')
    const values = [...text.matchAll(/^import (?!type )[\s\S]*?from '([^']+)'/gm)].map(
      match => match[1],
    )
    expect(values).toEqual([
      './commit-basis.ts',
      '@omne-harness/session-contract',
      './codec.ts',
      './work-cache.ts',
    ])
  })
})

describe('the session command facts', () => {
  it.each([
    0,
    '2',
    true,
    null,
    [],
    {},
    { maxPendingInputs: '2', maxInputBytes: 1024 },
    { maxPendingInputs: 0, maxInputBytes: 1024 },
  ])('rejects malformed trusted intake configuration before committing: %j', async intakeLimits => {
    const { sessionCommandFacts } = await import('../src/participants.ts')
    const { command, guards } = createCommand()
    const { port } = migratedPort()
    const facts = sessionCommandFacts(command, guards)
    expect(participant.execute({ ...facts.facts, intakeLimits }, port)).toMatchObject({
      kind: 'unsupported',
      basis: { reason: 'invalid intake limits' },
    })
    expect(participant.execute(facts.facts, port)).toMatchObject({ kind: 'participated' })
  })

  it('the session module executes them and the decoder reads its answer and digest', async () => {
    const { sessionCommandFacts, decodeSessionReply } = await import('../src/participants.ts')
    const { command, guards } = createCommand()
    const { port } = migratedPort()
    const facts = sessionCommandFacts(command, guards)
    expect(facts.participant).toBe('session')
    const reply = participant.execute(facts.facts, port) as RecordedReply
    const decoded = decodeSessionReply(reply)
    expect(decoded.kind).toBe('participated')
    if (decoded.kind !== 'participated') return
    expect(decoded.digest).toBe(commandDigest(command))
    expect(decoded.recovered).toBe(false)
    const again = decodeSessionReply(participant.execute(facts.facts, port) as RecordedReply)
    expect(again).toMatchObject({ kind: 'participated', recovered: true })
  })

  it('decodes a stopping reply of each kind', async () => {
    const { decodeSessionReply } = await import('../src/participants.ts')
    expect(
      decodeSessionReply({ kind: 'conflict', basis: { failure: { kind: 'changed' } } }),
    ).toEqual({ kind: 'stopped', failure: { kind: 'changed' } })
    expect(decodeSessionReply({ kind: 'unsupported', basis: { reason: 'no' } })).toEqual({
      kind: 'unsupported',
      reason: 'no',
    })
    expect(
      decodeSessionReply({ kind: 'failed', category: 'sql_error', diagnostic: 'disk' }),
    ).toEqual({ kind: 'failed', diagnostic: 'sql_error: disk' })
    expect(decodeSessionReply({ kind: 'participated', response: { result: 1 } })).toEqual({
      kind: 'failed',
      diagnostic: 'a session reply without a digest',
    })
  })
})
