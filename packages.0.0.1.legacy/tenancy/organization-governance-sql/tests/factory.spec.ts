import { expect, test } from 'vitest'
import { generateHandoffKeyPair, loadSigningKey, unwrap } from '@omne-harness-lite/identity-values'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { Duration } from '@omne-harness-lite/offer-expiry'
import { createOrganizationGovernance, OrganizationGovernanceStopped } from '../src/index.ts'
import { addAccount, bootOg } from './support.ts'

test.each([false, true])(
  'four pure faces drain their common transaction, reentrant storage close=%s',
  async reentrant => {
    const h = await bootOg()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const account = await addAccount(h, { activated: false })
    const unexpected = (): never => {
      throw new Error('Unexpected account/login participation in createPersonal')
    }
    let closed = false
    let callbackClose: Promise<void> | undefined
    const storage: AtomicStorage = {
      read: fn => h.storage.read(fn),
      write: fn => h.storage.write(fn),
      atomic(fn) {
        if (reentrant) {
          callbackClose = instance.close()
          void callbackClose.then(() => {
            closed = true
          })
        }
        return h.storage.atomic(unit =>
          fn({
            assertStorage(expected) {
              unit.assertStorage(expected === storage ? h.storage : expected)
            },
            run: fn => unit.run(fn),
            query: fn => unit.query(fn),
            mutate: fn => unit.mutate(fn),
            observeCompletion: () => unit.observeCompletion(),
            afterCommit: notify => unit.afterCommit(notify),
          }),
        )
      },
    }
    const instance = createOrganizationGovernance({
      storage,
      clock: h.clock,
      accounts: {
        participate(unit) {
          const face = h.accounts.participate(unit)
          return {
            ...face,
            resolveActivatedIdentifier: unexpected,
            async read(input) {
              const reading = await face.read(input)
              entered.resolve()
              await release.promise
              return reading
            },
          }
        },
      },
      logins: {
        participate(unit) {
          return {
            ...h.logins.participate(unit),
            exchange: unexpected,
            revoke: unexpected,
            listEffective: unexpected,
            finalizeActivity: unexpected,
            commitCredentialChange: unexpected,
          }
        },
      },
      config: {
        invitationTtlDefault: 1000 as Duration,
        affiliationRequestTtlDefault: 1000 as Duration,
        teamCreationKeyRetention: 1000 as Duration,
        purgeSigningKey: unwrap(loadSigningKey(generateHandoffKeyPair().privateKeyPem)),
      },
      logger: { error() {}, info() {} },
      notify() {},
    })
    const creating = instance.organizations.createPersonal(account)
    try {
      await entered.promise
      const closing = instance.close()
      void closing.then(() => {
        closed = true
      })
      if (reentrant) expect(callbackClose).toBe(closing)
      expect(instance.close()).toBe(closing)
      await expect(instance.memberships.mine(account)).rejects.toBeInstanceOf(
        OrganizationGovernanceStopped,
      )
      await expect(
        instance.offers.readAffiliationRequest('missing', 'missing'),
      ).rejects.toBeInstanceOf(OrganizationGovernanceStopped)
      await expect(
        instance.organizationPurge.purgePersonalOrganization(account),
      ).rejects.toBeInstanceOf(OrganizationGovernanceStopped)
      expect(() => instance.organizations.scopeLayers('missing')).toThrow(
        OrganizationGovernanceStopped,
      )
      expect(closed).toBe(false)
      release.resolve()
      const created = await creating
      expect('ok' in created).toBe(true)
      await closing
      if (!('ok' in created)) throw new Error('admitted common transaction did not finish')
      expect(await h.organizations.read(created.ok.organization)).toHaveProperty('ok')
    } finally {
      release.resolve()
      await instance.close()
      await h.dispose()
    }
  },
)
