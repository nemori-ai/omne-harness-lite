// A caller that knows only the package entries opens an account, logs in and has its login
// recognized. Besides the two identity entries it imports the pure time values that the clock and
// the terms take.
import { expect, it } from 'vitest'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import type { IdentityOperations } from '@omne-harness/identity'
import {
  adjustableLoginTerms,
  inProcessIdentityOperations,
  manualIdentityClock,
} from '@omne-harness/identity/testing'

it('registers, logs in and recognizes the login through the public entries only', async () => {
  const start = parseInstant('2026-10-25T09:00:00Z')
  const maxLifetime = parseDuration('PT43200S')
  const idlePeriod = parseDuration('PT1800S')
  if (!start.ok || !maxLifetime.ok || !idlePeriod.ok) throw new Error('fixture time')
  const clock = manualIdentityClock(start.value)
  const terms = adjustableLoginTerms({
    maxLifetime: maxLifetime.value,
    idlePeriod: idlePeriod.value,
  })
  const identity: IdentityOperations = inProcessIdentityOperations({
    clock: clock.clock,
    terms: terms.source,
  })

  const registered = await identity.registerAndActivate({
    loginIdentifier: 'grace@example.test',
    credential: 'correct horse battery staple',
  })
  if (registered.kind !== 'succeeded') throw new Error(`registration was ${registered.kind}`)

  const login = await identity.issueLogin({
    loginIdentifier: 'grace@example.test',
    credential: 'correct horse battery staple',
  })
  if (login.kind !== 'succeeded') throw new Error(`login was ${login.kind}`)
  expect(login.tenant).toBe(registered.tenant)

  const recognized = await identity.recognizeLogin({ loginProof: login.loginProof })
  expect(recognized).toEqual({
    kind: 'recognized',
    account: registered.account,
    login: login.login,
    tenant: registered.tenant,
  })

  const halfHour = parseDuration('PT1800S')
  if (!halfHour.ok) throw new Error('fixture time')
  clock.advanceBy(halfHour.value)
  await expect(identity.recognizeLogin({ loginProof: login.loginProof })).resolves.toEqual({
    kind: 'invalid',
  })
})
