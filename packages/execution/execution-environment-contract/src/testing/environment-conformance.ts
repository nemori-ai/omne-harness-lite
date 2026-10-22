import assert from 'node:assert/strict'
import {
  acquisitionRef,
  originRef,
  commandFacility,
  describeFacility,
  acquireParamsSchema,
  type Access,
  type AcquireInput,
  type Acquired,
  type ExecutionEnvironment,
  type ProviderRegistrations,
  type EnvironmentRequirement,
  type ProviderAcquireInput,
  type EnvironmentBinding,
} from '../index.ts'
import {
  createMemoryResourceLedger,
  createScriptedEnvironmentProvider,
  createScriptedFacilityGuard,
} from './doubles.ts'
import { bounded, NotApplicable, type ConformanceCase } from './case.ts'
export type EnvironmentConformanceSubject<P> = Readonly<{
  environment: ExecutionEnvironment<P> & ProviderRegistrations
  access: Access<P>
  otherAccess?: Access<P>
  scope: ProviderAcquireInput['scope']
  hooks?: { close?(): Promise<void> }
  dispose?(): Promise<void>
}>
export type EnvironmentConformanceOptions<P> = Readonly<{
  subject(): EnvironmentConformanceSubject<P> | Promise<EnvironmentConformanceSubject<P>>
  waitMs?: number
}>
export function executionEnvironmentConformance<P>(
  options: EnvironmentConformanceOptions<P>,
): readonly ConformanceCase[] {
  type S = EnvironmentConformanceSubject<P>
  type Fixture = Awaited<ReturnType<typeof setup>>
  const host: EnvironmentBinding = { kind: 'host_machine' }
  function anotherScope(scope: S['scope']): S['scope'] {
    const ref = scope.ref + '-other'
    function valid(text: string): text is S['scope']['ref'] {
      return text.length > 0
    }
    if (!valid(ref)) throw new TypeError('empty test scope')
    return { ref }
  }
  async function setup(s: S, script: Parameters<typeof createScriptedEnvironmentProvider>[0] = {}) {
    const provider = createScriptedEnvironmentProvider(script)
    const removeFacility = s.environment.registerFacility(commandFacility)
    const removeProvider = s.environment.registerProvider(provider)
    const requirement: EnvironmentRequirement = {
      allowedBindings: [host],
      facilities: ['command'],
      isolation: [],
    }
    const resolved = await s.environment.resolvePlacement(s.access, { scope: s.scope, requirement })
    assert.equal(resolved.kind, 'placement')
    if (resolved.kind !== 'placement') throw new Error('no placement')
    const ledger = createMemoryResourceLedger()
    const guard = createScriptedFacilityGuard<P>()
    const input: AcquireInput<P> = {
      acquisition: acquisitionRef('suite-key'),
      origin: originRef('suite-origin'),
      scope: s.scope,
      placement: resolved,
      ledger: ledger.ledger,
      guard,
    }
    const acquire = () => s.environment.acquire(s.access, input)
    async function acquired(): Promise<Acquired> {
      const a = await acquire()
      assert.equal(a.kind, 'acquired')
      if (a.kind !== 'acquired') throw new Error('no lease')
      return a
    }
    return {
      provider,
      removeFacility,
      removeProvider,
      requirement,
      placement: resolved,
      ledger,
      guard,
      input,
      acquire,
      acquired,
    }
  }
  const make = (name: string, run: (s: S) => Promise<void>): ConformanceCase => ({
    name,
    async run() {
      const s = await options.subject()
      try {
        await bounded(run(s), options.waitMs ?? 1000)
      } finally {
        await s.dispose?.()
      }
    },
  })
  const withFixture = (name: string, run: (s: S, f: Fixture) => Promise<void>) =>
    make(name, async s => run(s, await setup(s)))
  const command = (a: Acquired) => {
    const f = a.lease.facility('command')
    assert.ok(f)
    return f
  }
  const request = (s: S, f: Fixture) => ({
    requestId: 'suite-start',
    origin: f.input.origin,
    access: s.access,
    binding: host,
    executable: 'true',
    args: [],
    cwd: '.',
    env: {},
    outputMode: 'separate' as const,
  })
  return [
    make('V-EE05.adoption-issued-from-verified-receipt', async s => {
      const fake = { forged: true }
      const f = await setup(s, { extraReceiptFields: { adoption: fake } })
      const a = await f.acquired()
      assert.notEqual(a.adoption, fake)
      assert.deepEqual(a.adoption, {
        acquisition: f.input.acquisition,
        origin: f.input.origin,
        placement: f.placement,
        provider: {
          name: f.provider.name,
          generation: f.provider.generation,
          version: f.provider.version,
        },
        instance: a.lease.instance,
        continuity: a.lease.continuity,
        evidence: { kind: 'boolean', value: true },
      })
    }),
    make('V-EE05.mismatched-receipt-binding-is-refused', async s => {
      const f = await setup(s, { receiptBinding: { kind: 'session_sandbox', scope: s.scope } })
      assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'unavailable' })
      assert.equal(f.provider.calls.release, 1)
    }),
    make('V-EE05.receipt-missing-facility-is-refused', async s => {
      const f = await setup(s, { lease: {} })
      assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'unsupportedFacility' })
      assert.equal(f.provider.calls.release, 1)
    }),
    withFixture('V-EE19.repeat-key-returns-same-acquisition', async (_s, f) => {
      const a = await f.acquired(),
        b = await f.acquired()
      assert.equal(a.lease, b.lease)
      assert.equal(a.adoption, b.adoption)
      assert.equal(f.provider.calls.acquire, 1)
    }),
    withFixture('V-EE19.different-placement-same-key-is-conflict', async (s, f) => {
      await f.acquired()
      assert.deepEqual(
        await s.environment.acquire(s.access, {
          ...f.input,
          placement: { ...f.placement, binding: { kind: 'session_sandbox', scope: s.scope } },
        }),
        { kind: 'rejected', reason: 'invalidInput' },
      )
      assert.equal(f.provider.calls.acquire, 1)
    }),
    withFixture('V-EE19.other-tenant-does-not-see-key', async (s, f) => {
      if (!s.otherAccess) throw new NotApplicable('requires another tenant')
      const a = await f.acquired()
      assert.deepEqual(await s.environment.inspectAcquisition(s.otherAccess, f.input.acquisition), {
        kind: 'unrecorded',
      })
      const b = await s.environment.acquire(s.otherAccess, f.input)
      assert.equal(b.kind, 'acquired')
      assert.equal(f.provider.calls.acquire, 2)
      assert.deepEqual(await s.environment.inspectAcquisition(s.access, f.input.acquisition), {
        kind: 'acquired',
        adoption: a.adoption,
      })
    }),
    withFixture('V-EE20.undeclared-key-is-refused', async (s, f) => {
      const requirement = { ...f.requirement, facilities: ['terminal'] as const }
      assert.deepEqual(
        await s.environment.resolvePlacement(s.access, { scope: s.scope, requirement }),
        { kind: 'rejected', reason: 'missingFacility' },
      )
      assert.deepEqual(
        await s.environment.acquire(s.access, {
          ...f.input,
          placement: { ...f.placement, requirement },
        }),
        { kind: 'rejected', reason: 'unsupportedFacility' },
      )
      assert.equal(f.provider.calls.acquire, 0)
    }),
    withFixture('V-EE20.lease-exposes-only-requirement-keys', async (_s, f) => {
      assert.equal((await f.acquired()).lease.facility('terminal'), undefined)
    }),
    withFixture('V-EE20.guarded-operation-asks-guard', async (s, f) => {
      for (const answer of ['notAuthorized', 'unavailable', 'authorized'] as const) {
        const guard = createScriptedFacilityGuard<P>(answer)
        const a = await s.environment.acquire(s.access, {
          ...f.input,
          acquisition: acquisitionRef(answer),
          guard,
        })
        assert.equal(a.kind, 'acquired')
        if (a.kind !== 'acquired') return
        const before = f.provider.calls.start
        const result = await command(a).start(request(s, f))
        assert.equal(guard.calls.length, 1)
        if (answer !== 'authorized') {
          assert.deepEqual(result, { kind: 'rejected', requestId: 'suite-start', reason: answer })
          assert.equal(f.provider.calls.start, before)
        } else assert.equal(f.provider.calls.start, before + 1)
      }
    }),
    withFixture('V-EE20.original-call-mismatch-is-invalid-input', async (s, f) => {
      const a = await f.acquired()
      assert.deepEqual(
        await command(a).start({ ...request(s, f), origin: originRef('other-origin') }),
        { kind: 'rejected', requestId: 'suite-start', reason: 'invalidInput' },
      )
      assert.equal(f.guard.calls.length, 0)
      assert.equal(f.provider.calls.start, 0)
    }),
    withFixture('V-EE20.second-declaration-is-refused', async (s, f) => {
      assert.throws(() =>
        s.environment.registerFacility(describeFacility('command', { start: 'open' })),
      )
      const a = await f.acquired()
      await command(a).start(request(s, f))
      assert.equal(f.guard.calls.length, 1)
    }),
    withFixture('V-EE20.removed-declaration-refuses-held-facility', async (s, f) => {
      const held = command(await f.acquired())
      await f.removeFacility()
      assert.deepEqual(await held.start(request(s, f)), {
        kind: 'rejected',
        requestId: 'suite-start',
        reason: 'unsupported',
      })
      assert.equal(f.provider.calls.start, 0)
    }),
    withFixture('V-EE22.requester-scope-filters-describe', async (s, f) => {
      await f.acquired()
      const list = await s.environment.describe(s.access, s.scope)
      assert.ok(Array.isArray(list))
      assert.equal(list.length, 1)
      const otherScope = anotherScope(s.scope)
      assert.deepEqual(await s.environment.describe(s.access, otherScope), [])
      if (s.otherAccess) assert.deepEqual(await s.environment.describe(s.otherAccess, s.scope), [])
    }),
    withFixture('V-EE22.sandbox-scope-must-equal-requester', async (s, f) => {
      const binding: EnvironmentBinding = { kind: 'session_sandbox', scope: anotherScope(s.scope) }
      const requirement = { ...f.requirement, allowedBindings: [binding] }
      assert.deepEqual(
        await s.environment.resolvePlacement(s.access, { scope: s.scope, requirement }),
        { kind: 'rejected', reason: 'invalidInput' },
      )
      assert.deepEqual(
        await s.environment.acquire(s.access, {
          ...f.input,
          placement: { ...f.placement, binding, requirement },
        }),
        { kind: 'rejected', reason: 'invalidInput' },
      )
      assert.equal(f.provider.calls.acquire, 0)
    }),
    withFixture('V-EE22.describe-after-close-is-owner-stopped', async s => {
      if (!s.hooks?.close) throw new NotApplicable('requires owner close hook')
      await s.hooks.close()
      assert.deepEqual(await s.environment.describe(s.access, s.scope), {
        kind: 'rejected',
        reason: 'ownerStopped',
      })
    }),
    withFixture('V-EE22.closed-ledger-blocks-new-operation', async (s, f) => {
      const a = await f.acquired()
      f.ledger.close()
      assert.deepEqual(await command(a).start(request(s, f)), {
        kind: 'rejected',
        requestId: 'suite-start',
        reason: 'closed',
      })
      assert.equal(f.provider.calls.start, 0)
    }),
    withFixture('V-EE22.unminted-tenant-is-invalid-input', async (s, f) => {
      const forged = { ...s.access, tenant: { ...s.access.tenant } }
      assert.deepEqual(
        await s.environment.resolvePlacement(forged, {
          scope: s.scope,
          requirement: f.requirement,
        }),
        { kind: 'rejected', reason: 'invalidInput' },
      )
      assert.deepEqual(await s.environment.acquire(forged, f.input), {
        kind: 'rejected',
        reason: 'invalidInput',
      })
      assert.deepEqual(await s.environment.describe(forged, s.scope), {
        kind: 'rejected',
        reason: 'invalidInput',
      })
      assert.deepEqual(await s.environment.inspectAcquisition(forged, f.input.acquisition), {
        kind: 'invalidInput',
      })
      assert.deepEqual(await s.environment.inspectAcquisition(s.access, f.input.acquisition), {
        kind: 'unrecorded',
      })
      assert.equal(f.provider.calls.acquire, 0)
    }),
    withFixture('V-EE18.removal-starts-retirement', async (_s, f) => {
      const a = await f.acquired()
      await f.removeProvider()
      assert.equal(f.provider.calls.retire, 1)
      assert.deepEqual(await a.lease.invalidated, { source: 'registry', reason: 'providerRetired' })
      assert.deepEqual(
        await _s.environment.acquire(_s.access, {
          ...f.input,
          acquisition: acquisitionRef('after-retirement'),
        }),
        { kind: 'rejected', reason: 'providerUnavailable' },
      )
    }),
    make('V-EE18.pending-retirement-is-not-completion', async s => {
      let n = 0
      const f = await setup(s, {
        retire: async () => (++n === 1 ? { kind: 'pending', resources: [] } : { kind: 'drained' }),
      })
      await assert.rejects(f.removeProvider())
      await f.removeProvider()
      assert.equal(f.provider.calls.retire, 2)
    }),
    withFixture('V-EE22.params-schema-refusal-has-item-reasons', async (s, f) => {
      const result = await acquireParamsSchema['~standard'].validate([
        s.access,
        { ...f.input, origin: '' },
      ])
      assert.ok(result.issues)
      assert.deepEqual(result.issues[0]?.path, [1, 'origin'])
    }),
  ]
}
