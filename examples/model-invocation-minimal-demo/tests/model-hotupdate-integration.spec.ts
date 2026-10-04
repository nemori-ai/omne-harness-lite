import sharp from 'sharp'
import { join } from 'node:path'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { LOGINS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import { type LoginsService } from '@omne-harness-lite/account-identity'
import { isOk, parseOpaqueIdentifier, type TenantId } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { ModelProfileContent } from '@omne-harness-lite/model-profile'
import type {
  ModelCatalog,
  CredentialLookup,
  ProfileRow,
} from '@omne-harness-lite/model-profile-directory'
import {
  CREDENTIAL_LOOKUP_SERVICE,
  MODEL_CATALOG_SERVICE,
} from '@omne-harness-lite/model-profile-directory/plugin'
import {
  openRouterCredentialRedactionConfig,
  type PlanInput,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  createDeepSeekV4ProInputMeter,
  createDeepSeekV41FlashInputMeter,
  createModelTransportService,
  createSharpImageCodec,
  modelImageBalancedV1,
  createOfficialProfileContent,
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
  deepseekV41FlashDefinition,
  type ModelDefinition,
  type ModelTransportService,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createLocalTls } from './local-tls.ts'
import { actor, ref } from './support.ts'
import { hotupdateDeployment } from './fixtures/hotupdate/deployment.ts'

const MODEL = deepseekV4Pro0813Definition.modelId
const AT = '2026-09-28T00:00:00Z'

type CatalogOperations = Pick<ModelCatalog, 'registerProfile' | 'updateProfile' | 'readProfile'>

function catalogFace(value: unknown): value is CatalogOperations {
  return (
    value !== null &&
    typeof value === 'object' &&
    'registerProfile' in value &&
    typeof value.registerProfile === 'function' &&
    'updateProfile' in value &&
    typeof value.updateProfile === 'function' &&
    'readProfile' in value &&
    typeof value.readProfile === 'function'
  )
}

function lookupFace(value: unknown): value is CredentialLookup {
  return (
    value !== null &&
    typeof value === 'object' &&
    'value' in value &&
    typeof value.value === 'function'
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

function transportFace(value: unknown): value is ModelTransportService {
  return (
    value !== null &&
    typeof value === 'object' &&
    'registerAdaptation' in value &&
    typeof value.registerAdaptation === 'function' &&
    'acquire' in value &&
    typeof value.acquire === 'function' &&
    'retire' in value &&
    typeof value.retire === 'function' &&
    'close' in value &&
    typeof value.close === 'function' &&
    'inspect' in value &&
    typeof value.inspect === 'function' &&
    'closed' in value &&
    value.closed instanceof Promise
  )
}

function retirement(): RetirementPolicy {
  return {
    waitMilliseconds: 30,
    force: false,
    schedule(milliseconds, callback) {
      const timer = setTimeout(callback, milliseconds)
      return () => clearTimeout(timer)
    },
  }
}

function profile(definition: ModelDefinition, revision: string): ModelProfileContent {
  const content = createOfficialProfileContent(definition, {
    providers: ['deepinfra/fp8'],
    allowFallback: false,
    configuration: { ...deepseekV4Pro0813Configuration, revision },
  })
  if ('rejected' in content) throw new Error(`profile invalid: ${content.rejected}`)
  return { ...content.ok, origin: 'custom' }
}

function row(result: Awaited<ReturnType<ModelCatalog['readProfile']>>): ProfileRow {
  if ('failure' in result) throw new Error(`profile unavailable: ${result.failure}`)
  return result
}

function request(current: ProfileRow, suffix: string): PlanInput {
  const callId = parseOpaqueIdentifier(`hotupdate-call-${suffix}`, 'ModelCallId')
  const message = judgeMessage({
    type: 'user',
    id: `hotupdate-message-${suffix}`,
    createdAt: AT,
    blocks: [
      {
        id: `hotupdate-text-${suffix}`,
        kind: 'text',
        text: suffix,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!isOk(callId) || !('ok' in message) || message.ok.type !== 'user')
    throw new Error('invalid request fixture')
  return {
    calibration: { kind: 'none', reason: 'no_observation' },
    outputHistory: [],
    tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
    target: { kind: 'model_call', callId: callId.ok, dispatch: 1 },
    routeName: current.profile.routeName,
    provider: 'deepinfra/fp8',
    parameters: { maxOutputTokens: 1024 },
    tools: [],
    messages: [message.ok],
    snapshot: {
      adaptation: current.profile.adaptation,
      providers: current.profile.providers,
      allowFallback: current.profile.allowFallback,
      inputModalities: current.profile.inputModalities,
      outputModalities: current.profile.outputModalities,
      maxInputTokens: current.profile.maxInputTokens,
      maxOutputTokens: current.profile.maxOutputTokens,
      inputConstraints: current.profile.inputConstraints,
      upstreamInputLimits: current.profile.upstreamInputLimits,
      ...(current.profile.parameters === undefined
        ? {}
        : { parameters: current.profile.parameters }),
      updatedAt: current.profile.updatedAt,
    },
  }
}

async function credential(lookup: CredentialLookup, tenant: TenantId): Promise<string> {
  const result = await lookup.value(tenant, 'custom')
  if ('failure' in result) throw new Error(`credential unavailable: ${result.failure}`)
  return Buffer.from(result.value).toString('utf8')
}

async function drain<T>(reader: AsyncGenerator<unknown, T>): Promise<T> {
  while (true) {
    const next = await reader.next()
    if (next.done) return next.value
  }
}

describe('D4 real-provider hot update slice', () => {
  it('keeps an old Cordis contribution and HTTPS reader alive while a new route is registered and the local credential rotates', async () => {
    const config = await hotupdateDeployment()
    const tls = await createLocalTls(join(config.directory, 'tls'))
    const context = new Context()
    let catalog: CatalogOperations | undefined
    let lookup: CredentialLookup | undefined
    let logins: Pick<LoginsService, 'revoke'> | undefined
    const app = createAcceptanceApplication(config, {
      stage: 'requestPreparation',
      diagnostics: { record() {} },
      hooks: {
        async fiberCreated(name, fiber) {
          if (name === 'accountIdentity' || name === 'directory' || name === 'lookup') {
            await fiber
            const value: unknown = fiber.ctx.get(
              name === 'accountIdentity'
                ? LOGINS_SERVICE
                : name === 'directory'
                  ? MODEL_CATALOG_SERVICE
                  : CREDENTIAL_LOOKUP_SERVICE,
            )
            if (name === 'accountIdentity') {
              if (!loginsFace(value)) throw new Error('actual logins absent')
              logins = value
            } else if (name === 'directory') {
              if (!catalogFace(value)) throw new Error('actual catalog absent')
              catalog = value
            } else {
              if (!lookupFace(value)) throw new Error('actual lookup absent')
              lookup = value
            }
          }
        },
      },
    })
    let oldLease: ReturnType<ModelTransportService['acquire']> | undefined
    let newLease: ReturnType<ModelTransportService['acquire']> | undefined
    let oldDisposal: Promise<void> | undefined
    let oldRead: Promise<unknown> | undefined
    let v1Credential: Buffer | undefined
    let v2Credential: Buffer | undefined
    try {
      await app.ready
      if (!catalog || !lookup || !logins)
        throw new Error('actual identity/directory providers absent')
      const who = await actor(app)
      const other = await actor(app, 'hotupdate-other')
      const v1 = deepseekV4Pro0813Definition
      const v2 = deepseekV41FlashDefinition
      const first = await catalog.registerProfile(
        who.tenant,
        { layer: 'tenant', tenant: who.tenant },
        profile(v1, 'configuration-v1'),
      )
      if ('failure' in first) throw new Error(`custom profile rejected: ${first.failure}`)
      expect(await catalog.readProfile(other.tenant, first.ref)).toEqual({
        failure: 'notAuthorized',
      })
      expect(await lookup.value(other.tenant, 'custom')).toEqual({
        failure: 'credentialUnavailable',
      })

      const provider: Plugin.Object = {
        name: 'hotupdate-actual-transport-provider',
        apply(ctx) {
          const service = createModelTransportService({
            imagePreparation: { policy: modelImageBalancedV1, codec: createSharpImageCodec(sharp) },
            baseUrl: tls.developmentTransport.baseUrl,
            tls: tls.developmentTransport.tls,
            policy: {
              maxConnections: 2,
              idleConnectionTimeoutMs: 5000,
              connectTimeoutMs: 5000,
              maxErrorBodyBytes: 8192,
              maxSseEventBytes: 65536,
              credentialRedaction: openRouterCredentialRedactionConfig,
            },
          })
          ctx.provide(MODEL_TRANSPORT_SERVICE, service)
          ctx.effect(() => async () => {
            await service.close(retirement())
            await service.closed
          })
        },
      }
      await context.plugin(provider)
      const actual: unknown = context.get(MODEL_TRANSPORT_SERVICE)
      if (!transportFace(actual)) throw new Error('actual transport service absent')
      const service = actual
      const contribution1 = context.plugin(
        createModelPlugin(v1, createDeepSeekV4ProInputMeter(v1), retirement()),
        {},
      )
      await contribution1
      v1Credential = Buffer.from('controlled-rotation-v1-secret')
      const firstBody = v1Credential
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('hotupdate-key-v1'),
          body: firstBody,
        })),
      ).toEqual({ stored: true })
      const old = row(await catalog.readProfile(who.tenant, first.ref))
      oldLease = service.acquire(old.profile.adaptation, MODEL)
      if ('rejected' in oldLease) throw new Error(`old lease rejected: ${oldLease.rejected}`)
      const oldRequest = request(old, 'v1')
      const oldPlan = await oldLease.lease.transport.plan(oldRequest, {
        signal: new AbortController().signal,
      })
      if ('rejected' in oldPlan) throw new Error(`old plan rejected: ${oldPlan.rejected}`)
      tls.setMode('hold')
      const oldSend = await oldLease.lease.transport.send(
        oldPlan.planned,
        await credential(lookup, who.tenant),
        new AbortController().signal,
      )
      if (!('response' in oldSend)) throw new Error('old HTTPS send rejected')
      oldRead = drain(
        oldLease.lease.transport.read(
          oldSend.response,
          oldPlan.planned,
          new AbortController().signal,
        ),
      )
      await tls.contentSent.promise

      const changed = await catalog.updateProfile(who.tenant, first.ref, {
        replace: { adaptation: profile(v1, 'configuration-v1b').adaptation },
      })
      if ('failure' in changed) throw new Error(`profile update rejected: ${changed.failure}`)
      expect(changed.profile.adaptation.definition.revision).toBe(v1.revision)
      expect(changed.profile.adaptation.configuration.revision).toBe('configuration-v1b')
      const second = await catalog.registerProfile(
        who.tenant,
        { layer: 'tenant', tenant: who.tenant },
        profile(v2, 'configuration-v2'),
      )
      if ('failure' in second) throw new Error(`second profile rejected: ${second.failure}`)
      const contribution2 = context.plugin(
        createModelPlugin(v2, createDeepSeekV41FlashInputMeter(v2), retirement()),
        {},
      )
      await contribution2
      v2Credential = Buffer.from('controlled-rotation-v2-secret')
      const secondBody = v2Credential
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('hotupdate-key-v2'),
          body: secondBody,
        })),
      ).toEqual({ stored: true })
      expect(await credential(lookup, who.tenant)).toBe(v2Credential.toString())
      expect(oldLease.lease.binding).toEqual(old.profile.adaptation)
      expect(
        await oldLease.lease.transport.plan(request(changed, 'wrong-old'), {
          signal: new AbortController().signal,
        }),
      ).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
      newLease = service.acquire(second.profile.adaptation, v2.modelId)
      if ('rejected' in newLease) throw new Error(`new lease rejected: ${newLease.rejected}`)
      const newPlan = await newLease.lease.transport.plan(request(second, 'v2'), {
        signal: new AbortController().signal,
      })
      if ('rejected' in newPlan) throw new Error(`new plan rejected: ${newPlan.rejected}`)
      tls.setMode('complete')
      const newSend = await newLease.lease.transport.send(
        newPlan.planned,
        await credential(lookup, who.tenant),
        new AbortController().signal,
      )
      if (!('response' in newSend)) throw new Error('new HTTPS send rejected')
      const newEnd = await drain(
        newLease.lease.transport.read(
          newSend.response,
          newPlan.planned,
          new AbortController().signal,
        ),
      )
      expect(newEnd).toMatchObject({ ended: 'end' })
      await newSend.response.stopped
      newLease.lease.release()
      expect(tls.requests.map(item => item.authorization)).toEqual([
        `Bearer ${v1Credential.toString()}`,
        `Bearer ${v2Credential.toString()}`,
      ])
      expect(tls.requests.map(item => item.body)).toMatchObject([
        { model: v1.modelId },
        { model: v2.modelId },
      ])
      let disposed = false
      oldDisposal = contribution1.dispose().then(() => {
        disposed = true
      })
      await expect.poll(() => service.inspect().retiring).toBe(1)
      expect(service.acquire(old.profile.adaptation, MODEL)).toEqual({ rejected: 'unavailable' })
      oldLease.lease.release()
      expect(disposed).toBe(false)
      expect(service.inspect().executions).toBeGreaterThan(0)
      tls.finishHeld()
      // This controlled server ends the held stream without terminal usage facts.
      // The resulting stream failure still must physically stop before retirement.
      expect(await oldRead).toMatchObject({ failed: { source: 'stream_broken' } })
      await oldSend.response.stopped
      await oldDisposal
      expect(disposed).toBe(true)
      expect(service.inspect()).toMatchObject({ registrations: 1, retiring: 0, executions: 0 })
      expect(await catalog.readProfile(who.tenant, first.ref)).toEqual(changed)
      const sentBeforeRevocation = tls.requests.length
      expect(await logins.revoke(who.loginState, who.loginState)).toBe('ok')
      expect(await app.readOfficialProfiles(who)).toHaveProperty('step', 'verify')
      expect(tls.requests).toHaveLength(sentBeforeRevocation)
      await context.fiber.dispose()
      await service.closed
      await expect.poll(tls.closedSockets).toBeGreaterThanOrEqual(1)
    } finally {
      v1Credential?.fill(0)
      v2Credential?.fill(0)
      if (oldLease && 'lease' in oldLease) oldLease.lease.release()
      if (newLease && 'lease' in newLease) newLease.lease.release()
      tls.finishHeld()
      if (oldRead) await Promise.allSettled([oldRead])
      if (oldDisposal) await oldDisposal
      await context.fiber.dispose()
      await app.close()
      await tls.close()
    }
  })
})
