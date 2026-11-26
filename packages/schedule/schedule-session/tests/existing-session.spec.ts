import { describe, expect, it } from 'vitest'
import { identitiesOf } from '@omne-harness/schedule-session'
import { DRAFT, jobOf, TENANT, workOf, world } from './world.ts'

const HERE = 'session-9'
const SYSTEM = { kind: 'system', systemScopeRef: 'fleet' } as const
const there = (sessionRef = HERE) => workOf({ session: { mode: 'existing', sessionRef } })
const job = (jobId = 'job-1', sessionRef = HERE) =>
  jobOf({ jobId: jobId as never, work: there(sessionRef) })
const ids = (jobId = 'job-1') => identitiesOf(job(jobId), HERE)
const OWNER = { tenant: TENANT, subject: 'owner' }
const NO_EVIDENCE = { ...DRAFT, criteria: [{ statement: '写完了', evidence: { kind: 'person' } }] }
const BUSY = 'the session is busy'
const HAS_GOAL = 'the session already has a goal in progress'

function opened(attendance: 'attended' | 'unattended' = 'attended') {
  const w = world()
  w.open(HERE, attendance)
  return w
}
/** A goal of the person of the session, live. */
const personGoal = (w: ReturnType<typeof world>) =>
  w.goals.write(OWNER, {
    session: HERE,
    operation: 'person-1',
    proposal: { kind: 'set', draft: { ...DRAFT, exits: [] } },
    words: '把周报写了',
    draftedBy: 'person',
    by: 'acc-1',
  })

describe('the identities of a Job in a session that exists', () => {
  it('names the session the work names; the goal and the stop are of the Job, so two Jobs in one session are told apart', () => {
    const one = ids('job-1')
    const two = ids('job-2')
    expect([one?.session, two?.session]).toEqual([HERE, HERE])
    expect(one?.goal).toBe('schedule-job:job-1')
    expect(two?.goal).toBe('schedule-job:job-2')
    expect(one?.stop).not.toBe(two?.stop)
  })
})

describe('whether work for a session that exists stands', () => {
  it('takes a goal body that stands for a goal nobody of the session owns', async () => {
    expect(await world().existing.accepts?.(there())).toEqual({ kind: 'accepted' })
  })

  it.each([
    ['work for a session of its own', workOf(), /existing session only/u],
    [
      'evidence only a person can give',
      workOf({ ...there(), instruction: NO_EVIDENCE }),
      /^instruction: A1\.evidence: /u,
    ],
    [
      'materials',
      workOf({ ...there(), materials: [{ resourceRef: 'r', versionRef: 'v' }] }),
      /materials/u,
    ],
  ])('refuses %s', async (_, work, reason) => {
    const answer = await world().existing.accepts?.(work)
    expect(answer?.kind === 'refused' && answer.reason).toMatch(reason)
  })
})

describe('check', () => {
  it('is ready when the session is quiet and has no goal in progress, also after a goal of another ended there', async () => {
    const w = opened()
    expect(await w.existing.check(job())).toEqual({ kind: 'ready' })
    await personGoal(w)
    w.at(HERE, { pending: 0 })
    await w.goals.command(OWNER, { session: HERE, command: { kind: 'cancel' } })
    expect(await w.existing.check(job())).toEqual({ kind: 'ready' })
  })

  it.each([
    ['a run is going', { run: 'run-7' }],
    ['an input waits', { pending: 1 }],
    ['a call is in the background', { background: 1 }],
  ])('is blocked as busy while %s', async (_, change) => {
    const w = opened()
    w.at(HERE, change)
    expect(await w.existing.check(job())).toEqual({ kind: 'unavailable', reason: BUSY })
  })

  it('is ready again for the Job whose goal is already set there, though the session is then busy with it', async () => {
    const w = opened()
    await w.existing.start(job())
    w.at(HERE, { run: 'run-1', pending: 0 })
    expect(await w.existing.check(job())).toEqual({ kind: 'ready' })
    expect(await w.existing.check(job('job-2'))).toEqual({ kind: 'unavailable', reason: HAS_GOAL })
  })

  it('is blocked while the session has a goal in progress that is not of this Job, and says that before busy', async () => {
    const w = opened()
    await personGoal(w)
    expect(await w.existing.check(job())).toEqual({ kind: 'unavailable', reason: HAS_GOAL })
  })

  it('is blocked when the session does not exist or takes no work any more, unknown when it cannot be read', async () => {
    const w = opened()
    expect(await w.existing.check(job('job-1', 'nowhere'))).toEqual({
      kind: 'unavailable',
      reason: 'the session does not exist',
    })
    w.at(HERE, { usable: false })
    expect(await w.existing.check(job())).toEqual({
      kind: 'unavailable',
      reason: 'the session takes no work any more',
    })
    w.faults.standing = true
    expect(await w.existing.check(job())).toMatchObject({ kind: 'unknown' })
  })

  it.each([
    ['a Job of no tenant', jobOf({ owner: SYSTEM, work: there() })],
    ['work for a session of its own', jobOf()],
    [
      'a body that does not stand',
      jobOf({ work: workOf({ ...there(), instruction: NO_EVIDENCE }) }),
    ],
  ])('answers unsupported for %s', async (_, given) => {
    expect(await opened().existing.check(given)).toMatchObject({ kind: 'unsupported' })
  })
})

describe('start', () => {
  it('in a quiet session a person attends, sets the goal of the Job as its creator: the goal stands for the Job, not for the person', async () => {
    const w = opened()
    expect(await w.existing.start(job())).toEqual({
      kind: 'started',
      executionRef: HERE,
      running: false,
    })
    const goal = await w.goalOf(HERE)
    expect(goal?.state).toMatchObject({ status: 'active', attendance: 'unattended', generation: 1 })
    expect(goal?.history).toMatchObject([
      { via: 'direct', draftedBy: 'creator', confirmedBy: ids()?.by, operation: ids()?.goal },
    ])
    expect(w.goalSessions.woken).toMatchObject([{ session: HERE, kind: 'start' }])
    expect(w.made).toEqual([])
    const revise = {
      kind: 'revise',
      changes: [{ op: 'add', section: 'rules', entry: { statement: '改它' } }],
    }
    expect(
      await w.goals.write(OWNER, {
        session: HERE,
        operation: 'person-2',
        proposal: revise as never,
        words: null,
        draftedBy: 'person',
        by: 'acc-1',
      }),
    ).toMatchObject({ kind: 'refused', reason: { kind: 'state', reason: 'nobody-attends' } })
  })

  it('says the work has begun when its own reminder opened the run going', async () => {
    const w = opened()
    w.hooks.handed = held => Object.assign(held, { run: 'run-1', pending: 0, opener: 'own' })
    expect(await w.existing.start(job())).toEqual({
      kind: 'started',
      executionRef: HERE,
      running: true,
    })
  })

  it('does not share a round another input opened: it cancels the goal it just set and waits as busy', async () => {
    const w = opened()
    w.hooks.handed = held => Object.assign(held, { run: 'run-x', pending: 0, opener: 'other' })
    expect(await w.existing.start(job())).toEqual({
      kind: 'notStarted',
      recoverable: true,
      reason: BUSY,
    })
    expect((await w.goalOf(HERE))?.state).toMatchObject({
      status: 'settled',
      outcome: { kind: 'cancelled' },
    })
    expect(w.stopped).toEqual([])
  })

  it('waits when a goal of another came between its reading and its setting: the goal it found is left alone', async () => {
    const w = opened()
    w.hooks.reading = async () => {
      delete w.hooks.reading
      await personGoal(w)
      w.at(HERE, { pending: 0 })
    }
    expect(await w.existing.start(job())).toEqual({
      kind: 'notStarted',
      recoverable: true,
      reason: HAS_GOAL,
    })
    expect((await w.goalOf(HERE))?.history).toMatchObject([{ operation: 'person-1' }])
  })

  it('answers unknown when the goal it set in a round of another may or may not be cancelled; asked again it finds its goal and takes it as started', async () => {
    const w = opened()
    w.hooks.handed = held => Object.assign(held, { run: 'run-x', pending: 0, opener: 'other' })
    w.hooks.asking = () => w.store.failNext('unknown-before-commit')
    expect(await w.existing.start(job())).toMatchObject({ kind: 'unknown' })
    expect((await w.goalOf(HERE))?.state.status).toBe('active')
    delete w.hooks.asking
    expect(await w.existing.start(job())).toMatchObject({ kind: 'started', running: true })
  })

  it('a start asked again for a goal already set does not look at who opened the run now going: the goal stays', async () => {
    const w = opened()
    await w.existing.start(job())
    w.at(HERE, { run: 'run-2', pending: 0, opener: 'other' })
    expect(await w.existing.start(job())).toMatchObject({ kind: 'started', running: true })
    expect((await w.goalOf(HERE))?.state.status).toBe('active')
  })

  it('two starts of one Job at once set the goal once: the one that finds it set by the other does not cancel it over a later round', async () => {
    const w = opened()
    w.hooks.reading = async () => {
      delete w.hooks.reading
      await w.existing.start(job())
      w.at(HERE, { run: 'run-2', pending: 0, opener: 'other' })
    }
    expect(await w.existing.start(job())).toEqual({
      kind: 'started',
      executionRef: HERE,
      running: true,
    })
    expect((await w.goalOf(HERE))?.state.status).toBe('active')
    expect(w.store.rows(TENANT)).toHaveLength(1)
  })

  it('never starts when Goal refuses the goal for another reason than one in progress, and says why', async () => {
    const w = opened()
    w.authority.answer(action => (action === 'set' ? 'denied' : 'permitted'))
    expect(await w.existing.start(job())).toEqual({
      kind: 'notStarted',
      recoverable: false,
      reason: 'goal: denied',
    })
  })

  it('asked again, recalls the goal it set: nothing is set a second time, also after the goal ended', async () => {
    const w = opened()
    await w.existing.start(job())
    const before = await w.goalOf(HERE)
    w.at(HERE, { run: 'run-1', pending: 0 })
    expect(await w.existing.start(job())).toEqual({
      kind: 'started',
      executionRef: HERE,
      running: true,
    })
    expect(await w.goalOf(HERE)).toEqual(before)
    w.endedIn(HERE, { kind: 'achieved' })
    expect(w.goalSessions.woken).toHaveLength(1)
  })

  it.each([
    ['a run is going', { run: 'run-7' }],
    ['an input waits', { pending: 1 }],
    ['a call is in the background', { background: 1 }],
  ])('waits as busy while %s, and sets no goal', async (_, change) => {
    const w = opened()
    w.at(HERE, change)
    expect(await w.existing.start(job())).toEqual({
      kind: 'notStarted',
      recoverable: true,
      reason: BUSY,
    })
    expect(w.store.rows(TENANT)).toEqual([])
  })

  it('waits while the session has a goal in progress of another, and leaves that goal as it is', async () => {
    const w = opened()
    await personGoal(w)
    w.at(HERE, { pending: 0 })
    const before = await w.goalOf(HERE)
    expect(await w.existing.start(job())).toEqual({
      kind: 'notStarted',
      recoverable: true,
      reason: HAS_GOAL,
    })
    expect(await w.goalOf(HERE)).toEqual(before)
  })

  it('never starts in a session that does not exist or takes no work any more, and creates none in its place', async () => {
    const w = opened()
    expect(await w.existing.start(job('job-1', 'nowhere'))).toEqual({
      kind: 'notStarted',
      recoverable: false,
      reason: 'the session does not exist',
    })
    w.at(HERE, { usable: false })
    expect(await w.existing.start(job())).toMatchObject({ kind: 'notStarted', recoverable: false })
    expect(w.made).toEqual([])
    expect(w.store.rows(TENANT)).toEqual([])
  })

  it('answers unknown when the session cannot be read or the goal may or may not be set; asked again it sets the goal once', async () => {
    const w = opened()
    w.faults.standing = true
    expect(await w.existing.start(job())).toMatchObject({ kind: 'unknown' })
    w.faults.standing = false
    w.store.failNext('unknown-before-commit')
    expect(await w.existing.start(job())).toMatchObject({ kind: 'unknown' })
    expect(await w.existing.inspect(job())).toEqual({
      kind: 'notStarted',
      recoverable: true,
      reason: 'the goal of the Job is not set',
    })
    expect(await w.existing.start(job())).toMatchObject({ kind: 'started' })
    expect(w.store.rows(TENANT)).toHaveLength(1)
  })

  it('a later Job in the same session sets a goal of its own once the earlier one ended; the earlier Job no longer reads its end there', async () => {
    const w = opened()
    await w.existing.start(job('job-1'))
    w.at(HERE, { pending: 0 })
    await w.goals.command(
      { tenant: TENANT, subject: 'schedule' },
      { session: HERE, command: { kind: 'cancel' } },
    )
    expect(await w.existing.inspect(job('job-1'))).toMatchObject({
      kind: 'ended',
      report: 'stopped',
    })
    expect(await w.existing.start(job('job-2'))).toMatchObject({ kind: 'started' })
    expect((await w.goalOf(HERE))?.state.generation).toBe(2)
    const begun = jobOf({ jobId: 'job-1' as never, work: there(), executionRef: HERE })
    expect(await w.existing.inspect(begun)).toMatchObject({ kind: 'unknown' })
  })
})

describe('the end of a Job in a session that exists', () => {
  async function going() {
    const w = opened()
    await w.existing.start(job())
    w.at(HERE, { run: 'run-1', pending: 0 })
    return w
  }

  it('is the end of its goal once the session is quiet', async () => {
    const w = await going()
    expect(await w.existing.inspect(job())).toEqual({ kind: 'running', executionRef: HERE })
    w.endedIn(HERE, { kind: 'achieved' })
    w.at(HERE, { run: null })
    expect(await w.existing.inspect(job())).toEqual({
      kind: 'ended',
      report: 'succeeded',
      result: true,
      reason: 'achieved',
    })
  })

  it('fails as aborted when the person stopped the round or it failed: the goal of the Job is aborted though a person attends the session', async () => {
    const w = await going()
    w.at(HERE, { run: null })
    expect(await w.existing.inspect(job())).toEqual({
      kind: 'ended',
      report: 'failed',
      result: false,
      reason: 'aborted',
    })
    expect((await w.goalOf(HERE))?.state).toMatchObject({
      status: 'settled',
      outcome: { kind: 'aborted' },
    })
  })

  it('a cancel of the Job cancels its goal and asks only its run to stop; then the Job reads as stopped and the stop as confirmed', async () => {
    const w = await going()
    expect(await w.existing.requestStop(job(), 'graceful')).toEqual({ kind: 'sent' })
    expect((await w.goalOf(HERE))?.state).toMatchObject({ outcome: { kind: 'cancelled' } })
    expect(w.stopped).toEqual([
      { tenant: TENANT, session: HERE, operation: ids()?.stop, run: 'run-1', urgency: 'graceful' },
    ])
    w.at(HERE, { run: null })
    expect(await w.existing.inspect(job())).toMatchObject({ kind: 'ended', report: 'stopped' })
    expect(await w.existing.requestStop(job(), 'graceful')).toEqual({ kind: 'confirmed' })
  })

  it('stops nothing of a goal another set in the session, and describes none of it', async () => {
    const w = opened()
    await personGoal(w)
    w.at(HERE, { run: 'run-p', pending: 0 })
    expect(await w.existing.requestStop(job(), 'forced')).toEqual({ kind: 'confirmed' })
    expect(w.stopped).toEqual([])
    expect((await w.goalOf(HERE))?.state.status).toBe('active')
    expect(await w.existing.describe?.(job())).toEqual({
      adopted: { name: 'coding', version: 'v7' },
      outcome: null,
      deliverables: [],
      since: null,
      run: null,
    })
  })

  it('answers not started for work this path never carries, and confirms there is nothing to stop', async () => {
    const w = opened()
    expect(await w.existing.inspect(jobOf())).toMatchObject({
      kind: 'notStarted',
      recoverable: false,
    })
    expect(await w.existing.requestStop(jobOf(), 'graceful')).toEqual({ kind: 'confirmed' })
    expect(await w.existing.describe?.(jobOf())).toBeNull()
  })
})
