import { AssertionError } from 'node:assert/strict'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ToolCredentialFailure,
  ToolCredentialRequest,
  ToolCredentialUsage,
} from '@omne-harness/tool-contract/provider'
import {
  toolCredentialsConformance,
  runConformanceCase,
  type ToolCredentialEscapeExit,
} from '@omne-harness/tool-contract/testing'
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
  let revocationFailure: Error | null = null
  let revocations = 0
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
      // Each resolution hands out a capability that the store can revoke: after `revoke`, `send`
      // refuses instead of acting, which is the store's obligation under P15.
      resolve: async ({ reference }: { reference: string }) => {
        reads.push(reference)
        if (failure) return fail(failure)
        let revoked = false
        return succeed({
          binding: stored,
          capability: {
            send: () => {
              if (revoked) throw new Error('capability revoked')
              uses += 1
              return 'sent'
            },
          },
          revoke: () => {
            if (revocationFailure) throw revocationFailure
            revoked = true
            revocations += 1
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
    escape: async (
      capability: ToolCredentialCapability<{ send(): string }>,
      exit: ToolCredentialEscapeExit,
    ) => {
      let kept: { send(): string } | null = null
      const ended: unknown = await capability
        .use(async raw => {
          kept = raw
          if (exit.kind === 'throw') throw exit.error
          return raw
        })
        .then(
          value => value,
          (error: unknown) => error,
        )
      return {
        ended,
        retry: async () => {
          try {
            kept?.send()
          } catch {
            // A refused action is the expected end of an escaped capability.
          }
        },
      }
    },
    failRevocation: () => {
      revocationFailure = new Error('the secret store could not revoke the capability')
      return revocationFailure
    },
    revocations: () => revocations,
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
    'a capability returned out of a use cannot act after the use ended',
    'a capability thrown out of a use cannot act after the use ended',
    'a failed revocation after a successful action is not reported as success',
    'a failed revocation after a failed action keeps both errors',
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
            revoke: () => {},
          }),
      },
    })
    // Only an assertion of the suite counts as a detected breach; a crash is not a detection.
    await expect(runConformanceCase(test, { ...f, credentials: echo })).rejects.toThrow(
      AssertionError,
    )
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

// The #675 round-2 QA counterexample (`rawObjectEscaped=true`, `actionsAfterRevocation=1`): the
// action of a protected use hands the raw capability out; after revocation the escaped object
// must no longer perform the restricted action.
it('J56: a capability that escaped through the return of a use cannot act after the use ended', async () => {
  const f = fixture()
  const capability = await f.credentials.resolve(f.request)
  if ('failure' in capability) throw new Error('fixture resolve failed')
  const escaped = await capability.ok.use(async raw => raw)
  if ('failure' in escaped) throw new Error('fixture use failed')
  f.revoke()
  expect(await f.use(capability.ok)).toMatchObject({ failure: { kind: 'denied' } })
  let acted = false
  try {
    escaped.ok.send()
    acted = true
  } catch {
    acted = false
  }
  expect(acted).toBe(false)
  expect(f.uses()).toBe(0)
})

it('revokes the capability obtained to prove the binding at resolution and at a mismatched recheck', async () => {
  const f = fixture()
  const capability = await f.credentials.resolve(f.request)
  if ('failure' in capability) throw new Error('fixture resolve failed')
  expect(f.revocations()).toBe(1)
  expect(f.uses()).toBe(0)
  expect(await f.use(capability.ok)).toEqual({ ok: 'sent' })
  expect(f.revocations()).toBe(2)
  f.replaceBinding({ ...f.request.usage, tenant: tenantB })
  expect(await f.use(capability.ok)).toMatchObject({
    failure: { kind: 'invalid', field: 'binding.tenant' },
  })
  expect(f.revocations()).toBe(3)
  expect(f.uses()).toBe(1)
})

it('a secret store that resolves without a revocation handle is unavailable and never hands the capability out', async () => {
  const f = fixture()
  let handed = 0
  const credentials = createLocalToolCredentials({
    ...f.ports,
    secrets: {
      resolve: async () =>
        succeed({
          binding: { ...f.request.usage, tenant: tenantA },
          capability: {
            send: () => {
              handed += 1
              return 'sent'
            },
          },
          revoke: undefined as never,
        }),
    },
  })
  expect(await credentials.resolve(f.request)).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'tool-credential-secrets',
      diagnostic: 'credential provider unavailable',
    },
  })
  expect(handed).toBe(0)
})

it('a failed revocation of the resolution-time capability rejects the resolution', async () => {
  const f = fixture()
  const revocation = f.failRevocation()
  await expect(f.credentials.resolve(f.request)).rejects.toBe(revocation)
  expect(f.uses()).toBe(0)
})
