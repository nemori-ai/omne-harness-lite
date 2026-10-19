import { setImmediate as nextTurn } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { ModelConvertersService, modelConvertersKey } from '../src/cordis.ts'
import {
  adoption,
  answerOf,
  conversionInput,
  converter,
  input,
  mediaType,
  modality,
  pendingConverter,
  registrationOf,
  selection,
  startCatalog,
  surrogateAuthority,
  type Registered,
} from './converters-harness.ts'

const unavailable = {
  failure: {
    kind: 'unavailable',
    dependency: 'modelConverters',
    diagnostic: expect.stringMatching(/\S/),
  },
}

/** True when the promise settles within a few turns of the event loop. */
async function settlesSoon(promise: Promise<unknown>): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    nextTurn()
      .then(() => nextTurn())
      .then(() => nextTurn())
      .then(() => false),
  ])
}

describe('definition', () => {
  it('is written once, served as ctx.modelConverters, and gone with the fiber that hosts it', async () => {
    expect(ModelConvertersService.provide).toBe('modelConverters')
    expect(modelConvertersKey).toBe(ModelConvertersService.provide)
    const world = await startCatalog()

    expect(world.root.get(modelConvertersKey)).toBeInstanceOf(ModelConvertersService)
    await world.host.dispose()

    expect(world.root.get(modelConvertersKey)).toBeUndefined()
  })

  it('keeps its state out of the instance: only the two operations are reachable by other plugins', async () => {
    const world = await startCatalog()

    // Cordis 4.0.4 places its tracker symbol on every Service instance; any other key is catalog state.
    expect(Reflect.ownKeys(world.catalog).map(String).sort()).toEqual([
      'Symbol(cordis.tracker)',
      'acquire',
      'ctx',
      'name',
      'register',
    ])
  })
})

describe('lookup order', () => {
  it('serves the converter of the media type before the converter of the modality', async () => {
    const world = await startCatalog()
    const byType = converter('png')
    const byModality = converter('image')
    registrationOf((await world.contribute(input(mediaType('image/png'), byType))).outcome)
    registrationOf((await world.contribute(input(modality('image'), byModality))).outcome)

    const png = selection(await world.acquire({ mediaType: 'image/png', modality: 'image' }))
    expect(png.converter.adoption).toEqual(byType.adoption)
    const jpeg = selection(await world.acquire({ mediaType: 'image/jpeg', modality: 'image' }))
    expect(jpeg.converter.adoption).toEqual(byModality.adoption)
  })

  it('keeps the converters of two modalities apart: the image converter is not lent for voice', async () => {
    const world = await startCatalog()
    const image = converter('image')
    registrationOf((await world.contribute(input(modality('image'), image))).outcome)

    expect(await world.acquire({ mediaType: 'audio/wav', modality: 'voice' })).toEqual({
      ok: { kind: 'absent' },
    })
    const jpeg = selection(await world.acquire({ mediaType: 'image/jpeg', modality: 'image' }))
    expect(jpeg.converter.adoption).toEqual(image.adoption)
  })

  it('serves a video converter by its modality and not for another modality', async () => {
    const world = await startCatalog()
    const video = converter('video')
    registrationOf((await world.contribute(input(modality('video'), video))).outcome)

    const mp4 = selection(await world.acquire({ mediaType: 'video/mp4', modality: 'video' }))
    expect(mp4.converter.adoption).toEqual(video.adoption)
    expect(await world.acquire({ mediaType: 'image/png', modality: 'image' })).toEqual({
      ok: { kind: 'absent' },
    })
  })

  it('answers absent when no contribution matches the media type or the modality', async () => {
    const world = await startCatalog()
    registrationOf(
      (await world.contribute(input(mediaType('image/png'), converter('png')))).outcome,
    )

    expect(await world.acquire({ mediaType: 'text/plain', modality: null })).toEqual({
      ok: { kind: 'absent' },
    })
    expect(await world.acquire({ mediaType: 'image/jpeg', modality: 'image' })).toEqual({
      ok: { kind: 'absent' },
    })
  })
})

describe('registration lifetime', () => {
  it('withdraws the contribution when the fiber that registered it is disposed', async () => {
    const world = await startCatalog()
    const lent = converter('png')
    const { fiber, outcome } = await world.contribute(input(mediaType('image/png'), lent))
    registrationOf(outcome)
    const request = { mediaType: 'image/png', modality: null } as const
    const lease = selection(await world.acquire(request))
    expect(lease.converter.adoption).toEqual(lent.adoption)
    await lease.release()

    await fiber.dispose()

    expect(await world.acquire(request)).toEqual({ ok: { kind: 'absent' } })
  })
})

describe('registration from a fiber that has exited', () => {
  const png = { mediaType: 'image/png', modality: null } as const

  it('registers nothing: reading the injected service throws at once, a kept reference rejects', async () => {
    const world = await startCatalog()
    const request = input(mediaType('image/png'), converter('png'))
    const kept: { ctx?: Context; service?: Context['modelConverters'] } = {}
    const fiber = world.root.plugin({
      inject: ['modelConverters'],
      apply(ctx: Context) {
        kept.ctx = ctx
        kept.service = ctx.modelConverters
      },
    })
    await fiber
    await fiber.dispose()

    expect(() => kept.ctx?.modelConverters.register(request)).toThrow('inactive context')
    const viaKeptReference: Promise<Registered> | undefined = kept.service?.register(request)
    await expect(viaKeptReference).rejects.toThrow('inactive context')
    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('rejects the call and registers nothing when the authority itself fails', async () => {
    const world = await startCatalog({
      check() {
        throw new Error('authority down')
      },
    })

    await expect(world.contribute(input(mediaType('image/png'), converter('png')))).rejects.toThrow(
      'authority down',
    )

    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })
})

describe('registration protocol', () => {
  const png = { mediaType: 'image/png', modality: null } as const

  it('asks the qualification authority inside the registering call, before the call yields', async () => {
    const authority = surrogateAuthority()
    const world = await startCatalog(authority)
    const request = input(mediaType('image/png'), converter('png'))
    let askedBeforeYield = 0
    let pending: Promise<Registered> | undefined
    await world.root.plugin({
      inject: ['modelConverters'],
      apply(ctx: Context) {
        pending = ctx.modelConverters.register(request)
        askedBeforeYield = authority.seen.length
      },
    })

    expect(askedBeforeYield).toBe(1)
    expect(authority.seen[0]).toBe(request)
    registrationOf(await (pending ?? Promise.reject(new Error('not registered'))))
  })

  it('returns the refusal of the authority unchanged and registers nothing', async () => {
    const authority = surrogateAuthority()
    authority.deny({ kind: 'stale-publication' })
    const world = await startCatalog(authority)

    const refused = await world.contribute(input(mediaType('image/png'), converter('png')))

    expect(refused.outcome).toEqual({ failure: { kind: 'stale-publication' } })
    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('leaves the fiber of a refused registration with the effects it had before, so refusals collect nothing', async () => {
    const authority = surrogateAuthority()
    authority.deny({ kind: 'denied' })
    const world = await startCatalog(authority)
    const idle = world.root.plugin({ inject: ['modelConverters'], apply() {} })
    await idle

    const refused = await world.contribute(input(mediaType('image/png'), converter('png')))

    expect(refused.outcome).toEqual({ failure: { kind: 'denied' } })
    expect(refused.fiber.getEffects().length).toBe(idle.getEffects().length)
  })

  it('leaves the fiber of a recognised registration with the one effect of the first, so repeating collects nothing', async () => {
    const world = await startCatalog()
    const request = input(mediaType('image/png'), converter('png'))
    const effects: number[] = []
    await world.root.plugin({
      inject: ['modelConverters'],
      apply(ctx: Context) {
        void ctx.modelConverters.register(request)
        effects.push(ctx.fiber.getEffects().length)
        void ctx.modelConverters.register(request)
        effects.push(ctx.fiber.getEffects().length)
      },
    })

    expect(effects[1]).toBe(effects[0])
  })

  it('recognises the same contribution of the same fiber and gives back the same registration', async () => {
    const world = await startCatalog()
    const request = input(mediaType('image/png'), converter('png'))
    let first: Promise<Registered> | undefined
    let second: Promise<Registered> | undefined
    await world.root.plugin({
      inject: ['modelConverters'],
      apply(ctx: Context) {
        first = ctx.modelConverters.register(request)
        second = ctx.modelConverters.register(request)
      },
    })

    const once = registrationOf(await (first ?? Promise.reject(new Error('not registered'))))
    const again = registrationOf(await (second ?? Promise.reject(new Error('not registered'))))
    expect(again).toBe(once)
    expect(again.token).toBe(once.token)
    expect(again.release).toBe(once.release)
  })

  it('gives each registration a token of its own that does not spell out the key', async () => {
    const world = await startCatalog()
    const first = registrationOf(
      (await world.contribute(input(mediaType('image/png'), converter('png')))).outcome,
    )
    const second = registrationOf(
      (await world.contribute(input(mediaType('image/jpeg'), converter('jpeg')))).outcome,
    )

    expect(first.token).not.toBe(second.token)
    expect(first.token).not.toContain('png')
    expect(second.token).not.toContain('jpeg')
  })

  it('refuses another contribution for a key that is held and keeps serving the first', async () => {
    const world = await startCatalog()
    const held = converter('png')
    registrationOf((await world.contribute(input(mediaType('image/png'), held))).outcome)

    const rival = await world.contribute(input(mediaType('image/png'), converter('png-rival')))
    const sameObject = await world.contribute(input(mediaType('image/png'), held))

    expect(rival.outcome).toEqual({ failure: { kind: 'conflict' } })
    expect(sameObject.outcome).toEqual({ failure: { kind: 'conflict' } })
    expect(selection(await world.acquire(png)).converter.adoption).toEqual(held.adoption)
  })

  it('refuses another converter object of the same fiber even when its adoption is the same, and keeps serving the first', async () => {
    const world = await startCatalog()
    const first = pendingConverter('png')
    const second = pendingConverter('png')
    const outcomes: Promise<Registered>[] = []
    await world.root.plugin({
      inject: ['modelConverters'],
      apply(ctx: Context) {
        outcomes.push(
          ctx.modelConverters.register(input(mediaType('image/png'), first.converter)),
          ctx.modelConverters.register(input(mediaType('image/png'), second.converter)),
        )
      },
    })

    registrationOf(await (outcomes[0] ?? Promise.reject(new Error('not registered'))))
    expect(await (outcomes[1] ?? Promise.reject(new Error('not registered')))).toEqual({
      failure: { kind: 'conflict' },
    })
    void selection(await world.acquire(png)).converter.convert(conversionInput())
    expect(first.calls).toHaveLength(1)
    expect(second.calls).toHaveLength(0)
  })

  it('refuses a contribution whose adoption is not the adoption of its converter', async () => {
    const world = await startCatalog()
    const lent = converter('png')

    const refused = await world.contribute({
      ...input(mediaType('image/png'), lent),
      adoption: adoption('someone-else'),
    })

    expect(refused.outcome).toEqual({
      failure: { kind: 'invalid', reason: expect.stringContaining('adoption') },
    })
    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('refuses a contribution whose adoption differs from the converter in the owner alone', async () => {
    const world = await startCatalog()
    const lent = converter('png')

    const refused = await world.contribute({
      ...input(mediaType('image/png'), lent),
      adoption: { ...lent.adoption, owner: 'someone-else' },
    })

    expect(refused.outcome).toEqual({
      failure: { kind: 'invalid', reason: expect.stringContaining('adoption') },
    })
    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('refuses a contribution whose adoption differs from the converter in the name alone', async () => {
    const world = await startCatalog()
    const lent = converter('png')

    const refused = await world.contribute({
      ...input(mediaType('image/png'), lent),
      adoption: { ...lent.adoption, name: 'png-renamed' },
    })

    expect(refused.outcome).toEqual({
      failure: { kind: 'invalid', reason: expect.stringContaining('adoption') },
    })
    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('refuses a contribution whose adoption differs from the converter in the revision alone', async () => {
    const world = await startCatalog()
    const lent = converter('png')

    const refused = await world.contribute({
      ...input(mediaType('image/png'), lent),
      adoption: { ...lent.adoption, revision: '2' },
    })

    expect(refused.outcome).toEqual({
      failure: { kind: 'invalid', reason: expect.stringContaining('adoption') },
    })
    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('refuses a contribution whose adoption differs from the converter in the digest alone', async () => {
    const world = await startCatalog()
    const lent = converter('png')

    const refused = await world.contribute({
      ...input(mediaType('image/png'), lent),
      adoption: { ...lent.adoption, digest: 'sha256:other' },
    })

    expect(refused.outcome).toEqual({
      failure: { kind: 'invalid', reason: expect.stringContaining('adoption') },
    })
    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })
})

describe('retirement', () => {
  const png = { mediaType: 'image/png', modality: 'image' } as const
  async function held(world: Awaited<ReturnType<typeof startCatalog>>) {
    const lent = converter('png')
    const { fiber, outcome } = await world.contribute(input(mediaType('image/png'), lent))
    return { lent, fiber, registration: registrationOf(outcome) }
  }

  it('is complete at once when no lease is outstanding, and the key is free afterwards', async () => {
    const world = await startCatalog()
    const { registration } = await held(world)

    expect(await registration.release()).toEqual({ removed: true })

    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('refuses new leases while old leases are outstanding, without falling back to another converter', async () => {
    const world = await startCatalog()
    const { registration } = await held(world)
    registrationOf((await world.contribute(input(modality('image'), converter('image')))).outcome)
    const lease = selection(await world.acquire(png))

    const closing = registration.release()

    expect(await world.acquire(png)).toEqual(unavailable)
    expect(await world.acquire({ mediaType: 'image/png', modality: null })).toEqual(unavailable)
    await lease.release()
    await closing
  })

  it('reports completion only after the last outstanding lease is released', async () => {
    const world = await startCatalog()
    const { registration } = await held(world)
    const first = selection(await world.acquire(png))
    const second = selection(await world.acquire(png))
    let done = false
    const closing = registration.release().then(result => {
      done = true
      return result
    })

    await first.release()
    await nextTurn()
    expect(done).toBe(false)
    await second.release()

    expect(await closing).toEqual({ removed: true })
    expect(done).toBe(true)
    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('frees only itself when a lease is released twice', async () => {
    const world = await startCatalog()
    const { registration } = await held(world)
    const first = selection(await world.acquire(png))
    const second = selection(await world.acquire(png))
    let done = false
    const closing = registration.release().then(result => {
      done = true
      return result
    })

    await first.release()
    await first.release()
    await nextTurn()
    expect(done).toBe(false)
    await second.release()
    await closing
  })

  it('answers a release that comes after the disposal of the registering fiber with the settled result', async () => {
    const world = await startCatalog()
    const { fiber, outcome } = await world.contribute(
      input(mediaType('image/png'), converter('png')),
    )
    await fiber.dispose()

    expect(await registrationOf(outcome).release()).toEqual({ removed: true })

    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('returns the same result for every release of the same registration', async () => {
    const world = await startCatalog()
    const { registration } = await held(world)
    const lease = selection(await world.acquire(png))

    const early = registration.release()
    const concurrent = registration.release()
    await lease.release()
    const late = await registration.release()

    expect(await early).toBe(late)
    expect(await concurrent).toBe(late)
  })
})

describe('successor contributions', () => {
  const png = { mediaType: 'image/png', modality: null } as const

  it('lets a successor take the key while old leases are outstanding, and leaves the old leases on the old converter', async () => {
    const world = await startCatalog()
    const original = pendingConverter('png-1')
    const successor = pendingConverter('png-2')
    const first = await world.contribute(input(mediaType('image/png'), original.converter))
    const lease = selection(await world.acquire(png))
    const closing = registrationOf(first.outcome).release()

    registrationOf(
      (await world.contribute(input(mediaType('image/png'), successor.converter))).outcome,
    )

    const asked = conversionInput()
    const conversion = lease.converter.convert(asked)
    expect(original.calls).toHaveLength(1)
    expect(successor.calls).toHaveLength(0)
    const answer = answerOf(asked, original.converter)
    original.calls[0]?.settle(answer)
    expect(await conversion).toBe(answer)

    expect(selection(await world.acquire(png)).converter.adoption).toEqual(
      successor.converter.adoption,
    )
    await lease.release()

    expect(await closing).toEqual({ removed: true })
    expect(selection(await world.acquire(png)).converter.adoption).toEqual(
      successor.converter.adoption,
    )
  })

  it('does not let a late release or a late fiber disposal of the old registration remove the successor', async () => {
    const world = await startCatalog()
    const successor = converter('png-2')
    const first = await world.contribute(input(mediaType('image/png'), converter('png-1')))
    const old = registrationOf(first.outcome)
    await old.release()
    registrationOf((await world.contribute(input(mediaType('image/png'), successor))).outcome)

    expect(await old.release()).toEqual({ removed: true })
    await first.fiber.dispose()

    expect(selection(await world.acquire(png)).converter.adoption).toEqual(successor.adoption)
  })

  it('keeps the key unavailable while a retiring successor still has a lease out, after the old one completed', async () => {
    const world = await startCatalog()
    const first = await world.contribute(input(mediaType('image/png'), converter('png-1')))
    const oldLease = selection(await world.acquire(png))
    const oldClosing = registrationOf(first.outcome).release()
    const second = await world.contribute(input(mediaType('image/png'), converter('png-2')))
    const newLease = selection(await world.acquire(png))
    const newClosing = registrationOf(second.outcome).release()

    await oldLease.release()
    expect(await oldClosing).toEqual({ removed: true })

    expect(await world.acquire(png)).toEqual(unavailable)
    await newLease.release()
    expect(await newClosing).toEqual({ removed: true })
    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })
})

describe('sudden withdrawal', () => {
  const png = { mediaType: 'image/png', modality: 'image' } as const

  it('does not hold up the disposal of the registering fiber, and answers unavailable, not absent, until the old leases are released', async () => {
    const world = await startCatalog()
    const original = converter('png')
    const byModality = converter('image')
    registrationOf((await world.contribute(input(modality('image'), byModality))).outcome)
    const { fiber, outcome } = await world.contribute(input(mediaType('image/png'), original))
    registrationOf(outcome)
    const lease = selection(await world.acquire(png))

    const disposal = fiber.dispose()

    expect(await settlesSoon(disposal)).toBe(true)
    expect(lease.converter.adoption).toEqual(original.adoption)
    expect(await world.acquire(png)).toEqual(unavailable)
    await lease.release()
    expect(selection(await world.acquire(png)).converter.adoption).toEqual(byModality.adoption)
  })

  it('completes a release that was requested before the sudden withdrawal once the last lease is released', async () => {
    const world = await startCatalog()
    const { fiber, outcome } = await world.contribute(
      input(mediaType('image/png'), converter('png')),
    )
    const lease = selection(await world.acquire(png))
    const closing = registrationOf(outcome).release()

    await fiber.dispose()
    expect(await settlesSoon(closing)).toBe(false)
    await lease.release()

    expect(await closing).toEqual({ removed: true })
  })
})
