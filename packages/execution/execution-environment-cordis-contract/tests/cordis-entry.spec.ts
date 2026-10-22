import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  createRecoveryAccess,
  type AcquisitionState,
  type EnvironmentBinding,
  type Rejected,
} from '@omne-harness/execution-environment-contract'
import {
  ExecutionEnvironmentService,
  ExecutionRecoveryAuthorityService,
  executionEnvironmentKey,
  executionRecoveryAuthorityKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'

type ScopeText = Extract<EnvironmentBinding, { kind: 'session_sandbox' }>['scope']['ref']

function isScopeText(text: string): text is ScopeText {
  return text.length > 0
}

function scopeRef(text: string): ScopeText {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return text
}

it('writes the service key once, on the abstract Service', () => {
  expect(executionEnvironmentKey).toBe('executionEnvironment')
  expect(ExecutionEnvironmentService.provide).toBe(executionEnvironmentKey)
})

it('exports only the public Cordis definitions', async () => {
  const cordis: Record<string, unknown> =
    await import('@omne-harness/execution-environment-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'CallerClassMismatch',
    'ExecutionEnvironmentService',
    'ExecutionRecoveryAuthorityService',
    'executionEnvironmentKey',
    'executionRecoveryAuthorityKey',
    'faceCallers',
    'operationFaces',
  ])
})

it('writes the recovery authority key once, on its abstract Service, and provides it from a loaded subclass', async () => {
  expect(executionRecoveryAuthorityKey).toBe('executionRecoveryAuthority')
  expect(ExecutionRecoveryAuthorityService.provide).toBe(executionRecoveryAuthorityKey)
  class Authority extends ExecutionRecoveryAuthorityService {
    async authorizeRecovery(): Promise<'notAuthorized'> {
      return 'notAuthorized'
    }
  }
  const ctx = new Context()
  const fiber = await ctx.plugin(Authority)
  const authority = ctx.get(executionRecoveryAuthorityKey)
  expect(authority).toBeInstanceOf(Authority)
  expect(
    await authority?.authorizeRecovery(createRecoveryAccess(), { ref: scopeRef('scope-1') }, []),
  ).toBe('notAuthorized')
  await fiber.dispose()
  expect(ctx.get(executionRecoveryAuthorityKey)).toBeUndefined()
})

it('registers a subclass under the key on the fiber that loads it and removes it on unload', async () => {
  const refused: Rejected = { kind: 'rejected', reason: 'unavailable' }
  const unrecorded: AcquisitionState = { kind: 'unrecorded' }
  class Probe extends ExecutionEnvironmentService<unknown> {
    protected async onResolvePlacement() {
      return refused
    }
    protected async onAcquire() {
      return refused
    }
    protected async onInspectAcquisition() {
      return unrecorded
    }
    protected async onDescribe() {
      return []
    }
    protected async onRecoverOwned() {
      return refused
    }
    protected async onReleaseScope() {
      return refused
    }
    protected onRegisterFacility() {
      return async () => undefined
    }
    protected onRegisterProvider() {
      return async () => undefined
    }
  }
  const ctx = new Context()
  const fiber = await ctx.plugin(Probe)
  expect(ctx.get(executionEnvironmentKey)).toBeInstanceOf(Probe)
  await fiber.dispose()
  expect(ctx.get(executionEnvironmentKey)).toBeUndefined()
})

// Templates preserve the caller context while delegating to implementation hooks.
class FaceProbe extends ExecutionEnvironmentService<unknown> {
  readonly calls: string[] = []
  readonly registrations = new Set<string>()
  protected async onResolvePlacement() {
    this.calls.push('resolvePlacement')
    return { kind: 'rejected', reason: 'unavailable' } as const
  }
  protected async onAcquire() {
    this.calls.push('acquire')
    return { kind: 'rejected', reason: 'unavailable' } as const
  }
  protected async onInspectAcquisition() {
    this.calls.push('inspectAcquisition')
    return { kind: 'unrecorded' } as const
  }
  protected async onDescribe() {
    this.calls.push('describe')
    return []
  }
  protected async onRecoverOwned() {
    this.calls.push('recoverOwned')
    return { kind: 'rejected', reason: 'unavailable' } as const
  }
  protected async onReleaseScope() {
    this.calls.push('releaseScope')
    return { kind: 'rejected', reason: 'unavailable' } as const
  }
  protected onRegisterFacility<
    K extends import('@omne-harness/execution-environment-contract').FacilityKey,
  >(descriptor: import('@omne-harness/execution-environment-contract').FacilityDescriptor<K>) {
    this.calls.push('registerFacility')
    const dispose = this.ctx.effect(() => {
      this.registrations.add(descriptor.key)
      return () => {
        this.registrations.delete(descriptor.key)
      }
    })
    return () => Promise.resolve(dispose())
  }
  protected onRegisterProvider(
    provider: import('@omne-harness/execution-environment-contract').EnvironmentProvider,
  ) {
    this.calls.push('registerProvider')
    const dispose = this.ctx.effect(() => {
      this.registrations.add(provider.name)
      return () => {
        this.registrations.delete(provider.name)
      }
    })
    return () => Promise.resolve(dispose())
  }
}
async function invocationFixture() {
  const { resolvePlacementParamsSchema, acquisitionRef, originRef, commandFacility } =
    await import('@omne-harness/execution-environment-contract')
  const {
    createMemoryResourceLedger,
    createScriptedFacilityGuard,
    createScriptedEnvironmentProvider,
  } = await import('@omne-harness/execution-environment-contract/testing')
  const parsed = await resolvePlacementParamsSchema['~standard'].validate([
    {
      principal: 'test',
      tenant: JSON.stringify({
        organization: 'org_0123456789abcdefghjkmnpqrs',
        account: 'acc_0123456789abcdefghjkmnpqrs',
      }),
    },
    {
      scope: { ref: 'test-scope' },
      requirement: {
        allowedBindings: [{ kind: 'host_machine' }],
        facilities: ['command'],
        isolation: [],
      },
    },
  ])
  if (parsed.issues) throw new Error('invalid fixture')
  const [access, input] = parsed.value
  const provider = createScriptedEnvironmentProvider()
  const placement: import('@omne-harness/execution-environment-contract').Placement = {
    kind: 'placement',
    requirement: input.requirement,
    binding: { kind: 'host_machine' },
    provider: { name: provider.name, generation: provider.generation, version: provider.version },
    continuity: provider.continuity,
  }
  return {
    access,
    input,
    provider,
    commandFacility,
    acquisition: acquisitionRef('fixture-acquisition'),
    acquire: {
      acquisition: acquisitionRef('fixture-acquisition'),
      origin: originRef('fixture-origin'),
      scope: input.scope,
      placement,
      ledger: createMemoryResourceLedger().ledger,
      guard: createScriptedFacilityGuard(),
    },
    recovery: createRecoveryAccess(),
  }
}
for (const caller of ['integrator', 'maintainer', 'provider', 'admin', undefined] as const)
  it(`checks all eight templates for caller ${String(caller)}`, async () => {
    const { CallerClassMismatch } =
      await import('@omne-harness/execution-environment-cordis-contract/cordis')
    const ctx = new Context()
    const serviceFiber = await ctx.plugin(FaceProbe)
    const fixture = await invocationFixture()
    let service: ExecutionEnvironmentService<unknown> | undefined
    const contributor = await ctx.plugin({
      name: 'caller',
      inject:
        caller === undefined
          ? [executionEnvironmentKey]
          : { [executionEnvironmentKey]: { caller } },
      apply(inner: Context) {
        service = inner.executionEnvironment
      },
    })
    try {
      if (!service) throw new Error('caller did not activate')
      const root = ctx.get(executionEnvironmentKey)
      if (!(root instanceof FaceProbe)) throw new Error('no probe')
      const environmental = [
        await service.resolvePlacement(fixture.access, fixture.input),
        await service.acquire(fixture.access, fixture.acquire),
        await service.inspectAcquisition(fixture.access, fixture.acquisition),
        await service.describe(fixture.access, fixture.input.scope),
      ]
      const recoveries = [
        await service.recoverOwned(fixture.input.scope, fixture.recovery),
        await service.releaseScope(fixture.input.scope, fixture.recovery),
      ]
      const environmentAllowed = caller === undefined || caller === 'integrator'
      const recoveryAllowed = caller === undefined || caller === 'maintainer'
      if (!environmentAllowed)
        for (const answer of environmental)
          expect(answer).toEqual({ kind: 'rejected', reason: 'callerMismatch' })
      if (!recoveryAllowed)
        for (const answer of recoveries)
          expect(answer).toEqual({ kind: 'rejected', reason: 'callerMismatch' })
      expect(
        root.calls.filter(name =>
          ['resolvePlacement', 'acquire', 'inspectAcquisition', 'describe'].includes(name),
        ),
      ).toHaveLength(environmentAllowed ? 4 : 0)
      expect(
        root.calls.filter(name => ['recoverOwned', 'releaseScope'].includes(name)),
      ).toHaveLength(recoveryAllowed ? 2 : 0)
      if (caller === 'provider') {
        const removeFacility = service.registerFacility(fixture.commandFacility)
        const removeProvider = service.registerProvider(fixture.provider)
        expect(root.registrations.size).toBe(2)
        await removeFacility()
        expect(root.registrations.size).toBe(1)
        await removeProvider()
        expect(root.registrations.size).toBe(0)
      } else {
        expect(() => service?.registerFacility(fixture.commandFacility)).toThrow(
          CallerClassMismatch,
        )
        expect(() => service?.registerProvider(fixture.provider)).toThrow(CallerClassMismatch)
        expect(root.calls).not.toContain('registerFacility')
        expect(root.calls).not.toContain('registerProvider')
      }
    } finally {
      await contributor.dispose()
      await serviceFiber.dispose()
    }
  })
it('inherits an ancestor declaration and applies the face checks', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(FaceProbe)
  const fixture = await invocationFixture()
  let inherited: ExecutionEnvironmentService<unknown> | undefined
  const parent = ctx.intercept(executionEnvironmentKey, { caller: 'maintainer' })
  const consumer = await parent.plugin({
    name: 'inherited',
    inject: [executionEnvironmentKey],
    apply(inner: Context) {
      inherited = inner.executionEnvironment
    },
  })
  try {
    if (!inherited) throw new Error('missing inherited caller')
    expect(await inherited.recoverOwned(fixture.input.scope, fixture.recovery)).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(await inherited.describe(fixture.access, fixture.input.scope)).toEqual({
      kind: 'rejected',
      reason: 'callerMismatch',
    })
  } finally {
    await consumer.dispose()
    await provider.dispose()
  }
})
it('template delegation keeps registration effects on the caller fiber', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(FaceProbe)
  const fixture = await invocationFixture()
  const contributor = await ctx.plugin({
    name: 'contributor',
    inject: { [executionEnvironmentKey]: { caller: 'provider' } },
    apply(inner: Context) {
      inner.executionEnvironment.registerFacility(fixture.commandFacility)
    },
  })
  const service = ctx.get(executionEnvironmentKey)
  if (!(service instanceof FaceProbe)) throw new Error('no probe')
  expect(service.registrations.has('command')).toBe(true)
  await contributor.dispose()
  expect(service.registrations.size).toBe(0)
  expect(ctx.get(executionEnvironmentKey)).toBeInstanceOf(FaceProbe)
  await provider.dispose()
})
it('inject-object-config-reaches-service-resolve-config', async () => {
  const { Service } = await import('@deepseek-ai/cordis')
  class ConfigProbe extends FaceProbe {
    configuration(): unknown {
      return this[Service.resolveConfig]()
    }
  }
  const ctx = new Context()
  const provider = await ctx.plugin(ConfigProbe)
  const readings: unknown[] = []
  const first = await ctx.plugin({
    name: 'first',
    inject: { [executionEnvironmentKey]: { caller: 'integrator' } },
    apply(inner: Context) {
      const service = inner.get(executionEnvironmentKey)
      if (!(service instanceof ConfigProbe)) throw new Error('no config probe')
      readings.push(service.configuration())
    },
  })
  const second = await ctx.plugin({
    name: 'second',
    inject: { [executionEnvironmentKey]: { caller: 'maintainer' } },
    apply(inner: Context) {
      const service = inner.get(executionEnvironmentKey)
      if (!(service instanceof ConfigProbe)) throw new Error('no config probe')
      readings.push(service.configuration())
    },
  })
  const direct = ctx.get(executionEnvironmentKey)
  if (!(direct instanceof ConfigProbe)) throw new Error('no config probe')
  expect(direct.configuration()).toEqual({})
  expect(readings).toEqual([{ caller: 'integrator' }, { caller: 'maintainer' }])
  await first.dispose()
  await second.dispose()
  await provider.dispose()
})

declare module '@deepseek-ai/cordis' {
  interface Events {
    'ee-contract-mechanism-probe'(): void
  }
}
it('emit-filter-selects-listeners-by-extended-ctx', async () => {
  const ctx = new Context()
  const seen: string[] = []
  const consumer = await ctx.plugin({
    name: 'scoped-listeners',
    apply(inner: Context) {
      inner.extend({ probeScope: 'a' }).on('ee-contract-mechanism-probe', () => {
        seen.push('a')
      })
      inner.extend({ probeScope: 'b' }).on('ee-contract-mechanism-probe', () => {
        seen.push('b')
      })
      inner.on(
        'ee-contract-mechanism-probe',
        () => {
          seen.push('global')
        },
        { global: true },
      )
    },
  })
  const dispatch = Object.assign(Object.create(ctx), {
    [Context.filter]: (target: Context) => Reflect.get(target, 'probeScope') === 'a',
  })
  ctx.emit(dispatch, 'ee-contract-mechanism-probe')
  expect(seen).toEqual(['a', 'global'])
  await consumer.dispose()
  ctx.emit(dispatch, 'ee-contract-mechanism-probe')
  expect(seen).toEqual(['a', 'global'])
})
it('ctx-set-does-not-notify', async () => {
  const ctx = new Context()
  let notices = 0
  let runs = 0
  const removeListener = ctx.on('internal/service', name => {
    if (name === 'eeMechanismValue') notices++
  })
  ctx.provide('eeMechanismValue', 1)
  const consumer = await ctx.plugin({
    name: 'set-observer',
    inject: ['eeMechanismValue'],
    apply() {
      runs++
    },
  })
  await new Promise(resolve => setImmediate(resolve))
  expect(notices).toBeGreaterThan(0)
  notices = 0
  ctx.set('eeMechanismValue', 2)
  await new Promise(resolve => setImmediate(resolve))
  expect(ctx.get('eeMechanismValue')).toBe(2)
  expect(notices).toBe(0)
  expect(runs).toBe(1)
  await consumer.dispose()
  await removeListener()
})

it('keeps error details and refuses an explicit undefined caller rather than treating it as absent', async () => {
  const { CallerClassMismatch } =
    await import('@omne-harness/execution-environment-cordis-contract/cordis')
  const ctx = new Context()
  const provider = await ctx.plugin(FaceProbe)
  const fixture = await invocationFixture()
  const scope = ctx.intercept(executionEnvironmentKey, { caller: undefined })
  const service = scope.get(executionEnvironmentKey)
  if (!service) throw new Error('no service')
  expect(await service.describe(fixture.access, fixture.input.scope)).toEqual({
    kind: 'rejected',
    reason: 'callerMismatch',
  })
  try {
    service.registerProvider(fixture.provider)
    throw new Error('registration should refuse')
  } catch (error) {
    expect(error).toBeInstanceOf(CallerClassMismatch)
    expect(error).toMatchObject({
      name: 'CallerClassMismatch',
      message: 'Caller declaration does not match registerProvider; expected provider',
      operation: 'registerProvider',
      expected: 'provider',
      declared: undefined,
    })
  }
  await provider.dispose()
})
