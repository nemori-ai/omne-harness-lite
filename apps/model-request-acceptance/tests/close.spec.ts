import { describe, expect, it } from 'vitest'
import { createAcceptanceApplication, type AcceptanceEvent } from '../src/index.ts'
import { actor, BODY, deployment, evidence, latch, PASSWORD, ref } from './support.ts'

describe('AB-V8 actual work and ordered resource close', () => {
  for (const boundary of ['source', 'store', 'lookup'] as const)
    it(`waits for actual ${boundary} work, rejects new admission and closes the single owner once`, async () => {
      const config = await deployment(`close-${boundary}`),
        entered = latch(),
        release = latch()
      const events: AcceptanceEvent[] = []
      let blocking = false,
        replicaRead = false,
        replicaStore = false,
        atomicPaused = false
      const app = createAcceptanceApplication(config, {
        diagnostics: {
          record(event) {
            events.push(event)
            if (event.event === 'replica' && event.outcome === 'body') replicaRead = true
            if (
              event.event === 'replica' &&
              event.phase === 'admission' &&
              event.outcome === 'accepted'
            )
              replicaStore = true
          },
        },
        hooks: {
          storageOpened(storage) {
            const atomic = storage.atomic.bind(storage)
            storage.atomic = async callback =>
              atomic(async unit => {
                const result = await callback(unit)
                if (
                  blocking &&
                  !atomicPaused &&
                  ((boundary === 'store' && replicaStore) || replicaRead)
                ) {
                  atomicPaused = true
                  entered.resolve()
                  await release.promise
                }
                return result
              })
          },
        },
      })
      await app.ready
      const identity = await actor(app)
      if (boundary === 'lookup')
        expect(
          await app.publishCredential(identity, async actual => ({
            account: actual.account,
            tenant: actual.tenant,
            sourceRef: ref('close-ref'),
            body: BODY,
          })),
        ).toEqual({ stored: true })
      blocking = true
      const work =
        boundary === 'lookup'
          ? app.verifyCredential(identity, BODY)
          : app.publishCredential(identity, async actual => {
              if (boundary === 'source') {
                entered.resolve()
                await release.promise
              }
              return {
                account: actual.account,
                tenant: actual.tenant,
                sourceRef: ref('close-ref'),
                body: BODY,
              }
            })
      await entered.promise
      const first = app.close(),
        second = app.close()
      expect(first).toBe(second)
      expect(app.status().inFlight).toBe(1)
      expect(await app.register('after-close', PASSWORD)).toEqual({ failure: 'stageClosed' })
      expect(events.some(e => e.event === 'replica' && e.outcome === 'closed')).toBe(false)
      release.resolve()
      expect(await work).toEqual(boundary === 'lookup' ? { matches: true } : { stored: true })
      expect((await first).complete).toBe(true)
      const lookup = events.findIndex(e => e.event === 'close' && e.phase === 'lookup')
      const replica = events.findIndex(e => e.event === 'replica' && e.outcome === 'closed')
      const clock = events.findIndex(e => e.event === 'close' && e.phase === 'clock')
      const storage = events.findIndex(e => e.event === 'close' && e.phase === 'storageOwner')
      expect(lookup).toBeLessThan(replica)
      expect(replica).toBeLessThan(clock)
      expect(clock).toBeLessThan(storage)
      expect(events.filter(e => e.event === 'replica' && e.outcome === 'closed')).toHaveLength(1)
      expect(app.status().inFlight).toBe(0)
      const reopened = createAcceptanceApplication(config, { diagnostics: { record() {} } })
      await reopened.ready
      expect((await reopened.close()).complete).toBe(true)
      await evidence(`AB-V8-${boundary}`, {
        events,
        final: app.status(),
        outerAtomicPaused: atomicPaused,
        modelHttp: 0,
      })
    })

  it('counts failing or full diagnostic sinks independently without changing business results', async () => {
    const config = await deployment('failed-sink')
    let rejected = 0
    const app = createAcceptanceApplication(config, {
      diagnostics: {
        record() {
          rejected += 1
          throw new Error('password/body/ref must not escape')
        },
      },
    })
    await app.ready
    const identity = await actor(app)
    expect(
      await app.publishCredential(identity, async actual => ({
        account: actual.account,
        tenant: actual.tenant,
        sourceRef: ref('sink-ref'),
        body: BODY,
      })),
    ).toEqual({ stored: true })
    expect(await app.verifyCredential(identity, BODY)).toEqual({ matches: true })
    expect((await app.close()).complete).toBe(true)
    expect(app.status().diagnosticFailures).toBe(rejected)
    await evidence('AB-V8-sink', { rejected, final: app.status() })
  })
})
