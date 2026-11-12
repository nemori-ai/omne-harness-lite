// Session observation, block 1 of #1248: the domain face (C8), the run in progress (C6), the locate
// axis cell by cell (C9a, cells of RFC-0015 §13), no lost wake-up (C10a), teardown on abort (C11a)
// and the refresh budget (C12). The case names start with the cell they cover.
import { describe, expect, it } from 'vitest'
import {
  createSessionObservation,
  type SessionObservationEnd,
  type SessionObservationFrame,
} from '../src/index.ts'
import {
  ACCESS,
  FakeLog,
  ended,
  mainCall,
  message,
  settle,
  started,
  world,
  type World,
} from './ports.ts'

type Frames = AsyncGenerator<SessionObservationFrame, SessionObservationEnd | undefined>

async function open(w: World, signal = new AbortController().signal): Promise<Frames> {
  const opened = await createSessionObservation(w.ports).open({ access: ACCESS, signal })
  if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
  return opened.frames
}

async function frame(frames: Frames): Promise<SessionObservationFrame> {
  const step = await frames.next()
  if (step.done === true) throw new Error(`ended: ${String(step.value)}`)
  return step.value
}

/** The next step once the oldest pending wait runs out. */
async function afterInterval(w: World, frames: Frames) {
  const step = frames.next()
  await settle()
  w.clock.elapse()
  return step
}

describe('the domain face (C8)', () => {
  it('open: a readable log opens, and the first frame is state', async () => {
    const w = world(new FakeLog(started('run_1'), message('hi')))
    const frames = await open(w)
    expect(await frame(frames)).toEqual({
      kind: 'state',
      run: 'run_1',
      revision: '2',
      phase: null,
      target: null,
    })
  })

  it('open: refused, absent and invalid sessions answer the same denied', async () => {
    const answers = []
    for (const failure of [
      { kind: 'denied', action: 'history.begin' },
      { kind: 'invalid', field: 'session', reason: 'not a session id' },
    ] as const) {
      const log = new FakeLog()
      log.failures.begin = [failure]
      const w = world(log)
      answers.push(
        await createSessionObservation(w.ports).open({
          access: ACCESS,
          signal: new AbortController().signal,
        }),
      )
      expect(w.notices.active).toBe(0)
    }
    expect(answers).toEqual([{ kind: 'denied' }, { kind: 'denied' }])
  })

  it('open: a log that is not available answers unavailable', async () => {
    const log = new FakeLog()
    log.failures.begin = [{ kind: 'unavailable', owner: 'session', diagnostic: 'down' }]
    const w = world(log)
    expect(
      await createSessionObservation(w.ports).open({
        access: ACCESS,
        signal: new AbortController().signal,
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(w.notices.active).toBe(0)
  })
})

describe('the run in progress (C6)', () => {
  it('a run that started is in progress; its own terminal ends it', async () => {
    const log = new FakeLog(started('run_1'))
    const w = world(log)
    const frames = await open(w)
    expect(await frame(frames)).toMatchObject({ run: 'run_1' })
    log.append(ended('run_1'))
    w.notices.commit('run.terminal')
    expect(await frame(frames)).toMatchObject({ run: null })
  })

  it('a terminal of another run leaves the run in progress', async () => {
    const log = new FakeLog(started('run_1'), started('run_2'), ended('run_1'))
    const w = world(log)
    const frames = await open(w)
    expect(await frame(frames)).toMatchObject({ run: 'run_2' })
    log.append(ended('run_0'))
    w.notices.commit('run.terminal')
    expect(await frame(frames)).toMatchObject({ revision: '4', run: 'run_2' })
  })

  it('reading backward, a run whose terminal came after it is not in progress', async () => {
    const w = world(new FakeLog(started('run_1'), message('a'), ended('run_1')))
    expect(await frame(await open(w))).toMatchObject({ run: null })
  })
})

describe('the locate axis (C9a)', () => {
  it('opened-idle: the first locate reads backward from the newest entry', async () => {
    const w = world(new FakeLog(started('run_1')))
    await open(w)
    expect(w.log.calls[0]).toMatchObject({
      face: 'begin',
      input: { from: null, direction: 'backward' },
    })
  })

  it('interval-idle: an interval that runs out locates, reading only the entries after the last one read', async () => {
    const log = new FakeLog(started('run_1'), mainCall('m-1'))
    const w = world(log)
    const frames = await open(w)
    await frame(frames)
    log.append(message('hi'))
    const step = await afterInterval(w, frames)
    expect(w.log.calls.at(-1)).toMatchObject({ face: 'since', input: { after: 'e2' } })
    expect(step.value).toMatchObject({ kind: 'state', revision: '3' })
    expect(await frame(frames)).toEqual({ kind: 'refreshing' })
  })

  it('notice-idle: a notice cancels the wait and locates; no refreshing, no attempt', async () => {
    const log = new FakeLog(started('run_1'))
    const w = world(log, { interval: 1000, backoff: 2 })
    const frames = await open(w)
    await frame(frames)
    const step = frames.next()
    await settle()
    log.append(message('hi'))
    w.notices.commit('message.user')
    expect((await step).value).toMatchObject({ kind: 'state', revision: '2' })
    const after = frames.next()
    await settle()
    expect(w.clock.waits).toEqual([1000, 1000])
    w.clock.elapse()
    expect((await after).value).toEqual({ kind: 'refreshing' })
  })

  it('notice-busy (不丢唤醒, C10a): a notice while the locate reads is kept, and the locate runs again at once', async () => {
    const log = new FakeLog(started('run_1'))
    const w = world(log)
    const frames = await open(w)
    await frame(frames)
    const gate = log.hold()
    const first = frames.next()
    await settle()
    w.clock.elapse()
    await settle()
    expect(log.reads('since')).toBe(1)
    log.append(message('hi'))
    w.notices.commit('message.user')
    gate.release()
    expect((await first).value).toEqual({ kind: 'refreshing' })
    const second = frames.next()
    await settle()
    expect(w.clock.waits).toHaveLength(1)
    expect((await second).value).toMatchObject({ kind: 'state', revision: '2' })
  })

  it('notice-unrelated: a notice whose kinds do not meet the set is ignored', async () => {
    const w = world(new FakeLog(started('run_1')))
    const frames = await open(w)
    await frame(frames)
    const step = frames.next()
    await settle()
    w.notices.commit('session.todo')
    await settle()
    expect(w.log.reads()).toBe(1)
    expect(w.clock.pending).toBe(1)
    w.clock.elapse()
    await step
  })

  it('result, no target, nothing new: no state frame, only refreshing', async () => {
    const w = world(new FakeLog(started('run_1')))
    const frames = await open(w)
    await frame(frames)
    expect((await afterInterval(w, frames)).value).toEqual({ kind: 'refreshing' })
  })

  it('result, log not available: counts as nothing new and goes on', async () => {
    const log = new FakeLog(started('run_1'))
    log.failures.since = [{ kind: 'unavailable', owner: 'session', diagnostic: 'busy' }]
    const w = world(log)
    const frames = await open(w)
    await frame(frames)
    expect((await afterInterval(w, frames)).value).toEqual({ kind: 'refreshing' })
    log.append(ended('run_1'))
    expect((await afterInterval(w, frames)).value).toMatchObject({ kind: 'state', run: null })
  })

  it('result, pages full before finding: what was read stands, the rest counts as not found', async () => {
    const log = new FakeLog(
      started('run_1'),
      mainCall('m-1'),
      message('a'),
      message('b'),
      message('c'),
    )
    log.pageSize = 1
    const w = world(log, {}, 1)
    expect(await frame(await open(w))).toMatchObject({ run: null, revision: '5' })
    expect(log.reads()).toBe(1)
  })

  it('result, own cursor invalid: the cursor is dropped and the next locate reads backward', async () => {
    const log = new FakeLog(started('run_1'))
    log.failures.since = [{ kind: 'invalid', field: 'from', reason: 'expired' }]
    const w = world(log)
    const frames = await open(w)
    await frame(frames)
    expect((await afterInterval(w, frames)).value).toEqual({ kind: 'refreshing' })
    await afterInterval(w, frames)
    expect(log.calls.map(call => call.face)).toEqual(['begin', 'since', 'begin'])
  })

  it('result, log read denied: ends with denied', async () => {
    const log = new FakeLog(started('run_1'))
    log.failures.since = [{ kind: 'denied', action: 'history.since' }]
    const w = world(log)
    const frames = await open(w)
    await frame(frames)
    expect(await afterInterval(w, frames)).toEqual({ done: true, value: 'denied' })
    expect(w.notices.active).toBe(0)
  })

  it('result, another invalid answer: ends with unavailable', async () => {
    const log = new FakeLog(started('run_1'))
    log.failures.since = [{ kind: 'invalid', field: 'from', reason: 'expired' }]
    log.failures.begin = [
      undefined as never,
      { kind: 'invalid', field: 'pageBytes', reason: 'bad' },
    ]
    const w = world(log)
    const frames = await open(w)
    await frame(frames)
    await afterInterval(w, frames)
    expect(await afterInterval(w, frames)).toEqual({ done: true, value: 'unavailable' })
  })
})

describe('abort (C11a)', () => {
  it('an abort while waiting ends the frames without a reason and leaves no notice, wait or read', async () => {
    const controller = new AbortController()
    const w = world(new FakeLog(started('run_1')))
    const frames = await open(w, controller.signal)
    await frame(frames)
    const step = frames.next()
    await settle()
    expect(w.clock.pending).toBe(1)
    controller.abort()
    expect(await step).toEqual({ done: true, value: undefined })
    expect([w.notices.active, w.clock.pending, w.log.reads()]).toEqual([0, 0, 1])
  })

  it('an abort while the locate reads drops its result and ends', async () => {
    const controller = new AbortController()
    const log = new FakeLog(started('run_1'))
    const w = world(log)
    const frames = await open(w, controller.signal)
    await frame(frames)
    const gate = log.hold()
    const step = afterInterval(w, frames)
    await settle()
    controller.abort()
    log.append(ended('run_1'))
    gate.release()
    expect(await step).toEqual({ done: true, value: undefined })
    expect([w.notices.active, w.clock.pending]).toEqual([0, 0])
  })

  it('an abort while open reads the log: it opens, and the frames end at once without a reason', async () => {
    const controller = new AbortController()
    const log = new FakeLog(started('run_1'))
    const w = world(log)
    const gate = log.hold()
    const opening = createSessionObservation(w.ports).open({
      access: ACCESS,
      signal: controller.signal,
    })
    await settle()
    controller.abort()
    gate.release()
    const opened = await opening
    if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
    expect(await opened.frames.next()).toEqual({ done: true, value: undefined })
    expect([w.notices.active, w.clock.pending, w.log.reads()]).toEqual([0, 0, 1])
  })

  it('an observer that stops reading the frames leaves no notice behind', async () => {
    const w = world(new FakeLog(started('run_1')))
    const frames = await open(w)
    await frame(frames)
    await frames.return(undefined)
    expect(w.notices.active).toBe(0)
  })
})

describe('the refresh budget (C12)', () => {
  it('interval-driven locates back off by the policy up to 30 times the interval', async () => {
    const w = world(new FakeLog(started('run_1')), { interval: 100, backoff: 10, maxAttempts: 10 })
    const frames = await open(w)
    await frame(frames)
    for (let i = 0; i < 4; i++) await afterInterval(w, frames)
    expect(w.clock.waits).toEqual([100, 1000, 3000, 3000])
  })

  it('maxAttempts interval-driven locates without anything new end with refresh-exhausted', async () => {
    const w = world(new FakeLog(started('run_1')), { interval: 100, maxAttempts: 2 })
    const frames = await open(w)
    await frame(frames)
    await afterInterval(w, frames)
    await afterInterval(w, frames)
    expect(await frames.next()).toEqual({ done: true, value: 'refresh-exhausted' })
    expect(w.notices.active).toBe(0)
  })

  it('the accumulated waiting reaching the deadline ends with refresh-exhausted', async () => {
    const w = world(new FakeLog(started('run_1')), { interval: 100, backoff: 1, deadline: 200 })
    const frames = await open(w)
    await frame(frames)
    await afterInterval(w, frames)
    await afterInterval(w, frames)
    expect(await frames.next()).toEqual({ done: true, value: 'refresh-exhausted' })
  })

  it('an interval below the floor is clamped to 100 ms with a diagnostic', async () => {
    const w = world(new FakeLog(started('run_1')), { interval: 5 })
    const frames = await open(w)
    await frame(frames)
    await afterInterval(w, frames)
    expect(w.clock.waits[0]).toBe(100)
    expect(w.diagnostics).toEqual([
      { code: 'observation.policy-clamped', detail: expect.stringContaining('5 ms') },
    ])
  })

  it('without notices, a new commit is seen within one interval', async () => {
    const log = new FakeLog(started('run_1'))
    const w = world(log)
    const frames = await open(w)
    await frame(frames)
    log.append(ended('run_1'))
    expect((await afterInterval(w, frames)).value).toMatchObject({ kind: 'state', run: null })
  })
})
