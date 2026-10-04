import { expect, test } from 'vitest'
import { createAccountIdentity, AccountIdentityStopped } from '../src/index.ts'
import { cryptoRandomSource } from '../src/presentation.ts'
import { openHarness, POLICY, RETENTION } from './support.ts'

test.each([false, true])(
  'pure close waits for real SQLite commit, reentrant resolver close=%s',
  async reentrant => {
    const h = await openHarness({ label: 'pure-close' })
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let closed = false
    let callbackClose: Promise<void> | undefined
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
        resolveCredentials: () => {
          if (reentrant) {
            callbackClose = instance.close()
            void callbackClose.then(() => {
              closed = true
            })
          }
          return {
            ...h.credentials,
            async derive(value) {
              const material = await h.credentials.derive(value)
              entered.resolve()
              await release.promise
              return material
            },
          }
        },
        notifier: { accountActivated() {}, loginRevoked() {}, accountExpired() {} },
        diagnostics: { warn() {}, error() {} },
        random: cryptoRandomSource,
      },
    )
    try {
      const producing = instance.accounts.produce('pure-close-user', 'sufficient-password')
      await entered.promise
      const closing = instance.close()
      void closing.then(() => {
        closed = true
      })
      if (reentrant) expect(callbackClose).toBe(closing)
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
  },
)
