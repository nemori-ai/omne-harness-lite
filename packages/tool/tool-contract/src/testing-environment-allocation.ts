import assert from 'node:assert/strict'
import { judgePreparationFact } from './judge-preparation.ts'
import type { Access } from './identity.ts'
import type { ToolEnvironment } from './ports.ts'
import type { PreparationRecord } from './records.ts'
import { conformanceCase, expectKind, succeeded, type ConformanceCase } from './testing-case.ts'
import { callId, fixedRequest, preparationRecord } from './testing-values.ts'

/** Provider-owned controls for the allocation-before-adoption path. No control performs adoption. */
export interface ToolEnvironmentAllocationFixture<P, E> {
  readonly environment: ToolEnvironment<P, E>
  readonly access: Access<P>
  allocations(): number
  leases(): number
  outstanding(): number
  allocateBeforeAdoption(): void
  forgetRegistration(preparation: PreparationRecord): void
  failAdoption(preparation: PreparationRecord, reason: string): void
}

function scene<P, E>(fixture: ToolEnvironmentAllocationFixture<P, E>) {
  const preparation = {
    ...preparationRecord(fixture.access, callId('allocated-call'), 'allocation-1', fixedRequest()),
    adoption: fixture.environment.adoption,
  }
  const input = { ...fixture.access, call: preparation.call, preparation }
  return {
    preparation,
    prepare: async () => succeeded(await fixture.environment.prepare(input), 'prepare'),
    inspect: async () =>
      succeeded(await fixture.environment.inspectPreparation(input), 'inspectPreparation'),
    counts: () => ({ allocations: fixture.allocations(), leases: fixture.leases() }),
  }
}

/** P03 facts, bounded original adoption and lost-registration boundaries, for adapters that support this path. */
export function toolEnvironmentAllocationConformance<P, E>(): readonly ConformanceCase<
  ToolEnvironmentAllocationFixture<P, E>
>[] {
  const named = (
    name: string,
    run: (fixture: ToolEnvironmentAllocationFixture<P, E>) => Promise<void>,
  ) => conformanceCase('P03', name, run)
  return [
    named('allocation inspection preserves the original fact without adopting', async fixture => {
      const s = scene(fixture)
      fixture.allocateBeforeAdoption()
      expectKind(await s.prepare(), 'unknown', 'lost allocation reply')
      const before = s.counts()
      const fact = expectKind(await s.inspect(), 'allocated', 'inspect allocation')
      assert.ok(
        'ok' in
          judgePreparationFact(
            { preparation: fact.preparation, evidence: fact.evidence },
            s.preparation,
          ),
      )
      assert.deepStrictEqual(await s.inspect(), fact)
      assert.deepStrictEqual(s.counts(), before)
      assert.deepStrictEqual(before, { allocations: 1, leases: 0 })
      const prepared = expectKind(await s.prepare(), 'prepared', 'first adoption')
      assert.deepStrictEqual(prepared.environment.preparation, s.preparation)
      assert.deepStrictEqual(s.counts(), { allocations: 1, leases: 1 })
      assert.deepStrictEqual(await s.prepare(), prepared)
    }),
    named('concurrent original adoption issues one lease for one allocation', async fixture => {
      const s = scene(fixture)
      fixture.allocateBeforeAdoption()
      await s.prepare()
      expectKind(await s.inspect(), 'allocated', 'inspect allocation')
      const [left, right] = await Promise.all([s.prepare(), s.prepare()])
      expectKind(left, 'prepared', 'first adoption')
      assert.deepStrictEqual(left, right)
      assert.deepStrictEqual(s.counts(), { allocations: 1, leases: 1 })
    }),
    named('lost local registration cannot adopt the original allocation', async fixture => {
      const s = scene(fixture)
      fixture.allocateBeforeAdoption()
      await s.prepare()
      fixture.forgetRegistration(s.preparation)
      expectKind(await s.inspect(), 'unknown', 'cold query')
      expectKind(await s.prepare(), 'unknown', 'cold prepare')
      assert.equal(fixture.outstanding(), 1)
      assert.deepStrictEqual(s.counts(), { allocations: 1, leases: 0 })
    }),
    named('failed original adoption remains failed with cleanup outstanding', async fixture => {
      const s = scene(fixture)
      fixture.allocateBeforeAdoption()
      await s.prepare()
      fixture.failAdoption(s.preparation, 'scope ended; cleanup unknown')
      const rejected = expectKind(await s.inspect(), 'rejected', 'adoption failure')
      assert.deepStrictEqual(await s.prepare(), rejected)
      assert.equal(fixture.outstanding(), 1)
      assert.deepStrictEqual(s.counts(), { allocations: 1, leases: 0 })
    }),
  ]
}
