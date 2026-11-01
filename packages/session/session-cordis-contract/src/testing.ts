// Test resources of the Session Cordis definitions. The cursor signing has a fixed HMAC-SHA-256
// double and its conformance suite. The keys are public test bytes. The double reads no
// environment, disk or real key and must not enter a production plugin tree.
//
// The two trusted narrow ports of D-AUTH r4 4.1, the session ownership read
// (`sessionPrincipalBindings`) and the per-session work principals (`sessionWorkPrincipals`),
// each have a non-durable double that answers from an explicit table and records its requests,
// and a conformance suite. The work principals double follows the failure mapping of r4 over a
// binding source. It proves the mapping in memory, not the issuer of the assembly entry.
import assert from 'node:assert/strict'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  SessionFailure,
  SessionId,
  SessionPrincipalBindingSource,
  SessionWorkPrincipals,
} from '@omne-harness/session-contract'
import {
  conformanceCase,
  evidence,
  handle,
  type ConformanceCase,
} from '@omne-harness/session-contract/testing'
import type {
  SessionCursorSignature,
  SessionCursorSigning,
  SessionCursorSignResult,
  SessionCursorVerifyResult,
} from './cursor-signing.ts'

const keyFrom = (start: number): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => start + i)
const KEYS = [
  { keyId: 'test-session-cursor-1', bytes: keyFrom(0x00) },
  { keyId: 'test-session-cursor-2', bytes: keyFrom(0x20) },
] as const

/** The controls of the double. They are not part of the production service. */
export interface FixedSessionCursorSigningControls {
  /** Switch to the second public key (`test-session-cursor-2`). */
  rotate(): void
  /** The key source cannot be read: sign and verify answer `unavailable`. */
  setUnavailable(unavailable: boolean): void
  /** The provider unloads: every later and every pending call answers `unavailable`. */
  unload(): void
}
export interface FixedSessionCursorSigning extends SessionCursorSigning {
  readonly durability: 'none'
  readonly controls: FixedSessionCursorSigningControls
}

export function createFixedSessionCursorSigning(): FixedSessionCursorSigning {
  let current = 0
  let unavailable = false
  let unloaded = false
  const mac = (key: Uint8Array, payload: Uint8Array): Buffer =>
    createHmac('sha256', key).update(payload).digest()
  return Object.freeze({
    durability: 'none' as const,
    async sign(payload: Uint8Array): Promise<SessionCursorSignResult> {
      // Input bytes are captured and the key is chosen before the first await.
      const bytes = Uint8Array.from(payload)
      const key = KEYS[current]!
      const closedNow = unavailable || unloaded
      await Promise.resolve()
      if (closedNow || unloaded) return { kind: 'unavailable' }
      return {
        kind: 'signed',
        value: { keyId: key.keyId, signature: Uint8Array.from(mac(key.bytes, bytes)) },
      }
    },
    async verify(
      input: Parameters<SessionCursorSigning['verify']>[0],
    ): Promise<SessionCursorVerifyResult> {
      const payload = Uint8Array.from(input.payload)
      const { keyId } = input.signature
      const given = Uint8Array.from(input.signature.signature)
      const key = KEYS[current]!
      const closedNow = unavailable || unloaded
      await Promise.resolve()
      if (closedNow || unloaded) return { kind: 'unavailable' }
      // A rotation during the call makes the key chosen before the await stale: not a success of the old key.
      if (keyId !== key.keyId || KEYS[current] !== key) return { kind: 'invalid' }
      const expected = mac(key.bytes, payload)
      return given.length === expected.length && timingSafeEqual(given, expected)
        ? { kind: 'valid' }
        : { kind: 'invalid' }
    },
    controls: Object.freeze({
      rotate: () => {
        current = 1
      },
      setUnavailable: (value: boolean) => {
        unavailable = value
      },
      unload: () => {
        unloaded = true
      },
    }),
  })
}

export interface SessionCursorSigningFixture {
  readonly signing: SessionCursorSigning
  readonly controls: FixedSessionCursorSigningControls
}

const text = (value: string): Uint8Array => new TextEncoder().encode(value)

async function signed(signing: SessionCursorSigning, payload: Uint8Array) {
  const result = await signing.sign(payload)
  assert.equal(result.kind, 'signed', 'sign')
  return (result as Extract<SessionCursorSignResult, { kind: 'signed' }>).value
}

export function sessionCursorSigningConformance(): readonly ConformanceCase<SessionCursorSigningFixture>[] {
  return [
    conformanceCase(
      'RD-CURSOR',
      'a signature verifies for the same payload',
      async ({ signing }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        assert.deepEqual(await signing.verify({ payload, signature: value }), { kind: 'valid' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'any changed payload byte, key id or signature byte is invalid',
      async ({ signing }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        for (let at = 0; at < payload.length; at += 1) {
          const changed = Uint8Array.from(payload)
          changed[at] = changed[at]! ^ 1
          assert.deepEqual(await signing.verify({ payload: changed, signature: value }), {
            kind: 'invalid',
          })
        }
        const other: SessionCursorSignature = { ...value, keyId: `${value.keyId}-x` }
        assert.deepEqual(await signing.verify({ payload, signature: other }), { kind: 'invalid' })
        const flipped = Uint8Array.from(value.signature)
        flipped[0] = flipped[0]! ^ 1
        assert.deepEqual(
          await signing.verify({ payload, signature: { ...value, signature: flipped } }),
          { kind: 'invalid' },
        )
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'a rotated-out key is invalid and the new key signs',
      async ({ signing, controls }) => {
        const payload = text('cursor-payload')
        const old = await signed(signing, payload)
        controls.rotate()
        assert.deepEqual(await signing.verify({ payload, signature: old }), { kind: 'invalid' })
        const fresh = await signed(signing, payload)
        assert.notEqual(fresh.keyId, old.keyId)
        assert.deepEqual(await signing.verify({ payload, signature: fresh }), { kind: 'valid' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'a verify in flight at a rotation is invalid, not a success of the old key',
      async ({ signing, controls }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        const pending = signing.verify({ payload, signature: value })
        controls.rotate()
        assert.deepEqual(await pending, { kind: 'invalid' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'an unreadable key source is unavailable, never invalid',
      async ({ signing, controls }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        controls.setUnavailable(true)
        assert.deepEqual(await signing.sign(payload), { kind: 'unavailable' })
        assert.deepEqual(await signing.verify({ payload, signature: value }), {
          kind: 'unavailable',
        })
        controls.setUnavailable(false)
        assert.deepEqual(await signing.verify({ payload, signature: value }), { kind: 'valid' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'a call pending at unload does not answer as current',
      async ({ signing, controls }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        const pending = signing.verify({ payload, signature: value })
        controls.unload()
        assert.deepEqual(await pending, { kind: 'unavailable' })
        assert.deepEqual(await signing.sign(payload), { kind: 'unavailable' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'input bytes are captured before the first await and the output is exclusive',
      async ({ signing }) => {
        const payload = text('cursor-payload')
        const kept = Uint8Array.from(payload)
        const pending = signing.sign(payload)
        payload.fill(0)
        const result = (await pending) as Extract<SessionCursorSignResult, { kind: 'signed' }>
        assert.equal(result.kind, 'signed')
        assert.deepEqual(await signing.verify({ payload: kept, signature: result.value }), {
          kind: 'valid',
        })
        result.value.signature.fill(0)
        const again = await signed(signing, kept)
        assert.deepEqual(await signing.verify({ payload: kept, signature: again }), {
          kind: 'valid',
        })
      },
    ),
  ]
}

// The member does not depend on operation-result; outcomes are written in its plain shape.
type Outcome<T, F> = { ok: T } | { failure: F }
const succeed = <T>(value: T): { ok: T } => ({ ok: value })
const fail = <F>(failure: F): { failure: F } => ({ failure })

type BindingRead = Awaited<ReturnType<SessionPrincipalBindingSource['read']>>
type WorkRequest = Parameters<SessionWorkPrincipals<unknown>['forSession']>[0]
type SessionRef = Readonly<{ tenant: TenantId; session: SessionId }>

/** One scripted answer of the binding read: a result, or a throw of `error`. */
export type SessionPrincipalBindingsScript =
  | BindingRead
  | Readonly<{ kind: 'throw'; error: unknown }>

export interface MemorySessionPrincipalBindings extends SessionPrincipalBindingSource {
  readonly durability: 'none'
  readonly controls: Readonly<{
    /** Records `session` as established under `tenant`. */
    bind(tenant: TenantId, session: SessionId): void
    /** The next read answers `script` instead of the table. Scripts queue in call order. */
    answerNext(script: SessionPrincipalBindingsScript): void
    /** The received requests in call order. */
    asked(): readonly SessionRef[]
  }>
}

/** A table of established sessions. A session not in the table, or under another tenant, is not bound. */
export function createMemorySessionPrincipalBindings(
  bound: readonly SessionRef[] = [],
): MemorySessionPrincipalBindings {
  const table: SessionRef[] = [...bound]
  const scripts: SessionPrincipalBindingsScript[] = []
  const asked: SessionRef[] = []
  return Object.freeze({
    durability: 'none' as const,
    async read(input: SessionRef): Promise<BindingRead> {
      asked.push({ tenant: input.tenant, session: input.session })
      const script = scripts.shift()
      if (script !== undefined) {
        if ('kind' in script) throw script.error
        return script
      }
      const found = table.find(
        item => tenantEquals(item.tenant, input.tenant) && item.session === input.session,
      )
      return found === undefined
        ? succeed({ kind: 'not-bound' as const })
        : succeed({
            kind: 'bound' as const,
            tenant: found.tenant,
            session: found.session,
            source: evidence(`session-binding/${found.session}`),
          })
    },
    controls: Object.freeze({
      bind: (tenant: TenantId, session: SessionId) => {
        table.push({ tenant, session })
      },
      answerNext: (script: SessionPrincipalBindingsScript) => {
        scripts.push(script)
      },
      asked: () => [...asked],
    }),
  })
}

export interface MemorySessionWorkPrincipals<P> extends SessionWorkPrincipals<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    /** The next issue fails, as an `IssueFailure` of the identity issuer would. */
    failNextIssue(): void
    /** The received requests in call order. */
    asked(): readonly WorkRequest[]
  }>
}

type WorkFailure = Extract<SessionFailure, { kind: 'denied' | 'unavailable' | 'quarantined' }>

/**
 * Per-session principals over `bindings`, in the failure mapping of D-AUTH r4 4.1. `issue` makes
 * the principal of one checked request; the double calls it only after the binding matched.
 */
export function createMemorySessionWorkPrincipals<P>(
  input: Readonly<{
    bindings: SessionPrincipalBindingSource
    issue(request: WorkRequest): P
  }>,
): MemorySessionWorkPrincipals<P> {
  let failIssue = false
  const asked: WorkRequest[] = []
  return Object.freeze({
    durability: 'none' as const,
    async forSession(request: WorkRequest): Promise<Outcome<P, WorkFailure>> {
      asked.push(request)
      let read: BindingRead
      try {
        read = await input.bindings.read({ tenant: request.tenant, session: request.session })
      } catch (error) {
        return fail({
          kind: 'unavailable',
          owner: 'sessionPrincipalBindings',
          diagnostic: `the binding read threw: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
      if ('failure' in read) return fail(read.failure)
      if (read.ok.kind === 'not-bound') return fail({ kind: 'denied', action: 'forSession' })
      if (!tenantEquals(read.ok.tenant, request.tenant) || read.ok.session !== request.session)
        return fail({
          kind: 'quarantined',
          diagnostic: 'the binding source answered another tenant or session',
        })
      if (failIssue) {
        failIssue = false
        return fail({
          kind: 'unavailable',
          owner: 'identity',
          diagnostic: 'the issuer refused a checked request',
        })
      }
      return succeed(input.issue(request))
    },
    controls: Object.freeze({
      failNextIssue: () => {
        failIssue = true
      },
      asked: () => [...asked],
    }),
  })
}

/** What the binding suite needs: a source where `bound` is established, and another tenant. */
export interface SessionPrincipalBindingsFixture {
  readonly source: SessionPrincipalBindingSource
  readonly bound: SessionRef
  readonly otherTenant: TenantId
}

const BINDING_CLAUSE = 'D-AUTH r4 4.1'

export function sessionPrincipalBindingsConformance(): readonly ConformanceCase<SessionPrincipalBindingsFixture>[] {
  return [
    conformanceCase(
      BINDING_CLAUSE,
      'an established session reads bound, with its own tenant and session and a source',
      async ({ source, bound }) => {
        const read = await source.read(bound)
        assert.ok('ok' in read, `read: expected success, got ${JSON.stringify(read)}`)
        assert.equal(read.ok.kind, 'bound')
        if (read.ok.kind !== 'bound') return
        assert.ok(tenantEquals(read.ok.tenant, bound.tenant), 'another tenant')
        assert.equal(read.ok.session, bound.session)
        assert.ok(read.ok.source.record.length > 0, 'no source')
      },
    ),
    conformanceCase(
      BINDING_CLAUSE,
      'an unknown session and the session under another tenant both read not-bound, alike',
      async ({ source, bound, otherTenant }) => {
        const ghost = await source.read({
          ...bound,
          session: `${bound.session}-ghost` as SessionId,
        })
        const foreign = await source.read({ tenant: otherTenant, session: bound.session })
        assert.deepEqual(ghost, succeed({ kind: 'not-bound' }))
        assert.deepEqual(foreign, ghost, 'the answer tells that the session exists')
      },
    ),
  ]
}

/**
 * What the work principals suite needs. `principals` reads a binding source where `bound` is
 * established. `answerNextRead`, when offered, scripts the next read of that source;
 * `failNextIssue` makes the next issue fail.
 */
export interface SessionWorkPrincipalsFixture<P> {
  readonly principals: SessionWorkPrincipals<P>
  readonly bound: SessionRef
  readonly otherTenant: TenantId
  answerNextRead?(script: SessionPrincipalBindingsScript): void
  failNextIssue?(): void
}

const failureOf = (answer: Outcome<unknown, SessionFailure>, what: string): SessionFailure => {
  assert.ok('failure' in answer, `${what}: issued a principal`)
  return answer.failure
}

export function sessionWorkPrincipalsConformance<P>(): readonly ConformanceCase<
  SessionWorkPrincipalsFixture<P>
>[] {
  return [
    conformanceCase(
      BINDING_CLAUSE,
      'an established session issues a principal for the coordinator and for the maintainer',
      async ({ principals, bound }) => {
        for (const actor of ['coordinator', 'maintainer'] as const) {
          const answer = await principals.forSession({ actor, ...bound })
          assert.ok('ok' in answer, `${actor}: expected a principal, got ${JSON.stringify(answer)}`)
        }
      },
    ),
    conformanceCase(
      BINDING_CLAUSE,
      'an unknown session and the session under another tenant answer denied, alike',
      async ({ principals, bound, otherTenant }) => {
        const ghost = await principals.forSession({
          actor: 'coordinator',
          ...bound,
          session: `${bound.session}-ghost` as SessionId,
        })
        const foreign = await principals.forSession({
          actor: 'coordinator',
          tenant: otherTenant,
          session: bound.session,
        })
        assert.equal(failureOf(ghost, 'unknown session').kind, 'denied')
        assert.deepEqual(foreign, ghost, 'the answer tells that the session exists')
      },
    ),
    conformanceCase(
      BINDING_CLAUSE,
      'a bound answer for another tenant or session is quarantined, not denied',
      async fixture => {
        const answerNext = handle(fixture.answerNextRead, 'answerNextRead')
        const { principals, bound, otherTenant } = fixture
        const source = evidence('session-binding/contradiction')
        for (const other of [
          { tenant: bound.tenant, session: `${bound.session}-other` as SessionId },
          { tenant: otherTenant, session: bound.session },
        ]) {
          answerNext(succeed({ kind: 'bound', ...other, source }))
          const answer = await principals.forSession({ actor: 'coordinator', ...bound })
          assert.equal(failureOf(answer, 'contradicting binding').kind, 'quarantined')
        }
      },
    ),
    conformanceCase(
      BINDING_CLAUSE,
      'a failed or throwing binding read passes its failure on, a throw as unavailable',
      async fixture => {
        const answerNext = handle(fixture.answerNextRead, 'answerNextRead')
        const { principals, bound } = fixture
        const unavailable = {
          kind: 'unavailable',
          owner: 'session-storage',
          diagnostic: 'down',
        } as const
        const quarantined = { kind: 'quarantined', diagnostic: 'record damaged' } as const
        for (const failure of [unavailable, quarantined]) {
          answerNext(fail(failure))
          assert.deepEqual(
            failureOf(
              await principals.forSession({ actor: 'coordinator', ...bound }),
              failure.kind,
            ),
            failure,
          )
        }
        answerNext({ kind: 'throw', error: new Error('read crashed') })
        const thrown = failureOf(
          await principals.forSession({ actor: 'coordinator', ...bound }),
          'throwing read',
        )
        assert.equal(thrown.kind, 'unavailable')
      },
    ),
    conformanceCase(
      BINDING_CLAUSE,
      'a failed issue answers unavailable with owner identity',
      async fixture => {
        const failNextIssue = handle(fixture.failNextIssue, 'failNextIssue')
        failNextIssue()
        const failure = failureOf(
          await fixture.principals.forSession({ actor: 'coordinator', ...fixture.bound }),
          'failed issue',
        )
        assert.equal(failure.kind, 'unavailable')
        assert.equal(failure.kind === 'unavailable' ? failure.owner : null, 'identity')
      },
    ),
  ]
}
