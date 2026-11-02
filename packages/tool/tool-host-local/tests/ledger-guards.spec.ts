// The guard table of the local Tool host (TL-11): the assembly `createLocalToolLedgerGuards`, the
// text result factory and the production guards under the real ledger of `@omne-harness/tool`.
//
// TEST DOUBLES: the allow table of `createTableToolAccess` stands in for the application
// adapter of the authorization decision; the invoke authority is built on it; the principal
// codec, the in-memory ledger store, the output custody and the environment are from
// `@omne-harness/tool/testing`, `@omne-harness/tool-contract/testing` or this file. They prove the
// behaviour of the guards over one process and one store object, not durability and not the real
// authorization adapter.
import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import {
  createToolLedger,
  type ToolAccessGuard,
  type ToolInvokeAuthority,
} from '@omne-harness/tool'
import { createMemoryToolLedgerStore, createTableToolAccess } from '@omne-harness/tool/testing'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import {
  defaultResultPolicy,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolEnvironment,
  createMemoryToolOutputCustody,
} from '@omne-harness/tool-contract/testing'
import {
  createLocalGrantVerifiers,
  createLocalInvocationSource,
  createLocalTextResults,
  createLocalToolClock,
  createLocalToolLedgerGuards,
  localArgumentLimits,
} from '@omne-harness/tool-host-local'
import {
  evidence,
  invokeRequest,
  request as fixedRequest,
  samePrincipalBySubject,
  subjectCodec,
  tenantA,
  tenantB,
  type Subject,
} from './coordinator-values.ts'

type P = Subject
const alice: P = { subject: 'alice' }
const bob: P = { subject: 'bob' }

const scope = fixedRequest().scope

/** The real ledger with the production guards over a store that counts its reads and commits. */
function assembly() {
  const memory = createMemoryToolLedgerStore<ToolMessageContentBlock>()
  const counts = { reads: 0, commits: 0 }
  const store: typeof memory = {
    ...memory,
    read: domain => {
      counts.reads += 1
      return memory.read(domain)
    },
    commit: input => {
      counts.commits += 1
      return memory.commit(input)
    },
  }
  const table = createTableToolAccess<P>({
    principalKey: principal => principal.subject,
    allow: [
      { principal: 'alice', tenant: tenantA, action: 'admit' },
      { principal: 'alice', tenant: tenantA, action: 'lookup' },
      { principal: 'bob', tenant: tenantA, action: 'admit' },
    ],
  })
  const authority: ToolInvokeAuthority<P> = {
    qualify: input =>
      table.guard.qualify({
        principal: input.principal,
        tenant: input.tenant,
        call: callId('source-qualification'),
        action: 'admit',
      }),
    samePrincipal: samePrincipalBySubject,
  }
  const sources = createLocalInvocationSource<P, ToolMessageContentBlock>({
    store,
    authority,
    principalCodec: subjectCodec,
    commitAttempts: 4,
  })
  const guards = createLocalToolLedgerGuards<P>({
    access: { guard: table.guard, start: table.start },
    sources,
    bindings: {
      recover: () =>
        Promise.resolve(fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'none' })),
    },
    grants: createLocalGrantVerifiers<P>(scope),
  })
  const ledger = createToolLedger<P, ToolMessageContentBlock>(
    store,
    guards,
    createLocalToolClock(),
    { resultPageBytes: 4_096, ledgerCommitAttempts: 4, queueCapacity: 16 },
    {
      custody: createMemoryToolOutputCustody<P>(),
      releaseInspection: createMemoryToolEnvironment<P>(),
      content: null,
    },
  )
  return { ledger, sources, table, counts, memory }
}

type Assembly = ReturnType<typeof assembly>

/** Resolves the source for `request` as alice in tenant A and admits it. */
async function admitted(fixture: Assembly, request: ToolInvokeRequest = invokeRequest()) {
  const bound = await fixture.sources.issuer.resolve({ principal: alice, tenant: tenantA, request })
  if (bound.kind !== 'bound') throw new Error(`fixture: expected bound, got ${bound.kind}`)
  const input = {
    principal: alice,
    tenant: tenantA,
    call: bound.call,
    operation: bound.admission,
    request: { ...request, invocation: bound.invocation },
  }
  return { bound, input, outcome: await fixture.ledger.admissions.admit(input) }
}

const callId = (text: string) => {
  const decoded = decodeToolCallId(text)
  if ('failure' in decoded) throw new Error(`fixture identity: ${text}`)
  return decoded.ok
}

describe('TL-11 guards under the real ledger', () => {
  it('TL-11 the qualified principal is admitted and can look the admission up', async () => {
    const fixture = assembly()
    const { bound, input, outcome } = await admitted(fixture)
    expect(outcome).toHaveProperty('ok')
    const lookup = await fixture.ledger.reads.lookup({
      principal: alice,
      tenant: tenantA,
      call: bound.call,
      admission: input.operation,
    })
    expect(lookup).toHaveProperty('ok')
  })

  it('TL-11 A1 another tenant is denied on admit, lookup and source resolution, and the store is not read', async () => {
    const fixture = assembly()
    const { bound, input } = await admitted(fixture)
    for (const principal of [alice, bob]) {
      fixture.counts.reads = 0
      fixture.counts.commits = 0
      const resolved = await fixture.sources.issuer.resolve({
        principal,
        tenant: tenantB,
        request: invokeRequest(),
      })
      expect(resolved).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
      expect(
        await fixture.ledger.admissions.admit({ ...input, principal, tenant: tenantB }),
      ).toMatchObject({
        failure: { kind: 'denied' },
      })
      expect(
        await fixture.ledger.reads.lookup({
          principal,
          tenant: tenantB,
          call: bound.call,
          admission: input.operation,
        }),
      ).toMatchObject({ failure: { kind: 'denied' } })
      expect(fixture.counts, `principal ${principal.subject}`).toEqual({ reads: 0, commits: 0 })
    }
  })

  it('TL-11 A1 a principal without the lookup rule is denied in the tenant that admitted the call', async () => {
    const fixture = assembly()
    const { bound, input } = await admitted(fixture)
    fixture.counts.reads = 0
    expect(
      await fixture.ledger.reads.lookup({
        principal: bob,
        tenant: tenantA,
        call: bound.call,
        admission: input.operation,
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(fixture.counts.reads).toBe(0)
  })

  it('TL-11 an access guard that cannot answer makes admission unavailable and reads nothing', async () => {
    const fixture = assembly()
    const { input } = await admitted(fixture)
    fixture.table.fail('adapter down')
    fixture.counts.reads = 0
    expect(await fixture.ledger.admissions.admit(input)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'access-guard' },
    })
    expect(fixture.counts.reads).toBe(0)
  })

  it('TL-11 a request whose source was never issued is denied at admission', async () => {
    const fixture = assembly()
    const { bound, input } = await admitted(fixture)
    const invented = decodeToolOperationId('admit-invented')
    if ('failure' in invented) throw new Error('fixture identity')
    expect(
      await fixture.ledger.admissions.admit({
        ...input,
        call: callId('call-invented'),
        operation: invented.ok,
        request: { ...input.request, invocation: { kind: 'direct', source: evidence('invented') } },
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(bound.call).not.toBe('call-invented')
  })

  it('TL-11 A6 a scope owner that no verifier declares is denied by the ledger', async () => {
    const fixture = assembly()
    const { outcome } = await admitted(
      fixture,
      invokeRequest({ scope: { ...scope, owner: 'undeclared-owner' } }),
    )
    expect(outcome).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('TL-11 A6 the declared owner with another key or another grant is denied by the ledger', async () => {
    const fixture = assembly()
    const changes = [
      { ...scope, key: 'another-key' },
      { ...scope, grant: evidence('another-grant') },
    ]
    for (const [index, changed] of changes.entries()) {
      // One consumer position each: one consumer position is one binding of one request.
      const consumer = { ...fixedRequest().consumer, position: `position-${index}` }
      const { outcome } = await admitted(fixture, invokeRequest({ scope: changed, consumer }))
      expect(outcome).toMatchObject({ failure: { kind: 'denied' } })
    }
  })

  it('TL-11 A5 an argument that fails to parse settles the call with a result that the policy accepts', async () => {
    const fixture = assembly()
    const { outcome } = await admitted(
      fixture,
      invokeRequest({ arguments: { original: 'not json', effective: 'not json', complete: true } }),
    )
    if (!('ok' in outcome)) throw new Error(`admit failed: ${JSON.stringify(outcome)}`)
    expect(outcome.ok.state.phase).toBe('settled')
  })
})

describe('TL-11 A5 text results', () => {
  it('TL-11 the text of a logical terminal is one block that the default result policy accepts', () => {
    const made = createLocalTextResults().text('the arguments could not be parsed: invalid json')
    if (!('ok' in made)) throw new Error('the factory refused plain text')
    expect(made.ok.content).toHaveLength(1)
    expect(made.ok.content[0]).toMatchObject({
      kind: 'text',
      id: 'logical',
      visibility: { toHuman: true, toModel: true },
      text: 'the arguments could not be parsed: invalid json',
    })
    expect(made.ok.data).toEqual({ kind: 'none' })
    expect(made.ok.original).toEqual({ kind: 'none' })
    expect(made.ok.attachments).toEqual([])
    expect(defaultResultPolicy.judgeResult(made.ok)).toHaveProperty('ok')
  })

  it('TL-11 a value that no block can carry is a refusal, not an exception', () => {
    const made = createLocalTextResults().text(undefined as never)
    expect(made).toHaveProperty('failure.reason')
  })
})

const allowAll: ToolAccessGuard<P> = { qualify: () => Promise.resolve({ kind: 'allowed' }) }

function parts(overrides: Record<string, unknown> = {}) {
  const fixture = assembly()
  return {
    fixture,
    input: {
      access: { guard: allowAll, start: allowAll as never },
      sources: fixture.sources,
      bindings: {
        recover: () =>
          Promise.resolve(fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'none' })),
      },
      grants: createLocalGrantVerifiers<P>(scope),
      ...overrides,
    },
  }
}

describe('TL-11 A7 the assembly of the guards', () => {
  it('TL-11 the guards are the parts that were passed in, and the policy is the default one', () => {
    const { input } = parts()
    const guards = createLocalToolLedgerGuards<P>(input as never)
    expect(guards.access).toBe(input.access.guard)
    expect(guards.sources).toBe(input.sources.guard)
    expect(guards.grants).toBe(input.grants)
    expect(guards.policy).toBe(defaultResultPolicy)
    expect(guards.budgets).toEqual({ arguments: localArgumentLimits })
    expect(typeof guards.factAcknowledgements.verify).toBe('function')
    expect(typeof guards.starts.qualifyStart).toBe('function')
    expect(typeof guards.results.text).toBe('function')
  })

  it('TL-11 the start guard asks the start view of the access, the ledger guard asks the other', async () => {
    const asked: string[] = []
    const record = (name: string): ToolAccessGuard<P> => ({
      qualify: () => {
        asked.push(name)
        return Promise.resolve({ kind: 'allowed' })
      },
    })
    const { input } = parts({ access: { guard: record('guard'), start: record('start') } })
    const guards = createLocalToolLedgerGuards<P>(input as never)
    await guards.access.qualify({
      principal: alice,
      tenant: tenantA,
      call: callId('call-1'),
      action: 'admit',
    })
    await guards.starts.qualifyStart({
      principal: alice,
      tenant: tenantA,
      call: callId('call-1'),
      request: { ...invokeRequest(), invocation: { kind: 'direct', source: evidence('s') } },
    })
    expect(asked).toEqual(['guard', 'start'])
  })

  it('TL-11 the fact acknowledgement guard answers unavailable when the bindings cannot recover', async () => {
    const { input } = parts()
    const guards = createLocalToolLedgerGuards<P>(input as never)
    const verdict = await guards.factAcknowledgements.verify({
      principal: alice,
      tenant: tenantA,
      call: callId('call-1'),
      start: {} as never,
      source: evidence('source'),
      receipt: {} as never,
      sourceReceipt: evidence('receipt'),
    })
    expect(verdict.kind).toBe('unavailable')
  })

  it.each([
    ['access', undefined, 'access: missing'],
    ['access', { start: allowAll }, 'access.guard.qualify: missing'],
    ['access', { guard: allowAll }, 'access.start.qualify: missing'],
    ['sources', undefined, 'sources: missing'],
    ['sources', {}, 'sources.guard.verify: missing'],
    ['bindings', undefined, 'bindings: missing'],
    ['bindings', {}, 'bindings.recover: missing'],
    ['grants', undefined, 'grants: not a Map'],
    ['grants', {}, 'grants: not a Map'],
  ] as const)('TL-11 a bad %s (%#) is a TypeError', (key, value, message) => {
    const { input } = parts()
    expect(() => createLocalToolLedgerGuards<P>({ ...input, [key]: value } as never)).toThrow(
      new TypeError(message),
    )
  })

  it('TL-11 the whole input missing is a TypeError', () => {
    expect(() => createLocalToolLedgerGuards<P>(undefined as never)).toThrow(
      new TypeError('input: missing'),
    )
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '5'])(
    'TL-11 a budget of %s is a TypeError',
    bad => {
      for (const key of Object.keys(localArgumentLimits)) {
        const { input } = parts({ budgets: { arguments: { ...localArgumentLimits, [key]: bad } } })
        expect(() => createLocalToolLedgerGuards<P>(input as never), key).toThrow(
          new TypeError(`budgets.arguments.${key}: range`),
        )
      }
    },
  )

  it('TL-11 a budget with a missing item is a TypeError and a complete one is used as it is', () => {
    expect(() =>
      createLocalToolLedgerGuards<P>({ ...parts().input, budgets: {} } as never),
    ).toThrow(new TypeError('budgets.arguments: missing'))
    const rest: Record<string, number> = { ...localArgumentLimits }
    delete rest.maxBytes
    expect(() =>
      createLocalToolLedgerGuards<P>({ ...parts().input, budgets: { arguments: rest } } as never),
    ).toThrow(new TypeError('budgets.arguments.maxBytes: range'))
    const custom = { arguments: { ...localArgumentLimits, maxBytes: 1_024 } }
    expect(
      createLocalToolLedgerGuards<P>({ ...parts().input, budgets: custom } as never).budgets,
    ).toEqual(custom)
  })

  it('TL-11 the default budgets are positive safe integers', () => {
    expect(Object.keys(localArgumentLimits).sort()).toEqual([
      'maxBytes',
      'maxDepth',
      'maxItems',
      'maxMembers',
      'maxNumberLength',
      'maxStringLength',
    ])
    for (const value of Object.values(localArgumentLimits)) {
      expect(Number.isSafeInteger(value) && value > 0).toBe(true)
    }
  })
})
