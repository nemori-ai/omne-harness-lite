import type { ModelHandle } from '@omne-harness/model-contract'
import { expect, it } from 'vitest'
import { collectGarbage } from './garbage.ts'
import { callId, instanceId, tenantA } from './identities.ts'
import {
  execution,
  handleOf,
  input,
  registrationOf,
  startDirectory,
  type World,
} from './instances-harness.ts'

// A bounded number of registrations is made and withdrawn. Afterwards the directory must hold
// nothing of them. The handles are watched through weak references, which the garbage collector
// clears only when the directory and the fibers hold no strong reference.
const REGISTRATIONS = 64

/** Even ones leave by release, odd ones by fiber disposal. */
async function run(world: World) {
  const watched: WeakRef<ModelHandle<unknown>>[] = []
  const effectsLeft: number[] = []
  for (let index = 0; index < REGISTRATIONS; index += 1) {
    const handle = handleOf(instanceId(`bounded${index}`))
    watched.push(new WeakRef(handle))
    const { fiber, outcome } = await world.contribute(
      input(execution(tenantA, callId(`bounded${index}`), handle.instance), handle),
    )
    const registration = registrationOf(outcome)
    const withRegistration = fiber.getEffects().length
    if (index % 2 === 0) {
      await registration.release()
      effectsLeft.push(withRegistration - fiber.getEffects().length)
    } else {
      await fiber.dispose()
    }
  }
  return { watched, effectsLeft }
}

it('reclaims every resource after bounded registrations are made and withdrawn', async () => {
  const world = await startDirectory()
  await collectGarbage()

  const { watched, effectsLeft } = await run(world)

  await collectGarbage()
  const collected = watched.filter(ref => ref.deref() === undefined).length
  console.info(
    `[bounded-registration] registrations=${REGISTRATIONS} ` +
      `handlesCollected=${collected}/${REGISTRATIONS} ` +
      `effectsReleasedByRelease=${effectsLeft.reduce((sum, left) => sum + left, 0)}/${effectsLeft.length} ` +
      `node=${process.version}`,
  )

  for (let index = 0; index < REGISTRATIONS; index += 1)
    expect(await world.routeOfCall(tenantA, callId(`bounded${index}`))).toEqual({
      kind: 'no-live-route',
    })
  expect(effectsLeft).toEqual(Array.from({ length: REGISTRATIONS / 2 }, () => 1))
  expect(collected).toBe(REGISTRATIONS)
})
