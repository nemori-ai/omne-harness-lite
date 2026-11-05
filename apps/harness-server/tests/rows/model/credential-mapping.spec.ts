// The answers of the tenant credential adapters that the real vault does not produce on demand: a
// store write that is not confirmed or denied, a stored binding without a time or with a broken
// time, and a credential port that throws or refuses. The vault and the admission are doubles here;
// `credential-custody.spec.ts` checks the same adapter over a real vault and the real admission.
import type { LocalCredentialCustody } from '@omne-harness/model-host-local/cordis'
import type { CredentialPort } from '@omne-harness/model-contract/provider'
import type { ModelCredentialAccess } from '@omne-harness/server-entry'
import { describe, expect, it } from 'vitest'
import { tenantCredentialSupplier } from '../../../src/model/tenant-credential.ts'
import { createTenantCredentialCustody } from '../../../src/rows/model-credential/custody.ts'
import { fixtureTenant } from '../../entry/support.ts'

const tenant = fixtureTenant('a')
// The admission is a double that allows every call, so the principal is only carried through.
const access: ModelCredentialAccess = {
  principal: {
    kind: 'acting-for-tenant',
    actor: { kind: 'system', component: 'server-entry' },
    tenant,
    work: { owner: 'identity-login', work: 'lgn_test' },
  },
  tenant,
}
const SECRET = 'sk-or-v1-sentinel-mapping-7c1f'

function custodyOver(store: Partial<LocalCredentialCustody>) {
  const refuse = () => {
    throw new Error('not used by this case')
  }
  return createTenantCredentialCustody({
    custody: { bind: refuse, unbind: refuse, describe: refuse, ...store },
    qualify: async () => ({ kind: 'allowed' }),
    now: () => ({ ok: true, text: '2026-11-04T09:00:00.000Z' }),
  })
}

describe('the custody port maps every store answer', () => {
  for (const [store, outcome] of [
    ['unconfirmed', 'unknown'],
    ['denied', 'denied'],
    ['not-written', 'basis-unavailable'],
  ] as const) {
    it(`bind: a ${store} write answers ${outcome}`, async () => {
      const custody = custodyOver({ bind: () => ({ kind: store }) })
      const answer = await custody.bind({ access, secret: SECRET })
      expect(answer).toEqual({ kind: outcome })
      expect(JSON.stringify(answer)).not.toContain(SECRET)
    })
    it(`unbind: a ${store} removal answers ${outcome}`, async () => {
      const custody = custodyOver({ unbind: () => ({ kind: store }) })
      expect(await custody.unbind({ access })).toEqual({ kind: outcome })
    })
  }

  it('describe: a binding without a stored time shows no time; a revoked one is unreadable', async () => {
    const custody = custodyOver({ describe: () => ({ kind: 'bound', life: 'revoked' }) })
    expect(await custody.describe({ access })).toEqual({
      kind: 'succeeded',
      credential: { state: 'unreadable', tenantId: tenant },
    })
  })

  it('describe: a stored time that does not parse is a store fault, not a made-up time', async () => {
    const custody = custodyOver({
      describe: () => ({ kind: 'bound', life: 'active', configuredAt: 'not-a-time' }),
    })
    expect(await custody.describe({ access })).toEqual({ kind: 'basis-unavailable' })
  })

  it('describe: a denied view answers denied', async () => {
    const custody = custodyOver({ describe: () => ({ kind: 'denied' }) })
    expect(await custody.describe({ access })).toEqual({ kind: 'denied' })
  })
})

describe('the supplier completion never falls back to the factory reference', () => {
  const supplier = {
    adoption: { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) },
    recipient: 'openrouter',
    model: 'm',
  }
  const complete = (port: CredentialPort | undefined) =>
    tenantCredentialSupplier(() => port)({
      supplier,
      principal: access.principal,
      tenant,
    } as Parameters<ReturnType<typeof tenantCredentialSupplier>>[0])
  const portWith = (presentFor: NonNullable<CredentialPort['presentFor']>): CredentialPort => ({
    present: () => ({ kind: 'unavailable' }),
    resolve: () => ({ kind: 'unavailable' }),
    presentFor,
  })

  it('a custody that throws stops the preparation', () => {
    expect(
      complete(
        portWith(() => {
          throw new Error('synthetic custody failure')
        }),
      ),
    ).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-credential',
        diagnostic: 'credential-custody-failed',
      },
    })
  })

  it('a denied presence stops the preparation as denied', () => {
    expect(complete(portWith(() => ({ kind: 'denied' })))).toEqual({
      failure: { kind: 'denied', action: 'model-credential' },
    })
  })
})
