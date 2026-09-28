import { dirname, join } from 'node:path'
import type { Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { LOGINS_SERVICE, type LoginsService } from '@omne-harness-lite/account-identity'
import { MODEL_CATALOG_SERVICE } from '@omne-harness-lite/model-profile-directory/plugin'
import type { ModelCatalog } from '@omne-harness-lite/model-profile-directory'
import { decodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import {
  createDeepSeekV41FlashInputMeter,
  createOfficialProfileContent,
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
  type ModelTransportService,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment, demoRetirement } from './model-request-support.ts'
import { actor, ref } from './support.ts'

const PRO = 'deepseek/deepseek-v4-pro-0813'
const FLASH = deepseekV41FlashDefinition.modelId

function user(id: string) {
  const result = judgeMessage({
    type: 'user',
    id: `hotupdate-user-${id}`,
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: `hotupdate-text-${id}`,
        kind: 'text',
        text: id,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in result) || result.ok.type !== 'user') throw new Error('invalid user fixture')
  return result.ok
}

function serviceFace(value: unknown): value is ModelTransportService {
  return (
    value !== null &&
    typeof value === 'object' &&
    'acquire' in value &&
    typeof value.acquire === 'function' &&
    'inspect' in value &&
    typeof value.inspect === 'function'
  )
}
function catalogFace(value: unknown): value is Pick<ModelCatalog, 'registerProfile'> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'registerProfile' in value &&
    typeof value.registerProfile === 'function'
  )
}
function loginsFace(value: unknown): value is Pick<LoginsService, 'revoke'> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'revoke' in value &&
    typeof value.revoke === 'function'
  )
}

describe('demo runtime with Cordis transport contributions', () => {
  it('preserves the provider invalid configuration result through runtime before any model anchor or HTTP', async () => {
    const config = await callDeployment('service-invalid-adaptation')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    let catalog: Pick<ModelCatalog, 'registerProfile'> | undefined
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
      hooks: {
        async fiberCreated(name, fiber) {
          if (name !== 'directory') return
          await fiber
          const value: unknown = fiber.ctx.get(MODEL_CATALOG_SERVICE)
          if (!catalogFace(value)) throw new Error('real catalog absent')
          catalog = value
        },
      },
    })
    const host = createDemoCallHost()
    try {
      await app.ready
      if (!catalog) throw new Error('real catalog absent')
      const who = await actor(app)
      const complete = createOfficialProfileContent(deepseekV4Pro0813Definition, {
        providers: ['deepinfra/fp8'],
        allowFallback: false,
        configuration: deepseekV4Pro0813Configuration,
      })
      if ('rejected' in complete) throw new Error('profile fixture invalid')
      const custom = await catalog.registerProfile(
        who.tenant,
        { layer: 'tenant', tenant: who.tenant },
        {
          ...complete.ok,
          origin: 'custom',
          adaptation: {
            ...complete.ok.adaptation,
            configuration: {
              revision: 'uninterpretable-cache-mode',
              values: { cache: { mode: 'explicit', ttl: 'PT1M', breakpoints: [] } },
            },
          },
        },
      )
      if ('failure' in custom) throw new Error(`custom profile rejected: ${custom.failure}`)
      const prepared = await app.prepareSession(who, 'invalid-adaptation-session')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
      const bound = await app.bindModelRuntime(who, prepared.session)
      if (!('service' in bound)) throw new Error('runtime binding failed')
      expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({ attached: true })
      expect(await app.selectModel(who, prepared.session, PRO)).toEqual({ selected: PRO })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('invalid-adaptation-key'),
          body: Buffer.from('controlled-invalid-adaptation-key'),
        })),
      ).toEqual({ stored: true })
      const result = await app.startServiceCall(who, prepared.session, {
        user: user('invalid-cache'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      expect(result).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(tls.requests).toHaveLength(0)
      const history = await app.readSessionLog(who, prepared.session)
      if (!('entries' in history)) throw new Error('actual log unavailable')
      const keys = history.entries.flatMap(entry => entry.readKeys).map(decodeModelLogKey)
      expect(keys.some(key => 'ok' in key && key.ok.kind === 'opened')).toBe(false)
      expect(keys.some(key => 'ok' in key && key.ok.kind === 'response')).toBe(false)
      expect(keys.some(key => 'ok' in key && key.ok.kind === 'ended')).toBe(false)
    } finally {
      await host.stop()
      await app.close()
      await tls.close()
    }
  })

  it('uses the current exact contribution while an old service call and HTTPS reader drain', async () => {
    const base = await callDeployment('service-real-contributions')
    const flash = createOfficialProfileContent(deepseekV41FlashDefinition, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration: deepseekV41FlashConfiguration,
    })
    if ('rejected' in flash) throw new Error('Flash profile fixture invalid')
    let preparedSources = 0
    const prepareSource = base.modelRequest.evaluationInputs.prepare
    const config = {
      ...base,
      officialManifest: { ordinal: 1, entries: [...base.officialManifest.entries, flash.ok] },
      modelRequest: {
        ...base.modelRequest,
        evaluationInputs: {
          ...base.modelRequest.evaluationInputs,
          async prepare(...args: Parameters<typeof prepareSource>) {
            const source = await prepareSource(...args)
            return {
              ...source,
              publication: {
                ...source.publication,
                expectedRevision: preparedSources++ === 0 ? null : '1',
              },
            }
          },
        },
        transport: {
          ...base.modelRequest.transport,
          policy: { ...base.modelRequest.transport.policy, maxConnections: 2 },
        },
      },
    }
    const tls = await createLocalTls(
      join(dirname(config.databaseFile), 'tls'),
      async () => {},
      0,
      body => {
        if (
          body === null ||
          typeof body !== 'object' ||
          !('model' in body) ||
          typeof body.model !== 'string'
        )
          throw new Error('model absent from controlled request')
        return body.model
      },
    )
    let providerFiber: Fiber | undefined
    let oldFiber: Fiber | undefined
    let service: ModelTransportService | undefined
    let logins: Pick<LoginsService, 'revoke'> | undefined
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
      hooks: {
        async fiberCreated(name, fiber) {
          if (name === 'accountIdentity') {
            await fiber
            const value: unknown = fiber.ctx.get(LOGINS_SERVICE)
            if (!loginsFace(value)) throw new Error('real logins service absent')
            logins = value
          }
          if (name !== 'modelTransport') return
          providerFiber = fiber
          await fiber
          const value: unknown = fiber.ctx.get(MODEL_TRANSPORT_SERVICE)
          if (!serviceFace(value)) throw new Error('Cordis transport service absent')
          service = value
        },
        modelContributionCreated(definition, fiber) {
          if (definition.modelId === PRO) oldFiber = fiber
        },
      },
    })
    const oldHost = createDemoCallHost()
    const newHost = createDemoCallHost()
    let replacement: Fiber | undefined
    let oldCall: ReturnType<typeof app.startServiceCall> | undefined
    let oldRetirement: Promise<void> | undefined
    try {
      await app.ready
      if (!service || !providerFiber || !oldFiber || !logins)
        throw new Error('real contribution or identity provider absent')
      const registry = service
      expect(registry.inspect()).toMatchObject({ registrations: 1, references: 0 })
      const who = await actor(app)
      const other = await actor(app, 'hotupdate-other')
      for (const [session, host] of [
        ['hotupdate-old', oldHost],
        ['hotupdate-new', newHost],
      ] as const) {
        const prepared = await app.prepareSession(who, session)
        if (!('session' in prepared)) throw new Error('session preparation failed')
        expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
        const bound = await app.bindModelRuntime(who, session)
        if (!('service' in bound)) throw new Error('runtime binding failed')
        expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      }
      expect(await app.selectModel(who, 'hotupdate-old', PRO)).toEqual({ selected: PRO })
      expect(await app.selectModel(who, 'hotupdate-new', FLASH)).toEqual({ selected: FLASH })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('hotupdate-service-key'),
          body: Buffer.from('controlled-hotupdate-service-key'),
        })),
      ).toEqual({ stored: true })
      tls.setMode('hold')
      oldCall = app.startServiceCall(who, 'hotupdate-old', {
        user: user('old'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: oldHost.host,
      })
      await tls.contentSent.promise
      expect(registry.inspect()).toMatchObject({ registrations: 1, references: 1 })

      replacement = providerFiber.ctx.plugin(
        createModelPlugin(
          deepseekV41FlashDefinition,
          createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition),
          demoRetirement(),
        ),
        {},
      )
      await replacement
      expect(registry.inspect()).toMatchObject({ registrations: 2, references: 1 })
      let oldRetired = false
      oldRetirement = oldFiber.dispose().then(() => {
        oldRetired = true
      })
      await expect.poll(() => registry.inspect().retiring).toBe(1)
      expect(oldRetired).toBe(false)

      tls.setMode('complete')
      const second = await app.startServiceCall(who, 'hotupdate-new', {
        user: user('new'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: newHost.host,
      })
      expect(tls.requests.map(request => (request.body as { model: string }).model)).toEqual([
        PRO,
        FLASH,
      ])
      expect(second).toHaveProperty('result.replyPending')
      if ('result' in second && 'replyPending' in second.result)
        expect(
          await app.persistModelReply(who, 'hotupdate-new', second.result.replyPending),
        ).toHaveProperty('settled')
      expect(oldRetired).toBe(false)
      tls.finishHeld()
      const first = await oldCall
      if ('result' in first && 'replyPending' in first.result)
        await app.persistModelReply(who, 'hotupdate-old', first.result.replyPending)
      await oldHost.stop()
      await oldRetirement
      expect(registry.inspect()).toMatchObject({ registrations: 1, retiring: 0, executions: 0 })
      expect(await app.selectModel(who, 'hotupdate-new', PRO)).toHaveProperty('selected')
      const refused = await app.startServiceCall(who, 'hotupdate-new', {
        user: user('retired'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: newHost.host,
      })
      expect(refused).toHaveProperty('unavailable', true)
      expect(tls.requests).toHaveLength(2)
      expect(
        await app.startServiceCall(other, 'hotupdate-new', {
          user: user('cross-tenant'),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: newHost.host,
        }),
      ).toEqual({ failure: 'identityMismatch' })
      expect(await logins.revoke(who.loginState, who.loginState)).toBe('ok')
      expect(
        await app.startServiceCall(who, 'hotupdate-new', {
          user: user('revoked'),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: newHost.host,
        }),
      ).toHaveProperty('step', 'verify')
      expect(tls.requests).toHaveLength(2)
    } finally {
      tls.finishHeld()
      if (oldCall) await Promise.allSettled([oldCall])
      await Promise.allSettled([oldHost.stop(), newHost.stop()])
      if (oldRetirement) await oldRetirement
      await replacement?.dispose()
      expect(await app.close()).toHaveProperty('complete', true)
      await service?.closed
      expect(tls.closedSockets()).toBeGreaterThanOrEqual(1)
      await tls.close()
    }
  })
})
