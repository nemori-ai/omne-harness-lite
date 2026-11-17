import { contextEpochOf } from '../../src/cordis/history-epoch.ts'
import {
  compactionGeneration,
  decodeActionId,
  decodeCompactionTaskId,
  decodeConsumptionId,
  type AgentCheckpoint,
  type PreparedCompactionCommit,
} from '@omne-harness/agent-contract'
import type { Message } from '@omne-harness/message'
import type { SessionHistory } from '@omne-harness/session-contract'
import { evidence, ok, operation, type scene } from './common-journal.ts'

export const compactionFixtureTask = {
  authority: 'test',
  task: ok(decodeCompactionTaskId('task-1')),
  requestDigest: 'request:1',
}
export const compactionFixtureGeneration = compactionGeneration(compactionFixtureTask)

type Scene = Awaited<ReturnType<typeof scene>>
type CompactionScene = Pick<Scene, 'access' | 'execution' | 'opened' | 'checkpoint'> & {
  view: Pick<Scene['view'], 'journal' | 'received' | 'materials'>
  history: SessionHistory<string>
}
export async function retainedCompaction(s: CompactionScene, message: Message) {
  if (message.role !== 'compaction') throw new Error('expected compaction')
  const preparation = ok(decodeActionId('compact'))
  const task = compactionFixtureTask
  const consumption = ok(decodeConsumptionId('compaction-consumption'))
  const result = { version: '1', evidence: evidence('provider-result'), digest: 'result:1' }
  const consumer = { owner: 'agent', work: s.execution, position: 'prepare', purpose: 'main' }
  const produced = {
    producer: { kind: 'compaction' as const, task },
    version: result.version,
    delivery: null,
    source: result.evidence,
  }
  const input = { source: evidence('frozen-input'), schema: s.checkpoint.schema, digest: 'input:1' }
  const original: AgentCheckpoint = {
    ...s.checkpoint,
    position: 'C2',
    requestPreparation: {
      id: preparation,
      purpose: 'main',
      position: consumer,
      source: evidence('original'),
      state: { kind: 'null' },
      schema: s.checkpoint.schema,
      kind: 'needs-compaction',
      input,
      original: { input: evidence('original'), alterations: [], beforeModelCall: null },
    },
    compaction: {
      action: ok(decodeActionId('compaction-action')),
      task,
      provider: s.checkpoint.schema,
      consumer,
      input,
      consumption,
      result: null,
      received: null,
      transition: null,
      ended: null,
    },
  }
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('prepare-compaction'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: original,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  const retained = ok(
    await s.view.received.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('receive-compaction'),
      entry: {
        kind: 'received',
        consumer,
        consumption,
        delivery: { producer: 'compaction', key: { kind: 'result', task, result } },
      },
      material: { kind: 'compaction', result: produced, outcome: { kind: 'completed', message } },
    }),
  )
  if (retained.kind !== 'committed') throw new Error('result retention expected')
  const received = retained.value.entry.material
  const checkpoint: AgentCheckpoint = {
    ...original,
    position: 'C3',
    compaction: { ...original.compaction!, result, received },
  }
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('observe-compaction'),
      authority: s.opened.authority,
      expected: retained.value.receipt.revision,
      checkpoint,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  const receipt = ok(
    await s.view.journal.recordResult({
      ...s.access,
      execution: s.execution,
      operation: operation('retain-compaction'),
      result: produced,
      consumption,
      transfer: { kind: 'custody', result: produced, consumption, retained: received },
      release: { kind: 'confirmed', receipt: evidence('provider-release') },
    }),
  )
  const value: PreparedCompactionCommit = {
    preparation,
    task,
    consumption,
    result,
    received,
    message,
    history: input.source,
    epoch: '',
    admission: evidence('budget'),
  }
  const view = ok(
    await s.history.readModelView({ ...s.access, basis: null, after: null, pageBytes: 1 }),
  )
  if (view.kind !== 'page') throw new Error('current model view expected')
  const epoch = contextEpochOf(view.basis.epoch)
  if (epoch === undefined) throw new Error('fixture epoch')
  return { checkpoint, receipt, value: { ...value, epoch } }
}
