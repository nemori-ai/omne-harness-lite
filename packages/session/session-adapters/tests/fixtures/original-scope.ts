import { type AgentExecutionId } from '@omne-harness/agent-contract'
import {
  decide,
  reduce,
  type SessionCommand,
  type CommittedBatch,
  type HistoryEntry,
  type SessionAccess,
} from '@omne-harness/session-contract'
import {
  createMemoryInitializationSource,
  adoptedInitializationFixture,
  initializationFixtureFacts,
  initializationFixtureGuard,
  creation,
  ordinaryInput,
  operationId,
  guard,
} from '@omne-harness/session-contract/testing'
import type { JsonValue } from '@omne-harness/json-text'
import { emptyHistory } from '../../src/testing/empty-history.ts'
import { ok } from './common-journal.ts'
export async function originalScope(
  initialization: ReturnType<typeof createMemoryInitializationSource>,
  who: SessionAccess<string>,
  execution: AgentExecutionId,
) {
  const session = who.session
  const initial = ordinaryInput('fixture-initial')
  const command: Extract<SessionCommand, { kind: 'create' }> = {
    kind: 'create',
    input: {
      tenant: who.tenant,
      session,
      operation: operationId('fixture-create'),
      creation: creation({ initial }),
    },
  }
  initialization.controls.register(
    command,
    initializationFixtureGuard(
      initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
    ),
  )
  const guards = ok(await initialization.prepare(command)),
    created = decide(null, command, guards, null, { compaction: null })
  if (created.kind !== 'entries') throw new Error(JSON.stringify(created))
  const first: CommittedBatch = {
    revision: '1' as CommittedBatch['revision'],
    entries: created.entries.map((entry, i) => ({
      ...entry,
      id: String(i + 1) as HistoryEntry['id'],
      revision: '1' as HistoryEntry['revision'],
    })),
  }
  const reduced = reduce(null, first)
  if (reduced.kind !== 'reduced') throw new Error(JSON.stringify(reduced))
  const material = emptyHistory(reduced.snapshot, { kind: 'selected', inputs: [initial.input] })
  const started = decide(
    { ...reduced.snapshot, historyIndex: material.index },
    {
      kind: 'startRun',
      input: {
        tenant: who.tenant,
        session,
        operation: operationId('fixture-start'),
        entry: 'interactive',
        candidate: command.input.creation.definition.candidate,
        instance: { owner: 'agent', id: 'fixture' },
      },
    },
    [guard('evidence-bridge', 'login-entry', {})],
    null,
    { history: material.reads, compaction: null },
  )
  if (started.kind !== 'entries') throw new Error(JSON.stringify(started))
  const second: CommittedBatch = {
    revision: '2' as CommittedBatch['revision'],
    entries: started.entries.map((entry, i) => ({
      ...entry,
      payload:
        entry.kind === 'run.started' ? replaceExecution(entry.payload, execution) : entry.payload,
      id: String(first.entries.length + i + 1) as HistoryEntry['id'],
      revision: '2' as HistoryEntry['revision'],
    })),
  }
  return { command, guards, batches: [first, second] }
}
function replaceExecution(value: JsonValue, execution: AgentExecutionId): JsonValue {
  if (value.kind !== 'object') throw new Error('original SE13 payload is not an object')
  return {
    ...value,
    entries: value.entries.map(entry =>
      entry.key === 'execution' ? { ...entry, value: { kind: 'string', value: execution } } : entry,
    ),
  }
}
