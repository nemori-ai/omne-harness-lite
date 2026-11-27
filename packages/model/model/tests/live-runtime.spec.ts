import { describe, expect, it } from 'vitest'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { eventually } from './runtime-fixture.ts'
import { liveFixture, saved, say, seconds, show, transcript } from './live-fixture.ts'
import { callId, instance, op, request, unbox } from './memory-fixture.ts'

type Commands = ModelCommands<ReturnType<typeof liveFixture>['principal']>
const lastSaved = (f: ReturnType<typeof liveFixture>) =>
  Math.max(0, ...f.deliveries.filter(each => each.answer === 'saved').map(each => each.to))

// Each property below is one the LiveCall model checks; its test is what keeps the code from leaving it.
describe('a live call holds the properties of its model', () => {
  it('opens at most one upstream session: a successor sends only what never materialized', async () => {
    let materializing = false
    const stuck: (commands: Commands) => Commands = commands => ({
      ...commands,
      recordMaterialization: () => {
        materializing = true
        return new Promise(() => {})
      },
    })
    const before = liveFixture({ wrap: stuck })
    await before.admitted()
    void before.drive()
    await eventually(() => materializing)
    const successor = before.restart()
    await eventually(() => before.upstream.seen.opens === 1)
    before.upstream.play({ kind: 'opened', expiresAt: null }, { kind: 'closed' })
    expect(await successor).toEqual({ ok: undefined })
    expect(before.upstream.seen.opens).toBe(1)
    expect((await before.settlement()).termination).toEqual({ kind: 'completed', reason: 'stop' })

    const after = liveFixture()
    await after.admitted()
    const first = after.drive()
    await after.open()
    expect(await after.restart()).toEqual({ ok: undefined })
    expect(after.upstream.seen.opens).toBe(1)
    after.answer(() => 'waiting')
    after.upstream.play(transcript('late'), { kind: 'closed' })
    await first
    await eventually(() => !after.holds())
    const delivered = after.deliveries.length
    after.advance(10)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(after.deliveries).toHaveLength(delivered)
    expect((await after.settlement()).termination).toMatchObject({
      kind: 'failed',
      fault: { cause: 'runtime-lost' },
    })
  })

  it('sends a command at most once: the same id again answers what became of it', async () => {
    const f = liveFixture()
    await f.admitted()
    void f.drive()
    await f.open()
    const id = op('say-once')
    const answers = [await f.command(id), await f.command(id), await f.command(id)]
    expect(answers).toEqual([
      { ok: { state: 'taken' } },
      { ok: { state: 'seen', outcome: 'pending' } },
      { ok: { state: 'seen', outcome: 'pending' } },
    ])
    expect(f.upstream.seen.sent.map(each => each.id)).toEqual([id])
    f.upstream.play({ kind: 'command', id, outcome: 'accepted' })
    await eventually(() => saved(f.deliveries).includes('2 command'))
    expect(await f.command(id)).toEqual({ ok: { state: 'seen', outcome: 'accepted' } })
    expect(f.upstream.seen.sent).toHaveLength(1)
  })

  it('releases an event only once the receiver saved it: an unknown answer redelivers the same run', async () => {
    const f = liveFixture()
    let unknownOnce = true
    f.answer(frames => {
      if (unknownOnce && frames.some(frame => 'seq' in frame && frame.seq === 3)) {
        unknownOnce = false
        return 'unknown'
      }
      return 'saved'
    })
    await f.admitted()
    void f.drive()
    await f.open()
    f.upstream.play(transcript('a'), transcript('b'))
    await eventually(() => f.deliveries.some(each => each.answer === 'unknown'))
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(f.deliveries.filter(each => each.from <= 3 && each.to >= 3)).toHaveLength(1)
    f.advance(10)
    await eventually(() => saved(f.deliveries).includes('3 transcript'))
    const third = f.deliveries.filter(each => each.from <= 3 && each.to >= 3)
    expect(third.map(each => each.answer)).toEqual(['unknown', 'saved'])
    expect(third[1]).toMatchObject({
      from: third[0]?.from,
      to: third[0]?.to,
      frames: third[0]?.frames,
    })
    expect(saved(f.deliveries)).toEqual(['1 started', '2 transcript', '3 transcript'])
  })

  it('writes a gap where it dropped events, so the receiver never skips one silently', async () => {
    const f = liveFixture({ capacity: 2 })
    let open = false
    f.answer(() => (open ? 'saved' : 'waiting'))
    await f.admitted()
    void f.drive()
    f.upstream.play({ kind: 'opened', expiresAt: null })
    await eventually(() => f.deliveries.length === 1)
    f.upstream.play(...['b', 'c', 'd', 'e', 'f'].map(transcript))
    await eventually(() => f.upstream.pending() === 0)
    open = true
    f.advance(10)
    await eventually(() => saved(f.deliveries).length === 3)
    expect(saved(f.deliveries)).toEqual(['1 started', 'gap 2-5', '6 transcript'])
  })

  it('pushes no result while the body still holds an event: the outcome reaches the receiver first', async () => {
    const f = liveFixture()
    const id = op('say-then-close')
    let first = true
    f.answer(frames => {
      if (first && frames.some(frame => 'seq' in frame && frame.event.t === 'command')) {
        first = false
        return 'waiting'
      }
      return 'saved'
    })
    await f.admitted()
    const driven = f.drive()
    await f.open()
    await f.command(id)
    f.upstream.play({ kind: 'command', id, outcome: 'accepted' }, { kind: 'closed' })
    expect(await driven).toEqual({ ok: undefined })
    expect((await f.settlement()).events).toEqual({ last: 2 })
    expect(f.holds()).toBe(true)
    expect(f.exits()).toEqual([])
    f.advance(10)
    await eventually(() => !f.holds())
    expect(f.exits()).toEqual([{ tenant: f.tenant, call: f.admit.call }])
    expect(saved(f.deliveries)).toEqual(['1 started', '2 command'])
  })

  it('settles as completed only on the upstream close: a lost body or connection is a failure', async () => {
    const killed = liveFixture()
    await killed.admitted()
    void killed.drive()
    await killed.open()
    killed.upstream.play(transcript('heard'))
    await eventually(() => saved(killed.deliveries).length === 2)
    expect(await killed.restart(instance('successor'))).toEqual({ ok: undefined })
    const lost = await killed.settlement()
    expect(lost.termination).toMatchObject({ kind: 'failed', fault: { cause: 'runtime-lost' } })
    expect(lost.events).toBe('unknown')
    const [dispatch] = unbox(await killed.provider.runtime.calls.dispatches(killed.admit))
    expect(dispatch?.account).toBeNull()

    const cut = liveFixture()
    await cut.admitted()
    const driven = cut.drive()
    await cut.open()
    cut.upstream.play('lost')
    expect(await driven).toEqual({ ok: undefined })
    expect((await cut.settlement()).termination).toMatchObject({
      kind: 'failed',
      fault: { cause: 'stream-lost', diagnostic: 'live-connection-lost' },
    })
  })

  it('shows an observer the call as the store has it once the session opens', async () => {
    const f = liveFixture()
    const { reference } = await f.admitted()
    void f.drive()
    await eventually(() => f.holds())
    await new Promise(resolve => setTimeout(resolve, 5))
    const { principal, tenant } = f
    const route = unbox(
      await f.provider.runtime.instances.connect({ principal, tenant, reference }),
    )
    if (route.kind !== 'live') throw new Error(`no route: ${route.kind}`)
    const signal = new AbortController().signal
    const watching = route.handle.observe({ ...f.target, signal })[Symbol.asyncIterator]()
    const stored = await f.state()
    expect((await watching.next()).value).toMatchObject({
      kind: 'snapshot',
      value: { state: { revision: stored.revision, phase: 'running' } },
    })
    await watching.return?.()
  })

  it('fails as upstream-unavailable when the session has not opened by the open deadline', async () => {
    const f = liveFixture()
    await f.admitted()
    const driven = f.drive()
    await eventually(() => f.holds())
    f.advance(5000)
    expect(await driven).toEqual({ ok: undefined })
    expect((await f.settlement()).termination).toMatchObject({
      kind: 'failed',
      fault: { cause: 'upstream-unavailable', diagnostic: 'live-open-deadline' },
    })
  })

  it('lets go of the session and of every timer once it settles and exits', async () => {
    const f = liveFixture()
    await f.admitted()
    const driven = f.drive()
    await f.open()
    f.upstream.play(transcript('a'), { kind: 'closed' })
    expect(await driven).toEqual({ ok: undefined })
    await eventually(() => !f.holds())
    expect(f.upstream.seen.drops).toBe(1)
    expect(f.assembly.controls.clock.pending()).toBe(0)
  })

  it('takes a delivery that throws as an unknown answer, and delivers the same run once the wait is over', async () => {
    const f = liveFixture()
    let thrown = false
    f.answer(() => {
      if (thrown) return 'saved'
      thrown = true
      throw new Error('synthetic-receiver-failure')
    })
    await f.admitted()
    void f.drive()
    await eventually(() => f.upstream.seen.opens === 1)
    f.upstream.play({ kind: 'opened', expiresAt: null })
    await eventually(() => thrown)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(f.deliveries).toEqual([])
    f.advance(10)
    await eventually(() => f.deliveries.length === 1)
    expect(f.deliveries[0]).toMatchObject({ from: 1, to: 1, answer: 'saved' })
  })

  it('makes a lost tail visible: the settlement numbers events the receiver never saved', async () => {
    const f = liveFixture()
    f.answer(frames =>
      frames.some(frame => 'seq' in frame && frame.seq === 2) ? 'waiting' : 'saved',
    )
    await f.admitted()
    const driven = f.drive()
    await f.open()
    f.upstream.play(transcript('kept back'), { kind: 'closed' })
    expect(await driven).toEqual({ ok: undefined })
    f.advance(7000)
    await eventually(() => !f.holds())
    expect(f.assembly.controls.clock.pending()).toBe(0)
    expect((await f.settlement()).events).toEqual({ last: 2 })
    expect(lastSaved(f)).toBe(1)
  })

  for (const fault of ['read', 'send'] as const)
    it(`treats a ${fault} that throws inside the body as a lost connection`, async () => {
      const f = liveFixture()
      await f.admitted()
      const driven = f.drive()
      await f.open()
      if (fault === 'read') f.upstream.play('throws')
      else {
        f.upstream.seen.sendThrows = true
        await f.command(op('say-throws'))
      }
      expect(await driven).toEqual({ ok: undefined })
      expect((await f.settlement()).termination).toMatchObject({
        kind: 'failed',
        fault: { cause: 'stream-lost' },
      })
    })

  for (const when of ['open', 'connecting'] as const)
    it(`settles a cancel made while ${when} even when the upstream never closes`, async () => {
      const f = liveFixture()
      await f.admitted()
      const driven = f.drive()
      if (when === 'open') await f.open()
      else await eventually(() => f.upstream.seen.opens === 1)
      const cancelled = unbox(await f.cancel())
      if (when === 'connecting') f.upstream.play({ kind: 'opened', expiresAt: null })
      await eventually(() => f.upstream.seen.closes === 1)
      f.advance(6000)
      expect(await driven).toEqual({ ok: undefined })
      expect((await f.settlement()).termination).toEqual({
        kind: 'interrupted',
        control: cancelled.kind === 'requested' ? cancelled.operation : null,
      })
    })
})

it('closes on a cancel recorded before its body was held', async () => {
  let early: ReturnType<Commands['control']> | undefined
  const f = liveFixture({
    onOpen: commands => {
      const target = { principal: f.principal, tenant: f.tenant, call: f.admit.call }
      early = commands.control({ ...target, operation: op('early-cancel'), intent: 'cancel' })
    },
  })
  await f.admitted()
  const driven = f.drive()
  await eventually(() => f.upstream.seen.opens === 1)
  expect(await early).toMatchObject({ ok: { kind: 'requested', intent: 'cancel' } })
  f.upstream.play({ kind: 'opened', expiresAt: null })
  await eventually(() => f.upstream.seen.closes === 1)
  f.upstream.play({ kind: 'closed' })
  expect(await driven).toEqual({ ok: undefined })
  expect((await f.settlement()).termination).toEqual({
    kind: 'interrupted',
    control: op('early-cancel'),
  })
})

describe('the usage and the planned stop of a live call', () => {
  const usageOf = async (f: ReturnType<typeof liveFixture>) =>
    unbox(await f.provider.runtime.calls.dispatches(f.admit))[0]?.account?.usage ?? null
  const audio = (lexeme: string) => [{ name: 'audio', state: 'known', lexeme, unit: 'second' }]

  for (const ending of ['closed', 'lost'] as const)
    it(`keeps the last usage only when the upstream close was seen: ${ending}`, async () => {
      const f = liveFixture()
      await f.admitted()
      const driven = f.drive()
      await f.open()
      f.upstream.play(seconds('2'), seconds('3'), ending === 'closed' ? { kind: 'closed' } : 'lost')
      expect(await driven).toEqual({ ok: undefined })
      expect(await usageOf(f)).toEqual(ending === 'closed' ? audio('3') : null)
    })

  it('takes a usage before the session opened as out of phase', async () => {
    const f = liveFixture()
    await f.admitted()
    const driven = f.drive()
    await eventually(() => f.upstream.seen.opens === 1)
    f.upstream.play(seconds('1'))
    expect(await driven).toEqual({ ok: undefined })
    expect((await f.settlement()).termination).toMatchObject({
      kind: 'failed',
      fault: { cause: 'upstream-protocol' },
    })
  })

  for (const closes of [true, false])
    it(`asks the upstream to close on a planned stop and settles as a lost runtime${closes ? ', keeping the usage of the close' : ' at the close deadline'}`, async () => {
      const f = liveFixture()
      await f.admitted()
      const stop = new AbortController()
      const driven = f.drive(stop.signal)
      await f.open()
      stop.abort()
      await eventually(() => f.upstream.seen.closes === 1)
      if (closes) f.upstream.play(seconds('4'), { kind: 'closed' })
      else f.advance(6000)
      expect(await driven).toEqual({ ok: undefined })
      const settled = await f.settlement()
      expect(settled.termination).toMatchObject({
        kind: 'failed',
        fault: { cause: 'runtime-lost' },
      })
      expect(settled.events).toEqual({ last: 1 })
      expect(await usageOf(f)).toEqual(closes ? audio('4') : null)
    })
})

describe('the three entries of a running live call', () => {
  it('refuses a medium the profile does not take in, and passes the others to the session', async () => {
    const f = liveFixture()
    await f.admitted()
    void f.drive()
    await f.open()
    const media = unbox(
      await f.provider.live.media({ principal: f.principal, tenant: f.tenant, call: f.admit.call }),
    )
    const bytes = new Uint8Array([1, 2])
    expect(media.write({ modality: 'image', bytes })).toEqual({ refused: 'modality' })
    expect(media.write({ modality: 'voice', bytes })).toBe('sent')
    expect(f.upstream.seen.media).toEqual([{ modality: 'voice', bytes }])
    unbox(await f.provider.live.end({ ...f.target, operation: op('end') }))
    expect(media.write({ modality: 'voice', bytes })).toBe('dropped')
    expect(f.upstream.seen.media).toHaveLength(1)
    media.release()
  })

  it('refuses a command outside the profile before anything else, in every phase', async () => {
    const f = liveFixture()
    const modality = { failure: { kind: 'invalid', field: 'content', reason: 'modality' } }
    await f.admitted()
    expect(await f.command(op('picture-admitted'), show())).toEqual(modality)
    expect(await f.command(op('words-admitted'))).toEqual({
      failure: { kind: 'unavailable', dependency: 'live-call', diagnostic: 'not-in-this-process' },
    })
    const driven = f.drive()
    await f.open()
    expect(await f.command(op('picture-open'), show())).toEqual(modality)
    f.upstream.play({ kind: 'closed' })
    expect(await driven).toEqual({ ok: undefined })
    await eventually(() => !f.holds())
    expect(await f.command(op('picture-settled'), show())).toEqual(modality)
    expect(await f.command(op('words-settled'))).toEqual({
      failure: { kind: 'invalid', field: 'phase', reason: 'settled' },
    })
    expect(f.upstream.seen.sent).toEqual([])
  })

  it('records a cancel when the receiver refuses the events, and the call ends interrupted', async () => {
    const f = liveFixture()
    f.answer(() => 'refused')
    await f.admitted()
    const driven = f.drive()
    f.upstream.play({ kind: 'opened', expiresAt: null })
    await eventually(() => f.upstream.seen.closes === 1)
    expect((await f.state()).control).toMatchObject({ kind: 'requested', intent: 'cancel' })
    f.upstream.play({ kind: 'closed' })
    expect(await driven).toEqual({ ok: undefined })
    expect((await f.settlement()).termination).toMatchObject({ kind: 'interrupted' })
    expect(f.deliveries.map(each => each.answer)).toEqual(['refused'])
  })

  it('ends a call only while it is open, and completes it on the upstream close', async () => {
    const f = liveFixture()
    const end = (label: string) =>
      f.provider.live.end({
        principal: f.principal,
        tenant: f.tenant,
        call: f.admit.call,
        operation: op(label),
      })
    const ended = { ok: { kind: 'requested', intent: 'end', operation: op('end-open') } }
    await f.admitted()
    expect(await end('end-admitted')).toEqual({
      failure: { kind: 'unavailable', dependency: 'live-call', diagnostic: 'not-in-this-process' },
    })
    const driven = f.drive()
    await eventually(() => f.holds())
    expect(await end('end-connecting')).toEqual({
      failure: { kind: 'invalid', field: 'phase', reason: 'not-open' },
    })
    f.upstream.play({ kind: 'opened', expiresAt: null })
    await eventually(() => f.deliveries.length > 0)
    expect(await end('end-open')).toMatchObject(ended)
    await eventually(() => f.upstream.seen.closes === 1)
    expect(await end('end-closing')).toMatchObject(ended)
    f.upstream.play({ kind: 'closed' })
    expect(await driven).toEqual({ ok: undefined })
    expect((await f.settlement()).termination).toEqual({ kind: 'completed', reason: 'stop' })
    await eventually(() => !f.holds())
    expect(await end('end-settled')).toMatchObject(ended)
    expect(f.upstream.seen.closes).toBe(1)
  })

  it('hands the frames of the session to the holder of its media until released, and ends them when the body exits', async () => {
    const f = liveFixture()
    const target = { principal: f.principal, tenant: f.tenant, call: f.admit.call }
    const voice = (byte: number) => ({ modality: 'voice' as const, bytes: new Uint8Array([byte]) })
    await f.admitted()
    const driven = f.drive()
    await f.open()
    const held = unbox(await f.provider.live.media(target))
    const kept = unbox(await f.provider.live.media(target))
    const frames = held.frames[Symbol.asyncIterator]()
    const later = kept.frames[Symbol.asyncIterator]()
    f.upstream.play(
      { kind: 'media', frame: voice(1) },
      { kind: 'media', frame: voice(2) },
      transcript('x'),
    )
    await eventually(() => f.deliveries.length > 1)
    expect(await frames.next()).toEqual({ done: false, value: voice(1) })
    expect(await frames.next()).toEqual({ done: false, value: voice(2) })
    const waiting = frames.next()
    f.upstream.play({ kind: 'media', frame: voice(3) })
    expect(await waiting).toEqual({ done: false, value: voice(3) })
    held.release()
    held.release()
    f.upstream.play({ kind: 'media', frame: voice(4) })
    for (const byte of [1, 2, 3, 4])
      expect(await later.next()).toEqual({ done: false, value: voice(byte) })
    expect(await frames.next()).toEqual({ done: true, value: undefined })
    const open = later.next()
    f.upstream.play({ kind: 'closed' })
    expect(await driven).toEqual({ ok: undefined })
    expect(await open).toEqual({ done: true, value: undefined })
  })

  it('answers the same failure of the store for a call it does not know, in all three entries', async () => {
    const f = liveFixture()
    await f.admitted()
    const unknown = { ...f.target, call: callId('never') }
    const answers = [
      await f.provider.live.command({ ...unknown, operation: op('c'), command: say('x') }),
      await f.provider.live.end({ ...unknown, operation: op('e') }),
      await f.provider.live.media(unknown),
    ]
    expect(answers.every(answer => 'failure' in answer)).toBe(true)
    expect(answers[1]).toEqual(answers[0])
    expect(answers[2]).toEqual(answers[0])
  })

  it('answers a live command to a call that is not live as one without a body here', async () => {
    const f = liveFixture()
    await f.admitted()
    const chat = { ...f.admit, operation: op('admit-chat'), call: callId('chat'), request }
    unbox(await f.provider.runtime.calls.admit(chat))
    expect(
      await f.provider.live.command({
        ...f.target,
        call: chat.call,
        operation: op('c'),
        command: say('x'),
      }),
    ).toEqual({
      failure: { kind: 'unavailable', dependency: 'live-call', diagnostic: 'not-in-this-process' },
    })
  })

  it('refuses a new command while closing, and one that mixes a modality the profile does not take', async () => {
    const f = liveFixture()
    await f.admitted()
    void f.drive()
    await f.open()
    const mixed = { ...say('x'), content: [...say('x').content, ...show().content] }
    expect(await f.command(op('mixed'), mixed)).toEqual({
      failure: { kind: 'invalid', field: 'content', reason: 'modality' },
    })
    unbox(await f.provider.live.end({ ...f.target, operation: op('end') }))
    expect(await f.command(op('late'))).toEqual({
      failure: { kind: 'invalid', field: 'phase', reason: 'closing' },
    })
  })

  it('records no end while a planned stop closes the call', async () => {
    const f = liveFixture()
    await f.admitted()
    const stop = new AbortController()
    void f.drive(stop.signal)
    await f.open()
    stop.abort()
    await eventually(() => f.upstream.seen.closes === 1)
    expect(await f.provider.live.end({ ...f.target, operation: op('end') })).toEqual({
      ok: { kind: 'none' },
    })
    expect((await f.state()).control).toEqual({ kind: 'none' })
  })

  it('does not close for an end when the store answers a cancel recorded elsewhere', async () => {
    const f = liveFixture()
    await f.admitted()
    void f.drive()
    await f.open()
    unbox(await f.elsewhere().runtime.calls.cancel({ ...f.target, operation: op('far') }))
    expect(await f.provider.live.end({ ...f.target, operation: op('end') })).toMatchObject({
      ok: { kind: 'requested', intent: 'cancel' },
    })
    expect(f.upstream.seen.closes).toBe(0)
  })

  it('answers that the call runs elsewhere when this process does not hold its body', async () => {
    const f = liveFixture()
    await f.admitted()
    void f.drive()
    await f.open()
    const elsewhere = {
      failure: { kind: 'unavailable', dependency: 'live-call', diagnostic: 'not-in-this-process' },
    }
    const other = f.elsewhere().live
    expect(await other.command({ ...f.admit, operation: op('say'), command: say('x') })).toEqual(
      elsewhere,
    )
    expect(await other.media(f.target)).toEqual(elsewhere)
  })
})
