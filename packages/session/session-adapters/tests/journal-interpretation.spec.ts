// AD-02 on real Cordis 4.0.4 over the Session log combination in SQL: the session-log Journal
// plugin publishes Agent events and sends `session-adapters/agent-published`; the journal
// interpretation plugin reads the events after the execution's saved progress and commits each
// through `commitLog`. What is checked: one Agent write is interpreted without a call from the
// test, the progress reaches the head and the Session command that reads the history passes (it
// answers unavailable without the plugin); a lost reply is sent again under the same operation and
// recalls; the same event twice commits once; a head that another writer moved after the read
// answers changed and the call reads again once, then commits; a stopped plugin and a plugin without
// `sessionTransactions` commit nothing; another tenant's event and a refusing view commit nothing;
// the R2-D28 counterexample passes once the plugin committed the non-observed tail; the commits of
// one round do not grow with the rounds before it. The storage is the node:sqlite double of the
// combination (real participants, migrations and read handlers).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeInputId,
  type AgentJournal,
  type DurableEvidence,
  type Waiting,
} from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { deriveDriveOperation } from '@omne-harness/session-contract'
import type {
  SessionFailure,
  SessionLogCommitObservation,
  SessionTransactionPort,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  assistantMessage,
  creation,
  evidence,
  guard,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import { createSessionJournalInterpretationPlugin } from '../src/cordis/journal-interpretation.ts'
import { ok, operation, scene, submitInput } from './fixtures/common-journal.ts'
import { cordisScene, handed, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

type CommitLog = NonNullable<SessionTransactionPort<string>['commitLog']>
type Sent = Readonly<{ observation: SessionLogCommitObservation }>

const scenes: SqlScene[] = []
const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  for (const s of scenes.splice(0)) await s.close()
})

/**
 * The scene, its Cordis root and the AD-02 plugin. `sent` records every `commitLog` call;
 * `script` may answer one call instead of the port (after running it, or without running it).
 */
async function interpreted(
  name: string,
  options: Readonly<{ transactions?: 'absent'; plugin?: 'later' }> = {},
) {
  const s = await sqlScene(name)
  scenes.push(s)
  const sent: Sent[] = []
  const script: ((inner: CommitLog, input: Sent) => ReturnType<CommitLog>)[] = []
  const c = await cordisScene(s, {
    ...(options.transactions === undefined ? {} : { transactions: options.transactions }),
    commitLog: inner => input => {
      sent.push(input)
      const next = script.shift()
      return next === undefined ? inner(input) : next(inner, input)
    },
  })
  disposers.push(() => c.dispose())
  const interpretation = createSessionJournalInterpretationPlugin<string>({
    coordinator: async () => succeed(s.access.principal),
  })
  const mountPlugin = () => c.mount(interpretation.plugin)
  const fiber = options.plugin === 'later' ? null : await mountPlugin()
  const target = { tenant: s.access.tenant, session: s.access.session, execution: s.execution }
  return { s, c, sent, script, interpretation, fiber, mountPlugin, target }
}

const work = async (s: SqlScene): Promise<WorkSnapshot> =>
  ok(await s.port.readWork(s.sessionAccess))

/** The saved event progress of the scene's execution. */
async function readThrough(s: SqlScene): Promise<string> {
  const snapshot = await work(s)
  if (snapshot.run.kind === 'active' && snapshot.run.execution.execution === s.execution)
    return snapshot.run.execution.readThrough
  const held = snapshot.executions?.find(item => item.execution.execution === s.execution)
  if (held === undefined) throw new Error('the execution is not in the snapshot')
  return held.execution.readThrough
}

/** Lets the not-awaited dispatch of an event and the queued interpretation finish. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 50))

/** Waits until the saved progress of the execution is `through`. */
async function reaches(s: SqlScene, through: string) {
  await vi.waitFor(async () => expect(await readThrough(s)).toBe(through), { timeout: 5000 })
}

/** Session accepts input `label` (SE11) and the Agent submits it into the scene's execution. */
async function submitted(s: SqlScene, journal: AgentJournal<string>, label: string) {
  const value = ordinaryInput(`input-${label}`)
  const accepted = ok(
    await s.port.commit({
      access: s.sessionAccess,
      command: {
        kind: 'accept',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId(`accept-${label}`),
          value,
        },
      },
      guards: [guard('evidence-bridge', 'ordinary-intake', value)],
    }),
  )
  const input = {
    id: ok(decodeInputId(`input-${label}`)),
    source: (accepted as { source: DurableEvidence }).source,
    content: value.message,
    priority: 'ordinary' as const,
  }
  const receipt = ok(
    await journal.submit(submitInput(s.access, s.execution, operation(`submit-${label}`), input)),
  )
  return { input, receipt }
}

/** One Agent commit of the scene's execution with `events`, at its current head. */
/** Where an Agent write goes: the scene's access and execution, of the SQL scene or the memory one. */
type Where = Pick<SqlScene, 'access' | 'execution'>

async function committed(
  s: Where,
  journal: AgentJournal<string>,
  label: string,
  events: Parameters<AgentJournal<string>['commit']>[0]['events'],
  waits: readonly Waiting[] = [],
) {
  const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
  const authority = loaded.executionAttachment
  if (authority === null) throw new Error('an active attachment is expected')
  return ok(
    await journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(label),
      authority,
      expected: loaded.revision,
      checkpoint: loaded.checkpoint,
      state: waits.length > 0 ? { kind: 'waiting', waits } : { kind: 'advancing' },
      events,
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
}

/** The Agent takes the pending inputs, as the coordinator's first step does: event input-taken. */
async function take(s: Where, journal: AgentJournal<string>) {
  const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
  const authority = loaded.executionAttachment
  if (authority === null) throw new Error('an active attachment is expected')
  const page = ok(
    await journal.inputs({ ...s.access, execution: s.execution, watermark: loaded.inputWatermark }),
  )
  return ok(
    await journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('take'),
      authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, inputBatch: page.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: page.batch }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
}

/** Open, the handover of the initial input, and the take of it (event 1). */
async function started(s: SqlScene, journal: AgentJournal<string>) {
  const opened = ok(await journal.open(s.openInput))
  ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
  await take(s, journal)
}

/** A wait on a dependency: its event has the non-observed consequence `registered-waiting`. */
const dependency = (position: string): Waiting => ({ kind: 'dependency', owner: 'test', position })

/**
 * One round of the Agent: an observed message event, then a waiting event, each in its own commit.
 * (Events of one commit share their source, and the Session cursor check cannot tell an observed
 * event from a committed one of the same source; see the closure's known limitations.)
 */
async function round(s: SqlScene, journal: AgentJournal<string>, n: number) {
  await committed(s, journal, `round-${n}-message`, [
    { kind: 'message', message: assistantMessage(`round ${n}`), source: evidence(`message-${n}`) },
  ])
  const waits = [dependency(`round-${n}`)]
  await committed(s, journal, `round-${n}-waiting`, [{ kind: 'waiting', waits }], waits)
}

/** The event channel commits the Session log keeps, by operation. */
function logOperations(s: SqlScene): string[] {
  if (s.controls === null) throw new Error('the double storage is expected')
  return s.controls
    .select("SELECT operation FROM sl_operation WHERE operation LIKE 'ad02_%'")
    .rows.map(row => String(row[0]))
}

describe('AD-02: an Agent publication is interpreted after its event', () => {
  it('the take publishes input-taken; the plugin commits it and the Session command that reads the history passes', async () => {
    const f = await interpreted('ad02-open')
    const journal = f.c.journal()
    await started(f.s, journal)
    await reaches(f.s, '1')
    expect(f.sent.map(item => item.observation.consequences.map(c => c.kind))).toEqual([
      ['input-taken'],
    ])
    const { input, receipt } = await submitted(f.s, journal, 'two')
    ok(await handed(f.s, String(input.id), receipt.evidence))
  })

  it('without the plugin the same Session command answers unavailable: the event stays unread', async () => {
    const f = await interpreted('ad02-none', { plugin: 'later' })
    const journal = f.c.journal()
    await started(f.s, journal)
    const { input, receipt } = await submitted(f.s, journal, 'two')
    expect(await handed(f.s, String(input.id), receipt.evidence)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(await readThrough(f.s)).toBe('0')
  })

  it('an observed event is not committed; the next committed event covers it', async () => {
    const f = await interpreted('ad02-observed')
    const journal = f.c.journal()
    await started(f.s, journal)
    await reaches(f.s, '1')
    await round(f.s, journal, 1)
    await reaches(f.s, '3')
    expect(f.sent.map(item => item.observation.sequence)).toEqual(['1', '3'])
  })

  it('a lost reply is sent again under the same operation and recalls; the log holds one commit', async () => {
    const f = await interpreted('ad02-unknown')
    f.script.push(async (inner, input) => {
      await inner(input)
      return fail<SessionFailure>({
        kind: 'commit-unknown',
        operation: input.observation.operation,
      })
    })
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    await settle()
    expect(f.sent).toHaveLength(2)
    expect(f.sent[1]?.observation.operation).toBe(f.sent[0]?.observation.operation)
    expect(logOperations(f.s)).toEqual([f.sent[0]?.observation.operation])
  })

  it('the same event twice commits once: the second read starts after the saved progress', async () => {
    const f = await interpreted('ad02-twice')
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    await settle()
    expect(f.sent).toHaveLength(1)
    await f.c.ctx.parallel(
      'session-adapters/agent-published',
      f.target.tenant,
      f.target.session,
      f.target.execution,
    )
    await settle()
    expect(ok(await f.interpretation.interpret(f.target))).toEqual({
      readThrough: '1',
      committed: 0,
      waiting: 0,
    })
    expect(f.sent).toHaveLength(1)
    expect(logOperations(f.s)).toHaveLength(1)
  })
})

// session-contract SPEC: an expired same-root basis answers `changed` and the provider prepares
// again. Another writer of the session (the receivers write through their own Journal copy, which
// sends no `agent-published`) can move the execution head after the plugin read it; the plugin then
// reads again once in the same call, and no later event is needed for the interpretation to go on.
describe('AD-02: the execution head moves between the read and the commit', () => {
  /** A write of the scene's execution through a Journal copy that sends no event. */
  const moveHead = (f: Awaited<ReturnType<typeof interpreted>>, label: string) =>
    committed(f.s, f.s.view.journal, label, [
      { kind: 'message', message: assistantMessage(label), source: evidence(label) },
    ])

  it('Session answers changed; the call reads the new head and commits there', async () => {
    const f = await interpreted('ad02-moved', { plugin: 'later' })
    await started(f.s, f.c.journal())
    await f.mountPlugin()
    const answers: Awaited<ReturnType<CommitLog>>[] = []
    f.script.push(async (inner, input) => {
      await moveHead(f, 'moved-1')
      const answer = await inner(input)
      answers.push(answer)
      return answer
    })
    expect(ok(await f.interpretation.interpret(f.target))).toEqual({
      readThrough: '1',
      committed: 1,
      waiting: 0,
    })
    expect(answers).toMatchObject([{ failure: { kind: 'changed' } }])
    const [first, second] = f.sent.map(item => BigInt(item.observation.revision))
    expect(second).toBe((first ?? 0n) + 1n)
    expect(logOperations(f.s)).toEqual([f.sent[1]?.observation.operation])
  })

  it('a head that keeps moving: the call stops after its second read with changed', async () => {
    const f = await interpreted('ad02-moving', { plugin: 'later' })
    await started(f.s, f.c.journal())
    await f.mountPlugin()
    for (const label of ['moving-1', 'moving-2'])
      f.script.push(async (inner, input) => {
        await moveHead(f, label)
        return inner(input)
      })
    expect(await f.interpretation.interpret(f.target)).toMatchObject({
      failure: { kind: 'changed' },
    })
    expect(f.sent).toHaveLength(2)
    expect(await readThrough(f.s)).toBe('0')
    // The head stays still now: the next call commits.
    expect(ok(await f.interpretation.interpret(f.target))).toMatchObject({ readThrough: '1' })
  })
})

/**
 * A step that takes no input, as the step after a Tool result does: the Agent writes input-taken
 * with an empty batch.
 */
async function takeNothing(s: Where, journal: AgentJournal<string>, label: string) {
  const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
  const authority = loaded.executionAttachment
  if (authority === null) throw new Error('an active attachment is expected')
  const page = ok(
    await journal.inputs({ ...s.access, execution: s.execution, watermark: loaded.inputWatermark }),
  )
  if (page.batch.ordered.length !== 0) throw new Error('an empty batch is expected')
  return ok(
    await journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(label),
      authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, inputBatch: page.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: page.batch }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
}

// An empty batch has no Session acceptance (SE14 refuses it): the shared normalization gives the
// event only `observed`, so the next committed event covers it, in the production AD-02 and in the
// memory double alike.
describe('AD-02: a step that took no input', () => {
  const waits = [dependency('after-empty-take')]

  it('the empty input-taken is not committed; the next committed event covers it', async () => {
    const f = await interpreted('ad02-empty-take')
    const journal = f.c.journal()
    await started(f.s, journal)
    await reaches(f.s, '1')
    await takeNothing(f.s, journal, 'take-nothing')
    await committed(f.s, journal, 'wait-after-empty', [{ kind: 'waiting', waits }], waits)
    await reaches(f.s, '3')
    expect(f.sent.map(item => item.observation.sequence)).toEqual(['1', '3'])
  })

  it('the memory double interprets the same sequence to the same progress', async () => {
    const m = await scene('memory-empty-take')
    const interpret = (sequence: string) =>
      m.backend.controls.interpret({
        ...m.access,
        execution: m.execution,
        sequence,
        operation: operationId(`interpret-empty-${sequence}`),
      })
    await take(m, m.view.journal)
    ok(await interpret('1'))
    await takeNothing(m, m.view.journal, 'take-nothing')
    await committed(m, m.view.journal, 'wait-after-empty', [{ kind: 'waiting', waits }], waits)
    ok(await interpret('3'))
    const snapshot = ok(await m.backend.transactions.readWork(m.access))
    const own = snapshot.run.kind === 'active' ? snapshot.run.execution : undefined
    expect(own?.readThrough).toBe('3')
  })
})

describe('AD-02: what commits nothing', () => {
  it('a stopped plugin commits nothing, and a call through it answers unavailable', async () => {
    const f = await interpreted('ad02-stopped')
    await f.fiber?.dispose()
    await started(f.s, f.c.journal())
    await settle()
    expect(f.sent).toHaveLength(0)
    expect(await readThrough(f.s)).toBe('0')
    expect(await f.interpretation.interpret(f.target)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('without sessionTransactions the plugin stays pending and commits nothing', async () => {
    const f = await interpreted('ad02-pending', { transactions: 'absent' })
    await started(f.s, f.c.journal())
    await settle()
    expect(f.sent).toHaveLength(0)
    expect(await readThrough(f.s)).toBe('0')
    expect(await f.interpretation.interpret(f.target)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it("an event that names another tenant's session commits nothing", async () => {
    const f = await interpreted('ad02-foreign')
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    await settle()
    f.sent.length = 0
    const other = memoryOtherAccess('ad02-foreign')
    await f.c.ctx.parallel(
      'session-adapters/agent-published',
      other.tenant,
      f.target.session,
      f.target.execution,
    )
    await settle()
    expect(f.sent).toHaveLength(0)
    expect(await f.interpretation.interpret({ ...f.target, tenant: other.tenant })).toHaveProperty(
      'failure',
    )
    expect(f.sent).toHaveLength(0)
  })

  it('a view that refuses commitLog (a delegated view) gets nothing committed, and it is not retried', async () => {
    const f = await interpreted('ad02-denied')
    f.script.push(async () => fail<SessionFailure>({ kind: 'denied', action: 'commitLog' }))
    await started(f.s, f.c.journal())
    await settle()
    expect(f.sent).toHaveLength(1)
    expect(await readThrough(f.s)).toBe('0')
    expect(logOperations(f.s)).toEqual([])
  })
})

describe('R2-D28 with the production Journal: a cancelled Run with a non-observed tail', () => {
  it('the next startRun answers unavailable until the plugin committed the tail, then passes', async () => {
    const f = await interpreted('ad02-r2d28')
    const journal = f.c.journal()
    await started(f.s, journal)
    await reaches(f.s, '1')
    const { input, receipt } = await submitted(f.s, journal, 'two')
    ok(await handed(f.s, String(input.id), receipt.evidence))
    // The plugin stops; the Agent then writes a non-observed event and an observed one.
    await f.fiber?.dispose()
    await round(f.s, journal, 1)
    const snapshot = await work(f.s)
    if (snapshot.run.kind !== 'active') throw new Error('an active Run is expected')
    ok(
      await f.s.port.commit({
        access: f.s.sessionAccess,
        command: {
          kind: 'control',
          input: {
            tenant: f.s.access.tenant,
            session: f.s.access.session,
            operation: operationId('cancel-1'),
            intent: { kind: 'cancel-run', run: snapshot.run.run, urgency: 'force' },
          },
        },
        guards: [],
      }),
    )
    const startRun = (name: string) =>
      f.s.port.commit({
        access: f.s.sessionAccess,
        command: {
          kind: 'startRun',
          input: {
            tenant: f.s.access.tenant,
            session: f.s.access.session,
            operation: operationId(name),
            entry: 'interactive',
            candidate: creation({ initial: ordinaryInput('input-1') }).definition.candidate,
            instance: { owner: 'agent', id: 'instance-1' },
          },
        },
        guards: [guard('evidence-bridge', 'login-entry', { session: name, operation: name })],
      })
    expect(await startRun('start-2')).toMatchObject({ failure: { kind: 'unavailable' } })
    await f.mountPlugin()
    ok(await f.interpretation.interpret(f.target))
    ok(await startRun('start-2-again'))
  })
})

describe('AD-02 commits per round do not grow with the rounds before it', () => {
  async function counted(rounds: number) {
    const f = await interpreted(`ad02-count-${rounds}`)
    const journal = f.c.journal()
    await started(f.s, journal)
    await reaches(f.s, '1')
    const perRound: number[] = []
    for (let n = 1; n <= rounds; n += 1) {
      const before = f.sent.length
      await round(f.s, journal, n)
      await reaches(f.s, String(1 + 2 * n))
      perRound.push(f.sent.length - before)
    }
    return perRound
  }

  it('three rounds: one commit per round, for the one non-observed event', async () => {
    expect(await counted(3)).toEqual([1, 1, 1])
  })

  it('200 rounds: still one commit per round', { timeout: 600_000 }, async () => {
    const perRound = await counted(200)
    expect(new Set(perRound)).toEqual(new Set([1]))
  })
})

/**
 * K-12 direction D: an Agent control event has the deferred marker instead of kinds, and Session
 * decides its consequences in the interpretation commit with `decideControlConsequences`. The
 * sequence is a Session cancel of the Run (K), the Agent cancel under the drive of K (accepted),
 * then its intent and its qualification.
 */
describe('AD-02 interprets the control events of a Session cancel (deferred control facts)', () => {
  type Progress = Readonly<{ state: string; pending: number }> | null
  const stages = ['intent-established', 'qualification-revoked'] as const

  /** The Session cancel of the active Run: SE24 of K. */
  async function cancelRun(
    port: SessionTransactionPort<string>,
    access: SqlScene['sessionAccess'],
  ) {
    const snapshot = ok(await port.readWork(access))
    if (snapshot.run.kind !== 'active') throw new Error('an active Run is expected')
    const control = operationId('cancel-k')
    ok(
      await port.commit({
        access,
        command: {
          kind: 'control',
          input: {
            tenant: access.tenant,
            session: access.session,
            operation: control,
            intent: { kind: 'cancel-run', run: snapshot.run.run, urgency: 'force' },
          },
        },
        guards: [],
      }),
    )
    return control
  }

  /** The Agent side of K: the cancel under the drive of K, then each stage. */
  function agentSteps(
    journal: AgentJournal<string>,
    access: SqlScene['access'],
    execution: SqlScene['execution'],
    control: ReturnType<typeof operationId>,
  ): (() => Promise<unknown>)[] {
    const target = operation(deriveDriveOperation({ kind: 'control', execution, control }))
    return [
      async () =>
        ok(
          await journal.control({
            ...access,
            execution,
            operation: target,
            command: { kind: 'cancel', reason: evidence('cancel') },
          }),
        ),
      ...stages.map(
        stage => async () =>
          ok(
            await journal.recordControl({
              ...access,
              execution,
              operation: operation(stage),
              target,
              stage,
              state: 'reached',
              source: evidence(stage),
            }),
          ),
      ),
    ]
  }

  const progressOf = (snapshot: WorkSnapshot, control: string): Progress => {
    const found = snapshot.controls.find(item => item.operation === control)
    return found === undefined ? null : { state: found.state, pending: found.pending.length }
  }

  /** The production Journal with AD-02: the progress of K after each Agent step is interpreted. */
  async function production(name: string) {
    const f = await interpreted(name)
    const journal = f.c.journal()
    await started(f.s, journal)
    await reaches(f.s, '1')
    // A handed input that the cancelled Run did not take: the successor starts with it.
    const { input, receipt } = await submitted(f.s, journal, 'two')
    ok(await handed(f.s, String(input.id), receipt.evidence))
    await round(f.s, journal, 1)
    await reaches(f.s, '3')
    const control = await cancelRun(f.s.port, f.s.sessionAccess)
    const progress: Progress[] = []
    let sequence = 3
    for (const step of agentSteps(journal, f.s.access, f.s.execution, control)) {
      await step()
      sequence += 1
      await reaches(f.s, String(sequence))
      progress.push(progressOf(await work(f.s), control))
    }
    return { f, control, progress }
  }

  /** The memory double on the same sequence: each event interpreted by an explicit call. */
  async function memory(name: string) {
    const m = await scene(name)
    const loaded = ok(await m.view.journal.load({ ...m.access, execution: m.execution }))
    const page = ok(
      await m.view.journal.inputs({
        ...m.access,
        execution: m.execution,
        watermark: loaded.inputWatermark,
      }),
    )
    ok(
      await m.view.journal.commit({
        ...m.access,
        execution: m.execution,
        operation: operation('take'),
        authority: m.opened.authority,
        expected: loaded.revision,
        checkpoint: { ...m.checkpoint, inputBatch: page.batch.id },
        state: { kind: 'advancing' },
        events: [{ kind: 'input-taken', batch: page.batch }],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    const interpret = (sequence: string) =>
      m.backend.controls.interpret({
        ...m.access,
        execution: m.execution,
        sequence,
        operation: operationId(`interpret-${sequence}`),
      })
    ok(await interpret('1'))
    const control = await cancelRun(m.backend.transactions, m.access)
    const progress: Progress[] = []
    let sequence = 1
    for (const step of agentSteps(m.view.journal, m.access, m.execution, control)) {
      await step()
      sequence += 1
      ok(await interpret(String(sequence)))
      progress.push(progressOf(ok(await m.backend.transactions.readWork(m.access)), control))
    }
    return progress
  }

  it('the control events after a Session cancel are interpreted: K reconciles, the Run reads cancelled, its content stays and a successor starts', async () => {
    const { f, control, progress } = await production('ad02-cancel')
    expect(progress.at(-1)).toEqual({ state: 'reconciled', pending: 0 })
    const snapshot = await work(f.s)
    expect(readThroughOf(snapshot, f.s.execution)).toBe('6')
    if (snapshot.run.kind !== 'terminal') throw new Error('a terminal Run is expected')
    expect(snapshot.run.terminal.outcome).toBe('cancelled')
    expect(snapshot.controls.find(item => item.operation === control)?.state).toBe('reconciled')
    // The content written before the cancel stays readable: the cancel withdraws nothing.
    const output = ok(
      await f.c
        .journal()
        .output.read({ ...f.s.access, execution: f.s.execution, after: null, limit: 10 }),
    )
    expect(JSON.stringify(output)).toContain('round 1')
    ok(await startRun(f.s, 'start-after-cancel'))
  })

  it('the memory double and the production AD-02 give the same progress of K, the one Session decides', async () => {
    const produced = await production('ad02-cancel-pair')
    const reference = await memory('memory-cancel-pair')
    expect(produced.progress).toEqual(reference)
    expect(reference).toEqual([
      { state: 'propagating', pending: 0 },
      { state: 'propagating', pending: 0 },
      { state: 'reconciled', pending: 0 },
    ])
  })
})

function readThroughOf(snapshot: WorkSnapshot, execution: string): string | undefined {
  return snapshot.executions?.find(item => item.execution.execution === execution)?.execution
    .readThrough
}

/** A successor Run with a new first input: the decision that reads the cancelled execution's tail. */
function startRun(s: SqlScene, name: string) {
  return s.port.commit({
    access: s.sessionAccess,
    command: {
      kind: 'startRun',
      input: {
        tenant: s.access.tenant,
        session: s.access.session,
        operation: operationId(name),
        entry: 'interactive',
        candidate: creation({ initial: ordinaryInput('input-1') }).definition.candidate,
        instance: { owner: 'agent', id: 'instance-1' },
      },
    },
    guards: [guard('evidence-bridge', 'login-entry', { session: name, operation: name })],
  })
}
