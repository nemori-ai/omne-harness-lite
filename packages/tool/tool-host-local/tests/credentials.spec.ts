import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ToolCredentialFailure,
  ToolCredentialRequest,
  ToolCredentialUsage,
} from '@omne-harness/tool-contract/provider'
import { toolCredentialsConformance, runConformanceCase } from '@omne-harness/tool-contract/testing'
import {
  createLocalToolCredentials,
  type ToolCredentialCapability,
  type ToolCredentialReferences,
} from '@omne-harness/tool-host-local'
import { describe, expect, it } from 'vitest'
import { callAccess, request, tenantA, tenantB, type Principal } from './coordinator-values.ts'

function fixture() {
  const fixed = request()
  const input: ToolCredentialRequest<Principal> = {
    ...callAccess('original-call'),
    tenant: tenantA,
    request: fixed,
    usage: {
      adoption: fixed.availability.definition.adoption,
      purpose: 'send',
      target: 'https://example.test',
    },
  }
  // This map is the backing secret store. Its values do not come from resolve's input.
  let stored: ToolCredentialUsage & { tenant: TenantId } = { ...input.usage, tenant: tenantA }
  let failure: ToolCredentialFailure | null = null
  let allowed = true
  let uses = 0
  let selected = 'tenant'
  let unavailableSource: string | null = null
  const sources: string[] = []
  const reads: string[] = []
  const references: ToolCredentialReferences<Principal> = {
    read: async ({ source }) => {
      sources.push(source.kind)
      if (source.kind === unavailableSource)
        return fail({ kind: 'unavailable', dependency: 'settings', diagnostic: 'offline' })
      return succeed(
        source.kind === selected
          ? { kind: 'configured', reference: 'secret-1' }
          : { kind: 'unconfigured' },
      )
    },
  }
  const ports = {
    access: {
      qualify: async (attempt: ToolCredentialRequest<Principal>) =>
        allowed && attempt.call === input.call && attempt.principal.subject === 'alice'
          ? succeed(undefined)
          : fail({ kind: 'denied' as const, action: 'credentials' }),
    },
    references,
    secrets: {
      resolve: async ({ reference }: { reference: string }) => {
        reads.push(reference)
        return failure
          ? fail(failure)
          : succeed({
              binding: stored,
              capability: {
                send: () => {
                  uses += 1
                  return 'sent'
                },
              },
            })
      },
    },
  }
  const credentials = createLocalToolCredentials(ports)
  return {
    credentials,
    ports,
    request: input,
    otherTenant: tenantB,
    replaceBinding: (binding: typeof stored) => {
      stored = binding
    },
    failSelected: (value: ToolCredentialFailure) => {
      failure = value
    },
    sourcesRead: () => sources,
    uses: () => uses,
    use: (capability: ToolCredentialCapability<{ send(): string }>) =>
      capability.use(async secret => secret.send()),
    revoke: () => {
      allowed = false
    },
    select: (source: string) => {
      selected = source
    },
    unavailableSource: (source: string) => {
      unavailableSource = source
    },
    reads,
  }
}

describe('ToolCredentials actual binding conformance over a local secret-store double', () => {
  const names = [
    'a matching secret can perform the restricted action',
    ...[
      'tenant',
      'adoption.owner',
      'adoption.name',
      'adoption.revision',
      'adoption.digest',
      'purpose',
      'target',
    ].flatMap(field => [
      `rejects actual ${field} mismatch at resolution`,
      `rechecks actual ${field} binding at protected use`,
    ]),
    ...['missing', 'denied', 'invalid', 'unavailable'].map(
      kind => `a selected ${kind} secret terminates without fallback`,
    ),
  ]
  it.each(names)('%s', async name => {
    const cases = toolCredentialsConformance<
      Principal,
      ToolCredentialCapability<{ send(): string }>
    >()
    expect(cases.map(test => test.name)).toEqual(names)
    const test = cases.find(test => test.name === name)
    if (!test) throw new Error('missing credential case')
    expect(await runConformanceCase(test, fixture())).toEqual({ kind: 'passed' })
  })
})

it.each(['organization', 'official', 'none'])(
  'only an unconfigured source permits selecting %s',
  async source => {
    const f = fixture()
    f.select(source)
    const answer = await f.credentials.resolve(f.request)
    expect(f.sourcesRead()).toEqual(
      source === 'organization'
        ? ['tenant', 'organization']
        : ['tenant', 'organization', 'official'],
    )
    expect(source === 'none' ? 'failure' in answer && answer.failure.kind : 'ok' in answer).toBe(
      source === 'none' ? 'missing' : true,
    )
  },
)

it('stops at an unreadable settings source without consulting the vault', async () => {
  const f = fixture()
  f.select('official')
  f.unavailableSource('organization')
  expect(await f.credentials.resolve(f.request)).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(f.sourcesRead()).toEqual(['tenant', 'organization'])
  expect(f.reads).toEqual([])
})

it('organization configuration does not authorize another tenant secret', async () => {
  const f = fixture()
  f.select('organization')
  f.replaceBinding({ ...f.request.usage, tenant: tenantB })
  expect(await f.credentials.resolve(f.request)).toMatchObject({
    failure: { kind: 'invalid', field: 'binding.tenant' },
  })
  expect(f.uses()).toBe(0)
})

it('rechecks current qualification and the fixed original call before a protected use', async () => {
  const f = fixture()
  const capability = await f.credentials.resolve(f.request)
  if ('failure' in capability) throw new Error('fixture resolve failed')
  f.revoke()
  expect(await f.use(capability.ok)).toMatchObject({ failure: { kind: 'denied' } })
  expect(f.uses()).toBe(0)
})

it('uses the original selected reference after configuration changes and never falls back on revocation', async () => {
  const f = fixture()
  const capability = await f.credentials.resolve(f.request)
  if ('failure' in capability) throw new Error('fixture resolve failed')
  f.select('official')
  f.failSelected({ kind: 'missing' })
  expect(await f.use(capability.ok)).toEqual({ failure: { kind: 'missing' } })
  expect(f.sourcesRead()).toEqual(['tenant'])
  expect(f.reads).toEqual(['secret-1', 'secret-1'])
})

it('a missing provider is unavailable and a mismatched requested adoption is invalid before selecting', async () => {
  const f = fixture()
  expect(
    await createLocalToolCredentials({ ...f.ports, secrets: null }).resolve(f.request),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
  const g = fixture()
  expect(
    await g.credentials.resolve({
      ...g.request,
      usage: { ...g.request.usage, adoption: { ...g.request.usage.adoption, digest: 'wrong' } },
    }),
  ).toMatchObject({ failure: { kind: 'invalid' } })
  expect(g.sourcesRead()).toEqual([])
})

it('the conformance suite rejects a provider that echoes usage instead of checking stored bindings', async () => {
  const cases = toolCredentialsConformance<
    Principal,
    ToolCredentialCapability<{ send(): string }>
  >()
  for (const test of cases.filter(test => test.name.includes('mismatch at resolution'))) {
    const f = fixture()
    const echo = createLocalToolCredentials({
      ...f.ports,
      secrets: {
        resolve: async (input: ToolCredentialRequest<Principal>) =>
          succeed({
            binding: { tenant: input.tenant, ...input.usage },
            capability: { send: () => 'sent' },
          }),
      },
    })
    await expect(runConformanceCase(test, { ...f, credentials: echo })).rejects.toThrow()
  }
})

it('missing identity and a different original call are refused before secret lookup', async () => {
  const f = fixture()
  expect(await f.credentials.resolve({ ...f.request, tenant: undefined as never })).toMatchObject({
    failure: { kind: 'denied' },
  })
  expect(
    await f.credentials.resolve({ ...f.request, call: callAccess('different-call').call }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(f.reads).toEqual([])
})

it.each(['owner', 'name', 'revision', 'digest'] as const)(
  'rejects requested adoption %s before lookup even when other adoption fields match',
  async field => {
    const f = fixture()
    expect(
      await f.credentials.resolve({
        ...f.request,
        usage: {
          ...f.request.usage,
          adoption: { ...f.request.usage.adoption, [field]: 'foreign' },
        },
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'usage.adoption', reason: 'credential binding mismatch' },
    })
    expect(f.sourcesRead()).toEqual([])
    expect(f.reads).toEqual([])
    expect(f.uses()).toBe(0)
  },
)

it.each(['call', 'request', 'purpose', 'target'] as const)(
  'rejects malformed credential %s before source selection',
  async field => {
    const f = fixture()
    const input = { ...f.request, usage: { ...f.request.usage } }
    if (field === 'call') Reflect.set(input, 'call', '')
    else if (field === 'request') Reflect.set(input, 'request', {})
    else Reflect.set(input.usage, field, '  ')
    expect(await f.credentials.resolve(input)).toHaveProperty('failure.kind', 'invalid')
    expect(f.sourcesRead()).toEqual([])
    expect(f.reads).toEqual([])
    expect(f.uses()).toBe(0)
  },
)

it.each(['', null] as const)(
  'rejects malformed configured reference %s without trying another source',
  async reference => {
    const f = fixture()
    const sources: string[] = []
    const credentials = createLocalToolCredentials({
      ...f.ports,
      references: {
        read: async input => {
          sources.push(input.source.kind)
          const selected = { kind: 'configured' as const, reference: '' }
          Reflect.set(selected, 'reference', reference)
          return succeed(selected)
        },
      },
    })
    expect(await credentials.resolve(f.request)).toEqual({
      failure: { kind: 'invalid', field: 'reference', reason: 'credential binding mismatch' },
    })
    expect(sources).toEqual(['tenant'])
    expect(f.reads).toEqual([])
    expect(f.uses()).toBe(0)
  },
)
