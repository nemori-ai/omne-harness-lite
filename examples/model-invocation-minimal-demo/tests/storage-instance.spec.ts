import { describe, expect, it } from 'vitest'
import { StorageDefect, type AtomicStorage } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { createAcceptanceApplication } from '../src/index.ts'
import { actor, BODY, deployment, evidence, ref } from './support.ts'

describe('AB-V6 actual reader rejects a foreign atomic storage unit', () => {
  it('uses a second actual connection to the same file rather than reporting the mismatch as absence', async () => {
    const config = await deployment('foreign-storage-instance')
    let foreign: AtomicStorage | undefined
    let enabled = false
    let lookupArmed = false
    let foreignCalls = 0
    const app = createAcceptanceApplication(config, {
      diagnostics: {
        record(event) {
          if (
            enabled &&
            event.event === 'directory' &&
            event.phase === 'value' &&
            event.outcome === 'start'
          )
            lookupArmed = true
        },
      },
      hooks: {
        storageOpened(storage) {
          const atomic = storage.atomic.bind(storage)
          storage.atomic = callback => {
            if (lookupArmed) {
              lookupArmed = false
              foreignCalls += 1
              if (foreign === undefined) throw new Error('foreign storage not opened')
              return foreign.atomic(callback)
            }
            return atomic(callback)
          }
        },
      },
    })
    await app.ready
    const second = await openStorage({ dialect: 'sqlite', file: config.databaseFile })
    foreign = second
    try {
      const identity = await actor(app)
      expect(
        await app.publishCredential(identity, async actual => ({
          account: actual.account,
          tenant: actual.tenant,
          sourceRef: ref('same-instance-source'),
          body: BODY,
        })),
      ).toEqual({ stored: true })
      enabled = true
      await expect(app.verifyCredential(identity, BODY)).rejects.toBeInstanceOf(StorageDefect)
      expect(foreignCalls).toBe(1)
      enabled = false
      expect(await app.verifyCredential(identity, BODY)).toEqual({ matches: true })
      await evidence('AB-V6-foreign-storage', {
        sameFile: true,
        distinctActualInstance: true,
        foreignCalls,
        defectRatherThanAbsent: true,
        matchingOwnerStillReadable: true,
      })
    } finally {
      await second.close()
      expect((await app.close()).complete).toBe(true)
    }
  })
})
