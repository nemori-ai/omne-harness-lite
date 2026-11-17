import { expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import {
  decide,
  projectCompactionCommit,
  reduce,
  type CompactionCommitState,
  type CommittedBatch,
  type SessionCommand,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { compactionReads } from '../src/model-view.ts'
import { fromJsonValue, toJsonValue } from '../src/entries.ts'
import { open, participation } from './scene.ts'

async function candidate() {
  const s = await open()
  const { snapshot, run } = await s.active()
  const rows = s.port.controls.entriesOf(s.base.tenant, s.base.session)
  const context = compactionReads(rows, snapshot, rows.at(-1)!.id)
  if (context === null) throw new Error('compaction context required')
  const message = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'compaction',
    blocks: [
      {
        kind: 'text',
        id: 'summary',
        text: 'summary',
        visibility: { toModel: true, toHuman: true },
      },
    ],
    covers: { from: context.origin, to: rows.at(-1)!.id },
    retained: context.covered.filter(row => row.message !== null).map(row => row.ref),
    derivation: evidence('summary'),
  })
  if (!('ok' in message) || message.ok.role !== 'compaction') throw new Error('compaction expected')
  const joint = participation(run.execution.execution, 'context-transition')
  const command: Extract<SessionCommand, { kind: 'commitDerived' }> = {
    kind: 'commitDerived',
    input: {
      ...s.base,
      operation: operationId('compact'),
      participation: joint,
      judgment: evidence('fit'),
      value: { kind: 'compaction', message: message.ok, epoch: 'current' },
    },
  }
  const decision = decide(snapshot, command, [], null, {
    compaction: context,
    compactionEpoch: 'current',
  })
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const revision = String(BigInt(snapshot.revision) + 1n) as CommittedBatch['revision']
  const batch: CommittedBatch = {
    revision,
    entries: decision.entries.map((entry, index) => ({
      ...entry,
      revision,
      id: String(
        BigInt(rows.at(-1)!.id) + 1n + BigInt(index),
      ) as CommittedBatch['entries'][number]['id'],
    })),
  }
  const { tenant, session, lifecycle, source, interpreter } = snapshot
  const state: CompactionCommitState = {
    tenant,
    session,
    lifecycle,
    run,
    revision: snapshot.revision,
    source,
    interpreter,
  }
  const execution = snapshot.executions!.at(-1)!
  return { snapshot, state, execution, joint, batch }
}

it('the current-state projection equals full replay without changing other Session facts', async () => {
  const { snapshot, state, execution, joint, batch } = await candidate()
  const full = reduce(snapshot, batch)
  if (full.kind !== 'reduced') throw new Error(JSON.stringify(full))
  const next = projectCompactionCommit(state, execution, batch)
  if (typeof next === 'string') throw new Error(next)
  expect({
    ...snapshot,
    ...next.state,
    executions: [...snapshot.executions!.slice(0, -1), next.execution],
  }).toEqual(full.snapshot)
  expect(next.state.run).toMatchObject({
    kind: 'active',
    execution: {
      revision: joint.written,
      evidence: joint.handover,
    },
  })
})

it('refuses an unrelated execution, a backwards participation and an unsupported interpreter', async () => {
  const { state, execution, batch } = await candidate()
  expect(
    projectCompactionCommit(
      state,
      { ...execution, execution: { ...execution.execution, execution: 'other-execution' } },
      batch,
    ),
  ).toMatch(/current execution/)
  expect(
    projectCompactionCommit(
      state,
      { ...execution, execution: { ...execution.execution, revision: '100' } },
      batch,
    ),
  ).toMatch(/backwards/)
  expect(
    projectCompactionCommit(
      { ...state, interpreter: { ...state.interpreter, digest: 'other' } },
      execution,
      batch,
    ),
  ).toMatch(/unsupported/)
  expect(
    projectCompactionCommit(state, execution, {
      ...batch,
      revision: state.revision,
      entries: batch.entries.map(row => ({ ...row, revision: state.revision })),
    }),
  ).toMatch(/revision/)
})

it.each(['invisible', 'participation', 'annotation', 'duplicate-id', 'schema'])(
  'does not publish malformed %s through the narrow projection',
  async damage => {
    const { snapshot, state, execution, batch } = await candidate()
    const damaged = JSON.parse(JSON.stringify(batch))
    const message = damaged.entries[0]
    const body = JSON.parse(JSON.stringify(fromJsonValue(message.payload)))
    if (damage === 'invisible') body.message.blocks[0].visibility.toModel = false
    if (damage === 'participation') body.participation.handover.record = ''
    message.payload = toJsonValue(body)
    if (damage === 'annotation')
      damaged.entries[1].payload = toJsonValue({
        targets: 'not-an-array',
        source: evidence('invalid-annotation'),
      })
    if (damage === 'duplicate-id') damaged.entries[1].id = message.id
    if (damage === 'schema') message.schema.digest = 'other'
    expect(projectCompactionCommit(state, execution, damaged)).toEqual(expect.any(String))
    expect(reduce(snapshot, damaged).kind).toBe('quarantined')
  },
)
