import { describe, expect, it } from 'vitest'
import { isOk, parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { callDeployment } from './model-request-support.ts'
import { actor } from './support.ts'

describe('demo authenticated observer issuance', () => {
  it('binds an endpoint only after the real actor and held session are checked', async () => {
    const config = await callDeployment('observer-auth')
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      diagnostics: { record() {} },
    })
    try {
      await app.ready
      const who = await actor(app)
      const prepared = await app.prepareSession(who, 'observer-session')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      const call = parseOpaqueIdentifier('observer-call', 'ModelCallId')
      if (!isOk(call)) throw new Error('call fixture invalid')
      const forgedTenant = parseTenantId({
        organization: 'wrong-organization',
        account: who.account,
      })
      if (!isOk(forgedTenant)) throw new Error('tenant fixture invalid')
      const wrong = await app.openModelObserver(
        { ...who, tenant: forgedTenant.ok },
        prepared.session,
        call.ok,
        async () => {},
      )
      expect(wrong).toEqual({ failure: 'identityMismatch' })
      const issued = await app.openModelObserver(who, prepared.session, call.ok, async () => {})
      if (!('endpoint' in issued)) throw new Error('endpoint issuance failed')
      expect(
        issued.access.authorize({
          request: {
            session: prepared.session,
            endpoint: issued.endpoint,
            observer_max_buffered_events: 2,
            observer_max_buffered_bytes: 1024,
          },
          session: prepared.session,
          tenant: prepared.tenant,
          callId: call.ok,
        }),
      ).toHaveProperty('observer')
      expect(await issued.revoke()).toEqual({ released: true })
      expect(
        issued.access.authorize({
          request: {
            session: prepared.session,
            endpoint: issued.endpoint,
            observer_max_buffered_events: 2,
            observer_max_buffered_bytes: 1024,
          },
          session: prepared.session,
          tenant: prepared.tenant,
          callId: call.ok,
        }),
      ).toEqual({ unavailable: true })
    } finally {
      expect((await app.close()).complete).toBe(true)
    }
  })
})
