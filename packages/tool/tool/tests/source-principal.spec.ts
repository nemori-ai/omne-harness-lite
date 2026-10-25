import { describe, expect, it } from 'vitest'
import { createToolRuntime, type ToolInvokeAuthority } from '@omne-harness/tool'
import {
  createTestInvocationSource,
  createTestToolDependencies,
  createTestToolIdentities,
} from '@omne-harness/tool/testing'
import { type ToolInvokeOutcome } from '@omne-harness/tool-contract'
import { readToolInvocationRef } from '@omne-harness/tool-contract/provider'
import {
  configuration,
  dummyRequest,
  guards,
  principalA,
  tenantA,
  invokeAuthority,
} from './runtime-values.ts'

function accepted(outcome: ToolInvokeOutcome) {
  if (outcome.kind !== 'accepted') throw new Error(JSON.stringify(outcome))
  return outcome
}

function assembly<P>(input: {
  authority: ToolInvokeAuthority<P>
  snapshotPrincipal: (principal: P) => P
  beforeIssue?: () => void
}) {
  const source = createTestInvocationSource(input)
  const config = configuration()
  const missing = (): never => {
    throw new Error('not on the logical terminal path')
  }
  const ids = createTestToolIdentities()
  const qualify = (principal: P, tenant: typeof tenantA) =>
    input.authority.qualify({ principal, tenant, consumer: dummyRequest().consumer })
  const original = guards()
  const dependencies = createTestToolDependencies<P>({
    configuration: config,
    guards: {
      ...original,
      access: { qualify: access => qualify(access.principal, access.tenant) },
      sources: source.guard,
      grants: new Map([
        [
          'scope-owner',
          {
            verifyGrant: async access => {
              const verdict = await qualify(access.principal, access.tenant)
              return verdict.kind === 'allowed'
                ? { kind: 'granted' }
                : verdict.kind === 'denied'
                  ? { kind: 'refused', reason: verdict.reason }
                  : verdict
            },
          },
        ],
      ]),
      starts: { qualifyStart: async () => ({ kind: 'allowed' }) },
    },
    instances: {
      install: () => ({ release: async () => {} }),
      schedule: missing,
      publish: missing,
      withdraw: missing,
      directory: { connect: missing },
    },
    catalog: { inspect: missing, usage: missing, search: missing },
    children: {
      reserve: missing,
      admitted: missing,
      retain: missing,
      list: missing,
      close: missing,
      closure: missing,
      confirmBarrier: missing,
      finish: missing,
    },
    operationIdentities: ids.operationIdentities,
    sourceIssuer: source.issuer,
    bindingsFor: () => ({ inspect: missing, resolve: missing, recover: missing }),
  })
  const runtime = createToolRuntime(dependencies.dependencies, config).runtime
  return {
    ...dependencies,
    source,
    runtime,
    invoke: (principal: P) =>
      runtime.invoke({ principal, tenant: tenantA, request: dummyRequest() }),
  }
}

class Credential {
  constructor(public subject: string) {}
  subjectId() {
    return this.subject
  }
}

const authority: ToolInvokeAuthority<Credential> = {
  qualify: async ({ principal, tenant, consumer }) =>
    tenant === tenantA && consumer.owner === 'consumer' && principal.subjectId() === 'alice'
      ? { kind: 'allowed' }
      : { kind: 'denied', reason: 'not-qualified' },
  samePrincipal: async ({ current, original }) =>
    current.subjectId() === original.subjectId()
      ? { kind: 'allowed' }
      : { kind: 'denied', reason: 'different-subject' },
}
const snapshotPrincipal = (principal: Credential) => new Credential(principal.subjectId())

function gate() {
  let release = () => {}
  const waiting = new Promise<void>(resolve => {
    release = resolve
  })
  return { waiting, release }
}

const sharedWorkAuthority: ToolInvokeAuthority<Credential> = {
  ...authority,
  qualify: async ({ principal, tenant, consumer }) =>
    tenant === tenantA &&
    consumer.owner === 'consumer' &&
    ['alice', 'bob'].includes(principal.subjectId())
      ? { kind: 'allowed' }
      : { kind: 'denied', reason: 'not-qualified' },
}

describe('semantic principal snapshots in the paired non-durable source', () => {
  it('preserves class credential behavior through source qualification and real ledger admission', async () => {
    const a = assembly({ authority, snapshotPrincipal })
    const first = accepted(await a.invoke(new Credential('alice')))
    expect(accepted(await a.invoke(new Credential('alice')))).toEqual({ ...first, recovered: true })
    expect(a.source.bindings()[0]?.principal.subjectId()).toBe('alice')
  })

  it('accepts trusted immutable opaque credentials without cloning or serializing them', async () => {
    const token = Object.freeze({ authenticate: () => 'alice', unencodable: 1n })
    const trusted = new WeakSet<object>([token])
    const opaqueAuthority: ToolInvokeAuthority<typeof token> = {
      qualify: async ({ principal, tenant }) =>
        tenant === tenantA && trusted.has(principal)
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'untrusted-token' },
      samePrincipal: async ({ current, original }) =>
        trusted.has(current) &&
        trusted.has(original) &&
        current.authenticate() === original.authenticate()
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
    }
    // This token and its authentication closure are immutable. Identity-preserving reuse keeps
    // its issuer registration valid; subject comparison still uses the authenticated subject.
    const a = assembly({ authority: opaqueAuthority, snapshotPrincipal: principal => principal })
    const first = accepted(await a.invoke(token))
    expect(accepted(await a.invoke(token))).toEqual({ ...first, recovered: true })
    expect(a.source.bindings()[0]?.principal).toBe(token)
  })
  it('keeps the original subject after the caller mutates an earlier credential', async () => {
    const a = assembly({ authority: sharedWorkAuthority, snapshotPrincipal })
    const credential = new Credential('alice')
    const first = accepted(await a.invoke(credential))
    credential.subject = 'bob'
    expect(accepted(await a.invoke(new Credential('alice')))).toEqual({ ...first, recovered: true })
    expect(await a.invoke(credential)).toEqual({
      kind: 'rejected',
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(a.source.bindings()[0]?.principal.subjectId()).toBe('alice')
  })

  it('captures the source subject before qualification waits while the ledger still checks the actual current credential', async () => {
    const entered = gate()
    const resume = gate()
    let wait = true
    const a = assembly({
      snapshotPrincipal,
      authority: {
        ...sharedWorkAuthority,
        qualify: async input => {
          const subject = input.principal.subjectId()
          if (wait) {
            entered.release()
            await resume.waiting
          }
          expect(input.principal.subjectId()).toBe(subject)
          return sharedWorkAuthority.qualify(input)
        },
      },
    })
    const current = new Credential('alice')
    const pending = a.invoke(current)
    await entered.waiting
    current.subject = 'bob'
    wait = false
    resume.release()
    expect(await pending).toEqual({
      kind: 'rejected',
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(a.store.commits).toBe(0)
    const original = a.source.bindings()[0]
    if (original === undefined) throw new Error('missing original source')
    expect(original.principal.subjectId()).toBe('alice')
    const recovered = accepted(await a.invoke(new Credential('alice')))
    expect(readToolInvocationRef(recovered.reference).call).toBe(original.call)
    expect(recovered.recovered).toBe(true)
  })

  it('uses a fixed current source view while a reentry principal comparison waits', async () => {
    const entered = gate()
    const resume = gate()
    let wait = false
    const a = assembly({
      snapshotPrincipal,
      authority: {
        ...sharedWorkAuthority,
        samePrincipal: async input => {
          if (wait) {
            entered.release()
            await resume.waiting
          }
          return sharedWorkAuthority.samePrincipal(input)
        },
      },
    })
    const first = accepted(await a.invoke(new Credential('alice')))
    wait = true
    const current = new Credential('alice')
    const resolving = a.source.issuer.resolve({
      principal: current,
      tenant: tenantA,
      request: dummyRequest(),
    })
    await entered.waiting
    current.subject = 'bob'
    resume.release()
    const resolved = await resolving
    expect(resolved).toMatchObject({
      kind: 'bound',
      recovered: true,
      call: readToolInvocationRef(first.reference).call,
    })
    const binding = a.source.bindings()[0]
    if (binding === undefined) throw new Error('missing original source')
    expect(
      await a.source.guard.verify({
        principal: current,
        tenant: tenantA,
        call: binding.call,
        operation: binding.admission,
        request: { ...binding.request, invocation: binding.invocation },
      }),
    ).toMatchObject({ kind: 'forged' })
  })

  it('isolates diagnostic principals, tenants, requests and source evidence from live source records', async () => {
    const a = assembly({ authority: sharedWorkAuthority, snapshotPrincipal })
    const first = accepted(await a.invoke(new Credential('alice')))
    const diagnostic = a.source.bindings()[0]
    if (diagnostic === undefined) throw new Error('missing diagnostic')
    const expected = {
      tenant: structuredClone(diagnostic.tenant),
      request: structuredClone(diagnostic.request),
      invocation: structuredClone(diagnostic.invocation),
    }
    diagnostic.principal.subject = 'bob'
    Object.assign(diagnostic.tenant.account, { text: 'forged-account' })
    Object.assign(diagnostic.request.consumer, { work: 'forged-work' })
    Object.assign(diagnostic.invocation.source, {
      record: 'forged-source',
      digest: 'forged-digest',
    })
    const retained = a.source.bindings()[0]
    expect(retained?.principal.subjectId()).toBe('alice')
    expect(retained?.tenant).toEqual(expected.tenant)
    expect(retained?.request).toEqual(expected.request)
    expect(retained?.invocation).toEqual(expected.invocation)
    expect(accepted(await a.invoke(new Credential('alice')))).toEqual({ ...first, recovered: true })
    expect(await a.invoke(new Credential('bob'))).toEqual({
      kind: 'rejected',
      failure: { kind: 'denied', action: 'admit' },
    })
  })

  it('rejects snapshot failure without qualifying, allocating or writing a source association', async () => {
    let failSnapshot = true
    let qualified = 0
    const a = assembly({
      authority: {
        ...authority,
        qualify: input => {
          qualified += 1
          return authority.qualify(input)
        },
      },
      snapshotPrincipal: principal => {
        if (failSnapshot) throw new Error('private credential snapshot failure')
        return snapshotPrincipal(principal)
      },
    })
    const rejected = await a.invoke(new Credential('alice'))
    expect(rejected).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', dependency: 'principal-snapshot' },
    })
    expect(JSON.stringify(rejected)).not.toContain('private credential')
    expect(qualified).toBe(0)
    expect(a.source.bindings()).toHaveLength(0)
    expect(a.store.reads + a.store.commits).toBe(0)
    failSnapshot = false
    expect(accepted(await a.invoke(new Credential('alice'))).recovered).toBe(false)
    expect(a.source.bindings()).toHaveLength(1)
  })

  it('resumes a real reserved association after a synchronous issuance fault', async () => {
    let attempts = 0
    const a = assembly({
      authority: invokeAuthority(),
      snapshotPrincipal: principal => ({ ...principal, tenants: [...principal.tenants] }),
      beforeIssue: () => {
        if (++attempts === 1) throw new Error('private issuance fault')
      },
    })
    const lost = await a.invoke(principalA)
    expect(lost.kind).toBe('commit-unknown')
    if (lost.kind !== 'commit-unknown') throw new Error(JSON.stringify(lost))
    expect(a.source.bindings()).toHaveLength(0)
    expect(a.store.commits).toBe(0)
    const recovered = accepted(await a.invoke(principalA))
    expect(recovered.reference).toBe(lost.reference)
    expect(recovered.recovered).toBe(true)
    expect(a.source.bindings()).toHaveLength(1)
    expect(accepted(await a.invoke(principalA))).toEqual(recovered)
    expect(attempts).toBe(2)
  })
})
