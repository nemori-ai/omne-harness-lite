// The `./testing` entry: the registration-semantics suite of `ToolInstancesService.register` (IC-3)
// and a non-durable register service that conforms to it, then the G7 suite of the binding registry
// with its non-durable registry and the dynamics suite skeleton. The suites do not depend on a test
// framework and do not need a Cordis runtime: each takes a fixture that gives the service under
// test and its control handles. The service doubles declare `durability: 'none'`; they prove
// nothing about the real services and must not be assembled into production. The holder-reference
// reader double and the resident-key round-trip suite are re-exported at the end of this file.
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { isDeepStrictEqual } from 'node:util'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeStreamId } from '@omne-harness/stream-arrival'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeToolCallId,
  type Access,
  type Adoption,
  type DurableEvidence,
  type SourceLayer,
  type ToolCallId,
  type ToolDefinition,
  type ToolExecutionRef,
} from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  sameBindingKey,
  sameSourceLayer,
  shapeOf,
  type ToolAuthority,
  type ToolBindingEntry,
  type ToolBindingKey,
  type ToolBindingRegistry,
  type ToolContribution,
  type ToolContributionFailure,
  type ToolHandle,
  type ToolLoadedRegistration,
  type ToolLoader,
} from '@omne-harness/tool-contract/provider'
import {
  finalAnswer,
  NotApplicable,
  resendRecalls,
  testingTenant,
  testingWorkspace,
  type AnswerModel,
  type ConformanceCase,
} from '@omne-harness/tool-contract/testing'
import type {
  ToolAuthorityFailure,
  ToolGenerations,
  ToolResidencyReader,
  ToolResidencyReference,
  ToolRegistration,
  ToolRegistrationFailure,
  ToolRegistrationInput,
  VerifiedAuthority,
} from './cordis.ts'
import { residentKeyCases, type ResidentKeyRoundTripFixture } from './testing-resident-key.ts'

/** Observe the settings reader behind the public loaderFor/load seam, not a copied config value. */
export interface ToolLoaderSourceFixture<P, E, B extends ContentBlock> {
  readonly generations?: Pick<ToolGenerations<P, E, B>, 'loaderFor'>
  readonly authority: ToolAuthority
  readonly access: Access<P>
  readonly otherAccess: Access<P>
  readonly load: Omit<Parameters<ToolLoader<P, E, B>['load']>[0], keyof Access<P>>
  settingsReads(): readonly SourceLayer[]
}

/** The fixture supplies an official or organization contribution and two authorized registrants. */
export function toolLoaderSourceConformance<
  P,
  E,
  B extends ContentBlock,
>(): readonly ConformanceCase<ToolLoaderSourceFixture<P, E, B>>[] {
  return [
    {
      clause: 'P15',
      name: 'shared loading reads the contribution source, independently of the registrant tenant',
      async run(fixture) {
        if (!fixture.generations) throw new NotApplicable('loaderFor')
        assert.ok(['official', 'organization'].includes(fixture.authority.layer.kind))
        assert.notDeepEqual(fixture.access.tenant, fixture.otherAccess.tenant)
        const loader = fixture.generations.loaderFor(fixture.authority)
        const before = fixture.settingsReads().length
        for (const access of [fixture.access, fixture.otherAccess]) {
          const result = await loader.load({ ...fixture.load, ...access })
          assert.ok('ok' in result)
        }
        const reads = fixture.settingsReads().slice(before)
        assert.ok(reads.length > 0, 'observe an actual settings read through load')
        assert.ok(reads.every(source => sameSourceLayer(source, fixture.authority.layer)))
      },
    },
  ]
}

export type { AnswerModel, AnswerRow, ConformanceCase } from '@omne-harness/tool-contract/testing'
export {
  NotApplicable,
  isNotApplicable,
  runConformanceCase,
  type CaseVerdict,
} from '@omne-harness/tool-contract/testing'

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

/** A handle that the directory must never use to stop the work: it counts every observation. */
function spyHandle<P>(instance: string): Readonly<{ handle: ToolHandle<P>; observed(): number }> {
  let observed = 0
  const handle: ToolHandle<P> = {
    instance: minted(decodeToolInstanceId(instance), instance),
    generation: '1',
    stream: minted(decodeStreamId(`str_${instance}`), instance),
    observation: {
      observe: () => {
        observed += 1
        return (async function* (): AsyncGenerator<never> {})()
      },
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

// ---------------------------------------------------------------------------------------------
// The G7 suite of the binding registry (`ToolBindingRegistry.register` and the registry reads) and
// a non-durable registry that conforms to it. The suite follows the registration-semantics suite:
// no test framework, no Cordis runtime; the fixture gives the registry, the authorities of two
// keys and the fiber controls. The double declares `durability: 'none'`, keeps everything in one
// process and must not be assembled into production. The dynamics suite of RFC-0012 is a
// skeleton here: its ten cases name the criteria and report not applicable until 2.5 fills them.
// ---------------------------------------------------------------------------------------------

/** The registry that the G7 suite checks: `register` and the registry reads and marks. */
export type ToolBindingRegistryService<P> = ToolBindingRegistry<P, unknown, ContentBlock>

/**
 * What the G7 suite needs. A fresh fixture serves one case. `access` is a registrant the registry
 * admits at the layer of `authority`; `authority` and `otherAuthority` name two different binding
 * keys that the origin check accepts for that registrant; `foreignAuthority` names a key whose
 * origin check refuses (`denied`); a case that needs one that is missing reports not applicable.
 * `loaded(authority, digest)` builds a trusted loaded registration for the key of `authority` with
 * the given load digest. `asFiber` runs `work` as the caller fiber named `fiber`, and every
 * `register` that `work` starts belongs to that fiber; `endFiber` ends that fiber and its
 * automatic withdrawals, and resolves after the last entry is gone.
 */
export interface ToolBindingRegistryFixture<P> {
  readonly registry: ToolBindingRegistryService<P>
  readonly access: Access<P>
  readonly authority: ToolAuthority
  readonly otherAuthority?: ToolAuthority
  readonly foreignAuthority?: ToolAuthority
  loaded(authority: ToolAuthority, digest: string): ToolLoadedRegistration<unknown, ContentBlock>
  asFiber?<T>(fiber: string, work: () => T): T
  endFiber?(fiber: string): Promise<void>
}

function registered<P>(
  fixture: ToolBindingRegistryFixture<P>,
  authority: ToolAuthority,
  digest: string,
  what: string,
): ToolContribution {
  const outcome = fixture.registry.register({
    ...fixture.access,
    loaded: fixture.loaded(authority, digest),
    authority,
  })
  if ('failure' in outcome)
    assert.fail(`${what}: expected a contribution, got ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

function refusal<P>(
  fixture: ToolBindingRegistryFixture<P>,
  authority: ToolAuthority,
  digest: string,
  what: string,
): ToolContributionFailure {
  const outcome = fixture.registry.register({
    ...fixture.access,
    loaded: fixture.loaded(authority, digest),
    authority,
  })
  if ('ok' in outcome) assert.fail(`${what}: expected a failure, got a contribution`)
  return outcome.failure
}

function inFiber<P, T>(fixture: ToolBindingRegistryFixture<P>, fiber: string, work: () => T): T {
  if (fixture.asFiber === undefined) throw new NotApplicable('asFiber')
  return fixture.asFiber(fiber, work)
}

function entriesOf<P>(fixture: ToolBindingRegistryFixture<P>): readonly ToolBindingEntry[] {
  const snapshot = fixture.registry.snapshot({ scope: 'system' })
  if ('failure' in snapshot) assert.fail(`snapshot: ${JSON.stringify(snapshot.failure)}`)
  return snapshot.ok
}

const bindingCase = <P>(
  name: string,
  run: (fixture: ToolBindingRegistryFixture<P>) => Promise<void>,
): ConformanceCase<ToolBindingRegistryFixture<P>> => ({ name, clause: 'G7', run })

/** The G7 cases: recognition, conflict, successor, late release, race and the registry reads. */
export function toolBindingRegistryConformance<P>(): readonly ConformanceCase<
  ToolBindingRegistryFixture<P>
>[] {
  return [
    bindingCase<P>(
      'register answers the key, a token and an ordinal, and the entry is live',
      async fixture => {
        const contribution = registered(fixture, fixture.authority, 'digest-1', 'register')
        assert.ok(
          sameBindingKey(contribution.key, {
            layer: fixture.authority.layer,
            asset: fixture.authority.asset,
          }),
        )
        assert.ok(contribution.token.length > 0, 'the contribution names a token')
        assert.match(contribution.ordinal, /^(0|[1-9][0-9]*)$/u)
        const [entry, ...rest] = entriesOf(fixture)
        assert.equal(rest.length, 0)
        assert.ok(entry !== undefined && sameBindingKey(entry.key, contribution.key))
        assert.equal(entry.state, 'live')
        assert.equal(entry.digest, 'digest-1')
        assert.equal(entry.ordinal, contribution.ordinal)
      },
    ),

    bindingCase<P>(
      'the same fiber registering the same key with the same digest is recognised',
      async fixture => {
        const first = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register'),
        )
        const again = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register again'),
        )
        assert.equal(again.token, first.token)
        assert.equal(again.ordinal, first.ordinal)
        assert.equal(entriesOf(fixture).length, 1)
      },
    ),

    bindingCase<P>(
      'another digest or another fiber on a held key is a conflict and the original stands',
      async fixture => {
        const first = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register'),
        )
        const otherDigest = inFiber(fixture, 'fiber-1', () =>
          refusal(fixture, fixture.authority, 'digest-2', 'other digest'),
        )
        assert.deepEqual(otherDigest, { kind: 'conflict' })
        const otherFiber = inFiber(fixture, 'fiber-2', () =>
          refusal(fixture, fixture.authority, 'digest-1', 'other fiber'),
        )
        assert.deepEqual(otherFiber, { kind: 'conflict' })
        const entries = entriesOf(fixture)
        assert.equal(entries.length, 1)
        assert.equal(entries[0]?.digest, 'digest-1')
        assert.equal(entries[0]?.ordinal, first.ordinal)
      },
    ),

    bindingCase<P>(
      'a successor registers once the original released, with a new token and a later ordinal',
      async fixture => {
        const original = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register'),
        )
        assert.deepEqual(original.release(), { removed: true })
        const successor = inFiber(fixture, 'fiber-2', () =>
          registered(fixture, fixture.authority, 'digest-2', 'successor'),
        )
        assert.notEqual(successor.token, original.token)
        assert.ok(BigInt(successor.ordinal) > BigInt(original.ordinal), 'ordinals are monotonic')
      },
    ),

    bindingCase<P>(
      'a late release of the original removes nothing and leaves the successor',
      async fixture => {
        const original = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register'),
        )
        original.release()
        const successor = inFiber(fixture, 'fiber-2', () =>
          registered(fixture, fixture.authority, 'digest-2', 'successor'),
        )
        assert.deepEqual(original.release(), { removed: false })
        const entries = entriesOf(fixture)
        assert.equal(entries.length, 1)
        assert.equal(entries[0]?.ordinal, successor.ordinal)
        assert.deepEqual(successor.release(), { removed: true })
        assert.deepEqual(successor.release(), { removed: false })
      },
    ),

    bindingCase<P>(
      'two fibers racing for one key: the first in the ordering domain wins, the other conflicts',
      async fixture => {
        const outcomes = [
          inFiber(fixture, 'fiber-1', () =>
            fixture.registry.register({
              ...fixture.access,
              loaded: fixture.loaded(fixture.authority, 'digest-1'),
              authority: fixture.authority,
            }),
          ),
          inFiber(fixture, 'fiber-2', () =>
            fixture.registry.register({
              ...fixture.access,
              loaded: fixture.loaded(fixture.authority, 'digest-1'),
              authority: fixture.authority,
            }),
          ),
        ]
        const won = outcomes.filter(outcome => 'ok' in outcome)
        assert.equal(won.length, 1, 'exactly one contribution stands')
        const lost = outcomes.find(outcome => 'failure' in outcome)
        assert.deepEqual(lost !== undefined && 'failure' in lost ? lost.failure : null, {
          kind: 'conflict',
        })
      },
    ),

    bindingCase<P>('the end of a fiber withdraws its contribution once', async fixture => {
      const endFiber = handle(fixture.endFiber, 'endFiber')
      const original = inFiber(fixture, 'fiber-1', () =>
        registered(fixture, fixture.authority, 'digest-1', 'register'),
      )
      await endFiber.call(fixture, 'fiber-1')
      assert.equal(entriesOf(fixture).length, 0)
      const successor = inFiber(fixture, 'fiber-2', () =>
        registered(fixture, fixture.authority, 'digest-1', 'successor'),
      )
      assert.deepEqual(original.release(), { removed: false })
      assert.equal(entriesOf(fixture)[0]?.ordinal, successor.ordinal)
    }),

    bindingCase<P>('two keys of one capability are separate contributions', async fixture => {
      const other = handle(fixture.otherAuthority, 'otherAuthority')
      const first = registered(fixture, fixture.authority, 'digest-1', 'register')
      const second = registered(fixture, other, 'digest-2', 'register other key')
      assert.notEqual(second.token, first.token)
      assert.equal(entriesOf(fixture).length, 2)
      assert.deepEqual(second.release(), { removed: true })
      assert.equal(entriesOf(fixture).length, 1)
    }),

    bindingCase<P>(
      'a refused origin registers nothing, and the failure keeps its kind',
      async fixture => {
        const foreign = handle(fixture.foreignAuthority, 'foreignAuthority')
        assert.deepEqual(refusal(fixture, foreign, 'digest-1', 'foreign origin'), {
          kind: 'denied',
        })
        assert.equal(entriesOf(fixture).length, 0)
      },
    ),

    bindingCase<P>(
      'a loaded registration whose key is not the verified key is invalid',
      async fixture => {
        const other = handle(fixture.otherAuthority, 'otherAuthority')
        const outcome = fixture.registry.register({
          ...fixture.access,
          loaded: fixture.loaded(other, 'digest-1'),
          authority: fixture.authority,
        })
        assert.ok(
          'failure' in outcome && outcome.failure.kind === 'invalid',
          'a key mismatch is invalid',
        )
        assert.equal(entriesOf(fixture).length, 0)
      },
    ),

    bindingCase<P>(
      'close marks draining, reopen clears it, drain reports pins, and the contribution stays',
      async fixture => {
        const contribution = registered(fixture, fixture.authority, 'digest-1', 'register')
        assert.deepEqual(fixture.registry.pins(contribution.key), { ok: '0' })
        assert.deepEqual(fixture.registry.close(contribution.key), { ok: undefined })
        assert.equal(entriesOf(fixture)[0]?.state, 'draining')
        assert.deepEqual(fixture.registry.drain(contribution.key), {
          ok: { pins: '0', inflight: [] },
        })
        assert.deepEqual(fixture.registry.reopen(contribution.key), { ok: undefined })
        assert.equal(entriesOf(fixture)[0]?.state, 'live')
        const unknown: ToolBindingKey = {
          ...contribution.key,
          asset: { ...contribution.key.asset, name: 'absent' },
        }
        assert.deepEqual(fixture.registry.pins(unknown), { failure: { kind: 'unknown-key' } })
        assert.deepEqual(fixture.registry.close(unknown), { failure: { kind: 'unknown-key' } })
      },
    ),

    bindingCase<P>(
      'a tenant scope sees official and own-layer entries, not the entries of another tenant',
      async fixture => {
        const other = handle(fixture.otherAuthority, 'otherAuthority')
        registered(fixture, fixture.authority, 'digest-1', 'register')
        registered(fixture, other, 'digest-2', 'register other key')
        const own = fixture.registry.snapshot(fixture.access)
        if ('failure' in own) assert.fail('snapshot of the registrant')
        assert.equal(own.ok.length, 2)
        const stranger: Access<P> = {
          principal: fixture.access.principal,
          tenant: testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000'),
        }
        const seen = fixture.registry.snapshot(stranger)
        if ('failure' in seen) assert.fail('snapshot of another tenant')
        for (const entry of seen.ok)
          assert.ok(
            entry.key.layer.kind === 'official' || visibleTo(entry.key.layer, stranger.tenant),
            'another tenant saw a tenant or workspace entry it may not access',
          )
      },
    ),
  ]
}

/** G7 access by layer: official to every tenant, organization to the same organization, tenant to the same tenant. */
function visibleTo(layer: SourceLayer, tenant: Access<unknown>['tenant']): boolean {
  if (!tenantCodec.encode(tenant).ok) return false
  switch (layer.kind) {
    case 'official':
      return true
    case 'organization':
      return layer.organization.text === tenant.organization.text
    case 'tenant':
      return sameSourceLayer(layer, { kind: 'tenant', tenant })
    case 'workspace':
      // The double has no workspace grants: a workspace entry is visible to no tenant scope.
      return false
    default: {
      const unreachable: never = layer
      return unreachable
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The non-durable binding registry
// ---------------------------------------------------------------------------------------------

export interface MemoryToolBindingRegistry<P> extends ToolBindingRegistryService<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    asFiber<T>(fiber: string, work: () => T): T
    endFiber(fiber: string): Promise<void>
    /** The answer of the origin check for an authority, by the text of its holding evidence. */
    verify(authority: ToolAuthority): Outcome<VerifiedAuthority, ToolAuthorityFailure>
  }>
}

type BindingEntry = {
  readonly token: string
  readonly ordinal: string
  readonly fiber: string
  readonly digest: string
  readonly key: ToolBindingKey
  readonly contribution: ToolContribution
  readonly entry: { state: 'live' | 'draining'; shape: ToolBindingEntry['shape'] }
}

/** The grants of the in-memory registry: which holdings the origin check accepts, and for which registrant tenants. */
export type ToolBindingGrant = Readonly<{
  authority: ToolAuthority
  /** The tenants that may register at this authority's layer; null admits every tenant. */
  registrants: readonly Access<unknown>['tenant'][] | null
}>

/**
 * A binding registry in memory. The origin check, the conflict test and the write are one
 * synchronous step, so no other register can come between them. The entry is keyed by the
 * verified binding key; it is recognised by the same fiber with the same digest, and removed only
 * by its own token, whether by `release` or by the end of its fiber (G7).
 */
export function createMemoryToolBindingRegistry<P>(
  grants: readonly ToolBindingGrant[],
): MemoryToolBindingRegistry<P> {
  const entries: BindingEntry[] = []
  const ended = new Set<string>()
  const fibers = new AsyncLocalStorage<string>()
  let minted = 0

  const find = (key: ToolBindingKey): BindingEntry | undefined =>
    entries.find(entry => sameBindingKey(entry.key, key))
  // The double is the origin check here, so it is the one place that brands a granted authority.
  const verify = (authority: ToolAuthority): Outcome<VerifiedAuthority, ToolAuthorityFailure> => {
    const grant = grants.find(candidate =>
      sameEvidence(candidate.authority.holding, authority.holding),
    )
    if (grant === undefined) return fail({ kind: 'denied' })
    if (!sameSourceLayer(grant.authority.layer, authority.layer))
      return fail({ kind: 'invalid', reason: 'layer' })
    return succeed(grant.authority as VerifiedAuthority)
  }
  const admits = (tenant: Access<unknown>['tenant'], authority: ToolAuthority): boolean => {
    if (!tenantCodec.encode(tenant).ok) return false
    const grant = grants.find(candidate =>
      sameEvidence(candidate.authority.holding, authority.holding),
    )
    if (grant === undefined || grant.registrants === null) return grant !== undefined
    return grant.registrants.some(candidate =>
      sameSourceLayer({ kind: 'tenant', tenant: candidate }, { kind: 'tenant', tenant }),
    )
  }
  const remove = (token: string): boolean => {
    const index = entries.findIndex(entry => entry.token === token)
    if (index < 0) return false
    entries.splice(index, 1)
    return true
  }

  const registry: ToolBindingRegistryService<P> = {
    register: input => {
      const fiber = fibers.getStore() ?? AMBIENT_FIBER
      const verified = verify(input.authority)
      if ('failure' in verified) return verified
      if (!admits(input.tenant, input.authority)) return fail({ kind: 'denied' })
      const key: ToolBindingKey = { layer: verified.ok.layer, asset: verified.ok.asset }
      if (!sameBindingKey(input.loaded.key, key)) return fail({ kind: 'invalid', reason: 'key' })
      if (ended.has(fiber))
        return fail({ kind: 'unavailable', diagnostic: 'the caller fiber has exited' })
      const digest = input.loaded.executor.digest
      const existing = find(key)
      if (existing !== undefined) {
        const same = existing.fiber === fiber && existing.digest === digest
        return same ? succeed(existing.contribution) : fail({ kind: 'conflict' })
      }
      minted += 1
      const token = `contribution-${minted}`
      const ordinal = String(minted)
      const contribution: ToolContribution = Object.freeze({
        key,
        token,
        ordinal,
        release: () => Object.freeze({ removed: remove(token) }),
      })
      entries.push({
        token,
        ordinal,
        fiber,
        digest,
        key,
        contribution,
        entry: { state: 'live', shape: input.loaded.shape },
      })
      return succeed(contribution)
    },
    snapshot: scope => {
      if (!('scope' in scope) && !tenantCodec.encode(scope.tenant).ok)
        return fail({ kind: 'unavailable', diagnostic: 'tenant eligibility is unavailable' })
      return succeed(
        Object.freeze(
          entries
            .filter(entry => 'scope' in scope || visibleTo(entry.key.layer, scope.tenant))
            .map(entry =>
              Object.freeze({
                key: entry.key,
                ordinal: entry.ordinal,
                digest: entry.digest,
                shape: entry.entry.shape,
                state: entry.entry.state,
                fiber: entry.fiber,
              }),
            ),
        ),
      )
    },
    pins: key => (find(key) === undefined ? fail({ kind: 'unknown-key' }) : succeed('0')),
    close: key => {
      const entry = find(key)
      if (entry === undefined) return fail({ kind: 'unknown-key' })
      entry.entry.state = 'draining'
      return succeed(undefined)
    },
    reopen: key => {
      const entry = find(key)
      if (entry === undefined) return fail({ kind: 'unknown-key' })
      entry.entry.state = 'live'
      return succeed(undefined)
    },
    drain: key =>
      find(key) === undefined
        ? fail({ kind: 'unknown-key' })
        : succeed(Object.freeze({ pins: '0', inflight: Object.freeze([]) })),
  }

  const controls: MemoryToolBindingRegistry<P>['controls'] = {
    asFiber: (fiber, work) => fibers.run(fiber, work),
    endFiber: fiber => {
      ended.add(fiber)
      // Release mutates `entries`: pick the fiber's entries first, then release them.
      for (const entry of entries.filter(item => item.fiber === fiber)) entry.contribution.release()
      return Promise.resolve()
    },
    verify,
  }
  return Object.freeze({ ...registry, durability: 'none' as const, controls })
}

/** A tool scope definition for the fixture: a read_file function tool at version `revision`. */
function fixtureDefinition(name: string, adoption: Adoption): ToolDefinition {
  return {
    adoption,
    name,
    description: `The ${name} tool.`,
    requiredCapabilities: [],
    backgroundAllowed: false,
    declarations: {
      adoption: {
        owner: 'conformance',
        name: 'declarations',
        revision: '1',
        digest: 'sha256:declarations',
      },
      environment: null,
      attachments: [],
      inputModalities: [],
      outputModalities: [],
      settings: null,
    },
    kind: 'function',
    parameters: {
      schema: {
        kind: 'object',
        entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
      },
      vocabulary: {
        owner: 'conformance',
        name: 'json-schema',
        revision: '1',
        digest: 'sha256:json-schema',
      },
      descriptions: [],
    },
    returns: { kind: 'ordinary', program: { kind: 'none' } },
  }
}

function authorityOf(
  layer: SourceLayer,
  name: string,
  revision: string,
  holding: string,
): ToolAuthority {
  return {
    layer,
    asset: {
      name,
      adoption: { owner: 'conformance', name, revision, digest: `sha256:${name}-${revision}` },
    },
    holding: evidenceOf(holding),
    publication: evidenceOf(`${holding}-publication`),
  }
}

/**
 * A loaded registration for the double. Only a trusted loader builds this handle in production;
 * the double builds it for the suite and never leaves the testing entry.
 */
function loadedFor(
  authority: ToolAuthority,
  digest: string,
): ToolLoadedRegistration<unknown, ContentBlock> {
  const definition = fixtureDefinition(authority.asset.name, authority.asset.adoption)
  if (definition.kind !== 'function') throw new Error('the fixture definition is a function tool')
  const loaded = {
    implementation: Object.freeze({
      facts: Object.freeze({
        implements: {
          kind: 'function',
          parameters: definition.parameters,
          returns: definition.returns,
        },
        description: definition.description,
        backgroundAllowed: definition.backgroundAllowed,
        declarations: definition.declarations,
      }),
    }),
    key: { layer: authority.layer, asset: authority.asset },
    definition,
    shape: shapeOf(definition),
    executor: { owner: 'conformance', name: 'executor', revision: '1', digest },
    settings: { owner: 'conformance', name: 'settings', revision: '1', digest: 'sha256:settings' },
  }
  // The brand of a loaded registration has no run-time value; the double is the trusted loader here.
  return loaded as unknown as ToolLoadedRegistration<unknown, ContentBlock>
}

/** A fresh fixture over a fresh in-memory binding registry, with every control handle. */
export function memoryToolBindingRegistryFixture(): ToolBindingRegistryFixture<string> {
  const tenant = testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')
  const access: Access<string> = { principal: 'registrant', tenant }
  const authority = authorityOf({ kind: 'official' }, 'read_file', '1', 'holding-official')
  const otherAuthority = authorityOf({ kind: 'tenant', tenant }, 'read_file', '2', 'holding-tenant')
  const foreignAuthority = authorityOf({ kind: 'official' }, 'read_file', '3', 'holding-unknown')
  const registry = createMemoryToolBindingRegistry<string>([
    { authority, registrants: null },
    { authority: otherAuthority, registrants: [tenant] },
  ])
  return {
    registry,
    access,
    authority,
    otherAuthority,
    foreignAuthority,
    loaded: loadedFor,
    asFiber: registry.controls.asFiber,
    endFiber: registry.controls.endFiber,
  }
}

// ---------------------------------------------------------------------------------------------
// The dynamics suite skeleton (RFC-0012, SYS-DYNAMIC for Tool)
// ---------------------------------------------------------------------------------------------

/**
 * What the dynamics suite will drive: a real Cordis `Context` with the five stable providers, the
 * generation coordinator and a session reference reader. The handles are named here so 2.5 fills
 * the case bodies against a fixed fixture shape; every case reports not applicable until then.
 */
export interface ToolDynamicsFixture {
  readonly context?: unknown
  readonly generations?: unknown
  readonly residency?: unknown
}

/** The ten criteria of RFC-0012「验收判据」, in order. */
export const TOOL_DYNAMICS_CRITERIA = [
  'the fiber uid of toolRuntime, toolCommands, toolReads and toolInstances is unchanged across a load',
  'same-key recognition and conflict; release withdraws only its own token; a late release leaves the successor',
  'unload with a referencing session and no same-shape substitute returns retained and the contribution stays live',
  'unload without references or in-flight calls goes draining to released; resolve then answers unavailable; the fiber is DISPOSED',
  'old and new versions coexist; a different-shape new version serves new sessions only',
  'a refresh during a Run routes later calls to a same-shape new implementation; the recorded basis is unchanged',
  'a different-shape new version keeps the old one; the session stays usable',
  'a sudden fiber removal gives known-unavailable; in-flight calls recover as unknown; a reload continues at the next adoption point',
  'no same-shape contribution, missing package and a different-shape winner: the next adoption point freezes once; repeats are no-ops',
  'unrelated capabilities see zero failures throughout; P16 directory and Catalog absence semantics are unchanged',
] as const

const dynamicsCase = (index: number, name: string): ConformanceCase<ToolDynamicsFixture> => ({
  name: `dynamics ${index + 1}: ${name}`,
  clause: 'RFC-0012',
  run: () => {
    // The case body arrives with 2.5 (coordinator and author plugin on real Cordis 4.0.4).
    throw new NotApplicable('generations')
  },
})

/** The dynamics suite skeleton: ten named cases, each not applicable until 2.5 fills it. */
export function runToolDynamicsSuite(): readonly ConformanceCase<ToolDynamicsFixture>[] {
  return TOOL_DYNAMICS_CRITERIA.map((name, index) => dynamicsCase(index, name))
}

/** Source facts for this key. Include equal holder texts under different tenants. */
export interface ToolResidencyReaderFixture {
  readonly reader: ToolResidencyReader
  readonly key: ToolBindingKey
  readonly references: readonly ToolResidencyReference[]
  /** Makes the next page read unavailable, including an already obtained cursor. */
  interrupt?(): void
}

/** Reader checks only; this suite does not implement the generation coordinator. */
export function toolResidencyReaderConformance(): readonly ConformanceCase<ToolResidencyReaderFixture>[] {
  return [
    {
      name: 'all pages preserve every holder tenant and first shape',
      clause: 'G7',
      async run({ reader, key, references }) {
        let after: string | null = null
        const cursors = new Set<string>()
        const items: ToolResidencyReference[] = []
        do {
          const page = await reader.referencing({ scope: 'system', key, after })
          if ('failure' in page) assert.fail(`referencing: ${page.failure.diagnostic}`)
          items.push(...page.ok.items)
          after = page.ok.next
          if (after !== null) {
            assert.equal(cursors.has(after), false, 'a cursor must advance')
            cursors.add(after)
          }
        } while (after !== null)
        const remaining = [...references]
        for (const item of items) {
          const index = remaining.findIndex(reference => isDeepStrictEqual(reference, item))
          assert.notEqual(index, -1, 'each reference must retain its holder, tenant and shape')
          remaining.splice(index, 1)
        }
        assert.equal(remaining.length, 0, 'every source reference must be returned')
      },
    },
    {
      name: 'a page failure stays unavailable and cannot become an empty terminal page',
      clause: 'G7',
      async run({ reader, key, interrupt }) {
        if (interrupt === undefined) throw new NotApplicable('interrupt')
        const first = await reader.referencing({ scope: 'system', key, after: null })
        if ('failure' in first) assert.fail('the first page must be readable')
        if (first.ok.next === null) throw new NotApplicable('multiple-pages')
        interrupt()
        const page = await reader.referencing({ scope: 'system', key, after: first.ok.next })
        assert.ok('failure' in page, 'interruption must not claim an empty result')
        assert.equal(page.failure.kind, 'unavailable')
      },
    },
  ]
}

export {
  createMemoryToolResidencyReader,
  type MemoryToolResidencyReader,
  type ResidentReferencesRead,
} from './testing-residency-memory.ts'
export type { ResidentKeyRoundTripFixture } from './testing-resident-key.ts'

/** The round-trip suite of the resident key (XC-RESKEY); see testing-resident-key.ts. */
export function residentKeyRoundTripConformance(): readonly ConformanceCase<ResidentKeyRoundTripFixture>[] {
  return residentKeyCases({
    tenant: testingTenant,
    workspace: testingWorkspace,
    missing: handle => {
      throw new NotApplicable(handle)
    },
  })
}
