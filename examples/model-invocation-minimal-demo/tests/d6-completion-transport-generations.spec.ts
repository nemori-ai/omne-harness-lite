import { describe, expect, it } from 'vitest'
import { openRouterCredentialRedactionConfig } from '@omne-harness-lite/model-request-runtime'
import {
  createDeepSeekV41FlashInputMeter,
  createModelTransportService,
  createOfficialProfileContent,
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
} from '@omne-harness-lite/pi-ai-transport'
import type { RetirementPolicy } from '@omne-harness-lite/model-request-runtime'
import { createDemoTransportRetention } from '../src/diagnostic-assembly.ts'

function policy(waitMilliseconds: number): RetirementPolicy {
  return {
    waitMilliseconds,
    force: false,
    schedule(milliseconds, callback) {
      const timer = setTimeout(callback, milliseconds)
      return () => clearTimeout(timer)
    },
  }
}

function service() {
  return createModelTransportService({
    policy: {
      maxConnections: 1,
      idleConnectionTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      maxErrorBodyBytes: 1024,
      maxSseEventBytes: 1024,
      credentialRedaction: openRouterCredentialRedactionConfig,
    },
  })
}

describe('D6 retention of actual transport service generations', () => {
  it('denies replacement while two real owners are live, then evicts only a terminal snapshot', async () => {
    const tracker = createDemoTransportRetention(2, () => new Date('2026-09-29T00:00:00Z'))
    const first = service()
    const second = service()
    const third = service()
    const declaration = createOfficialProfileContent(deepseekV41FlashDefinition, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration: deepseekV41FlashConfiguration,
    })
    if ('rejected' in declaration) throw new Error('real profile unavailable')
    const registration = first.registerAdaptation(
      deepseekV41FlashDefinition,
      createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition),
      {},
      () => {},
    )
    if ('rejected' in registration) throw new Error('real registration unavailable')
    const held = first.acquire(declaration.ok.adaptation, deepseekV41FlashDefinition.modelId)
    if ('rejected' in held) throw new Error('real lease unavailable')
    let leaseReleased = false
    try {
      const firstSlot = tracker.reserveReplacement()
      if (!('reservation' in firstSlot)) throw new Error('first slot unavailable')
      const firstId = firstSlot.reservation.commit(first)
      const secondSlot = tracker.reserveReplacement()
      if (!('reservation' in secondSlot)) throw new Error('second slot unavailable')
      const secondId = secondSlot.reservation.commit(second)
      tracker.markRetired(firstId)
      expect(await tracker.closeRetired(firstId, policy(10))).toMatchObject({
        remaining_active: true,
        references: 1,
        executions: 0,
      })
      expect(tracker.health()).toMatchObject({
        transportLiveInstances: 2,
        transportTerminalSnapshots: 0,
        transportReservedInstances: 0,
      })
      expect(tracker.health().live.find(item => item.generation === firstId)).toMatchObject({
        role: 'retired',
        inspect: { references: 1 },
      })
      expect(tracker.health().live.find(item => item.generation === secondId)).toMatchObject({
        role: 'current',
        inspect: { accepting: true },
      })
      expect(tracker.reserveReplacement()).toEqual({ unavailable: 'transport_retention_full' })
      expect(tracker.health().transportReplacementRefusals).toBe(1)
      expect(second.inspect().accepting).toBe(true)
      held.lease.release()
      leaseReleased = true
      expect(await tracker.closeRetired(firstId, policy(100))).toEqual({ retired: true })
      await first.closed
      expect(tracker.health()).toMatchObject({
        transportLiveInstances: 1,
        transportTerminalSnapshots: 1,
      })
      const thirdSlot = tracker.reserveReplacement()
      if (!('reservation' in thirdSlot)) throw new Error('third slot unavailable')
      expect(tracker.health()).toMatchObject({
        transportSnapshotsEvicted: 1,
        transportTerminalSnapshots: 0,
        transportReservedInstances: 1,
      })
      const thirdId = thirdSlot.reservation.commit(third)
      expect(
        tracker
          .health()
          .live.map(item => item.generation)
          .sort(),
      ).toEqual([secondId, thirdId])
      tracker.markRetired(secondId)
      expect(await tracker.closeRetired(secondId, policy(100))).toEqual({ retired: true })
      tracker.markRetired(thirdId)
      expect(await tracker.closeRetired(thirdId, policy(100))).toEqual({ retired: true })
      await Promise.all([second.closed, third.closed])
      expect(tracker.health()).toMatchObject({
        transportLiveInstances: 0,
        transportTerminalSnapshots: 2,
        transportSnapshotsEvicted: 1,
      })
      expect(
        tracker
          .health()
          .terminal.map(item => item.generation)
          .sort(),
      ).toEqual([secondId, thirdId])
      const beforeRead = tracker.health()
      for (let query = 0; query < 16; query++) expect(tracker.health()).toEqual(beforeRead)
    } finally {
      if (!leaseReleased) held.lease.release()
      await Promise.allSettled([
        first.close(policy(100)),
        second.close(policy(100)),
        third.close(policy(100)),
      ])
    }
  })
})
