// The `identityClock` service definition (R1-D27, AAP-8 alternative path): the fifth definition of
// `./cordis`, the Cordis seam through which the assembly hands an `IdentityClock` to a provider.
// A concrete subclass registers under the key, delegates `now()` and leaves with its fiber.
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { encodeInstant, parseDuration, parseInstant } from '@omne-harness/utc-instant'
import type { IdentityClock } from '@omne-harness/identity'
import * as entry from '@omne-harness/identity/cordis'
import { IdentityClockService, identityClockKey } from '@omne-harness/identity/cordis'
import { manualIdentityClock } from '@omne-harness/identity/testing'

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await Promise.all(disposers.splice(0).map(dispose => dispose()))
})

function instant(text: string) {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`fixture instant ${text}`)
  return parsed.value
}

it('adds the clock definition and its key to ./cordis without touching the four earlier ones', () => {
  expect(identityClockKey).toBe('identityClock')
  expect(IdentityClockService.provide).toBe('identityClock')
  for (const name of [
    'IdentityOperationsService',
    'PrincipalIssuerService',
    'PrincipalVerifierService',
    'TenantStandingSourceService',
    'identityOperationsKey',
    'principalIssuerKey',
    'principalVerifierKey',
    'tenantStandingKey',
  ])
    expect(entry).toHaveProperty(name)
})

it('registers a concrete clock under the key, delegates now() and removes the key on disposal', async () => {
  const manual = manualIdentityClock(instant('2026-10-25T12:00:00Z'))
  class Clock extends IdentityClockService {
    readonly instanceToken = {}
    readonly now: IdentityClock['now'] = () => manual.clock.now()
  }
  const ctx = new Context()
  expect(ctx.get(identityClockKey)).toBeUndefined()
  let installed: Clock | undefined
  const fiber = await ctx.plugin(context => {
    installed = new Clock(context)
  })
  disposers.push(() => fiber.dispose())
  const clock = ctx.get(identityClockKey)
  expect(clock).toBeInstanceOf(Clock)
  expect(clock).toBeInstanceOf(Service)
  if (!(clock instanceof Clock)) throw new Error('clock missing')
  expect(installed?.instanceToken === clock.instanceToken).toBe(true)

  // `Instant` keeps its fields private, so `toEqual` cannot tell two instants apart: compare text.
  const readText = async () => {
    const reading = await clock.now()
    if (reading.kind !== 'read') throw new Error(`reading failed: ${reading.diagnostic}`)
    return encodeInstant(reading.instant)
  }
  expect(await readText()).toBe('2026-10-25T12:00:00Z')
  const hour = parseDuration('PT3600S')
  if (!hour.ok) throw new Error('fixture duration')
  manual.advanceBy(hour.value)
  expect(await readText()).toBe('2026-10-25T13:00:00Z')
  manual.makeUnavailable('offline')
  await expect(clock.now()).resolves.toEqual({ kind: 'unavailable', diagnostic: 'offline' })

  await fiber.dispose()
  expect(ctx.get(identityClockKey)).toBeUndefined()
})

it('is the same key a consumer injects: a plugin that injects identityClock waits until it is provided', async () => {
  const ctx = new Context()
  let seen: IdentityClock | undefined
  const consumer = ctx.plugin({
    name: 'clock-consumer',
    inject: [identityClockKey],
    apply(context: Context) {
      seen = context.get(identityClockKey)
    },
  })
  await Promise.resolve()
  expect(consumer.state as number).toBe(0)
  expect(seen).toBeUndefined()
  class Clock extends IdentityClockService {
    readonly now: IdentityClock['now'] = () =>
      Promise.resolve({ kind: 'unavailable', diagnostic: 'fixture' })
  }
  const provider = await ctx.plugin(Clock)
  disposers.push(() => provider.dispose())
  await consumer
  expect(consumer.state as number).toBe(2)
  expect(seen).toBeInstanceOf(Clock)
})
