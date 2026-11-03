// The accounting ports of the `request-context` row (SC2): the narrow source authority, the read
// eligibility and the adopted source over the registered holder sources, and the one gap that
// stays. The verifier is a real in-process principal authority; the inbox is the real
// `createContextAccounting` of the member, so the order of its checks is the member's own.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  inProcessPrincipalAuthority,
  type Principal,
  type PrincipalVerifier,
} from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import { decodeDispatchId, decodeModelCallId } from '@omne-harness/model-contract'
import { createContextAccounting } from '@omne-harness/request-context'
import type {
  Access,
  AdoptedRequestSource,
  Adoption,
  ContextReadEligibility,
  ContextTarget,
  GroupToken,
  ReceivedAccountFact,
} from '@omne-harness/request-context-contract'
import type { ContextHolderSources } from '@omne-harness/request-context-cordis-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  ACCOUNT_OUTLET_SENDER,
  ACCOUNTING_DENIALS,
  createHolderAdoptedSource,
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
    origin: {
      producer: 'model',
      sender: options.sender ?? ACCOUNT_OUTLET_SENDER,
      resultVersion: null,
    },
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

/** A real verifier, one acting principal per tenant, and system principals of the same authority. */
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
  const system = (component: string): Principal =>
    okOf(authority.issuer.issueSystem({ component }), 'system')
  return { verifier: authority.verifier, acting, system }
}

const quiet = { diagnose: () => {}, trace: () => {} }

function authorityUnderTest() {
  const { verifier, acting, system } = principals()
  const diagnostics: string[] = []
  const authority = createOutletSourceAuthority({
    readVerifier: () => verifier,
    sender: ACCOUNT_OUTLET_SENDER,
    diagnose: text => diagnostics.push(text),
    trace: () => {},
  })
  return { authority, acting, system, diagnostics }
}

function authorityOver(verifier: PrincipalVerifier | undefined, traces: string[] = []) {
  return createOutletSourceAuthority({
    readVerifier: () => verifier,
    sender: ACCOUNT_OUTLET_SENDER,
    diagnose: () => {},
    trace: text => traces.push(text),
  })
}

describe('the source authority: only the configured agent-account-outlet sender', () => {
  it('allows the configured sender for a verified acting principal of the same tenant', async () => {
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

  it('denies a verified system principal of any component: the system scope stands for no tenant (IC-18)', async () => {
    const { authority, system, diagnostics } = authorityUnderTest()
    for (const component of ['any-root-component', 'agent-host']) {
      const access: Access<unknown> = { principal: system(component), tenant: tenantB }
      const input = fact({ target: tenantB, call: tenantB })
      await expect(authority.check({ access, input })).resolves.toEqual({ kind: 'denied' })
    }
    expect(diagnostics).toEqual([ACCOUNTING_DENIALS.system, ACCOUNTING_DENIALS.system])
  })

  it('denies an acting principal of another tenant than the access, with an otherwise valid input', async () => {
    const { authority, acting, diagnostics } = authorityUnderTest()
    const access: Access<unknown> = { principal: acting(tenantB), tenant: tenantA }
    await expect(authority.check({ access, input: fact() })).resolves.toEqual({ kind: 'denied' })
    expect(diagnostics).toEqual([ACCOUNTING_DENIALS.system])
  })

  it('denies a forged copy of an acting principal and a value that is no principal', async () => {
    const { authority, acting, diagnostics } = authorityUnderTest()
    const forged: Access<unknown> = {
      principal: JSON.parse(JSON.stringify(acting(tenantA))) as unknown,
      tenant: tenantA,
    }
    const text: Access<unknown> = { principal: 'agent-host', tenant: tenantA }
    for (const access of [forged, text])
      await expect(authority.check({ access, input: fact() })).resolves.toEqual({
        kind: 'denied',
      })
    expect(diagnostics).toEqual([ACCOUNTING_DENIALS.principal, ACCOUNTING_DENIALS.principal])
  })

  it('keeps an absent, unavailable or throwing verifier unavailable, never denied or allowed', async () => {
    const { acting } = principals()
    const access: Access<unknown> = { principal: acting(tenantA), tenant: tenantA }
    const traces: string[] = []
    const down: PrincipalVerifier = {
      verify: async () => ({ kind: 'unavailable', diagnostic: 'verifier down' }),
    }
    const throwing: PrincipalVerifier = { verify: () => Promise.reject(new Error('secret')) }
    const answers = [
      await authorityOver(undefined).check({ access, input: fact() }),
      await authorityOver(down).check({ access, input: fact() }),
      await authorityOver(throwing, traces).check({ access, input: fact() }),
    ]
    expect(answers.map(answer => answer.kind)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
    ])
    expect(JSON.stringify(answers)).not.toContain('secret')
    expect(traces).toEqual(['accounting source: the principal verifier threw'])
  })

  it('keeps a throwing verifier reader unavailable', async () => {
    const { acting } = principals()
    const authority = createOutletSourceAuthority({
      readVerifier: () => {
        throw new Error('secret')
      },
      sender: ACCOUNT_OUTLET_SENDER,
      ...quiet,
    })
    const access: Access<unknown> = { principal: acting(tenantA), tenant: tenantA }
    const answer = await authority.check({ access, input: fact() })
    expect(answer.kind).toBe('unavailable')
    expect(JSON.stringify(answer)).not.toContain('secret')
  })
})

type Probe = { leases: number; releases: number }

type Adopted = Pick<AdoptedRequestSource<unknown>, 'readCount' | 'readSource'>

/** The adopted part of a Session with no fixed request yet: one stable token and no fact. */
const noAdoption: Adopted = {
  readCount: async () => ({ kind: 'value', value: 'token-1' as GroupToken }),
  readSource: async () => ({ kind: 'value', value: null }),
}

/** A holder that lends an eligibility and an adopted part and counts its leases. */
function holderWith(
  eligibility: ContextReadEligibility<unknown>,
  probe: Probe,
  adopted: Adopted = noAdoption,
) {
  const holder: ContextHolderSources<unknown> = {
    lease: () => {
      probe.leases += 1
      return {
        kind: 'leased',
        lease: {
          parts: { eligibility, adopted } as never,
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
      trace: () => {},
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
      trace: () => {},
    })
    await expect(port.check(read)).resolves.toEqual({ kind: 'denied' })
    expect(diagnostics).toEqual([ACCOUNTING_DENIALS.eligibility])
    expect(probe).toEqual({ leases: 1, releases: 1 })
  })

  it('denies every operation other than accounts without asking the holder; the reason is a trace, not a warning', async () => {
    const probe: Probe = { leases: 0, releases: 0 }
    const diagnostics: string[] = []
    const traces: string[] = []
    const port = createHolderReadEligibility({
      readHolder: () => holderWith({ check: async () => allowed }, probe),
      diagnose: text => diagnostics.push(text),
      trace: text => traces.push(text),
    })
    for (const operation of ['history', 'conversions', 'assembly'] as const)
      await expect(port.check({ ...read, operation })).resolves.toEqual({ kind: 'denied' })
    expect(probe.leases).toBe(0)
    expect(diagnostics).toEqual([])
    expect(traces).toEqual([
      ACCOUNTING_DENIALS.operation,
      ACCOUNTING_DENIALS.operation,
      ACCOUNTING_DENIALS.operation,
    ])
  })

  it('is unavailable with no holder, a refused lease, or a throwing eligibility (the lease still ends)', async () => {
    const probe: Probe = { leases: 0, releases: 0 }
    const traces: string[] = []
    const none = createHolderReadEligibility({ readHolder: () => undefined, ...quiet })
    const closing = createHolderReadEligibility({
      readHolder: () => ({ lease: () => ({ kind: 'unavailable', diagnostic: 'closing' }) }),
      ...quiet,
    })
    const throwing = createHolderReadEligibility({
      readHolder: () => holderWith({ check: () => Promise.reject(new Error('x')) }, probe),
      diagnose: () => {},
      trace: text => traces.push(text),
    })
    for (const port of [none, closing, throwing])
      expect((await port.check(read)).kind).toBe('unavailable')
    expect(probe).toEqual({ leases: 1, releases: 1 })
    expect(traces).toEqual(['accounting read eligibility: the holder eligibility threw'])
  })

  it('is unavailable, with a trace, when reading the holder throws', async () => {
    const traces: string[] = []
    const port = createHolderReadEligibility({
      readHolder: () => {
        throw new Error('secret')
      },
      diagnose: () => {},
      trace: text => traces.push(text),
    })
    await expect(port.check(read)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'accounting read eligibility: no contextHolderSources holder is running',
    })
    expect(traces).toEqual(['accounting read eligibility: reading the holder threw'])
  })

  it('is unavailable, with a trace, when the holder lease throws', async () => {
    const traces: string[] = []
    const port = createHolderReadEligibility({
      readHolder: () => ({
        lease: () => {
          throw new Error('secret')
        },
      }),
      diagnose: () => {},
      trace: text => traces.push(text),
    })
    const answer = await port.check(read)
    expect(answer).toEqual({
      kind: 'unavailable',
      diagnostic: 'accounting read eligibility: the holder lease threw',
    })
    expect(JSON.stringify(answer)).not.toContain('secret')
    expect(traces).toEqual(['accounting read eligibility: the holder lease threw'])
  })
})

describe('the adopted source: the adopted part of the registered holder sources', () => {
  const access: Access<unknown> = { principal: 'p', tenant: tenantA }
  const read = { access, target: targetOf(tenantA) }
  const denying: ContextReadEligibility<unknown> = { check: async () => ({ kind: 'denied' }) }

  it('answers what the holder adopted part answers, one lease per call, each lease ended', async () => {
    const probe: Probe = { leases: 0, releases: 0 }
    const seen: unknown[] = []
    const port = createHolderAdoptedSource({
      readHolder: () =>
        holderWith(denying, probe, {
          readCount: async input => {
            seen.push(input)
            return { kind: 'value', value: 'token-7' as GroupToken }
          },
          readSource: async input => {
            seen.push(input)
            return { kind: 'value', value: null }
          },
        }),
      trace: () => {},
    })
    await expect(port.readCount(read)).resolves.toEqual({ kind: 'value', value: 'token-7' })
    await expect(port.readSource(read)).resolves.toEqual({ kind: 'value', value: null })
    expect(seen).toEqual([read, read])
    expect(probe).toEqual({ leases: 2, releases: 2 })
  })

  it('keeps a denied or unavailable answer of the holder part as it is', async () => {
    const probe: Probe = { leases: 0, releases: 0 }
    const port = createHolderAdoptedSource({
      readHolder: () =>
        holderWith(denying, probe, {
          readCount: async () => ({ kind: 'denied' }),
          readSource: async () => ({ kind: 'unavailable', diagnostic: 'adopted-requests-absent' }),
        }),
      trace: () => {},
    })
    await expect(port.readCount(read)).resolves.toEqual({ kind: 'denied' })
    await expect(port.readSource(read)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'adopted-requests-absent',
    })
    expect(probe).toEqual({ leases: 2, releases: 2 })
  })

  it('is unavailable with no holder, a refused lease, or a throwing part (the lease still ends)', async () => {
    const probe: Probe = { leases: 0, releases: 0 }
    const traces: string[] = []
    const none = createHolderAdoptedSource({ readHolder: () => undefined, trace: () => {} })
    const closing = createHolderAdoptedSource({
      readHolder: () => ({ lease: () => ({ kind: 'unavailable', diagnostic: 'closing' }) }),
      trace: () => {},
    })
    const throwing = createHolderAdoptedSource({
      readHolder: () =>
        holderWith(denying, probe, {
          readCount: () => Promise.reject(new Error('secret')),
          readSource: () => Promise.reject(new Error('secret')),
        }),
      trace: text => traces.push(text),
    })
    await expect(none.readCount(read)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'accounting adopted source: no contextHolderSources holder is running',
    })
    await expect(closing.readSource(read)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'accounting adopted source: holder lease: closing',
    })
    for (const answer of [await throwing.readCount(read), await throwing.readSource(read)]) {
      expect(answer).toEqual({
        kind: 'unavailable',
        diagnostic: 'accounting adopted source: the holder adopted part threw',
      })
      expect(JSON.stringify(answer)).not.toContain('secret')
    }
    expect(probe).toEqual({ leases: 2, releases: 2 })
    expect(traces).toHaveLength(2)
    expect(traces.join(' ')).not.toContain('secret')
  })

  it('is unavailable, with a trace, when reading the holder or its lease throws', async () => {
    const traces: string[] = []
    const reading = createHolderAdoptedSource({
      readHolder: () => {
        throw new Error('secret')
      },
      trace: text => traces.push(text),
    })
    const leasing = createHolderAdoptedSource({
      readHolder: () => ({
        lease: () => {
          throw new Error('secret')
        },
      }),
      trace: text => traces.push(text),
    })
    await expect(reading.readCount(read)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'accounting adopted source: no contextHolderSources holder is running',
    })
    await expect(leasing.readSource(read)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'accounting adopted source: the holder lease threw',
    })
    expect(traces).toHaveLength(2)
    expect(traces.join(' ')).not.toContain('secret')
  })
})

describe('the release accounting options on the real inbox', () => {
  function inbox(eligibility: ContextReadEligibility<unknown>, adopted?: Adopted) {
    const { verifier, acting, system } = principals()
    const options = releaseAccounting(
      { maxTargets: 4, maxFactsPerTarget: 8, maxRevisionsPerDispatch: 4 },
      {
        readVerifier: () => verifier,
        readHolder: () => holderWith(eligibility, { leases: 0, releases: 0 }, adopted),
        ...quiet,
      },
    )
    return { inbox: createContextAccounting(options).inbox, acting, system }
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

  it('a system principal for tenant B with a B account and the configured sender is denied (review B1)', async () => {
    const { inbox: subject, system } = inbox({ check: async () => allowed })
    const access: Access<unknown> = { principal: system('any-root-component'), tenant: tenantB }
    await expect(
      subject.receive({ access, input: fact({ target: tenantB, call: tenantB }) }),
    ).resolves.toEqual({ kind: 'denied' })
  })

  it('usage: a denied eligibility is denied; an allowed one reads the holder adopted part and stops at the uninitialized projection', async () => {
    const access: Access<unknown> = { principal: 'p', tenant: tenantA }
    const denied = inbox({ check: async () => ({ kind: 'denied' }) }).inbox
    await expect(denied.usage({ access, target: targetOf(tenantA) })).resolves.toEqual({
      kind: 'denied',
    })
    const open = inbox({ check: async () => allowed }).inbox
    await expect(open.usage({ access, target: targetOf(tenantA) })).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'uninitialized',
    })
  })

  it('usage: what the holder adopted part refuses is the usage answer', async () => {
    const access: Access<unknown> = { principal: 'p', tenant: tenantA }
    const refusing = inbox(
      { check: async () => allowed },
      {
        readCount: async () => ({ kind: 'unavailable', diagnostic: 'adopted-requests-absent' }),
        readSource: async () => ({ kind: 'value', value: null }),
      },
    ).inbox
    await expect(refusing.usage({ access, target: targetOf(tenantA) })).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'adopted-requests-absent',
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
