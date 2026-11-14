import { describe, expect, it } from 'vitest'
import type {
  ApplyCommitResult,
  CommitInput,
  ContextBlockKey,
  RegistrationChange,
  ReplayRef,
} from '@omne-harness/runtime-context-contract'
import { harness, scope, tenantA, type Harness } from './support.js'

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
const commitOf = (i: number) => ({ commit: `commit-${i}` })

type Entry = Readonly<{ kind: 'registration'; basis: number } | { kind: 'step' }>

class Log {
  readonly entries: Entry[] = []
  get registrations(): number {
    return this.entries.filter(entry => entry.kind === 'registration').length
  }
  commit(kind: Entry['kind']): void {
    this.entries.push(kind === 'step' ? { kind } : { kind, basis: this.registrations })
  }
  input(i: number, rewritten: number | null = null): CommitInput {
    const entry = this.entries[i]
    if (!entry) throw new Error(`no entry ${i}`)
    const after = i === 0 ? null : commitOf(i - 1)
    if (entry.kind === 'step')
      return {
        kind: 'step',
        commit: commitOf(i),
        after,
        tenant: tenantA,
        executionEnded: false,
        stepCommit: {
          scope: target,
          step: { step: rewritten === null ? `step-${i}` : `rewritten-${rewritten}` },
          committed: [],
          pending: [],
        },
      }
    return {
      kind: 'registration',
      commit: commitOf(i),
      after,
      change: change(i, entry.basis, rewritten === null ? null : { rewritten }),
    }
  }
  material(length: number) {
    return this.entries
      .slice(0, length)
      .flatMap((entry, i) =>
        entry.kind === 'registration'
          ? [{ commit: commitOf(i), change: change(i, entry.basis, null) }]
          : [],
      )
  }
}

function change(i: number, basis: number, parameters: unknown): RegistrationChange {
  return {
    kind: 'add',
    creating: false,
    scope: target,
    tenant: tenantA,
    key: `test.k${i}` as ContextBlockKey,
    basedOn: basis,
    required: false,
    bindings: [],
    parameters,
  }
}

async function openWith(h: Harness, log: Log, length: number): Promise<ReplayRef> {
  h.ports.bind(target, tenantA)
  const begun = await h.rc.beginReplay('holder', {
    scope: target,
    tenant: tenantA,
    through: length === 0 ? null : commitOf(length - 1),
    supersedes: null,
  })
  if (begun.kind !== 'replaying') throw new Error(`beginReplay: ${begun.kind}`)
  const ready = await h.rc.finishReplay('holder', {
    replay: begun.replay,
    material: { registrations: log.material(length), checkpoints: [], end: null },
  })
  if (ready.kind !== 'ready') throw new Error(`finishReplay: ${JSON.stringify(ready)}`)
  return begun.replay
}

type Model = {
  rev: number
  head: number
  seen: Map<number, { rewritten: number | null; result: ApplyCommitResult }>
  applied: Set<number>
}

function expected(model: Model, i: number, rewritten: number | null) {
  const seen = model.seen.get(i)
  if (seen)
    return rewritten === seen.rewritten
      ? { same: seen.result }
      : { invalid: 'commit-conflict' as const }
  if (i - 1 !== model.head) return { invalid: 'out-of-order' as const }
  return null
}

type Seen = Record<
  'applied' | 'step' | 'retried' | 'conflict' | 'out-of-order' | 'released' | 'crash',
  number
>

async function run(seed: number, length: number, size: number, seen: Seen): Promise<void> {
  const rnd = random(seed)
  let h = harness()
  const log = new Log()
  let model: Model = { rev: 0, head: -1, seen: new Map(), applied: new Set() }
  let crashes = 0
  await openWith(h, log, 0)
  for (let step = 0; step < length; step++) {
    const roll = rnd.below(10)
    if (roll === 0 && log.entries.length < size) {
      log.commit(rnd.below(2) === 0 ? 'registration' : 'step')
      continue
    }
    if (roll === 1 && crashes < 2) {
      crashes++
      seen.crash++
      h = harness()
      const committed = log.entries.length
      model = { rev: log.registrations, head: committed - 1, seen: new Map(), applied: new Set() }
      await openWith(h, log, committed)
      continue
    }
    const committed = log.entries.length
    if (committed === 0) continue
    const i = rnd.below(committed)
    const known = model.seen.has(i) || model.applied.has(i)
    const rewritten = known && rnd.below(4) === 0 ? step : null
    const want = expected(model, i, rewritten)
    const got = await h.rc.applyCommit('holder', log.input(i, rewritten))
    const where = `seed=${seed} step=${step} commit=${i} head=${model.head} rev=${model.rev}`
    if (want === null) {
      const registration = log.entries[i]?.kind === 'registration'
      const rev = model.rev + (registration ? 1 : 0)
      expect(got, where).toMatchObject({ kind: 'applied', registrationRevision: rev })
      model.rev = rev
      model.head = i
      model.seen = new Map([[i, { rewritten, result: got }]])
      model.applied.add(i)
      seen.applied++
      if (!registration) seen.step++
    } else if ('same' in want) {
      expect(got, where).toEqual(want.same)
      seen.retried++
    } else {
      expect(got, where).toMatchObject({ kind: 'invalid', reason: want.invalid })
      seen[want.invalid === 'commit-conflict' ? 'conflict' : 'out-of-order']++
      if (model.applied.has(i)) seen.released++
      if (got.kind === 'invalid') expect(got.current, where).toBe(model.rev)
    }
    expect(model.rev, where).toBeLessThanOrEqual(log.registrations)
  }
}

async function reportedSuccesses(
  h: Harness,
  log: Log,
  supersedes: ReplayRef,
): Promise<readonly string[]> {
  const before = h.ports.calls.length
  const begun = await h.rc.beginReplay('holder', {
    scope: target,
    tenant: tenantA,
    through: commitOf(log.entries.length - 1),
    supersedes,
  })
  if (begun.kind !== 'replaying') throw new Error(`beginReplay: ${JSON.stringify(begun)}`)
  await h.rc.finishReplay('holder', {
    replay: begun.replay,
    material: { registrations: log.material(log.entries.length), checkpoints: [], end: null },
  })
  const action = h.ports.calls
    .slice(before)
    .flatMap(call =>
      call.face === 'holder' && call.action.kind === 'finish-replay' ? [call.action] : [],
    )
    .at(0)
  if (!action) throw new Error('no finish-replay action')
  return action.appliedCommits.map(item => item.commit.commit)
}

describe('RcCommit guard: applyCommit refines the model', () => {
  it('P1, P2 and P3 hold over 200 seeded schedules of deliveries, retries, rewrites, released retries and crashes', async () => {
    const seen: Seen = {
      applied: 0,
      step: 0,
      retried: 0,
      conflict: 0,
      'out-of-order': 0,
      released: 0,
      crash: 0,
    }
    for (let seed = 1; seed <= 200; seed++) await run(seed, 40, 6, seen)
    for (const [branch, count] of Object.entries(seen)) expect(count, branch).toBeGreaterThan(20)
  })

  it('an out-of-order answer is not remembered: the same input applies once the order is right', async () => {
    const h = harness()
    const log = new Log()
    log.commit('registration')
    log.commit('step')
    await openWith(h, log, 0)
    expect(await h.rc.applyCommit('holder', log.input(1))).toMatchObject({
      kind: 'invalid',
      reason: 'out-of-order',
      current: 0,
    })
    expect(await h.rc.applyCommit('holder', log.input(0))).toMatchObject({
      kind: 'applied',
      registrationRevision: 1,
    })
    expect(await h.rc.applyCommit('holder', log.input(1))).toMatchObject({
      kind: 'applied',
      registrationRevision: 1,
    })
  })

  it('a rewritten retry is a conflict and changes nothing; the original retry still answers', async () => {
    const h = harness()
    const log = new Log()
    log.commit('registration')
    log.commit('registration')
    await openWith(h, log, 0)
    const first = await h.rc.applyCommit('holder', log.input(0))
    expect(await h.rc.applyCommit('holder', log.input(0, 1))).toMatchObject({
      kind: 'invalid',
      reason: 'commit-conflict',
    })
    expect(await h.rc.applyCommit('holder', log.input(0))).toEqual(first)
    expect(await h.rc.applyCommit('holder', log.input(1))).toMatchObject({
      kind: 'applied',
      registrationRevision: 2,
    })
  })

  it('an ordinary commit without `after` is malformed and is not applied', async () => {
    const h = harness()
    const log = new Log()
    log.commit('step')
    await openWith(h, log, 0)
    const { after: _after, ...withoutAfter } = log.input(0) as Extract<
      CommitInput,
      { kind: 'step' }
    >
    expect(await h.rc.applyCommit('holder', withoutAfter as CommitInput)).toMatchObject({
      kind: 'invalid',
      reason: 'malformed-input',
    })
    expect((await h.rc.applyCommit('holder', log.input(0))).kind).toBe('applied')
  })

  it('a released step commit is answered out-of-order and is not applied again', async () => {
    const h = harness()
    const log = new Log()
    log.commit('step')
    log.commit('step')
    await openWith(h, log, 0)
    expect((await h.rc.applyCommit('holder', log.input(0))).kind).toBe('applied')
    expect((await h.rc.applyCommit('holder', log.input(1))).kind).toBe('applied')
    expect(await h.rc.applyCommit('holder', log.input(0))).toMatchObject({
      kind: 'invalid',
      reason: 'out-of-order',
    })
  })
})

describe('RcCommit guard: the success table is bounded (P3, R2-D319)', () => {
  async function after(count: number): Promise<readonly string[]> {
    const h = harness()
    const log = new Log()
    const opened = await openWith(h, log, 0)
    for (let i = 0; i < count; i++) {
      log.commit(i % 2 === 0 ? 'registration' : 'step')
      const applied = await h.rc.applyCommit('holder', log.input(i))
      if (applied.kind !== 'applied') throw new Error(`commit ${i}: ${JSON.stringify(applied)}`)
    }
    return reportedSuccesses(h, log, opened)
  }

  it('keeps one entry per scope whatever the number of applied commits', async () => {
    for (const count of [1, 10, 300]) expect(await after(count), `${count} commits`).toHaveLength(1)
    expect(await after(300)).toEqual(['commit-299'])
  })
})
