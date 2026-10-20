import { describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolRuntime } from '@omne-harness/tool'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  type ToolDefiniteFailure,
  type ToolFailure,
  type ToolInvocationCommands,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import { testAssembly } from './testing-values.ts'
import {
  dummyRequest,
  evidence,
  operationId,
  ok,
  principalA,
  referenceFor,
  request,
  tenantA,
  type Principal,
} from './runtime-values.ts'

function observedAssembly() {
  const base = testAssembly()
  return {
    ...base,
    dependencies: {
      ...base.dependencies,
      admissions: { ...base.dependencies.admissions },
      commands: { ...base.dependencies.commands },
    },
  }
}

const preservedFailures = [
  { name: 'denied', failure: { kind: 'denied', action: 'provider-specific' } },
  {
    name: 'invalid',
    failure: { kind: 'invalid', field: 'provider-field', reason: 'provider-reason' },
  },
] satisfies readonly Readonly<{ name: string; failure: ToolDefiniteFailure }>[]

const sourceFailures = [
  ...preservedFailures,
  {
    name: 'unavailable',
    failure: {
      kind: 'unavailable',
      dependency: 'source-store',
      diagnostic: 'source store offline',
    },
  },
] satisfies readonly Readonly<{ name: string; failure: ToolDefiniteFailure }>[]

describe('invoke provider failures', () => {
  it.each(preservedFailures)(
    'preserves an identity provider $name before source issuance or admission',
    async ({ failure }) => {
      const base = observedAssembly()
      const bind = vi.spyOn(base.dependencies.sourceIssuer, 'bind')
      const admit = vi.spyOn(base.dependencies.admissions, 'admit')
      const runtime = createToolRuntime(
        {
          ...base.dependencies,
          invocationIdentities: { newInvocation: () => Promise.resolve(fail(failure)) },
        },
        base.configuration,
      ).runtime
      expect(
        await runtime.invoke({ principal: principalA, tenant: tenantA, request: request() }),
      ).toEqual({ kind: 'rejected', failure })
      expect(bind).not.toHaveBeenCalled()
      expect(admit).not.toHaveBeenCalled()
      expect(base.host.scheduled).toHaveLength(0)
    },
  )

  it('rejects a legal call paired with an illegal admission before source issuance or admission', async () => {
    const base = observedAssembly()
    base.identities.planInvocation('legal-call', 'has space')
    const bind = vi.spyOn(base.dependencies.sourceIssuer, 'bind')
    const admit = vi.spyOn(base.dependencies.admissions, 'admit')
    const runtime = createToolRuntime(base.dependencies, base.configuration).runtime
    expect(
      await runtime.invoke({ principal: principalA, tenant: tenantA, request: request() }),
    ).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', dependency: 'toolIdentities' },
    })
    expect(bind).not.toHaveBeenCalled()
    expect(admit).not.toHaveBeenCalled()
    expect(base.host.scheduled).toHaveLength(0)
  })

  it.each(sourceFailures)(
    'preserves a source issuer $name without sending admission',
    async ({ failure }) => {
      const base = observedAssembly()
      const admit = vi.spyOn(base.dependencies.admissions, 'admit')
      const runtime = createToolRuntime(
        {
          ...base.dependencies,
          sourceIssuer: { bind: () => Promise.resolve(fail(failure)) },
        },
        base.configuration,
      ).runtime
      expect(
        await runtime.invoke({ principal: principalA, tenant: tenantA, request: request() }),
      ).toEqual({ kind: 'rejected', failure })
      expect(admit).not.toHaveBeenCalled()
      expect(base.host.scheduled).toHaveLength(0)
    },
  )

  it.each(['unknown', 'throw'] as const)(
    'names the source dependency after issuer %s and never sends admission',
    async fault => {
      const base = observedAssembly()
      const admit = vi.spyOn(base.dependencies.admissions, 'admit')
      const secret = 'private issuer connection string'
      const runtime = createToolRuntime(
        {
          ...base.dependencies,
          sourceIssuer: {
            bind: () =>
              fault === 'throw'
                ? Promise.reject(new Error(secret))
                : Promise.resolve(
                    fail({ kind: 'commit-unknown', operation: operationId('source-operation') }),
                  ),
          },
        },
        base.configuration,
      ).runtime
      const outcome = await runtime.invoke({
        principal: principalA,
        tenant: tenantA,
        request: request(),
      })
      expect(outcome).toMatchObject({
        kind: 'rejected',
        failure: {
          kind: 'unavailable',
          dependency: 'toolInvocationSource',
          diagnostic: expect.any(String),
        },
      })
      if (outcome.kind !== 'rejected' || outcome.failure.kind !== 'unavailable')
        throw new Error('expected unavailable source')
      expect(outcome.failure.diagnostic.length).toBeGreaterThan(0)
      expect(outcome.failure.diagnostic).not.toContain(secret)
      expect(admit).not.toHaveBeenCalled()
      expect(base.host.scheduled).toHaveLength(0)
    },
  )

  it('does not schedule a successfully admitted settled call', async () => {
    const base = observedAssembly()
    const admit = vi.spyOn(base.dependencies.admissions, 'admit')
    const schedule = vi.spyOn(base.dependencies.instances, 'schedule')
    const runtime = createToolRuntime(base.dependencies, base.configuration).runtime
    const outcome = await runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: dummyRequest(),
    })
    expect(outcome).toMatchObject({ kind: 'accepted', state: { phase: 'settled' } })
    expect(admit).toHaveBeenCalledOnce()
    expect(schedule).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'null', input: null },
    { name: 'primitive', input: 1 },
    { name: 'missing principal', input: { tenant: tenantA, request: request() } },
  ])('rejects $name invoke input before allocating identities', async ({ input }) => {
    const base = observedAssembly()
    const mint = vi.spyOn(base.dependencies.invocationIdentities, 'newInvocation')
    const bind = vi.spyOn(base.dependencies.sourceIssuer, 'bind')
    const admit = vi.spyOn(base.dependencies.admissions, 'admit')
    const runtime = createToolRuntime(base.dependencies, base.configuration).runtime
    // @ts-expect-error Deliberately submit an untyped caller input to the public boundary.
    expect(await runtime.invoke(input)).toEqual({
      kind: 'rejected',
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(mint).not.toHaveBeenCalled()
    expect(bind).not.toHaveBeenCalled()
    expect(admit).not.toHaveBeenCalled()
  })
})

const operationFailures = [
  ...preservedFailures.map(testCase => ({ ...testCase, expected: testCase.failure })),
  {
    name: 'unavailable',
    failure: { kind: 'unavailable', dependency: 'identity-store', diagnostic: 'offline' },
    expected: { kind: 'unavailable', dependency: 'toolIdentities', diagnostic: 'offline' },
  },
  {
    name: 'unknown',
    failure: { kind: 'commit-unknown', operation: operationId('unknown-operation') },
    expected: { kind: 'unavailable', dependency: 'toolIdentities' },
  },
] satisfies readonly Readonly<{
  name: string
  failure: ToolFailure
  expected: Partial<ToolDefiniteFailure>
}>[]

const release: Parameters<ToolInvocationCommands<Principal>['releaseDelivery']>[0] = {
  principal: principalA,
  tenant: tenantA,
  reference: referenceFor('call', 'admission'),
  result: ok(decodeToolResultVersion('v1')),
  delivery: ok(decodeToolDeliveryId('d1')),
  consumer: request().consumer,
  evidence: { kind: 'retained', custody: evidence('kept', 'consumer') },
}

describe('release operation identity failures', () => {
  it.each(operationFailures)(
    'rejects $name before sending the delivery command',
    async ({ failure, expected }) => {
      const base = observedAssembly()
      const command = vi.spyOn(base.dependencies.commands, 'releaseDelivery')
      const runtime = createToolRuntime(
        {
          ...base.dependencies,
          operationIdentities: { newOperation: () => Promise.resolve(fail(failure)) },
        },
        base.configuration,
      ).runtime
      const outcome = await runtime.commands.releaseDelivery(release)
      expect(outcome).toMatchObject({ kind: 'rejected', failure: expected })
      if (failure.kind === 'denied' || failure.kind === 'invalid')
        expect(outcome).toEqual({ kind: 'rejected', failure })
      expect(command).not.toHaveBeenCalled()
      expect(base.store.reads + base.store.commits).toBe(0)
    },
  )

  it.each(['throw', 'invalid identity'] as const)(
    'rejects %s before sending the delivery command',
    async fault => {
      const base = observedAssembly()
      const command = vi.spyOn(base.dependencies.commands, 'releaseDelivery')
      const secret = 'private operation identity connection string'
      const runtime = createToolRuntime(
        {
          ...base.dependencies,
          operationIdentities: {
            newOperation: () =>
              fault === 'throw'
                ? Promise.reject(new Error(secret))
                : // This forged brand models a provider violating its identity contract.
                  Promise.resolve(succeed('has space' as ToolOperationId)),
          },
        },
        base.configuration,
      ).runtime
      const outcome = await runtime.commands.releaseDelivery(release)
      expect(outcome).toMatchObject({
        kind: 'rejected',
        failure: {
          kind: 'unavailable',
          dependency: 'toolIdentities',
          diagnostic: expect.any(String),
        },
      })
      if (outcome.kind !== 'rejected' || outcome.failure.kind !== 'unavailable')
        throw new Error('expected unavailable identities')
      expect(outcome.failure.diagnostic.length).toBeGreaterThan(0)
      expect(outcome.failure.diagnostic).not.toContain(secret)
      expect(command).not.toHaveBeenCalled()
      expect(base.store.reads + base.store.commits).toBe(0)
    },
  )
})
