import assert from 'node:assert/strict'
import { expect, it } from 'vitest'
import type { ConsumptionId, HistoryEntry, WorkSnapshot } from '../src/index.ts'
import { reduce } from '../src/reduce.ts'
import { encodeEntry, type SessionEntry } from '../src/entries.ts'
import type { SessionHistoryReads } from '../src/history-values.ts'
import {
  assistantMessage,
  creation,
  evidence,
  inputId,
  operationId,
  succeeded,
  testingWorkspace,
  TESTING_SOURCES,
} from '../src/testing.ts'
import { scene } from './scene.ts'

type Visit = NonNullable<WorkSnapshot['workspaceVisit']>
type Call = Readonly<{ id: ConsumptionId; producer: { kind: 'tool'; call: string } }>
const A = 'wsp_c0nf0rmance000000000000000'
const B = 'wsp_00000000000000000000000002'
const visit = (batch: string | undefined, directory: string): Visit => ({
  workspace: A,
  instance: 'a',
  generation: '0',
  directories: [directory],
  ...(batch === undefined ? {} : { batch }),
})
const execution = (call: Call, directoryVisit: Visit): SessionEntry => ({
  kind: 'call.execution-fact',
  delivered: call.id,
  fact: { kind: 'execution', producer: call.producer, source: evidence('visit'), directoryVisit },
})
const reply = (): SessionEntry => ({
  kind: 'message.assistant',
  message: assistantMessage('reply'),
  source: evidence('reply'),
  admission: null,
  consumption: null,
  participation: null,
})

async function continuationScene() {
  const s = scene()
  await s.create(
    creation({
      workspace: testingWorkspace(A),
      workspaceAttachment: { instance: 'a', basis: 'verified' },
    }),
  )
  await s.accept('first')
  await s.start()
  const started = await s.active()
  succeeded(
    await s.commit({
      kind: 'receive',
      input: {
        ...s.base,
        operation: operationId('handover-first'),
        fact: {
          kind: 'input-handover',
          execution: started.run.execution.execution,
          input: inputId('first'),
          result: { kind: 'accepted', receipt: evidence('accepted-first') },
        },
      },
    }),
    'handover',
  )
  async function bind(name: string): Promise<Call> {
    const producer = { kind: 'tool' as const, call: name }
    const receipt = succeeded(
      await s.commit({
        kind: 'bindExternalCall',
        input: {
          ...s.base,
          operation: operationId('bind-' + name),
          expected: (await s.read()).revision,
          binding: {
            producer,
            action: 'action',
            initiatingAttempt: null,
            request: evidence('request'),
            consumer: { owner: 'test', work: 'work', position: name, purpose: 'action' },
          },
          qualification: evidence('qualified'),
        },
      }),
      'bind',
    )
    return { id: receipt.consumption, producer }
  }
  const foreground = await bind('foreground')
  const background = await bind('background')
  let snapshot = await s.read()
  let rows = s.port.controls.entriesOf(s.access.tenant, s.access.session)
  let sequence = 0
  function replay(...entries: SessionEntry[]) {
    const revision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
    const source = evidence('replay-' + sequence)
    let reads: SessionHistoryReads | undefined
    const taken = entries.find(entry => entry.kind === 'run.batch-taken')
    if (taken?.kind === 'run.batch-taken') {
      assert.ok(snapshot.run.kind === 'active')
      const original = s.history.read(snapshot, rows, {
        kind: 'selected',
        inputs: [inputId('first')],
      }).reads.admissions[0]?.records[0]
      assert.ok(original)
      s.history.admit(s.base, inputId('background-input'), {
        ...original,
        ordinal: '0',
        operation: 'background-handover',
        accepted: evidence('accepted'),
      })
      s.history.observe({
        ...s.base,
        run: snapshot.run.run,
        execution: snapshot.run.execution.execution,
        revision: '2',
        sequence: '1',
        source,
        consequences: [{ kind: 'input-taken', batch: taken.batch }],
      })
      const prepared = s.history.read(snapshot, rows, {
        kind: 'selected',
        inputs: [inputId('background-input')],
      })
      snapshot = { ...snapshot, historyIndex: prepared.index }
      reads = prepared.reads
    }
    const entriesToCommit = entries.map((entry, index) => ({
      ...encodeEntry(entry, { owner: 'session', via: 'direct', source }),
      revision,
      id: `continuation-${sequence}-${index}` as HistoryEntry['id'],
    }))
    const result = reduce(snapshot, { revision, entries: entriesToCommit }, reads)
    assert.equal(result.kind, 'reduced', JSON.stringify(result))
    snapshot = result.snapshot
    rows = [...rows, ...entriesToCommit]
    sequence++
  }
  function settleBackground() {
    assert.ok(snapshot.run.kind === 'active')
    replay(
      {
        kind: 'call.backgrounded',
        consumption: background.id,
        producer: background.producer,
        ordinal: 1,
        label: { intent: null, tool: 'Shell', command: 'execute', preview: 'background' },
        source: 'launched',
      },
      execution(background, visit(undefined, '/a/background')),
      {
        kind: 'call.background-settled',
        consumption: background.id,
        result: 'result',
        disposition: { kind: 'input', input: inputId('background-input') },
      },
      {
        kind: 'intake.routed',
        input: inputId('background-input'),
        destination: 'current-run',
        run: snapshot.run.run,
        origin: evidence('background-input'),
        source: {
          name: TESTING_SOURCES.outcome,
          label: 'Background outcome',
          role: 'system_reminder',
          wakes: false,
          entry: 'trusted',
          countsTowardCapacity: false,
        },
      },
    )
  }
  return { foreground, background, replay, settleBackground, read: () => snapshot }
}

it('keeps an unanswered background visit across a new foreground batch, then retires it after its reply', async () => {
  const s = await continuationScene()
  s.replay(execution(s.foreground, visit('first', '/a/docs')))
  s.settleBackground()
  s.replay(reply()) // The earlier request cannot answer an input that is still pending.
  s.replay(execution(s.foreground, visit('next', '/a/pay')))
  expect(s.read().workspaceVisit?.directories).toEqual(['/a/pay'])
  expect(s.read().workspaceBackgroundVisits).toMatchObject([
    {
      consumption: s.background.id,
      input: 'background-input',
      visit: { directories: ['/a/background'] },
    },
  ])
  expect(s.read().pending).toContain('background-input')
  expect(s.read().quietInputs).toContain('background-input')
  const current = s.read().run
  assert.ok(current.kind === 'active')
  s.replay({
    kind: 'run.batch-taken',
    run: current.run,
    batch: {
      id: 'background-batch' as import('../src/identity.ts').BatchId,
      watermark: evidence('watermark'),
      ordered: [inputId('background-input')],
    },
  })
  expect(s.read().unanswered).toContain('background-input')
  expect(s.read().workspaceBackgroundVisits).toHaveLength(1)
  s.replay(reply())
  expect(s.read().workspaceBackgroundVisits).toEqual([])
  expect(s.read().workspaceVisit?.directories).toEqual(['/a/pay'])
})

it('keeps the original A fact but does not adopt a late A visit as a B target', async () => {
  const s = await continuationScene()
  s.settleBackground()
  s.replay({
    kind: 'session.workspace-changed',
    workspace: testingWorkspace(B),
    workspaceAttachment: { instance: 'b', basis: 'verified' },
    basis: evidence('select-B'),
  })
  s.replay(
    execution(s.foreground, {
      workspace: B,
      instance: 'b',
      generation: '1',
      batch: 'B-batch',
      directories: ['/b/pay'],
    }),
  )
  s.replay(execution(s.background, visit(undefined, '/a/late')))
  expect(s.read().workspaceVisit).toMatchObject({ workspace: B, directories: ['/b/pay'] })
  // Original A input custody survives, but the rejected late directory is never adopted.
  expect(s.read().workspaceBackgroundVisits).toMatchObject([
    { visit: { workspace: A, generation: '0', directories: ['/a/background'] } },
  ])
  expect(JSON.stringify(s.read().workspaceBackgroundVisits)).not.toContain('/a/late')
})
