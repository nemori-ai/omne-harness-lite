import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import {
  createSessionObservation,
  type SessionObservationEnd,
  type SessionObservationFrame,
} from '../src/index.ts'
import {
  ACCESS,
  FakeLog,
  delta,
  mainCall,
  message,
  settle,
  snapshot,
  started,
  stream,
  world,
  type World,
} from './ports.ts'

type Frames = AsyncGenerator<SessionObservationFrame, SessionObservationEnd | undefined>
type Step = IteratorResult<SessionObservationFrame, SessionObservationEnd | undefined>

let controller = new AbortController()

function stop(): void {
  controller.abort()
}

async function open(w: World, signal?: AbortSignal): Promise<Frames> {
  controller = new AbortController()
  const opened = await createSessionObservation(w.ports).open({
    access: ACCESS,
    signal: signal ?? controller.signal,
  })
  if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
  return opened.frames
}

async function drain(frames: Frames, count: number): Promise<Step[]> {
  const steps: Step[] = []
  for (let i = 0; i < count; i++) {
    const next = frames.next()
    const step = await Promise.race([next, settle().then(() => null)])
    if (step === null) {
      pending.set(frames, next)
      break
    }
    steps.push(step)
    if (step.done === true) break
  }
  return steps
}

const pending = new WeakMap<Frames, Promise<Step>>()

async function take(frames: Frames): Promise<Step> {
  const held = pending.get(frames)
  pending.delete(frames)
  return held ?? frames.next()
}

const kinds = (steps: readonly Step[]) =>
  steps.map(step => (step.done === true ? `end:${String(step.value)}` : step.value.kind))

const text = (step: Step | undefined) =>
  step !== undefined && step.done !== true && 'value' in step.value
    ? writeJsonText(step.value.value as never)
    : ''

async function observing(w: World, signal?: AbortSignal): Promise<Frames> {
  w.log.append(started('run_1'), mainCall('m-1'))
  w.model.answer('m-1', stream('s1'))
  const frames = await open(w, signal)
  expect(await take(frames)).toMatchObject({
    value: {
      kind: 'state',
      run: 'run_1',
      phase: 'running',
      target: { projection: 'model-output-v1' },
    },
  })
  await settle()
  w.model.stream('s1').push(snapshot('s1', 1))
  expect(await take(frames)).toMatchObject({ value: { kind: 'snapshot' } })
  return frames
}

describe('the result table with the Model', () => {
  it('result, new main call, stream given, no target: state, then subscribe and snapshot; the budget resets', async () => {
    const w = world(new FakeLog())
    await observing(w)
    expect(w.model.asked).toEqual(['m-1'])
    expect(w.model.open).toBe(1)
    const viewer = { principal: 'person', tenant: 'tenant-a' }
    expect(w.model.accesses).toEqual([viewer, viewer])
    stop()
  })

  it('result, new main call, stream given, has target (不发旧帧): the old subscription goes, its late frame does not come', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    const gate = w.log.hold()
    w.log.append(mainCall('m-2'))
    w.model.answer('m-2', stream('s2'))
    w.notices.commit('call.bound')
    await settle()
    w.model.stream('s1').push(delta('s1', 50))
    await settle()
    gate.release()
    const switched = await drain(frames, 3)
    expect(w.model.stream('s1').signal.aborted).toBe(true)
    expect(kinds(switched)).toEqual(['state'])
    w.model.stream('s2').push(snapshot('s2', 2))
    const next = await take(frames)
    expect(next).toMatchObject({ value: { kind: 'snapshot' } })
    expect(text(next)).toContain('"cursor":"2"')
    expect(w.diagnostics).toContainEqual({ code: 'observation.late-discarded', detail: 'delta' })
    stop()
  })

  it('result, new main call, stream given, has target: a frame of the old stream that came before the notice is still sent, in order', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push(delta('s1', 2))
    await settle()
    w.log.append(mainCall('m-2'))
    w.model.answer('m-2', stream('s2'))
    w.notices.commit('call.bound')
    await settle()
    expect(kinds(await drain(frames, 3))).toEqual(['delta', 'state'])
    expect(w.model.stream('s1').signal.aborted).toBe(true)
    stop()
  })

  it('result, new main call, no stream, has target (不停在旧的调用上): the old target goes; state and refreshing', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.log.append(mainCall('m-2'))
    w.notices.commit('call.bound')
    const steps = await drain(frames, 3)
    expect(w.model.stream('s1').signal.aborted).toBe(true)
    expect(steps.map(step => step.value)).toEqual([
      expect.objectContaining({ kind: 'state', target: null, phase: 'accepted' }),
      { kind: 'refreshing' },
    ])
    w.model.stream('s1').stop()
    await settle()
    expect(w.diagnostics).toEqual([])
    stop()
  })

  it('result, new main call, no stream, no target: state and refreshing even for a notice; one attempt', async () => {
    const log = new FakeLog(started('run_1'), mainCall('m-1'))
    const w = world(log)
    const frames = await open(w)
    await take(frames)
    log.append(mainCall('m-2'))
    w.notices.commit('call.bound')
    const steps = await drain(frames, 3)
    expect(kinds(steps)).toEqual(['state', 'refreshing'])
    expect(w.clock.waits.filter(ms => ms !== 5000)).toEqual([1500])
    stop()
  })

  it('result, Model unavailable: no stream yet, the observation goes on', async () => {
    const w = world(new FakeLog(started('run_1'), mainCall('m-1')))
    w.model.answer('m-1', {
      failure: { kind: 'unavailable', dependency: 'model', diagnostic: 'busy' },
    } as never)
    const frames = await open(w)
    expect(await take(frames)).toMatchObject({ value: { kind: 'state', target: null } })
    stop()
  })

  it('result, same main call, new stream, no target: subscribes', async () => {
    const log = new FakeLog(started('run_1'), mainCall('m-1'))
    const w = world(log)
    const frames = await open(w)
    await take(frames)
    w.model.answer('m-1', stream('s9'))
    const step = take(frames)
    await settle()
    w.clock.elapse()
    expect(await step).toMatchObject({
      value: { kind: 'state', target: { projection: 'model-output-v1' } },
    })
    expect(w.model.open).toBe(1)
    stop()
  })

  it('result, same main call, the same closed stream: counts as no stream', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'source-closed' })
    expect(kinds(await drain(frames, 3))).toEqual(['state', 'refreshing'])
    w.model.answer('m-1', stream('s1'))
    const step = take(frames)
    await settle()
    w.clock.elapse()
    expect(await step).toEqual({ done: false, value: { kind: 'refreshing' } })
    expect(w.model.streams).toHaveLength(1)
    stop()
  })

  it('result, has target, nothing new: the stream stays; state when a field changed', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.log.append(message('hi'))
    w.notices.commit('message.user')
    expect(await take(frames)).toMatchObject({ value: { kind: 'state', revision: '3' } })
    expect(w.model.open).toBe(1)
    expect(w.model.asked).toEqual(['m-1'])
    expect(w.diagnostics).toEqual([])
    stop()
  })

  it('result, has target, log not available: the stream stays; a diagnostic', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.log.failures.since = [{ kind: 'unavailable', owner: 'session', diagnostic: 'busy' }]
    w.notices.commit('message.user')
    expect(await drain(frames, 2)).toEqual([])
    expect(w.model.open).toBe(1)
    expect(w.diagnostics).toContainEqual({ code: 'observation.locate-transient', detail: 'm-1' })
    stop()
  })

  it('result, has target, its own cursor invalid: the stream stays; a diagnostic', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.log.failures.since = [{ kind: 'invalid', field: 'from', reason: 'expired' }]
    w.notices.commit('message.user')
    expect(await drain(frames, 2)).toEqual([])
    expect(w.model.open).toBe(1)
    expect(w.diagnostics).toContainEqual({ code: 'observation.locate-transient', detail: 'm-1' })
    stop()
  })

  it('result, new main call, stream given, no target, after refreshes: the budget starts over', async () => {
    const log = new FakeLog(started('run_1'), mainCall('m-1'))
    const w = world(log, { interval: 1000, backoff: 2 })
    const frames = await open(w)
    await take(frames)
    for (let i = 0; i < 2; i++) {
      const step = take(frames)
      await settle()
      w.clock.elapse()
      expect(await step).toMatchObject({ value: { kind: 'refreshing' } })
    }
    w.model.answer('m-1', stream('s1'))
    const subscribed = take(frames)
    await settle()
    w.clock.elapse()
    expect(await subscribed).toMatchObject({ value: { kind: 'state' } })
    w.model.stream('s1').push({ kind: 'ended', reason: 'producer-ended', value: null })
    await drain(frames, 3)
    expect(w.clock.waits.filter(ms => ms !== 5000)).toEqual([1000, 2000, 4000, 2000])
    stop()
  })

  it('result, current timeout: counts as nothing new, with a diagnostic', async () => {
    const log = new FakeLog(started('run_1'), mainCall('m-1'))
    const w = world(log, { currentTimeout: 5000 })
    w.model.answer('m-1', 'hang')
    const frames = await open(w)
    const first = take(frames)
    await settle()
    expect(w.clock.waits).toEqual([5000])
    w.clock.elapse()
    expect(await first).toMatchObject({ value: { kind: 'state', target: null, phase: null } })
    expect(w.diagnostics).toContainEqual({ code: 'observation.current-timeout', detail: 'm-1' })
    stop()
  })

  it('result, Model denied: the state frame names the run first, then it ends with denied', async () => {
    const w = world(new FakeLog(started('run_1'), mainCall('m-1')))
    w.model.answer('m-1', { failure: { kind: 'denied' } })
    const frames = await open(w)
    expect(await frames.next()).toMatchObject({
      done: false,
      value: { kind: 'state', run: 'run_1', target: null },
    })
    expect(await frames.next()).toEqual({ done: true, value: 'denied' })
    expect(w.notices.active).toBe(0)
  })

  it('result, Model answers the reference invalid: the state frame first, then it ends with unavailable', async () => {
    const w = world(new FakeLog(started('run_1'), mainCall('m-1')))
    w.model.answer('m-1', { failure: { kind: 'invalid', reason: 'malformed' } })
    const frames = await open(w)
    expect(await frames.next()).toMatchObject({ value: { kind: 'state', run: 'run_1' } })
    expect(await frames.next()).toEqual({ done: true, value: 'unavailable' })
  })

  it('result, Model denied a later main call: the state frame of the new revision first, then denied', async () => {
    const log = new FakeLog(started('run_1'))
    const w = world(log)
    const frames = await open(w)
    expect(await frames.next()).toMatchObject({ value: { kind: 'state', revision: '1' } })
    log.append(mainCall('m-1'))
    w.model.answer('m-1', { failure: { kind: 'denied' } })
    w.notices.commit('call.bound')
    expect(await frames.next()).toMatchObject({
      value: { kind: 'state', run: 'run_1', revision: '2' },
    })
    expect(await frames.next()).toEqual({ done: true, value: 'denied' })
  })

  it('result, Model has the call registered but not accepted: no stream yet, the observation goes on', async () => {
    const w = world(new FakeLog(started('run_1'), mainCall('m-1')))
    w.model.answer('m-1', { failure: { kind: 'invalid', reason: 'not-accepted' } })
    const frames = await open(w)
    expect(await take(frames)).toMatchObject({
      value: { kind: 'state', target: null, phase: null },
    })
    stop()
  })
})

describe('the stream axis', () => {
  it('the state frame tells how far the dispatches of the call got, and a new one comes only when that changed', async () => {
    const fault = { cause: 'upstream-unavailable', upstreamStatus: '503', diagnostic: 'http-503' }
    const first = { allowed: 2, made: 1, last: null, notBefore: null }
    const second = { allowed: 2, made: 2, last: fault, notBefore: null }
    const w = world(new FakeLog())
    w.log.append(started('run_1'), mainCall('m-1'))
    w.model.answer('m-1', stream('s1', 'running', first))
    const frames = await open(w)
    expect(await take(frames)).toMatchObject({ value: { kind: 'state', attempts: first } })
    await settle()
    w.model.stream('s1').push(delta('s1', 2, 'running', first), delta('s1', 3, 'running', second))
    const steps = await drain(frames, 4)
    expect(steps.map(step => step.value)).toEqual([
      expect.objectContaining({ kind: 'delta' }),
      expect.objectContaining({ kind: 'state', phase: 'running', attempts: second }),
      expect.objectContaining({ kind: 'delta' }),
    ])
    stop()
  })

  it('the same progress with the same last fault gives no new state frame; another fault does', async () => {
    const fault = { cause: 'upstream-unavailable', upstreamStatus: '503', diagnostic: 'http-503' }
    const failed = { allowed: 3, made: 2, last: fault, notBefore: null }
    const other = { ...failed, last: { ...fault, upstreamStatus: '504', diagnostic: 'http-504' } }
    const w = world(new FakeLog())
    w.log.append(started('run_1'), mainCall('m-1'))
    w.model.answer('m-1', stream('s1', 'running', failed))
    const frames = await open(w)
    expect(await take(frames)).toMatchObject({ value: { kind: 'state', attempts: failed } })
    await settle()
    w.model
      .stream('s1')
      .push(
        delta('s1', 2, 'running', { ...failed, last: { ...fault } }),
        delta('s1', 3, 'running', other),
      )
    const steps = await drain(frames, 4)
    expect(steps.map(step => step.value)).toEqual([
      expect.objectContaining({ kind: 'delta' }),
      expect.objectContaining({ kind: 'state', attempts: other }),
      expect.objectContaining({ kind: 'delta' }),
    ])
    stop()
  })

  const fault503 = { cause: 'upstream-unavailable', upstreamStatus: '503', diagnostic: 'http-503' }
  const plain = { allowed: 2, made: 1, last: null, notBefore: null }
  const failed = { allowed: 2, made: 2, last: fault503, notBefore: '2026-11-17T00:00:01.000Z' }
  it.each([
    ['no progress, then some', undefined, plain, true],
    ['some progress, then none', plain, undefined, true],
    ['another allowed count', plain, { ...plain, allowed: 3 }, true],
    ['another made count', plain, { ...plain, made: 2 }, true],
    ['another next instant', failed, { ...failed, notBefore: '2026-11-17T00:00:02.000Z' }, true],
    ['a next instant that went away', failed, { ...failed, notBefore: null }, true],
    ['a first fault', plain, { ...plain, last: fault503 }, true],
    ['a fault that went away', failed, { ...failed, last: null }, true],
    ['another cause', failed, { ...failed, last: { ...fault503, cause: 'stream-lost' } }, true],
    [
      'another upstream status',
      failed,
      { ...failed, last: { ...fault503, upstreamStatus: '504' } },
      true,
    ],
    [
      'an upstream status that went away',
      failed,
      { ...failed, last: { ...fault503, upstreamStatus: null } },
      true,
    ],
    [
      'another diagnostic',
      failed,
      { ...failed, last: { ...fault503, diagnostic: 'http-5xx' } },
      true,
    ],
    [
      'the same progress with a fault, as another object',
      failed,
      { ...failed, last: { ...fault503 } },
      false,
    ],
    ['the same progress without a fault, as another object', plain, { ...plain }, false],
    ['no progress twice', undefined, undefined, false],
  ] as const)(
    'a delta with %s: a state frame comes first only when the progress differs',
    async (_name, before, after, differs) => {
      const w = world(new FakeLog())
      w.log.append(started('run_1'), mainCall('m-1'))
      w.model.answer('m-1', stream('s1', 'running', before))
      const frames = await open(w)
      expect((await take(frames)).value).toMatchObject({ kind: 'state', attempts: before ?? null })
      await settle()
      w.model.stream('s1').push(delta('s1', 2, 'running', after), delta('s1', 3, 'running', after))
      const steps = await drain(frames, differs ? 4 : 3)
      const state = expect.objectContaining({ kind: 'state', attempts: after ?? null })
      const content = expect.objectContaining({ kind: 'delta' })
      expect(steps.map(step => step.value)).toEqual(
        differs ? [state, content, content] : [content, content],
      )
      stop()
    },
  )

  it('a call state without the progress gives a state frame whose progress is null', async () => {
    const w = world(new FakeLog())
    w.log.append(started('run_1'), mainCall('m-1'))
    w.model.answer('m-1', stream('s1'))
    const frames = await open(w)
    expect((await take(frames)).value).toMatchObject({ kind: 'state', attempts: null })
    stop()
  })

  it('stream, observing, delta with a new phase: state first, then the delta; same phase: only the delta', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push(delta('s1', 2), delta('s1', 3, 'settled'))
    const steps = await drain(frames, 4)
    expect(steps.map(step => step.value)).toEqual([
      expect.objectContaining({ kind: 'delta' }),
      expect.objectContaining({ kind: 'state', phase: 'settled' }),
      expect.objectContaining({ kind: 'delta' }),
    ])
    expect(text(steps[0])).not.toContain('"phase"')
    expect(text(steps[2])).toContain('"phase":"settled"')
    stop()
  })

  it('stream, observing, the stream ended: back to no target; state, refreshing, and the interval', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'producer-ended', value: null })
    const steps = await drain(frames, 3)
    expect(steps.map(step => step.value)).toEqual([
      expect.objectContaining({ kind: 'state', target: null }),
      { kind: 'refreshing' },
    ])
    expect(w.clock.pending).toBe(1)
    stop()
  })

  it('stream, observing, a gap that is not the buffer: gap, state, refreshing', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'gap', after: null, reason: 'source-history' })
    expect(kinds(await drain(frames, 4))).toEqual(['gap', 'state', 'refreshing'])
    stop()
  })

  it('stream, observing, the iterator stops without ended: as a stream that ended', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').stop()
    expect(kinds(await drain(frames, 3))).toEqual(['state', 'refreshing'])
    stop()
  })

  it('stream, observing, the subscription broke (capacity): refreshing; after the interval the same target again', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'capacity' })
    expect(kinds(await drain(frames, 2))).toEqual(['refreshing'])
    w.clock.elapse()
    await settle()
    expect(w.model.streams.map(s => s.ref)).toEqual(['s1', 's1'])
    expect(w.model.asked).toEqual(['m-1'])
    w.model.stream('s1').push(snapshot('s1', 7))
    expect(await take(frames)).toMatchObject({ value: { kind: 'snapshot' } })
    stop()
  })

  it('stream, observing, a buffer gap: gap, refreshing, and the same target again', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'gap', after: null, reason: 'buffer' })
    const steps = await drain(frames, 3)
    expect(steps.map(step => step.value)).toEqual([
      { kind: 'gap', reason: 'buffer' },
      { kind: 'refreshing' },
    ])
    expect(w.model.streams[0]?.signal.aborted).toBe(true)
    w.clock.elapse()
    await settle()
    expect(w.model.streams.map(s => s.ref)).toEqual(['s1', 's1'])
    stop()
  })

  it('stream, waiting to observe again, a notice with nothing new: the target stays, the Model is not asked', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'capacity' })
    expect(kinds(await drain(frames, 2))).toEqual(['refreshing'])
    w.log.append(message('hi'))
    w.notices.commit('message.user')
    expect(await take(frames)).toMatchObject({
      value: { kind: 'state', target: { projection: 'model-output-v1' } },
    })
    expect(w.model.asked).toEqual(['m-1'])
    stop()
  })

  it('stream, waiting to observe again, a notice does not push the wait back: the same wait runs out and the target is observed again', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'capacity' })
    expect(kinds(await drain(frames, 2))).toEqual(['refreshing'])
    const waits = w.clock.waits.length
    w.log.append(message('hi'))
    w.notices.commit('message.user')
    expect(await take(frames)).toMatchObject({ value: { kind: 'state' } })
    expect(await drain(frames, 1)).toEqual([])
    expect([w.clock.waits.length, w.clock.pending]).toEqual([waits, 1])
    w.clock.elapse()
    await settle()
    expect(w.model.streams.map(s => s.ref)).toEqual(['s1', 's1'])
    stop()
  })

  it('stream, no target, a notice brings a stream while the wait runs: once it ends, the next look waits a full new interval', async () => {
    const log = new FakeLog(started('run_1'))
    const w = world(log, { interval: 1000, backoff: 2 })
    const frames = await open(w)
    await take(frames)
    expect(await drain(frames, 1)).toEqual([])
    expect([w.clock.waits, w.clock.pending]).toEqual([[1000], 1])
    log.append(mainCall('m-1'))
    w.model.answer('m-1', stream('s1'))
    w.notices.commit('call.bound')
    expect(await take(frames)).toMatchObject({
      value: { kind: 'state', target: { projection: 'model-output-v1' } },
    })
    await settle()
    w.model.stream('s1').push({ kind: 'ended', reason: 'producer-ended', value: null })
    expect(kinds(await drain(frames, 3))).toEqual(['state', 'refreshing'])
    expect(w.clock.waits.filter(ms => ms !== 5000)).toEqual([1000, 2000])
    expect(w.clock.pending).toBe(1)
    const reads = log.reads()
    const look = take(frames)
    await settle()
    expect(log.reads()).toBe(reads)
    w.clock.elapse()
    expect(kinds([await look, ...(await drain(frames, 2))])).toEqual(['state', 'refreshing'])
    expect(log.reads()).toBe(reads + 1)
    stop()
  })

  it('stream, waiting to observe again, a snapshot resets the budget', async () => {
    const w = world(new FakeLog(), { interval: 1000, backoff: 2 })
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'unavailable' })
    await drain(frames, 2)
    w.clock.elapse()
    await settle()
    w.model.stream('s1').push(snapshot('s1', 9), { kind: 'ended', reason: 'unavailable' })
    await drain(frames, 3)
    expect(w.clock.waits.slice(-2)).toEqual([2000, 2000])
    stop()
  })

  it('stream, waiting to observe again, attempts used up: refresh-exhausted', async () => {
    const w = world(new FakeLog(), { maxAttempts: 1 })
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'capacity' })
    expect(kinds(await drain(frames, 3))).toEqual(['refreshing', 'end:refresh-exhausted'])
  })

  it('stream, observing, observer-closed from the producer: as a stream that ended (its own abort delivers nothing)', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'observer-closed' })
    expect(kinds(await drain(frames, 3))).toEqual(['state', 'refreshing'])
    stop()
  })

  it('stream, observing, the stream ended and its iterator returns: the end is delivered once, nothing after it', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    const s1 = w.model.stream('s1')
    s1.push({ kind: 'ended', reason: 'producer-ended', value: null })
    s1.stop()
    expect(kinds(await drain(frames, 3))).toEqual(['state', 'refreshing'])
    expect(w.diagnostics).toEqual([])
    stop()
  })

  it('stream, the old subscription answers its own abort with observer-closed: that frame is not delivered', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').answerAbort({ kind: 'ended', reason: 'observer-closed' })
    w.log.append(mainCall('m-2'))
    w.model.answer('m-2', stream('s2'))
    w.notices.commit('call.bound')
    expect(kinds(await drain(frames, 3))).toEqual(['state'])
    expect(w.model.stream('s1').signal.aborted).toBe(true)
    expect(w.diagnostics).toEqual([])
    stop()
  })

  it('stream, observing, a Model value with no model-output-v1 projection: ends with unavailable', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    const unreadable = delta('s1', 2)
    unreadable.value.outputCursor = '02'
    w.model.stream('s1').push(unreadable)
    expect(kinds(await drain(frames, 2))).toEqual(['end:unavailable'])
    expect([w.model.open, w.notices.active]).toEqual([0, 0])
  })

  it('stream, observing, the Model withdrew the observer: ends with denied', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'denied' })
    expect(kinds(await drain(frames, 2))).toEqual(['end:denied'])
    expect(w.model.open).toBe(0)
  })
})

describe('abort while observing', () => {
  it('an abort while the observer holds a frame ends at the next read, with no subscription or wait left', async () => {
    const controller = new AbortController()
    const w = world(new FakeLog())
    const frames = await observing(w, controller.signal)
    controller.abort()
    expect(await frames.next()).toEqual({ done: true, value: undefined })
    expect([w.model.open, w.notices.active, w.clock.pending]).toEqual([0, 0, 0])
  })

  it('an abort while the observer holds a frame and no target is set ends at the next read, with no wait started', async () => {
    const controller = new AbortController()
    const w = world(new FakeLog(started('run_1')))
    const frames = await open(w, controller.signal)
    await take(frames)
    controller.abort()
    expect(await frames.next()).toEqual({ done: true, value: undefined })
    expect(w.clock.waits).toEqual([])
  })

  it('drops the subscription, the notice and the waits, and ends without a reason', async () => {
    const controller = new AbortController()
    const w = world(new FakeLog())
    const frames = await observing(w, controller.signal)
    const next = frames.next()
    await settle()
    controller.abort()
    expect(await next).toEqual({ done: true, value: undefined })
    expect([w.model.open, w.notices.active, w.clock.pending]).toEqual([0, 0, 0])
  })

  it('tears down once: the abort and the end of the frames together unsubscribe the notice a single time', async () => {
    const controller = new AbortController()
    const w = world(new FakeLog())
    const frames = await observing(w, controller.signal)
    controller.abort()
    expect(await frames.next()).toEqual({ done: true, value: undefined })
    expect(w.notices.unsubscriptions).toBe(1)
  })
})

describe('the frames of the Model stream', () => {
  it('a snapshot is sent as a snapshot of the model-output-v1 projection, with the projected value', async () => {
    const w = world(new FakeLog(started('run_1'), mainCall('m-1')))
    w.model.answer('m-1', stream('s1'))
    const frames = await open(w)
    await take(frames)
    await settle()
    w.model.stream('s1').push(snapshot('s1', 1))
    const [step] = await drain(frames, 1)
    expect(step?.done === true ? null : step?.value).toEqual({
      kind: 'snapshot',
      projection: 'model-output-v1',
      value: expect.objectContaining({ kind: 'object' }),
    })
    expect(text(step)).toContain('"phase":"running"')
    stop()
  })

  it('a delta is sent as a delta of the model-output-v1 projection, with the projected value', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push(delta('s1', 2))
    const [step] = await drain(frames, 1)
    expect(step?.done === true ? null : step?.value).toEqual({
      kind: 'delta',
      projection: 'model-output-v1',
      value: expect.objectContaining({ kind: 'object' }),
    })
    stop()
  })

  it('a snapshot in a new phase is preceded by the state in that phase', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push(snapshot('s1', 2, 'settled'))
    const steps = await drain(frames, 3)
    expect(steps.map(step => step.value)).toEqual([
      expect.objectContaining({ kind: 'state', phase: 'settled', target: expect.anything() }),
      expect.objectContaining({ kind: 'snapshot' }),
    ])
    stop()
  })
})

describe('a stream that breaks', () => {
  it('an observer that throws while the frames are read ends the stream: state, refreshing', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').fail(new Error('observer broke'))
    expect(kinds(await drain(frames, 3))).toEqual(['state', 'refreshing'])
    stop()
  })

  it('an observer that throws when asked to observe ends the stream the same way', async () => {
    const w = world(new FakeLog(started('run_1'), mainCall('m-1')))
    w.model.answer('m-1', stream('s1'))
    w.model.observeFault = new Error('observer refused')
    const frames = await open(w)
    expect(kinds(await drain(frames, 3))).toEqual(['state', 'state', 'refreshing'])
    stop()
  })

  it('an observer that throws once the subscription was dropped delivers nothing', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').failOnAbort(new Error('torn down'))
    w.log.append(mainCall('m-2'))
    w.model.answer('m-2', stream('s2'))
    w.notices.commit('call.bound')
    expect(kinds(await drain(frames, 3))).toEqual(['state'])
    expect(w.diagnostics).toEqual([])
    stop()
  })
})
