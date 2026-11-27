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
import type { JsonValue } from '@omne-harness/sql-contract'
import { EXECUTION_RECORD_HANDLERS } from '@omne-harness/session-storage-sql/participants'
import {
  createSessionJournalInterpretationPlugin,
  DEFAULT_JOURNAL_INTERPRETATION_RETRY,
} from '../src/cordis/journal-interpretation.ts'
import { ok, operation, scene, submitInput } from './fixtures/common-journal.ts'
import { cordisScene, handed, nextRun, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

type CommitLog = NonNullable<SessionTransactionPort<string>['commitLog']>
type Sent = Readonly<{ observation: SessionLogCommitObservation }>

const scenes: SqlScene[] = []
const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  for (const s of scenes.splice(0)) await s.close()
})

async function interpreted(
  name: string,
  options: Readonly<{
    transactions?: 'absent'
    plugin?: 'later'
    retry?: Readonly<{ initialMs: number; multiplier: number; maxMs: number }>
  }> = {},
) {
  const s = await sqlScene(name)
  scenes.push(s)
  const heads = { undecided: false }
  const bytes = { written: [] as number[], read: [] as number[] }
  const base = s.storage
  s.storage = {
    ...base,
    commit: request => {
      for (const command of request.commands)
        if (command.participant === 'execution-record')
          bytes.written.push(JSON.stringify(command.facts).length)
      return base.commit(request)
    },
    read: async (request, readOptions) => {
      const result = await base.read(request, readOptions)
      if (result.kind === 'read' && request.handler.startsWith('execution-record.'))
        bytes.read.push(JSON.stringify(result.output).length)
      if (result.kind !== 'read' || request.handler !== EVENTS_HANDLER) return result
      let output = result.output
      if (heads.undecided) output = withUndecidedEvents(output)
      return { ...result, output }
    },
  }
  const sent: Sent[] = []
  const script: ((inner: CommitLog, input: Sent) => ReturnType<CommitLog>)[] = []
  const shown = { work: null as ((snapshot: WorkSnapshot) => WorkSnapshot) | null }
  const c = await cordisScene(s, {
    work: snapshot => shown.work?.(snapshot) ?? snapshot,
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
    retry: options.retry ?? QUICK_RETRY,
  })
  const logged: string[] = []
  c.ctx.logger.exporter({
    levels: { default: 2 },
    export: message => {
      if (message.name === 'session-adapters/journal-interpretation' && message.type !== 'info')
        logged.push(message.args.map(String).join(' '))
    },
  })
  const mountPlugin = () => c.mount(interpretation.plugin)
  const fiber = options.plugin === 'later' ? null : await mountPlugin()
  const target = { tenant: s.access.tenant, session: s.access.session, execution: s.execution }
  return {
    s,
    c,
    sent,
    script,
    shown,
    interpretation,
    fiber,
    mountPlugin,
    target,
    heads,
    bytes,
    logged,
  }
}

const QUICK_RETRY = { initialMs: 1, multiplier: 2, maxMs: 4 } as const

const BATCHES_HANDLER = EXECUTION_RECORD_HANDLERS.facts
const EVENTS_HANDLER = EXECUTION_RECORD_HANDLERS.events

function withUndecidedEvents(output: JsonValue): JsonValue {
  const copy = structuredClone(output) as { events?: { consequences: unknown; control: unknown }[] }
  for (const event of copy.events ?? []) {
    event.consequences = null
    event.control = null
  }
  return copy as JsonValue
}

const stateReads = (s: SqlScene) =>
  s.controls?.reads.filter(handler => handler === BATCHES_HANDLER || handler === EVENTS_HANDLER)
    .length ?? 0

const work = async (s: SqlScene): Promise<WorkSnapshot> =>
  ok(await s.port.readWork(s.sessionAccess))

async function readThrough(s: SqlScene): Promise<string> {
  const snapshot = await work(s)
  if (snapshot.run.kind === 'active' && snapshot.run.execution.execution === s.execution)
    return snapshot.run.execution.readThrough
  const held = snapshot.executions?.find(item => item.execution.execution === s.execution)
  if (held === undefined) throw new Error('the execution is not in the snapshot')
  return held.execution.readThrough
}

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 50))

async function reaches(s: SqlScene, through: string) {
  await vi.waitFor(async () => expect(await readThrough(s)).toBe(through), { timeout: 5000 })
}

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
}

async function started(s: SqlScene, journal: AgentJournal<string>) {
  const opened = ok(await journal.open(s.openInput))
  ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
  await take(s, journal)
}

const dependency = (position: string): Waiting => ({ kind: 'dependency', owner: 'test', position })

async function round(s: SqlScene, journal: AgentJournal<string>, n: number) {
  await committed(s, journal, `round-${n}-message`, [
    { kind: 'message', message: assistantMessage(`round ${n}`), source: evidence(`message-${n}`) },
  ])
  const waits = [dependency(`round-${n}`)]
  await committed(s, journal, `round-${n}-waiting`, [{ kind: 'waiting', waits }], waits)
}

function logOperations(s: SqlScene): string[] {
  if (s.controls === null) throw new Error('the double storage is expected')
  return s.controls
    .select("SELECT operation FROM sl_operation WHERE operation LIKE 'ad02_%'")
    .rows.map(row => String(row[0]))
}

describe('an Agent publication is interpreted after its event', () => {
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

describe('the execution head moves between the read and the commit', () => {
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
    expect(ok(await f.interpretation.interpret(f.target))).toMatchObject({ readThrough: '1' })
  })

  it('a call of the event queue that ends in changed is made again after the backoff, and the event commits', async () => {
    const f = await interpreted('ad02-requeued')
    for (const label of ['requeued-1', 'requeued-2'])
      f.script.push(async (inner, input) => {
        await moveHead(f, label)
        return inner(input)
      })
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    expect(f.sent).toHaveLength(3)
    expect(new Set(f.sent.map(item => item.observation.sequence))).toEqual(new Set(['1']))
    expect(logOperations(f.s)).toEqual([f.sent[2]?.observation.operation])
  })

  it('a head that moves more often than 2 x 2 sends still commits once it stands still, from the saved progress', async () => {
    const f = await interpreted('ad02-requeue-bound')
    for (const label of ['bound-1', 'bound-2', 'bound-3', 'bound-4', 'bound-5'])
      f.script.push(async (inner, input) => {
        await moveHead(f, label)
        return inner(input)
      })
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    expect(f.sent).toHaveLength(6)
    expect(logOperations(f.s)).toEqual([f.sent[5]?.observation.operation])
  })
})

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
}

describe('a step that took no input', () => {
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

  it('a Journal copy rebuilt from the durable records loads after the empty take and goes on', async () => {
    const f = await interpreted('ad02-empty-rebuilt')
    const journal = f.c.journal()
    await started(f.s, journal)
    await takeNothing(f.s, journal, 'take-nothing')
    await committed(f.s, f.s.view.journal, 'other-writer', [
      { kind: 'message', message: assistantMessage('other'), source: evidence('other-writer') },
    ])
    ok(await f.s.fresh().journal.load({ ...f.s.access, execution: f.s.execution }))
    await committed(f.s, journal, 'wait-after-rebuild', [{ kind: 'waiting', waits }], waits)
    await reaches(f.s, '4')
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

describe('a Session participant rollback that answers unavailable', () => {
  const rollback = async () =>
    fail<SessionFailure>({
      kind: 'unavailable',
      owner: 'session-storage-sql',
      diagnostic: 'rolled back',
    })

  it('the event is interpreted again after a backoff, with no later event, and commits once', async () => {
    const f = await interpreted('ad02-rollback')
    f.script.push(rollback)
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    expect(f.sent).toHaveLength(2)
    expect(f.sent[1]?.observation).toEqual(f.sent[0]?.observation)
    expect(logOperations(f.s)).toEqual([f.sent[1]?.observation.operation])
  })

  it('rollbacks one after the other are tried again until the commit goes through', async () => {
    const f = await interpreted('ad02-rollbacks')
    for (let n = 0; n < 6; n += 1) f.script.push(rollback)
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    expect(f.sent).toHaveLength(7)
    expect(logOperations(f.s)).toHaveLength(1)
  })

  it('an event that comes during the backoff is not held behind it: the queue goes on and commits', async () => {
    const f = await interpreted('ad02-rollback-queue', {
      retry: { initialMs: 60_000, multiplier: 2, maxMs: 60_000 },
    })
    f.script.push(rollback)
    await started(f.s, f.c.journal())
    await vi.waitFor(() => expect(f.logged.some(line => /; again in /.test(line))).toBe(true), {
      timeout: 5000,
    })
    await f.c.ctx.serial(
      'session-adapters/agent-published',
      f.target.tenant,
      f.target.session,
      f.target.execution,
    )
    await reaches(f.s, '1')
    expect(f.sent).toHaveLength(2)
    expect(logOperations(f.s)).toEqual([f.sent[1]?.observation.operation])
  })

  it('a plugin that stops during the backoff sends no more', async () => {
    const f = await interpreted('ad02-rollback-stop')
    for (let n = 0; n < 1000; n += 1) f.script.push(rollback)
    await started(f.s, f.c.journal())
    await vi.waitFor(() => expect(f.sent.length).toBeGreaterThan(2), { timeout: 5000 })
    await f.fiber?.dispose()
    const sent = f.sent.length
    await settle()
    expect(f.sent.length).toBeLessThanOrEqual(sent + 1)
    const after = f.sent.length
    await settle()
    expect(f.sent).toHaveLength(after)
    expect(await readThrough(f.s)).toBe('0')
  })
})

describe('an event that Session can never take', () => {
  const gone: SessionFailure = {
    kind: 'quarantined',
    diagnostic: 'control.pending.registration: required original material is missing',
  }
  const terminalOf = async (s: SqlScene) => {
    const { run } = await work(s)
    return run.kind === 'terminal' ? run.terminal : null
  }

  it.each<readonly [string, SessionFailure, string]>([
    ['material that is gone for good', gone, `quarantined ${gone.diagnostic}`],
    [
      'consequences Session refuses as invalid',
      { kind: 'invalid', field: 'consequences', reason: 'not the original order' },
      'invalid consequences not the original order',
    ],
  ])(
    '%s: it is not sent again and the Run closes as uninterpretable, with the answer as its cause',
    async (_name, failure, cause) => {
      const f = await interpreted('ad02-uninterpretable')
      for (let n = 0; n < 4; n += 1) f.script.push(async () => fail(failure))
      await started(f.s, f.c.journal())
      await vi.waitFor(async () => expect(await terminalOf(f.s)).not.toBeNull(), { timeout: 5000 })
      const terminal = await terminalOf(f.s)
      expect(terminal).toMatchObject({ outcome: 'failed' })
      expect(terminal?.evidence.record).toBe(`uninterpretable: ${cause}`)
      await settle()
      expect(f.sent).toHaveLength(1)
      expect(f.logged.filter(line => /; again in /.test(line))).toEqual([])
      // Whatever wakes the interpretation of this execution again finds it said: nothing is sent or logged twice.
      const said = f.logged.length
      for (let n = 0; n < 3; n += 1)
        await f.c.ctx.serial(
          'session-adapters/agent-published',
          f.target.tenant,
          f.target.session,
          f.target.execution,
        )
      await settle()
      expect(f.sent).toHaveLength(1)
      expect(f.logged).toHaveLength(said)
    },
  )

  it('a Run that already ended is left as it ended: the event is not sent again and nothing more is closed', async () => {
    const f = await interpreted('ad02-uninterpretable-ended')
    f.script.push(async (inner, input) => {
      ok(
        await f.s.port.commit({
          access: f.s.sessionAccess,
          command: {
            kind: 'control',
            input: {
              ...f.s.sessionAccess,
              operation: operationId('cancel-before-close'),
              intent: { kind: 'cancel-run', run: input.observation.run, urgency: 'force' },
            },
          },
          guards: [],
        }),
      )
      return fail(gone)
    })
    await started(f.s, f.c.journal())
    await vi.waitFor(async () => expect(await terminalOf(f.s)).not.toBeNull(), { timeout: 5000 })
    await settle()
    expect(await terminalOf(f.s)).toMatchObject({ outcome: 'cancelled' })
    expect(f.sent).toHaveLength(1)
  })

  it('the Run that another execution drives is left alone: only the Run of this execution is closed', async () => {
    const f = await interpreted('ad02-uninterpretable-other')
    f.script.push(async () => {
      f.shown.work = snapshot =>
        snapshot.run.kind !== 'active'
          ? snapshot
          : {
              ...snapshot,
              run: {
                ...snapshot.run,
                execution: {
                  ...snapshot.run.execution,
                  execution: `${f.s.execution}-later` as typeof f.s.execution,
                },
              },
            }
      return fail(gone)
    })
    await started(f.s, f.c.journal())
    await vi.waitFor(() => expect(f.logged.some(line => line.includes(gone.diagnostic))).toBe(true))
    await settle()
    expect((await work(f.s)).run.kind).toBe('active')
    expect(f.sent).toHaveLength(1)
  })

  it('the next Run starts and takes the input along: Session owes no reading to the execution it closed', async () => {
    const f = await interpreted('ad02-uninterpretable-successor')
    f.script.push(async () => fail(gone))
    await started(f.s, f.c.journal())
    await vi.waitFor(async () => expect(await terminalOf(f.s)).not.toBeNull(), { timeout: 5000 })
    const left = (await work(f.s)).pending
    expect(left).toHaveLength(1)
    const next = await nextRun(f.s, 2)
    expect(next.execution).not.toBe(f.s.execution)
    const { run } = await work(f.s)
    expect(run.kind === 'active' ? run.initial.slice(0, 1) : null).toEqual(left)
    const journal = f.c.journal()
    const opened = ok(await journal.open(next.openInput))
    ok(await handed(next, String(next.initial.id), opened.receipt.evidence, 'again'))
    await take(next, journal)
    await vi.waitFor(async () => expect(await readThroughOf2(f.s, next.execution)).toBe('1'), {
      timeout: 5000,
    })
    expect((await work(f.s)).taken).toEqual(left)
  })

  it('the close that meets a change comes again: the event is sent once more and the Run closes', async () => {
    const f = await interpreted('ad02-uninterpretable-changed')
    for (let n = 0; n < 4; n += 1) f.script.push(async () => fail(gone))
    const { port } = f.s
    let closes = 0
    const commit = (async (request: Parameters<typeof port.commit>[0]) => {
      if (request.command.kind !== 'finishRun') return port.commit(request)
      closes += 1
      return closes === 1 ? fail({ kind: 'changed', revision: '0' }) : port.commit(request)
    }) as typeof port.commit
    f.s.port = { ...port, commit }
    await started(f.s, f.c.journal())
    await vi.waitFor(async () => expect(await terminalOf(f.s)).not.toBeNull(), { timeout: 5000 })
    expect(await terminalOf(f.s)).toMatchObject({ outcome: 'failed' })
    expect(closes).toBe(2)
    expect(f.sent).toHaveLength(2)
  })
})

describe('the backoff of the event queue and its one retry per execution (#1216 E1a)', () => {
  const rollback = async () =>
    fail<SessionFailure>({
      kind: 'unavailable',
      owner: 'session-storage-sql',
      diagnostic: 'rolled back',
    })
  const retries = (logged: readonly string[]) =>
    logged.flatMap(line => {
      const found =
        /^call (\d+) of the interpretation of .* answered (\S+)(?: \(.+\))?; again in (\S+) ms$/.exec(
          line,
        )
      return found === null ? [] : [[Number(found[1]), found[2], found[3]]]
    })

  it('a backoff outside 0 < initialMs <= maxMs < infinity with multiplier >= 1 is refused when the plugin is made', () => {
    const made = (retry: { initialMs: number; multiplier: number; maxMs: number }) => () =>
      createSessionJournalInterpretationPlugin<string>({
        coordinator: async () => succeed('coordinator'),
        retry,
      })
    for (const retry of [
      { initialMs: 0, multiplier: 2, maxMs: 10 },
      { initialMs: Number.NaN, multiplier: 2, maxMs: 10 },
      { initialMs: 1, multiplier: 0.99, maxMs: 10 },
      { initialMs: 10, multiplier: 2, maxMs: 9 },
      { initialMs: 1, multiplier: 2, maxMs: Number.POSITIVE_INFINITY },
    ])
      expect(made(retry), JSON.stringify(retry)).toThrow(
        new RangeError(
          'the journal interpretation retry needs 0 < initialMs <= maxMs and multiplier >= 1',
        ),
      )
    expect(made({ initialMs: 1, multiplier: 1, maxMs: 1 })).not.toThrow()
    expect(made({ initialMs: 0.5, multiplier: 3, maxMs: 0.5 })).not.toThrow()
    expect(() =>
      createSessionJournalInterpretationPlugin<string>({ coordinator: async () => succeed('c') }),
    ).not.toThrow()
    expect(DEFAULT_JOURNAL_INTERPRETATION_RETRY).toEqual({
      initialMs: 50,
      multiplier: 2,
      maxMs: 5000,
    })
  })

  it('every call again waits: the first for initialMs, then the waits grow by the multiplier up to maxMs, and the calls are counted', async () => {
    const f = await interpreted('ad02-backoff', {
      retry: { initialMs: 1, multiplier: 3, maxMs: 5 },
    })
    for (let n = 0; n < 4; n += 1) f.script.push(rollback)
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    expect(retries(f.logged)).toEqual([
      [1, 'unavailable', '1'],
      [2, 'unavailable', '3'],
      [3, 'unavailable', '5'],
      [4, 'unavailable', '5'],
    ])
    // An unavailable answer says who could not answer and why: a stuck execution is not a busy one.
    expect(f.logged.find(line => line.startsWith('call 1 of'))).toMatch(
      /answered unavailable \(\S+: .+\); again in 1 ms$/,
    )
  })

  it('a call whose outcome stays unknown after its sends is made again, and the event commits once', async () => {
    const f = await interpreted('ad02-unknown')
    const lost = async () => {
      throw new Error('the reply was lost')
    }
    for (let n = 0; n < 3; n += 1) f.script.push(lost)
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    expect(f.sent).toHaveLength(4)
    expect(new Set(f.sent.map(item => item.observation.operation)).size).toBe(1)
    expect(retries(f.logged)).toEqual([[1, 'commit-unknown', '1']])
    expect(logOperations(f.s)).toHaveLength(1)
  })

  it('an execution has one retry waiting: a failure while it waits leaves the retry to it, even after a commit in between', async () => {
    const f = await interpreted('ad02-one-retry', {
      retry: { initialMs: 60_000, multiplier: 2, maxMs: 60_000 },
    })
    const publish = () =>
      f.c.ctx.serial(
        'session-adapters/agent-published',
        f.target.tenant,
        f.target.session,
        f.target.execution,
      )
    f.script.push(rollback)
    await started(f.s, f.c.journal())
    await vi.waitFor(() => expect(retries(f.logged)).toHaveLength(1), { timeout: 5000 })
    f.script.push(rollback)
    await publish()
    await vi.waitFor(() => expect(f.sent).toHaveLength(2), { timeout: 5000 })
    await publish()
    await reaches(f.s, '1')
    f.script.push(rollback)
    await round(f.s, f.c.journal(), 1)
    await vi.waitFor(() => expect(f.sent).toHaveLength(4), { timeout: 5000 })
    await settle()
    expect(retries(f.logged)).toHaveLength(1)
    expect(await readThrough(f.s)).toBe('1')
  })

  it('once a retry committed, a later failure of the execution gets a retry of its own', async () => {
    const f = await interpreted('ad02-retry-again')
    f.script.push(rollback)
    await started(f.s, f.c.journal())
    await reaches(f.s, '1')
    f.script.push(rollback)
    await round(f.s, f.c.journal(), 1)
    await reaches(f.s, '3')
    expect(retries(f.logged).map(([calls]) => calls)).toEqual([1, 1])
  })

  it('a stop ends the timer of the backoff at once', async () => {
    const f = await interpreted('ad02-stop-timer', {
      retry: { initialMs: 60_000, multiplier: 2, maxMs: 60_000 },
    })
    f.script.push(rollback)
    await started(f.s, f.c.journal())
    await vi.waitFor(() => expect(retries(f.logged)).toHaveLength(1), { timeout: 5000 })
    const timers = () => process.getActiveResourcesInfo().filter(kind => kind === 'Timeout').length
    const waiting = timers()
    await f.fiber?.dispose()
    expect(timers()).toBeLessThan(waiting)
  })

  it('a call that ends without a retry logs what it left: a refusal, or events with no decided consequences', async () => {
    const f = await interpreted('ad02-ends')
    f.script.push(async () => fail<SessionFailure>({ kind: 'denied', action: 'commitLog' }))
    await started(f.s, f.c.journal())
    await vi.waitFor(() => expect(f.logged).toHaveLength(1), { timeout: 5000 })
    expect(f.logged[0]).toBe(`the interpretation of ${f.s.execution} answered denied`)
    await f.c.ctx.serial(
      'session-adapters/agent-published',
      f.target.tenant,
      f.target.session,
      f.target.execution,
    )
    await reaches(f.s, '1')
    expect(f.logged).toHaveLength(1)
    f.heads.undecided = true
    await round(f.s, f.c.journal(), 1)
    await vi.waitFor(() => expect(f.logged).toHaveLength(3), { timeout: 5000 })
    expect(f.logged.slice(1)).toEqual([
      `1 events of ${f.s.execution} have no decided consequences`,
      `2 events of ${f.s.execution} have no decided consequences`,
    ])
    expect(await readThrough(f.s)).toBe('1')
  })
})

describe('what commits nothing', () => {
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

  it('an event that reaches the listener after the plugin stopped starts no interpretation', async () => {
    const f = await interpreted('ad02-late-event', { plugin: 'later' })
    let release: () => void = () => undefined
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    f.c.ctx.on('session-adapters/agent-published', () => held)
    const fiber = await f.mountPlugin()
    await started(f.s, f.c.journal())
    await settle()
    const reads = stateReads(f.s)
    f.sent.length = 0
    const dispatched = f.c.ctx.serial(
      'session-adapters/agent-published',
      f.target.tenant,
      f.target.session,
      f.target.execution,
    )
    await fiber.dispose()
    release()
    await dispatched
    await settle()
    expect(stateReads(f.s)).toBe(reads)
    expect(f.sent).toHaveLength(0)
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

describe('with the production Journal: a cancelled Run with a non-observed tail', () => {
  it('the next startRun answers unavailable until the plugin committed the tail, then passes', async () => {
    const f = await interpreted('ad02-r2d28')
    const journal = f.c.journal()
    await started(f.s, journal)
    await reaches(f.s, '1')
    const { input, receipt } = await submitted(f.s, journal, 'two')
    ok(await handed(f.s, String(input.id), receipt.evidence))
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

describe('commits per round do not grow with the rounds before it', () => {
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

describe('interprets the control events of a Session cancel (deferred control facts)', () => {
  type Progress = Readonly<{ state: string; pending: number }> | null
  const stages = ['intent-established', 'qualification-revoked'] as const

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

  async function production(name: string) {
    const f = await interpreted(name)
    const journal = f.c.journal()
    await started(f.s, journal)
    await reaches(f.s, '1')
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
        checkpoint: { ...m.checkpoint, inputBatch: page.batch },
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
    const output = ok(
      await f.c
        .journal()
        .output.read({ ...f.s.access, execution: f.s.execution, after: null, limit: 10 }),
    )
    expect(JSON.stringify(output)).toContain('round 1')
    ok(await startRun(f.s, 'start-after-cancel'))
  })

  it('the memory double and the production interpretation plugin give the same progress of K, the one Session decides', async () => {
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

describe('a session with earlier Runs: the bytes of one Run do not grow with the Runs before it', () => {
  async function runs(count: number) {
    const f = await interpreted('ad02-runs')
    const journal = f.c.journal()
    const other = f.s.view.journal
    const perRun: { written: number; read: number }[] = []
    const executions: SqlScene['execution'][] = []
    let where: SqlScene = f.s
    for (let k = 1; k <= count; k += 1) {
      const mark = { written: f.bytes.written.length, read: f.bytes.read.length }
      const opened = ok(await journal.open(k === 1 ? f.s.openInput : (where as SqlScene).openInput))
      ok(await handed(where, String(where.initial.id), opened.receipt.evidence))
      await take(where, journal)
      await committed(where, other, `run-${k}-message`, [
        { kind: 'message', message: assistantMessage(`run ${k}`), source: evidence(`run-${k}`) },
      ])
      const waits = [dependency(`run-${k}`)]
      await committed(where, journal, `run-${k}-waiting`, [{ kind: 'waiting', waits }], waits)
      await vi.waitFor(async () => expect(await readThroughOf2(f.s, where.execution)).toBe('3'), {
        timeout: 5000,
      })
      perRun.push({
        written: Math.max(...f.bytes.written.slice(mark.written)),
        read: f.bytes.read.slice(mark.read).reduce((sum, size) => sum + size, 0),
      })
      executions.push(where.execution)
      if (k === count) break
      where = await nextRun(f.s, k + 1)
    }
    return { perRun, executions, journal, s: f.s }
  }

  it(
    'the largest write and the Agent records read in Run 4 equal those of Run 2',
    { timeout: 60_000 },
    async () => {
      const { perRun } = await runs(4)
      expect(perRun[3]!.written).toBeLessThanOrEqual(perRun[1]!.written + 64)
      expect(perRun[3]!.read).toBeLessThanOrEqual(perRun[1]!.read + 1024)
    },
  )

  it(
    'a copy rebuilt from the facts loads every execution as the copy that wrote them',
    { timeout: 60_000 },
    async () => {
      const { executions, journal, s } = await runs(3)
      const fresh = s.fresh().journal
      for (const execution of executions)
        expect(await fresh.load({ ...s.access, execution })).toEqual(
          await journal.load({ ...s.access, execution }),
        )
    },
  )
})

async function readThroughOf2(s: SqlScene, execution: string): Promise<string | undefined> {
  const snapshot = await work(s)
  if (snapshot.run.kind === 'active' && snapshot.run.execution.execution === execution)
    return snapshot.run.execution.readThrough
  return readThroughOf(snapshot, execution)
}
