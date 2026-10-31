import { setImmediate as nextTurn } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import {
  converter,
  input,
  mediaType,
  registrationOf,
  selection,
  startCatalog,
} from './converters-harness.ts'

const png = { mediaType: 'image/png', modality: null } as const
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

/** A release hook that the test completes by hand and that counts its calls. */
function hook() {
  const calls: unknown[] = []
  const pending: PromiseWithResolvers<void>[] = []
  return {
    calls,
    pending,
    release(this: unknown): Promise<void> {
      calls.push(this)
      const next = Promise.withResolvers<void>()
      pending.push(next)
      return next.promise
    },
  }
}

describe('the release hook of a contribution', () => {
  it('runs once the last lease is back and not before, and the release completes after the hook', async () => {
    const world = await startCatalog()
    const provider = hook()
    const { outcome } = await world.contribute({
      ...input(mediaType('image/png'), converter('png')),
      release: provider.release,
    })
    const registration = registrationOf(outcome)
    const first = selection(await world.acquire(png))
    const second = selection(await world.acquire(png))
    const closing = registration.release()

    await first.release()
    await nextTurn()
    expect(provider.calls).toHaveLength(0)
    await second.release()
    expect(provider.calls).toHaveLength(1)
    expect(await settlesSoon(closing)).toBe(false)
    provider.pending[0]?.resolve()

    expect(await closing).toStrictEqual({ removed: true })
    expect(provider.calls).toHaveLength(1)
  })

  it('runs at once when no lease is outstanding, as a method of the registration input', async () => {
    const world = await startCatalog()
    const provider = hook()
    const request = {
      ...input(mediaType('image/png'), converter('png')),
      release: provider.release,
    }
    const { outcome } = await world.contribute(request)

    const closing = registrationOf(outcome).release()

    expect(provider.calls).toEqual([request])
    provider.pending[0]?.resolve()
    expect(await closing).toStrictEqual({ removed: true })
  })

  it('keeps the key unavailable while the hook is running, and frees it when the hook is done', async () => {
    const world = await startCatalog()
    const provider = hook()
    const { outcome } = await world.contribute({
      ...input(mediaType('image/png'), converter('png')),
      release: provider.release,
    })
    const closing = registrationOf(outcome).release()

    expect(await world.acquire(png)).toEqual(unavailable)
    provider.pending[0]?.resolve()
    await closing

    expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
  })

  it('runs once for a release that is asked again while the hook is running', async () => {
    const world = await startCatalog()
    const provider = hook()
    const { outcome } = await world.contribute({
      ...input(mediaType('image/png'), converter('png')),
      release: provider.release,
    })
    const registration = registrationOf(outcome)

    const early = registration.release()
    const concurrent = registration.release()
    provider.pending[0]?.resolve()
    const late = await registration.release()

    expect(provider.calls).toHaveLength(1)
    expect(await early).toBe(late)
    expect(await concurrent).toBe(late)
  })

  it('runs after a sudden withdrawal once the leases are back, without holding up the disposal of the fiber', async () => {
    const world = await startCatalog()
    const provider = hook()
    const { fiber, outcome } = await world.contribute({
      ...input(mediaType('image/png'), converter('png')),
      release: provider.release,
    })
    const registration = registrationOf(outcome)
    const lease = selection(await world.acquire(png))

    const disposal = fiber.dispose()

    expect(await settlesSoon(disposal)).toBe(true)
    expect(provider.calls).toHaveLength(0)
    await lease.release()
    expect(provider.calls).toHaveLength(1)
    provider.pending[0]?.resolve()
    expect(await registration.release()).toStrictEqual({ removed: true })
  })

  it('has started by the time the disposal of the registering fiber is done when no lease is outstanding', async () => {
    const world = await startCatalog()
    const provider = hook()
    const { fiber, outcome } = await world.contribute({
      ...input(mediaType('image/png'), converter('png')),
      release: provider.release,
    })
    registrationOf(outcome)

    await fiber.dispose()

    expect(provider.calls).toHaveLength(1)
  })

  it('keeps the key unavailable and the release pending for ever when the hook never completes', async () => {
    const world = await startCatalog()
    const provider = hook()
    const { fiber, outcome } = await world.contribute({
      ...input(mediaType('image/png'), converter('png')),
      release: provider.release,
    })
    const registration = registrationOf(outcome)
    await fiber.dispose()

    expect(await settlesSoon(registration.release())).toBe(false)
    expect(await world.acquire(png)).toEqual(unavailable)
    expect(provider.calls).toHaveLength(1)
  })

  it('does not run for a contribution that was refused', async () => {
    const world = await startCatalog()
    const provider = hook()
    const held = converter('png')
    registrationOf((await world.contribute(input(mediaType('image/png'), held))).outcome)

    const rival = await world.contribute({
      ...input(mediaType('image/png'), converter('rival')),
      release: provider.release,
    })

    expect(rival.outcome).toEqual({ failure: { kind: 'conflict' } })
    expect(provider.calls).toHaveLength(0)
  })
})

describe('a release hook that fails', () => {
  const failures: readonly (readonly [string, () => Promise<void>])[] = [
    [
      'rejects',
      () => {
        return Promise.reject(new Error('secret-detail of the provider'))
      },
    ],
    [
      'throws',
      () => {
        throw new Error('secret-detail of the provider')
      },
    ],
  ]

  it.each(failures)(
    'reports removed with a failure, the same result for every release, when it %s',
    async (_how, release) => {
      const world = await startCatalog()
      const { outcome } = await world.contribute({
        ...input(mediaType('image/png'), converter('png')),
        release,
      })
      const registration = registrationOf(outcome)

      const first = await registration.release()
      const again = await registration.release()

      expect(first).toStrictEqual({
        removed: true,
        failure: { kind: 'unavailable', diagnostic: expect.stringMatching(/\S/) },
      })
      expect(again).toBe(first)
      expect(JSON.stringify(first)).not.toContain('secret-detail')
      expect(await world.acquire(png)).toEqual({ ok: { kind: 'absent' } })
    },
  )

  it('runs the hook once even when it fails, and does not run it again for a later release', async () => {
    const world = await startCatalog()
    let runs = 0
    const { outcome } = await world.contribute({
      ...input(mediaType('image/png'), converter('png')),
      release: () => {
        runs += 1
        return Promise.reject(new Error('down'))
      },
    })
    const registration = registrationOf(outcome)

    await registration.release()
    await registration.release()

    expect(runs).toBe(1)
  })

  it('keeps the failure for a release that is asked after the sudden withdrawal', async () => {
    const world = await startCatalog()
    const { fiber, outcome } = await world.contribute({
      ...input(mediaType('image/png'), converter('png')),
      release: () => Promise.reject(new Error('down')),
    })
    const registration = registrationOf(outcome)
    await fiber.dispose()
    await nextTurn()

    expect(await registration.release()).toStrictEqual({
      removed: true,
      failure: { kind: 'unavailable', diagnostic: expect.stringMatching(/\S/) },
    })
  })

  it('lets a successor take the key after the failure', async () => {
    const world = await startCatalog()
    const successor = converter('png-2')
    const { outcome } = await world.contribute({
      ...input(mediaType('image/png'), converter('png-1')),
      release: () => Promise.reject(new Error('down')),
    })
    await registrationOf(outcome).release()

    registrationOf((await world.contribute(input(mediaType('image/png'), successor))).outcome)

    expect(selection(await world.acquire(png)).converter.adoption).toEqual(successor.adoption)
  })
})
