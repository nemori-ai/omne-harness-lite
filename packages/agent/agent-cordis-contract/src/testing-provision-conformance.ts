import assert from 'node:assert/strict'
import type {
  Access,
  Adoption,
  AgentDirectory,
  AgentInstanceId,
  DurableEvidence,
  Failure,
  Registration,
} from '@omne-harness/agent-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { AgentInstanceProvision } from './index.ts'

export type AgentInstanceProvisionCase = Readonly<{ name: string; run: () => Promise<void> }>

export interface AgentInstanceProvisionFixture<P> {
  readonly provision: AgentInstanceProvision<P>
  readonly directory: AgentDirectory<P>
  access(tenant: 'a' | 'b'): Access<P>
  slot(
    variant: 'first' | 'other-definition',
  ): Readonly<{ scope: DurableEvidence; definition: Adoption }>
  idleOut(instance: AgentInstanceId): Promise<void>
  busyOut(instance: AgentInstanceId): Promise<void>
  live(): number
  denyReserve(): void
  denyHostPrincipal(): void
  dispose?(): Promise<void> | void
}

type Granted = Readonly<{ instance: AgentInstanceId; registration: Registration }>

function succeeded<T>(answer: Outcome<T, Failure>, what: string): T {
  if (!('ok' in answer)) {
    assert.fail(`${what} should succeed, and it gave ${JSON.stringify(answer.failure)}`)
  }
  return answer.ok
}

function failedWith<T>(answer: Outcome<T, Failure>, kind: Failure['kind'], what: string): void {
  assert.ok('failure' in answer, `${what} should fail with ${kind}, and it succeeded`)
  assert.equal(answer.failure.kind, kind, `${what} should fail with ${kind}`)
}

export function agentInstanceProvisionConformance<P>(
  open: () => AgentInstanceProvisionFixture<P> | Promise<AgentInstanceProvisionFixture<P>>,
): readonly AgentInstanceProvisionCase[] {
  const inFixture = (
    name: string,
    body: (fixture: AgentInstanceProvisionFixture<P>) => Promise<void>,
  ): AgentInstanceProvisionCase => ({
    name,
    async run() {
      const fixture = await open()
      try {
        await body(fixture)
      } finally {
        await fixture.dispose?.()
      }
    },
  })
  const acquire = (
    fixture: AgentInstanceProvisionFixture<P>,
    tenant: 'a' | 'b',
    variant: 'first' | 'other-definition' = 'first',
  ) => fixture.provision.acquire({ ...fixture.access(tenant), ...fixture.slot(variant) })
  const resolve = (
    fixture: AgentInstanceProvisionFixture<P>,
    tenant: 'a' | 'b',
    instance: AgentInstanceId,
  ) => fixture.directory.resolve({ ...fixture.access(tenant), instance })

  return [
    inFixture('gives a new slot an instance that the directory resolves', async fixture => {
      const { instance, registration } = succeeded(await acquire(fixture, 'a'), 'acquire')
      assert.equal(registration.state, 'published')
      const runtime = succeeded(await resolve(fixture, 'a', instance), 'resolve')
      assert.equal(
        runtime.instance,
        instance,
        'the runtime should carry the instance that was given',
      )
      assert.equal(fixture.live(), 1)
    }),
    inFixture('gives the same slot twice in a row the same instance', async fixture => {
      const first = succeeded(await acquire(fixture, 'a'), 'the first acquire')
      const again = succeeded(await acquire(fixture, 'a'), 'the second acquire')
      assert.equal(again.instance, first.instance)
      assert.equal(fixture.live(), 1)
    }),
    inFixture('gives two calls of one slot at the same time the same instance', async fixture => {
      const [first, second] = await Promise.all([acquire(fixture, 'a'), acquire(fixture, 'a')])
      const a: Granted = succeeded(first, 'the first acquire')
      const b: Granted = succeeded(second, 'the second acquire')
      assert.equal(a.instance, b.instance, 'both calls should share one build')
      assert.equal(fixture.live(), 1)
    }),
    inFixture('gives another definition another instance', async fixture => {
      const first = succeeded(await acquire(fixture, 'a'), 'acquire')
      const other = succeeded(await acquire(fixture, 'a', 'other-definition'), 'acquire')
      assert.notEqual(other.instance, first.instance)
      assert.equal(fixture.live(), 2)
    }),
    inFixture(
      'gives another tenant another instance and denies it the first tenant',
      async fixture => {
        const first = succeeded(await acquire(fixture, 'a'), 'acquire for a')
        const other = succeeded(await acquire(fixture, 'b'), 'acquire for b')
        assert.notEqual(other.instance, first.instance)
        failedWith(await resolve(fixture, 'a', other.instance), 'denied', 'resolve across tenants')
        failedWith(await resolve(fixture, 'b', first.instance), 'denied', 'resolve across tenants')
      },
    ),
    inFixture(
      'removes an idle instance after the idle time and builds a new one',
      async fixture => {
        const first = succeeded(await acquire(fixture, 'a'), 'acquire')
        await fixture.idleOut(first.instance)
        failedWith(
          await resolve(fixture, 'a', first.instance),
          'denied',
          'resolve after the reclaim',
        )
        assert.equal(fixture.live(), 0)
        const next = succeeded(await acquire(fixture, 'a'), 'acquire after the reclaim')
        assert.notEqual(
          next.instance,
          first.instance,
          'the new instance should have another identity',
        )
        assert.equal(fixture.live(), 1)
      },
    ),
    inFixture('keeps an occupied instance when the idle time passes', async fixture => {
      const first = succeeded(await acquire(fixture, 'a'), 'acquire')
      await fixture.busyOut(first.instance)
      succeeded(await resolve(fixture, 'a', first.instance), 'resolve after the idle time')
      assert.equal(fixture.live(), 1)
      const again = succeeded(await acquire(fixture, 'a'), 'acquire again')
      assert.equal(
        again.instance,
        first.instance,
        'the occupied instance should still serve its slot',
      )
    }),
    inFixture(
      'denies a new slot when the reserve check refuses and builds nothing',
      async fixture => {
        const before = fixture.live()
        fixture.denyReserve()
        failedWith(await acquire(fixture, 'a'), 'denied', 'acquire')
        assert.equal(fixture.live(), before, 'a refused call should leave no instance')
      },
    ),
    inFixture(
      'fails the call and publishes nothing when the host principal is refused',
      async fixture => {
        fixture.denyHostPrincipal()
        failedWith(await acquire(fixture, 'a'), 'denied', 'acquire with a refused host principal')
        assert.equal(fixture.live(), 0, 'a refused publish should leave no instance')
        succeeded(await acquire(fixture, 'a'), 'acquire after the refusal')
      },
    ),
  ]
}
