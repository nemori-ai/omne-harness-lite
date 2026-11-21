import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentJournal,
  AgentOperationId,
  AgentReceivedCommits,
  FailureCandidate,
  FinishIntent,
  Material,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import { agentReceivedCommitsKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import type { Consumption, ConsumptionId, WorkSnapshot } from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { createSessionJournalInterpretationPlugin } from '../src/cordis/journal-interpretation.ts'
import { receivedAll } from '../src/cordis/received-all.ts'
import { createSessionToolLogConsumptionPlugin } from '../src/cordis/tool-log-consumption.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import {
  cannotFit,
  endOpened,
  endWithFailure,
  nodeFailed,
  noReplyWithFault,
  refusedByModel,
} from './fixtures/finish.ts'
import {
  cordisScene,
  handed,
  sqlScene,
  type CordisSceneOptions,
  type SqlScene,
} from './fixtures/sql-scene.ts'
import { toolCall } from './fixtures/tool-call.ts'
import {
  outcomeMaterial,
  placeholderEntry,
  placeholderMaterial,
  reader,
  resultEntry,
} from './fixtures/tool-delivery.ts'

const scenes: SqlScene[] = []
const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  for (const s of scenes.splice(0)) await s.close()
})

type Head = Readonly<{ settled: string | null; acknowledged: string; emitted: string }>

function headOf(s: SqlScene): Head | null {
  const row = s.controls?.select(
    `SELECT settled, acknowledged, emitted_through FROM er_execution WHERE execution = '${s.execution}'`,
  ).rows[0]
  if (row === undefined) return null
  return {
    settled: row[0] === null ? null : String(row[0]),
    acknowledged: String(row[1]),
    emitted: String(row[2]),
  }
}

const rowsOf = (s: SqlScene, table: string, column = 'execution'): number =>
  Number(
    s.controls?.select(`SELECT COUNT(*) FROM ${table} WHERE ${column} = '${s.execution}'`)
      .rows[0]?.[0] ?? -1,
  )

const history = (s: SqlScene): unknown[] =>
  (s.controls?.select('SELECT * FROM sl_entry ORDER BY position').rows ?? []).map(row =>
    row.map(cell =>
      cell instanceof Uint8Array ? Buffer.from(cell).toString('hex') : String(cell),
    ),
  )

function terminalEnd(s: SqlScene): unknown {
  const cell = s.controls?.select(
    "SELECT entry FROM sl_entry WHERE kind = 'run.terminal' ORDER BY position DESC LIMIT 1",
  ).rows[0]?.[0]
  const text = cell instanceof Uint8Array ? unpackText(cell) : String(cell)
  return (JSON.parse(text) as { body: { end: unknown } }).body.end
}

function endOfFinish(intent: FinishIntent): unknown {
  const failure: FailureCandidate | null = intent.failure
  const conclusion = intent.conclusion.kind
  if (failure === null) return { conclusion, failure: null }
  if (failure.kind === 'no-reply')
    return {
      conclusion,
      failure: {
        kind: failure.kind,
        cause: failure.fault?.cause ?? null,
        upstreamStatus: failure.fault?.upstreamStatus ?? null,
        diagnostic: failure.fault?.diagnostic ?? null,
      },
    }
  if (failure.kind === 'model-refused')
    return { conclusion, failure: { kind: failure.kind, failure: failure.failure.kind } }
  if (failure.kind === 'node-failed')
    return {
      conclusion,
      failure: {
        kind: failure.kind,
        node: failure.node,
        category: failure.category,
        failureKind: failure.failureKind,
      },
    }
  if (failure.kind === 'cannot-fit')
    return { conclusion, failure: { kind: failure.kind, reason: failure.reason } }
  throw new Error(`the test reads no ${failure.kind}`)
}

async function interpreting(s: SqlScene, options: CordisSceneOptions = {}) {
  const c = await cordisScene(s, options)
  disposers.push(() => c.dispose())
  const interpretation = createSessionJournalInterpretationPlugin<string>({
    coordinator: async () => succeed(s.access.principal),
  })
  await c.mount(interpretation.plugin)
  const target = { tenant: s.access.tenant, session: s.access.session, execution: s.execution }
  return { c, interpret: async () => ok(await interpretation.interpret(target)) }
}

async function scene(name: string): Promise<SqlScene> {
  const s = await sqlScene(name)
  scenes.push(s)
  return s
}

// An acknowledgement that a test lets through only once it says so.
function gate() {
  const state = { open: false, operations: [] as AgentOperationId[] }
  const acknowledge =
    (inner: AgentJournal<unknown>['acknowledge']): AgentJournal<unknown>['acknowledge'] =>
    input => {
      state.operations.push(input.operation)
      return state.open
        ? inner(input)
        : Promise.resolve(fail({ kind: 'unavailable', owner: 'test', diagnostic: 'held' }))
    }
  return { state, acknowledge }
}

const kindsOf = (s: SqlScene): string[] =>
  (s.controls?.select('SELECT kind FROM sl_entry ORDER BY position').rows ?? []).map(row =>
    String(row[0]),
  )

// A Tool call goes to the background and the execution ends; the outcome comes after the end.
// The Agent may process the placeholder before the end or end without it (a cancelled Run).
async function backgroundedThenEnded(
  s: SqlScene,
  c: Awaited<ReturnType<typeof cordisScene>>,
  processed: boolean,
) {
  const journal = c.journal()
  const received = c.ctx.get(agentReceivedCommitsKey) as AgentReceivedCommits<string, ContentBlock>
  const opened = ok(await journal.open(s.openInput))
  ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
  const { authority } = opened
  const load = async () => ok(await journal.load({ ...s.access, execution: s.execution }))
  const commit = async (step: string, change: object) => {
    const loaded = await load()
    ok(
      await journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(step),
        authority,
        expected: loaded.revision,
        checkpoint: loaded.checkpoint,
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
        ...change,
      }),
    )
  }
  const receive = async (step: string, entry: ReceivedEntry, material: Material<ContentBlock>) => {
    const { material: _material, ...draft } = entry
    const answer = ok(
      await received.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(step),
        entry: draft,
        material,
      }),
    )
    if (answer.kind !== 'committed') throw new Error(`received ${answer.kind}`)
  }
  const tool = toolCall(s.access.tenant, 'background')
  if (tool.entry.delivery.producer !== 'tool') throw new Error('fixture: a Tool entry')
  // The call waits in this execution: its consumer is this execution's work.
  const consumer = { ...tool.entry.consumer, work: s.execution }
  const account = { ...tool.entry, consumer }
  const pending = { ...tool.pending, position: consumer }
  const waits = [{ kind: 'producer' as const, pending }]
  await commit('wait', {
    checkpoint: { ...(await load()).checkpoint, calls: [pending] },
    state: { kind: 'waiting', waits },
    events: [{ kind: 'waiting', waits }],
    effects: [{ action: pending.action, pending, authority }],
  })
  const placeholder = placeholderEntry(account)
  await receive('placeholder', placeholder, placeholderMaterial(s.access.tenant, placeholder))
  if (processed)
    await commit('placeholder-processed', {
      checkpoint: { ...(await load()).checkpoint, calls: [] },
      events: [
        {
          kind: 'producer',
          result: {
            producer: {
              kind: 'tool',
              call: ok(resolveToolInvocationRef(tool.entry.delivery.key.reference, s.access.tenant))
                .call,
            },
            version: 'placeholder',
            delivery: 'tdel_0',
            source: evidence('placeholder'),
          },
          consumption: pending.consumption,
        },
      ],
    })
  await endOpened(s, journal, opened, refusedByModel())
  const outcome = resultEntry(account)
  await receive('outcome', outcome, outcomeMaterial(s.access.tenant, outcome))
}

async function settled(s: SqlScene): Promise<Head> {
  let head: Head | null = null
  await vi.waitFor(
    () => {
      head = headOf(s)
      expect(head?.settled ?? null).not.toBeNull()
    },
    { timeout: 5000 },
  )
  return head!
}

describe('the Session acknowledges an execution once it has received all of it', () => {
  it('while the Run goes on there is no acknowledgement: the revision does not move and nothing is acknowledged', async () => {
    const s = await scene('settle-running')
    const f = await interpreting(s)
    const journal = f.c.journal()
    const opened = ok(await journal.open(s.openInput))
    ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
    const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
    const page = ok(
      await journal.inputs({
        ...s.access,
        execution: s.execution,
        watermark: loaded.inputWatermark,
      }),
    )
    ok(
      await journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('take'),
        authority: opened.authority,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, inputBatch: page.batch },
        state: { kind: 'advancing' },
        events: [{ kind: 'input-taken', batch: page.batch }],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    const before = ok(await journal.load({ ...s.access, execution: s.execution }))
    expect((await f.interpret()).readThrough).toBe('1')
    const after = ok(await journal.load({ ...s.access, execution: s.execution }))
    expect(after.revision).toBe(before.revision)
    expect(after.output).toEqual({ emittedThrough: '1', acknowledgedThrough: null })
    expect(headOf(s)).toMatchObject({ acknowledged: '0', settled: null })
  })

  it('an ended execution the Session received in full is acknowledged and settles: the contents leave in that commit, the tombstone and the operation records stay, the history reads the same', async () => {
    const s = await scene('settle-ended')
    const held = gate()
    const f = await interpreting(s, { acknowledge: held.acknowledge })
    await endWithFailure(s, f.c.journal(), refusedByModel())
    await f.interpret()
    expect(headOf(s)).toMatchObject({ acknowledged: '0', settled: null })
    const operations = rowsOf(s, 'er_operation')
    expect(rowsOf(s, 'er_fact')).toBeGreaterThan(0)
    expect(rowsOf(s, 'er_item')).toBeGreaterThan(0)
    const before = history(s)
    const work = ok(await s.port.readWork(s.sessionAccess))

    held.state.open = true
    await f.interpret()
    const head = await settled(s)
    expect(head.acknowledged).toBe(head.emitted)
    expect(new Set(held.state.operations).size).toBe(1)
    expect(rowsOf(s, 'er_fact')).toBe(0)
    expect(rowsOf(s, 'er_item')).toBe(0)
    expect(rowsOf(s, 'er_item_content')).toBe(0)
    expect(rowsOf(s, 'er_preadmission')).toBe(0)
    expect(rowsOf(s, 'er_operation')).toBe(operations + 1)
    expect(history(s)).toEqual(before)
    expect(ok(await s.port.readWork(s.sessionAccess)).executions).toEqual(work.executions)

    const journal = f.c.journal()
    expect(await journal.load({ ...s.access, execution: s.execution })).toEqual(
      fail({ kind: 'terminal' }),
    )
    expect(
      await journal.acknowledge({
        ...s.access,
        execution: s.execution,
        operation: operation('after-settled'),
        through: head.emitted,
        receipt: null,
      }),
    ).toEqual(fail({ kind: 'terminal' }))
  })

  it('a call the Session still holds on the ended execution keeps it unacknowledged; once the Session holds none, the next consumption acknowledges and settles', async () => {
    const s = await scene('settle-background')
    const open = { held: true }
    const call: Consumption = {
      id: 'cons-background' as ConsumptionId,
      binding: {
        producer: { kind: 'tool', call: 'tcall_background' },
        action: 'action-background',
        consumer: {
          owner: '@omne-harness/agent',
          work: s.execution,
          position: 'action-background',
          purpose: 'action',
        },
        request: evidence('background-request'),
        initiatingAttempt: null,
      },
      results: [],
    }
    const f = await interpreting(s, {
      work: (snapshot: WorkSnapshot) =>
        open.held ? { ...snapshot, consumptions: [...snapshot.consumptions, call] } : snapshot,
    })
    await endWithFailure(s, f.c.journal(), refusedByModel())
    await f.interpret()
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(headOf(s)).toMatchObject({ acknowledged: '0', settled: null })
    expect(rowsOf(s, 'er_fact')).toBeGreaterThan(0)

    open.held = false
    await f.interpret()
    const head = await settled(s)
    expect(head.acknowledged).toBe(head.emitted)
    expect(rowsOf(s, 'er_fact')).toBe(0)
  })

  it.each([
    ['a call without reply', noReplyWithFault],
    ['a refused call', refusedByModel],
    ['a failed node', nodeFailed],
    ['a request that cannot fit', cannotFit],
  ])(
    'the failure of %s goes into the terminal entry field for field as readFinish gave it, and stays there after the records leave',
    async (_label, failure) => {
      const s = await scene(`settle-failure-${failure.name}`)
      const held = gate()
      const f = await interpreting(s, { acknowledge: held.acknowledge })
      const journal = f.c.journal()
      await endWithFailure(s, journal, failure())
      const read = () => journal.readFinish!({ ...s.access, execution: s.execution })
      const finish = ok(await read())
      if (finish === null) throw new Error('an ended execution reads its finish')
      await f.interpret()
      held.state.open = true
      await f.interpret()
      await settled(s)
      expect(rowsOf(s, 'er_fact')).toBe(0)
      expect(rowsOf(s, 'er_item')).toBe(0)
      expect(await read()).toEqual(fail({ kind: 'terminal' }))
      expect(terminalEnd(s)).toEqual(endOfFinish(finish))
    },
  )

  it('the Agent side settles only once the acknowledgement reaches the last emitted event', async () => {
    const s = await scene('settle-agent-side')
    const f = await interpreting(s, { acknowledge: gate().acknowledge })
    await endWithFailure(s, f.c.journal(), refusedByModel())
    const emitted = headOf(s)!.emitted
    const acknowledge = (through: string) =>
      s.view.journal.acknowledge({
        ...s.access,
        execution: s.execution,
        operation: operation(`acknowledge-${through}`),
        through,
        receipt: null,
      })
    ok(await acknowledge(String(Number(emitted) - 1)))
    expect(headOf(s)).toMatchObject({ settled: null })
    ok(await acknowledge(emitted))
    expect(headOf(s)?.settled).not.toBeNull()
  })

  it('the judgment reads the Session alone: a running Run, an execution without its end, and a call bound to it each answer not yet', async () => {
    const s = await scene('settle-judgment')
    const f = await interpreting(s, { acknowledge: gate().acknowledge })
    await endWithFailure(s, f.c.journal(), refusedByModel())
    await f.interpret()
    const work = ok(await s.port.readWork(s.sessionAccess))
    const held = receivedAll(work, s.execution)
    expect(held?.execution.execution).toBe(s.execution)
    const executions = work.executions ?? []
    expect(
      receivedAll(
        { ...work, executions: executions.map(item => ({ ...item, terminal: null })) },
        s.execution,
      ),
    ).toBeNull()
    expect(receivedAll({ ...work, executions: [] }, s.execution)).toBeNull()
    const bound = {
      id: 'cons-x' as ConsumptionId,
      binding: {
        producer: { kind: 'tool' as const, call: 'tcall_x' },
        action: 'action-x',
        consumer: { owner: 'agent', work: s.execution, position: 'p', purpose: 'action' },
        request: evidence('x'),
        initiatingAttempt: null,
      },
      results: [],
    }
    expect(receivedAll({ ...work, consumptions: [bound] }, s.execution)).toBeNull()
    const elsewhere = {
      ...bound,
      binding: { ...bound.binding, consumer: { ...bound.binding.consumer, work: 'other' } },
    }
    expect(receivedAll({ ...work, consumptions: [elsewhere] }, s.execution)).not.toBeNull()
  })

  it('an acknowledgement cut off after the interpretation committed is made up when the next writer generation opens the tenant', async () => {
    const s = await scene('settle-restart')
    const first = await interpreting(s, { acknowledge: gate().acknowledge })
    await endWithFailure(s, first.c.journal(), refusedByModel())
    await first.interpret()
    expect(headOf(s)).toMatchObject({ acknowledged: '0', settled: null })
    await first.c.dispose()

    const next = await interpreting(s)
    ok(await next.c.journal().load({ ...s.access, execution: s.execution }))
    const head = await settled(s)
    expect(head.acknowledged).toBe(head.emitted)
  })

  it('the next writer generation removes the tombstone and the operation records, and a write then gets the refusal of an execution no Run started', async () => {
    const s = await scene('settle-sweep')
    const f = await interpreting(s)
    await endWithFailure(s, f.c.journal(), refusedByModel())
    await f.interpret()
    await settled(s)
    expect(rowsOf(s, 'er_operation')).toBeGreaterThan(0)
    await f.c.dispose()

    const next = await interpreting(s)
    const journal = next.c.journal()
    const write = (execution: string) =>
      journal.acknowledge({
        ...s.access,
        execution: execution as typeof s.execution,
        operation: operation(`after-sweep-${execution}`),
        through: '1',
        receipt: null,
      })
    const answer = await write(s.execution)
    expect(headOf(s)).toBeNull()
    expect(rowsOf(s, 'er_operation')).toBe(0)
    expect(answer).toEqual(await write(`${s.execution}-never`))
  })

  it('a settling commit whose answer is lost is recognized from er_operation, and its query answers the tombstone', async () => {
    const s = await scene('settle-unknown')
    const lost: AgentOperationId[] = []
    const f = await interpreting(s, {
      acknowledge: inner => input => {
        lost.push(input.operation)
        s.controls?.loseNextReply()
        return inner(input)
      },
    })
    await endWithFailure(s, f.c.journal(), refusedByModel())
    await f.interpret()
    const head = await settled(s)
    const journal = f.c.journal()
    const asked = await journal.query({ ...s.access, execution: s.execution, operation: lost[0]! })
    const revision = String(
      s.controls?.select(`SELECT revision FROM er_execution WHERE execution = '${s.execution}'`)
        .rows[0]?.[0],
    )
    expect(asked).toMatchObject({
      ok: { kind: 'committed', receipt: { operation: lost[0], revision, state: 'applied' } },
    })
    expect(head.acknowledged).toBe(head.emitted)
    expect(await journal.load({ ...s.access, execution: s.execution })).toEqual(
      fail({ kind: 'terminal' }),
    )
  })

  it.each([
    ['keeps up', 'processed', true, true],
    ['keeps up', 'did not process', true, false],
    ['lags', 'processed', false, true],
    ['lags', 'did not process', false, false],
  ] as const)(
    'a backgrounded call whose outcome comes after the end: the interpretation %s, the Agent %s the placeholder; the outcome reaches the session log and the execution settles',
    async (_pace, _processing, early, processed) => {
      const s = await scene(`settle-outcome-${early ? 'early' : 'late'}-${String(processed)}`)
      const c = await cordisScene(s)
      disposers.push(() => c.dispose())
      const coordinator = async () => succeed(s.access.principal)
      await c.mount(
        createSessionToolLogConsumptionPlugin({ toolDeliveries: reader, coordinator }).plugin,
        {},
      )
      const interpretation = createSessionJournalInterpretationPlugin<string>({ coordinator })
      if (early) await c.mount(interpretation.plugin)
      await backgroundedThenEnded(s, c, processed)
      if (!early) {
        // The consumption answered every write before the interpretation starts: it found no binding.
        await new Promise(resolve => setTimeout(resolve, 200))
        expect(kindsOf(s)).not.toContain('call.bound')
        await c.mount(interpretation.plugin)
        ok(
          await interpretation.interpret({
            tenant: s.access.tenant,
            session: s.access.session,
            execution: s.execution,
          }),
        )
      }
      const head = await settled(s)
      expect(head.acknowledged).toBe(head.emitted)
      expect(kindsOf(s)).toContain('call.background-settled')
      expect(rowsOf(s, 'er_fact')).toBe(0)
    },
  )

  it('a sweep the first opening could not finish runs again in the same generation and keeps what this generation settled: the settling operation is still recognized', async () => {
    const s = await scene('sweep-again')
    const unreadable = { retired: true }
    s.rewriteReads.current = (request, answer) =>
      unreadable.retired && request.handler === 'execution-record.retired'
        ? {
            kind: 'unavailable',
            requestKey: request.requestKey,
            reason: 'queue_full',
            diagnostic: null,
          }
        : answer
    const lost: AgentOperationId[] = []
    const f = await interpreting(s, {
      acknowledge: inner => input => {
        lost.push(input.operation)
        s.controls?.loseNextReply()
        return inner(input)
      },
    })
    await endWithFailure(s, f.c.journal(), refusedByModel())
    await f.interpret()
    await settled(s)

    unreadable.retired = false
    const journal = f.c.journal()
    expect(await journal.load({ ...s.access, execution: s.execution })).toEqual(
      fail({ kind: 'terminal' }),
    )
    expect(headOf(s)?.settled ?? null).not.toBeNull()
    expect(rowsOf(s, 'er_operation')).toBeGreaterThan(0)
    expect(
      await journal.query({ ...s.access, execution: s.execution, operation: lost[0]! }),
    ).toMatchObject({
      ok: { kind: 'committed', receipt: { operation: lost[0], state: 'applied' } },
    })
  })
})
