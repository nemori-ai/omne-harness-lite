// Property guard of the start ordering domain (G5, P04), the machine-readable twin of
// `verification/models/StartFence.tla`. A seeded driver sends random sequences of prepare,
// consume (with any permit ever issued), inspect, exclude, invalidate and re-sent invalidation
// to the real coordinator over the memory ledger, with lost commit answers injected, and a
// checker judges every observable answer against the properties of the model:
//   P1 one acceptance per start (every `started` names the same acceptance evidence),
//   P2 an invalidation whose evidence returned fences every permit issued before it,
//   P3 a permit issued before inspect answered not-started is never accepted after it,
//   P4 an excluded call is never accepted and an accepted call is never excluded,
//   P5 a re-sent invalidation returns its first evidence and the guard moves once per operation,
//   P6 a start is accepted or rejected, never both,
//   T  a principal of another tenant is denied by every operation and writes nothing.
// The negative control runs the same driver and checker against a faulty authority with one
// rule removed; the checker must report that rule.

import { succeed } from '@omne-harness/operation-result'
import type { ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore, type MemoryToolLedgerStore } from '@omne-harness/tool/testing'
import type { DurableEvidence } from '@omne-harness/tool-contract'
import type {
  StartPermit,
  StartProgress,
  ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import { describe, expect, it } from 'vitest'
import {
  callAccess,
  callId,
  coordinator,
  evidence,
  operationId,
  permission,
  principalA,
  principalB,
  request,
  startOf,
  tenantA,
  type Principal,
} from './coordinator-values.ts'

/** mulberry32: a small seeded generator, so a red run names the seed that reproduces it. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CALL = 'c1'
const evidenceKey = (e: DurableEvidence) =>
  JSON.stringify([e.owner, e.record, e.revision, e.digest])

type Op =
  | 'prepare'
  | 'consume'
  | 'inspect'
  | 'exclude'
  | 'invalidate'
  | 'resend'
  | 'lose-next-commit'
  | 'foreign'

type Issued = { permit: StartPermit; step: number }

/** The observable facts the checker keeps across one run. */
type Trace = {
  step: number
  issued: Issued[]
  /** acceptance evidence key -> the step it was first seen */
  acceptances: Map<string, number>
  /** step at which the first `started` answer was seen, or null */
  firstStarted: number | null
  rejectedAt: number | null
  notStartedAt: number | null
  excludedAt: number | null
  /** invalidation operation -> its first returned evidence and the step it returned */
  invalidations: Map<string, { evidence: DurableEvidence; step: number }>
  unknownInvalidations: string[]
  violations: string[]
}

function violation(trace: Trace, text: string): void {
  trace.violations.push(`step ${String(trace.step)}: ${text}`)
}

/** Judge one answer of consume or inspect for the permit `used` (null for inspect). */
function judgeProgress(trace: Trace, used: Issued | null, progress: StartProgress): void {
  if (progress.kind === 'started') {
    const key = evidenceKey(progress.acceptance)
    const first = trace.acceptances.get(key)
    if (first === undefined) {
      trace.acceptances.set(key, trace.step)
      if (trace.acceptances.size > 1) violation(trace, 'P1: a second acceptance evidence')
      if (trace.rejectedAt !== null) violation(trace, 'P6: accepted after a rejection')
      if (trace.excludedAt !== null) violation(trace, 'P4: accepted after the call was excluded')
      if (used !== null) {
        for (const [operation, inv] of trace.invalidations)
          if (used.step < inv.step)
            violation(
              trace,
              `P2: accepted a permit issued before invalidation ${operation} returned`,
            )
        if (trace.notStartedAt !== null && used.step < trace.notStartedAt)
          violation(trace, 'P3: accepted a permit issued before inspect answered not-started')
      }
    }
    trace.firstStarted ??= trace.step
  } else if (progress.kind === 'rejected') {
    if (trace.acceptances.size > 0) violation(trace, 'P6: rejected after an acceptance')
    trace.rejectedAt ??= trace.step
  } else if (progress.kind === 'not-started') {
    if (used === null) trace.notStartedAt ??= trace.step
  }
}

async function run(
  authority: ToolStartAuthority<Principal>,
  seed: number,
  steps: number,
  loseNext: () => void,
  guardRevision: () => Promise<number | null>,
): Promise<Trace> {
  const next = random(seed)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T
  const trace: Trace = {
    step: 0,
    issued: [],
    acceptances: new Map(),
    firstStarted: null,
    rejectedAt: null,
    notStartedAt: null,
    excludedAt: null,
    invalidations: new Map(),
    unknownInvalidations: [],
    violations: [],
  }
  const ops: readonly Op[] = [
    'prepare',
    'consume',
    'consume',
    'consume',
    'inspect',
    'exclude',
    'invalidate',
    'resend',
    'lose-next-commit',
    'foreign',
  ]
  let invalidationCount = 0
  const guardOf = (revision: string) => ({
    ...permission,
    revision,
    evidence: evidence('fence'),
    scope: { kind: 'resource' } as const,
  })
  for (let i = 1; i <= steps; i += 1) {
    trace.step = i
    const op = pick(ops)
    if (op === 'prepare') {
      const answer = await authority.prepare({
        ...callAccess(CALL),
        start: startOf(CALL),
        request: request(),
      })
      if ('ok' in answer) trace.issued.push({ permit: answer.ok, step: i })
    } else if (op === 'consume') {
      if (trace.issued.length === 0) continue
      const used = pick(trace.issued)
      const answer = await authority.consume({
        ...callAccess(CALL),
        permit: used.permit,
        executorReceipt: evidence('capsule'),
      })
      if ('ok' in answer) judgeProgress(trace, used, answer.ok)
    } else if (op === 'inspect') {
      const answer = await authority.inspect({ ...callAccess(CALL), start: startOf(CALL) })
      if ('ok' in answer) judgeProgress(trace, null, answer.ok)
    } else if (op === 'exclude') {
      const answer = await authority.exclude({
        ...callAccess(CALL),
        operation: operationId(`${CALL}/exclude`),
        reason: 'driver-excluded',
      })
      if ('ok' in answer) {
        if (trace.acceptances.size > 0) violation(trace, 'P4: excluded a call with an acceptance')
        trace.excludedAt ??= i
      } else if (answer.failure.kind === 'conflict' && trace.acceptances.size === 0)
        violation(trace, 'P4: exclude answered conflict without an acceptance')
    } else if (op === 'invalidate' || op === 'resend') {
      const resend = op === 'resend' && trace.unknownInvalidations.length > 0
      const operation = resend
        ? pick(trace.unknownInvalidations)
        : `inv-${String((invalidationCount += 1))}`
      const answer = await authority.invalidate({
        principal: callAccess(CALL).principal,
        tenant: tenantA as never,
        operation: operationId(operation),
        guard: guardOf('0'),
      })
      if ('ok' in answer) {
        const known = trace.invalidations.get(operation)
        if (known === undefined)
          trace.invalidations.set(operation, { evidence: answer.ok, step: i })
        else if (evidenceKey(known.evidence) !== evidenceKey(answer.ok))
          violation(trace, `P5: invalidation ${operation} returned a second evidence`)
        trace.unknownInvalidations = trace.unknownInvalidations.filter(o => o !== operation)
      } else if (answer.failure.kind === 'commit-unknown')
        trace.unknownInvalidations.push(operation)
    } else if (op === 'lose-next-commit') {
      loseNext()
    } else {
      // A principal of tenant B names tenant A: denied before any read, nothing written.
      const before = await guardRevision()
      const foreign = { principal: principalB, tenant: tenantA as never, call: callId(CALL) }
      const answers = await Promise.all([
        authority.prepare({ ...foreign, start: startOf(CALL), request: request() }),
        authority.inspect({ ...foreign, start: startOf(CALL) }),
        authority.exclude({ ...foreign, operation: operationId('x'), reason: 'foreign' }),
        authority.invalidate({
          principal: principalB,
          tenant: tenantA as never,
          operation: operationId('foreign-inv'),
          guard: guardOf('0'),
        }),
      ])
      for (const answer of answers)
        if (!('failure' in answer) || answer.failure.kind !== 'denied')
          violation(trace, 'T: a foreign principal was not denied')
      if ((await guardRevision()) !== before)
        violation(trace, 'T: a foreign principal moved the guard')
    }
  }
  // P5 in the ledger: the guard advanced once per distinct applied invalidation operation.
  const revision = await guardRevision()
  const returned = trace.invalidations.size
  const sent = returned + trace.unknownInvalidations.length
  if (revision !== null && (revision < returned || revision > sent))
    violation(
      trace,
      `P5: guard revision ${String(revision)} with ${String(returned)} returned and ${String(sent)} sent`,
    )
  return trace
}

/** The guard revision of tenant A as stored, read without the coordinator. */
function guardRevisionReader(store: ToolLedgerStore) {
  return async (): Promise<number | null> => {
    const read = await store.read({
      kind: 'host',
      tenant: tenantA as never,
      key: 'start-coordinator',
    })
    if (read.kind !== 'complete') return null
    for (const record of read.records) {
      if (record.kind !== 'host' || !record.host.key.startsWith('guard:')) continue
      const value = record.host.value as { revision?: unknown }
      return typeof value.revision === 'string' ? Number(value.revision) : null
    }
    return 0
  }
}

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i)

describe('the start ordering domain keeps the StartFence properties under random drivers', () => {
  it.each(SEEDS)('seed %i: no property of the model is violated', async seed => {
    const store: MemoryToolLedgerStore = createMemoryToolLedgerStore()
    const authority = coordinator(store)
    const trace = await run(
      authority,
      seed,
      30,
      () => store.injectCommit('unknown-applied'),
      guardRevisionReader(store),
    )
    expect(trace.violations).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// Negative control: a faulty authority with one rule removed must be caught by the same checker.
// ---------------------------------------------------------------------------------------------

type Fault =
  | 'skip-guard-check'
  | 'double-accept'
  | 'inspect-keeps-permit'
  | 'exclude-accepted'
  | 'resend-readvances'
  | 'admit-foreign'

/**
 * A toy ordering domain with the shape of the coordinator and one rule removed. It denies every
 * principal other than tenant A's, so the driver's foreign step neither replaces the permit nor
 * moves the guard and the removed rule is the only difference from the model.
 */
function faulty(
  fault: Fault,
): ToolStartAuthority<Principal> & { guardRevision(): number; loseNext(): void } {
  let guardRevision = 0
  let lose = false
  const applied = new Map<string, DurableEvidence>()
  let permit: StartPermit | null = null
  let acceptance: DurableEvidence | null = null
  let rejected: DurableEvidence | null = null
  let exclusion: DurableEvidence | null = null
  let revision = 0
  const mint = (record: string): DurableEvidence => ({
    owner: 'faulty',
    record,
    revision: String((revision += 1)),
    digest: `sha256:${record}-${String(revision)}`,
  })
  const started = (): StartProgress => ({
    kind: 'started',
    acceptance: acceptance as DurableEvidence,
  })
  const foreign = (raw: unknown): boolean =>
    fault !== 'admit-foreign' && Reflect.get(raw as object, 'principal') !== principalA
  const denied = { failure: { kind: 'denied' } } as never
  return {
    guardRevision: () => guardRevision,
    loseNext: () => {
      lose = true
    },
    prepare: async raw => {
      if (foreign(raw)) return denied
      const start = startOf(CALL)
      permit = {
        tenant: tenantA as never,
        call: callId(CALL),
        operation: start.operation,
        adoption: { owner: 'faulty', name: 'faulty', revision: '1', digest: 'sha256:faulty' },
        inputDigest: 'input',
        start,
        guards: [
          {
            ...permission,
            revision: String(guardRevision),
            evidence: evidence('g'),
            scope: { kind: 'resource' },
          },
        ],
        request: mint(`permit-${String(Reflect.get(raw, 'call'))}`),
      }
      return succeed(permit)
    },
    consume: async raw => {
      const used = Reflect.get(raw, 'permit') as StartPermit
      if (acceptance !== null && fault !== 'double-accept') return succeed(started())
      if (rejected !== null) return succeed({ kind: 'rejected', reason: 'r', exclusion: rejected })
      if (permit === null || used.request.digest !== permit.request.digest)
        return exclusion === null
          ? { failure: { kind: 'invalid', field: 'permit', reason: 'not-issued' } }
          : succeed({ kind: 'not-started', exclusion })
      const moved = used.guards.some(g => g.revision !== String(guardRevision))
      if (moved && fault !== 'skip-guard-check') {
        rejected = mint('rejection')
        permit = null
        return succeed({ kind: 'rejected', reason: 'guard moved', exclusion: rejected })
      }
      acceptance = mint('acceptance')
      if (fault !== 'double-accept') permit = null
      return succeed(started())
    },
    inspect: async raw => {
      if (foreign(raw)) return denied
      if (acceptance !== null) return succeed(started())
      if (rejected !== null) return succeed({ kind: 'rejected', reason: 'r', exclusion: rejected })
      exclusion ??= mint('exclusion')
      if (fault !== 'inspect-keeps-permit') permit = null
      return succeed({ kind: 'not-started', exclusion })
    },
    exclude: async raw => {
      if (foreign(raw)) return denied
      if (acceptance !== null && fault !== 'exclude-accepted')
        return { failure: { kind: 'conflict', operation: startOf(CALL).operation } }
      rejected ??= mint('call-rejection')
      return succeed(rejected)
    },
    invalidate: async raw => {
      if (foreign(raw)) return denied
      const operation = String(Reflect.get(raw, 'operation'))
      let known = applied.get(operation)
      if (known === undefined || fault === 'resend-readvances') {
        guardRevision += 1
        known = mint('invalidation')
        applied.set(operation, known)
      }
      if (lose) {
        lose = false
        return { failure: { kind: 'commit-unknown' } } as never
      }
      return succeed(known)
    },
  }
}

describe('negative control: the checker reports a faulty ordering domain', () => {
  it.each<[Fault, string]>([
    ['skip-guard-check', 'P2'],
    ['double-accept', 'P1'],
    ['inspect-keeps-permit', 'P3'],
    ['exclude-accepted', 'P4'],
    ['resend-readvances', 'P5'],
    ['admit-foreign', 'T'],
  ])('%s is reported as %s', async (fault, property) => {
    const found: string[] = []
    for (const seed of SEEDS) {
      const authority = faulty(fault)
      const trace = await run(
        authority,
        seed,
        30,
        () => authority.loseNext(),
        async () => authority.guardRevision(),
      )
      found.push(...trace.violations)
    }
    expect(found.some(text => text.includes(`${property}:`))).toBe(true)
  })
})
