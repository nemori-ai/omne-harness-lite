import { describe, expect, it } from 'vitest'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoTransportRetention } from '../src/diagnostic-assembly.ts'
import { callDeployment, demoRetirement } from './model-request-support.ts'

describe('demo transport diagnostic retention at the real bootstrap', () => {
  it('tracks the actual Cordis transport service through application close', async () => {
    const config = await callDeployment('diagnostic-transport-owner')
    const tracker = createDemoTransportRetention(2, () => new Date('2026-09-28T20:30:00Z'))
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      diagnostics: { record() {} },
      transportRetention: tracker,
    })
    try {
      await app.ready
      const opened = tracker.health()
      expect(opened.transportLiveInstances).toBe(1)
      expect(opened.live[0]?.role).toBe('current')
      expect(opened.live[0]?.inspect?.registrations).toBe(1)
      expect((await app.close()).complete).toBe(true)
      const generation = opened.live[0]?.generation
      if (generation === undefined) throw new Error('transport generation missing')
      tracker.markRetired(generation)
      expect(await tracker.closeRetired(generation, demoRetirement())).toEqual({ retired: true })
      expect(tracker.health().transportTerminalSnapshots).toBe(1)
      expect(tracker.health().transportLiveInstances).toBe(0)
    } finally {
      await app.close()
    }
  })

  it('refuses startup before creating the transport fiber when the shared limit is full', async () => {
    const config = await callDeployment('diagnostic-transport-full')
    const tracker = createDemoTransportRetention(1, () => new Date('2026-09-28T20:30:00Z'))
    const held = tracker.reserveReplacement()
    if (!('reservation' in held)) throw new Error('initial reservation missing')
    held.reservation.abortUnknown()
    let createdTransportFibers = 0
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      diagnostics: { record() {} },
      transportRetention: tracker,
      hooks: {
        fiberCreated(name) {
          if (name === 'modelTransport') createdTransportFibers++
        },
      },
    })
    await expect(app.ready).rejects.toThrow()
    expect(createdTransportFibers).toBe(0)
    expect(tracker.health()).toMatchObject({
      transportLiveInstances: 0,
      transportReservedInstances: 1,
      transportReplacementRefusals: 1,
    })
    await app.close()
    held.reservation.abortNoResources()
  })
})
