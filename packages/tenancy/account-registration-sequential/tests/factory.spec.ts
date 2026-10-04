import { expect, test } from 'vitest'
import {
  generateHandoffKeyPair,
  loadSigningKey,
  parseAccountId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { RegistrationStopped } from '@omne-harness-lite/account-registration'
import { createRegistrationService } from '../src/index.ts'

test('pure close observes the handed-off step and forbids the next independent commit', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const account = unwrap(parseAccountId('pure-registration-account'))
  let secondSteps = 0
  const instance = createRegistrationService({
    accounts: {
      async produce() {
        entered.resolve()
        await release.promise
        return { ok: account }
      },
      async activate() {
        throw new Error('activation must not start')
      },
      async purge() {
        throw new Error('purge must not start')
      },
    },
    organizations: {
      async createPersonal() {
        secondSteps++
        throw new Error('second step must not start')
      },
    },
    organizationPurge: {
      async purgePersonalOrganization() {
        throw new Error('purge must not start')
      },
    },
    activationKey: unwrap(loadSigningKey(generateHandoffKeyPair().privateKeyPem)),
    isActive: () => true,
    recordDefect() {
      throw new Error('unexpected defect')
    },
  })
  const registering = instance.register('user', 'credential')
  await entered.promise
  let closed = false
  const closing = instance.close()
  void closing.then(() => {
    closed = true
  })
  try {
    expect(instance.close()).toBe(closing)
    expect(await instance.register('new-user', 'credential')).toBe('interrupted')
    await expect(instance.purgeExpired(account)).rejects.toBeInstanceOf(RegistrationStopped)
    expect(closed).toBe(false)
    release.resolve()
    expect(await registering).toBe('interrupted')
    await closing
    expect(secondSteps).toBe(0)
  } finally {
    release.resolve()
    await closing
  }
})
