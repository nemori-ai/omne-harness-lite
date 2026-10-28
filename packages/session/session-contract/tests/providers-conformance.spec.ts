import { describe, it, expect } from 'vitest'
import { initializationGuards } from './initialization-fixture.ts'
import {
  sessionIdentityBridgeConformance,
  sessionEvidenceBridgeConformance,
  sessionContextInputConformance,
  sessionClockConformance,
  sessionIdleInputConformance,
  sessionNotifierConformance,
  scopeReleaseConformance,
  agentDriveConformance,
  createScriptedSessionIdentityBridge,
  createMemorySessionEvidenceBridge,
  createMemoryInitializationSource,
  createMemorySessionContextInput,
  createMemorySessionClock,
  createMemorySessionIdleInput,
  createMemorySessionNotifier,
  createMemoryScopeRelease,
  createMemoryAgentDrive,
  adoption,
  evidence,
  type ConformanceCase,
  type ScriptedSessionIdentityBridge,
} from '@omne-harness/session-contract/testing'

function prove<F>(cases: readonly ConformanceCase<F>[], factory: () => F) {
  for (const test of cases)
    it(test.name, async () => {
      await test.run(factory())
    })
}
describe('effective provider conformance on non-durable doubles', () => {
  prove(sessionIdentityBridgeConformance(), () => createScriptedSessionIdentityBridge<string>())
  prove(sessionEvidenceBridgeConformance(), () => {
    const initialization = createMemoryInitializationSource()
    const bridge = createMemorySessionEvidenceBridge({ initialization })
    return {
      ...bridge,
      prepare: async command => {
        if (command.kind === 'create') {
          const material = initializationGuards(command, null)[0]
          if (material === undefined) throw new Error('missing explicit adoption fixture')
          initialization.controls.register(command, material)
        }
        return bridge.prepare(command)
      },
    }
  })
  prove(sessionContextInputConformance(), () => createMemorySessionContextInput<string>())
  prove(sessionClockConformance(), createMemorySessionClock)
  prove(sessionIdleInputConformance(), () =>
    createMemorySessionIdleInput<string>({
      kind: 'unknown',
      at: { at: '2026-01-01T00:00:00Z', protocol: adoption('clock'), source: evidence('clock') },
      scope: evidence('scope'),
      source: evidence('unknown'),
    }),
  )
  prove(sessionNotifierConformance(), createMemorySessionNotifier)
  prove(scopeReleaseConformance(), createMemoryScopeRelease)
  prove(agentDriveConformance(), createMemoryAgentDrive)
  for (const check of sessionIdentityBridgeConformance().slice(1))
    it(`the identity suite detects cached material: ${check.name}`, async () => {
      const real = createScriptedSessionIdentityBridge<string>()
      let first: Awaited<ReturnType<typeof real.prepare>> | undefined
      const cached: ScriptedSessionIdentityBridge<string> = {
        ...real,
        prepare: async (input, command) => {
          first ??= await real.prepare(input, command)
          return first
        },
      }
      await expect(check.run(cached)).rejects.toThrow('identity material reused')
    })
  it('the scope suite detects a provider that hides unsupported resources', async () => {
    const real = createMemoryScopeRelease()
    await expect(
      scopeReleaseConformance()[0]?.run({
        ...real,
        release: async () => ({ dispositions: ['released'], source: evidence('false') }),
      }),
    ).rejects.toThrow()
  })
  it('the drive suite detects an unavailable inspect mislabeled missing', async () => {
    const real = createMemoryAgentDrive()
    await expect(
      agentDriveConformance()[0]?.run({
        ...real,
        inspect: async () => ({
          ok: {
            revision: null,
            state: 'missing',
            attachment: null,
            conclusion: null,
            evidence: evidence('false'),
          },
        }),
      }),
    ).rejects.toThrow()
  })
})
