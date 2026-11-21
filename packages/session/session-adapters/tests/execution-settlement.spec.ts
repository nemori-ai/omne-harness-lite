import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeActionId,
  type AgentJournal,
  type AgentOperationId,
  type AgentReceivedCommits,
  type FailureCandidate,
  type FinishIntent,
  type Material,
  type PendingCall,
  type ReceivedEntry,
} from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { agentReceivedCommitsKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  Consumption,
  ConsumptionId,
  SessionLogCommitObservation,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import type { SessionExecutionLog } from '@omne-harness/session-cordis-contract'
import { sessionExecutionLogKey } from '@omne-harness/session-cordis-contract/cordis'
import { evidence } from '@omne-harness/session-contract/testing'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { createSessionJournalInterpretationPlugin } from '../src/cordis/journal-interpretation.ts'
import { createSessionModelLogConsumptionPlugin } from '../src/cordis/model-log-consumption.ts'
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
  nextRun,
  sqlScene,
  type CordisSceneOptions,
  type SqlScene,
} from './fixtures/sql-scene.ts'
import { refsIn } from '../src/cordis/content-refs.ts'
import { blobRowDigest } from '../src/cordis/journal-batch.ts'
import { materialOf as modelMaterialOf } from './fixtures/model-delivery.ts'
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

type Scene = Awaited<ReturnType<typeof cordisScene>>

// Opens the execution and hands it over; the writes of the Agent records that follow.
async function opening(s: SqlScene, c: Scene) {
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
  return { journal, opened, authority, load, commit, receive }
}

// A Tool call goes to the background and the execution ends; the outcome comes after the end.
// The Agent may process the placeholder before the end or end without it (a cancelled Run).
async function backgroundedThenEnded(s: SqlScene, c: Scene, processed: boolean) {
  const { journal, opened, authority, load, commit, receive } = await opening(s, c)
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

// A Model call waits and its result is kept; the Agent processes it or ends without it. The end is
// the last write of the Agent records.
async function modelResultThenEnded(s: SqlScene, c: Scene, processed: boolean) {
  const { journal, opened, authority, load, commit, receive } = await opening(s, c)
  const sample = sampleReceivedModelResult(s.access.tenant, 'late')
  const result = { ...sample, consumer: { ...sample.consumer, work: s.execution } }
  const { key } = result.delivery
  if (key.kind !== 'result') throw new Error('fixture: a Model result')
  const pending: Extract<PendingCall, { kind: 'model' }> = {
    kind: 'model',
    purpose: 'main',
    action: ok(decodeActionId('action')),
    reference: result.delivery.key.reference,
    consumption: result.consumption,
    position: result.consumer,
    fixed: evidence('request'),
  }
  const waits = [{ kind: 'producer' as const, pending }]
  await commit('wait', {
    checkpoint: { ...(await load()).checkpoint, calls: [pending] },
    state: { kind: 'waiting', waits },
    events: [{ kind: 'waiting', waits }],
    effects: [{ action: pending.action, pending, authority }],
  })
  const { material: _material, ...draft } = result
  await receive('model-result', result, modelMaterialOf(s.access.tenant, draft))
  if (processed)
    await commit('model-processed', {
      checkpoint: { ...(await load()).checkpoint, calls: [] },
      events: [
        {
          kind: 'producer',
          result: {
            producer: {
              kind: 'model',
              call: ok(resolveModelInvocationRef(pending.reference, s.access.tenant)).call,
            },
            version: String(key.result),
            delivery: null,
            source: evidence('model-result'),
          },
          consumption: pending.consumption,
        },
      ],
    })
  await endOpened(s, journal, opened, refusedByModel())
}

const targetOf = (s: SqlScene) => ({
  tenant: s.access.tenant,
  session: s.access.session,
  execution: s.execution,
})

type Producer = 'tool' | 'model'

function keptResult(s: SqlScene, producer: Producer) {
  if (producer === 'tool') {
    const tool = toolCall(s.access.tenant, 'early')
    const consumer = { ...tool.entry.consumer, work: s.execution }
    const entry = resultEntry({ ...tool.entry, consumer })
    return {
      pending: { ...tool.pending, position: consumer },
      entry,
      material: outcomeMaterial(s.access.tenant, entry),
      result: {
        producer: { kind: 'tool' as const, call: tool.call },
        version: 'tres_1',
        delivery: null,
        source: evidence('tool-result'),
      },
    }
  }
  const sample = sampleReceivedModelResult(s.access.tenant, 'early')
  const entry = { ...sample, consumer: { ...sample.consumer, work: s.execution } }
  const { key } = entry.delivery
  if (key.kind !== 'result') throw new Error('fixture: a Model result')
  const pending: Extract<PendingCall, { kind: 'model' }> = {
    kind: 'model',
    purpose: 'main',
    action: ok(decodeActionId('action')),
    reference: key.reference,
    consumption: entry.consumption,
    position: entry.consumer,
    fixed: evidence('request'),
  }
  const { material: _material, ...draft } = entry
  return {
    pending,
    entry,
    material: modelMaterialOf(s.access.tenant, draft),
    result: {
      producer: {
        kind: 'model' as const,
        call: ok(resolveModelInvocationRef(key.reference, s.access.tenant)).call,
      },
      version: String(key.result),
      delivery: null,
      source: evidence('model-result'),
    },
  }
}

async function processedWhereRegistered(s: SqlScene, c: Scene, producer: Producer) {
  const { journal, opened, authority, load, commit, receive } = await opening(s, c)
  const kept = keptResult(s, producer)
  await commit('issue', {
    checkpoint: { ...(await load()).checkpoint, calls: [kept.pending] },
    effects: [{ action: kept.pending.action, pending: kept.pending, authority }],
  })
  await receive('result', kept.entry, kept.material)
  await commit('processed', {
    checkpoint: { ...(await load()).checkpoint, calls: [] },
    events: [{ kind: 'producer', result: kept.result, consumption: kept.pending.consumption }],
  })
  await endOpened(s, journal, opened, refusedByModel())
}

async function consuming(s: SqlScene, c: Scene, producer: Producer) {
  const coordinator = async () => succeed(s.access.principal)
  if (producer === 'tool') {
    const tool = createSessionToolLogConsumptionPlugin({ toolDeliveries: reader, coordinator })
    await c.mount(tool.plugin, {})
    return () => tool.consume({ ...targetOf(s), principal: s.access.principal })
  }
  const model = createSessionModelLogConsumptionPlugin<string>({ coordinator })
  await c.mount(model.plugin)
  return () => model.consume(targetOf(s))
}

type LogEntry = Readonly<{ kind: string; body: Record<string, unknown> }>

const entriesOf = (s: SqlScene): LogEntry[] =>
  (s.controls?.select('SELECT kind, entry FROM sl_entry ORDER BY position').rows ?? []).map(
    ([kind, cell]) => ({
      kind: String(kind),
      body: (
        JSON.parse(cell instanceof Uint8Array ? unpackText(cell) : String(cell)) as {
          body: Record<string, unknown>
        }
      ).body,
    }),
  )

function callOrder(s: SqlScene) {
  const entries = entriesOf(s)
  const fact = (field: string) =>
    entries.findIndex(entry => entry.kind === 'call.execution-fact' && field in entry.body)
  return {
    entries,
    bound: entries.findIndex(entry => entry.kind === 'call.bound'),
    delivered: fact('delivered'),
    processed: fact('result'),
  }
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

  it('a block two executions of one session both name is stored for each: every block the open items of the second name is its own or shared', async () => {
    const s = await scene('blocks-per-execution')
    ok(await s.view.journal.open(s.openInput))
    const sibling = await nextRun(s, 2)
    ok(await s.view.journal.open(sibling.openInput))
    const select = (sql: string) => s.controls?.select(sql).rows ?? []
    const own = (execution: string) =>
      new Set(
        select(`SELECT digest FROM er_block WHERE execution = '${execution}'`).map(row =>
          String(row[0]),
        ),
      )
    const first = own(s.execution)
    const second = own(sibling.execution)
    expect([...second].some(digest => first.has(digest))).toBe(true)
    const shared = new Set(select('SELECT digest FROM sl_blob').map(row => String(row[0])))
    const named = new Set<string>()
    for (const [body] of select(
      `SELECT body FROM er_item WHERE execution = '${sibling.execution}' AND open = 1`,
    ))
      refsIn(JSON.parse(unpackText(body as Uint8Array)) as unknown, named)
    expect(named.size).toBeGreaterThan(0)
    for (const digest of named)
      expect(second.has(blobRowDigest(digest)) || shared.has(blobRowDigest(digest)), digest).toBe(
        true,
      )
  })

  it('opening the tenant alone, with no read or write of an execution, makes up an acknowledgement cut off in the last writer generation', async () => {
    const s = await scene('open-tenant-wakes')
    const first = await interpreting(s, { acknowledge: gate().acknowledge })
    await endWithFailure(s, first.c.journal(), refusedByModel())
    await first.interpret()
    expect(headOf(s)).toMatchObject({ acknowledged: '0', settled: null })
    await first.c.dispose()

    const next = await interpreting(s)
    const reads: string[] = []
    s.rewriteReads.current = (request, answer) => {
      reads.push(request.handler)
      return answer
    }
    const log = next.c.ctx.get(sessionExecutionLogKey) as SessionExecutionLog | undefined
    expect(await log?.openTenant(s.access.tenant)).toEqual({ kind: 'opened' })
    expect(reads).toEqual(['execution-record.retired'])
    const head = await settled(s)
    expect(head.acknowledged).toBe(head.emitted)
  })

  it('opening the tenant alone, with no read or write of an execution, removes the tombstones and operation records the last writer generation settled', async () => {
    const s = await scene('open-tenant-sweeps')
    const f = await interpreting(s)
    await endWithFailure(s, f.c.journal(), refusedByModel())
    await f.interpret()
    await settled(s)
    expect(rowsOf(s, 'er_operation')).toBeGreaterThan(0)
    await f.c.dispose()

    const next = await interpreting(s)
    const reads: string[] = []
    s.rewriteReads.current = (request, answer) => {
      reads.push(request.handler)
      return answer
    }
    const log = next.c.ctx.get(sessionExecutionLogKey) as SessionExecutionLog | undefined
    expect(await log?.openTenant(s.access.tenant)).toEqual({ kind: 'opened' })
    expect(reads).toEqual(['execution-record.retired'])
    expect(headOf(s)).toBeNull()
    expect(rowsOf(s, 'er_operation')).toBe(0)
  })

  it('opening a tenant without a transaction domain answers unavailable', async () => {
    const s = await scene('open-tenant-unregistered')
    const f = await interpreting(s)
    const log = f.c.ctx.get(sessionExecutionLogKey) as SessionExecutionLog | undefined
    const other = tenantCodec.parse(
      JSON.stringify({
        organization: 'org_zzzzzzzzzzzzzzzzzzzzzzzzzz',
        account: 'acc_zzzzzzzzzzzzzzzzzzzzzzzzzz',
      }),
    )
    if (!other.ok) throw new Error('fixture: another tenant')
    expect(await log?.openTenant(other.value)).toEqual({
      kind: 'unavailable',
      diagnostic: 'the tenant has no transaction domain',
    })
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

  it('a Model result kept before the interpretation bound its call, and the Agent ended without processing it: the interpretation commit wakes the model log consumption, the call is no longer open once its result is in the session log, and the execution settles with the account kept', async () => {
    const s = await scene('settle-model-late')
    const c = await cordisScene(s)
    disposers.push(() => c.dispose())
    const coordinator = async () => succeed(s.access.principal)
    await c.mount(createSessionModelLogConsumptionPlugin<string>({ coordinator }).plugin)
    await modelResultThenEnded(s, c, false)
    // The consumption answered every write before the interpretation starts: it found no binding.
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(kindsOf(s)).not.toContain('call.bound')
    const interpretation = createSessionJournalInterpretationPlugin<string>({ coordinator })
    await c.mount(interpretation.plugin)
    ok(await interpretation.interpret(targetOf(s)))
    const head = await settled(s)
    expect(head.acknowledged).toBe(head.emitted)
    const kinds = kindsOf(s)
    expect(kinds).toContain('account.linked')
    expect(kinds.indexOf('call.bound')).toBeLessThan(kinds.indexOf('call.execution-fact'))
    expect(rowsOf(s, 'er_fact')).toBe(0)
  })

  it('the Agent processed the Model result and the interpretation lags: the interpretation waits for the model log consumption, so the acknowledgement does not overtake it and the account stays in the session log', async () => {
    const s = await scene('settle-model-processed')
    const c = await cordisScene(s)
    disposers.push(() => c.dispose())
    const coordinator = async () => succeed(s.access.principal)
    await modelResultThenEnded(s, c, true)
    const interpretation = createSessionJournalInterpretationPlugin<string>({ coordinator })
    await c.mount(interpretation.plugin)
    ok(await interpretation.interpret(targetOf(s)))
    // The model log consumption is not there yet: the processing of its delivery waits for it.
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(headOf(s)).toMatchObject({ acknowledged: '0', settled: null })
    expect(kindsOf(s)).not.toContain('run.terminal')
    const consumption = createSessionModelLogConsumptionPlugin<string>({ coordinator })
    await c.mount(consumption.plugin)
    ok(await consumption.consume(targetOf(s)))
    const head = await settled(s)
    expect(head.acknowledged).toBe(head.emitted)
    const kinds = kindsOf(s)
    expect(kinds).toContain('account.linked')
    expect(kinds.indexOf('account.linked')).toBeLessThan(kinds.indexOf('run.terminal'))
    expect(rowsOf(s, 'er_fact')).toBe(0)
  })

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

describe('an Agent event that registers a call and processes its result kept before that event', () => {
  it.each(['tool', 'model'] as const)(
    'a %s call: the interpretation commits the binding first without moving its position, the entries consumption writes the delivery, then the rest of the event commits; the execution settles',
    async producer => {
      const s = await scene(`registered-where-processed-${producer}`)
      const c = await cordisScene(s)
      disposers.push(() => c.dispose())
      await consuming(s, c, producer)
      const interpretation = createSessionJournalInterpretationPlugin<string>({
        coordinator: async () => succeed(s.access.principal),
      })
      await c.mount(interpretation.plugin)
      await processedWhereRegistered(s, c, producer)
      const head = await settled(s)
      expect(head.acknowledged).toBe(head.emitted)
      const order = callOrder(s)
      expect(order.bound).toBeGreaterThanOrEqual(0)
      expect(order.bound).toBeLessThan(order.delivered)
      expect(order.delivered).toBeLessThan(order.processed)
      expect(order.entries.map(entry => entry.kind)).toContain('run.terminal')
    },
  )

  it('a Tool intent the Session registered, whose association comes in the event that processes its result: the association commits first, then the delivery, then the rest of the event', async () => {
    const s = await scene('associated-where-processed')
    const c = await cordisScene(s)
    disposers.push(() => c.dispose())
    await consuming(s, c, 'tool')
    await c.mount(
      createSessionJournalInterpretationPlugin<string>({
        coordinator: async () => succeed(s.access.principal),
      }).plugin,
    )
    const { journal, opened, authority, load, commit, receive } = await opening(s, c)
    const kept = keptResult(s, 'tool')
    if (kept.pending.kind !== 'tool') throw new Error('fixture: a Tool call')
    const { reference: _reference, acceptance: _acceptance, ...fields } = kept.pending
    const intent: PendingCall = { ...fields, association: 'intent' }
    const waits = [{ kind: 'producer' as const, pending: intent }]
    await commit('intent', {
      checkpoint: { ...(await load()).checkpoint, calls: [intent] },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [{ action: intent.action, pending: intent, authority }],
    })
    await vi.waitFor(() => expect(kindsOf(s)).toContain('call.bound'), { timeout: 5000 })
    await commit('associated', {
      checkpoint: { ...(await load()).checkpoint, calls: [kept.pending] },
    })
    await receive('result', kept.entry, kept.material)
    await commit('processed', {
      checkpoint: { ...(await load()).checkpoint, calls: [kept.pending] },
      events: [{ kind: 'producer', result: kept.result, consumption: kept.pending.consumption }],
    })
    await endOpened(s, journal, opened, refusedByModel())
    const head = await settled(s)
    expect(head.acknowledged).toBe(head.emitted)
    const order = callOrder(s)
    const associated = order.entries.findIndex(
      entry => entry.kind === 'call.bound' && entry.body['association'] !== null,
    )
    expect(associated).toBeGreaterThan(order.bound)
    expect(associated).toBeLessThan(order.delivered)
    expect(order.delivered).toBeLessThan(order.processed)
  })

  it('the binding part whose reply is lost is sent again under its own operation and recalled; a restarted interpretation finds the binding in the session and does not send it again', async () => {
    const s = await scene('registered-where-processed-recalled')
    const sent: SessionLogCommitObservation[] = []
    const recalled: boolean[] = []
    const lose = { next: true }
    const c = await cordisScene(s, {
      commitLog: inner => async input => {
        sent.push(input.observation)
        const answer = await inner(input)
        if (input.observation.sequence !== null) return answer
        if (lose.next) {
          lose.next = false
          return fail({ kind: 'commit-unknown', operation: input.observation.operation })
        }
        if ('ok' in answer) recalled.push(answer.ok.recovered)
        return answer
      },
    })
    disposers.push(() => c.dispose())
    const coordinator = async () => succeed(s.access.principal)
    await processedWhereRegistered(s, c, 'tool')
    const first = createSessionJournalInterpretationPlugin<string>({ coordinator })
    const fiber = await c.mount(first.plugin)
    ok(await first.interpret(targetOf(s)))
    const bindings = sent.filter(observation => observation.sequence === null)
    expect(bindings.map(observation => observation.operation)).toEqual([
      bindings[0]!.operation,
      bindings[0]!.operation,
    ])
    expect(bindings[0]!.consequences.map(item => item.kind)).toEqual(['call-registration'])
    expect(recalled).toEqual([true])
    await fiber.dispose()

    const again = createSessionJournalInterpretationPlugin<string>({ coordinator })
    await c.mount(again.plugin)
    ok(await again.interpret(targetOf(s)))
    expect(sent.filter(observation => observation.sequence === null)).toHaveLength(2)
    const consume = await consuming(s, c, 'tool')
    ok(await consume())
    await settled(s)
    const order = callOrder(s)
    expect(order.bound).toBeLessThan(order.delivered)
    expect(order.delivered).toBeLessThan(order.processed)
    expect(
      order.entries.slice(0, order.delivered).filter(entry => entry.kind === 'call.bound'),
    ).toHaveLength(1)
    const whole = sent.find(observation =>
      observation.consequences.some(item => item.kind === 'producer'),
    )
    expect(whole?.sequence).not.toBeNull()
    expect(whole?.operation).not.toBe(bindings[0]!.operation)
  })
})
