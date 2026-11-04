// Machine guard of the RcCommit model (runtime-context-contract verification/models/RcCommit.tla):
// the mechanism applies only what the holder committed, in commit order, and acknowledges a retry
// only for the same complete input (RC-02 "注册修订与提交顺序"). Each run drives the real mechanism
// with a seeded random schedule of deliveries, duplicates, reorders, rewritten retries and crashes,
// and checks every answer against the model's Deliver action. A failure prints the seed.
import { describe, expect, it } from 'vitest'
import type {
  ApplyCommitResult,
  CommitInput,
  ContextBlockKey,
  RegistrationChange,
} from '@omne-harness/runtime-context-contract'
import { harness, scope, tenantA, type Harness } from './support.js'

/** A small deterministic generator (mulberry32), so a failing schedule can be replayed. */
function random(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { below: (n: number) => Math.floor(next() * n) }
}

const target = scope('commit-order/one')
const keyOf = (i: number) => `test.k${i}` as ContextBlockKey

/** The decision the holder commits at position i of its durable log; its basis is i. */
function change(i: number, parameters: unknown = null): RegistrationChange {
  return {
    kind: 'add',
    creating: false,
    scope: target,
    tenant: tenantA,
    key: keyOf(i),
    basedOn: i,
    required: false,
    bindings: [],
    parameters,
  }
}
const commitOf = (i: number) => ({ commit: `commit-${i}` })
const input = (i: number, parameters: unknown = null): CommitInput => ({
  kind: 'registration',
  commit: commitOf(i),
  change: change(i, parameters),
})

async function openWith(h: Harness, committed: number): Promise<void> {
  h.ports.bind(target, tenantA)
  const begun = await h.rc.beginReplay('holder', {
    scope: target,
    tenant: tenantA,
    through: committed === 0 ? null : commitOf(committed - 1),
    supersedes: null,
  })
  if (begun.kind !== 'replaying') throw new Error(`beginReplay: ${begun.kind}`)
  const registrations = Array.from({ length: committed }, (_, i) => ({
    commit: commitOf(i),
    change: change(i),
  }))
  const ready = await h.rc.finishReplay('holder', {
    replay: begun.replay,
    material: { registrations, checkpoints: [], end: null },
  })
  if (ready.kind !== 'ready') throw new Error(`finishReplay: ${JSON.stringify(ready)}`)
}

/** The model state of RcCommit.tla for one mechanism instance. */
type Model = { rev: number; seen: Map<number, { parameters: unknown; result: ApplyCommitResult }> }

/** The answer the model's Deliver action gives; `null` is "applied now". */
function expected(model: Model, i: number, parameters: unknown) {
  const seen = model.seen.get(i)
  if (seen)
    return parameters === seen.parameters
      ? { same: seen.result }
      : { invalid: 'commit-conflict' as const }
  if (i !== model.rev) return { invalid: 'out-of-order' as const }
  return null
}

type Seen = Record<'applied' | 'retried' | 'conflict' | 'out-of-order' | 'crash', number>

async function run(seed: number, length: number, size: number, seen: Seen): Promise<void> {
  const rnd = random(seed)
  let h = harness()
  let model: Model = { rev: 0, seen: new Map() }
  let committed = 0 // the holder's durable log length
  let crashes = 0
  await openWith(h, 0)
  for (let step = 0; step < length; step++) {
    const roll = rnd.below(10)
    if (roll === 0 && committed < size) {
      committed++ // CommitOk: the holder's own commit; the mechanism is not called
      continue
    }
    if (roll === 1 && crashes < 2) {
      // Crash, then the holder replays its complete log into a new instance (RC-09).
      crashes++
      seen.crash++
      h = harness()
      model = { rev: committed, seen: new Map() }
      await openWith(h, committed)
      continue
    }
    if (committed === 0) continue
    const i = rnd.below(committed) // Send(i) or a retry of it, in any order
    const rewritten = model.seen.has(i) && rnd.below(4) === 0 // SendConflict
    const parameters = rewritten ? { rewritten: step } : null
    const want = expected(model, i, parameters)
    const got = await h.rc.applyCommit('holder', input(i, parameters))
    const where = `seed=${seed} step=${step} commit=${i} rev=${model.rev}`
    if (want === null) {
      expect(got, where).toMatchObject({ kind: 'applied', registrationRevision: model.rev + 1 })
      model.rev++
      model.seen.set(i, { parameters, result: got })
      seen.applied++
    } else if ('same' in want) {
      expect(got, where).toEqual(want.same)
      seen.retried++
    } else {
      expect(got, where).toMatchObject({ kind: 'invalid', reason: want.invalid })
      seen[want.invalid === 'commit-conflict' ? 'conflict' : 'out-of-order']++
      // A refused or invalid answer leaves the projection as it was.
      if (got.kind === 'invalid') expect(got.current, where).toBe(model.rev)
    }
    // P1: the applied revision never runs ahead of the holder's durable log.
    expect(model.rev, where).toBeLessThanOrEqual(committed)
  }
}

describe('RcCommit guard: applyCommit refines the model', () => {
  it('P1 and P2 hold over 200 seeded schedules of deliveries, retries, rewrites and crashes', async () => {
    const seen: Seen = { applied: 0, retried: 0, conflict: 0, 'out-of-order': 0, crash: 0 }
    for (let seed = 1; seed <= 200; seed++) await run(seed, 40, 5, seen)
    // The schedules reach every branch of the model's Deliver action, and crashes.
    for (const [branch, count] of Object.entries(seen)) expect(count, branch).toBeGreaterThan(20)
  })

  it('an out-of-order answer is not remembered: the same input applies once the order is right', async () => {
    const h = harness()
    await openWith(h, 0)
    expect(await h.rc.applyCommit('holder', input(1))).toMatchObject({
      kind: 'invalid',
      reason: 'out-of-order',
      current: 0,
    })
    expect(await h.rc.applyCommit('holder', input(0))).toMatchObject({
      kind: 'applied',
      registrationRevision: 1,
    })
    expect(await h.rc.applyCommit('holder', input(1))).toMatchObject({
      kind: 'applied',
      registrationRevision: 2,
    })
  })

  it('a rewritten retry is a conflict and changes nothing; the original retry still answers', async () => {
    const h = harness()
    await openWith(h, 0)
    const first = await h.rc.applyCommit('holder', input(0))
    expect(await h.rc.applyCommit('holder', input(0, { other: true }))).toMatchObject({
      kind: 'invalid',
      reason: 'commit-conflict',
    })
    expect(await h.rc.applyCommit('holder', input(0))).toEqual(first)
    expect(await h.rc.applyCommit('holder', input(1))).toMatchObject({
      kind: 'applied',
      registrationRevision: 2,
    })
  })
})
