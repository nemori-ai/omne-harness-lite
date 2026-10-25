// The conformance suite of the authorization consumption point of P04 (SPEC「授权消费点与撤权再核」,
// J50). The suite binds permits, revokes the admission and reads the permit ledger through fixture
// handles, and it observes the start only through `consume` and `inspect`. The conforming double,
// `createMemoryAuthorizedToolStartAuthority`, lives with the start authority double.
import assert from 'node:assert/strict'
import type { FixedToolRequest } from './definitions.ts'
import type { ToolCallId } from './identity.ts'
import type { ToolStartRecord } from './ports.ts'
import type { StartGuard, StartPermit, StartProgress, ToolPermitRef } from './records.ts'
import {
  completionOf,
  conformanceCase,
  expectKind,
  expectOneOf,
  finalAnswer,
  handle,
  otherAccessOf,
  resendRecalls,
  succeeded,
  type ConformanceCase,
} from './testing-case.ts'
import {
  createMemoryAuthorizedToolStartAuthority,
  startAuthorityAnswers,
  type ToolStartAuthorizationHandles,
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
} from './testing-values.ts'

/**
 * What the suite needs, on top of the start authority fixture. Without `authorization` every case
 * is reported not applicable, naming the handle `authorization`.
 */
export interface ToolStartAuthorizationFixture<P> extends ToolStartAuthorityFixture<P> {
  readonly authorization?: ToolStartAuthorizationHandles<P>
}

type Fixture<P> = ToolStartAuthorizationFixture<P>
const answers = startAuthorityAnswers

function scene<P>(fixture: Fixture<P>) {
  const { authority, access } = fixture
  const authorization = handle(fixture.authorization, 'authorization')
  const request: FixedToolRequest = fixture.request ?? fixedRequest()
  const completion = completionOf(fixture, 'settle')
  const at = (name: string) => {
    const call: ToolCallId = callId(name)
    const start = startRecord(access, call)
    const callAccess = { ...access, call }
    const tryConsumeFinal = (permit: StartPermit) =>
      finalAnswer({
        ask: () =>
          authority.consume({ ...callAccess, permit, executorReceipt: evidence('capsule') }),
        row: answers.consume,
        completion,
        what: `consume of ${name}`,
      })
    const resume: Extract<ToolStartRecord, { kind: 'resume' }> = {
      kind: 'resume',
      operation: operationId(`${name}/resume-1`),
      executor: start.executor,
      execution: start.execution,
      checkpoint: evidence('checkpoint-1'),
    }
    const dependency = (which: 'ledger' | 'admission') => ({ access, call, dependency: which })
    return {
      outage: (which: 'ledger' | 'admission') =>
        handle(authorization.outage, 'outage').call(authorization, dependency(which)),
      restore: (which: 'ledger' | 'admission') =>
        handle(authorization.restore, 'restore').call(authorization, dependency(which)),
      prepareResume: async (): Promise<StartPermit> =>
        succeeded(
          await authority.prepare({ ...callAccess, start: resume, request }),
          `prepare a resume of ${name}`,
        ),
      invalidate: async (permit: StartPermit): Promise<void> => {
        succeeded(
          await authority.invalidate({
            ...access,
            operation: operationId(`${name}/invalidate-1`),
            guard: handle<StartGuard>(permit.guards[0], 'guard'),
          }),
          `invalidate the guard of ${name}`,
        )
      },
      bind: (permit?: ToolPermitRef) =>
        authorization.bind(permit === undefined ? { access, call } : { access, call, permit }),
      revoke: () => authorization.revoke({ access, call }),
      prepare: async (): Promise<StartPermit> =>
        succeeded(await authority.prepare({ ...callAccess, start, request }), `prepare ${name}`),
      consumeFinal: async (permit: StartPermit): Promise<StartProgress> =>
        succeeded(await tryConsumeFinal(permit), `consume of ${name}`),
      consume: async (permit: StartPermit): Promise<StartProgress> =>
        succeeded(
          await authority.consume({ ...callAccess, permit, executorReceipt: evidence('capsule') }),
          `consume of ${name}`,
        ),
      inspect: async (): Promise<StartProgress> =>
        succeeded(await authority.inspect({ ...callAccess, start }), `inspect ${name}`),
      inspectFinal: async (): Promise<StartProgress> =>
        succeeded(
          await finalAnswer({
            ask: () => authority.inspect({ ...callAccess, start }),
            row: answers.inspect,
            completion,
            what: `inspect ${name}`,
          }),
          `inspect ${name}`,
        ),
    }
  }
  /** A fresh permit that the authorization owner granted to another tenant. */
  const foreignPermit = () =>
    authorization.bind({ access: otherAccessOf(fixture), call: callId('call-foreign') })
  return { at, foreignPermit, read: (permit: ToolPermitRef) => authorization.read(permit) }
}

function assertRefused(progress: StartProgress, what: string): void {
  expectOneOf(progress, ['rejected', 'not-started'], what)
}

async function consumedOnce<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const call = s.at('call-1')
  const permit = await call.bind()
  const startPermit = await call.prepare()
  assert.equal((await s.read(permit)).kind, 'open', 'a permit is open before the consume')
  const accepted = expectKind(await call.consumeFinal(startPermit), 'started', 'consume')
  const reading = expectKind(await s.read(permit), 'consumed', 'the permit after the acceptance')
  assert.deepEqual(reading.fact.permit, permit, 'the consumption fact carries the permit reference')
  resendRecalls(
    answers.consume,
    { earlier: accepted, later: await call.consume(startPermit) },
    'consume again',
  )
  // The resend recalled the acceptance and consumed nothing more.
  assert.deepEqual(await s.read(permit), reading, 'the resend consumed the permit again')
}

async function noRevival<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const first = s.at('call-1')
  const permit = await first.bind()
  expectKind(
    await first.consumeFinal(await first.prepare()),
    'started',
    'consume of the first call',
  )
  const reading = expectKind(await s.read(permit), 'consumed', 'the permit after the first start')
  const second = s.at('call-2')
  await second.bind(permit)
  assertRefused(
    await second.consumeFinal(await second.prepare()),
    'consume of another call that presents the consumed permit',
  )
  assertRefused(await second.inspectFinal(), 'inspect of the other call')
  assert.deepEqual(await s.read(permit), reading, 'the consumption fact did not change')
}

async function revokedBeforeConsume<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const call = s.at('call-1')
  const permit = await call.bind()
  const startPermit = await call.prepare()
  await call.revoke()
  // A denied verdict refuses for good: not-started would let the same start be asked again.
  expectKind(await call.consumeFinal(startPermit), 'rejected', 'consume after the revocation')
  // The recheck comes before the consumption: a refused start spends no permit.
  assert.equal((await s.read(permit)).kind, 'open', 'the refused start consumed the permit')
}

async function revokedAfterAcceptance<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const call = s.at('call-1')
  await call.bind()
  const startPermit = await call.prepare()
  const accepted = expectKind(await call.consumeFinal(startPermit), 'started', 'consume')
  await call.revoke()
  // The residual window: a revocation after the acceptance neither withdraws nor stops it.
  resendRecalls(answers.inspect, { earlier: accepted, later: await call.inspect() }, 'inspect')
  resendRecalls(
    answers.consume,
    { earlier: accepted, later: await call.consume(startPermit) },
    'consume again',
  )
}

async function notStartedKeepsPermit<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const call = s.at('call-1')
  const permit = await call.bind()
  await call.prepare()
  expectKind(await call.inspectFinal(), 'not-started', 'inspect of an undecided start')
  assert.equal((await s.read(permit)).kind, 'open', 'a start that did not happen spent the permit')
  expectKind(await call.consumeFinal(await call.prepare()), 'started', 'consume of a new permit')
  expectKind(await s.read(permit), 'consumed', 'the permit after the acceptance')
}

/** One read of consume while a dependency cannot be read: undecided, and the permit stays issued. */
async function unreadableKeepsTask<P>(
  fixture: Fixture<P>,
  which: 'ledger' | 'admission',
): Promise<void> {
  const s = scene(fixture)
  const call = s.at('call-1')
  const permit = await call.bind()
  const startPermit = await call.prepare()
  await call.outage(which)
  const undecided = await call.consume(startPermit)
  // Unreadable is not refused: the answer stays undecided, never rejected and never started.
  expectKind(undecided, 'unknown', `consume while the ${which} cannot be read`)
  if (which === 'ledger')
    assert.equal((await s.read(permit)).kind, 'unavailable', 'the ledger read during its outage')
  await call.restore(which)
  assert.equal((await s.read(permit)).kind, 'open', 'the undecided consume spent the permit')
  // The original task asks again with the same permit, and the start is accepted.
  expectKind(await call.consumeFinal(startPermit), 'started', 'consume after the restore')
  expectKind(await s.read(permit), 'consumed', 'the permit after the acceptance')
}

async function ledgerUnreadable<P>(fixture: Fixture<P>): Promise<void> {
  await unreadableKeepsTask(fixture, 'ledger')
}

async function admissionUnavailable<P>(fixture: Fixture<P>): Promise<void> {
  await unreadableKeepsTask(fixture, 'admission')
}

async function foreignTenantPermit<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const permit = await s.foreignPermit()
  const call = s.at('call-1')
  await call.bind(permit)
  expectKind(
    await call.consumeFinal(await call.prepare()),
    'rejected',
    'consume of a call bound to a permit of another tenant',
  )
  assert.equal((await s.read(permit)).kind, 'open', 'the permit of another tenant was consumed')
}

async function resumeKeepsPosition<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const call = s.at('call-1')
  const permit = await call.bind()
  expectKind(await call.consumeFinal(await call.prepare()), 'started', 'consume of the start')
  const first = expectKind(await s.read(permit), 'consumed', 'the permit after the start')
  // A resume is another start operation of the same call: it recognises the consumption of its
  // call at the same position and consumes nothing more.
  expectKind(
    await call.consumeFinal(await call.prepareResume()),
    'started',
    'consume of the resume',
  )
  assert.deepEqual(await s.read(permit), first, 'the resume consumed the permit again')
}

async function guardsBeforeConsumption<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const call = s.at('call-1')
  const permit = await call.bind()
  const startPermit = await call.prepare()
  await call.invalidate(startPermit)
  expectKind(await call.consumeFinal(startPermit), 'rejected', 'consume after the guard moved')
  // The guards come before the consumption: a start that the guard refuses spends no permit.
  assert.equal((await s.read(permit)).kind, 'open', 'the refused start consumed the permit')
}

export function toolStartAuthorizationConformance<P>(): readonly ConformanceCase<Fixture<P>>[] {
  const named = (name: string, run: (fixture: Fixture<P>) => Promise<void>) =>
    conformanceCase('P04', name, run)
  return [
    named('consume consumes the bound permit once and a resend recalls it', consumedOnce),
    named('another call that presents a consumed permit never starts', noRevival),
    named(
      'a revocation before the consume refuses the start and spends no permit',
      revokedBeforeConsume,
    ),
    named('a revocation after the acceptance leaves the start accepted', revokedAfterAcceptance),
    named('a start answered not-started keeps the permit for its call', notStartedKeepsPermit),
    named(
      'an unreadable permit ledger leaves the start undecided and keeps its task',
      ledgerUnreadable,
    ),
    named(
      'an unavailable admission verdict leaves the start undecided and keeps its task',
      admissionUnavailable,
    ),
    named('a permit of another tenant is never consumed', foreignTenantPermit),
    named('a resume of the call consumes nothing more at the same position', resumeKeepsPosition),
    named('a start refused by a moved guard spends no permit', guardsBeforeConsumption),
  ]
}

/** A fresh fixture over a fresh authorized in-memory authority. */
export function memoryToolStartAuthorizationFixture(): ToolStartAuthorizationFixture<string> {
  const authority = createMemoryAuthorizedToolStartAuthority<string>()
  return {
    authority,
    authorization: authority.authorization,
    access: memoryAccess('tester'),
    otherAccess: memoryOtherAccess('tester-other'),
    settle: () => Promise.resolve(),
  }
}
