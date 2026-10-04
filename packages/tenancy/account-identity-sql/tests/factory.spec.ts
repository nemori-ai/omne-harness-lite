import { expect, test } from 'vitest'
import { createAccountIdentity, AccountIdentityStopped } from '../src/index.ts'
import { cryptoRandomSource } from '../src/presentation.ts'
import { openHarness, POLICY, RETENTION } from './support.ts'

test('pure close waits for credential work and its real SQLite commit before destroying the instance', async () => {
  const h = await openHarness({ label: 'pure-close' })
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const instance = createAccountIdentity(
    {
      credentialPolicy: POLICY,
      unactivatedRetention: RETENTION,
      activationVerificationKeyPem: h.keys.activationPublicPem,
      purgeVerificationKeyPem: h.keys.purgePublicPem,
    },
    {
      storage: h.storage,
      clock: h.clock,
      resolveCredentials: () => ({
        ...h.credentials,
        async derive(value) {
          const material = await h.credentials.derive(value)
          entered.resolve()
          await release.promise
          return material
        },
      }),
      notifier: { accountActivated() {}, loginRevoked() {}, accountExpired() {} },
      diagnostics: { warn() {}, error() {} },
      random: cryptoRandomSource,
    },
  )
  try {
    const producing = instance.accounts.produce('pure-close-user', 'sufficient-password')
    await entered.promise
    let closed = false
    const closing = instance.close()
    void closing.then(() => {
      closed = true
    })
    expect(instance.close()).toBe(closing)
    await expect(instance.accounts.read('unknown')).rejects.toBeInstanceOf(AccountIdentityStopped)
    expect(closed).toBe(false)
    release.resolve()
    const produced = await producing
    expect('ok' in produced).toBe(true)
    await closing
    if (!('ok' in produced)) throw new Error('admitted account was not committed')
    // The borrowed database remains usable and contains the late committed result.
    expect(await h.accounts.read(produced.ok)).toEqual({
      ok: { activated: false, retentionExpired: false },
    })
  } finally {
    release.resolve()
    await instance.close()
    await h.dispose()
  }
})
