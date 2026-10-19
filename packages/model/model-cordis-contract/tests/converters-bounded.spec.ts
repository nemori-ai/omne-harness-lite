import type { ModelConverter } from '@omne-harness/model-contract'
import { expect, it } from 'vitest'
import {
  converter,
  input,
  mediaType,
  registrationOf,
  selection,
  startCatalog,
  type World,
} from './converters-harness.ts'
import { collectGarbage } from './garbage.ts'

// A bounded number of contributions is registered, leased, withdrawn and drained. Afterwards the
// catalog must hold nothing of them. The converters are watched through weak references, which
// the garbage collector clears only when the catalog and the fibers hold no strong reference.
const CONTRIBUTIONS = 64
const LEASES_PER_CONTRIBUTION = 3

/** Runs every contribution through its life. Even ones leave by release, odd ones by fiber disposal. */
async function run(world: World) {
  const watched: WeakRef<ModelConverter<unknown>>[] = []
  const effectsLeft: number[] = []
  for (let index = 0; index < CONTRIBUTIONS; index += 1) {
    const lent = converter(`bounded-${index}`)
    watched.push(new WeakRef(lent))
    const request = { mediaType: `application/x-${index}`, modality: null } as const
    const { fiber, outcome } = await world.contribute(input(mediaType(request.mediaType), lent))
    const registration = registrationOf(outcome)
    const withRegistration = fiber.getEffects().length
    const leases = []
    for (let lease = 0; lease < LEASES_PER_CONTRIBUTION; lease += 1)
      leases.push(selection(await world.acquire(request)))
    if (index % 2 === 0) {
      const closing = registration.release()
      await Promise.all(leases.map(lease => lease.release()))
      await closing
      effectsLeft.push(withRegistration - fiber.getEffects().length)
    } else {
      await fiber.dispose()
      await Promise.all(leases.map(lease => lease.release()))
    }
  }
  return { watched, effectsLeft }
}

it('reclaims every resource after bounded contributions are acquired, withdrawn and drained', async () => {
  const world = await startCatalog()
  await collectGarbage()
  const heapBefore = process.memoryUsage().heapUsed
  const started = performance.now()

  const { watched, effectsLeft } = await run(world)

  const elapsedMs = performance.now() - started
  await collectGarbage()
  const heapAfter = process.memoryUsage().heapUsed
  const collected = watched.filter(ref => ref.deref() === undefined).length
  console.info(
    `[bounded-contribution] contributions=${CONTRIBUTIONS} leasesPerContribution=${LEASES_PER_CONTRIBUTION} ` +
      `converterObjectsCollected=${collected}/${CONTRIBUTIONS} ` +
      `effectsReleasedByRelease=${effectsLeft.reduce((sum, left) => sum + left, 0)}/${effectsLeft.length} ` +
      `elapsedMs=${elapsedMs.toFixed(1)} heapBeforeBytes=${heapBefore} heapAfterBytes=${heapAfter} ` +
      `node=${process.version}`,
  )

  for (let index = 0; index < CONTRIBUTIONS; index += 1)
    expect(await world.acquire({ mediaType: `application/x-${index}`, modality: null })).toEqual({
      ok: { kind: 'absent' },
    })
  expect(effectsLeft).toEqual(Array.from({ length: CONTRIBUTIONS / 2 }, () => 1))
  expect(collected).toBe(CONTRIBUTIONS)
})
