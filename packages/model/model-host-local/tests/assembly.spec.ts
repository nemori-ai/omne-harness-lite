// The construction and the close of the local Model assembly. The whole send path runs in the slow
// layer (local-model.spec.ts); here only what the assembly decides before any send.
import { describe, expect, it } from 'vitest'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { assembleLocalModel, type LocalModelConfig } from '@omne-harness/model-host-local'

type Principal = Readonly<{ subject: string }>

function config(overrides: Partial<LocalModelConfig<Principal>> = {}): LocalModelConfig<Principal> {
  const memory = createTestModelDependencies<Principal>({
    start: '2026-10-23T00:00:00.000Z',
    maxWaiters: 1,
    maxQueued: 1,
    sends: [],
    owners: [],
    authority: {
      authorize: ({ action }) => ({ failure: { kind: 'denied', action } }),
      execution: () => ({ failure: { kind: 'denied', action: 'execution-channel' } }),
    },
    evidence: [],
    limits: {
      scanPageCalls: 1,
      resultPageParts: 1,
      resultPageTargetBytes: 1024,
      readIdleMs: 1000,
      capacity: { bytes: '1', blocks: '1', attachmentBytes: '0' },
    },
  })
  return {
    credentials: {
      present: () => ({ kind: 'unavailable' }),
      resolve: () => ({ kind: 'unavailable' }),
    },
    commands: memory.dependencies.commands,
    coordinator: memory.controls.send.coordinator,
    families: composeFamilies([]),
    network: { maxConnections: 1, idleConnectionTimeoutMs: 1_000 },
    routes: {
      openrouter: { url: 'https://gateway.invalid/api/v1/chat/completions', endMarker: '[DONE]' },
    },
    transportLimits: {
      connectTimeoutMs: null,
      maxErrorBodyBytes: 1_024,
      maxEventBytes: 1_024,
      json: {
        maxBytes: 1_024,
        maxDepth: 8,
        maxItems: 8,
        maxMembers: 8,
        maxStringLength: 1_024,
        maxNumberLength: 8,
      },
    },
    maxRetainedAttempts: 1,
    ...overrides,
  }
}

describe('assembleLocalModel', () => {
  it('refuses a route that is not a plain https URL when it is built', () => {
    expect(() =>
      assembleLocalModel(
        config({ routes: { openrouter: { url: 'http://gateway.invalid/', endMarker: null } } }),
      ),
    ).toThrow(RangeError)
  })

  it('refuses a limit that the send boundary refuses when it is built', () => {
    expect(() => assembleLocalModel(config({ maxRetainedAttempts: 0 }))).toThrow(RangeError)
  })

  it('refuses a network configuration that the network refuses when it is built', () => {
    expect(() =>
      assembleLocalModel(
        config({ network: { maxConnections: 0, idleConnectionTimeoutMs: 1_000 } }),
      ),
    ).toThrow(RangeError)
  })

  it('closes once, however often close is called', async () => {
    const local = assembleLocalModel(config())
    const first = local.close()
    expect(local.close()).toBe(first)
    await expect(first).resolves.toBeUndefined()
  })
})
