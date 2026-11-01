// The `modelProfiles` plugin through real Cordis 4.0.4: the official OpenAI profiles behind the
// `modelProfiles` service, each answer compared with `officialOpenAiProfiles` of the same input,
// the list and the modality answer, removal, a configuration that cannot load, and the scripted
// double for the parts both answer the same way.
import { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Adoption, ModalityRequirement } from '@omne-harness/model-contract'
import type { ModelChoices } from '@omne-harness/model-contract/provider'
import { createScriptedModelProfiles } from '@omne-harness/model-contract/testing'
import { ModelProfilesService } from '@omne-harness/model-cordis-contract/cordis'
import { officialOpenAiProfiles, OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { expect, it } from 'vitest'
import { ModelProfilesLocalPlugin } from '../src/cordis.ts'

const principal = { owner: 'model-host-local-tests', subject: 'reader' }

function tenantOf(organization: string, account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${organization.padStart(26, '0')}`,
      account: `acc_${account.padStart(26, '0')}`,
    }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}

const TENANT = tenantOf('1', '1')

const RETRY: Adoption = {
  owner: 'model-host-local-tests',
  name: 'retry',
  revision: '1',
  digest: '0'.repeat(64),
}
const CONFIG = {
  retryPolicy: RETRY,
  compactionTriggerPercent: '80',
  updatedAt: '2026-11-01T00:00:00Z',
} as const

const MODALITY_SOURCE = {
  owner: 'model-host-local-tests',
  record: 'modality',
  revision: '1',
  digest: 'digest-modality',
}
const requirement = (modalities: ModalityRequirement['modalities']): ModalityRequirement => ({
  modalities,
  source: MODALITY_SOURCE,
})

const ROUTES = OPENAI_RECORDS.filter(record => record.status === 'current').map(
  record => record.name,
)

async function loaded() {
  const ctx = new Context()
  const fiber = await ctx.plugin(ModelProfilesLocalPlugin, CONFIG)
  return { ctx, fiber }
}

function must<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
}

it('serves the official profiles as the modelProfiles service', async () => {
  const { ctx } = await loaded()
  expect(ctx.modelProfiles).toBeInstanceOf(ModelProfilesService)
  expect(ctx.modelProfiles?.list).toEqual(expect.any(Function))
  expect(ctx.modelProfiles?.resolve).toEqual(expect.any(Function))
})

it('resolves every official route to the profile definition the family publishes', async () => {
  const { ctx } = await loaded()
  const service = ctx.modelProfiles
  if (service === undefined) throw new Error('no modelProfiles service')
  const official = officialOpenAiProfiles({
    retryPolicy: RETRY,
    compactionTriggerPercent: CONFIG.compactionTriggerPercent,
  })
  expect(official).toHaveLength(ROUTES.length)
  for (const [index, route] of ROUTES.entries()) {
    const resolved = must(
      await service.resolve({ principal, tenant: TENANT, route, required: requirement(['text']) }),
    )
    if (resolved.kind !== 'resolved') throw new Error(`route ${route} is ${resolved.kind}`)
    expect(resolved.profile.definition).toEqual(official[index])
    expect(resolved.profile.identity).toEqual({ scope: { kind: 'factory' }, route })
  }
})

it('lists every current record as a selectable choice, all with an unavailable credential', async () => {
  const { ctx } = await loaded()
  const service = ctx.modelProfiles
  if (service === undefined) throw new Error('no modelProfiles service')
  const choices: ModelChoices = must(
    await service.list({
      principal,
      tenant: TENANT,
      selected: null,
      required: requirement(['text']),
    }),
  )
  expect(choices.choices).toHaveLength(ROUTES.length)
  expect(choices.selected).toBeNull()
  for (const choice of choices.choices) {
    if (choice.kind !== 'resolved') throw new Error(`a choice is ${choice.kind}`)
    expect(choice.selectable).toBe(true)
    expect(choice.credential).toBe('unavailable')
  }
  expect(
    new Set(
      choices.choices.map(choice =>
        choice.kind === 'resolved' ? choice.profile.identity.route : '',
      ),
    ),
  ).toEqual(new Set(ROUTES))
})

it('answers a voice requirement as unselectable with only the modality reason, on the same profile', async () => {
  const { ctx } = await loaded()
  const service = ctx.modelProfiles
  if (service === undefined) throw new Error('no modelProfiles service')
  const route = ROUTES[0] ?? ''
  const plain = must(
    await service.resolve({ principal, tenant: TENANT, route, required: requirement(['text']) }),
  )
  const voice = must(
    await service.resolve({
      principal,
      tenant: TENANT,
      route,
      required: requirement(['text', 'voice']),
    }),
  )
  if (plain.kind !== 'resolved' || voice.kind !== 'resolved') throw new Error('expected resolved')
  expect(voice.selectable).toBe(false)
  expect(voice.reasons).toEqual(['modality'])
  expect(voice.profile).toBe(plain.profile)
})

it('publishes modelProfiles while it lives and withdraws it when disposed', async () => {
  const { ctx, fiber } = await loaded()
  expect(ctx.modelProfiles).toBeInstanceOf(ModelProfilesService)
  await fiber.dispose()
  expect(ctx.modelProfiles).toBeUndefined()
})

it('answers unavailable through a handle kept past removal, instead of the old snapshot', async () => {
  const { ctx, fiber } = await loaded()
  const handle = ctx.modelProfiles
  if (handle === undefined) throw new Error('no modelProfiles service')
  await fiber.dispose()
  const answer = await handle.list({
    principal,
    tenant: TENANT,
    selected: null,
    required: requirement(['text']),
  })
  expect(answer).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'model-profiles',
      diagnostic: 'plugin-removed',
    },
  })
})

it('reads one snapshot at construction: every read of the plugin sees the same profiles', async () => {
  const { ctx } = await loaded()
  const service = ctx.modelProfiles
  if (service === undefined) throw new Error('no modelProfiles service')
  const first = must(
    await service.resolve({
      principal,
      tenant: TENANT,
      route: ROUTES[0] ?? '',
      required: requirement(['text']),
    }),
  )
  const second = must(
    await service.resolve({
      principal,
      tenant: TENANT,
      route: ROUTES[0] ?? '',
      required: requirement(['text']),
    }),
  )
  if (first.kind !== 'resolved' || second.kind !== 'resolved') throw new Error('expected resolved')
  expect(second.profile).toBe(first.profile)
})

it('fails to load on a configuration it cannot accept, and publishes nothing', async () => {
  const invalid: readonly unknown[] = [
    {},
    { ...CONFIG, retryPolicy: undefined },
    { ...CONFIG, retryPolicy: { ...RETRY, owner: '' } },
    { ...CONFIG, retryPolicy: 'retry' },
    { ...CONFIG, compactionTriggerPercent: 80 },
    { ...CONFIG, compactionTriggerPercent: '0' },
    { ...CONFIG, compactionTriggerPercent: '101' },
    { ...CONFIG, compactionTriggerPercent: '80.0' },
    { ...CONFIG, updatedAt: '2026-11-01 00:00:00' },
    { ...CONFIG, updatedAt: 1_790_000_000 },
  ]
  for (const config of invalid) {
    const ctx = new Context()
    await expect(
      ctx.plugin(ModelProfilesLocalPlugin, config as Parameters<typeof ctx.plugin>[1]),
    ).rejects.toThrow()
    expect(ctx.modelProfiles, JSON.stringify(config)).toBeUndefined()
  }
})

it('passes the configuration through to the profiles it publishes', async () => {
  const ctx = new Context()
  await ctx.plugin(ModelProfilesLocalPlugin, { ...CONFIG, compactionTriggerPercent: '55' })
  const service = ctx.modelProfiles
  if (service === undefined) throw new Error('no modelProfiles service')
  const resolved = must(
    await service.resolve({
      principal,
      tenant: TENANT,
      route: ROUTES[0] ?? '',
      required: requirement(['text']),
    }),
  )
  if (resolved.kind !== 'resolved') throw new Error('expected resolved')
  expect(resolved.profile.definition.context.compactionTriggerPercent).toBe('55')
  expect(resolved.profile.definition.retryPolicy).toEqual(RETRY)
  expect(resolved.profile.updatedAt).toBe(CONFIG.updatedAt)
})

it('agrees with the scripted double on the answers it can register, and on the tenant denial', async () => {
  const { ctx } = await loaded()
  const service = ctx.modelProfiles
  if (service === undefined) throw new Error('no modelProfiles service')
  const route = ROUTES[0] ?? ''
  const required = requirement(['text'])
  const real = must(await service.resolve({ principal, tenant: TENANT, route, required }))
  const realList = must(
    await service.list({ principal, tenant: TENANT, selected: route, required }),
  )

  // The double does not evaluate: registering a real answer proves the answer is self-consistent.
  const scripted = createScriptedModelProfiles()
  scripted.setAccess({ principal, tenant: TENANT }, 'allow')
  scripted.setResolution({ principal, tenant: TENANT, route, required }, { ok: real })
  scripted.setList({ principal, tenant: TENANT, selected: route, required }, { ok: realList })
  expect(await scripted.profiles.resolve({ principal, tenant: TENANT, route, required })).toEqual({
    ok: real,
  })
  expect(
    await scripted.profiles.list({ principal, tenant: TENANT, selected: route, required }),
  ).toEqual({ ok: realList })

  // Differences the double keeps on purpose: it denies an access it was not told to allow, while
  // the real member has no subject check in M2, and it throws for an input it was not scripted
  // for, while the real member evaluates.
  const unscripted = { ...principal, subject: 'other' }
  expect(
    await scripted.profiles.resolve({ principal: unscripted, tenant: TENANT, route, required }),
  ).toEqual({
    failure: { kind: 'denied', action: 'profiles.resolve' },
  })
  expect(
    must(await service.resolve({ principal: unscripted, tenant: TENANT, route, required })).kind,
  ).toBe('resolved')

  // An unminted tenant is refused by both, before anything else.
  const copied = structuredClone(TENANT)
  expect(await scripted.profiles.resolve({ principal, tenant: copied, route, required })).toEqual({
    failure: { kind: 'denied', action: 'tenant' },
  })
  expect(await service.resolve({ principal, tenant: copied, route, required })).toEqual({
    failure: { kind: 'denied', action: 'tenant' },
  })
})

it('serves a reloaded plugin from its own snapshot while the removed handle stays unavailable', async () => {
  const ctx = new Context()
  const first = await ctx.plugin(ModelProfilesLocalPlugin, CONFIG)
  const oldHandle = ctx.modelProfiles
  if (oldHandle === undefined) throw new Error('no modelProfiles service')
  await first.dispose()
  await ctx.plugin(ModelProfilesLocalPlugin, { ...CONFIG, compactionTriggerPercent: '90' })
  const route = ROUTES[0] ?? ''
  const served = must(
    await ctx.modelProfiles!.resolve({
      principal,
      tenant: TENANT,
      route,
      required: requirement(['text']),
    }),
  )
  if (served.kind !== 'resolved') throw new Error('expected resolved')
  expect(served.profile.definition.context.compactionTriggerPercent).toBe('90')
  expect(
    await oldHandle.resolve({ principal, tenant: TENANT, route, required: requirement(['text']) }),
  ).toEqual({
    failure: { kind: 'unavailable', dependency: 'model-profiles', diagnostic: 'plugin-removed' },
  })
})
