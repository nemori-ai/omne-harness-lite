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
import participant from '../src/worker/participant.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

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
      'EXECUTION_RECORD_HANDLERS',
      'EXECUTION_RECORD_PARTICIPANT',
      'EXECUTION_RECORD_PROTOCOL',
      'SESSION_HISTORY_ROOT_HANDLER',
      'SESSION_LOG_PARTICIPANTS',
      'SESSION_PARTICIPANT',
      'SESSION_PROTOCOL',
      'decodeExecutionRecordOperation',
      'decodeExecutionRecordReply',
      'decodeExecutionRecordState',
      'decodeSessionHistoryRoot',
      'decodeSessionReply',
      'executionRecordFacts',
      'sessionCheckDigest',
      'sessionCheckFacts',
      'sessionCommandFacts',
    ])
    expect(entry['SESSION_LOG_PARTICIPANTS']).toEqual(['execution-record', 'session'])
  })

  it('imports only the codec and type-only shapes: no port, context or commit module', () => {
    const text = readFileSync(join(root, 'src', 'participants.ts'), 'utf8')
    const values = [...text.matchAll(/^import (?!type )[^\n]*from '([^']+)'/gm)].map(
      match => match[1],
    )
    expect(values).toEqual(['./codec.ts'])
  })
})

describe('the session command facts', () => {
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
