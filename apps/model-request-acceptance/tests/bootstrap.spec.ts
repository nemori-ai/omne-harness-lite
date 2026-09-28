import { describe, expect, it } from 'vitest'
import { createAcceptanceApplication, STAGE_FIBERS } from '../src/index.ts'
import {
  actor,
  BODY,
  deployment,
  evidence,
  noBusinessBeforeConfirmation,
  PASSWORD,
  persisted,
  ref,
} from './support.ts'

describe('D092 actual authentication assembly', () => {
  it('AB-V1: completes all migrations and fixed two gates before actual identity and same-source storage', async () => {
    const config = await deployment('real-auth')
    const events: import('../src/index.ts').AcceptanceEvent[] = []
    const writes: { phase: string; persisted: ReturnType<typeof persisted> }[] = []
    let confirmed = false
    const app = createAcceptanceApplication(config, {
      diagnostics: {
        record(event) {
          if (event.event === 'confirm' && event.outcome === 'succeeded') confirmed = true
          return events.push(event)
        },
      },
      hooks: {
        storageOpened(storage) {
          const write = storage.write.bind(storage),
            atomic = storage.atomic.bind(storage)
          const observe = () => {
            const state = persisted(config.databaseFile)
            writes.push({ phase: confirmed ? 'confirmed' : 'unconfirmed', persisted: state })
            if (!confirmed) {
              noBusinessBeforeConfirmation(state)
            }
          }
          storage.write = async work => {
            const result = await write(work)
            observe()
            return result
          }
          storage.atomic = async work => {
            const result = await atomic(work)
            observe()
            return result
          }
        },
      },
    })
    try {
      expect(await app.register('early', PASSWORD)).toEqual({ failure: 'stageClosed' })
      const ready = await app.ready
      expect(ready.confirmation.snapshotTaken).toBe(true)
      expect(ready.confirmation.snapshotRemoved).toBe(true)
      expect(Object.keys(app.status().fibers)).toEqual([...STAGE_FIBERS])
      expect(Object.values(app.status().fibers)).toEqual(Array(8).fill(2))
      const confirmedIndex = events.findIndex(
        e => e.event === 'confirm' && e.outcome === 'succeeded',
      )
      expect(events.slice(0, confirmedIndex).filter(e => e.event === 'fiber')).toHaveLength(6)
      expect(events.findIndex(e => e.event === 'directory')).toBeGreaterThan(confirmedIndex)
      expect(writes.some(e => e.phase === 'confirmed' && e.persisted.manifest === '1')).toBe(true)
      const identity = await actor(app)
      expect(
        await app.publishCredential(identity, async actual => ({
          account: actual.account,
          tenant: actual.tenant,
          sourceRef: ref('source-ref-sentinel-a'),
          body: BODY,
        })),
      ).toEqual({ stored: true })
      expect(await app.verifyCredential(identity, BODY)).toEqual({ matches: true })
      expect(await app.verifyCredential(identity, Buffer.from('other'))).toEqual({ matches: false })
      expect(app.status().diagnosticFailures).toBe(0)
      const state = persisted(config.databaseFile)
      expect(state.counts).toEqual({
        account: 1,
        login_state: 1,
        organization: 1,
        membership: 1,
        model_credential_binding: 1,
        credential_custodian_replica: 1,
      })
      const raw = JSON.stringify(events)
      for (const sentinel of [
        PASSWORD,
        BODY.toString(),
        'source-ref-sentinel-a',
        'BEGIN PRIVATE KEY',
      ])
        expect(raw).not.toContain(sentinel)
    } finally {
      expect((await app.close()).complete).toBe(true)
    }
    expect(app.status().serving).toBe(false)
    expect(Object.values(app.status().fibers)).toEqual(Array(8).fill(4))
    expect(await app.register('late', PASSWORD)).toEqual({ failure: 'stageClosed' })
    await evidence('AB-V1', { events, writes, final: app.status(), modelHttp: 0 })
  })
})
