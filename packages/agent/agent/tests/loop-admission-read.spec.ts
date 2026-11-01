// E2's read of the reply admission facts (Agent SPEC "回复准入的已核实前缀", D5 r2.2 第 5 节): the
// lower bound the coordinator chooses, the in-process prefix, the read position that ordinary
// commits carry, the commit-time missing-basis answer that goes to W0, the one origin re-read of
// a missing basis, and the recovery read from the saved prefix. The memory Journal is the
// provider; it is not durable, so nothing here proves a durable provider.
import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type {
  AgentCheckpoint,
  Authority,
  Failure,
  JournalCommit,
  ReplyAdmissionPage,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createExecutionCoordinator,
  type ExecutionEntry,
  type ReplyAdmissionReadReport,
} from '../src/loop/coordinator.ts'
import {
  acceptedInput,
  checkpoint,
  commitAt,
  execution,
  failure,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import { options } from './factory-support.ts'
import { alice, loopAssembly, type LoopAssembly } from './loop-support.ts'

type ReadInput = Parameters<ExecutionEntry<Principal>['ports']['journal']['readReplyAdmissions']>[0]
type Commit = JournalCommit<Principal>

const STOP: Failure = { kind: 'invalid', field: 'test', reason: 'stop at the evaluator' }

/** The coordinator of exec-1 whose evaluator stops at E4: E1 and E2 run, nothing is decided. */
function stopping(assembly: LoopAssembly, change: Partial<ExecutionEntry<Principal>> = {}) {
  return createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: {
      ...agentEvaluator,
      initial: () => succeed(checkpoint('I0')),
      next: () => fail(STOP),
    },
    access: alice,
    execution: execution(),
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1', 'hello exec-1'),
    grant: null,
    idle() {},
    ...change,
  })
}

/** The assembly whose Journal records every reply admission read and every commit. */
async function recorded(
  read: (
    input: ReadInput,
    next: (input: ReadInput) => Promise<Outcome<ReplyAdmissionPage, Failure>>,
  ) => Promise<Outcome<ReplyAdmissionPage, Failure>> = (input, next) => next(input),
  commit: (
    input: Commit,
    next: (input: Commit) => ReturnType<LoopAssembly['dependencies']['journal']['commit']>,
  ) => ReturnType<LoopAssembly['dependencies']['journal']['commit']> = (input, next) => next(input),
) {
  const reads: ReadInput[] = []
  const commits: Commit[] = []
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    journal: {
      ...d.journal,
      readReplyAdmissions: input => {
        reads.push(input)
        return read(input, value => d.journal.readReplyAdmissions(value))
      },
      commit: input => {
        commits.push(input)
        return commit(input, value => d.journal.commit(value))
      },
    },
  }))
  return { assembly, reads, commits }
}

const memory = (assembly: LoopAssembly) => assembly.controls.journal

async function load(assembly: LoopAssembly) {
  return ok(await memory(assembly).port.load({ ...alice, execution: execution() }))
}

function seed(assembly: LoopAssembly, count: number) {
  expect(memory(assembly).replyAdmissions.seed(execution(), count, alice.tenant)).toBe(true)
}

/** Saves `read` as the checkpoint's read position with a commit of the original authority. */
async function saveRead(
  assembly: LoopAssembly,
  authority: Authority,
  read: AgentCheckpoint['replyAdmissionRead'],
) {
  const snapshot = await load(assembly)
  ok(
    await memory(assembly).port.commit(
      commitAt(snapshot, authority, 'save-read', {
        checkpoint: { ...snapshot.checkpoint, replyAdmissionRead: read },
      }),
    ),
  )
}

const fromOf = (input: ReadInput | undefined) =>
  input?.from.kind === 'prefix' ? input.from.prefix.sequence : input?.from.kind

/**
 * An execution whose first coordinator read `count` facts and saved them with its ordinary commits
 * before it waits for the Model; `cut` makes the next E2 stop after its reads (the conditions read
 * that follows them fails), so a new coordinator's recovery read can be observed alone.
 */
async function restartable(
  count: number,
  read?: Parameters<typeof recorded>[0],
): Promise<
  Awaited<ReturnType<typeof recorded>> & {
    authority: Authority
    cut: { on: boolean }
    next: (
      change?: Partial<ExecutionEntry<Principal>>,
    ) => ReturnType<typeof createExecutionCoordinator>
  }
> {
  const cut = { on: false }
  const armed = { on: false }
  const reads: ReadInput[] = []
  const commits: Commit[] = []
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    conditions: {
      ...d.conditions,
      read: input => (cut.on ? Promise.resolve(fail(STOP)) : d.conditions.read(input)),
    },
    journal: {
      ...d.journal,
      readReplyAdmissions: input => {
        reads.push(input)
        return armed.on && read !== undefined
          ? read(input, value => d.journal.readReplyAdmissions(value))
          : d.journal.readReplyAdmissions(input)
      },
      commit: input => {
        commits.push(input)
        return d.journal.commit(input)
      },
    },
  }))
  const next = (change: Partial<ExecutionEntry<Principal>> = {}) =>
    createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello exec-1'),
      grant: null,
      idle() {},
      ...change,
    })
  const first = next()
  const authority = ok(await first.accept())
  expect(memory(assembly).replyAdmissions.seed(execution(), count, alice.tenant)).toBe(true)
  ok(await first.runExecution())
  const saved = (await load(assembly)).checkpoint.replyAdmissionRead
  expect(saved.kind === 'verified' && saved.prefix.sequence).toBe(String(count))
  reads.length = 0
  commits.length = 0
  cut.on = true
  armed.on = true
  return { assembly, reads, commits, authority, cut, next }
}

describe('E2 lower bound and in-process prefix', () => {
  it('a new execution reads from origin; the next E2 of the same coordinator reads from its in-process prefix and scans no old row', async () => {
    const { assembly, reads } = await recorded()
    const c = stopping(assembly)
    ok(await c.accept())
    seed(assembly, 3)
    const before = await load(assembly)
    expect(failure(await c.runExecution())).toEqual({ node: 'E4', failure: STOP })
    expect(reads.map(fromOf)).toEqual(['origin'])
    expect((await load(assembly)).revision).toBe(before.revision)
    const scanned = memory(assembly).replyAdmissions.statistics().scanned
    expect(failure(await c.runExecution())).toEqual({ node: 'E4', failure: STOP })
    expect(reads.map(fromOf)).toEqual(['origin', '3'])
    expect(memory(assembly).replyAdmissions.statistics().scanned).toBe(scanned)
  })

  it('a new coordinator reads from the verified prefix the ordinary commits saved', async () => {
    const { assembly, reads, authority, next } = await restartable(2)
    seed(assembly, 1)
    expect(failure(await next().continueExecution(authority))).toEqual({
      node: 'E2',
      failure: STOP,
    })
    expect(reads.map(fromOf)).toEqual(['2'])
  })

  it('the read of 0 or 1 new facts scans as many rows at 100 as at 10000 facts', async () => {
    const scans: number[][] = []
    for (const scale of [100, 10_000]) {
      const { assembly } = await recorded()
      const c = stopping(assembly)
      ok(await c.accept())
      seed(assembly, scale)
      failure(await c.runExecution())
      const rows: number[] = []
      for (const delta of [0, 1]) {
        if (delta > 0) seed(assembly, delta)
        const before = memory(assembly).replyAdmissions.statistics().scanned
        failure(await c.runExecution())
        rows.push(memory(assembly).replyAdmissions.statistics().scanned - before)
      }
      scans.push(rows)
    }
    expect(scans).toEqual([
      [0, 1],
      [0, 1],
    ])
  })
})

describe('the read position rides on ordinary commits only', () => {
  it('every commit after E2 carries the verified in-process prefix, and none changes only the read position', async () => {
    const { assembly, commits } = await recorded()
    const c = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello exec-1'),
      grant: null,
      idle() {},
    })
    ok(await c.accept())
    seed(assembly, 4)
    assembly.release.open()
    ok(await c.runExecution())
    expect((await load(assembly)).state.kind).toBe('ended')
    const verified = commits.filter(item => item.checkpoint.replyAdmissionRead.kind === 'verified')
    expect(verified.length).toBe(commits.length)
    expect(
      verified.every(
        item =>
          item.checkpoint.replyAdmissionRead.kind === 'verified' &&
          BigInt(item.checkpoint.replyAdmissionRead.prefix.sequence) >= 4n,
      ),
    ).toBe(true)
    // A commit whose only change is the read position would be a progress commit (D5 removed it).
    for (let index = 1; index < commits.length; index += 1) {
      const before = commits[index - 1]!
      const after = commits[index]!
      const strip = (value: Commit) => ({
        ...value.checkpoint,
        replyAdmissionRead: null,
        state: value.state,
      })
      const onlyRead =
        JSON.stringify(strip(before)) === JSON.stringify(strip(after)) &&
        after.events.length === 0 &&
        after.effects.length === 0 &&
        after.replyAdmission === null &&
        after.handoff === null &&
        after.finish === null
      expect(onlyRead).toBe(false)
    }
  })
})

describe('commit-time missing basis and the origin re-read', () => {
  it('a commit answered unavailable with missing-basis drops the in-process prefix and W0 saves the checkpoint read position unchanged', async () => {
    let lost = false
    const { assembly, commits } = await recorded(undefined, (input, next) => {
      if (!lost && input.checkpoint.replyAdmissionRead.kind === 'verified') {
        lost = true
        return Promise.resolve(
          fail({
            kind: 'unavailable',
            owner: 'memory-agent-journal',
            diagnostic: 'missing-basis: the basis of the prefix 3 cannot be resolved',
          }),
        )
      }
      return next(input)
    })
    const c = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello exec-1'),
      grant: null,
      idle() {},
    })
    ok(await c.accept())
    seed(assembly, 3)
    const saved = (await load(assembly)).checkpoint.replyAdmissionRead
    ok(await c.runExecution())
    const after = await load(assembly)
    expect(after.state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'memory-agent-journal' }],
    })
    expect(after.checkpoint.replyAdmissionRead).toEqual(saved)
    const wait = commits.at(-1)
    expect(wait?.state.kind).toBe('waiting')
    expect(wait?.checkpoint.replyAdmissionRead).toEqual(saved)
  })

  it('a missing basis of the saved prefix is read again once from origin with a report of the cold read; later reads go on from the new prefix; a new coordinator before an ordinary commit treats it again', async () => {
    const { assembly, reads, authority, next } = await restartable(3)
    seed(assembly, 2)
    expect(
      memory(assembly).replyAdmissions.damage(
        execution(),
        { kind: 'missing-basis', sequence: 3 },
        alice.tenant,
      ),
    ).toBe(true)
    const reports: ReplyAdmissionReadReport[] = []
    const c = next({ report: value => reports.push(value) })
    expect(failure(await c.continueExecution(authority))).toEqual({ node: 'E2', failure: STOP })
    expect(reads.map(fromOf)).toEqual(['3', 'origin'])
    expect(reports).toEqual([
      {
        kind: 'origin-reread',
        reason: 'missing-basis',
        from: '3',
        outcome: 'complete',
        pages: 1,
        facts: 5,
      },
    ])
    failure(await c.runExecution())
    expect(reads.map(fromOf)).toEqual(['3', 'origin', '5'])
    failure(await next({ report: value => reports.push(value) }).continueExecution(authority))
    expect(reads.map(fromOf)).toEqual(['3', 'origin', '5', '3', 'origin'])
    expect(reports).toHaveLength(2)
  })

  it('invalid and denied are not treated by an origin read', async () => {
    for (const refusal of [
      { kind: 'invalid', field: 'from', reason: 'not of this execution' },
      { kind: 'denied', action: 'readReplyAdmissions' },
    ] as const) {
      const { reads, authority, next } = await restartable(1, async (input, read) =>
        input.from.kind === 'prefix' ? fail(refusal) : read(input),
      )
      expect(failure(await next().continueExecution(authority))).toEqual({
        node: 'E2',
        failure: refusal,
      })
      expect(reads.map(fromOf)).toEqual(['1'])
    }
  })

  it('a gap other than missing-basis at the prefix is not treated by an origin read: E2 waits in W0', async () => {
    const recovery = { owner: 'test', record: 'gap', revision: '1', digest: 'test:gap' }
    const { assembly, reads, authority, next } = await restartable(1, async (input, read) =>
      input.from.kind === 'prefix'
        ? succeed({ kind: 'gap', reason: 'retention', recovery })
        : read(input),
    )
    ok(await next().continueExecution(authority))
    expect(reads.map(fromOf)).toEqual(['1'])
    expect((await load(assembly)).state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'dependency', position: 'E2' }],
    })
  })

  it('an origin re-read that meets a gap waits in W0 instead of passing the gap', async () => {
    const recovery = { owner: 'test', record: 'gap', revision: '1', digest: 'test:gap' }
    const { assembly, reads, authority, next } = await restartable(1, async input =>
      succeed({
        kind: 'gap',
        reason: input.from.kind === 'prefix' ? 'missing-basis' : 'missing-fact',
        recovery,
      }),
    )
    ok(await next().continueExecution(authority))
    expect(reads.map(fromOf)).toEqual(['1', 'origin'])
    expect((await load(assembly)).state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'dependency', position: 'E2' }],
    })
  })
})

describe('recovery reads from the saved prefix', () => {
  it('saved 120, read 160 in memory before a crash, target 230: the new range is (120, 230], nothing before 120 is scanned and no checkpoint is written', async () => {
    const { assembly, reads, authority, next } = await restartable(120)
    // The crashed coordinator read to 160 and saved nothing; the new target is 230.
    seed(assembly, 40)
    seed(assembly, 70)
    expect((await load(assembly)).replyAdmissions.prefix.sequence).toBe('230')
    const before = memory(assembly).replyAdmissions.statistics()
    expect(failure(await next().continueExecution(authority))).toEqual({
      node: 'E2',
      failure: STOP,
    })
    const after = memory(assembly).replyAdmissions.statistics()
    expect(reads.map(fromOf)).toEqual(['120', '120'])
    expect(reads[0]?.after).toBeNull()
    expect(reads.every(input => input.through.record === reads[0]?.through.record)).toBe(true)
    expect(after.scanned - before.scanned).toBe(110)
    expect(after.checkpointWrites).toBe(before.checkpointWrites)
  })

  it('a crash in the middle of the cold origin read starts again from the same lower bound and writes no checkpoint', async () => {
    const hang = { on: true }
    const { assembly, reads, authority, next } = await restartable(150, (input, read) =>
      hang.on && input.from.kind === 'origin' && input.after !== null
        ? new Promise(() => {})
        : read(input),
    )
    seed(assembly, 10)
    expect(
      memory(assembly).replyAdmissions.damage(
        execution(),
        { kind: 'missing-basis', sequence: 150 },
        alice.tenant,
      ),
    ).toBe(true)
    const revision = (await load(assembly)).revision
    void next().continueExecution(authority)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(reads.map(fromOf)).toEqual(['150', 'origin', 'origin'])
    expect((await load(assembly)).revision).toBe(revision)
    hang.on = false
    expect(failure(await next().continueExecution(authority))).toEqual({
      node: 'E2',
      failure: STOP,
    })
    expect(reads.slice(3).map(fromOf)).toEqual(['150', 'origin', 'origin'])
    expect(reads[4]?.after).toBeNull()
    expect((await load(assembly)).revision).toBe(revision)
  })
})
