// Session observation, block 2 of #1248: the rest of the result table and the stream axis of
// RFC-0015 §13 cell by cell (C9b), the two properties of model three that live here (C10b) and the
// stream half of teardown (C11b). The case names start with the cell they cover.
import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import {
  createSessionObservation,
  type SessionObservationEnd,
  type SessionObservationFrame,
} from '@omne-harness/session-observation'
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

/** Ends the observation the way an observer does: by its signal. */
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

/** The frames that come without any wait running out, up to `count` or until nothing more comes. */
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

/** A next() that did not settle in `drain`, kept so the following read does not skip a frame. */
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

/** An observation that is observing `s1`, the stream of main call `m-1`, past its first snapshot. */
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

describe('the result table with the Model (C9b)', () => {
  it('result, new main call, stream given, no target: state, then subscribe and snapshot; the budget resets', async () => {
    const w = world(new FakeLog())
    await observing(w)
    expect(w.model.asked).toEqual(['m-1'])
    expect(w.model.open).toBe(1)
    stop()
  })

  it('result, new main call, stream given, has target (不发旧帧, C10b): the old subscription goes, its late frame does not come', async () => {
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

  it('result, new main call, no stream, has target (不停在旧的调用上, C10b): the old target goes; state and refreshing', async () => {
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

  it('result, current timeout: counts as nothing new, with a diagnostic', async () => {
    const log = new FakeLog(started('run_1'), mainCall('m-1'))
    const w = world(log, { currentTimeout: 5000 })
    w.model.answer('m-1', 'hang')
    const frames = await open(w)
    const first = take(frames)
    await settle()
    expect(w.clock.waits).toEqual([5000])
    w.clock.elapse()
    expect(await first).toMatchObject({ value: { kind: 'state', target: null } })
    expect(w.diagnostics).toContainEqual({ code: 'observation.current-timeout', detail: 'm-1' })
    stop()
  })

  it('result, Model denied: ends with denied', async () => {
    const w = world(new FakeLog(started('run_1'), mainCall('m-1')))
    w.model.answer('m-1', { failure: { kind: 'denied' } })
    expect(await (await open(w)).next()).toEqual({ done: true, value: 'denied' })
    expect(w.notices.active).toBe(0)
  })

  it('result, Model answers the reference invalid: ends with unavailable', async () => {
    const w = world(new FakeLog(started('run_1'), mainCall('m-1')))
    w.model.answer('m-1', { failure: { kind: 'invalid', reason: 'malformed' } })
    expect(await (await open(w)).next()).toEqual({ done: true, value: 'unavailable' })
  })

  it('result, Model has the call registered but not accepted: no stream yet, the observation goes on', async () => {
    const w = world(new FakeLog(started('run_1'), mainCall('m-1')))
    w.model.answer('m-1', { failure: { kind: 'invalid', reason: 'not-accepted' } })
    const frames = await open(w)
    expect(await take(frames)).toMatchObject({ value: { kind: 'state', target: null } })
    stop()
  })
})

describe('the stream axis (C9b)', () => {
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
    expect(kinds(await drain(frames, 3))).toEqual(['gap', 'refreshing'])
    w.clock.elapse()
    await settle()
    expect(w.model.streams.map(s => s.ref)).toEqual(['s1', 's1'])
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

  it('stream, observing, the Model withdrew the observer: ends with denied', async () => {
    const w = world(new FakeLog())
    const frames = await observing(w)
    w.model.stream('s1').push({ kind: 'ended', reason: 'denied' })
    expect(kinds(await drain(frames, 2))).toEqual(['end:denied'])
    expect(w.model.open).toBe(0)
  })
})

describe('abort while observing (C11b)', () => {
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
})
