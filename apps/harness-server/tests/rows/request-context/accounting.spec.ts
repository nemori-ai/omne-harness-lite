// The accounting ports of the `request-context` row (SC2): the narrow source authority, the read
// eligibility over the registered holder sources, and the two gaps that stay. The principal binding
// is the release one (`createPrincipalBinding` over a real in-process verifier); the inbox is the
// real `createContextAccounting` of the member, so the order of its checks is the member's own.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inProcessPrincipalAuthority, type Principal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import { decodeDispatchId, decodeModelCallId } from '@omne-harness/model-contract'
import { createContextAccounting } from '@omne-harness/request-context'
import type {
  Access,
  Adoption,
  ContextReadEligibility,
  ContextTarget,
  ReceivedAccountFact,
} from '@omne-harness/request-context-contract'
import type { ContextHolderSources } from '@omne-harness/request-context-cordis-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { createPrincipalBinding } from '../../../src/entry/request-context-trust.ts'
import {
  ACCOUNT_OUTLET_SENDER,
  ACCOUNTING_DENIALS,
  ACCOUNTING_GAPS,
  createHolderReadEligibility,
  createOutletSourceAuthority,
  releaseAccounting,
} from '../../../src/rows/request-context/accounting.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

const tenantA = fixtureTenant('a')
const tenantB = fixtureTenant('b')

function must<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error('fixture: a value was refused')
  return value.ok
}
const scope = must(decodeScopeRef({ ref: `session-scope:${'a'.repeat(64)}` }))
const targetOf = (tenant: TenantId): ContextTarget => ({ tenant, scope })
const call = must(decodeModelCallId('mcall_one'))
const dispatch = must(decodeDispatchId('mdisp_one'))

function fact(
  options: Readonly<{ sender?: Adoption; target?: TenantId; call?: TenantId }> = {},
): ReceivedAccountFact {
  return {
    kind: 'account',
    origin: { producer: 'model', sender: options.sender ?? ACCOUNT_OUTLET_SENDER, resultVersion: null },
    target: targetOf(options.target ?? tenantA),
    call: { tenant: options.call ?? tenantA, call },
    dispatch,
    account: {
      subject: { kind: 'model_call', id: call },
      usage: [{ name: 'input', state: 'known', lexeme: '700', unit: 'token' }],
      cost: [],
      trimmed: { state: 'unknown', unit: 'token' },
      place: 'provider-a',
      duration: { state: 'unknown' },
      receipt: 'received',
      revision: '0',
    },
    committed: { owner: 'test', record: 'r', revision: '1', digest: 'd' },
  }
}

/** A real verifier and the release principal binding over it, with one acting principal per tenant. */
function principals() {
  const authority = inProcessPrincipalAuthority()
  const actor = okOf(authority.issuer.issueSystem({ component: 'agent-host' }), 'actor')
  const acting = (tenant: TenantId): Principal =>
    okOf(
      authority.issuer.issueActingForTenant({
        actor,
        tenant,
        work: { owner: 'agent', work: 'exe_1' },
      }),
      'acting',
    )
  return { binding: createPrincipalBinding({ verifier: authority.verifier }), acting }
}

function authorityUnderTest() {
  const { binding, acting } = principals()
  const diagnostics: string[] = []
  const authority = createOutletSourceAuthority({
    principalBinding: binding,
    sender: ACCOUNT_OUTLET_SENDER,
    diagnose: text => diagnostics.push(text),
  })
  return { authority, acting, diagnostics }
}

describe('the source authority: only the configured agent-account-outlet sender', () => {
  it('allows the configured sender for a verified principal of the same tenant', async () => {
    const { authority, acting, diagnostics } = authorityUnderTest()
    const access: Access<unknown> = { principal: acting(tenantA), tenant: tenantA }
    await expect(authority.check({ access, input: fact() })).resolves.toEqual({ kind: 'allowed' })
    expect(diagnostics).toEqual([])
  })

  it.each([
    ['owner', { ...ACCOUNT_OUTLET_SENDER, owner: '@omne-harness/other' }],
    ['name', { ...ACCOUNT_OUTLET_SENDER, name: 'other' }],
    ['revision', { ...ACCOUNT_OUTLET_SENDER, revision: '2' }],
    ['digest', { ...ACCOUNT_OUTLET_SENDER, digest: 'agent-context:account-outlet/2' }],
  ])('denies a sender that differs in %s, with the sender diagnostic', async (_field, sender) => {
    const { authority, acting, diagnostics } = authorityUnderTest()
    const access: Access<unknown> = { principal: acting(tenantA), tenant: tenantA }
    await expect(authority.check({ access, input: fact({ sender }) })).resolves.toEqual({
      kind: 'denied',
    })
    expect(diagnostics).toEqual([ACCOUNTING_DENIALS.sender])
  })

  it('denies a producer that is not model, even with the configured sender', async () => {
    const { authority, acting } = authorityUnderTest()
    const access: Access<unknown> = { principal: acting(tenantA), tenant: tenantA }
    const input = { ...fact(), origin: { ...fact().origin, producer: 'tool' } } as never
    await expect(authority.check({ access, input })).resolves.toEqual({ kind: 'denied' })
  })

  it.each([
    ['the target', { target: tenantB }],
    ['the call', { call: tenantB }],
  ])('denies when %s belongs to another tenant than the access', async (_what, tenants) => {
    const { authority, acting, diagnostics } = authorityUnderTest()
    const access: Access<unknown> = { principal: acting(tenantA), tenant: tenantA }
    await expect(authority.check({ access, input: fact(tenants) })).resolves.toEqual({
      kind: 'denied',
    })
    expect(diagnostics).toEqual([ACCOUNTING_DENIALS.tenant])
  })

  it('denies a principal of another tenant, and a forged or non-principal value', async () => {
    const { authority, acting, diagnostics } = authorityUnderTest()
    const foreign: Access<unknown> = { principal: acting(tenantB), tenant: tenantA }
    const forged: Access<unknown> = {
      principal: JSON.parse(JSON.stringify(acting(tenantA))) as unknown,
      tenant: tenantA,
    }
    const text: Access<unknown> = { principal: 'agent-host', tenant: tenantA }
    for (const access of [foreign, forged, text])
      await expect(authority.check({ access, input: fact() })).resolves.toEqual({
        kind: 'denied',
      })
    expect(diagnostics).toEqual([
      ACCOUNTING_DENIALS.principal,
      ACCOUNTING_DENIALS.principal,
      ACCOUNTING_DENIALS.principal,
    ])
  })

  it('keeps an unavailable or throwing principal binding unavailable, never denied or allowed', async () => {
    const down = createOutletSourceAuthority({
      principalBinding: { key: async () => ({ kind: 'unavailable', diagnostic: 'verifier down' }) },
      sender: ACCOUNT_OUTLET_SENDER,
      diagnose: () => undefined,
    })
    const throwing = createOutletSourceAuthority({
      principalBinding: { key: () => Promise.reject(new Error('secret')) },
      sender: ACCOUNT_OUTLET_SENDER,
      diagnose: () => undefined,
    })
    const access: Access<unknown> = { principal: 'p', tenant: tenantA }
    const first = await down.check({ access, input: fact() })
    const second = await throwing.check({ access, input: fact() })
    expect([first.kind, second.kind]).toEqual(['unavailable', 'unavailable'])
    expect(JSON.stringify(second)).not.toContain('secret')
  })
})

type Probe = { leases: number; releases: number }

/** A holder that lends one eligibility part and counts its leases. */
function holderWith(eligibility: ContextReadEligibility<unknown>, probe: Probe) {
  const holder: ContextHolderSources<unknown> = {
    lease: () => {
      probe.leases += 1
      return {
        kind: 'leased',
        lease: {
          parts: { eligibility } as never,
          release: () => {
            probe.releases += 1
          },
        },
      }
    },
  }
  return holder
}

const allowed = { kind: 'allowed', revision: 'rev-1' } as never

describe('the read eligibility: the eligibility part of the registered holder sources', () => {
  const access: Access<unknown> = { principal: 'p', tenant: tenantA }
  const read = { access, target: targetOf(tenantA), operation: 'accounts' as const }

  it('answers what the holder eligibility answers, and ends its lease', async () => {
    const probe: Probe = { leases: 0, releases: 0 }
    const diagnostics: string[] = []
    const seen: unknown[] = []
    const port = createHolderReadEligibility({
      readHolder: () =>
        holderWith(
          {
            check: async input => {
              seen.push(input)
              return allowed
            },
          },
          probe,
        ),
      diagnose: text => diagnostics.push(text),
    })
    await expect(port.check(read)).resolves.toEqual(allowed)
    expect(seen).toEqual([read])
    expect(probe).toEqual({ leases: 1, releases: 1 })
    expect(diagnostics).toEqual([])
  })

  it('keeps a denied of the holder denied, with the eligibility diagnostic', async () => {
    const probe: Probe = { leases: 0, releases: 0 }
    const diagnostics: string[] = []
    const port = createHolderReadEligibility({
      readHolder: () => holderWith({ check: async () => ({ kind: 'denied' }) }, probe),
      diagnose: text => diagnostics.push(text),
    })
    await expect(port.check(read)).resolves.toEqual({ kind: 'denied' })
    expect(diagnostics).toEqual([ACCOUNTING_DENIALS.eligibility])
    expect(probe).toEqual({ leases: 1, releases: 1 })
  })

  it('denies every operation other than accounts without asking the holder', async () => {
    const probe: Probe = { leases: 0, releases: 0 }
    const port = createHolderReadEligibility({
      readHolder: () => holderWith({ check: async () => allowed }, probe),
      diagnose: () => undefined,
    })
    for (const operation of ['history', 'conversions', 'assembly'] as const)
      await expect(port.check({ ...read, operation })).resolves.toEqual({ kind: 'denied' })
    expect(probe.leases).toBe(0)
  })

  it('is unavailable with no holder, a refused lease, or a throwing eligibility (the lease still ends)', async () => {
    const probe: Probe = { leases: 0, releases: 0 }
    const none = createHolderReadEligibility({ readHolder: () => undefined, diagnose: () => {} })
    const closing = createHolderReadEligibility({
      readHolder: () => ({ lease: () => ({ kind: 'unavailable', diagnostic: 'closing' }) }),
      diagnose: () => {},
    })
    const throwing = createHolderReadEligibility({
      readHolder: () => holderWith({ check: () => Promise.reject(new Error('x')) }, probe),
      diagnose: () => {},
    })
    for (const port of [none, closing, throwing])
      expect((await port.check(read)).kind).toBe('unavailable')
    expect(probe).toEqual({ leases: 1, releases: 1 })
  })
})

describe('the release accounting options on the real inbox', () => {
  function inbox(eligibility: ContextReadEligibility<unknown>) {
    const { binding, acting } = principals()
    const options = releaseAccounting(
      { maxTargets: 4, maxFactsPerTarget: 8, maxRevisionsPerDispatch: 4 },
      { principalBinding: binding, readHolder: () => holderWith(eligibility, { leases: 0, releases: 0 }), diagnose: () => {} },
    )
    return { inbox: createContextAccounting(options).inbox, acting }
  }

  it('the configured sender passes the source authority and stops at the uninitialized projection', async () => {
    const { inbox: subject, acting } = inbox({ check: async () => allowed })
    const access: Access<unknown> = { principal: acting(tenantA), tenant: tenantA }
    await expect(subject.receive({ access, input: fact() })).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'uninitialized',
    })
  })

  it('another sender is denied before the projection is looked at', async () => {
    const { inbox: subject, acting } = inbox({ check: async () => allowed })
    const access: Access<unknown> = { principal: acting(tenantA), tenant: tenantA }
    const sender = { ...ACCOUNT_OUTLET_SENDER, name: 'forged' }
    await expect(subject.receive({ access, input: fact({ sender }) })).resolves.toEqual({
      kind: 'denied',
    })
  })

  it('usage: a denied eligibility is denied; an allowed one reaches the adopted-source gap', async () => {
    const access: Access<unknown> = { principal: 'p', tenant: tenantA }
    const denied = inbox({ check: async () => ({ kind: 'denied' }) }).inbox
    await expect(denied.usage({ access, target: targetOf(tenantA) })).resolves.toEqual({
      kind: 'denied',
    })
    const open = inbox({ check: async () => allowed }).inbox
    await expect(open.usage({ access, target: targetOf(tenantA) })).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: ACCOUNTING_GAPS.adoptedSource,
    })
  })
})

describe('the configured sender', () => {
  it('equals the sender of the agent-account-outlet row in the release configuration', () => {
    const distribution = JSON.parse(
      readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
    ) as { rows?: { id: string; config?: { sender?: unknown } }[] }
    const rows = distribution.rows ?? []
    const outlet = rows.find(row => row.id === 'agent-account-outlet')
    expect(outlet?.config?.sender).toEqual(ACCOUNT_OUTLET_SENDER)
  })
})
