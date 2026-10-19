// The ToolOutputCustody conformance suite (P05, story 28) and a non-durable double that conforms to
// it. The double keeps the bytes in memory and declares `durability: 'none'`: it proves nothing
// about a durable provider and must not be assembled into production.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { RawOutput, ToolOutputCustody } from './custody.ts'
import type { Access, Adoption, DurableEvidence, ToolCallId } from './identity.ts'
import type { ToolFailure } from './results.ts'
import {
  completionOf,
  conformanceCase,
  crossTenantAnswers,
  expectKind,
  finalAnswer,
  handle,
  isProgress,
  otherAccessOf,
  refused,
  resendRecalls,
  succeeded,
  type AnswerModel,
  type ConformanceCase,
} from './testing-case.ts'
import {
  adoption,
  callId,
  digestOf,
  evidence,
  identifyingValues,
  memoryAccess,
  memoryOtherAccess,
  mintEvidence,
  operationId,
  tenantKey,
  textResult,
} from './testing-values.ts'

/**
 * What the custody suite needs. A fresh fixture serves one case. `codec` is the adoption that the
 * suite names when it preserves bytes. The optional handles are the controls of the provider, and
 * a case that needs one that is missing is reported not applicable: `readBytes` reads the bytes
 * that a raw output holds; `failNext` makes the next new preserve fail before anything is kept;
 * `dropNextAnswer` makes the next new preserve keep the bytes but lose its answer. `settle` is for
 * a provider that answers `commit-unknown` to a `preserve` or a `retainResult`, or `unknown` to an
 * `inspect`, while it completes the work: it resolves only after every such operation has
 * landed (the bytes are kept) and is visible to every read of the port, so that the operation
 * asked again, or inspected, tells its result; the suite asks once more after it and never polls.
 * Without `settle`, a case that needs the result is reported not applicable when the first answer
 * is a lost reply or `unknown`. `otherAccess` is the access of a second tenant, with a principal
 * of its own: the cases that check that another tenant neither reads nor changes an output of the
 * first are reported not applicable without it.
 */
export interface ToolOutputCustodyFixture<P> {
  readonly custody: ToolOutputCustody<P>
  readonly access: Access<P>
  readonly otherAccess?: Access<P>
  readonly codec?: Adoption
  /** Reads the bytes that a raw output holds (a read: nothing is deferred). */
  readBytes?(raw: RawOutput): Promise<Uint8Array>
  /** Makes the next new preserve fail before anything is kept (it takes effect at once). */
  failNext?(): void
  /** Makes the next new preserve keep the bytes and lose its answer; the work lands at `settle` or at once. */
  dropNextAnswer?(): void
  /** Resolves after every operation whose reply was lost or `unknown` has landed and is visible to every read. */
  settle?(): Promise<void>
}

/**
 * The answer model of the output custody (P01, P05): a `preserve` or a `retainResult` whose
 * commit is not confirmed answers `commit-unknown`, and the original operation is then asked
 * again; an `inspect` may answer `unknown` until the output is visible. Every other answer is
 * final: the raw output or the evidence of the operation, which a resend recalls as it was.
 */
export const outputCustodyAnswers = {
  preserve: { clause: 'P01', progress: [], lostReply: ['commit-unknown'] },
  inspect: { clause: 'P05', progress: ['unknown'] },
  retainResult: { clause: 'P01', progress: [], lostReply: ['commit-unknown'] },
} as const satisfies AnswerModel<keyof ToolOutputCustody<unknown>>

const BYTES = new TextEncoder().encode('the raw output of the tool')
const OTHER_BYTES = new TextEncoder().encode('the raw output of another tool')
const SOURCE: DurableEvidence = evidence('output-source')

function scene<P>(fixture: ToolOutputCustodyFixture<P>, access: Access<P> = fixture.access) {
  const { custody } = fixture
  const call: ToolCallId = callId('call-1')
  const codec = fixture.codec ?? adoption('output-codec')
  const completion = completionOf(fixture, 'settle')
  const mutation = (operation: string) => ({ ...access, call, operation: operationId(operation) })
  const preserveOutcome = (operation = 'preserve-1', bytes: Uint8Array = BYTES) =>
    custody.preserve({ ...mutation(operation), codec, bytes: bytes.slice(), source: SOURCE })
  const inspect = (operation = 'preserve-1') => custody.inspect(mutation(operation))
  const tryRetain = (raw: RawOutput, operation = 'retain-1', text = 'projection') =>
    custody.retainResult({ ...mutation(operation), raw, value: textResult(text) })
  return {
    completion,
    /** What every call of the scene sends: its access and its call. */
    sends: [access, call] as const,
    preserveOutcome,
    /** One read of a preserve: a resend, which recalls the original. */
    preserve: async (operation = 'preserve-1'): Promise<RawOutput> =>
      succeeded(await preserveOutcome(operation), 'preserve'),
    /** The raw output of a preserve; a lost reply is driven by `settle` and the operation asked again. */
    preserveFinal: async (operation = 'preserve-1'): Promise<RawOutput> =>
      succeeded(
        await finalAnswer({
          ask: () => preserveOutcome(operation),
          row: outputCustodyAnswers.preserve,
          completion,
          what: 'preserve',
        }),
        'preserve',
      ),
    /** The final answer of a preserve, a refusal included. */
    preserveOutcomeFinal: (operation = 'preserve-1', bytes: Uint8Array = BYTES) =>
      finalAnswer({
        ask: () => preserveOutcome(operation, bytes),
        row: outputCustodyAnswers.preserve,
        completion,
        what: 'preserve',
      }),
    inspect,
    /** The final answer of `inspect` for an operation that was asked before: `unknown` is driven by `settle`. */
    inspectFinal: async (operation = 'preserve-1') =>
      succeeded(
        await finalAnswer({
          ask: () => inspect(operation),
          row: outputCustodyAnswers.inspect,
          completion,
          what: 'inspect',
        }),
        'inspect',
      ),
    tryRetain,
    retain: async (raw: RawOutput, operation = 'retain-1'): Promise<DurableEvidence> =>
      succeeded(await tryRetain(raw, operation), 'retainResult'),
    /** The evidence of a retainResult; a lost reply is driven by `settle`. */
    retainFinal: async (raw: RawOutput, operation = 'retain-1'): Promise<DurableEvidence> =>
      succeeded(
        await finalAnswer({
          ask: () => tryRetain(raw, operation),
          row: outputCustodyAnswers.retainResult,
          completion,
          what: 'retainResult',
        }),
        'retainResult',
      ),
    codec,
  }
}

export function toolOutputCustodyConformance<P>(): readonly ConformanceCase<
  ToolOutputCustodyFixture<P>
>[] {
  const answers = outputCustodyAnswers
  return [
    conformanceCase(
      'P05',
      'preserve returns a raw output of the given codec and size',
      async fixture => {
        const s = scene(fixture)
        const raw = await s.preserveFinal()
        assert.deepEqual(raw.codec, s.codec)
        assert.equal(raw.content.bytes, String(BYTES.length))
        assert.ok(raw.content.storage.length > 0, 'the storage of the content is named')
        assert.ok(raw.content.key.length > 0, 'the key of the content is named')
        assert.ok(raw.content.digest.length > 0, 'the digest of the content is named')
        assert.ok(raw.custody.owner.length > 0, 'the owner of the custody is named')
        assert.ok(raw.custody.digest.length > 0, 'the digest of the custody is named')
      },
    ),

    conformanceCase('P05', 'preserve holds the exact bytes before it answers', async fixture => {
      const readBytes = handle(fixture.readBytes, 'readBytes')
      const s = scene(fixture)
      const raw = await s.preserveFinal()
      assert.deepEqual(Array.from(await readBytes.call(fixture, raw)), Array.from(BYTES))
    }),

    conformanceCase(
      'P05',
      'a preserve resent by its operation returns the original raw output',
      async fixture => {
        const s = scene(fixture)
        const first = await s.preserveFinal()
        resendRecalls(
          answers.preserve,
          { earlier: first, later: await s.preserve() },
          'preserve again',
        )
        const concurrent = await Promise.all([s.preserve(), s.preserve()])
        for (const again of concurrent)
          resendRecalls(answers.preserve, { earlier: first, later: again }, 'concurrent preserve')
      },
    ),

    conformanceCase('P05', 'inspect recalls a retained output', async fixture => {
      const s = scene(fixture)
      const raw = await s.preserveFinal()
      const inspected = expectKind(await s.inspectFinal(), 'retained', 'inspect')
      assert.deepEqual(inspected.raw, raw)
    }),

    conformanceCase(
      'P05',
      'inspect retains nothing for an operation never preserved',
      async fixture => {
        const inspected = await scene(fixture).inspect()
        if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'retained')
      },
    ),

    conformanceCase('P05', 'a failed preserve never answers durable', async fixture => {
      const failNext = handle(fixture.failNext, 'failNext')
      const s = scene(fixture)
      failNext.call(fixture)
      refused(await s.preserveOutcome(), 'preserve that failed')
      const inspected = await s.inspect()
      if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'retained')
    }),

    conformanceCase(
      'P05',
      'a preserve whose answer was lost is recalled by its operation',
      async fixture => {
        const dropNextAnswer = handle(fixture.dropNextAnswer, 'dropNextAnswer')
        const s = scene(fixture)
        dropNextAnswer.call(fixture)
        // The handle keeps the bytes and loses the answer: the reply is a lost one, not a refusal.
        const lost = await s.preserveOutcome()
        assert.ok(isProgress(lost, answers.preserve), 'the lost answer is a lost reply')
        const inspected = expectKind(await s.inspectFinal(), 'retained', 'inspect')
        const recalled = await s.preserve()
        assert.deepEqual(recalled, inspected.raw)
      },
    ),

    conformanceCase(
      'P05',
      'a retainResult resent by its operation returns the original evidence',
      async fixture => {
        const s = scene(fixture)
        const raw = await s.preserveFinal()
        const first = await s.retainFinal(raw)
        resendRecalls(
          answers.retainResult,
          { earlier: first, later: await s.retain(raw) },
          'retainResult again',
        )
      },
    ),

    conformanceCase('P05', 'retainResult leaves the preserved original', async fixture => {
      const s = scene(fixture)
      const raw = await s.preserveFinal()
      await s.retainFinal(raw)
      const inspected = expectKind(await s.inspectFinal(), 'retained', 'inspect after retainResult')
      assert.deepEqual(inspected.raw, raw)
    }),

    conformanceCase(
      'P01',
      'a preserve operation reused with other bytes is a conflict that changes nothing',
      async fixture => {
        const s = scene(fixture)
        const raw = await s.preserveFinal()
        const other = await s.preserveOutcome('preserve-1', OTHER_BYTES)
        assert.equal(
          refused(other, 'preserve of other bytes under the same operation').kind,
          'conflict',
        )
        const inspected = expectKind(
          await s.inspectFinal(),
          'retained',
          'inspect after the conflict',
        )
        assert.deepEqual(inspected.raw, raw)
      },
    ),

    conformanceCase(
      'P01',
      'a retainResult operation reused for another result is a conflict that changes nothing',
      async fixture => {
        const s = scene(fixture)
        const raw = await s.preserveFinal()
        const first = await s.retainFinal(raw)
        const other = await s.tryRetain(raw, 'retain-1', 'another projection')
        assert.equal(
          refused(other, 'retain of another result under the same operation').kind,
          'conflict',
        )
        resendRecalls(
          answers.retainResult,
          { earlier: first, later: await s.retain(raw) },
          'retainResult after the conflict',
        )
      },
    ),

    conformanceCase(
      'P05',
      'another tenant learns nothing of an output by inspect',
      async fixture => {
        const own = scene(fixture)
        const other = scene(fixture, otherAccessOf(fixture))
        const raw = await own.preserveFinal()
        // The other tenant names the same call and operation: the custody and the content key identify it.
        await crossTenantAnswers({
          ask: { real: () => other.inspect(), ghost: () => other.inspect('preserve-ghost') },
          row: answers.inspect,
          completion: other.completion,
          identifying: [...identifyingValues(fixture.access.tenant, raw.custody), raw.content.key],
          submitted: [...other.sends, 'preserve-1'],
          what: 'inspect by another tenant',
        })
        const again = expectKind(await own.inspectFinal(), 'retained', 'inspect')
        assert.deepEqual(again.raw, raw)
      },
    ),

    conformanceCase(
      'P05',
      'another tenant does not receive the output of a tenant',
      async fixture => {
        const own = scene(fixture)
        const other = scene(fixture, otherAccessOf(fixture))
        const raw = await own.preserveFinal()
        // The same call and operation of another tenant is a preserve of its own.
        const foreign = await other.preserveOutcomeFinal()
        if ('ok' in foreign) assert.notDeepEqual(foreign.ok, raw)
        resendRecalls(
          answers.preserve,
          { earlier: raw, later: await own.preserve() },
          'preserve by the own tenant',
        )
      },
    ),

    conformanceCase(
      'P05',
      'another tenant cannot retain a result over the output of a tenant',
      async fixture => {
        const own = scene(fixture)
        const other = scene(fixture, otherAccessOf(fixture))
        const raw = await own.preserveFinal()
        const first = await own.retainFinal(raw)
        // The other tenant sends the raw output itself; the retained evidence still identifies it.
        await crossTenantAnswers({
          ask: {
            real: () => other.tryRetain(raw),
            ghost: () => other.tryRetain({ ...raw, custody: evidence('ghost-custody') }),
          },
          row: answers.retainResult,
          completion: other.completion,
          identifying: identifyingValues(fixture.access.tenant, first),
          submitted: [...other.sends, 'retain-1', raw, textResult('projection')],
          what: 'retainResult by another tenant',
        })
        resendRecalls(
          answers.retainResult,
          { earlier: first, later: await own.retain(raw) },
          'retainResult by the own tenant',
        )
      },
    ),
  ]
}

// ---------------------------------------------------------------------------------------------
// The non-durable double
// ---------------------------------------------------------------------------------------------

export interface MemoryToolOutputCustody<P> extends ToolOutputCustody<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    readBytes(raw: RawOutput): Promise<Uint8Array>
    failNext(): void
    dropNextAnswer(): void
    settle(): Promise<void>
  }>
}

type Tenant = Access<unknown>['tenant']

const reply = <T>(outcome: Outcome<T, ToolFailure>): Promise<Outcome<T, ToolFailure>> =>
  Promise.resolve(outcome)

/**
 * A custody that keeps bytes in memory. An output is keyed by tenant, call and operation; the
 * bytes are copied in and copied out, so no caller holds the kept bytes.
 */
export function createMemoryToolOutputCustody<P>(): MemoryToolOutputCustody<P> {
  const outputs = new Map<
    string,
    { raw: RawOutput; bytes: Uint8Array; tenant: string; call: ToolCallId }
  >()
  const retained = new Map<string, { evidence: DurableEvidence; digest: string }>()
  /** What each preserve operation asked: the same identity with other bytes is a conflict. */
  const preserved = new Map<string, string>()
  let failing = false
  let dropping = false
  let minted = 0

  const keyOf = (tenant: Tenant, call: ToolCallId, operation: string): string =>
    JSON.stringify([tenantKey(tenant), call, operation])

  const custody: ToolOutputCustody<P> = {
    preserve: input => {
      const at = keyOf(input.tenant, input.call, input.operation)
      const digest = digestOf({
        kind: 'preserve',
        codec: input.codec,
        bytes: createHash('sha256').update(input.bytes).digest('hex'),
        source: input.source,
      })
      const before = preserved.get(at)
      if (before !== undefined && before !== digest)
        return reply(fail({ kind: 'conflict', operation: input.operation }))
      const existing = outputs.get(at)
      if (existing !== undefined) return reply(succeed(existing.raw))
      if (failing) {
        failing = false
        return reply(
          fail({
            kind: 'unavailable',
            dependency: 'output-custody',
            diagnostic: 'the custody could not keep the bytes',
          }),
        )
      }
      minted += 1
      const bytes = input.bytes.slice()
      const raw: RawOutput = {
        codec: input.codec,
        content: {
          storage: 'memory-custody',
          key: at,
          mediaType: 'application/octet-stream',
          bytes: String(bytes.length),
          digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        },
        custody: mintEvidence(`custody/raw/${minted}`, { at, source: input.source }),
      }
      preserved.set(at, digest)
      outputs.set(at, { raw, bytes, tenant: tenantKey(input.tenant), call: input.call })
      if (dropping) {
        dropping = false
        return reply(fail({ kind: 'commit-unknown', operation: input.operation }))
      }
      return reply(succeed(raw))
    },
    inspect: input => {
      const found = outputs.get(keyOf(input.tenant, input.call, input.operation))
      return reply(
        succeed(found === undefined ? { kind: 'unknown' } : { kind: 'retained', raw: found.raw }),
      )
    },
    retainResult: input => {
      // The result is kept over an output that this tenant preserved for this call, and no other.
      const held = [...outputs.values()].some(
        entry =>
          entry.tenant === tenantKey(input.tenant) &&
          entry.call === input.call &&
          entry.raw.custody.digest === input.raw.custody.digest,
      )
      if (!held)
        return reply(
          fail({ kind: 'invalid', field: 'raw', reason: 'no output of this call was preserved' }),
        )
      const at = keyOf(input.tenant, input.call, input.operation)
      const digest = digestOf({ kind: 'retain', raw: input.raw.custody, value: input.value })
      let kept = retained.get(at)
      if (kept !== undefined && kept.digest !== digest)
        return reply(fail({ kind: 'conflict', operation: input.operation }))
      if (kept === undefined) {
        minted += 1
        kept = {
          evidence: mintEvidence(`custody/result/${minted}`, { at, raw: input.raw.custody }),
          digest,
        }
        retained.set(at, kept)
      }
      return reply(succeed(kept.evidence))
    },
  }

  const controls: MemoryToolOutputCustody<P>['controls'] = {
    readBytes: raw => {
      for (const { raw: kept, bytes } of outputs.values())
        if (kept.content.key === raw.content.key) return Promise.resolve(bytes.slice())
      return Promise.reject(new Error('the custody keeps no output under this reference'))
    },
    failNext: () => {
      failing = true
    },
    dropNextAnswer: () => {
      dropping = true
    },
    // Every answer of the double is decided when the call returns, so nothing is left to land.
    settle: () => Promise.resolve(),
  }
  return Object.freeze({ ...custody, durability: 'none' as const, controls })
}

/** A fresh fixture over a fresh in-memory custody, with every control handle. */
export function memoryToolOutputCustodyFixture(): ToolOutputCustodyFixture<string> {
  const custody = createMemoryToolOutputCustody<string>()
  return {
    custody,
    access: memoryAccess('tester'),
    otherAccess: memoryOtherAccess('tester-other'),
    readBytes: custody.controls.readBytes,
    failNext: custody.controls.failNext,
    dropNextAnswer: custody.controls.dropNextAnswer,
    settle: custody.controls.settle,
  }
}
