// Model 的三个权威入口对象（AA 运行时对象表「Model 与 Tool 的原事实、权威与时钟适配对象」）：`modelHostAuthority`、
// `modelPublicationAuthority`、`modelConverterAuthority` 在根上 provide，model-host-local 的三个插件静态 inject。
// M2 的最小诚实实现：入口没有预约表与调用记录来源，所以发布与转换器登记一律 `denied`，调用解析一律 `unavailable`，
// 没有一条路径放行。用例经 model-host-local 的真实目录插件与服务键调用。
import { describe, expect, it } from 'vitest'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  type ModelHandle,
} from '@omne-harness/model-contract'
import type { ModelConverter } from '@omne-harness/model-contract/provider'
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
import {
  modelConverterAuthority,
  modelHostAuthority,
  modelPublicationAuthority,
} from '../../src/entry/model-authorities.ts'
import { fixtureEnv, fixtureTenant, got, okOf } from './support.ts'

const TENANT = fixtureTenant('a')
const CALL = okOf(decodeModelCallId('mcall_one'), 'call id')
const INSTANCE = okOf(decodeModelInstanceId('minst_one'), 'instance id')
const EVIDENCE = { owner: 'host', record: 'r', revision: '1', digest: '1'.repeat(64) }

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

async function installed() {
  const fixture = fixtureEnv([])
  await fixture.install(modelHostAuthority)
  await fixture.install(modelPublicationAuthority)
  await fixture.install(modelConverterAuthority)
  return {
    fixture,
    host: got(fixture.root.get(modelHostAuthorityKey), 'modelHostAuthority'),
    publication: got(fixture.root.get(modelPublicationAuthorityKey), 'modelPublicationAuthority'),
    converter: got(fixture.root.get(modelConverterAuthorityKey), 'modelConverterAuthority'),
  }
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

  it('answer directly: publication and converter checks are denied, call resolution is unavailable, nothing is ok', async () => {
    const { host, publication: pub, converter: conv } = await installed()
    expect(pub.check(publication)).toEqual({ failure: { kind: 'denied' } })
    expect(conv.check(conversion)).toEqual({ failure: { kind: 'denied' } })
    const resolved = await host.resolve({ tenant: TENANT, call: CALL })
    expect(resolved).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'modelHostAuthority' },
    })
    expect('ok' in resolved).toBe(false)
    expect(JSON.stringify(resolved)).not.toContain('mcall_one')
  })
})
