import { describe, expect, it } from 'vitest'
import {
  parseAccountId,
  parseLoginStateId,
  parseOrganizationId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { createAcceptanceApplication } from '../src/index.ts'
import { actor, BODY, deployment, fixture, latch, PASSWORD, persisted, ref } from './support.ts'

describe('AB-V4 / V6: actual identity and source matching', () => {
  it('preserves wrong-password rejection and refuses invalid login, account, tenant and source scopes before publication', async () => {
    const { app, config } = await fixture('scope-rejections')
    try {
      const alice = await actor(app)
      expect(await app.authenticate('alice', 'wrong-password-sentinel')).toEqual({
        step: 'issue',
        result: { failure: 'identifier-or-credential-rejected' },
      })
      const bob = await actor(app, 'bob')
      let called = 0
      const source = async (actual: typeof alice) => {
        called += 1
        return {
          account: actual.account,
          tenant: actual.tenant,
          sourceRef: ref('scope-ref'),
          body: BODY,
        }
      }
      for (const bad of [
        { ...alice, loginState: unwrap(parseLoginStateId('absent-login')) },
        { ...alice, account: bob.account },
        { ...alice, tenant: bob.tenant },
      ])
        expect(await app.publishCredential(bad, source)).not.toEqual({ stored: true })
      expect(called).toBe(0)
      expect(
        await app.publishCredential(alice, async () => ({
          account: bob.account,
          tenant: alice.tenant,
          sourceRef: ref('scope-ref'),
          body: BODY,
        })),
      ).toEqual({ failure: 'sourceScopeMismatch' })
      expect(
        await app.publishCredential(alice, async () => ({
          account: alice.account,
          tenant: {
            ...alice.tenant,
            organization: unwrap(parseOrganizationId('wrong-organization')),
          },
          sourceRef: ref('scope-ref'),
          body: BODY,
        })),
      ).toEqual({ failure: 'sourceScopeMismatch' })
      expect(persisted(config.databaseFile).counts.model_credential_binding).toBe(0)
      expect(persisted(config.databaseFile).counts.credential_custodian_replica).toBe(0)
    } finally {
      expect((await app.close()).complete).toBe(true)
    }
  })

  it('real A capture arrives after B rotation and returns stored:false without overwriting B', async () => {
    const config = await deployment('late-a'),
      entered = latch(),
      release = latch()
    let calls = 0
    const app = createAcceptanceApplication(config, {
      diagnostics: { record() {} },
      hooks: {
        async beforeStore() {
          calls += 1
          if (calls === 1) {
            entered.resolve()
            await release.promise
          }
        },
      },
    })
    await app.ready
    try {
      const identity = await actor(app)
      const a = app.publishCredential(identity, async actual => ({
        account: actual.account,
        tenant: actual.tenant,
        sourceRef: ref('ref-a'),
        body: Buffer.from('body-a'),
      }))
      await entered.promise
      expect(await app.verifyCredential(identity, Buffer.from('body-a'))).toEqual({
        step: 'lookup',
        result: { failure: 'credentialUnavailable' },
      })
      expect(
        await app.publishCredential(identity, async actual => ({
          account: actual.account,
          tenant: actual.tenant,
          sourceRef: ref('ref-b'),
          body: Buffer.from('body-b'),
        })),
      ).toEqual({ stored: true })
      release.resolve()
      expect(await a).toEqual({ stored: false })
      expect(await app.verifyCredential(identity, Buffer.from('body-a'))).toEqual({
        matches: false,
      })
      expect(await app.verifyCredential(identity, Buffer.from('body-b'))).toEqual({ matches: true })
    } finally {
      release.resolve()
      expect((await app.close()).complete).toBe(true)
    }
  })

  it('does not replay registration or source after a callback/store failure', async () => {
    const { app, config } = await fixture('partial-source-failure')
    try {
      const identity = await actor(app)
      let called = 0
      await expect(
        app.publishCredential(identity, async () => {
          called += 1
          throw new Error('body-sentinel must not escape')
        }),
      ).rejects.toMatchObject({ name: 'AcceptanceOperationDefect', step: 'publish' })
      expect(called).toBe(1)
      expect(persisted(config.databaseFile).counts.account).toBe(1)
      expect(persisted(config.databaseFile).counts.login_state).toBe(1)
      expect(
        await app.publishCredential(identity, async actual => ({
          account: actual.account,
          tenant: actual.tenant,
          sourceRef: ref('empty-ref'),
          body: new Uint8Array(),
        })),
      ).toEqual({ step: 'store', result: { failure: 'invalidInput' } })
      expect(persisted(config.databaseFile).counts.model_credential_binding).toBe(1)
      expect(persisted(config.databaseFile).counts.credential_custodian_replica).toBe(0)
      expect(await app.register('alice', PASSWORD)).toBe('identifier-taken')
    } finally {
      expect((await app.close()).complete).toBe(true)
    }
  })
})
