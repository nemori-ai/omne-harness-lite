import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  invokeModel,
  openRouterCredentialRedactionConfig,
  type InvocationPolicy,
} from '@omne-harness-lite/model-request-runtime'
import {
  createDeepSeekV41FlashInputMeter,
  createModelTransportService,
  createOfficialProfileContent,
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
  type ModelTransportService,
} from '@omne-harness-lite/pi-ai-transport'
import { createDemoTransportRetention } from '../src/diagnostic-assembly.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { callDeployment, demoRetirement } from './model-request-support.ts'

const definition = deepseekV41FlashDefinition

const invocationPolicy: InvocationPolicy = {
  now: () => new Date().toISOString(),
  schedule(milliseconds, callback) {
    const timer = setTimeout(callback, milliseconds)
    return () => clearTimeout(timer)
  },
  firstContentTimeoutMs: 3000,
  idleContentTimeoutMs: 3000,
  statusCauseTable: { '503': 'upstream_unavailable' },
  credentialRedaction: openRouterCredentialRedactionConfig,
  diagnostic() {},
}

describe('D6 real transport diagnostic pending across service generations', () => {
  it('retains two pending generations at the shared cap and evicts only the drained old snapshot', async () => {
    const deployment = await callDeployment('d6-transport-pending-generations')
    const tls = await createLocalTls(
      join(dirname(deployment.databaseFile), 'tls'),
      async () => {},
      0,
      definition.modelId,
    )
    const tracker = createDemoTransportRetention(2, () => new Date('2026-09-29T00:00:00Z'))
    let rejectOldDelivery: (reason: Error) => void = () => {}
    const oldDelivery = new Promise<void>((_, reject) => {
      rejectOldDelivery = reject
    })
    const currentDelivery = deferred()
    const services: ModelTransportService[] = []
    const declaration = createOfficialProfileContent(definition, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration: deepseekV41FlashConfiguration,
    })
    if ('rejected' in declaration) throw new Error('real official profile unavailable')
    const profile = declaration.ok
    const snapshot = {
      adaptation: profile.adaptation,
      providers: profile.providers,
      allowFallback: profile.allowFallback,
      inputModalities: profile.inputModalities,
      outputModalities: profile.outputModalities,
      maxInputTokens: profile.maxInputTokens,
      maxOutputTokens: profile.maxOutputTokens,
      inputConstraints: profile.inputConstraints,
      upstreamInputLimits: profile.upstreamInputLimits,
      updatedAt: '2026-09-29T00:00:00Z',
    }
    const message = judgeMessage({
      type: 'user',
      id: 'd6-pending-user',
      createdAt: '2026-09-29T00:00:00Z',
      blocks: [
        {
          id: 'd6-pending-text',
          kind: 'text',
          text: 'hello',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if ('rejected' in message) throw new Error('real message unavailable')
    const userMessage = message.ok
    function service(delivery?: Promise<void>): ModelTransportService {
      const created = createModelTransportService({
        ...tls.developmentTransport,
        policy: {
          maxConnections: 1,
          idleConnectionTimeoutMs: 1000,
          connectTimeoutMs: 1000,
          maxErrorBodyBytes: 1024,
          maxSseEventBytes: 4096,
          credentialRedaction: openRouterCredentialRedactionConfig,
        },
        ...(delivery ? { onDiagnostic: () => delivery } : {}),
      })
      services.push(created)
      const registered = created.registerAdaptation(
        definition,
        createDeepSeekV41FlashInputMeter(definition),
        {},
        () => {},
      )
      if ('rejected' in registered) throw new Error('real adaptation registration unavailable')
      return created
    }
    async function call(owned: ModelTransportService, number: number) {
      const acquired = owned.acquire(profile.adaptation, definition.modelId)
      if ('rejected' in acquired) throw new Error('real adaptation lease unavailable')
      try {
        const handle = invokeModel({
          calibration: { kind: 'none', reason: 'no_observation' },
          outputHistory: [],
          tokenMargin: { multiplier: 1, reserveTokens: 0 },
          target: {
            kind: 'model_call',
            callId: unwrap(parseOpaqueIdentifier(`d6-pending-call-${number}`, 'ModelCallId')),
            dispatch: number,
          },
          routeName: definition.modelId,
          provider: 'deepinfra/fp8',
          snapshot,
          parameters: { maxOutputTokens: 128 },
          messages: [userMessage],
          tools: [],
          transport: acquired.lease.transport,
          credential: 'local-controlled-key',
          signal: new AbortController().signal,
          policy: invocationPolicy,
        })
        const outcome = await handle.outcome
        if (!('outcome' in outcome))
          throw new Error(`real HTTPS call rejected before send: ${JSON.stringify(outcome)}`)
        expect(outcome.outcome).toBe('complete')
      } finally {
        acquired.lease.release()
      }
    }
    try {
      const old = service(oldDelivery)
      const oldSlot = tracker.reserveReplacement()
      if (!('reservation' in oldSlot)) throw new Error('old generation slot unavailable')
      const oldId = oldSlot.reservation.commit(old)
      await call(old, 1)
      expect(old.diagnostics().pending).toBe(1)

      const current = service(currentDelivery.promise)
      const currentSlot = tracker.reserveReplacement()
      if (!('reservation' in currentSlot)) throw new Error('current generation slot unavailable')
      const currentId = currentSlot.reservation.commit(current)
      await call(current, 2)
      expect(current.diagnostics().pending).toBe(1)
      expect(tls.requests).toHaveLength(2)

      tracker.markRetired(oldId)
      expect(await tracker.closeRetired(oldId, demoRetirement())).toEqual({ retired: true })
      await old.closed
      expect(tracker.health().live.find(item => item.generation === oldId)).toMatchObject({
        role: 'retired',
        diagnostics: { failed: 0, pending: 1 },
      })
      expect(tracker.health().live.find(item => item.generation === currentId)).toMatchObject({
        role: 'current',
        inspect: { accepting: true },
        diagnostics: { failed: 0, pending: 1 },
      })
      expect(tracker.reserveReplacement()).toEqual({ unavailable: 'transport_retention_full' })
      expect(tracker.health().transportLiveInstances).toBe(2)

      rejectOldDelivery(new Error('controlled old-generation diagnostic failure'))
      await expect.poll(() => old.diagnostics().pending).toBe(0)
      expect(old.diagnostics().failed).toBe(1)
      expect(tracker.health()).toMatchObject({
        transportLiveInstances: 1,
        transportTerminalSnapshots: 1,
      })
      expect(tracker.health().terminal[0]).toMatchObject({
        generation: oldId,
        diagnostics: { failed: 1, pending: 0 },
      })
      expect(current.diagnostics().pending).toBe(1)
      const thirdSlot = tracker.reserveReplacement()
      if (!('reservation' in thirdSlot)) throw new Error('drained old snapshot did not free slot')
      expect(tracker.health()).toMatchObject({
        transportSnapshotsEvicted: 1,
        transportReservedInstances: 1,
      })
      const third = service()
      thirdSlot.reservation.commit(third)
      await call(third, 3)
      expect(tls.requests).toHaveLength(3)
      expect(current.diagnostics().pending).toBe(1)
      const before = tracker.health()
      for (let index = 0; index < 8; index++) expect(tracker.health()).toEqual(before)
      currentDelivery.resolve()
      await expect.poll(() => current.diagnostics().pending).toBe(0)
      tracker.markRetired(currentId)
      expect(await tracker.closeRetired(currentId, demoRetirement())).toEqual({ retired: true })
      await current.closed
      expect(third.inspect().accepting).toBe(true)
    } finally {
      currentDelivery.resolve()
      await Promise.allSettled(services.map(owned => owned.close(demoRetirement())))
      await tls.close()
    }
  })
})
