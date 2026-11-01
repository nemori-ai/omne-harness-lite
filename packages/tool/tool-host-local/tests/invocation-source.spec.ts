// The paired invocation source (TL-11, row 2 of the guard table): identity issuance and recall over
// the `host` domain of a ledger store, and the verification of a fixed request against the
// binding. The authority (qualification and subject comparison) and the principal codec are test
// parameters; the store is the in-memory store of `@omne-harness/tool/testing`, so these cases
// prove behaviour over one store object, not durability.
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  AccessVerdict,
  LedgerCommit,
  LedgerCommitInput,
  LedgerDomain,
  LedgerRead,
  ToolInvokeAuthority,
  ToolLedgerStore,
} from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  decodeToolOperationId,
  type FixedToolRequest,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import {
  INVOCATION_SOURCE_DOMAIN_KEY,
  createLocalInvocationSource,
  createLocalOperationIdentities,
  type PrincipalCodec,
} from '@omne-harness/tool-host-local'
import { request as fixedRequest, tenantA, tenantB } from './coordinator-values.ts'

type P = Readonly<{ subject: string }>
const alice: P = { subject: 'alice' }
const mallory: P = { subject: 'mallory' }

function invokeRequest(overrides: Partial<ToolInvokeRequest> = {}): ToolInvokeRequest {
  const { invocation: _invocation, ...rest } = fixedRequest()
  return { ...rest, ...overrides }
}

const codec: PrincipalCodec<P> = {
  encode: principal => ({ subject: principal.subject }),
  decode: value => {
    const subject: unknown =
      typeof value === 'object' && value !== null ? Reflect.get(value, 'subject') : undefined
    return typeof subject === 'string' ? succeed({ subject }) : fail({ reason: 'subject-shape' })
  },
}

/** Counts the calls and answers by subject: every subject is qualified, only equal ones are the same. */
function authority(
  options: Readonly<{ qualify?: AccessVerdict; same?: AccessVerdict; throws?: boolean }> = {},
): ToolInvokeAuthority<P> & Readonly<{ calls: { qualify: number; same: number } }> {
  const calls = { qualify: 0, same: 0 }
  return {
    calls,
    qualify: () => {
      calls.qualify += 1
      if (options.throws === true) return Promise.reject(new Error('secret connection string'))
      return Promise.resolve(options.qualify ?? { kind: 'allowed' })
    },
    samePrincipal: ({ current, original }) => {
      calls.same += 1
      if (options.same !== undefined) return Promise.resolve(options.same)
      return Promise.resolve(
        current.subject === original.subject
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
      )
    },
  }
}

type Fault =
  | 'lost-reply'
  | 'unknown-unwritten'
  | 'conflict'
  | 'read-unavailable'
  | 'read-throws'
  | 'commit-throws'

/** A store over the memory store that counts reads and commits and fails the next one on demand. */
function observed() {
  const memory = createMemoryToolLedgerStore<ContentBlock>()
  const counts = { reads: 0, commits: 0 }
  let armed: { fault: Fault; times: number } | null = null
  const take = (...faults: Fault[]): Fault | null => {
    if (armed === null || !faults.includes(armed.fault)) return null
    const { fault } = armed
    armed.times -= 1
    if (armed.times === 0) armed = null
    return fault
  }
  const store: ToolLedgerStore<ContentBlock> = {
    durability: 'none',
    read: async (domain: LedgerDomain): Promise<LedgerRead<ContentBlock>> => {
      counts.reads += 1
      const fault = take('read-unavailable', 'read-throws')
      if (fault === 'read-unavailable') return { kind: 'unavailable', diagnostic: 'store is down' }
      if (fault === 'read-throws') throw new Error('secret connection string')
      return memory.read(domain)
    },
    commit: async (input: LedgerCommitInput<ContentBlock>): Promise<LedgerCommit> => {
      counts.commits += 1
      const fault = take('lost-reply', 'unknown-unwritten', 'conflict', 'commit-throws')
      if (fault === 'lost-reply') {
        await memory.commit(input)
        return { kind: 'unknown', diagnostic: 'the answer was lost' }
      }
      if (fault === 'unknown-unwritten') return { kind: 'unknown', diagnostic: 'not written' }
      if (fault === 'commit-throws') throw new Error('secret connection string')
      if (fault === 'conflict') {
        const current = await memory.read(input.domain)
        if (current.kind !== 'complete') throw new Error('fixture read failed')
        return { kind: 'conflict', current: current.revision }
      }
      return memory.commit(input)
    },
  }
  return {
    memory,
    store,
    counts,
    arm: (fault: Fault, times = 1) => {
      armed = { fault, times }
    },
  }
}

function source(
  store: ToolLedgerStore<ContentBlock>,
  authorityValue: ToolInvokeAuthority<P> = authority(),
  commitAttempts = 4,
) {
  return createLocalInvocationSource<P>({
    store,
    authority: authorityValue,
    principalCodec: codec,
    commitAttempts,
  })
}

const resolveInput = (
  overrides: Partial<{ principal: P; tenant: typeof tenantA; request: ToolInvokeRequest }> = {},
) => ({
  principal: alice,
  tenant: tenantA,
  request: invokeRequest(),
  ...overrides,
})

async function bound(issuer: ReturnType<typeof source>['issuer'], input = resolveInput()) {
  const outcome = await issuer.resolve(input)
  if (outcome.kind !== 'bound') throw new Error(`fixture: expected bound, got ${outcome.kind}`)
  return outcome
}

/** The mutation input the ledger passes to `verify` for a bound outcome. */
function verifyInput(
  outcome: Awaited<ReturnType<typeof bound>>,
  overrides: Partial<{ principal: P; tenant: typeof tenantA }> = {},
) {
  return {
    principal: alice,
    tenant: tenantA,
    call: outcome.call,
    operation: outcome.admission,
    request: { ...invokeRequest(), invocation: outcome.invocation } satisfies FixedToolRequest,
    ...overrides,
  }
}

describe('TL-11 invocation source: issuance and recall', () => {
  it('TL-11 the same input twice gives the same call, admission and invocation', async () => {
    const { store } = observed()
    const { issuer } = source(store)
    const first = await bound(issuer)
    const second = await bound(issuer)
    expect(first.recovered).toBe(false)
    expect(second.recovered).toBe(true)
    expect(second).toMatchObject({
      call: first.call,
      admission: first.admission,
      invocation: first.invocation,
    })
    expect(first.invocation.kind).toBe('direct')
  })

  it('TL-11 a source rebuilt over the same store recalls the original identities', async () => {
    const { store } = observed()
    const first = await bound(source(store).issuer)
    const again = await bound(source(store).issuer)
    expect(again.recovered).toBe(true)
    expect(again).toMatchObject({
      call: first.call,
      admission: first.admission,
      invocation: first.invocation,
    })
  })

  it('TL-11 another consumer position gets another call and admission', async () => {
    const { store } = observed()
    const { issuer } = source(store)
    const first = await bound(issuer)
    const other = await bound(
      issuer,
      resolveInput({
        request: invokeRequest({
          consumer: {
            owner: 'consumer',
            work: 'work-1',
            position: 'position-2',
            purpose: 'tool-result',
          },
        }),
      }),
    )
    expect(other.call).not.toBe(first.call)
    expect(other.admission).not.toBe(first.admission)
  })

  it('TL-11 the same consumer in another tenant is another association in another host domain', async () => {
    const { store, memory } = observed()
    const { issuer } = source(store)
    const a = await bound(issuer)
    const b = await bound(issuer, resolveInput({ tenant: tenantB }))
    expect(b.recovered).toBe(false)
    expect(b.call).not.toBe(a.call)
    for (const [tenant, expected] of [
      [tenantA, 1],
      [tenantB, 1],
    ] as const) {
      const read = await memory.read({ kind: 'host', tenant, key: INVOCATION_SOURCE_DOMAIN_KEY })
      expect(read.kind === 'complete' && read.records.length).toBe(expected)
    }
  })

  it('TL-11 a different subject for a known consumer is not recalled and mints nothing', async () => {
    const { store, counts } = observed()
    const { issuer } = source(store)
    await bound(issuer)
    const commits = counts.commits
    const outcome = await issuer.resolve(resolveInput({ principal: mallory }))
    expect(outcome).toEqual({ kind: 'rejected', failure: { kind: 'denied', action: 'admit' } })
    expect(counts.commits).toBe(commits)
  })

  it('TL-11 a recall whose subject comparison cannot be answered is unavailable', async () => {
    const { store } = observed()
    await bound(source(store).issuer)
    const outcome = await source(
      store,
      authority({ same: { kind: 'unavailable', diagnostic: 'adapter down' } }),
    ).issuer.resolve(resolveInput())
    expect(outcome).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', dependency: 'invoke-authority', diagnostic: 'adapter down' },
    })
  })

  it('TL-11 the same consumer with another request conflicts on the original admission', async () => {
    const { store } = observed()
    const { issuer } = source(store)
    const first = await bound(issuer)
    const outcome = await issuer.resolve(
      resolveInput({
        request: invokeRequest({
          arguments: { original: '{"path":"b"}', effective: '{"path":"b"}', complete: true },
        }),
      }),
    )
    expect(outcome).toEqual({
      kind: 'rejected',
      failure: { kind: 'conflict', operation: first.admission },
    })
  })

  it('TL-11 a stored principal that cannot be decoded is association-unknown, not a new identity', async () => {
    const { store, memory, counts } = observed()
    const { issuer } = source(store)
    await bound(issuer)
    const domain = { kind: 'host', tenant: tenantA, key: INVOCATION_SOURCE_DOMAIN_KEY } as const
    const read = await memory.read(domain)
    if (read.kind !== 'complete') throw new Error('fixture read failed')
    const [record] = read.records
    if (record?.kind !== 'host') throw new Error('fixture: expected a host record')
    const damaged = { ...(record.host.value as object), principal: 'not-a-subject' }
    const revision = String(BigInt(read.revision) + 1n)
    const next = decodeToolRevision((BigInt(read.revision) + 1n).toString())
    if ('failure' in next) throw new Error('fixture revision')
    const committed = await memory.commit({
      domain,
      expected: read.revision,
      revision: revision as typeof read.revision,
      writes: [
        { kind: 'put', record: { kind: 'host', host: { key: record.host.key, value: damaged } } },
      ],
    })
    expect(committed.kind).toBe('committed')
    const commits = counts.commits
    expect(await issuer.resolve(resolveInput())).toEqual({ kind: 'association-unknown' })
    expect(counts.commits).toBe(commits)
  })

  it('TL-11 concurrent resolves of one input agree on one identity', async () => {
    const { store, memory } = observed()
    const { issuer } = source(store)
    const all = await Promise.all([1, 2, 3, 4].map(() => bound(issuer)))
    expect(new Set(all.map(outcome => outcome.call)).size).toBe(1)
    expect(all.filter(outcome => !outcome.recovered)).toHaveLength(1)
    const read = await memory.read({
      kind: 'host',
      tenant: tenantA,
      key: INVOCATION_SOURCE_DOMAIN_KEY,
    })
    expect(read.kind === 'complete' && read.records.length).toBe(1)
  })
})

describe('TL-11 invocation source: boundary and failure', () => {
  it('TL-11 a denied qualification is rejected before any store access', async () => {
    const { store, counts } = observed()
    const { issuer } = source(store, authority({ qualify: { kind: 'denied', reason: 'no' } }))
    expect(await issuer.resolve(resolveInput())).toEqual({
      kind: 'rejected',
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(counts).toEqual({ reads: 0, commits: 0 })
  })

  it('TL-11 an unavailable or throwing authority is unavailable and reports no thrown text', async () => {
    const { store } = observed()
    const unavailable = await source(
      store,
      authority({ qualify: { kind: 'unavailable', diagnostic: 'adapter down' } }),
    ).issuer.resolve(resolveInput())
    expect(unavailable).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', dependency: 'invoke-authority', diagnostic: 'adapter down' },
    })
    const thrown = await source(store, authority({ throws: true })).issuer.resolve(resolveInput())
    expect(thrown).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', dependency: 'invoke-authority' },
    })
    expect(JSON.stringify(thrown)).not.toContain('secret')
  })

  it('TL-11 a tenant that legal-identity did not mint is denied before the authority is asked', async () => {
    const { store, counts } = observed()
    const checked = authority()
    const forged = { name: 'TenantId', organization: { text: 'x' }, account: { text: 'y' } }
    const outcome = await source(store, checked).issuer.resolve({
      principal: alice,
      tenant: forged as never,
      request: invokeRequest(),
    })
    expect(outcome).toEqual({ kind: 'rejected', failure: { kind: 'denied', action: 'admit' } })
    expect(checked.calls.qualify).toBe(0)
    expect(counts.reads).toBe(0)
  })

  it('TL-11 a request that is not a legal invoke request is invalid', async () => {
    const { store } = observed()
    const outcome = await source(store).issuer.resolve({
      ...resolveInput(),
      request: { ...invokeRequest(), invocation: { kind: 'direct' } } as never,
    })
    expect(outcome).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid' } })
  })

  it('TL-11 a principal that cannot be encoded is unavailable and mints nothing', async () => {
    const { store, counts } = observed()
    const broken = createLocalInvocationSource<P>({
      store,
      authority: authority(),
      principalCodec: {
        ...codec,
        encode: () => {
          throw new Error('secret codec detail')
        },
      },
      commitAttempts: 4,
    })
    const outcome = await broken.issuer.resolve(resolveInput())
    expect(outcome).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', dependency: 'principal-codec' },
    })
    expect(JSON.stringify(outcome)).not.toContain('secret')
    expect(counts.commits).toBe(0)
  })

  it('TL-11 a read that fails is unavailable, whether it answers or throws', async () => {
    const { store, arm } = observed()
    const { issuer } = source(store)
    arm('read-unavailable')
    expect(await issuer.resolve(resolveInput())).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', dependency: 'invocation-source' },
    })
    arm('read-throws')
    const thrown = await issuer.resolve(resolveInput())
    expect(thrown).toMatchObject({ kind: 'rejected', failure: { kind: 'unavailable' } })
    expect(JSON.stringify(thrown)).not.toContain('secret')
  })

  it('TL-11 a commit with an unknown answer reports issuance-unknown, and the retry finds the same identities', async () => {
    for (const fault of ['lost-reply', 'unknown-unwritten'] as const) {
      const { store, arm } = observed()
      const { issuer } = source(store)
      arm(fault)
      const unknown = await issuer.resolve(resolveInput())
      if (unknown.kind !== 'issuance-unknown') throw new Error(`${fault}: ${unknown.kind}`)
      const retried = await bound(issuer)
      expect(retried).toMatchObject({ call: unknown.call, admission: unknown.admission })
      expect(retried.recovered).toBe(fault === 'lost-reply')
    }
  })

  it('TL-11 a commit that throws is issuance-unknown and reports no thrown text', async () => {
    const { store, arm } = observed()
    arm('commit-throws')
    const outcome = await source(store).issuer.resolve(resolveInput())
    expect(outcome.kind).toBe('issuance-unknown')
    expect(JSON.stringify(outcome)).not.toContain('secret')
  })

  it('TL-11 a revision conflict is re-read and decided again, up to the attempt limit', async () => {
    const retried = observed()
    retried.arm('conflict', 2)
    expect((await source(retried.store).issuer.resolve(resolveInput())).kind).toBe('bound')
    expect(retried.counts.commits).toBe(3)
    const exhausted = observed()
    exhausted.arm('conflict', 4)
    expect(
      await source(exhausted.store, authority(), 4).issuer.resolve(resolveInput()),
    ).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', dependency: 'invocation-source' },
    })
  })

  it('TL-11 an illegal attempt limit throws a TypeError at construction', () => {
    const { store } = observed()
    for (const attempts of [0, -1, 1.5, Number.NaN]) {
      expect(() => source(store, authority(), attempts)).toThrow(
        new TypeError('commitAttempts: range'),
      )
    }
  })
})

describe('TL-11 invocation source: verification of the fixed request', () => {
  it('TL-11 the request that was issued is trusted', async () => {
    const { store } = observed()
    const { issuer, guard } = source(store)
    const outcome = await bound(issuer)
    expect(await guard.verify(verifyInput(outcome))).toEqual({ kind: 'trusted' })
  })

  it('TL-11 a trusted request is still trusted by a source rebuilt over the same store', async () => {
    const { store } = observed()
    const outcome = await bound(source(store).issuer)
    expect(await source(store).guard.verify(verifyInput(outcome))).toEqual({ kind: 'trusted' })
  })

  it('TL-11 a changed scope, consumer or argument makes the request forged', async () => {
    const { store } = observed()
    const { issuer, guard } = source(store)
    const outcome = await bound(issuer)
    const base = verifyInput(outcome)
    const changes: readonly [string, Partial<FixedToolRequest>][] = [
      ['scope key', { scope: { ...base.request.scope, key: 'other-key' } }],
      ['scope owner', { scope: { ...base.request.scope, owner: 'other-owner' } }],
      ['consumer', { consumer: { ...base.request.consumer, position: 'position-9' } }],
      ['arguments', { arguments: { original: '{}', effective: '{}', complete: true } }],
    ]
    for (const [name, change] of changes) {
      const verdict = await guard.verify({ ...base, request: { ...base.request, ...change } })
      expect(verdict, name).toMatchObject({ kind: 'forged' })
    }
  })

  it('TL-11 a call or admission operation other than the issued ones is forged', async () => {
    const { store } = observed()
    const { issuer, guard } = source(store)
    const outcome = await bound(issuer)
    const other = decodeToolOperationId('admit-other')
    if ('failure' in other) throw new Error('fixture identity')
    expect(await guard.verify({ ...verifyInput(outcome), operation: other.ok })).toMatchObject({
      kind: 'forged',
    })
    const otherCall = await bound(
      issuer,
      resolveInput({
        request: invokeRequest({
          consumer: {
            owner: 'consumer',
            work: 'work-1',
            position: 'position-2',
            purpose: 'tool-result',
          },
        }),
      }),
    )
    expect(await guard.verify({ ...verifyInput(outcome), call: otherCall.call })).toMatchObject({
      kind: 'forged',
    })
  })

  it('TL-11 a source that was never issued, or issued in another tenant, is forged', async () => {
    const { store } = observed()
    const { issuer, guard } = source(store)
    const outcome = await bound(issuer)
    expect(await guard.verify(verifyInput(outcome, { tenant: tenantB }))).toMatchObject({
      kind: 'forged',
    })
    const empty = source(observed().store).guard
    expect(await empty.verify(verifyInput(outcome))).toMatchObject({ kind: 'forged' })
  })

  it('TL-11 a different subject is forged', async () => {
    const { store } = observed()
    const { issuer, guard } = source(store)
    const outcome = await bound(issuer)
    expect(await guard.verify(verifyInput(outcome, { principal: mallory }))).toMatchObject({
      kind: 'forged',
    })
  })

  it('TL-11 a binding that cannot be read is unavailable, whether the store answers or throws', async () => {
    const { store, arm } = observed()
    const { issuer, guard } = source(store)
    const outcome = await bound(issuer)
    arm('read-unavailable')
    expect(await guard.verify(verifyInput(outcome))).toMatchObject({ kind: 'unavailable' })
    arm('read-throws')
    const thrown = await guard.verify(verifyInput(outcome))
    expect(thrown).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(thrown)).not.toContain('secret')
  })

  it('TL-11 a stored binding of another shape is unavailable, not forged', async () => {
    const { store, memory } = observed()
    const { issuer, guard } = source(store)
    const outcome = await bound(issuer)
    const domain: LedgerDomain = {
      kind: 'host',
      tenant: tenantA,
      key: INVOCATION_SOURCE_DOMAIN_KEY,
    }
    const read = await memory.read(domain)
    if (read.kind !== 'complete') throw new Error('fixture read failed')
    const [stored] = read.records
    if (stored?.kind !== 'host') throw new Error('fixture: expected a host record')
    const next = decodeToolRevision((BigInt(read.revision) + 1n).toString())
    if ('failure' in next) throw new Error('fixture revision')
    const committed = await memory.commit({
      domain,
      expected: read.revision,
      revision: next.ok,
      writes: [
        { kind: 'put', record: { kind: 'host', host: { key: stored.host.key, value: 'x' } } },
      ],
    })
    if (committed.kind !== 'committed') throw new Error('fixture commit failed')
    expect(await guard.verify(verifyInput(outcome))).toMatchObject({ kind: 'unavailable' })
  })

  it('TL-11 a stored principal that the codec cannot decode is unavailable, not forged', async () => {
    const { store } = observed()
    const outcome = await bound(source(store).issuer)
    const refusing: PrincipalCodec<P> = {
      encode: codec.encode,
      decode: () => fail({ reason: 'changed codec' }),
    }
    const rebuilt = createLocalInvocationSource<P>({
      store,
      authority: authority(),
      principalCodec: refusing,
      commitAttempts: 4,
    })
    expect(await rebuilt.guard.verify(verifyInput(outcome))).toMatchObject({
      kind: 'unavailable',
    })
  })

  it('TL-11 an authority that cannot compare subjects makes verification unavailable', async () => {
    const { store } = observed()
    const outcome = await bound(source(store).issuer)
    const broken: ToolInvokeAuthority<P> = {
      ...authority(),
      samePrincipal: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'adapter down' }),
    }
    expect(await source(store, broken).guard.verify(verifyInput(outcome))).toMatchObject({
      kind: 'unavailable',
    })
  })
})

describe('TL-11 operation identities', () => {
  it('TL-11 every new operation is a legal operation identity that was not returned before', async () => {
    const identities = createLocalOperationIdentities()
    const seen = new Set<string>()
    for (let index = 0; index < 20; index += 1) {
      const minted = await identities.newOperation()
      if ('failure' in minted) throw new Error('mint failed')
      expect('ok' in decodeToolOperationId(minted.ok)).toBe(true)
      seen.add(minted.ok)
    }
    expect(seen.size).toBe(20)
  })

  it('TL-11 two mints that were built separately do not return the same value', async () => {
    const [one, two] = [createLocalOperationIdentities(), createLocalOperationIdentities()]
    const [a, b] = [await one.newOperation(), await two.newOperation()]
    expect('ok' in a && 'ok' in b && a.ok !== b.ok).toBe(true)
  })
})
