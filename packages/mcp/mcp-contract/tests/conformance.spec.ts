import { AssertionError } from 'node:assert'
import { describe, expect, it } from 'vitest'
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  isConnectionTarget,
  isCredentialBinding,
  isEndpointHolding,
  isEndpointName,
  mergeListing,
  type CatalogKey,
  type ConnectionTarget,
  type CredentialBinding,
  type EndpointRef,
} from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CatalogStore,
  ProcessLanding,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import {
  createMemoryAdoptionView,
  createMemoryCatalogStore,
  createMemoryCredentialUse,
  createMemoryProcessLanding,
  createMemoryUseEligibility,
  mcpAdoptionViewConformance,
  mcpCatalogStoreConformance,
  mcpCredentialUseConformance,
  mcpProcessLandingConformance,
  mcpUseEligibilityConformance,
  mergeListingCases,
  runConformanceCase,
  type AdoptionViewFixture,
  type CatalogStoreFixture,
  type ConformanceCase,
  type CredentialUseFixture,
  type ProcessLandingFixture,
  type UseEligibilityFixture,
} from '@omne-harness/mcp-contract/testing'
import { json } from './json.ts'

type Principal = Readonly<{ id: string }>

function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new Error('bad tenant')
  return tenant(organization.value, account.value)
}

function ref(name: string, holding = `tenant/${name}`): EndpointRef {
  if (!isEndpointName(name) || !isEndpointHolding(holding)) throw new Error('bad ref')
  return { name, holding }
}

function binding(text: string): CredentialBinding {
  if (!isCredentialBinding(text)) throw new Error('bad binding')
  return text
}

function target(text: string): ConnectionTarget {
  if (!isConnectionTarget(text)) throw new Error('bad target')
  return text
}

const home = tenantOf('s')
const away = tenantOf('t')
const alice: Access<Principal> = access({ id: 'alice' }, home)
const bob: Access<Principal> = access({ id: 'bob' }, home)
const mallory: Access<Principal> = access({ id: 'mallory' }, away)
const principalKey = (principal: Principal) => principal.id

/** Runs every case of a suite on a fresh fixture, as a consumer registers them. */
function register<F>(suite: readonly ConformanceCase<F>[], fixture: () => F): void {
  for (const conformance of suite)
    it(`${conformance.clause} ${conformance.name}`, async () => {
      // A case that is not applicable fails here: the memory doubles offer every handle.
      expect(await runConformanceCase(conformance, fixture())).toEqual({ kind: 'passed' })
    })
}

/** The names of the cases that fail on the fixture. */
async function failing<F>(suite: readonly ConformanceCase<F>[], fixture: () => F) {
  const names: string[] = []
  for (const conformance of suite)
    try {
      await conformance.run(fixture())
    } catch (error) {
      if (!(error instanceof AssertionError)) throw error
      names.push(conformance.name)
    }
  return names
}

function eligibilityFixture(
  wrap: (port: UseEligibility<Principal>) => UseEligibility<Principal> = port => port,
): UseEligibilityFixture<Principal> {
  const memory = createMemoryUseEligibility<Principal>({ principalKey })
  memory.grant(alice, ref('files'))
  memory.block(alice, ref('shell'), 'local-command-not-enabled')
  memory.grant(alice, ref('unclear'))
  memory.setUnreadable(alice, ref('unclear'), true)
  return {
    port: wrap(memory),
    eligible: { access: alice, endpoint: ref('files') },
    ineligible: { access: bob, existing: ref('files'), missing: ref('nowhere') },
    blocked: { access: alice, endpoint: ref('shell'), reason: 'local-command-not-enabled' },
    revoke: async () => memory.revoke(alice, ref('files')),
    unreadable: { access: alice, endpoint: ref('unclear') },
  }
}

function adoptionFixture(
  wrap: (port: AdoptionView<Principal, string>) => AdoptionView<Principal, string> = port => port,
): AdoptionViewFixture<Principal, string> {
  const memory = createMemoryAdoptionView<Principal, string>({ scopeKey: scope => scope })
  const body = json({ name: 'files', transport: 'streamable-http', auth: 'oauth' })
  memory.adopt({
    tenant: home,
    scope: 'workspace-1',
    ref: ref('files'),
    body,
    settings: {
      target: { kind: 'value', value: target('https://files.example.test/mcp') },
      credential: { kind: 'value', value: binding('main') },
      connectTimeout: { kind: 'absent' },
    },
  })
  memory.adopt({ tenant: home, scope: 'workspace-2', ref: ref('other'), body })
  memory.adopt({ tenant: home, scope: 'workspace-1', ref: ref('retired'), body })
  memory.withdraw(home, ref('retired'))
  return {
    port: wrap(memory),
    scope: 'workspace-1',
    reader: alice,
    adopted: ref('files'),
    notAdopted: ref('retired'),
    elsewhere: ref('other'),
    outsider: { access: mallory, missing: ref('nowhere') },
    change: async () => {
      memory.update(home, ref('files'), {
        settings: {
          target: { kind: 'value', value: target('https://files.example.test/mcp') },
          credential: { kind: 'value', value: binding('second') },
          connectTimeout: { kind: 'absent' },
        },
      })
    },
    unreadable: async () => memory.setUnreadable(true),
  }
}

function credentialFixture(): CredentialUseFixture<Principal> {
  const memory = createMemoryCredentialUse<Principal>()
  memory.store({
    tenant: home,
    holding: ref('files').holding,
    binding: binding('main'),
    secret: 's3cr3t-value',
  })
  memory.store({
    tenant: home,
    holding: ref('files').holding,
    binding: binding('old'),
    secret: 'old-value',
  })
  memory.reject(home, binding('old'))
  memory.store({
    tenant: home,
    holding: ref('files').holding,
    binding: binding('flaky'),
    secret: 'f',
  })
  memory.setUnreadable(home, binding('flaky'), true)
  return {
    port: memory,
    access: alice,
    holding: ref('files').holding,
    binding: binding('main'),
    secret: 's3cr3t-value',
    target: target('https://files.example.test/mcp'),
    missing: binding('absent'),
    otherTenant: mallory,
    otherHolding: ref('search').holding,
    rejected: binding('old'),
    unreadable: binding('flaky'),
  }
}

function landingFixture(
  wrap: (port: ProcessLanding<Principal>) => ProcessLanding<Principal> = port => port,
): ProcessLandingFixture<Principal> {
  const credentials = createMemoryCredentialUse<Principal>()
  credentials.store({
    tenant: home,
    holding: ref('files').holding,
    binding: binding('main'),
    secret: 'tok-123',
  })
  const landing = createMemoryProcessLanding<Principal>({
    facilities: ['network'],
    refusedCommands: ['/not/here'],
  })
  return {
    port: wrap(landing),
    access: alice,
    launch: {
      command: '/usr/bin/files-server',
      args: [],
      env: [{ name: 'FILES_TOKEN', source: 'credential' }],
      facilities: ['network'],
    },
    credential: async () => {
      const acquired = await credentials.acquire(
        alice,
        ref('files').holding,
        { kind: 'process-env' },
        binding('main'),
      )
      if ('failure' in acquired) throw new Error(acquired.failure)
      return acquired.ok
    },
    secret: 'tok-123',
    missingFacility: { command: '/usr/bin/files-server', args: [], env: [], facilities: ['gpu'] },
    invalidLanding: { command: '/not/here', args: [], env: [], facilities: [] },
  }
}

function key(tenantId: TenantId, holding: string): CatalogKey {
  return {
    tenant: tenantId,
    account: { kind: 'anonymous' },
    holding: ref('files', holding).holding,
  }
}

function storeFixture(
  wrap: (store: CatalogStore) => CatalogStore = store => store,
): CatalogStoreFixture {
  const memory = createMemoryCatalogStore()
  return {
    store: wrap(memory),
    key: key(home, 'tenant/files'),
    otherKeys: [key(away, 'tenant/files'), key(home, 'tenant/other')],
    unavailable: async () => memory.setUnavailable(true),
  }
}

describe('UseEligibility conformance on the memory double', () => {
  register(mcpUseEligibilityConformance<Principal>(), () => eligibilityFixture())
})

describe('AdoptionView conformance on the memory double', () => {
  register(mcpAdoptionViewConformance<Principal, string>(), () => adoptionFixture())
})

describe('CredentialUse conformance on the memory double', () => {
  register(mcpCredentialUseConformance<Principal>(), credentialFixture)
})

describe('ProcessLanding conformance on the memory double', () => {
  register(mcpProcessLandingConformance<Principal>(), () => landingFixture())
})

describe('CatalogStore conformance on the memory double', () => {
  register(mcpCatalogStoreConformance(), () => storeFixture())
})

describe('the suites fail a port that breaks the contract', () => {
  it('ProcessLanding: a second stop that confirms less than the first', async () => {
    const forgetful = (port: ProcessLanding<Principal>): ProcessLanding<Principal> => ({
      start: async (who, launch, env) => {
        const started = await port.start(who, launch, env)
        if ('failure' in started) return started
        let stops = 0
        const process = started.ok
        return {
          ok: {
            stdin: process.stdin,
            stdout: process.stdout,
            stderr: process.stderr,
            exited: process.exited,
            stop: async () => {
              stops += 1
              const scope = await process.stop()
              return stops > 1 ? 'unconfirmed' : scope
            },
          },
        }
      },
    })
    expect(
      await failing(mcpProcessLandingConformance<Principal>(), () => landingFixture(forgetful)),
    ).toEqual(['answers a repeated stop without a smaller range'])
  })

  it('UseEligibility: an answer that differs for a missing endpoint discloses existence', async () => {
    const leaky = (port: UseEligibility<Principal>): UseEligibility<Principal> => ({
      check: async (who, endpoint) =>
        endpoint.name === 'nowhere' ? { kind: 'unknown' } : port.check(who, endpoint),
    })
    expect(
      await failing(mcpUseEligibilityConformance<Principal>(), () => eligibilityFixture(leaky)),
    ).toEqual(['answers an ineligible principal the same for an existing and a missing endpoint'])
  })

  it('AdoptionView: an answer that differs for a missing endpoint discloses existence', async () => {
    const leaky = (port: AdoptionView<Principal, string>): AdoptionView<Principal, string> => ({
      endpoints: (who, scope) => port.endpoints(who, scope),
      endpoint: async (who, endpoint) =>
        endpoint.name === 'nowhere' ? { failure: 'unknown' } : port.endpoint(who, endpoint),
    })
    expect(
      await failing(mcpAdoptionViewConformance<Principal, string>(), () => adoptionFixture(leaky)),
    ).toEqual(['answers an outsider the same for an adopted and a missing endpoint'])
  })

  it('CatalogStore: a store that ignores the expected revision fails the conflict cases', async () => {
    const lax = (store: CatalogStore): CatalogStore => ({
      read: target => store.read(target),
      write: async (target, record) => {
        const current = await store.read(target)
        const expected = 'ok' in current && current.ok !== 'absent' ? current.ok.revision : 'absent'
        return store.write(target, record, expected)
      },
    })
    expect(await failing(mcpCatalogStoreConformance(), () => storeFixture(lax))).toEqual([
      'refuses a write that expects a revision for a key never written',
      'refuses a write that expects absent when a record exists, and keeps the record',
      'refuses a write based on an older revision, and keeps the newer record',
    ])
  })
})

describe('the memory UseEligibility double', () => {
  it('keeps an ungranted principal not eligible after its unreadable flag is cleared', async () => {
    const memory = createMemoryUseEligibility<Principal>({ principalKey })
    memory.setUnreadable(bob, ref('files'), true)
    expect(await memory.check(bob, ref('files'))).toEqual({ kind: 'unknown' })
    memory.setUnreadable(bob, ref('files'), false)
    expect(await memory.check(bob, ref('files'))).toEqual({
      kind: 'refused',
      reason: 'not-eligible',
    })
  })
})

describe('mergeListing over the exhaustive case table', () => {
  for (const sample of mergeListingCases)
    it(sample.name, () => {
      expect(mergeListing(sample.current, sample.listing)).toStrictEqual(sample.expected)
    })
})
