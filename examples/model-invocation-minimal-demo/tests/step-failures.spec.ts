import { describe, expect, it } from 'vitest'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { createAcceptanceApplication } from '../src/index.ts'
import { actor, BODY, deployment, evidence, PASSWORD, persisted, ref } from './support.ts'

describe('AB-V4 actual provider failures retain independent commits', () => {
  for (const fault of ['issue', 'exchange', 'currentTenant', 'bind', 'store'] as const)
    it(`does not replay the actual ${fault} chain`, async () => {
      const config = await deployment(`step-${fault}`)
      let armed = false,
        enabled = false,
        injected = 0,
        sources = 0
      const app = createAcceptanceApplication(config, {
        diagnostics: { record() {} },
        hooks: {
          storageOpened(storage) {
            const atomic = storage.atomic.bind(storage),
              write = storage.write.bind(storage)
            storage.atomic = async callback => {
              if (armed && fault !== 'bind' && fault !== 'issue') {
                armed = false
                injected += 1
                throw new StorageUnavailable('controlled provider failure')
              }
              return atomic(callback)
            }
            storage.write = async callback => {
              if (armed && (fault === 'bind' || fault === 'issue')) {
                armed = false
                injected += 1
                throw new StorageUnavailable('controlled provider failure')
              }
              return write(callback)
            }
          },
          beforeIdentityStep(step) {
            if (enabled && step === fault) armed = true
          },
        },
      })
      await app.ready
      try {
        if (fault === 'bind' || fault === 'store') {
          const identity = await actor(app)
          enabled = true
          expect(
            await app.publishCredential(identity, async actual => {
              sources += 1
              return {
                account: actual.account,
                tenant: actual.tenant,
                sourceRef: ref('failure-ref'),
                body: BODY,
              }
            }),
          ).toEqual({ step: fault, result: { failure: 'unavailable' } })
          expect(sources).toBe(1)
        } else {
          expect(await app.register('alice', PASSWORD)).toBe('registered')
          enabled = true
          expect(await app.authenticate('alice', PASSWORD)).toEqual({
            step: fault,
            result: { failure: fault === 'currentTenant' ? 'unavailable' : 'storage-unavailable' },
          })
        }
        expect(injected).toBe(1)
        const state = persisted(config.databaseFile)
        expect(state.counts.account).toBe(1)
        expect(state.counts.login_state).toBe(fault === 'issue' ? 0 : 1)
        expect(state.counts.model_credential_binding).toBe(fault === 'store' ? 1 : 0)
        expect(state.counts.credential_custodian_replica).toBe(0)
        await evidence(`AB-V4-${fault}`, { state, injected, sources, modelHttp: 0 })
      } finally {
        expect((await app.close()).complete).toBe(true)
      }
    })
})
