import { getEventListeners } from 'node:events'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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
  type ConvertResult,
} from './converters-harness.ts'

const unavailable = {
  failure: {
    kind: 'unavailable',
    dependency: 'modelConverters',
    diagnostic: expect.stringMatching(/\S/),
  },
}

/**
 * Remembers every abort signal that gets an `abort` listener while the watch runs. The listeners
 * of the catalog sit on a signal of its own that no converter can reach, so this is the way to
 * count them from outside.
 */
function watchAbortListeners(): Set<AbortSignal> {
  const watched = new Set<AbortSignal>()
  const add = EventTarget.prototype.addEventListener
  vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (
    this: EventTarget,
    ...args: Parameters<typeof add>
  ) {
    if (args[0] === 'abort' && this instanceof AbortSignal) watched.add(this)
    return add.apply(this, args)
  })
  return watched
}

afterEach(() => vi.restoreAllMocks())

/** The outcome of a conversion that the test settles by hand, as soon as it is settled. */
async function outcomeOf(conversion: Promise<ConvertResult>): Promise<ConvertResult | 'in flight'> {
  return Promise.race([
    conversion,
    nextTurn()
      .then(() => nextTurn())
      .then(() => nextTurn())
      .then(() => 'in flight' as const),
  ])
}

describe('the lent converter', () => {
  const png = { mediaType: 'image/png', modality: null } as const

  it('carries the adoption that the contribution registered', async () => {
    const world = await startCatalog()
    const lent = converter('png')
    registrationOf((await world.contribute(input(mediaType('image/png'), lent))).outcome)

    const lease = selection(await world.acquire(png))

    expect(lease.converter.adoption).toEqual(lent.adoption)
  })

  it('hands the conversion to the registered converter and gives back what that converter answered', async () => {
    const world = await startCatalog()
    const { converter: registered, calls } = pendingConverter('png')
    registrationOf((await world.contribute(input(mediaType('image/png'), registered))).outcome)
    const lease = selection(await world.acquire(png))
    const asked = conversionInput()

    const conversion = lease.converter.convert(asked)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.input.original).toBe(asked.original)
    expect(calls[0]?.input.source).toBe(asked.source)
    expect(calls[0]?.input.signal.aborted).toBe(false)
    const answer = answerOf(asked, registered)
    calls[0]?.settle(answer)

    expect(await conversion).toBe(answer)
  })

  it('keeps no abort listener on any signal once a conversion has ended, however many conversions ran', async () => {
    const world = await startCatalog()
    const { converter: registered, calls } = pendingConverter('png')
    registrationOf((await world.contribute(input(mediaType('image/png'), registered))).outcome)
    const lease = selection(await world.acquire(png))
    const watched = watchAbortListeners()

    const first = conversionInput()
    const inFlight = lease.converter.convert(first)
    expect([...watched].some(signal => getEventListeners(signal, 'abort').length > 0)).toBe(true)
    calls[0]?.settle(answerOf(first, registered))
    await inFlight
    for (const round of [1, 2]) {
      const asked = conversionInput()
      const conversion = lease.converter.convert(asked)
      calls[round]?.settle(answerOf(asked, registered))
      await conversion
    }

    expect([...watched].flatMap(signal => getEventListeners(signal, 'abort'))).toEqual([])
  })

  it('passes the abort of the caller on to the registered converter', async () => {
    const world = await startCatalog()
    const { converter: registered, calls } = pendingConverter('png')
    registrationOf((await world.contribute(input(mediaType('image/png'), registered))).outcome)
    const lease = selection(await world.acquire(png))
    const caller = new AbortController()

    void lease.converter.convert(conversionInput(caller.signal))
    caller.abort()

    expect(calls[0]?.input.signal.aborted).toBe(true)
  })
})

describe('sudden withdrawal and conversions in flight', () => {
  const png = { mediaType: 'image/png', modality: 'image' } as const

  it('fails the conversion that is in flight with unavailable, and never starts another converter', async () => {
    const world = await startCatalog()
    const { converter: registered, calls } = pendingConverter('png')
    const { converter: byModality, calls: modalityCalls } = pendingConverter('image')
    registrationOf((await world.contribute(input(modality('image'), byModality))).outcome)
    const { fiber, outcome } = await world.contribute(input(mediaType('image/png'), registered))
    registrationOf(outcome)
    const lease = selection(await world.acquire(png))
    const conversion = lease.converter.convert(conversionInput())

    await fiber.dispose()

    expect(await outcomeOf(conversion)).toEqual(unavailable)
    expect(calls[0]?.input.signal.aborted).toBe(true)
    expect(modalityCalls).toHaveLength(0)
  })

  it('fails a conversion that starts on an old lease after the withdrawal, without reaching the converter', async () => {
    const world = await startCatalog()
    const { converter: registered, calls } = pendingConverter('png')
    const { fiber, outcome } = await world.contribute(input(mediaType('image/png'), registered))
    registrationOf(outcome)
    const lease = selection(await world.acquire(png))
    await fiber.dispose()

    const conversion = lease.converter.convert(conversionInput())

    expect(await outcomeOf(conversion)).toEqual(unavailable)
    expect(calls).toHaveLength(0)
  })

  it('does not hold up the disposal of the registering fiber for a conversion that is in flight', async () => {
    const world = await startCatalog()
    const { converter: registered } = pendingConverter('png')
    const { fiber, outcome } = await world.contribute(input(mediaType('image/png'), registered))
    registrationOf(outcome)
    const lease = selection(await world.acquire(png))
    void lease.converter.convert(conversionInput())

    const disposal = fiber.dispose()

    expect(await Promise.race([disposal.then(() => true), nextTurn().then(() => false)])).toBe(true)
  })
})

describe('orderly release and conversions in flight', () => {
  const png = { mediaType: 'image/png', modality: null } as const

  it('lets the conversion that is in flight finish, and completes the release after the lease is back', async () => {
    const world = await startCatalog()
    const { converter: registered, calls } = pendingConverter('png')
    const { outcome } = await world.contribute(input(mediaType('image/png'), registered))
    const registration = registrationOf(outcome)
    const lease = selection(await world.acquire(png))
    const asked = conversionInput()
    const conversion = lease.converter.convert(asked)

    const closing = registration.release()
    expect(calls[0]?.input.signal.aborted).toBe(false)
    const answer = answerOf(asked, registered)
    calls[0]?.settle(answer)

    expect(await conversion).toBe(answer)
    await lease.release()
    expect(await closing).toEqual({ removed: true })
  })
})
