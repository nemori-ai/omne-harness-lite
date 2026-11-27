import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  profileProblems,
  type Adoption,
  type ModelProfile,
  type ModelProfileDefinition,
} from '@omne-harness/model-contract'
import type {
  ModelPreferencesPort,
  ModelProfileSnapshot,
} from '@omne-harness/model-contract/provider'
import { createModelProfiles } from '@omne-harness/model'
import { expect, it } from 'vitest'
import { createOfficialProfileSource } from '../src/profile-source.ts'
import { officialProfiles } from '../src/official-profiles.ts'
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

function definitionOf(route: string): ModelProfileDefinition<'llm'> {
  return {
    kind: 'llm',
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

const DEFINITION_DIGEST = '2160ea858ba33e5ed479cd1933b34fabfa4c74adb23ce7c57b727dd593b102a6'
const SNAPSHOT_DIGEST = 'f571de4c9f2af816d34f7ee0a1a432827454693aba5c22e40cd20e9eec736045'

it('turns each definition into a factory profile whose route is the first supplier model', async () => {
  const snapshot = await snapshotOf(['alpha/route', 'beta/route'])
  expect(snapshot.precedence).toEqual([{ kind: 'factory' }])
  expect(snapshot.candidates).toHaveLength(2)
  for (const [index, route] of ['alpha/route', 'beta/route'].entries()) {
    const candidate = snapshot.candidates[index]
    if (candidate === undefined) throw new Error('missing candidate')
    expect(candidate.profile.identity).toEqual({ scope: { kind: 'factory' }, kind: 'llm', route })
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
    kind: 'llm',
    source: { owner: 'model-host-local-tests', record: 'modality', revision: '1', digest: 'm' },
  } as const
  const resolved = await profiles.resolve({
    principal,
    tenant: TENANT,
    route: 'alpha/route',
    required: { ...required, modalities: { input: ['text'] } },
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
  const broken: ModelProfileDefinition<'llm'> = {
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
        kind: 'llm',
        modalities: { input: ['text'] },
        source: { owner: 'test', record: 'text', revision: '1', digest: '0'.repeat(64) },
      },
    })
    expect(resolved).toMatchObject({
      ok: { kind: 'resolved', selectable: true, credential: 'unavailable' },
    })
  }
})

it('reports unreadable custody distinctly from missing, revoked or incomplete credentials', async () => {
  const cases = [
    [{ kind: 'unreadable' }, 'unreadable'],
    [{ kind: 'revoked' }, 'missing'],
    [{ kind: 'incomplete', missing: ['apiKey'] }, 'missing'],
    [{ kind: 'missing' }, 'missing'],
  ] as const
  for (const [failure, expected] of cases) {
    const source = createOfficialProfileSource(
      { definitions: [definitionOf('alpha/route')], updatedAt: UPDATED_AT },
      () => ({
        layerOf: () => ({ failure }),
        resolve: () => {
          throw new Error('listing must not read secrets')
        },
      }),
    )
    const snapshot = await source.read({ principal, tenant: TENANT })
    expect(snapshot).toMatchObject({ ok: { candidates: [{ credential: expected }] } })
  }
})

function withPreferences(port: (() => ModelPreferencesPort | undefined) | undefined) {
  return createOfficialProfileSource(
    { definitions: ['on/route', 'off/route'].map(definitionOf), updatedAt: UPDATED_AT },
    undefined,
    port,
  )
}

const chosen = (enabled: readonly string[], efforts: readonly (readonly [string, 'high'])[] = []) =>
  ({
    async read() {
      return {
        ok: { enabled: { llm: new Set(enabled), decisions: new Set() }, efforts: new Map(efforts) },
      }
    },
  }) satisfies ModelPreferencesPort

it('marks a model the tenant has off as excluded and carries the default effort of one it has on', async () => {
  const read = await withPreferences(() => chosen(['on/route'], [['on/route', 'high']])).read({
    principal,
    tenant: TENANT,
  })
  if ('failure' in read) throw new Error(JSON.stringify(read.failure))
  expect(
    read.ok.candidates.map(candidate => [
      candidate.profile.identity.route,
      candidate.excluded,
      candidate.defaultReasoningEffort,
    ]),
  ).toEqual([
    ['on/route', false, 'high'],
    ['off/route', true, undefined],
  ])
})

it('answers unavailable when the preferences cannot be read, never all on or all off', async () => {
  const failing = await withPreferences(() => ({
    async read() {
      return { failure: { kind: 'unavailable' } } as const
    },
  })).read({ principal, tenant: TENANT })
  expect(failing).toMatchObject({ failure: { kind: 'unavailable' } })
  const throwing = await withPreferences(() => ({
    read: () => Promise.reject(new Error('settings are down')),
  })).read({ principal, tenant: TENANT })
  expect(throwing).toMatchObject({ failure: { kind: 'unavailable' } })
})

it('excludes nothing in a tree that has no preferences, as a source used on its own', async () => {
  for (const port of [undefined, () => undefined]) {
    const read = await withPreferences(port).read({ principal, tenant: TENANT })
    if ('failure' in read) throw new Error(JSON.stringify(read.failure))
    expect(read.ok.candidates.every(candidate => !candidate.excluded)).toBe(true)
  }
})

it('reads the preferences once per provider and with the access of the reader', async () => {
  const seen: unknown[] = []
  await withPreferences(() => ({
    async read(input) {
      seen.push(input)
      return {
        ok: { enabled: { llm: new Set(['on/route']), decisions: new Set() }, efforts: new Map() },
      }
    },
  })).read({ principal, tenant: TENANT })
  expect(seen).toEqual([{ provider: 'openrouter', access: { principal, tenant: TENANT } }])
})

it('gives a different source evidence once a model is turned off, so no decision outlives the switch', async () => {
  const on = await withPreferences(() => chosen(['on/route', 'off/route'])).read({
    principal,
    tenant: TENANT,
  })
  const off = await withPreferences(() => chosen(['on/route'])).read({ principal, tenant: TENANT })
  const effort = await withPreferences(() =>
    chosen(['on/route', 'off/route'], [['on/route', 'high']]),
  ).read({
    principal,
    tenant: TENANT,
  })
  if ('failure' in on || 'failure' in off || 'failure' in effort) throw new Error('read failed')
  expect(off.ok.source.digest).not.toBe(on.ok.source.digest)
  expect(effort.ok.source.digest).not.toBe(on.ok.source.digest)
  expect(on.ok.candidates[1]).not.toHaveProperty('defaultReasoningEffort')
  expect(on.ok.candidates.map(candidate => candidate.credential)).toEqual([
    'unavailable',
    'unavailable',
  ])
})

it('says the preferences were unreadable, as the dependency that failed', async () => {
  const read = await withPreferences(() => ({
    async read() {
      return { failure: { kind: 'unavailable' } } as const
    },
  })).read({ principal, tenant: TENANT })
  expect(read).toEqual({
    failure: { kind: 'unavailable', dependency: 'model-preferences', diagnostic: 'unreadable' },
  })
})

it('keeps a credential unavailable when custody denies it, cannot be asked, or is not there', async () => {
  const source = (port: (() => unknown) | undefined) =>
    createOfficialProfileSource(
      { definitions: [definitionOf('on/route')], updatedAt: UPDATED_AT },
      port as never,
    )
  const credentialWith = async (port: (() => unknown) | undefined) => {
    const read = await source(port).read({ principal, tenant: TENANT })
    if ('failure' in read) throw new Error('read failed')
    return read.ok.candidates[0]?.credential
  }
  const answering = (kind: string) => () => ({
    layerOf: () => ({ failure: { kind } }),
    resolve: () => ({ failure: { kind } }),
  })
  expect(await credentialWith(answering('denied'))).toBe('unavailable')
  expect(await credentialWith(answering('unavailable'))).toBe('unavailable')
  expect(await credentialWith(() => undefined)).toBe('unavailable')
  expect(
    await credentialWith(() => {
      throw new Error('custody is down')
    }),
  ).toBe('unavailable')
})

it('refuses to assemble an official profile that breaks the profile rules, naming its fields', () => {
  const bad = definitionOf('lab/no-image-limit')
  expect(() =>
    createOfficialProfileSource({ definitions: [{ ...bad, limits: [] }], updatedAt: UPDATED_AT }),
  ).toThrow('the official profile lab/no-image-limit breaks the profile rules: limits.image-bytes')
  const context = { ...bad.context, compactionTriggerPercent: '0' }
  expect(() =>
    createOfficialProfileSource({
      definitions: [{ ...bad, context, limits: [] }],
      updatedAt: UPDATED_AT,
    }),
  ).toThrow('rules: context.compactionTriggerPercent, limits.image-bytes')
  expect(() =>
    createOfficialProfileSource({
      definitions: [
        { ...bad, context: { ...bad.context, output: { provided: '1001', upstream: [] } } },
      ],
      updatedAt: UPDATED_AT,
    }),
  ).toThrow('context.output')
})

it('assembles every official profile of the release: each keeps the profile rules', () => {
  const definitions = officialProfiles({ retryPolicy: RETRY, compactionTriggerPercent: '80' })
  expect(definitions.map(profileProblems).filter(problems => problems.length > 0)).toEqual([])
  expect(() => createOfficialProfileSource({ definitions, updatedAt: UPDATED_AT })).not.toThrow()
})
