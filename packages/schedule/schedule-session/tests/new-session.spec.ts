import { describe, expect, it } from 'vitest'
import type { GoalOutcome } from '@omne-harness/goal-contract'
import { endOf, identitiesOf, issuesText } from '@omne-harness/schedule-session'
import { DRAFT, jobOf, OWNER, TENANT, workOf, world } from './world.ts'

const SYSTEM = { kind: 'system', systemScopeRef: 'fleet' } as const
const WITH_WORKSPACE = {
  ...(workOf() as { session: object }).session,
  workspace: { workspaceRef: 'w', instanceRef: 'i', basisRef: 'b' },
}
const EXISTING = { session: { mode: 'existing', sessionRef: 'session-9' } }
const NO_EVIDENCE = { ...DRAFT, criteria: [{ statement: '写完了', evidence: { kind: 'person' } }] }

describe('the identities of a Job', () => {
  it('derives the session and its operations from the tenant and the Job: again the same, another Job or tenant others', () => {
    const one = identitiesOf(jobOf())
    expect(one).toEqual(identitiesOf(jobOf()))
    expect(one).toMatchObject({
      tenant: TENANT,
      goal: 'schedule-job:job-1',
      by: 'schedule-job:job-1',
    })
    expect(one?.session).toMatch(/^[0-9a-f]{64}$/u)
    expect(one?.create).toMatch(/^sop_[0-9a-f]{64}$/u)
    expect(one?.stop).toMatch(/^sop_[0-9a-f]{64}$/u)
    const other = identitiesOf(jobOf({ jobId: 'job-2' as never }))
    const elsewhere = identitiesOf(
      jobOf({ owner: { ...jobOf().owner, tenantId: 'tenant-2' } as never }),
    )
    const all = [one, other, elsewhere].flatMap(ids => [ids?.session, ids?.create, ids?.stop])
    expect(new Set(all).size).toBe(9)
    expect(identitiesOf(jobOf({ owner: SYSTEM }))).toBeNull()
  })
})

describe('whether work stands, asked before it is saved', () => {
  it('takes a goal body that stands for a session nobody attends', async () => {
    expect(await world().executor.accepts?.(workOf(), OWNER)).toEqual({ kind: 'accepted' })
  })

  it.each([
    [
      'evidence only a person can give',
      { instruction: NO_EVIDENCE },
      /^instruction: A1\.evidence: /u,
    ],
    [
      'a member no goal body has',
      { instruction: { ...DRAFT, bogus: 1 } },
      /^instruction: bogus: /u,
    ],
    ['a session that exists', EXISTING, /new session only/u],
    [
      'materials',
      { materials: [{ resourceRef: 'r', versionRef: 'v' }] },
      /materials are not carried/u,
    ],
  ])('refuses %s, saying what is wrong', async (_, change, reason) => {
    const answer = await world().executor.accepts?.(workOf(change), OWNER)
    expect(answer).toMatchObject({ kind: 'refused' })
    expect(answer?.kind === 'refused' && answer.reason).toMatch(reason)
  })

  const EXAMINED = {
    ...DRAFT,
    criteria: [
      { statement: '能走一局', evidence: { kind: 'examination', method: '用 node 走一局' } },
    ],
  }
  const RERUN = {
    ...DRAFT,
    criteria: [{ statement: '验收过', evidence: { kind: 'rerun', command: 'node accept.js' } }],
  }

  it('judges the goal by what the settings of the owning tenant let the goal of a job wait for: by default a command run again stands and an examination does not, and the refusal names the entry and the field', async () => {
    const w = world()
    expect(await w.executor.accepts?.(workOf({ instruction: RERUN }), OWNER)).toEqual({
      kind: 'accepted',
    })
    expect(await w.executor.accepts?.(workOf({ instruction: EXAMINED }), OWNER)).toEqual({
      kind: 'refused',
      reason:
        'instruction: A1.evidence: the settings of this tenant do not let the goal of a job use an examination: it costs model calls',
    })
    expect(w.askedRules).toEqual([TENANT, TENANT])
    w.hooks.rules = { kind: 'read', value: { maxExaminations: 3, job: 'all' } }
    expect(await w.executor.accepts?.(workOf({ instruction: EXAMINED }), OWNER)).toEqual({
      kind: 'accepted',
    })
    w.hooks.rules = { kind: 'read', value: { maxExaminations: 3, job: 'none' } }
    expect(await w.executor.accepts?.(workOf({ instruction: RERUN }), OWNER)).toMatchObject({
      kind: 'refused',
    })
  })

  it('does not accept work while the settings cannot be read, and does not ask them for work it refuses as written or for an owner that is no tenant', async () => {
    const w = world()
    for (const rules of [{ kind: 'unavailable' } as const, new Error('down')]) {
      w.hooks.rules = rules
      expect(await w.executor.accepts?.(workOf(), OWNER)).toEqual({
        kind: 'unknown',
        reason: 'the settings of goals cannot be read now',
      })
    }
    expect(w.askedRules).toHaveLength(2)
    const materials = workOf({ materials: [{ resourceRef: 'r', versionRef: 'v' }] })
    expect(await w.executor.accepts?.(materials, OWNER)).toMatchObject({ kind: 'refused' })
    const system = { kind: 'system', systemScopeRef: 'system:maintenance' } as const
    expect(await w.executor.accepts?.(workOf({ instruction: EXAMINED }), system)).toEqual({
      kind: 'accepted',
    })
    expect(w.askedRules).toHaveLength(2)
  })
})

it('writes what is wrong with a body one clause an entry, the entry before its field', () => {
  expect(
    issuesText([
      { entry: 'A1', field: 'evidence', problem: '要有证据' },
      { entry: null, field: 'purpose', problem: '不能为空' },
    ]),
  ).toBe('A1.evidence: 要有证据; purpose: 不能为空')
})

describe('check', () => {
  it('is ready when the body stands and the Agent definition is there', async () => {
    expect(await world().executor.check(jobOf())).toEqual({ kind: 'ready' })
  })

  it.each([
    ['a Job of no tenant', { owner: SYSTEM }],
    ['work for a session that exists', { work: workOf(EXISTING) }],
    ['a body that does not stand', { work: workOf({ instruction: NO_EVIDENCE }) }],
  ])('answers unsupported for %s, and reads no definition', async (_, change) => {
    const w = world()
    w.faults.definition = true
    expect(await w.executor.check(jobOf(change))).toMatchObject({ kind: 'unsupported' })
  })

  it('answers unavailable when the tenant has no such definition, unknown when it cannot be read', async () => {
    const w = world()
    w.definitions.clear()
    expect(await w.executor.check(jobOf())).toEqual({
      kind: 'unavailable',
      reason: 'the tenant has no Agent definition coding',
    })
    w.faults.definition = true
    expect(await w.executor.check(jobOf())).toMatchObject({ kind: 'unknown' })
  })
})

describe('start', () => {
  it('creates the session of the Job, sets the goal the Job carries as its owner, and answers the session as the execution', async () => {
    const w = world()
    const ids = identitiesOf(jobOf())
    expect(await w.executor.start(jobOf())).toEqual({
      kind: 'started',
      executionRef: ids?.session,
      running: false,
    })
    expect(w.made).toEqual([
      {
        tenant: TENANT,
        session: ids?.session,
        operation: ids?.create,
        creation: {
          agent: 'coding',
          modes: {
            permission: 'never',
            environmentAdoptionRef: 'adoption:1',
            collaboration: 'auto-drive',
          },
          workspace: null,
        },
      },
    ])
    const goal = await w.goal()
    expect(goal?.state).toMatchObject({ status: 'active', attendance: 'unattended', generation: 1 })
    expect(goal?.body.purpose).toBe(DRAFT.purpose)
    expect(goal?.history).toMatchObject([
      { via: 'direct', draftedBy: 'creator', confirmedBy: ids?.by, operation: ids?.goal },
    ])
    expect(w.goalSessions.woken).toMatchObject([{ session: ids?.session, kind: 'start' }])
  })

  it('creates the session with the workspace the work names', async () => {
    const w = world()
    const job = jobOf({ work: workOf({ session: WITH_WORKSPACE }) })
    expect(await w.executor.accepts?.(job.work, OWNER)).toEqual({ kind: 'accepted' })
    expect(await w.executor.start(job)).toMatchObject({ kind: 'started' })
    expect(w.made).toMatchObject([
      { creation: { workspace: { workspaceRef: 'w', instanceRef: 'i', basisRef: 'b' } } },
    ])
  })

  it('asked again, recalls the session and the goal: nothing is created or set a second time', async () => {
    const w = world()
    await w.executor.start(jobOf())
    const before = await w.goal()
    w.move({ run: 'run-1' })
    expect(await w.executor.start(jobOf())).toEqual({
      kind: 'started',
      executionRef: w.session(),
      running: true,
    })
    expect(await w.goal()).toEqual(before)
    expect(w.store.rows(TENANT)).toHaveLength(1)
    expect(w.goalSessions.woken).toHaveLength(1)
  })

  it('recalls after the goal ended too: the execution that ended is not opened again', async () => {
    const w = world()
    await w.executor.start(jobOf())
    await w.settle({ kind: 'cancel' })
    expect(await w.executor.start(jobOf())).toMatchObject({ kind: 'started', running: false })
    expect((await w.goal())?.state).toMatchObject({ status: 'settled', generation: 1 })
  })

  it.each([
    ['a Job of no tenant', { owner: SYSTEM }],
    ['a body that does not stand', { work: workOf({ instruction: NO_EVIDENCE }) }],
  ])('does not start %s, and never will: no session is created', async (_, change) => {
    const w = world()
    expect(await w.executor.start(jobOf(change))).toMatchObject({
      kind: 'notStarted',
      recoverable: false,
    })
    expect(w.made).toEqual([])
  })

  it.each([true, false])(
    'does not start when the session is refused (recoverable: %s), with the reason given, and sets no goal',
    async recoverable => {
      const w = world()
      w.faults.create = { kind: 'refused', recoverable, reason: 'denied' }
      expect(await w.executor.start(jobOf())).toEqual({
        kind: 'notStarted',
        recoverable,
        reason: 'denied',
      })
      expect(w.store.rows(TENANT)).toEqual([])
    },
  )

  it('answers unknown when it is not known whether the session was created, and sets no goal', async () => {
    const w = world()
    w.faults.create = { kind: 'unknown' }
    expect(await w.executor.start(jobOf())).toMatchObject({ kind: 'unknown' })
    expect(w.store.rows(TENANT)).toEqual([])
  })

  it('answers unknown when the goal may or may not be set; asked again it sets the goal once', async () => {
    const w = world()
    w.store.failNext('unknown-after-commit')
    expect(await w.executor.start(jobOf())).toMatchObject({ kind: 'unknown' })
    expect(await w.executor.inspect(jobOf())).not.toMatchObject({ kind: 'notStarted' })
    expect(await w.executor.start(jobOf())).toMatchObject({ kind: 'started' })
    expect(w.store.rows(TENANT)).toHaveLength(1)
    expect((await w.goal())?.state.generation).toBe(1)
  })

  it('does not start when Goal refuses the goal, saying why', async () => {
    const w = world()
    w.authority.answer('denied')
    expect(await w.executor.start(jobOf())).toEqual({
      kind: 'notStarted',
      recoverable: false,
      reason: 'goal: denied',
    })
  })
})

describe('inspect', () => {
  async function started() {
    const w = world()
    await w.executor.start(jobOf())
    w.move({ run: 'run-1', pending: 0 })
    return w
  }
  const execution = (w: ReturnType<typeof world>) => ({ executionRef: w.session() })

  it('answers not started, to be tried again, when the session of the Job does not exist', async () => {
    expect(await world().executor.inspect(jobOf())).toMatchObject({
      kind: 'notStarted',
      recoverable: true,
    })
  })

  it('answers not started, to be started again, when the session is there and the goal is not set: the next start sets it', async () => {
    const w = world()
    w.authority.answer(action => (action === 'set' ? 'unavailable' : 'permitted'))
    expect(await w.executor.start(jobOf())).toMatchObject({ kind: 'unknown' })
    expect(await w.executor.inspect(jobOf())).toEqual({
      kind: 'notStarted',
      recoverable: true,
      reason: 'the goal of the Job is not set',
    })
    w.authority.answer('permitted')
    expect(await w.executor.start(jobOf())).toMatchObject({ kind: 'started' })
    expect(w.made).toHaveLength(2)
    expect(await w.executor.inspect(jobOf())).toEqual({ kind: 'running', ...execution(w) })
  })

  it.each([
    ['a run is going', { run: 'run-1', pending: 0, background: 0 }],
    ['an input waits', { run: null, pending: 1, background: 0 }],
    ['a call is in the background', { run: null, pending: 0, background: 1 }],
  ])('answers running while the goal is in progress and %s', async (_, change) => {
    const w = await started()
    w.move(change)
    expect(await w.executor.inspect(jobOf())).toEqual({ kind: 'running', ...execution(w) })
    expect((await w.goal())?.state.status).toBe('active')
  })

  it('answers running while the goal still owes its session the reminder, though the session is quiet', async () => {
    const w = world()
    w.goalSessions.sendNext('unknown')
    await w.executor.start(jobOf())
    expect((await w.goal())?.wake).not.toBeNull()
    expect(await w.executor.inspect(jobOf())).toEqual({ kind: 'running', ...execution(w) })
    expect((await w.goal())?.state.status).toBe('active')
  })

  it('aborts the goal when the session went quiet without the goal ending, and fails the Job as aborted', async () => {
    const w = await started()
    w.move({ run: null })
    expect(await w.executor.inspect(jobOf())).toEqual({
      kind: 'ended',
      report: 'failed',
      result: false,
      reason: 'aborted',
    })
    expect((await w.goal())?.state).toMatchObject({
      status: 'settled',
      outcome: { kind: 'aborted' },
    })
  })

  it('keeps running after the goal ended while a call is still in the background: the Job is settled when the session is quiet', async () => {
    const w = await started()
    w.ended({ kind: 'exit', exit: 'X2', counts: 'success' })
    w.move({ run: null, background: 1 })
    expect(await w.executor.inspect(jobOf())).toEqual({ kind: 'running', ...execution(w) })
    w.move({ background: 0 })
    expect(await w.executor.inspect(jobOf())).toEqual({
      kind: 'ended',
      report: 'succeeded',
      result: true,
      reason: 'exit:X2',
    })
  })

  it.each([
    [{ kind: 'cancel' }, { report: 'stopped', result: false, reason: 'cancelled' }],
    [{ kind: 'abort' }, { report: 'failed', result: false, reason: 'aborted' }],
  ] as const)('ends by the end of the goal: %j', async (command, end) => {
    const w = await started()
    await w.settle(command)
    w.move({ run: null })
    expect(await w.executor.inspect(jobOf())).toEqual({ kind: 'ended', ...end })
  })

  it('ends as failed by an exit written as failure, and settles nothing itself', async () => {
    const w = await started()
    w.ended({ kind: 'exit', exit: 'X1', counts: 'failure' })
    w.move({ run: null })
    expect(await w.executor.inspect(jobOf())).toEqual({
      kind: 'ended',
      report: 'failed',
      result: false,
      reason: 'exit:X1',
    })
    expect(w.store.rows(TENANT)[0]?.state.status).toBe('active')
  })

  it.each([
    [{ kind: 'achieved' }, { report: 'succeeded', result: true, reason: 'achieved' }],
    [
      { kind: 'exit', exit: 'X3', counts: 'success' },
      { report: 'succeeded', result: true, reason: 'exit:X3' },
    ],
    [
      { kind: 'exit', exit: 'X1', counts: 'failure' },
      { report: 'failed', result: false, reason: 'exit:X1' },
    ],
    [{ kind: 'unattainable' }, { report: 'failed', result: false, reason: 'unattainable' }],
    [{ kind: 'stalled' }, { report: 'failed', result: false, reason: 'stalled' }],
    [
      { kind: 'judge-unavailable' },
      { report: 'failed', result: false, reason: 'judge-unavailable' },
    ],
    [{ kind: 'aborted' }, { report: 'failed', result: false, reason: 'aborted' }],
    [{ kind: 'cancelled' }, { report: 'stopped', result: false, reason: 'cancelled' }],
  ] as const)('reads the outcome %j of a goal as the end of its Job', (outcome, end) => {
    expect(endOf(outcome as GoalOutcome)).toEqual({ kind: 'ended', ...end })
  })

  it('answers unknown, and settles nothing, when the session or the goal cannot be read', async () => {
    const w = await started()
    w.move({ run: null })
    w.faults.standing = true
    expect(await w.executor.inspect(jobOf())).toMatchObject({ kind: 'unknown' })
    w.faults.standing = false
    w.store.readable(false)
    expect(await w.executor.inspect(jobOf())).toMatchObject({ kind: 'unknown' })
    w.store.readable(true)
    expect((await w.goal())?.state.status).toBe('active')
  })

  it('answers unknown when the abort may or may not have stood, and the end on the next reading', async () => {
    const w = await started()
    w.move({ run: null })
    w.store.failNext('unknown-after-commit')
    expect(await w.executor.inspect(jobOf())).toMatchObject({ kind: 'unknown' })
    expect(await w.executor.inspect(jobOf())).toMatchObject({ kind: 'ended', reason: 'aborted' })
  })

  it('touches nothing of a goal this Job did not set: not started while its own was never set, unknown once it was', async () => {
    const w = world()
    w.authority.answer(action => (action === 'set' ? 'unavailable' : 'permitted'))
    await w.executor.start(jobOf())
    w.authority.answer('permitted')
    await w.goals.write(
      { tenant: TENANT, subject: 'other' },
      {
        session: w.session(),
        operation: 'another',
        proposal: { kind: 'set', draft: DRAFT },
        words: null,
        draftedBy: 'creator',
        by: 'someone',
      },
    )
    expect(await w.executor.inspect(jobOf())).toMatchObject({
      kind: 'notStarted',
      recoverable: true,
    })
    const begun = jobOf({ executionRef: w.session() })
    expect(await w.executor.inspect(begun)).toMatchObject({ kind: 'unknown' })
    expect(await w.executor.requestStop(jobOf(), 'graceful')).toEqual({ kind: 'confirmed' })
    expect((await w.goal())?.state.status).toBe('active')
    expect(w.stopped).toEqual([])
  })

  it('answers not started for a Job this path never carries', async () => {
    expect(await world().executor.inspect(jobOf({ owner: SYSTEM }))).toMatchObject({
      kind: 'notStarted',
      recoverable: false,
    })
  })
})

describe('requestStop', () => {
  it('confirms when there is nothing to stop: no tenant, no session, no goal', async () => {
    const w = world()
    expect(await w.executor.requestStop(jobOf({ owner: SYSTEM }), 'graceful')).toEqual({
      kind: 'confirmed',
    })
    expect(await w.executor.requestStop(jobOf(), 'graceful')).toEqual({ kind: 'confirmed' })
    w.authority.answer(action => (action === 'set' ? 'unavailable' : 'permitted'))
    await w.executor.start(jobOf())
    expect(await w.executor.requestStop(jobOf(), 'graceful')).toEqual({ kind: 'confirmed' })
  })

  it.each(['graceful', 'forced'] as const)(
    'cancels the goal and asks the run going to stop (%s), under the stop operation of the Job',
    async urgency => {
      const w = world()
      await w.executor.start(jobOf())
      w.move({ run: 'run-1' })
      expect(await w.executor.requestStop(jobOf(), urgency)).toEqual({ kind: 'sent' })
      expect((await w.goal())?.state).toMatchObject({
        status: 'settled',
        outcome: { kind: 'cancelled' },
      })
      const ids = identitiesOf(jobOf())
      expect(w.stopped).toEqual([
        { tenant: TENANT, session: ids?.session, operation: ids?.stop, run: 'run-1', urgency },
      ])
    },
  )

  it('cancels the goal of a quiet session and stops no run; the Job then reads as stopped', async () => {
    const w = world()
    await w.executor.start(jobOf())
    w.move({ pending: 0 })
    expect(await w.executor.requestStop(jobOf(), 'graceful')).toEqual({ kind: 'sent' })
    expect(w.stopped).toEqual([])
    expect(await w.executor.inspect(jobOf())).toMatchObject({ kind: 'ended', report: 'stopped' })
    expect(await w.executor.requestStop(jobOf(), 'graceful')).toEqual({ kind: 'confirmed' })
  })

  it('after the goal ended it only asks a run going to stop, and waits for the calls in the background', async () => {
    const w = world()
    await w.executor.start(jobOf())
    w.ended({ kind: 'achieved' })
    w.move({ run: 'run-2' })
    expect(await w.executor.requestStop(jobOf(), 'forced')).toEqual({ kind: 'sent' })
    expect(w.stopped).toHaveLength(1)
    w.move({ run: null, background: 1 })
    expect(await w.executor.requestStop(jobOf(), 'forced')).toEqual({ kind: 'sent' })
    expect(w.stopped).toHaveLength(1)
    expect(w.store.rows(TENANT)[0]?.state.status).toBe('active')
  })

  it('answers unknown when the session cannot be read, the cancel may not have stood, or the stop may not have been asked', async () => {
    const w = world()
    await w.executor.start(jobOf())
    w.move({ run: 'run-1' })
    w.faults.standing = true
    expect(await w.executor.requestStop(jobOf(), 'graceful')).toMatchObject({ kind: 'unknown' })
    w.faults.standing = false
    w.store.failNext('unknown-before-commit')
    expect(await w.executor.requestStop(jobOf(), 'graceful')).toMatchObject({ kind: 'unknown' })
    expect(w.stopped).toEqual([])
    w.faults.stop = true
    expect(await w.executor.requestStop(jobOf(), 'graceful')).toMatchObject({ kind: 'unknown' })
    expect((await w.goal())?.state.status).toBe('settled')
  })
})

describe('describe', () => {
  it('reads what the execution left where it is kept: the definition adopted, how the goal ended, what it delivered', async () => {
    const w = world()
    await w.executor.start(jobOf())
    const since = (await w.goal())?.since
    expect(since).toMatch(/.+/u)
    expect(await w.executor.describe?.(jobOf())).toEqual({
      adopted: { name: 'coding', version: 'v7' },
      outcome: null,
      deliverables: [],
      since,
      run: null,
    })
    w.move({ run: 'run-1', pending: 0 })
    w.ran('run-1')
    expect(await w.executor.describe?.(jobOf())).toMatchObject({ since, run: 'run-1' })
    expect(w.asked.runs.at(-1)).toEqual({ tenant: TENANT, session: w.session(), moment: since })
    w.faults.runs = true
    expect(await w.executor.describe?.(jobOf())).toMatchObject({ since: null, run: null })
    w.faults.runs = 'throws'
    expect(await w.executor.describe?.(jobOf())).toMatchObject({ since: null, run: null })
    w.faults.runs = false
    w.startsAt(String(since))
    expect(await w.executor.describe?.(jobOf())).toMatchObject({ since: null, run: 'run-1' })
    w.startsAt('')
    const agent = { tenant: TENANT, subject: 'agent' }
    await w.goals.track(agent, { session: w.session(), patch: { deliverables: ['report.md'] } })
    w.ended({ kind: 'exit', exit: 'X2', counts: 'success' })
    expect(await w.executor.describe?.(jobOf())).toEqual({
      adopted: { name: 'coding', version: 'v7' },
      outcome: 'exit:X2',
      deliverables: ['report.md'],
      since,
      run: 'run-1',
    })
  })

  it('answers the session alone before the goal is set, and nothing of a goal this Job did not set', async () => {
    const w = world()
    w.authority.answer(action => (action === 'set' ? 'unavailable' : 'permitted'))
    await w.executor.start(jobOf())
    const bare = {
      adopted: { name: 'coding', version: 'v7' },
      outcome: null,
      deliverables: [],
      since: null,
      run: null,
    }
    expect(await w.executor.describe?.(jobOf())).toEqual(bare)
    w.authority.answer('permitted')
    await w.goals.write(
      { tenant: TENANT, subject: 'other' },
      {
        session: w.session(),
        operation: 'another',
        proposal: { kind: 'set', draft: DRAFT },
        words: null,
        draftedBy: 'creator',
        by: 'someone',
      },
    )
    await w.settle({ kind: 'cancel' })
    expect(await w.executor.describe?.(jobOf())).toEqual(bare)
  })

  it('answers null when there is nothing to read now: no tenant, no session, or the session cannot be read', async () => {
    const w = world()
    expect(await w.executor.describe?.(jobOf({ owner: SYSTEM }))).toBeNull()
    expect(await w.executor.describe?.(jobOf())).toBeNull()
    await w.executor.start(jobOf())
    w.faults.standing = true
    expect(await w.executor.describe?.(jobOf())).toBeNull()
  })
})
