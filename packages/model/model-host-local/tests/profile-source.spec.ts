import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Adoption, ModelProfile, ModelProfileDefinition } from '@omne-harness/model-contract'
import type { ModelProfileSnapshot } from '@omne-harness/model-contract/provider'
import { createModelProfiles } from '@omne-harness/model'
import { expect, it } from 'vitest'
import { createOfficialProfileSource } from '../src/profile-source.ts'
import { providerName } from './support/credentials.ts'

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

function adoptionOf(route: string): Adoption {
  return {
    owner: '@omne-harness/pi-ai-openai',
    name: route,
    revision: '1',
    digest: 'a'.repeat(64),
  }
}

const RETRY: Adoption = {
  owner: 'model-host-local-tests',
  name: 'retry',
  revision: '1',
  digest: '0'.repeat(64),
}
const REPRESENTATION: Adoption = {
  owner: '@omne-harness/pi-ai-openai',
  name: 'route#representation',
  revision: '1',
  digest: 'b'.repeat(64),
}
const METER: Adoption = {
  owner: '@omne-harness/pi-ai-openai',
  name: 'route#meter',
  revision: '1',
  digest: 'c'.repeat(64),
}

const UPDATED_AT = '2026-11-01T00:00:00Z'

function definitionOf(route: string): ModelProfileDefinition {
  return {
    suppliers: [
      {
        adoption: adoptionOf(route),
        provider: providerName('openrouter'),
        model: route,
        replay: { produces: `openrouter/${route}`, accepts: [`openrouter/${route}`] },
      },
    ],
    fallback: false,
    input: ['text', 'image'],
    output: ['text'],
    context: {
      window: { provided: '1000', upstream: [] },
      input: null,
      output: { provided: '100', upstream: [] },
      compactionTriggerPercent: '80',
    },
    limits: [
      {
        metric: 'image-bytes',
        provided: '4194304',
        upstream: [{ supplier: adoptionOf(route), limit: { kind: 'unknown' } }],
      },
    ],
    parameters: [],
    representation: REPRESENTATION,
    meter: METER,
    retryPolicy: RETRY,
  }
}

function sourceOf(routes: readonly string[]) {
  return createOfficialProfileSource({
    definitions: routes.map(definitionOf),
    updatedAt: UPDATED_AT,
  })
}

async function snapshotOf(routes: readonly string[]): Promise<ModelProfileSnapshot> {
  const read = await sourceOf(routes).read({ principal, tenant: TENANT })
  if ('failure' in read) throw new Error(`source failure ${JSON.stringify(read.failure)}`)
  return read.ok
}

function profilesOfRoute(profile: ModelProfile): Adoption {
  return profile.adoption
}

const DEFINITION_DIGEST = '936a8c89f93b6f943bf7e7b55af590a5c9e16d7f46c74e16c91c84de6c71a40b'
const SNAPSHOT_DIGEST = '3252c6c3908c2223dfa1add8afcfd61948e63b5183d6027de4919d8547837795'

it('turns each definition into a factory profile whose route is the first supplier model', async () => {
  const snapshot = await snapshotOf(['alpha/route', 'beta/route'])
  expect(snapshot.precedence).toEqual([{ kind: 'factory' }])
  expect(snapshot.candidates).toHaveLength(2)
  for (const [index, route] of ['alpha/route', 'beta/route'].entries()) {
    const candidate = snapshot.candidates[index]
    if (candidate === undefined) throw new Error('missing candidate')
    expect(candidate.profile.identity).toEqual({ scope: { kind: 'factory' }, route })
    expect(candidate.profile.availability).toBe('active')
    expect(candidate.profile.updatedAt).toBe(UPDATED_AT)
    expect(candidate.excluded).toBe(false)
    expect(candidate.locked).toBe(false)
    expect(candidate.credential).toBe('unavailable')
    expect(candidate.profile.definition).toEqual(definitionOf(route))
  }
})

it('keeps the supplier owner and revision in the profile adoption and names the route', async () => {
  const snapshot = await snapshotOf(['alpha/route'])
  const profile = snapshot.candidates[0]?.profile
  if (profile === undefined) throw new Error('missing profile')
  const supplier = adoptionOf('alpha/route')
  expect(profile.adoption.owner).toBe(supplier.owner)
  expect(profile.adoption.name).toBe('alpha/route')
  expect(profile.adoption.revision).toBe(supplier.revision)
  expect(profile.adoption.digest).toBe(DEFINITION_DIGEST)
})

it('builds the snapshot evidence from the timestamp and every profile adoption', async () => {
  const snapshot = await snapshotOf(['alpha/route'])
  expect(snapshot.source).toEqual({
    owner: '@omne-harness/model-host-local',
    record: 'official-profiles',
    revision: UPDATED_AT,
    digest: SNAPSHOT_DIGEST,
  })
})

it('serves the same frozen snapshot on every read and never mutates it', async () => {
  const source = sourceOf(['alpha/route'])
  const first = await source.read({ principal, tenant: TENANT })
  const second = await source.read({ principal, tenant: TENANT })
  if ('failure' in first || 'failure' in second) throw new Error('source failure')
  expect(second.ok).toBe(first.ok)
  expect(Object.isFrozen(first.ok)).toBe(true)
  expect(Object.isFrozen(first.ok.candidates)).toBe(true)
})

it('makes every official profile resolvable, with no credential and no reason', async () => {
  const source = sourceOf(['alpha/route', 'beta/route'])
  const profiles = createModelProfiles(source)
  const required = {
    modalities: ['text'] as const,
    source: { owner: 'model-host-local-tests', record: 'modality', revision: '1', digest: 'm' },
  }
  const resolved = await profiles.resolve({
    principal,
    tenant: TENANT,
    route: 'alpha/route',
    required: { ...required, modalities: ['text'] },
  })
  if ('failure' in resolved) throw new Error(`resolve failure ${JSON.stringify(resolved.failure)}`)
  expect(resolved.ok).toMatchObject({ kind: 'resolved', selectable: true, reasons: [] })
  expect(resolved.ok).toMatchObject({ credential: 'unavailable' })
})

it('refuses two definitions on one route at construction instead of serving half of them', () => {
  expect(() => sourceOf(['alpha/route', 'alpha/route'])).toThrow(RangeError)
  expect(() => sourceOf(['alpha/route', 'alpha/route'])).toThrow(/alpha\/route/)
})

it('refuses a supplier adoption whose revision is not a revision', () => {
  const broken: ModelProfileDefinition = {
    ...definitionOf('alpha/route'),
    suppliers: [
      {
        adoption: { ...adoptionOf('alpha/route'), revision: 'one' },
        provider: providerName('openrouter'),
        model: 'alpha/route',
      },
    ],
  }
  expect(() =>
    createOfficialProfileSource({ definitions: [broken], updatedAt: UPDATED_AT }),
  ).toThrow(RangeError)
})

it('gives each profile its definition unchanged, so the definition is the family one', async () => {
  const definition = definitionOf('alpha/route')
  const source = createOfficialProfileSource({ definitions: [definition], updatedAt: UPDATED_AT })
  const read = await source.read({ principal, tenant: TENANT })
  if ('failure' in read) throw new Error('source failure')
  const profile = read.ok.candidates[0]?.profile
  if (profile === undefined) throw new Error('missing profile')
  expect(profilesOfRoute(profile)).toBe(profile.adoption)
  expect(profile.definition).toBe(definition)
})

it('reads current credential presence once per provider and Access without resolving secrets', async () => {
  const seen: unknown[] = []
  let state: 'available' | 'missing' = 'missing'
  const source = createOfficialProfileSource(
    { definitions: ['alpha/route', 'beta/route'].map(definitionOf), updatedAt: UPDATED_AT },
    () => ({
      layerOf: query => {
        seen.push(query)
        return state === 'available'
          ? { ok: { layer: 'official' } }
          : { failure: { kind: 'missing' } }
      },
      resolve: () => {
        throw new Error('presence must not read secrets')
      },
    }),
  )
  const first = await source.read({ principal, tenant: TENANT })
  if (!('ok' in first)) throw new Error('source failure')
  expect(first.ok.candidates.map(candidate => candidate.credential)).toEqual(['missing', 'missing'])
  expect(seen).toEqual([
    { provider: providerName('openrouter'), official: true, access: { principal, tenant: TENANT } },
  ])
  state = 'available'
  const other = tenantOf('2', '2')
  const second = await source.read({ principal, tenant: other })
  if (!('ok' in second)) throw new Error('source failure')
  expect(second.ok.candidates.map(candidate => candidate.credential)).toEqual([
    'available',
    'available',
  ])
  expect(seen).toHaveLength(2)
  expect(seen[1]).toEqual({
    provider: providerName('openrouter'),
    official: true,
    access: { principal, tenant: other },
  })
  expect(second.ok.source.digest).not.toBe(first.ok.source.digest)
  expect(second.ok.source.revision).not.toBe(first.ok.source.revision)
})

it('keeps uncertain credential presence unknown while the official profiles remain selectable', async () => {
  for (const readPort of [
    () => undefined,
    () => {
      throw new Error('provider down')
    },
    () => ({
      layerOf: () => {
        throw new Error('custody down')
      },
      resolve: () => {
        throw new Error('must not resolve')
      },
    }),
    () => ({
      layerOf: () => ({ failure: { kind: 'unavailable' as const } }),
      resolve: () => {
        throw new Error('must not resolve')
      },
    }),
    () => ({
      layerOf: () => ({ failure: { kind: 'denied' as const } }),
      resolve: () => {
        throw new Error('must not resolve')
      },
    }),
  ]) {
    const source = createOfficialProfileSource(
      { definitions: [definitionOf('alpha/route')], updatedAt: UPDATED_AT },
      readPort,
    )
    const resolved = await createModelProfiles(source).resolve({
      principal,
      tenant: TENANT,
      route: 'alpha/route',
      required: {
        modalities: ['text'],
        source: { owner: 'test', record: 'text', revision: '1', digest: '0'.repeat(64) },
      },
    })
    expect(resolved).toMatchObject({
      ok: { kind: 'resolved', selectable: true, credential: 'unavailable' },
    })
  }
})
