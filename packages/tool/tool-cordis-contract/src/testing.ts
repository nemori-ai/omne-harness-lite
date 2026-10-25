// The `./testing` entry: the registration-semantics suite of `ToolInstancesService.register` (IC-3)
// and a non-durable register service that conforms to it. The suite does not depend on a test
// framework and does not need a Cordis runtime: it takes a fixture that gives the register
// service, the caller fiber and the synchronous publication check as control handles. The service
// double declares `durability: 'none'`; it proves nothing about the real service and must not be
// assembled into production.
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeToolCallId,
  type DurableEvidence,
  type ToolCallId,
  type ToolExecutionRef,
  type ToolHandle,
  type ToolObservation,
} from '@omne-harness/tool-contract'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import {
  finalAnswer,
  NotApplicable,
  resendRecalls,
  testingTenant,
  type AnswerModel,
  type ConformanceCase,
} from '@omne-harness/tool-contract/testing'
import type { ToolRegistration, ToolRegistrationFailure, ToolRegistrationInput } from './cordis.ts'

export type { AnswerModel, AnswerRow, ConformanceCase } from '@omne-harness/tool-contract/testing'
export {
  NotApplicable,
  isNotApplicable,
  runConformanceCase,
  type CaseVerdict,
} from '@omne-harness/tool-contract/testing'
// The G7 suite of the binding registry, its non-durable registry and the dynamics suite skeleton.
export {
  TOOL_DYNAMICS_CRITERIA,
  createMemoryToolBindingRegistry,
  memoryToolBindingRegistryFixture,
  runToolDynamicsSuite,
  toolBindingRegistryConformance,
  type MemoryToolBindingRegistry,
  type ToolBindingGrant,
  type ToolBindingRegistryFixture,
  type ToolBindingRegistryService,
  type ToolDynamicsFixture,
} from './testing-bindings.ts'

/** The call of `ToolInstancesService.register` that the suite checks. */
export interface ToolRegistrationService<P> {
  register(
    input: ToolRegistrationInput<P>,
  ): Promise<Outcome<ToolRegistration, ToolRegistrationFailure>>
}

/**
 * What the registration suite needs. A fresh fixture serves one case. `tenant` is a tenant that
 * the service accepts, and `authority` is the evidence that the suite passes as the verified
 * authority of a registration of that tenant. The authority names its tenant (IC-3): a check
 * refuses a publication of another tenant under it. `renewedAuthority` is another evidence of the
 * same tenant that the check accepts, `otherTenant` is a second tenant and `otherAuthority` the
 * evidence that names it; a case that needs one that is missing is reported not applicable. The
 * optional handles are the controls of the provider, and a case that needs one that is missing is
 * reported not applicable too. Completion contract: a handle that drives work (`endFiber`)
 * resolves only after that work has landed and is visible to every later `register` and
 * `listing`; the suite never polls. `register` has no progress kind (see `registrationAnswers`),
 * so no handle completes a register. `asFiber` runs `work` as the caller fiber named `fiber`, and
 * every `register` that `work` starts belongs to that fiber (a call outside it belongs to the
 * fiber of the caller); `endFiber` ends that fiber, which runs the automatic disposers of its
 * registrations, and resolves after the last of them removed its entry; `refuseCheck` sets the
 * answer of the synchronous publication check from then on, for every `register` that starts
 * after it returns (`null` lets it pass); `listing` gives the registration token of every entry
 * that the directory holds right now; `checkedAgainst` gives, for each consultation of the check,
 * the listing that the directory had at that moment. `quietMs` (default 25) is how long the suite
 * watches the directory after a refused register, to see that nothing is written late: it is the
 * one wait of the suite, and a provider that writes later than that needs a longer one.
 */
export interface ToolRegistrationFixture<P> {
  readonly service: ToolRegistrationService<P>
  readonly tenant: TenantId
  readonly authority: DurableEvidence
  readonly renewedAuthority?: DurableEvidence
  readonly otherTenant?: TenantId
  readonly otherAuthority?: DurableEvidence
  readonly quietMs?: number
  /** Runs `work` as the caller fiber of this name; every `register` that it starts belongs to that fiber. */
  asFiber?<T>(fiber: string, work: () => Promise<T>): Promise<T>
  /** Resolves after the fiber ended and its automatic disposers removed their entries, visible to every read. */
  endFiber?(fiber: string): Promise<void>
  /** Sets the answer of the synchronous check for every register that starts after it returns. */
  refuseCheck?(failure: ToolRegistrationFailure | null): void
  /** The token of every entry that the directory holds right now (a read). */
  listing?(): readonly string[]
  /** The listing that the directory had at each consultation of the check (a read). */
  checkedAgainst?(): readonly (readonly string[])[]
}

/**
 * The answer model of the registration (IC-3): `register` answers a registration or refuses, and a
 * refusal (`denied`, `stale-publication`, `unavailable`, `conflict`) is final for the call. The
 * synchronous check leaves no progress kind and no lost reply: a call that cannot be decided is
 * refused as `unavailable`, never answered later, so no completion handle exists.
 */
export const registrationAnswers = {
  register: { clause: 'IC-3', progress: [] },
} as const satisfies AnswerModel<keyof ToolRegistrationService<unknown>>

const DEFAULT_QUIET_MS = 25

function minted<T>(decoded: { ok: T } | { failure: unknown }, text: string): T {
  if ('failure' in decoded) throw new Error(`conformance identity is not legal: ${text}`)
  return decoded.ok
}

/** A handle that the directory must never use to stop the work: it counts every call. */
function spyHandle<P>(instance: string): Readonly<{ handle: ToolHandle<P>; observed(): number }> {
  let observed = 0
  const handle: ToolHandle<P> = {
    instance: minted(decodeToolInstanceId(instance), instance),
    observe: () => {
      observed += 1
      return (async function* (): AsyncGenerator<ToolObservation> {})()
    },
  }
  return { handle, observed: () => observed }
}

/** How a register that was started in flight ended: with an answer, or with a rejection. */
type InFlight = Readonly<
  { outcome: Outcome<ToolRegistration, ToolRegistrationFailure> } | { error: unknown }
>

function scene<P>(fixture: ToolRegistrationFixture<P>) {
  const execution = (
    call = 'call-1',
    tenant: TenantId = fixture.tenant,
    instance = 'instance-1',
    generation = '1',
  ): ToolExecutionRef => ({
    tenant,
    call: minted(decodeToolCallId(call), call),
    instance: minted(decodeToolInstanceId(instance), instance),
    generation,
  })
  const input = (
    publication: ToolExecutionRef,
    handle: ToolHandle<P>,
    authority: DurableEvidence = fixture.authority,
  ): ToolRegistrationInput<P> => ({
    publication: [publication, handle],
    authority,
  })
  const ask = (published: ToolRegistrationInput<P>) =>
    finalAnswer({
      ask: () => fixture.service.register(published),
      row: registrationAnswers.register,
      what: 'register',
    })
  const registered = async (
    published: ToolRegistrationInput<P>,
    what: string,
  ): Promise<ToolRegistration> => {
    const outcome = await ask(published)
    if ('failure' in outcome)
      assert.fail(`${what}: expected success, got ${JSON.stringify(outcome.failure)}`)
    return outcome.ok
  }
  const refusal = async (
    published: ToolRegistrationInput<P>,
    what: string,
  ): Promise<ToolRegistrationFailure> => {
    const outcome = await ask(published)
    if ('ok' in outcome) assert.fail(`${what}: expected a failure, got a registration`)
    return outcome.failure
  }
  const inFiber = <T>(fiber: string, work: () => Promise<T>): Promise<T> => {
    if (fixture.asFiber === undefined) throw new NotApplicable('asFiber')
    return fixture.asFiber(fiber, work)
  }
  /** A later read of the same registration: what was answered is recalled as it was. */
  const recalls = (later: ToolRegistration, earlier: ToolRegistration): void =>
    resendRecalls(
      registrationAnswers.register,
      { earlier: earlier.receipt, later: later.receipt },
      'register again',
    )
  /**
   * A register that is started and not awaited, to read the directory while it is in flight. Its
   * end is kept as a value: a register that rejects is never left unhandled when the case fails
   * before it asks for the answer.
   */
  const inFlight = (published: ToolRegistrationInput<P>): Promise<InFlight> =>
    fixture.service.register(published).then(
      (outcome): InFlight => ({ outcome }),
      (error: unknown): InFlight => ({ error }),
    )
  /** The answer of a register that was started with `inFlight`; a rejection fails the case. */
  const answerOf = async (started: Promise<InFlight>) => {
    const ended = await started
    if ('error' in ended)
      assert.fail(`register: the call rejected instead of answering: ${String(ended.error)}`)
    return finalAnswer({
      ask: () => Promise.resolve(ended.outcome),
      row: registrationAnswers.register,
      what: 'register',
    })
  }
  return { execution, input, registered, refusal, inFiber, recalls, ask, inFlight, answerOf }
}

/** The handle of a fixture, or `NotApplicable` naming it. */
function handle<T>(offered: T | undefined, name: string): T {
  if (offered === undefined) throw new NotApplicable(name)
  return offered
}

/** The second tenant of a fixture, or `NotApplicable`; it must be another tenant than the first. */
function otherTenantOf<P>(fixture: ToolRegistrationFixture<P>): TenantId {
  const other = handle(fixture.otherTenant, 'otherTenant')
  assert.notDeepEqual(other, fixture.tenant, 'the fixture names one tenant twice')
  return other
}

const registrationCase = <P>(
  name: string,
  run: (fixture: ToolRegistrationFixture<P>) => Promise<void>,
): ConformanceCase<ToolRegistrationFixture<P>> => ({ name, clause: 'IC-3', run })

/** The failure that the synchronous check answers when it refuses. */
const REFUSALS: readonly ToolRegistrationFailure[] = [
  { kind: 'denied' },
  { kind: 'stale-publication' },
  { kind: 'unavailable', diagnostic: 'the origin of the authority cannot be reached' },
]

export function toolRegistrationConformance<P>(): readonly ConformanceCase<
  ToolRegistrationFixture<P>
>[] {
  return [
    registrationCase<P>(
      'register answers a receipt of the execution and a token',
      async fixture => {
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const published = s.execution()
        const registration = await s.registered(s.input(published, spy.handle), 'register')
        assert.deepEqual(registration.receipt.execution, published)
        assert.ok(registration.receipt.registration.length > 0, 'the receipt names a token')
        assert.equal(typeof registration.release, 'function')
      },
    ),

    registrationCase<P>(
      'the same fiber, instance and handle registering again recalls the receipt',
      async fixture => {
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const published = s.input(s.execution(), spy.handle)
        const first = await s.registered(published, 'register')
        const again = await s.registered(published, 'register again')
        s.recalls(again, first)
        const concurrent = await Promise.all([
          s.registered(published, 'a'),
          s.registered(published, 'b'),
        ])
        for (const registration of concurrent) s.recalls(registration, first)
        // One registration stands behind the receipts: the releases of the recalled ones are the same.
        assert.deepEqual(await again.release(), { removed: true })
        assert.deepEqual(await first.release(), { removed: false })
      },
    ),

    registrationCase<P>('a handle other than the registered one is a conflict', async fixture => {
      const s = scene(fixture)
      const original = spyHandle<P>('instance-1')
      const other = spyHandle<P>('instance-1')
      const published = s.execution()
      const first = await s.registered(s.input(published, original.handle), 'register')
      const failure = await s.refusal(
        s.input(published, other.handle),
        'register of another handle',
      )
      assert.equal(failure.kind, 'conflict')
      const recalled = await s.registered(
        s.input(published, original.handle),
        'register of the original',
      )
      s.recalls(recalled, first)
    }),

    registrationCase<P>(
      'another qualification of the same identity is a conflict',
      async fixture => {
        const renewed = handle(fixture.renewedAuthority, 'renewedAuthority')
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const published = s.execution()
        const first = await s.registered(s.input(published, spy.handle), 'register')
        const failure = await s.refusal(
          s.input(published, spy.handle, renewed),
          'register under another qualification',
        )
        assert.equal(failure.kind, 'conflict')
        // The refused register left the registration as it was.
        const recalled = await s.registered(s.input(published, spy.handle), 'register again')
        s.recalls(recalled, first)
      },
    ),

    registrationCase<P>(
      'a register at another generation never answers the receipt of the first',
      async fixture => {
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const published = s.execution()
        const first = await s.registered(s.input(published, spy.handle), 'register')
        const moved = s.execution('call-1', fixture.tenant, 'instance-1', '2')
        const outcome = await s.ask(s.input(moved, spy.handle))
        // A refusal is allowed; an answer is the receipt of the publication that was given.
        if ('ok' in outcome) assert.deepEqual(outcome.ok.receipt.execution, moved)
        const recalled = await s.registered(s.input(published, spy.handle), 'register again')
        s.recalls(recalled, first)
      },
    ),

    registrationCase<P>('another fiber cannot take an unreleased registration', async fixture => {
      handle(fixture.asFiber, 'asFiber')
      const s = scene(fixture)
      const spy = spyHandle<P>('instance-1')
      const published = s.input(s.execution(), spy.handle)
      const first = await s.inFiber('fiber-1', () => s.registered(published, 'register'))
      const failure = await s.inFiber('fiber-2', () =>
        s.refusal(published, 'register from another fiber'),
      )
      assert.equal(failure.kind, 'conflict')
      const recalled = await s.inFiber('fiber-1', () => s.registered(published, 'register again'))
      s.recalls(recalled, first)
    }),

    registrationCase<P>('a successor registers once the original was released', async fixture => {
      handle(fixture.asFiber, 'asFiber')
      const s = scene(fixture)
      const spy = spyHandle<P>('instance-1')
      const published = s.input(s.execution(), spy.handle)
      const original = await s.inFiber('fiber-1', () => s.registered(published, 'register'))
      assert.deepEqual(await original.release(), { removed: true })
      const successor = await s.inFiber('fiber-2', () => s.registered(published, 'successor'))
      assert.notEqual(successor.receipt.registration, original.receipt.registration)
    }),

    registrationCase<P>('a late release of the original leaves the successor', async fixture => {
      handle(fixture.asFiber, 'asFiber')
      const s = scene(fixture)
      const spy = spyHandle<P>('instance-1')
      const published = s.input(s.execution(), spy.handle)
      const original = await s.inFiber('fiber-1', () => s.registered(published, 'register'))
      await original.release()
      const successor = await s.inFiber('fiber-2', () => s.registered(published, 'successor'))
      assert.deepEqual(await original.release(), { removed: false })
      // The successor still stands: its own fiber recalls it, and nothing was registered anew.
      const recalled = await s.inFiber('fiber-2', () => s.registered(published, 'recall'))
      s.recalls(recalled, successor)
      assert.deepEqual(await successor.release(), { removed: true })
    }),

    registrationCase<P>(
      'release removes once and a repeat answers removed false',
      async fixture => {
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const published = s.input(s.execution(), spy.handle)
        const first = await s.registered(published, 'register')
        assert.deepEqual(await first.release(), { removed: true })
        assert.deepEqual(await first.release(), { removed: false })
        assert.deepEqual(await first.release(), { removed: false })
        // The entry is gone: the identity can be registered again, and it is a new registration.
        const again = await s.registered(published, 'register after release')
        assert.notEqual(again.receipt.registration, first.receipt.registration)
      },
    ),

    registrationCase<P>(
      'registering and releasing never touch the original work',
      async fixture => {
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const published = s.input(s.execution(), spy.handle)
        const first = await s.registered(published, 'register')
        await s.registered(published, 'register again')
        await first.release()
        await first.release()
        assert.equal(spy.observed(), 0, 'the directory used the handle of the work')
      },
    ),

    registrationCase<P>(
      'a refused check registers nothing, not even for a moment',
      async fixture => {
        const refuseCheck = handle(fixture.refuseCheck, 'refuseCheck')
        const listing = handle(fixture.listing, 'listing')
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const published = s.input(s.execution(), spy.handle)
        refuseCheck.call(fixture, { kind: 'denied' })
        const pending = s.inFlight(published)
        // The directory is read before the answer arrives: a write that is taken back later shows.
        assert.deepEqual(listing.call(fixture), [])
        const outcome = await s.answerOf(pending)
        assert.ok('failure' in outcome, 'a refused check registers')
        assert.equal(outcome.failure.kind, 'denied')
        // A write that comes after the answer shows within the quiet period of the fixture.
        await new Promise<void>(resolve => setTimeout(resolve, fixture.quietMs ?? DEFAULT_QUIET_MS))
        assert.deepEqual(listing.call(fixture), [])
        refuseCheck.call(fixture, null)
        await s.registered(published, 'register once the check passes')
      },
    ),

    registrationCase<P>('a refusal of the check keeps its kind', async fixture => {
      const refuseCheck = handle(fixture.refuseCheck, 'refuseCheck')
      const s = scene(fixture)
      for (const [index, refusal] of REFUSALS.entries()) {
        const spy = spyHandle<P>('instance-1')
        const published = s.input(s.execution(`call-${index + 1}`), spy.handle)
        refuseCheck.call(fixture, refusal)
        assert.deepEqual(await s.refusal(published, `refusal ${refusal.kind}`), refusal)
      }
    }),

    registrationCase<P>(
      'every register is checked against the current qualification',
      async fixture => {
        const refuseCheck = handle(fixture.refuseCheck, 'refuseCheck')
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const published = s.input(s.execution(), spy.handle)
        await s.registered(published, 'register')
        refuseCheck.call(fixture, { kind: 'denied' })
        // A recall is a register: it does not hand the receipt to a caller the check now refuses.
        const failure = await s.refusal(published, 'register again after the check refused')
        assert.equal(failure.kind, 'denied')
      },
    ),

    registrationCase<P>('the last check is made before the entry exists', async fixture => {
      const checkedAgainst = handle(fixture.checkedAgainst, 'checkedAgainst')
      const listing = handle(fixture.listing, 'listing')
      const s = scene(fixture)
      const spy = spyHandle<P>('instance-1')
      const registration = await s.registered(s.input(s.execution(), spy.handle), 'register')
      // A provider may check more than once before it writes; the last check precedes the write.
      assert.deepEqual(
        checkedAgainst.call(fixture).at(-1),
        [],
        'the entry existed when the last check was made',
      )
      assert.deepEqual(listing.call(fixture), [registration.receipt.registration])
    }),

    registrationCase<P>(
      'a qualification withdrawn while a register is in flight registers nothing',
      async fixture => {
        const refuseCheck = handle(fixture.refuseCheck, 'refuseCheck')
        const listing = handle(fixture.listing, 'listing')
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const pending = s.inFlight(s.input(s.execution(), spy.handle))
        const atCall = listing.call(fixture)
        refuseCheck.call(fixture, { kind: 'stale-publication' })
        const outcome = await s.answerOf(pending)
        if ('ok' in outcome) {
          // The entry was written in the step of the check, before the qualification was withdrawn.
          assert.deepEqual(
            atCall,
            [outcome.ok.receipt.registration],
            'the entry was written after the qualification was withdrawn',
          )
        } else {
          assert.equal(outcome.failure.kind, 'stale-publication')
          assert.deepEqual(listing.call(fixture), [])
        }
      },
    ),

    registrationCase<P>(
      'two fibers racing for one identity: one wins and one conflicts',
      async fixture => {
        handle(fixture.asFiber, 'asFiber')
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        const published = s.input(s.execution(), spy.handle)
        const outcomes = await Promise.all([
          s.inFiber('fiber-1', () => s.ask(published)),
          s.inFiber('fiber-2', () => s.ask(published)),
        ])
        const won = outcomes.filter(outcome => 'ok' in outcome)
        assert.equal(won.length, 1, 'exactly one registration stands')
        const lost = outcomes.find(outcome => 'failure' in outcome)
        assert.equal(lost !== undefined && 'failure' in lost ? lost.failure.kind : null, 'conflict')
      },
    ),

    registrationCase<P>('a fiber that exited registers nothing', async fixture => {
      handle(fixture.asFiber, 'asFiber')
      const endFiber = handle(fixture.endFiber, 'endFiber')
      const s = scene(fixture)
      const spy = spyHandle<P>('instance-1')
      const published = s.input(s.execution(), spy.handle)
      await endFiber.call(fixture, 'fiber-1')
      await s.inFiber('fiber-1', () => s.refusal(published, 'register from an exited fiber'))
      // Nothing was registered, so another fiber takes the identity.
      await s.inFiber('fiber-2', () => s.registered(published, 'register from a live fiber'))
    }),

    registrationCase<P>('the end of a fiber removes its registration once', async fixture => {
      handle(fixture.asFiber, 'asFiber')
      const endFiber = handle(fixture.endFiber, 'endFiber')
      const s = scene(fixture)
      const spy = spyHandle<P>('instance-1')
      const published = s.input(s.execution(), spy.handle)
      const original = await s.inFiber('fiber-1', () => s.registered(published, 'register'))
      await endFiber.call(fixture, 'fiber-1')
      const successor = await s.inFiber('fiber-2', () => s.registered(published, 'successor'))
      // The explicit release comes after the automatic one: it removes nothing, least of all the successor.
      assert.deepEqual(await original.release(), { removed: false })
      const recalled = await s.inFiber('fiber-2', () => s.registered(published, 'recall'))
      s.recalls(recalled, successor)
    }),

    registrationCase<P>(
      'a publication of another tenant is refused under the authority of a tenant',
      async fixture => {
        const otherTenant = otherTenantOf(fixture)
        const otherAuthority = handle(fixture.otherAuthority, 'otherAuthority')
        const s = scene(fixture)
        const spy = spyHandle<P>('instance-1')
        // The authority names the tenant that it was taken for: it does not carry the publication
        // of another one.
        const foreign = s.execution('call-1', otherTenant)
        await s.refusal(
          s.input(foreign, spy.handle),
          'register under the authority of another tenant',
        )
        // The refused register entered nothing: the other tenant registers under its own authority.
        await s.registered(
          s.input(foreign, spy.handle, otherAuthority),
          'register of the other tenant',
        )
      },
    ),

    registrationCase<P>('the tenants of one call register apart', async fixture => {
      const otherTenant = otherTenantOf(fixture)
      const otherAuthority = handle(fixture.otherAuthority, 'otherAuthority')
      const s = scene(fixture)
      const spy = spyHandle<P>('instance-1')
      const own = s.input(s.execution('call-1'), spy.handle)
      const other = s.input(s.execution('call-1', otherTenant), spy.handle, otherAuthority)
      const one = await s.registered(own, 'register of the tenant')
      const two = await s.registered(other, 'register of the other tenant')
      assert.notEqual(two.receipt.registration, one.receipt.registration)
      assert.deepEqual(await two.release(), { removed: true })
      const recalled = await s.registered(own, 'recall')
      s.recalls(recalled, one)
      assert.deepEqual(await one.release(), { removed: true })
    }),
  ]
}

// ---------------------------------------------------------------------------------------------
// The non-durable register service
// ---------------------------------------------------------------------------------------------

export interface MemoryToolRegistrations<P> extends ToolRegistrationService<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    asFiber<T>(fiber: string, work: () => Promise<T>): Promise<T>
    endFiber(fiber: string): Promise<void>
    refuseCheck(failure: ToolRegistrationFailure | null): void
    listing(): readonly string[]
    checkedAgainst(): readonly (readonly string[])[]
  }>
}

/** An evidence that the check accepts, and the tenant that it names. */
export type ToolRegistrationGrant = Readonly<{ authority: DurableEvidence; tenant: TenantId }>

type Entry<P> = {
  readonly token: string
  readonly fiber: string
  readonly execution: ToolExecutionRef
  readonly authority: DurableEvidence
  readonly handle: ToolHandle<P>
  readonly registration: ToolRegistration
}

const AMBIENT_FIBER = 'ambient'

function tenantKey(tenant: TenantId): string {
  return JSON.stringify([tenant.organization.text, tenant.account.text])
}

const sameEvidence = (left: DurableEvidence, right: DurableEvidence): boolean =>
  left.owner === right.owner && left.record === right.record && left.digest === right.digest

// Minted when a fixture is built, not when the module loads: an illegal text then fails the case
// that uses it instead of the import of every suite.
const memoryTenant = (): TenantId =>
  testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')
const memoryOtherTenant = (): TenantId =>
  testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000')
const evidenceOf = (record: string): DurableEvidence => ({
  owner: 'conformance',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})
const MEMORY_AUTHORITY = evidenceOf('authority')
const MEMORY_RENEWED_AUTHORITY = evidenceOf('authority-renewed')
const MEMORY_OTHER_AUTHORITY = evidenceOf('authority-other')

/** The grants of the in-memory fixture: two evidences of one tenant, and one of another. */
function memoryGrants(tenant: TenantId, otherTenant: TenantId): readonly ToolRegistrationGrant[] {
  return [
    { authority: MEMORY_AUTHORITY, tenant },
    { authority: MEMORY_RENEWED_AUTHORITY, tenant },
    { authority: MEMORY_OTHER_AUTHORITY, tenant: otherTenant },
  ]
}

/**
 * A register service in memory. The check, the test for a conflicting entry and the write are one
 * synchronous step, so no other register can come between them. The check accepts an authority
 * only for the tenant that its grant names. An entry is keyed by tenant and call; it is recalled
 * by the same fiber, handle object, instance, execution and authority, and it is removed only by
 * its own token, whether by `release` or by the end of its fiber.
 */
export function createMemoryToolRegistrations<P>(
  grants: readonly ToolRegistrationGrant[] = memoryGrants(memoryTenant(), memoryOtherTenant()),
): MemoryToolRegistrations<P> {
  const entries = new Map<string, Entry<P>>()
  const ended = new Set<string>()
  const checks: (readonly string[])[] = []
  const fibers = new AsyncLocalStorage<string>()
  let refusal: ToolRegistrationFailure | null = null
  let minted = 0

  const listing = (): readonly string[] => [...entries.values()].map(entry => entry.token)
  const keyOf = (execution: ToolExecutionRef): string =>
    JSON.stringify([tenantKey(execution.tenant), execution.call as ToolCallId])
  const granted = (input: ToolRegistrationInput<P>): boolean =>
    grants.some(
      grant =>
        sameEvidence(grant.authority, input.authority) &&
        tenantKey(grant.tenant) === tenantKey(input.publication[0].tenant),
    )

  const service: ToolRegistrationService<P> = {
    register: input => {
      const [execution, handle] = input.publication
      const fiber = fibers.getStore() ?? AMBIENT_FIBER
      checks.push(listing())
      if (refusal !== null) return Promise.resolve(fail(refusal))
      if (!granted(input)) return Promise.resolve(fail({ kind: 'denied' }))
      if (ended.has(fiber))
        return Promise.resolve(
          fail({ kind: 'unavailable', diagnostic: 'the caller fiber has exited' }),
        )
      const key = keyOf(execution)
      const existing = entries.get(key)
      if (existing !== undefined) {
        const same =
          existing.fiber === fiber &&
          existing.handle === handle &&
          JSON.stringify(existing.execution) === JSON.stringify(execution) &&
          sameEvidence(existing.authority, input.authority)
        return Promise.resolve(same ? succeed(existing.registration) : fail({ kind: 'conflict' }))
      }
      minted += 1
      const token = `registration-${minted}`
      const registration: ToolRegistration = {
        receipt: { execution, registration: token },
        release: () => {
          const current = entries.get(key)
          if (current?.token !== token) return Promise.resolve({ removed: false })
          entries.delete(key)
          return Promise.resolve({ removed: true })
        },
      }
      entries.set(key, {
        token,
        fiber,
        execution,
        authority: input.authority,
        handle,
        registration,
      })
      return Promise.resolve(succeed(registration))
    },
  }

  const controls: MemoryToolRegistrations<P>['controls'] = {
    asFiber: (fiber, work) => fibers.run(fiber, work),
    endFiber: async fiber => {
      ended.add(fiber)
      for (const entry of entries.values())
        if (entry.fiber === fiber) await entry.registration.release()
    },
    refuseCheck: failure => {
      refusal = failure
    },
    listing,
    checkedAgainst: () => checks.map(seen => [...seen]),
  }
  return Object.freeze({ ...service, durability: 'none' as const, controls })
}

/** A fresh fixture over a fresh in-memory register service, with every control handle. */
export function memoryToolRegistrationFixture(): ToolRegistrationFixture<string> {
  const tenant = memoryTenant()
  const otherTenant = memoryOtherTenant()
  const service = createMemoryToolRegistrations<string>(memoryGrants(tenant, otherTenant))
  const { controls } = service
  return {
    service,
    tenant,
    authority: MEMORY_AUTHORITY,
    renewedAuthority: MEMORY_RENEWED_AUTHORITY,
    otherTenant,
    otherAuthority: MEMORY_OTHER_AUTHORITY,
    asFiber: controls.asFiber,
    endFiber: controls.endFiber,
    refuseCheck: controls.refuseCheck,
    listing: controls.listing,
    checkedAgainst: controls.checkedAgainst,
  }
}
