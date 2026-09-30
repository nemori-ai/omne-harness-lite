import { deriveCreationKey } from '../src/call-references.ts'
import sharp from 'sharp'
import type { Fiber } from '@deepseek-ai/cordis'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import {
  createDeepSeekV41FlashInputMeter,
  deepseekV41FlashDefinition,
  type ModelTransportService,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createDemoSupervisor,
  createDemoConfig,
  createDemoDefaultRetryConfiguration,
  openDemoDiagnosticAssembly,
  createDemoDiagnosticConfig,
  readPrivateFile,
} from '../src/index.ts'
import { deferred } from './local-tls.ts'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import {
  createAcceptanceApplication,
  type AcceptanceConfig,
  type ModelRequestDeployment,
} from '../src/index.ts'
import {
  createSharpImageCodec,
  modelImageBalancedV1,
  createOfficialProfileContent,
  createDeepSeekV4ProInputMeter,
  deepseekV4Pro0813Definition,
  deepseekV4Pro0813Configuration,
} from '@omne-harness-lite/pi-ai-transport'
import { openRouterCredentialRedactionConfig } from '@omne-harness-lite/model-request-runtime'
import { judgeMessage } from '@omne-harness-lite/messages'
import { actor, ref, duration, activateModelFixture } from './support.ts'
import { ROOT, publication, demoRetirement } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'

const model = deepseekV4Pro0813Definition
const evidence = resolve(import.meta.dirname, '../../../tmp/d4-acceptance')
function official() {
  const result = createOfficialProfileContent(model, {
    providers: ['deepinfra/fp8'],
    allowFallback: false,
    configuration: deepseekV4Pro0813Configuration,
  })
  if ('rejected' in result) throw Error('official profile invalid')
  return result.ok
}
function realService<T>(value: unknown, functions: readonly string[]): T {
  if (
    !value ||
    typeof value !== 'object' ||
    functions.some(name => !(name in value) || typeof Reflect.get(value, name) !== 'function')
  )
    throw Error('actual service interface absent')
  return value as T
}
async function deployment(label: string): Promise<AcceptanceConfig> {
  await mkdir(evidence, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(join(evidence, `${label}-`)),
    activation = generateHandoffKeyPair(),
    purge = generateHandoffKeyPair()
  const keys = {
    activationSigning: join(dir, 'activation.pem'),
    activationVerification: join(dir, 'activation-public.pem'),
    purgeSigning: join(dir, 'purge.pem'),
    purgeVerification: join(dir, 'purge-public.pem'),
    modelReplica: join(dir, 'model-key'),
  }
  for (const [file, bytes] of [
    [keys.activationSigning, activation.privateKeyPem],
    [keys.activationVerification, activation.publicKeyPem],
    [keys.purgeSigning, purge.privateKeyPem],
    [keys.purgeVerification, purge.publicKeyPem],
    [keys.modelReplica, randomBytes(32)],
  ] as const)
    await writeFile(file, bytes, { mode: 0o600, flag: 'wx' })
  return {
    runId: label,
    databaseFile: join(dir, 'db.sqlite'),
    keys,
    credentials: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
    identity: { credentialPolicy: { minLength: 8 }, unactivatedRetention: duration(60000) },
    governance: {
      invitationTtlDefault: duration(60000),
      affiliationRequestTtlDefault: duration(60000),
      teamCreationKeyRetention: duration(60000),
    },
    officialManifest: { ordinal: 1, entries: [official()] },
    wait: {
      clockTimeoutMs: 15000,
      pollMs: 10,
      monotonicNow: () => Number(process.hrtime.bigint()) / 1000000,
      sleep: async ms => {
        await new Promise<void>(r => setTimeout(r, ms))
      },
    },
  }
}
async function callConfig(
  label: string,
): Promise<AcceptanceConfig & { modelRequest: ModelRequestDeployment }> {
  const base = await deployment(label),
    dir = resolve(base.databaseFile, '../logs')
  await mkdir(dir, { mode: 0o700 })
  const credentialRedaction = openRouterCredentialRedactionConfig
  let publicationOrdinal = 0
  return {
    ...base,
    sessionLog: {
      dir,
      processOwnership: {
        current: label,
        async observeExit() {
          return 'unknown'
        },
      },
      policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
    },
    modelRequest: {
      maxScopes: 64,
      acknowledgementCleanup: { next: () => ({ stop: true }) },
      callReferences: {
        maxScopes: 64,
        content: { maxConcurrentWrites: 4, maxContentBytes: 16 * 1024 * 1024 },
      },
      tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
      defaultRetry: createDemoDefaultRetryConfiguration(),
      registryPolicy: { maxRetries: 2, maxInFlight: 8 },
      evaluationInputs: {
        storeKey: label,
        deployedOfficial: [{ capability: ROOT, meta: false }],
        monotonicNow: () => process.hrtime.bigint(),
        async prepare(who) {
          const expectedRevision = publicationOrdinal === 0 ? null : String(publicationOrdinal)
          publicationOrdinal++
          return {
            publication: publication(who, expectedRevision),
            recipe: { rootDefinition: ROOT },
          }
        },
      },
      transport: {
        imagePreparation: { policy: modelImageBalancedV1, codec: createSharpImageCodec(sharp) },
        definitions: [model],
        inputMeters: [createDeepSeekV4ProInputMeter(model)],
        policy: {
          maxConnections: 2,
          idleConnectionTimeoutMs: 5000,
          connectTimeoutMs: 5000,
          maxErrorBodyBytes: 8192,
          maxSseEventBytes: 65536,
          credentialRedaction,
        },
        retirement: demoRetirement(),
      },
      invocation: {
        now: () => '2026-09-29T00:00:00Z',
        firstContentTimeoutMs: 15000,
        idleContentTimeoutMs: 120000,
        schedule(ms, callback) {
          const timer = setTimeout(callback, ms)
          return () => clearTimeout(timer)
        },
        statusCauseTable: { '503': 'upstream_unavailable' },
        credentialRedaction,
      },
      reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 5000 },
      settlement: {
        contention: {
          name: 'd4-explicit-contention',
          limits: { submissions: 2, elapsedMs: 5000, retainedBytes: 1048576, concurrent: 1 },
          decide() {
            return { proceed: { waitMs: 0 } }
          },
        },
        scheduler: {
          nowMonotonicMs: () => Number(process.hrtime.bigint() / 1000000n),
          wait(_ms, signal) {
            return {
              completion: Promise.resolve(signal.aborted ? 'cancelled' : 'elapsed'),
              stopped: Promise.resolve(),
              requestStop() {},
            }
          },
        },
      },
    },
  }
}

function user(label: string) {
  const result = judgeMessage({
    type: 'user',
    id: `d4-state-${label}`,
    createdAt: '2026-09-29T00:00:00Z',
    blocks: [
      {
        id: `d4-text-${label}`,
        kind: 'text',
        text: 'retain exact old binding',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in result) || result.ok.type !== 'user') throw Error('invalid user')
  return result.ok
}

describe('D4 independent runtime retained leases and historical reacquisition', () => {
  it('retains A while awaiting_decision after B loads and A retires; releases when the ready result is durable', async () => {
    const config = await callConfig('waiting-states')
    const tls = await createLocalTls(resolve(config.databaseFile, '../tls'))
    let provider: Fiber | undefined,
      old: Fiber | undefined,
      registry: ModelTransportService | undefined
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
      hooks: {
        async fiberCreated(name, fiber) {
          if (name !== 'modelTransport') return
          provider = fiber
          await fiber
          registry = realService(fiber.ctx.get(MODEL_TRANSPORT_SERVICE), ['inspect', 'acquire'])
        },
        modelContributionCreated(definition, fiber) {
          if (definition.modelId === model.modelId) old = fiber
        },
      },
    })
    const host = createDemoCallHost()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      if (!provider || !old || !registry) throw Error('actual Cordis contributions absent')
      const prepared = await app.prepareSession(who, 'd4-waiting-states')
      if (!('session' in prepared)) throw Error('session unavailable')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.selectModel(who, session, model.modelId)).toEqual({
        selected: model.modelId,
      })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('d4-waiting-key'),
          body: Buffer.from('controlled-d4-waiting-key'),
        })),
      ).toEqual({ stored: true })
      const bound = await app.bindModelRuntime(who, session)
      if (!('service' in bound)) throw Error('runtime unavailable')
      const service = bound.service
      const effective = await service.effectiveModel({ session })
      if (!('effectiveModel' in effective)) throw Error('effective unavailable')
      const creationKey = deriveCreationKey({ session, userMessage: 'd4-waiting' })
      const opened = await service.openCall({
        creationKey,
        session,
        target: model.modelId,
        basis: effective.effectiveModel,
        messages: [user('waiting')],
        tools: [],
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('callId' in opened)) throw Error(JSON.stringify(opened))
      const callId = opened.callId
      tls.setMode('http503')
      expect(await service.dispatch({ session, callId })).toMatchObject({
        settled: { outcome: 'failed' },
      })
      expect(await service.readAttempts({ session, callId })).toMatchObject({
        state: 'awaiting_decision',
      })
      expect(registry.inspect()).toMatchObject({ registrations: 1, references: 1, executions: 0 })
      const next = provider.ctx.plugin(
        createModelPlugin(
          deepseekV41FlashDefinition,
          createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition),
          demoRetirement(),
        ),
        {},
      )
      await next
      let retired = false
      const retirement = old.dispose().then(() => {
        retired = true
      })
      await expect.poll(() => registry!.inspect().retiring).toBe(1)
      expect(registry.inspect()).toMatchObject({ registrations: 2, references: 1, executions: 0 })
      expect(retired).toBe(false)
      tls.setMode('complete')
      const result = await service.dispatchAgain({
        session,
        callId,
        plan: { provider: 'deepinfra/fp8' },
      })
      expect(result).toHaveProperty('replyPending')
      // RT12 S-86: the confirmed ready is the complete terminal fact with disposition_pending.
      const attempts = await service.readAttempts({ session, callId })
      expect(attempts).toMatchObject({ state: 'complete' })
      expect(
        'dispatches' in attempts ? attempts.dispatches?.at(-1)?.result?.disposition : undefined,
      ).toBe('disposition_pending')
      expect(tls.requests.map(request => (request.body as { model: string }).model)).toEqual([
        model.modelId,
        model.modelId,
      ])
      // The durable ready result is published, so the runtime no longer holds A's exact
      // transport lease while the disposition is pending (RT11 reference lifecycle mapping).
      await retirement
      expect(retired).toBe(true)
      expect(registry.inspect()).toMatchObject({
        registrations: 1,
        retiring: 0,
        references: 0,
        executions: 0,
      })
      expect(
        await service.settleReply({
          session,
          callId,
          disposition: { consumed: { by: 'side_query' } },
        }),
      ).toEqual({ callId, state: 'complete' })
      expect(registry.inspect()).toMatchObject({
        registrations: 1,
        retiring: 0,
        references: 0,
        executions: 0,
      })
      expect(
        await service.settleReply({
          session,
          callId,
          disposition: { consumed: { by: 'side_query' } },
        }),
      ).toEqual({ callId, state: 'complete' })
      expect(registry.inspect()).toMatchObject({ registrations: 1, references: 0 })
    } finally {
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })

  it('uses actual SIGKILL history: missing A never falls back to B; restored A resumes and remains leased while resumable', async () => {
    await mkdir(evidence, { recursive: true, mode: 0o700 })
    const root = await mkdtemp(join(evidence, 'historical-'))
    const gate = deferred(),
      entered = deferred()
    let firstRequest = true
    const tls = await createLocalTls(join(root, 'tls'), async () => {
      if (firstRequest) {
        firstRequest = false
        entered.resolve()
        await gate.promise
      }
    })
    const dataDirectory = join(root, 'data'),
      keyFile = join(root, 'key')
    await writeFile(keyFile, 'controlled-d4-history-key', { mode: 0o600 })
    const supervisor = createDemoSupervisor({
      dataDirectory,
      keyFile,
      multiplier: '1.1',
      reserveTokens: '256',
      maxOutputTokens: 128,
      retirementWaitMilliseconds: 2000,
      maxPacketBytes: 1048576,
      maxCommands: 1,
      dedicatedRoot: true,
      developmentTransport: {
        baseUrl: tls.developmentTransport.baseUrl,
        ca: tls.developmentTransport.tls.ca,
      },
    })
    let app: ReturnType<typeof createAcceptanceApplication> | undefined
    let diagnostics: Awaited<ReturnType<typeof openDemoDiagnosticAssembly>> | undefined
    const host = createDemoCallHost()
    try {
      const first = await supervisor.open()
      const sending = first.send('crash before headers and opened anchor', async () => {})
      await entered.promise
      expect(tls.requests).toHaveLength(1)
      expect(supervisor.signalWorker('SIGKILL')).toBe(true)
      const exit = await supervisor.waitWorkerExit()
      expect(exit).toEqual({ exited: true, closed: true })
      expect((await sending).kind).toBe('unconfirmed')
      await tls.socketClosed.promise
      gate.resolve()
      expect(await supervisor.close()).toEqual({ complete: true })
      // This scope owns a dedicated data root and the exact sole predecessor; absence is backed
      // by the real supervisor's exit + close observations, never by a constant fake owner port.
      const config = createDemoConfig(
        dataDirectory,
        'd4-recovered-process',
        () => {
          const at = app?.currentTime()
          if (!at || at === 'unavailable') throw Error('actual clock absent')
          return at
        },
        { multiplier: 1.1, reserveTokens: 256 },
        demoRetirement(),
        {
          current: 'd4-recovered-process',
          async observeExit(identity) {
            return identity === first.workerIdentity && exit.exited && exit.closed
              ? 'exited'
              : 'unknown'
          },
        },
      )
      if (!config.modelRequest) throw Error('model config missing')
      const originalMeter = config.modelRequest.transport.inputMeters.find(
        meter => meter.modelId === model.modelId,
      )
      if (!originalMeter) throw Error('A meter missing')
      const withoutA = {
        ...config,
        modelRequest: {
          ...config.modelRequest,
          transport: {
            ...config.modelRequest.transport,
            definitions: config.modelRequest.transport.definitions.filter(
              definition => definition.modelId !== model.modelId,
            ),
            inputMeters: config.modelRequest.transport.inputMeters.filter(
              meter => meter.modelId !== model.modelId,
            ),
          },
        },
      }
      let provider: Fiber | undefined, registry: ModelTransportService | undefined
      app = createAcceptanceApplication(withoutA, {
        stage: 'modelRequest',
        coldRecovery: { covered: exit.exited && exit.closed },
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
        hooks: {
          async fiberCreated(name, fiber) {
            if (name !== 'modelTransport') return
            provider = fiber
            await fiber
            registry = realService(fiber.ctx.get(MODEL_TRANSPORT_SERVICE), ['inspect', 'acquire'])
          },
        },
      })
      await app.ready
      const local = JSON.parse(
        (await readPrivateFile(join(dataDirectory, 'demo-state.json'))).toString(),
      ) as { identifier: string; password: string; session: string }
      const who = await app.authenticate(local.identifier, local.password)
      if (!('account' in who)) throw Error('real reauthentication failed')
      diagnostics = await openDemoDiagnosticAssembly(
        createDemoDiagnosticConfig(dataDirectory, who.tenant, demoRetirement()),
      )
      expect(
        await app.activateModelRequest(who, diagnostics, diagnostics.transports),
      ).toHaveProperty('activated')
      const prepared = await app.prepareSession(who, local.session)
      if (!('session' in prepared)) throw Error('session preparation unavailable')
      const session = prepared.session
      if (!registry || !provider) throw Error('actual B registry missing')
      expect(registry.inspect()).toMatchObject({ registrations: 1, references: 0 })
      const recovery = await app.reconcileModelRuntime(who, session)
      if (!('calls' in recovery) || recovery.calls.length !== 1)
        throw Error(JSON.stringify(recovery))
      const recovered = recovery.calls[0]!
      expect(recovered.state).toBe('resumable')
      expect(registry.inspect()).toMatchObject({ registrations: 1, references: 0 })
      expect(tls.requests).toHaveLength(1)
      const bound = await app.bindModelRuntime(who, session)
      if (!('service' in bound)) throw Error('runtime unavailable')
      const service = bound.service,
        callId = recovered.callId
      const effective = await service.effectiveModel({ session })
      if (!('effectiveModel' in effective)) throw Error('historical selection unavailable')
      expect(await app.selectModel(who, session, deepseekV41FlashDefinition.modelId)).toEqual({
        selected: deepseekV41FlashDefinition.modelId,
      })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      const resume = {
        creationKey: deriveCreationKey({ session, userMessage: 'd4-waiting' }),
        session,
        callId,
        target: model.modelId,
        basis: effective.effectiveModel,
        messages: [user('resume')],
        tools: [],
        parameters: { reasoningEffort: 'low' as const, maxOutputTokens: 128 },
        host: host.host,
      }
      const before = await app.readSessionLog(who, session)
      expect(await service.openCall(resume)).toEqual({ unavailable: true })
      expect(await app.readSessionLog(who, session)).toEqual(before)
      expect(registry.inspect()).toMatchObject({ registrations: 1, references: 0 })
      expect(tls.requests).toHaveLength(1)
      const restored = provider.ctx.plugin(
        createModelPlugin(model, originalMeter, demoRetirement()),
        {},
      )
      await restored
      expect(await service.openCall(resume)).toEqual({
        ref: { session, callId },
        callId,
        state: 'resumable',
      })
      expect(await service.readAttempts({ session, callId })).toMatchObject({ state: 'resumable' })
      expect(registry.inspect()).toMatchObject({ registrations: 2, references: 1, executions: 0 })
      let retired = false
      const retirement = restored.dispose().then(() => {
        retired = true
      })
      await expect.poll(() => registry!.inspect().retiring).toBe(1)
      expect(retired).toBe(false)
      expect(await service.dispatch({ session, callId })).toHaveProperty('replyPending')
      expect(tls.requests.map(request => (request.body as { model: string }).model)).toEqual([
        model.modelId,
        model.modelId,
      ])
      // The second dispatch's ready result is durable, so its exact lease is released before the
      // disposition; the restored version's retirement therefore completes.
      await retirement
      expect(retired).toBe(true)
      expect(
        await service.settleReply({
          session,
          callId,
          disposition: { consumed: { by: 'side_query' } },
        }),
      ).toEqual({ callId, state: 'complete' })
      expect(registry.inspect()).toMatchObject({
        registrations: 1,
        references: 0,
        executions: 0,
        retiring: 0,
      })
      const after = await service.readAttempts({ session, callId })
      expect(after).toMatchObject({ state: 'complete' })
      if (!('dispatches' in after)) throw Error('history missing')
      expect(after.dispatches).toHaveLength(2)
      expect(after.dispatches[0]!.record.adaptation).toMatchObject({
        definition: { modelId: model.modelId, revision: model.revision },
        implementation: model.implementation,
      })
      expect(after.dispatches[0]!.record.adaptation).toEqual(after.dispatches[1]!.record.adaptation)
      expect(after.dispatches[0]!.record.profileSnapshot).toEqual(
        after.dispatches[1]!.record.profileSnapshot,
      )
    } finally {
      gate.resolve()
      if (supervisor.inspect().state === 'alive') {
        supervisor.signalWorker('SIGKILL')
        await supervisor.waitWorkerExit()
      }
      await supervisor.close()
      await host.stop()
      if (app && diagnostics) await diagnostics.closeAfterBusiness(() => app!.close())
      else if (app) await app.close()
      await tls.close()
    }
  }, 60000)
})
