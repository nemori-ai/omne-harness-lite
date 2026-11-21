import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type {
  ContentReference,
  EngineDeclaration,
  EngineInput,
  EngineOutput,
  Preprocess,
} from '@omne-harness/media-contract'
import { createScriptedEngine } from '@omne-harness/media-contract/testing'
import { PNG, T1, T2, failureOf, ok, png, wav, world, type World } from './world.ts'

const ENGINE = 'voice.fixture'
const definitionOf = (revision: string) => ({ name: 'voice', revision })
const CONVERTED: EngineOutput = { kind: 'converted', text: 'hello there', derived: [] }
const live = () => new AbortController().signal
const tick = () => new Promise(resolve => setImmediate(resolve))
/** With the signature and two sizes it makes a stand-in picture of 65 bytes: one over the limit of the world. */
const FILL = Array.from({ length: 55 }, () => 0)

/** A tenant whose voice has a definition in force, and the engine it names, answering as the test says. */
function converting(
  w: World,
  answer: (input: EngineInput) => Promise<EngineOutput> = async () => CONVERTED,
  declaration: Partial<EngineDeclaration> = {},
) {
  const scripted = createScriptedEngine(answer, { name: ENGINE, ...declaration })
  const registration = w.engines.contribute(scripted.engine)
  const inForce = { revision: '1' }
  const asked: unknown[] = []
  w.conversion.definitions = {
    resolve: async input => {
      asked.push(input)
      return succeed({
        kind: 'resolved',
        definition: definitionOf(inForce.revision),
        engine: ENGINE,
        parameters: { language: 'en' },
        egress: { kind: 'in-process' },
      })
    },
  }
  return { ...scripted, registration, inForce, asked }
}
const voice = async (w: World, upload = 'up-1', samples = 8, tenant = T1) =>
  (await w.staged(tenant, upload, wav(samples), 'audio/wav')).ref
const ensure = (w: World, ref: ContentReference, signal = live(), tenant = T1) =>
  w.media.representations.ensure({ access: { tenant, principal: 'someone' }, ref, signal })
const read = async (w: World, ref: ContentReference) =>
  ok(await w.media.representations.read({ tenant: T1, ref }))
const failed = (reason: string): Preprocess => ({ kind: 'failed', reason }) as Preprocess
/** Counts the abort listeners left on a signal. */
function counted(signal: AbortSignal = live()) {
  let left = 0
  const add = signal.addEventListener.bind(signal)
  const remove = signal.removeEventListener.bind(signal)
  signal.addEventListener = ((type: string, ...rest: [EventListener]) => {
    if (type === 'abort') left += 1
    add(type, ...rest)
  }) as typeof signal.addEventListener
  signal.removeEventListener = ((type: string, ...rest: [EventListener]) => {
    if (type === 'abort') left -= 1
    remove(type, ...rest)
  }) as typeof signal.removeEventListener
  return { signal, left: () => left }
}
/** An engine that answers when the test lets it. */
function held() {
  const gate = Promise.withResolvers<EngineOutput>()
  const signals: AbortSignal[] = []
  const answer = (input: EngineInput) => {
    signals.push(input.signal)
    return gate.promise
  }
  return { gate, signals, answer }
}

describe('making a representation ready, step by step', () => {
  it('refuses a medium that is not there, and the medium of another tenant, without asking anyone', async () => {
    const w = world()
    const { calls } = converting(w)
    const ref = await voice(w)
    expect(failureOf(await ensure(w, { ...ref, key: 'f'.repeat(32) }))).toBe('invalid-reference')
    expect(failureOf(await ensure(w, ref, live(), T2))).toBe('invalid-reference')
    expect(calls).toHaveLength(0)
  })

  it('step 1: no definition in force is not-needed; a definition that cannot be read is the basis unavailable', async () => {
    const w = world()
    const { calls } = converting(w)
    const inForce = w.conversion.definitions
    const ref = await voice(w)
    w.conversion.definitions = { resolve: async () => succeed({ kind: 'none' }) }
    expect(ok(await ensure(w, ref))).toEqual({ kind: 'not-needed' })
    w.conversion.definitions = {
      resolve: async () => ({ failure: { kind: 'unavailable', diagnostic: 'assets are away' } }),
    }
    expect(ok(await ensure(w, ref))).toEqual(failed('basis-unavailable'))
    w.conversion.definitions = { resolve: () => Promise.reject(new Error('boom')) }
    expect(ok(await ensure(w, ref))).toEqual(failed('basis-unavailable'))
    w.conversion.definitions = null
    expect(ok(await ensure(w, ref))).toEqual(failed('basis-unavailable'))
    w.conversion.definitions = inForce
    w.faults.methods.set('readLive', 'unavailable')
    expect(ok(await ensure(w, ref))).toEqual(failed('basis-unavailable'))
    expect(calls).toHaveLength(0)
  })

  it('steps 4 to 6: the engine gets this one medium, its parameters and who asks; the outcome is kept with where it came from', async () => {
    const w = world()
    const { calls, asked } = converting(w)
    const ref = await voice(w)
    const answer = ok(await ensure(w, ref))
    expect(asked).toEqual([{ tenant: T1, mediaType: 'audio/wav' }])
    expect(answer).toEqual({
      kind: 'done',
      representation: {
        definition: definitionOf('1'),
        engine: { name: ENGINE, revision: '1' },
        outcome: 'converted',
        text: 'hello there',
        others: [],
      },
    })
    expect(calls).toHaveLength(1)
    const [{ access, media, parameters }] = calls as [EngineInput]
    expect(access).toEqual({ tenant: T1, principal: 'someone' })
    expect(parameters).toEqual({ language: 'en' })
    expect({ mediaType: media.mediaType, bytes: media.bytes }).toEqual({
      mediaType: 'audio/wav',
      bytes: 52,
    })
    const parts: Uint8Array[] = []
    for await (const part of media.open()) parts.push(part)
    expect(Buffer.concat(parts).equals(Buffer.from(wav(8)))).toBe(true)
  })

  it('step 2: an outcome that is kept is answered again, by this process and by the next, without the engine', async () => {
    const w = world()
    const { calls } = converting(w)
    const ref = await voice(w)
    const first = ok(await ensure(w, ref))
    expect(ok(await ensure(w, ref))).toEqual(first)
    expect(await read(w, ref)).toEqual(first)
    w.restart()
    expect(ok(await ensure(w, ref))).toEqual(first)
    expect(calls).toHaveLength(1)
  })

  it('a medium that cannot be converted is an outcome too: it is kept and not tried again', async () => {
    const w = world()
    const { calls } = converting(w, async () => ({ kind: 'inconvertible' }))
    const ref = await voice(w)
    const first = ok(await ensure(w, ref))
    expect(first).toMatchObject({ kind: 'done', representation: { outcome: 'inconvertible' } })
    expect(ok(await ensure(w, ref))).toEqual(first)
    expect(calls).toHaveLength(1)
  })

  it('a new version of the definition is another representation; the old one stays', async () => {
    const w = world()
    const { calls, inForce } = converting(w)
    const ref = await voice(w)
    await ensure(w, ref)
    inForce.revision = '2'
    expect(ok(await ensure(w, ref))).toMatchObject({
      representation: { definition: definitionOf('2') },
    })
    inForce.revision = '1'
    expect(ok(await ensure(w, ref))).toMatchObject({
      representation: { definition: definitionOf('1') },
    })
    expect(calls).toHaveLength(2)
  })

  it('step 3: asked twice at a time, the engine converts once and both get the one outcome (ME-11)', async () => {
    const w = world()
    const { gate, answer } = held()
    const { calls } = converting(w, answer)
    const ref = await voice(w)
    const both = [ensure(w, ref), ensure(w, ref)] as const
    await tick()
    expect(await read(w, ref)).toEqual({ kind: 'running' })
    gate.resolve(CONVERTED)
    const [one, other] = await Promise.all(both)
    expect(ok(one)).toEqual(ok(other))
    expect(ok(one).kind).toBe('done')
    expect(calls).toHaveLength(1)
  })

  it('step 4: a definition in force whose engine is not there is the engine unavailable, never not-needed (ME-9)', async () => {
    const w = world()
    const { registration, calls } = converting(w)
    const ref = await voice(w)
    await registration.release()
    expect(ok(await ensure(w, ref))).toEqual(failed('engine-unavailable'))
    w.conversion.engines = null
    expect(ok(await ensure(w, ref))).toEqual(failed('engine-unavailable'))
    expect(await read(w, ref)).toEqual(failed('engine-unavailable'))
    expect(calls).toHaveLength(0)
  })

  it('step 4: an engine that does not take this type, or not this size, is unavailable for this medium', async () => {
    const w = world()
    const pdfOnly = converting(w, undefined, { accepts: ['application/pdf'] })
    const ref = await voice(w)
    expect(ok(await ensure(w, ref))).toEqual(failed('engine-unavailable'))
    await pdfOnly.registration.release()
    const small = converting(w, undefined, { maxBytes: 51 })
    expect(ok(await ensure(w, ref))).toEqual(failed('engine-unavailable'))
    expect([...pdfOnly.calls, ...small.calls]).toHaveLength(0)
    await small.registration.release()
    converting(w, undefined, { maxBytes: 52 })
    expect(ok(await ensure(w, ref)).kind).toBe('done')
  })

  it('step 4: an engine runs as many at a time as it declares, some more wait, and beyond that it is unavailable', async () => {
    const w = world()
    const { gate, answer } = held()
    const { calls } = converting(w, answer, { concurrency: 1 })
    const refs = [await voice(w, 'a', 8), await voice(w, 'b', 9), await voice(w, 'c', 10)]
    const running = ensure(w, refs[0]!)
    const waiting = ensure(w, refs[1]!)
    await tick()
    expect(ok(await ensure(w, refs[2]!))).toEqual(failed('engine-unavailable'))
    expect(calls).toHaveLength(1)
    gate.resolve(CONVERTED)
    expect(ok(await running).kind).toBe('done')
    expect(ok(await waiting).kind).toBe('done')
    expect(calls).toHaveLength(2)
  })
})

describe('a conversion ends without its engine when it must', () => {
  it('step 5: when its time is over it answers timeout, tells the engine, and does not wait for it', async () => {
    const w = world()
    const { answer, signals } = held()
    const { calls } = converting(w, answer)
    const ref = await voice(w)
    const asked = ensure(w, ref)
    await tick()
    w.elapse(4_999)
    await tick()
    expect(await read(w, ref)).toEqual({ kind: 'running' })
    w.elapse(1)
    expect(ok(await asked)).toEqual(failed('timeout'))
    expect(signals[0]?.aborted).toBe(true)
    expect(await read(w, ref)).toEqual(failed('timeout'))
    void ensure(w, ref)
    await tick()
    expect(calls).toHaveLength(2)
  })

  it('a finished conversion leaves no timer behind', async () => {
    const w = world()
    converting(w)
    await ensure(w, await voice(w))
    expect(w.timers).toEqual([])
  })

  it('cancel: the only one who waits stops the engine; one of two leaves alone and the other gets the outcome', async () => {
    const w = world()
    const { gate, answer, signals } = held()
    converting(w, answer)
    const ref = await voice(w)
    const alone = new AbortController()
    const asked = ensure(w, ref, alone.signal)
    await tick()
    alone.abort()
    expect(ok(await asked)).toEqual(failed('cancelled'))
    expect(signals[0]?.aborted).toBe(true)
    await tick()
    expect(await read(w, ref)).toEqual(failed('cancelled'))

    const leaving = new AbortController()
    const leaves = ensure(w, ref, leaving.signal)
    const stays = ensure(w, ref)
    await tick()
    leaving.abort()
    expect(ok(await leaves)).toEqual(failed('cancelled'))
    expect(signals[1]?.aborted).toBe(false)
    gate.resolve(CONVERTED)
    expect(ok(await stays).kind).toBe('done')
  })

  it('cancel: one who had left before asking starts nothing', async () => {
    const w = world()
    const { calls } = converting(w)
    expect(ok(await ensure(w, await voice(w), AbortSignal.abort()))).toEqual(failed('cancelled'))
    expect(calls).toHaveLength(0)
  })

  it('cancel: one who waits for a turn leaves the queue, and the turn goes to the next', async () => {
    const w = world({ conversion: { timeoutMs: 5_000, queueLimit: 2, inlineTextBytes: 16 } })
    const { gate, answer } = held()
    const { calls } = converting(w, answer, { concurrency: 1 })
    const refs = [await voice(w, 'a', 8), await voice(w, 'b', 9), await voice(w, 'c', 10)]
    const first = ensure(w, refs[0]!)
    const leaving = new AbortController()
    const second = ensure(w, refs[1]!, leaving.signal)
    const third = ensure(w, refs[2]!)
    await tick()
    leaving.abort()
    expect(ok(await second)).toEqual(failed('cancelled'))
    await tick()
    expect(await read(w, refs[1]!)).toEqual(failed('cancelled'))
    gate.resolve(CONVERTED)
    expect(ok(await first).kind).toBe('done')
    expect(ok(await third).kind).toBe('done')
    expect(calls).toHaveLength(2)
  })

  it('cancel: one who leaves after its turn came takes nobody out of the queue', async () => {
    const w = world({ conversion: { timeoutMs: 5_000, queueLimit: 2, inlineTextBytes: 16 } })
    const gates = [0, 1, 2].map(() => Promise.withResolvers<EngineOutput>())
    let asked = 0
    converting(w, () => gates[asked++]!.promise, { concurrency: 1 })
    const refs = [await voice(w, 'a', 8), await voice(w, 'b', 9), await voice(w, 'c', 10)]
    const first = ensure(w, refs[0]!)
    const leaving = new AbortController()
    const second = ensure(w, refs[1]!, leaving.signal)
    const third = ensure(w, refs[2]!)
    await tick()
    gates[0]!.resolve(CONVERTED)
    expect(ok(await first).kind).toBe('done')
    await tick()
    expect(asked).toBe(2)
    leaving.abort()
    expect(ok(await second)).toEqual(failed('cancelled'))
    await tick()
    gates[2]!.resolve(CONVERTED)
    expect(ok(await third).kind).toBe('done')
  })

  it('leaves no listener on the signal of who asked, nor on the engine, once it has answered', async () => {
    const w = world()
    converting(w)
    const lease = w.engines.borrow(ENGINE)!
    const engine = counted(lease.withdrawn)
    lease.release()
    const asking = counted()
    expect(ok(await ensure(w, await voice(w), asking.signal)).kind).toBe('done')
    expect([asking.left(), engine.left()]).toEqual([0, 0])
  })

  it('cancel: one who leaves the queue frees its place for the next to wait in', async () => {
    const w = world()
    const { gate, answer } = held()
    converting(w, answer, { concurrency: 1 })
    const refs = [await voice(w, 'a', 8), await voice(w, 'b', 9), await voice(w, 'c', 10)]
    const first = ensure(w, refs[0]!)
    const leaving = new AbortController()
    const second = ensure(w, refs[1]!, leaving.signal)
    await tick()
    leaving.abort()
    await second
    const third = ensure(w, refs[2]!)
    await tick()
    gate.resolve(CONVERTED)
    expect(ok(await first).kind).toBe('done')
    expect(ok(await third).kind).toBe('done')
  })

  it('cancel: one who leaves while the original is read stops the conversion before the engine is asked', async () => {
    const w = world()
    const { calls } = converting(w)
    const ref = await voice(w)
    const leaving = new AbortController()
    w.faults.hooks.set('open', async (real, ...args) => {
      leaving.abort()
      return real(...args)
    })
    expect(ok(await ensure(w, ref, leaving.signal))).toEqual(failed('cancelled'))
    await tick()
    w.faults.hooks.clear()
    expect(await read(w, ref)).toEqual(failed('cancelled'))
    expect(calls).toHaveLength(0)
  })

  it('an engine withdrawn while it converts: this once is unavailable, and the engine is gone when it gives the lease back', async () => {
    const w = world()
    const { answer } = held()
    const { registration } = converting(w, answer)
    const ref = await voice(w)
    const asked = ensure(w, ref)
    await tick()
    const gone = registration.release()
    expect(ok(await asked)).toEqual(failed('engine-unavailable'))
    await expect(gone).resolves.toBeUndefined()
    expect(await read(w, ref)).toEqual(failed('engine-unavailable'))
  })

  it('an engine withdrawn while a conversion waits for its turn is not asked for that one', async () => {
    const w = world()
    const { answer } = held()
    const { registration, calls } = converting(w, answer, { concurrency: 1 })
    const running = ensure(w, await voice(w, 'a', 8))
    const waiting = ensure(w, await voice(w, 'b', 9))
    await tick()
    void registration.release()
    expect(ok(await running)).toEqual(failed('engine-unavailable'))
    expect(ok(await waiting)).toEqual(failed('engine-unavailable'))
    expect(calls).toHaveLength(1)
  })

  it.each([
    ['unavailable', 'engine-unavailable'],
    ['error', 'engine-error'],
    ['outcome-unknown', 'outcome-unknown'],
  ] as const)(
    'the engine answering failed (%s) is %s, and nothing is kept',
    async (reason, said) => {
      const w = world()
      const { calls } = converting(w, async () => ({ kind: 'failed', reason }))
      const ref = await voice(w)
      expect(ok(await ensure(w, ref))).toEqual(failed(said))
      expect(ok(await ensure(w, ref))).toEqual(failed(said))
      expect(calls).toHaveLength(2)
    },
  )

  it('an engine that throws is an engine error', async () => {
    const w = world()
    converting(w, () => Promise.reject(new Error('boom')))
    expect(ok(await ensure(w, await voice(w)))).toEqual(failed('engine-error'))
  })
})

describe('step 6: what the engine hands back is checked, stored and kept', () => {
  it.each([
    ['no known kind', { kind: 'maybe' }],
    ['no known kind, though shaped like a conversion', { kind: 'maybe', text: '', derived: [] }],
    [
      'a medium with no bytes',
      { kind: 'converted', text: '', derived: [{ mediaType: 'image/png' }] },
    ],
    ['a medium that is nothing', { kind: 'converted', text: '', derived: [null] }],
    [
      'a medium of no type',
      { kind: 'converted', text: '', derived: [{ bytes: new Uint8Array([1]) }] },
    ],
    ['a failure of no known reason', { kind: 'failed', reason: 'tired' }],
    ['words that are no text', { kind: 'converted', text: 7, derived: [] }],
    ['no list of other media', { kind: 'converted', text: '' }],
    [
      'a medium of a type nobody knows',
      {
        kind: 'converted',
        text: '',
        derived: [{ mediaType: 'video/mp4', bytes: new Uint8Array([1]) }],
      },
    ],
    [
      'bytes that are not of the type they claim',
      {
        kind: 'converted',
        text: '',
        derived: [{ mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }],
      },
    ],
    [
      'a medium over the size limit',
      {
        kind: 'converted',
        text: '',
        derived: [{ mediaType: 'image/png', bytes: new Uint8Array([...PNG, 4, 3, ...FILL]) }],
      },
    ],
  ])('%s is an invalid result: nothing is stored, nothing is kept', async (_, output) => {
    const w = world()
    converting(w, async () => output as never)
    const ref = await voice(w)
    const before = await w.liveKeys()
    expect(ok(await ensure(w, ref))).toEqual(failed('invalid-result'))
    expect(await w.liveKeys()).toEqual(before)
    expect(await read(w, ref)).toEqual(failed('invalid-result'))
  })

  it('other media become media of their own, held in the name of the original; many words become one too', async () => {
    const w = world()
    const words = 'these are more words than fit in line'
    const picture = png(4, 3)
    converting(w, async () => ({
      kind: 'converted',
      text: words,
      derived: [{ mediaType: 'image/png', bytes: picture }],
    }))
    const ref = await voice(w)
    const answer = ok(await ensure(w, ref))
    if (answer.kind !== 'done' || answer.representation.outcome !== 'converted')
      throw new Error(JSON.stringify(answer))
    const { text, others } = answer.representation
    if (typeof text === 'string') throw new Error('the words stayed in line')
    expect(text).toMatchObject({ mediaType: 'text/plain', bytes: String(words.length) })
    expect(others).toMatchObject([{ mediaType: 'image/png', bytes: String(picture.byteLength) }])
    for (const made of [text, ...others])
      expect(ok(await w.media.custody.describe({ tenant: T1, ref: made })).state).toBe('held')
    expect(ok(await w.media.custody.describe({ tenant: T1, ref: text })).facts).toEqual({
      kind: 'file',
    })
    const read = ok(await w.media.variants.open({ tenant: T1, ref: text, target: null }))
    expect(Buffer.from(read.bytes).toString('utf8')).toBe(words)
  })

  it('a medium of exactly the size limit is taken', async () => {
    const w = world()
    const atLimit = new Uint8Array([...PNG, 4, 3, ...FILL.slice(1)])
    converting(w, async () => ({
      kind: 'converted',
      text: '',
      derived: [{ mediaType: 'image/png', bytes: atLimit }],
    }))
    expect(ok(await ensure(w, await voice(w)))).toMatchObject({
      representation: { others: [{ bytes: '64' }] },
    })
  })

  it('words within the line limit stay in line, to the byte', async () => {
    const w = world()
    converting(w, async () => ({ kind: 'converted', text: 'x'.repeat(16), derived: [] }))
    expect(ok(await ensure(w, await voice(w)))).toMatchObject({
      representation: { text: 'x'.repeat(16) },
    })
  })

  it('when the outcome cannot be kept the answer is a failure, and not known when the write is not known', async () => {
    const w = world()
    const { calls } = converting(w)
    const ref = await voice(w)
    w.faults.methods.set('recordRepresentation', 'unavailable')
    expect(ok(await ensure(w, ref))).toEqual(failed('basis-unavailable'))
    w.faults.methods.set('recordRepresentation', 'unknown')
    expect(ok(await ensure(w, ref))).toEqual(failed('outcome-unknown'))
    w.faults.methods.clear()
    expect(ok(await ensure(w, ref)).kind).toBe('done')
    expect(calls).toHaveLength(3)
  })

  it('when what the engine made cannot be stored, or the original cannot be read, the basis is unavailable', async () => {
    const w = world()
    const { calls } = converting(w, async () => ({
      kind: 'converted',
      text: '',
      derived: [{ mediaType: 'image/png', bytes: png(4, 3) }],
    }))
    const ref = await voice(w)
    w.faults.methods.set('insertUploading', 'unavailable')
    expect(ok(await ensure(w, ref))).toEqual(failed('basis-unavailable'))
    w.faults.methods.set('insertUploading', 'unknown')
    expect(ok(await ensure(w, ref))).toEqual(failed('outcome-unknown'))
    w.faults.methods.clear()
    w.faults.methods.set('readRepresentation', 'unavailable')
    expect(ok(await ensure(w, ref))).toEqual(failed('basis-unavailable'))
    w.faults.methods.clear()
    w.withdrawStore()
    expect(ok(await ensure(w, ref))).toEqual(failed('basis-unavailable'))
    expect(calls).toHaveLength(2)
    w.returnStore()
    w.faults.hooks.set('recordRepresentation', () => Promise.reject(new Error('boom')))
    expect(ok(await ensure(w, ref))).toEqual(failed('outcome-unknown'))
  })

  it('when many words cannot be stored the basis is unavailable, and not known when the write is not known', async () => {
    const w = world()
    converting(w, async () => ({ kind: 'converted', text: 'x'.repeat(17), derived: [] }))
    const ref = await voice(w)
    w.faults.methods.set('insertUploading', 'unavailable')
    expect(ok(await ensure(w, ref))).toEqual(failed('basis-unavailable'))
    w.faults.methods.set('insertUploading', 'unknown')
    expect(ok(await ensure(w, ref))).toEqual(failed('outcome-unknown'))
    w.faults.methods.clear()
    expect(ok(await ensure(w, ref)).kind).toBe('done')
  })

  it('an outcome another process kept first is the one answered', async () => {
    const w = world()
    const { calls } = converting(w)
    const ref = await voice(w)
    const theirs = {
      definition: definitionOf('1'),
      engine: { name: 'voice.other', revision: '9' },
      outcome: 'inconvertible' as const,
    }
    let reads = 0
    w.faults.hooks.set('readRepresentation', async (real, ...args) => {
      const [{ tenant }] = args as unknown as [{ tenant: string }]
      if (++reads === 2)
        await w.index.recordRepresentation({ tenant, key: ref.key, representation: theirs })
      return reads <= 2 ? succeed(null) : real(...args)
    })
    expect(ok(await ensure(w, ref))).toEqual({ kind: 'done', representation: theirs })
    expect(calls).toHaveLength(1)
  })

  it('an outcome kept while this one was about to start is answered without the engine', async () => {
    const w = world()
    const { calls } = converting(w)
    const ref = await voice(w)
    const theirs = {
      definition: definitionOf('1'),
      engine: { name: 'voice.other', revision: '9' },
      outcome: 'inconvertible' as const,
    }
    let reads = 0
    w.faults.hooks.set('readRepresentation', async (real, ...args) => {
      const [{ tenant }] = args as unknown as [{ tenant: string }]
      if (++reads === 1) {
        await w.index.recordRepresentation({ tenant, key: ref.key, representation: theirs })
        return succeed(null)
      }
      return real(...args)
    })
    expect(ok(await ensure(w, ref))).toEqual({ kind: 'done', representation: theirs })
    expect(calls).toHaveLength(0)
  })

  it('what was made for an original goes when the original is swept', async () => {
    const w = world()
    converting(w, async () => ({
      kind: 'converted',
      text: 'these are more words than fit in line',
      derived: [{ mediaType: 'image/png', bytes: png(4, 3) }],
    }))
    const ref = await voice(w)
    await ensure(w, ref)
    expect(await w.liveKeys()).toHaveLength(3)
    w.advance(600_001)
    ok(await w.media.custody.sweep({ tenant: T1, limit: 10 }))
    expect(await w.liveKeys()).toEqual([])
  })
})

describe('reading and watching a representation', () => {
  it('reads not-started before, running while, and the outcome after; nothing is started by reading', async () => {
    const w = world()
    const { gate, answer } = held()
    const { calls } = converting(w, answer)
    const ref = await voice(w)
    expect(await read(w, ref)).toEqual({ kind: 'not-started' })
    expect(calls).toHaveLength(0)
    const asked = ensure(w, ref)
    await tick()
    expect(await read(w, ref)).toEqual({ kind: 'running' })
    gate.resolve(CONVERTED)
    await asked
    expect((await read(w, ref)).kind).toBe('done')
    expect(failureOf(await w.media.representations.read({ tenant: T2, ref }))).toBe(
      'invalid-reference',
    )
  })

  it('a restart forgets a conversion that was running and a failure: both are of the process only', async () => {
    const w = world()
    converting(w, async () => ({ kind: 'failed', reason: 'error' }))
    const ref = await voice(w)
    await ensure(w, ref)
    expect(await read(w, ref)).toEqual(failed('engine-error'))
    w.restart()
    expect(await read(w, ref)).toEqual({ kind: 'not-started' })
  })

  it('remembers the last 1024 failures, the latest of a medium counting: older ones read as not started', async () => {
    const w = world()
    w.conversion.definitions = {
      resolve: async () =>
        succeed({
          kind: 'resolved',
          definition: definitionOf('1'),
          engine: 'voice.absent',
          parameters: {},
          egress: { kind: 'in-process' },
        }),
    }
    const refs: ContentReference[] = []
    for (let at = 0; at < 1025; at += 1) {
      const sound = wav(8)
      new DataView(sound.buffer).setUint16(44, at)
      refs.push((await w.staged(T1, `up-${String(at)}`, sound, 'audio/wav')).ref)
    }
    for (const ref of refs.slice(0, 1024)) await ensure(w, ref)
    await ensure(w, refs[0]!)
    await ensure(w, refs[1024]!)
    expect(await read(w, refs[0]!)).toEqual(failed('engine-unavailable'))
    expect(await read(w, refs[1]!)).toEqual({ kind: 'not-started' })
    expect(await read(w, refs[2]!)).toEqual(failed('engine-unavailable'))
    expect(await read(w, refs[1024]!)).toEqual(failed('engine-unavailable'))
  })

  it('watch tells each change once, from what it is now until the signal aborts', async () => {
    const w = world()
    const { gate, answer } = held()
    converting(w, answer)
    const ref = await voice(w)
    const stop = new AbortController()
    const watched = counted(stop.signal)
    const seen: string[] = []
    const watching = (async () => {
      for await (const state of w.media.representations.watch({
        tenant: T1,
        ref,
        signal: watched.signal,
      }))
        seen.push(state.kind)
    })()
    await tick()
    const asked = ensure(w, ref)
    await tick()
    gate.resolve(CONVERTED)
    await asked
    await tick()
    stop.abort()
    await watching
    expect(seen).toEqual(['not-started', 'running', 'done'])
    expect(watched.left()).toBe(0)
  })

  it('watch of a medium that is not there ends at once', async () => {
    const w = world()
    converting(w)
    const ref = await voice(w)
    const seen: unknown[] = []
    for await (const state of w.media.representations.watch({
      tenant: T2,
      ref,
      signal: live(),
    }))
      seen.push(state)
    expect(seen).toEqual([])
  })
})
