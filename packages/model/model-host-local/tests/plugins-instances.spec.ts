// The instance directory and converter plugins on real Cordis 4.0.4. The authorities are test
// objects (the assembly entry supplies the real ones); no other double is involved.
import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  type ModelHandle,
} from '@omne-harness/model-contract'
import {
  ModelConverterAuthorityService,
  ModelInstancesService,
  ModelPublicationAuthorityService,
  modelInstancesKey,
  type ModelRegistrationFailure,
  type ModelRegistrationInput,
} from '@omne-harness/model-cordis-contract/cordis'
import { expect, it } from 'vitest'
import { ModelConvertersLocalPlugin, ModelInstancesLocalPlugin } from '../src/cordis.ts'

function unbox<T>(decoded: { ok: T } | { failure: unknown }): T {
  if ('ok' in decoded) return decoded.ok
  throw new Error('fixture identity')
}

const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('fixture identity')
const TENANT = tenant(organization.value, account.value)
const CALL = unbox(decodeModelCallId('mcall_one'))
const INSTANCE = unbox(decodeModelInstanceId('minst_one'))

const handle: ModelHandle<unknown> = {
  instance: INSTANCE,
  observe: () => (async function* () {})(),
}
const evidence = { owner: 'host', record: 'r', revision: '1', digest: '1'.repeat(64) }
const publication: ModelRegistrationInput<unknown> = {
  publication: [{ tenant: TENANT, call: CALL, instance: INSTANCE, generation: '1' }, handle],
  authority: evidence,
}

class PublicationAuthority extends ModelPublicationAuthorityService<unknown> {
  verdict: { failure: ModelRegistrationFailure } | { ok: undefined } = { ok: undefined }
  readonly check = () => this.verdict
}

class ConverterAuthority extends ModelConverterAuthorityService<unknown> {
  readonly check = () => ({ ok: undefined })
}

// A bounded wait tells a fiber that waits for a dependency from one that settled.
async function settle(fiber: PromiseLike<unknown>) {
  await Promise.race([fiber, new Promise(resolve => setTimeout(resolve, 100))])
}

// A caller plugin: the registration is an effect of its fiber and ends with it.
function callerOf(ctx: Context, input: ModelRegistrationInput<unknown>) {
  const result: {
    registration?: Awaited<ReturnType<ModelInstancesService<unknown>['register']>>
  } = {}
  const fiber = ctx.plugin({
    inject: [modelInstancesKey],
    apply: async inner => {
      result.registration = await inner.modelInstances.register(input)
    },
  })
  return { fiber, result }
}

const OBSERVER = { principal: 'p', tenant: TENANT, call: CALL }

it('waits without a publication authority and publishes the one directory once it appears', async () => {
  const ctx = new Context()
  const fiber = ctx.plugin(ModelInstancesLocalPlugin)
  await settle(fiber)
  expect(ctx.modelInstances).toBeUndefined()

  await ctx.plugin(PublicationAuthority)
  await fiber
  expect(ctx.modelInstances).toBeInstanceOf(ModelInstancesService)
})

it('serves the handle of a registration and stops serving it when the registration is released', async () => {
  const ctx = new Context()
  await ctx.plugin(PublicationAuthority)
  await ctx.plugin(ModelInstancesLocalPlugin)
  const { fiber, result } = callerOf(ctx, publication)
  await fiber

  const registration = result.registration
  if (!registration || !('ok' in registration)) throw new Error('registration failed')
  expect(registration.ok.receipt.registration).toEqual(expect.any(String))
  expect(await ctx.modelInstances.connect(OBSERVER)).toEqual({ ok: { kind: 'live', handle } })

  expect(await registration.ok.release()).toEqual({ removed: true })
  expect(await ctx.modelInstances.connect(OBSERVER)).toEqual({ ok: { kind: 'no-live-route' } })
  expect(await registration.ok.release()).toEqual({ removed: false })
})

it('answers a tenant that did not come from the identity parser with invalid on the tenant field', async () => {
  const ctx = new Context()
  await ctx.plugin(PublicationAuthority)
  await ctx.plugin(ModelInstancesLocalPlugin)
  const answer = await ctx.modelInstances.connect({ ...OBSERVER, tenant: { ...TENANT } })
  expect(answer).toMatchObject({ failure: { kind: 'invalid', field: 'tenant' } })
})

it('asks the injected authority before it records a registration', async () => {
  const ctx = new Context()
  const authority = new PublicationAuthority(ctx)
  authority.verdict = { failure: { kind: 'denied' } }
  await ctx.plugin(ModelInstancesLocalPlugin)

  const { fiber, result } = callerOf(ctx, publication)
  await fiber
  expect(result.registration).toEqual({ failure: { kind: 'denied' } })
  expect(await ctx.modelInstances.connect(OBSERVER)).toEqual({ ok: { kind: 'no-live-route' } })
})

it('a successor directory does not serve a handle that the old one served', async () => {
  const ctx = new Context()
  await ctx.plugin(PublicationAuthority)
  const first = await ctx.plugin(ModelInstancesLocalPlugin)
  // From the root context, so that the registration does not belong to a plugin fiber that Cordis
  // would reload on top of the successor: a dependent plugin registers again by itself.
  await ctx.modelInstances.register(publication)
  expect(await ctx.modelInstances.connect(OBSERVER)).toMatchObject({ ok: { kind: 'live' } })

  await first.dispose()
  expect(ctx.modelInstances).toBeUndefined()
  await ctx.plugin(ModelInstancesLocalPlugin)
  expect(await ctx.modelInstances.connect(OBSERVER)).toEqual({ ok: { kind: 'no-live-route' } })
})

it('losing the authority takes the directory down with it, and the directory returns when the authority is back', async () => {
  const ctx = new Context()
  const authority = await ctx.plugin(PublicationAuthority)
  await ctx.plugin(ModelInstancesLocalPlugin)
  expect(ctx.modelInstances).toBeDefined()

  await authority.dispose()
  expect(ctx.modelInstances).toBeUndefined()
  await ctx.plugin(PublicationAuthority)
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(ctx.modelInstances).toBeInstanceOf(ModelInstancesService)
})

it('the converter plugin waits for its authority, publishes the one catalog and does not need the directory', async () => {
  const ctx = new Context()
  const fiber = ctx.plugin(ModelConvertersLocalPlugin)
  await settle(fiber)
  expect(ctx.modelConverters).toBeUndefined()

  await ctx.plugin(ConverterAuthority)
  await fiber
  expect(ctx.modelInstances).toBeUndefined()
  expect(await ctx.modelConverters.acquire({ mediaType: 'text/plain', modality: null })).toEqual({
    ok: { kind: 'absent' },
  })
})
