// Model 的三个权威入口对象（AA 运行时对象表「Model 与 Tool 的原事实、权威与时钟适配对象」）：`modelHostAuthority`、
// `modelPublicationAuthority`、`modelConverterAuthority` 在根上 provide，model-host-local 的三个插件静态 inject。
// 发布与转换器登记一律 `denied`。`modelHostAuthority.resolve` 是波 2 真件（`tmp/wire-model/design.md` §3）：
// 读原受理 → 签 M → 核关系 → `channel.prepare`，每步失败各答 `unavailable` 或 `denied`。
// 本文件用 model 成员首次执行记录的契约替身（`initial` 与 channel 都是脚本对象），只核入口的步骤与次序；
// 真实 `createModelInitialRun` 上的组合见 `tests/rows/model/records-host.spec.ts`。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type {
  PrincipalVerifier,
  TenantStandingReading,
  TenantStandingSource,
} from '@omne-harness/identity'
import { TenantStandingSourceService, principalIssuerKey } from '@omne-harness/identity/cordis'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type ModelHandle,
} from '@omne-harness/model-contract'
import type { ModelConverter, ModelDriveInput } from '@omne-harness/model-contract/provider'
import {
  ModelConverterAuthorityService,
  ModelConvertersService,
  ModelHostAuthorityService,
  ModelInstancesService,
  ModelPublicationAuthorityService,
  modelConverterAuthorityKey,
  modelConvertersKey,
  modelHostAuthorityKey,
  modelInstancesKey,
  modelPublicationAuthorityKey,
  type ModelConverterRegistrationInput,
  type ModelRegistrationInput,
} from '@omne-harness/model-cordis-contract/cordis'
import {
  ModelConvertersLocalPlugin,
  ModelInstancesLocalPlugin,
} from '@omne-harness/model-host-local/cordis'
import type {
  ModelAcceptedOrigin,
  ModelInitialExecution,
  ModelInitialHostChannel,
} from '@omne-harness/model/commands'
import {
  modelConverterAuthority,
  modelHostAuthority,
  modelPublicationAuthority,
} from '../../src/entry/model-authorities.ts'
import { principalIssuer, principalVerifier } from '../../src/entry/principals.ts'
import { modelHostPortOf, modelRecordsPortOf } from '../../src/model/ports.ts'
import { MODEL_HOST_COMPONENT, MODEL_WORK_OWNER } from '../../src/model/principals.ts'
import { ACTOR_OWNER, createModelQualification } from '../../src/model/qualification.ts'
import { fixtureEnv, fixtureTenant, got, heldValues, okOf } from './support.ts'

const TENANT = fixtureTenant('a')
const OTHER = fixtureTenant('b')
const CALL = okOf(decodeModelCallId('mcall_one'), 'call id')
const INSTANCE = okOf(decodeModelInstanceId('minst_one'), 'instance id')
const OPERATION = okOf(decodeModelOperationId('mop_claim'), 'operation id')
const EVIDENCE = { owner: 'host', record: 'r', revision: '1', digest: '1'.repeat(64) }
const MEMBER: TenantStandingReading = Object.freeze({
  kind: 'member',
  role: { model: { model: 'default-team', revision: '1' }, role: 'member' },
  qualifications: [],
  evidence: { record: 'standing:abc', revision: '7' },
})
const ACCEPTED: ModelAcceptedOrigin = Object.freeze({
  tenant: TENANT,
  call: CALL,
  initiator: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' },
  consumer: { owner: '@omne-harness/agent', work: 'w', position: 'p', purpose: 'test' },
})

const handle: ModelHandle<unknown> = {
  instance: INSTANCE,
  observe: () => (async function* () {})(),
}
const publication: ModelRegistrationInput<unknown> = {
  publication: [{ tenant: TENANT, call: CALL, instance: INSTANCE, generation: '1' }, handle],
  authority: EVIDENCE,
}
const converter: ModelConverter<unknown> = {
  adoption: { owner: 'probe', name: 'converter', revision: '1', digest: 'd' },
  convert: () => {
    throw new Error('the probe converter is never called')
  },
}
const conversion: ModelConverterRegistrationInput<unknown> = {
  key: { kind: 'media-type', mediaType: 'image/png' },
  converter,
  adoption: converter.adoption,
  authority: EVIDENCE,
}

type Scripted = {
  acceptance: Awaited<ReturnType<ModelInitialExecution<unknown>['readAcceptance']>>
  prepared: Awaited<ReturnType<ModelInitialHostChannel<unknown>['prepare']>>
  prepares: Parameters<ModelInitialHostChannel<unknown>['prepare']>[0][]
  reads: number
  closes: number
  standing: TenantStandingReading
  onRead?: (target: Parameters<ModelInitialExecution<unknown>['readAcceptance']>[0]) => void
}

/** 首次执行记录与通道的脚本替身：只记录被调用的次序与入参。 */
function scriptedInitial(script: Scripted): ModelInitialExecution<unknown> {
  return {
    readAcceptance: target => {
      script.reads += 1
      script.onRead?.(target)
      return Promise.resolve(script.acceptance)
    },
    openHost: () => ({
      ok: {
        prepare: access => {
          script.prepares.push(access)
          return Promise.resolve(script.prepared)
        },
        qualifyExecution: () => ({ failure: { kind: 'denied', action: 'execution-channel' } }),
        commands: {} as ModelInitialHostChannel<unknown>['commands'],
        coordinator: null,
        close: () => {
          script.closes += 1
        },
      },
    }),
    continuity: () => ({ failure: { kind: 'denied', action: 'continuity' } }),
  }
}

async function installed(options: { withIssuer?: boolean; standing?: TenantStandingReading } = {}) {
  const fixture = fixtureEnv([principalIssuerKey])
  await fixture.install(principalVerifier)
  if (options.withIssuer !== false) await fixture.install(principalIssuer)
  await fixture.install(modelHostAuthority)
  await fixture.install(modelPublicationAuthority)
  await fixture.install(modelConverterAuthority)
  const script: Scripted = {
    acceptance: { ok: ACCEPTED },
    prepared: {
      ok: {
        principal: 'replaced below',
        tenant: TENANT,
        call: CALL,
        instance: INSTANCE,
        operation: OPERATION,
        continuity: EVIDENCE,
      } satisfies ModelDriveInput<unknown>,
    },
    prepares: [],
    reads: 0,
    closes: 0,
    standing: options.standing ?? MEMBER,
  }
  class Standing extends TenantStandingSourceService {
    readonly read: TenantStandingSource['read'] = () => Promise.resolve(script.standing)
  }
  new Standing(fixture.root)
  const host = got(fixture.root.get(modelHostAuthorityKey), 'modelHostAuthority')
  return {
    fixture,
    script,
    host,
    publication: got(fixture.root.get(modelPublicationAuthorityKey), 'modelPublicationAuthority'),
    converter: got(fixture.root.get(modelConverterAuthorityKey), 'modelConverterAuthority'),
    records: got(modelRecordsPortOf(fixture.root), 'records port'),
    hostPort: got(modelHostPortOf(fixture.root), 'host port'),
  }
}

/** 一个记录行的附着与一个宿主行的绑定，像两行在装载时做的那样。 */
async function attachedAndBound(scene: Awaited<ReturnType<typeof installed>>) {
  const { fixture, script, records } = scene
  const verifier = got(fixture.root.get('principalVerifier'), 'verifier') as PrincipalVerifier
  const qualification = createModelQualification({
    verifier,
    standing: { read: () => Promise.resolve(script.standing) },
  })
  const attached = records.attach(fixture.root, {
    initial: scriptedInitial(script),
    qualification,
  })
  if ('failure' in attached) throw new Error('fixture: attach failed')
  let hostCtx: Context | undefined
  const fiber = fixture.root.plugin({
    name: 'host-stand-in',
    apply(ctx: Context) {
      hostCtx = ctx
    },
  })
  await fiber
  if (hostCtx === undefined) throw new Error('fixture: no host context')
  const binding = scene.hostPort.bindHost(hostCtx)
  return { qualification, binding, hostFiber: fiber, handle: attached.ok }
}

describe('the three model authorities on a real Cordis context', () => {
  it('are the model-cordis-contract definitions on the root, declared real', async () => {
    const { host, publication: pub, converter: conv } = await installed()
    expect(host).toBeInstanceOf(ModelHostAuthorityService)
    expect(pub).toBeInstanceOf(ModelPublicationAuthorityService)
    expect(conv).toBeInstanceOf(ModelConverterAuthorityService)
    expect(modelHostAuthority).toMatchObject({ name: 'modelHostAuthority', implementation: 'real' })
    expect(modelPublicationAuthority).toMatchObject({
      name: 'modelPublicationAuthority',
      implementation: 'real',
    })
    expect(modelConverterAuthority).toMatchObject({
      name: 'modelConverterAuthority',
      implementation: 'real',
    })
  })

  it('let the real instances directory load, and the directory refuses every registration as denied', async () => {
    const { fixture } = await installed()
    await fixture.root.plugin(ModelInstancesLocalPlugin)
    const directory = got(fixture.root.get(modelInstancesKey), 'modelInstances')
    expect(directory).toBeInstanceOf(ModelInstancesService)
    let registration: Awaited<ReturnType<ModelInstancesService<unknown>['register']>> | undefined
    await fixture.root.plugin({
      name: 'probe-publisher',
      inject: [modelInstancesKey],
      async apply(ctx) {
        registration = await ctx.modelInstances.register(publication)
      },
    })
    expect(registration).toEqual({ failure: { kind: 'denied' } })
    await expect(
      directory.connect({ principal: 'p', tenant: TENANT, call: CALL }),
    ).resolves.toEqual({ ok: { kind: 'no-live-route' } })
  })

  it('let the real converter catalog load, and the catalog refuses every converter registration as denied', async () => {
    const { fixture } = await installed()
    await fixture.root.plugin(ModelConvertersLocalPlugin)
    const catalog = got(fixture.root.get(modelConvertersKey), 'modelConverters')
    expect(catalog).toBeInstanceOf(ModelConvertersService)
    let registration: Awaited<ReturnType<ModelConvertersService<unknown>['register']>> | undefined
    await fixture.root.plugin({
      name: 'probe-converter',
      inject: [modelConvertersKey],
      async apply(ctx) {
        registration = await ctx.modelConverters.register(conversion)
      },
    })
    expect(registration).toEqual({ failure: { kind: 'denied' } })
  })

  it('publication and converter checks are denied; before any records row attaches, resolve is unavailable', async () => {
    const { host, publication: pub, converter: conv } = await installed()
    expect(pub.check(publication)).toEqual({ failure: { kind: 'denied' } })
    expect(conv.check(conversion)).toEqual({ failure: { kind: 'denied' } })
    const resolved = await host.resolve({ tenant: TENANT, call: CALL })
    expect(resolved).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'modelHostAuthority' },
    })
    expect(JSON.stringify(resolved)).not.toContain('mcall_one')
  })

  it('an unrelated plugin that reads modelHostAuthority gets resolve only: no composition, no write port, no channel (defect: the composition on a public service)', async () => {
    const scene = await installed()
    const bound = await attachedAndBound(scene)
    let seen: unknown
    await scene.fixture.root.plugin({
      name: 'unrelated',
      inject: [modelHostAuthorityKey],
      apply(ctx: Context) {
        seen = ctx.get(modelHostAuthorityKey)
      },
    })
    const service = seen as Record<string, unknown>
    expect(typeof service.resolve).toBe('function')
    for (const name of [
      'composition',
      'attached',
      'attach',
      'grantOriginRead',
      'checkOriginRead',
      'executionChannel',
      'bindHost',
      'hostCurrent',
      'initial',
      'qualification',
      'captureHost',
      'recordHostBinding',
      'releaseExecution',
    ])
      expect(service[name], name).toBeUndefined()
    const held = heldValues(seen)
    for (const [what, value] of [
      ['records port', scene.records],
      ['host port', scene.hostPort],
      ['attach handle', bound.handle],
      ['host binding', bound.binding],
      ['qualification', bound.qualification],
      ['qualification authority', bound.qualification.authority],
    ] as const)
      expect(held.has(value), what).toBe(false)
  })
})

describe('modelHostAuthority.resolve: read the acceptance, issue M, check the relation, prepare', () => {
  it('resolves a call whose acceptance names this tenant and its account: M is issued, captured, and prepare is called with it', async () => {
    const scene = await installed()
    const bound = await attachedAndBound(scene)
    const resolved = await scene.host.resolve({ tenant: TENANT, call: CALL })
    expect(resolved).toHaveProperty('ok')
    if (!('ok' in resolved)) return
    expect(scene.script.reads).toBe(1)
    expect(scene.script.prepares).toHaveLength(1)
    const principal = scene.script.prepares[0]!.principal
    expect(principal).toMatchObject({
      kind: 'acting-for-tenant',
      actor: { kind: 'system', component: MODEL_HOST_COMPONENT },
      tenant: TENANT,
      work: { owner: MODEL_WORK_OWNER, work: CALL },
    })
    // M is captured for the synchronous authority and bound to this call.
    expect(
      bound.qualification.authority.authorize({
        action: 'send',
        access: { principal, tenant: TENANT },
        resource: { kind: 'call', call: CALL, consumer: null },
      }),
    ).toEqual({ ok: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' } })
    expect(
      bound.qualification.authority.execution({
        tenant: TENANT,
        call: CALL,
        instance: INSTANCE,
        generation: '1',
      }),
    ).toEqual({ ok: { owner: MODEL_HOST_COMPONENT, subject: INSTANCE, revision: '1' } })
  })

  it('the origin read is granted only while resolve reads: inside the read it is ok, outside it is denied', async () => {
    const scene = await installed()
    await attachedAndBound(scene)
    const target = { tenant: TENANT, call: CALL }
    expect(scene.records.checkOriginRead(target)).toEqual({
      failure: { kind: 'denied', action: 'origin-read' },
    })
    let seen: unknown
    scene.script.onRead = read => {
      seen = scene.records.checkOriginRead(read)
    }
    expect(await scene.host.resolve(target)).toHaveProperty('ok')
    expect(seen).toEqual({ ok: undefined })
    expect(scene.records.checkOriginRead(target)).toEqual({
      failure: { kind: 'denied', action: 'origin-read' },
    })
  })

  it('no acceptance record: the failure of the read is answered and prepare is not called', async () => {
    const scene = await installed()
    await attachedAndBound(scene)
    scene.script.acceptance = { failure: { kind: 'invalid', field: 'call', reason: 'not-found' } }
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
    })
    scene.script.acceptance = { failure: { kind: 'commit-unknown', operation: OPERATION } }
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'acceptance-commit-unknown' },
    })
    expect(scene.script.prepares).toHaveLength(0)
  })

  it('the acceptance names another tenant: denied, no M is captured, prepare is not called', async () => {
    const scene = await installed()
    const bound = await attachedAndBound(scene)
    scene.script.acceptance = { ok: { ...ACCEPTED, tenant: OTHER } }
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toEqual({
      failure: { kind: 'denied', action: 'model-host-resolve' },
    })
    expect(scene.script.prepares).toHaveLength(0)
    expect(
      bound.qualification.authority.execution({
        tenant: TENANT,
        call: CALL,
        instance: INSTANCE,
        generation: '1',
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'execution-channel' } })
  })

  it('the initiator is not the account of this tenant (another standing record, or another owner): denied', async () => {
    const scene = await installed()
    await attachedAndBound(scene)
    scene.script.acceptance = {
      ok: { ...ACCEPTED, initiator: { ...ACCEPTED.initiator, subject: 'standing:other' } },
    }
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toEqual({
      failure: { kind: 'denied', action: 'model-host-resolve' },
    })
    scene.script.acceptance = {
      ok: { ...ACCEPTED, initiator: { ...ACCEPTED.initiator, owner: 'someone-else' } },
    }
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toEqual({
      failure: { kind: 'denied', action: 'model-host-resolve' },
    })
    expect(scene.script.prepares).toHaveLength(0)
  })

  it('standing not-member is denied; standing unavailable is unavailable', async () => {
    const scene = await installed()
    await attachedAndBound(scene)
    scene.script.standing = {
      kind: 'not-member',
      evidence: { record: 'standing:abc', revision: '0' },
    }
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toEqual({
      failure: { kind: 'denied', action: 'model-host-resolve' },
    })
    scene.script.standing = { kind: 'unavailable', diagnostic: 'db' }
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'modelHostAuthority' },
    })
    expect(scene.script.prepares).toHaveLength(0)
  })

  it('without the trusted principal issuer, resolve is unavailable before any read', async () => {
    const scene = await installed({ withIssuer: false })
    await attachedAndBound(scene)
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'principal-issuer-unavailable' },
    })
    expect(scene.script.reads).toBe(0)
  })

  it('without a bound host, resolve is unavailable; after the host fiber retires, M is no longer current', async () => {
    const scene = await installed()
    const bound = await attachedAndBound(scene)
    const resolved = await scene.host.resolve({ tenant: TENANT, call: CALL })
    expect(resolved).toHaveProperty('ok')
    const principal = scene.script.prepares[0]!.principal
    await bound.hostFiber.dispose()
    expect(
      bound.qualification.authority.authorize({
        action: 'send',
        access: { principal, tenant: TENANT },
        resource: { kind: 'call', call: CALL, consumer: null },
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'send' } })
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'host-not-bound' },
    })
  })

  it('prepare is never skipped: a refused prepare is answered as it is and the M capture is withdrawn', async () => {
    const scene = await installed()
    const bound = await attachedAndBound(scene)
    scene.script.prepared = {
      failure: { kind: 'unavailable', dependency: 'model-initial-execution', diagnostic: 'x' },
    }
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'model-initial-execution' },
    })
    expect(scene.script.prepares).toHaveLength(1)
    const principal = scene.script.prepares[0]!.principal
    expect(
      bound.qualification.authority.authorize({
        action: 'send',
        access: { principal, tenant: TENANT },
        resource: { kind: 'call', call: CALL, consumer: null },
      }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('releaseExecution ends the attachment: the channel is closed once and no later fetch hands it out (defect: a closed channel handed out)', async () => {
    const scene = await installed()
    const bound = await attachedAndBound(scene)
    expect(bound.binding.executionChannel()).toHaveProperty('ok')
    await bound.binding.releaseExecution()
    expect(scene.script.closes).toBe(1)
    const unavailable = { failure: { kind: 'unavailable', diagnostic: 'records-not-attached' } }
    expect(bound.binding.executionChannel()).toMatchObject(unavailable)
    expect(bound.handle.executionChannel()).toMatchObject(unavailable)
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toMatchObject(unavailable)
    // The host's own finally and the records row's effect close again idempotently.
    await bound.binding.releaseExecution()
    bound.handle.detach()
    expect(scene.script.closes).toBe(1)
  })

  it('a second records attachment is refused while one is attached; after detach the next one is accepted', async () => {
    const scene = await installed()
    const bound = await attachedAndBound(scene)
    const again = scene.records.attach(scene.fixture.root, {
      initial: scriptedInitial(scene.script),
      qualification: bound.qualification,
    })
    expect(again).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(bound.handle.executionChannel()).toHaveProperty('ok')
    bound.handle.detach()
    expect(bound.handle.executionChannel()).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'records-not-attached' },
    })
    expect(await scene.host.resolve({ tenant: TENANT, call: CALL })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'records-not-attached' },
    })
    expect(
      scene.records.attach(scene.fixture.root, {
        initial: scriptedInitial(scene.script),
        qualification: bound.qualification,
      }),
    ).toHaveProperty('ok')
  })
})
