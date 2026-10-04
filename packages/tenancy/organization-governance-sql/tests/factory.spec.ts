import { expect, test } from 'vitest'
import { generateHandoffKeyPair, loadSigningKey, unwrap } from '@omne-harness-lite/identity-values'
import type { Duration } from '@omne-harness-lite/offer-expiry'
import { createOrganizationGovernance, OrganizationGovernanceStopped } from '../src/index.ts'
import { addAccount, bootOg } from './support.ts'

test('the four pure faces close together after their admitted common transaction', async () => {
  const h = await bootOg()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const account = await addAccount(h, { activated: false })
  const unexpected = (): never => {
    throw new Error('Unexpected account/login participation in createPersonal')
  }
  const instance = createOrganizationGovernance({
    storage: h.storage,
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
    let closed = false
    const closing = instance.close()
    void closing.then(() => {
      closed = true
    })
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
})
