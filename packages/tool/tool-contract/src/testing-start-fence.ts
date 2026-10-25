// The ToolStartFence conformance suite (SPEC「外层调用方的启动围栏」, J03). The fence is the view of
// the start authority that an outer caller holds, so the suite observes the effect of a fence
// confirmation through `prepare`, `consume` and `inspect` of the same provider: a case passes only
// when the fence and the authority share one ordering domain.
import assert from 'node:assert/strict'
import type { FixedToolRequest } from './definitions.ts'
import type { Access, DurableEvidence, ToolCallId } from './identity.ts'
import { fail } from '@omne-harness/operation-result'
import type {
  StartGuard,
  StartPermit,
  StartProgress,
  ToolStartAuthority,
  ToolStartFence,
} from './records.ts'
import {
  completionOf,
  conformanceCase,
  expectKind,
  expectOneOf,
  finalAnswer,
  handle,
  otherAccessOf,
  refused,
  resendRecalls,
  succeeded,
  type ConformanceCase,
} from './testing-case.ts'
import {
  MEMORY_START_GUARD,
  createMemoryToolStartAuthority,
  startAuthorityAnswers,
  type ToolStartAuthorityFixture,
} from './testing-start-authority.ts'
import {
  callId,
  evidence,
  fixedRequest,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  startRecord,
  tenantKey,
} from './testing-values.ts'

/**
 * What the start fence suite needs, on top of the start authority fixture. `fence` is the view
 * that an outer caller holds, served by the provider of `authority`. `guard` names the guard
 * resource of the outer caller that the trusted configuration of the provider applies to the
 * fixed request of the fixture, so that every permit of the suite carries it; the principal of
 * `access` may invalidate it, and the principal of `otherAccess` may invalidate the guard of the
 * same name in its own tenant. `strangerAccess` is an access of the tenant of `access` whose
 * principal may invalidate no guard: the case that needs it is reported not applicable without it.
 */
export interface ToolStartFenceFixture<P> extends ToolStartAuthorityFixture<P> {
  readonly fence: ToolStartFence<P>
  readonly guard: Readonly<{ owner: string; resource: string }>
  readonly strangerAccess?: Access<P>
}

type Fixture<P> = ToolStartFenceFixture<P>
const answers = startAuthorityAnswers

function scene<P>(fixture: Fixture<P>, access: Access<P> = fixture.access) {
  const { authority, fence } = fixture
  const request: FixedToolRequest = fixture.request ?? fixedRequest()
  const completion = completionOf(fixture, 'settle')
  const at = (name: string) => {
    const call: ToolCallId = callId(name)
    const start = startRecord(access, call)
    const callAccess = { ...access, call }
    const tryConsumeFinal = (permit: StartPermit, capsule = 'capsule') =>
      finalAnswer({
        ask: () => authority.consume({ ...callAccess, permit, executorReceipt: evidence(capsule) }),
        row: answers.consume,
        completion,
        what: `consume of ${name}`,
      })
    return {
      prepare: async (): Promise<StartPermit> =>
        succeeded(await authority.prepare({ ...callAccess, start, request }), `prepare ${name}`),
      tryConsumeFinal,
      consumeFinal: async (permit: StartPermit, capsule = 'capsule'): Promise<StartProgress> =>
        succeeded(await tryConsumeFinal(permit, capsule), `consume of ${name}`),
      consume: async (permit: StartPermit): Promise<StartProgress> =>
        succeeded(
          await authority.consume({ ...callAccess, permit, executorReceipt: evidence('capsule') }),
          `consume of ${name}`,
        ),
      inspect: async (): Promise<StartProgress> =>
        succeeded(await authority.inspect({ ...callAccess, start }), `inspect ${name}`),
    }
  }
  /** The guard input of the outer caller: its own resource, and its own record of the cause. */
  const guard = (cause = 'retire-1'): StartGuard => ({
    owner: fixture.guard.owner,
    resource: fixture.guard.resource,
    revision: cause,
    evidence: evidence(`outer-cause/${cause}`),
    scope: { kind: 'resource' },
  })
  return {
    at,
    guard,
    tryFence: (operation: string, cause?: string) =>
      fence.invalidate({ ...access, operation: operationId(operation), guard: guard(cause) }),
    fence: async (operation: string, cause?: string): Promise<DurableEvidence> =>
      succeeded(
        await fence.invalidate({
          ...access,
          operation: operationId(operation),
          guard: guard(cause),
        }),
        'fence',
      ),
  }
}

/** A start the fence refused: driven to its end, it never started. */
function assertRefused(progress: StartProgress, what: string): void {
  expectOneOf(progress, ['rejected', 'not-started'], what)
}

async function fenceRefusesEarlierPermit<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const call = s.at('call-1')
  const permit = await call.prepare()
  assert.ok(
    permit.guards.some(
      guard => guard.owner === fixture.guard.owner && guard.resource === fixture.guard.resource,
    ),
    'the permit carries the guard of the outer caller',
  )
  await s.fence('fence-1')
  assertRefused(await call.consumeFinal(permit), 'consume of a permit prepared before the fence')
  assertRefused(await call.inspect(), 'inspect after the refused consume')
}

async function acceptedStartStays<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const call = s.at('call-1')
  const permit = await call.prepare()
  const accepted = expectKind(await call.consumeFinal(permit), 'started', 'consume')
  await s.fence('fence-1')
  // The fence stops nothing: the acceptance stands, and the outer caller stops the call itself.
  resendRecalls(answers.inspect, { earlier: accepted, later: await call.inspect() }, 'inspect')
  resendRecalls(
    answers.consume,
    { earlier: accepted, later: await call.consume(permit) },
    'consume',
  )
}

async function laterPermitStarts<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  await s.fence('fence-1')
  // A permit prepared after the confirmation carries the new revision and starts on its own merit.
  const call = s.at('call-2')
  expectKind(await call.consumeFinal(await call.prepare()), 'started', 'consume after the fence')
}

async function fenceResent<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const first = await s.fence('fence-1')
  const call = s.at('call-1')
  const permit = await call.prepare()
  assert.deepEqual(await s.fence('fence-1'), first, 'the resent fence returns the first evidence')
  // The resend did not move the guard again: the permit prepared between the two still starts.
  expectKind(await call.consumeFinal(permit), 'started', 'consume after the resend')
}

async function fenceConflict<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const first = await s.fence('fence-1', 'retire-1')
  const call = s.at('call-1')
  const permit = await call.prepare()
  const other = refused(await s.tryFence('fence-1', 'retire-2'), 'fence under the same operation')
  assert.equal(other.kind, 'conflict')
  assert.deepEqual(await s.fence('fence-1', 'retire-1'), first)
  expectKind(await call.consumeFinal(permit), 'started', 'consume after the conflict')
}

async function foreignFence<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const call = own.at('call-1')
  const permit = await call.prepare()
  // The other tenant names the same guard resource: a guard is a resource of one tenant.
  await other.tryFence('fence-9')
  expectKind(await call.consumeFinal(permit), 'started', 'consume after a fence of another tenant')
}

async function crossTenantPrincipal<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const call = own.at('call-1')
  const permit = await call.prepare()
  // The principal of another tenant presents the tenant of the fixture: it holds no qualification.
  const mixed = { ...fixture.access, principal: otherAccessOf(fixture).principal }
  const denied = refused(
    await fixture.fence.invalidate({
      ...mixed,
      operation: operationId('fence-9'),
      guard: own.guard(),
    }),
    'fence by a principal of another tenant',
  )
  assert.equal(denied.kind, 'denied')
  expectKind(await call.consumeFinal(permit), 'started', 'consume after the denied fence')
}

async function unqualifiedPrincipal<P>(fixture: Fixture<P>): Promise<void> {
  const stranger = handle(fixture.strangerAccess, 'strangerAccess')
  const own = scene(fixture)
  const call = own.at('call-1')
  const permit = await call.prepare()
  const real = refused(
    await fixture.fence.invalidate({
      ...stranger,
      operation: operationId('fence-9'),
      guard: own.guard(),
    }),
    'fence of the guard by an unqualified principal',
  )
  const ghost = refused(
    await fixture.fence.invalidate({
      ...stranger,
      operation: operationId('fence-10'),
      guard: { ...own.guard(), owner: 'never-an-owner', resource: 'never-a-resource' },
    }),
    'fence of a guard that does not exist by an unqualified principal',
  )
  // Both are denied alike: the answer tells nothing of whether the guard exists.
  assert.equal(real.kind, 'denied')
  assert.deepEqual(ghost, real, 'the denial tells a real guard from a ghost')
  expectKind(await call.consumeFinal(permit), 'started', 'consume after the denied fence')
}

export function toolStartFenceConformance<P>(): readonly ConformanceCase<Fixture<P>>[] {
  const named = (name: string, run: (fixture: Fixture<P>) => Promise<void>) =>
    conformanceCase('P04', name, run)
  return [
    named(
      'a fence confirmed before the consume refuses a permit prepared before it',
      fenceRefusesEarlierPermit,
    ),
    named(
      'a start accepted before the fence stays accepted and is not stopped by it',
      acceptedStartStays,
    ),
    named('a permit prepared after the fence starts on its own merit', laterPermitStarts),
    named('a resent fence returns the first evidence and moves the guard once', fenceResent),
    named(
      'a fence operation reused for another guard input is a conflict that changes nothing',
      fenceConflict,
    ),
    named('the fence of another tenant does not refuse the starts of a tenant', foreignFence),
    named('a principal of another tenant cannot fence the guard of a tenant', crossTenantPrincipal),
    named(
      'an unqualified principal cannot fence a guard and learns nothing of whether it exists',
      unqualifiedPrincipal,
    ),
  ]
}

/**
 * The fence view of the double: it checks the fence qualification of the access, the trusted
 * configuration `qualified`, before it enters the ordering domain of `authority`. A refusal moves no
 * guard and is the same for every guard.
 */
function qualifiedFence<P>(
  authority: ToolStartAuthority<P>,
  qualified: (access: Access<P>, owner: string) => boolean,
): ToolStartFence<P> {
  return {
    invalidate: input =>
      qualified(input, input.guard.owner)
        ? authority.invalidate(input)
        : Promise.resolve(fail({ kind: 'denied', action: 'invalidate' })),
  }
}

/**
 * A fresh fixture: one in-memory start authority, and the fence view of the same instance. The
 * double applies one guard resource to every request. The principal of `access` may fence it in
 * its tenant, the principal of `otherAccess` in its own tenant, and the stranger nowhere.
 */
export function memoryToolStartFenceFixture(): ToolStartFenceFixture<string> {
  const authority = createMemoryToolStartAuthority<string>()
  const access = memoryAccess('tester')
  const otherAccess = memoryOtherAccess('tester-other')
  const grants = new Set(
    [access, otherAccess].map(granted =>
      JSON.stringify([granted.principal, tenantKey(granted.tenant), MEMORY_START_GUARD.owner]),
    ),
  )
  return {
    authority,
    fence: qualifiedFence(authority, (presented, owner) =>
      grants.has(JSON.stringify([presented.principal, tenantKey(presented.tenant), owner])),
    ),
    guard: MEMORY_START_GUARD,
    access,
    otherAccess,
    strangerAccess: memoryAccess('tester-stranger'),
    settle: () => Promise.resolve(),
  }
}
