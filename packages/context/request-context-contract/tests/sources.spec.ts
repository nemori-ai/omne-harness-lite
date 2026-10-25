// Seven-group stable reads, access and eligibility, full metering with leases, source calls,
// decimal history and the incremental compaction window (RQ-05, RQ-06, RQ-12 – RQ-15).
import { describe, expect, it } from 'vitest'
import { judgeMessage, type CompactionMessage, type Message } from '@omne-harness/message'
import {
  compareHistorySequence,
  decodeHistorySequence,
  type AssemblyResult,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createScriptedInputMeter,
  countingBasis,
  fixtureBudget,
  createMemoryReadEligibility,
  createTestingPrincipalBinding,
} from '@omne-harness/request-context-contract/testing'
import { createAssemblyOperations } from '@omne-harness/request-context-contract'
import { must, row, rowWith, tenantOf, callId, text, adoptedOf, evidence } from './fixtures.js'

function candidate(result: AssemblyResult) {
  if (result.kind !== 'candidate-before-extension' && result.kind !== 'candidate-fixable')
    throw new Error(result.kind)
  return result.candidate
}
function assistant(id: string): Extract<Message, { role: 'assistant' }> {
  const judged = judgeMessage({
    role: 'assistant',
    id: 'msg_' + id.padStart(22, 'a'),
    blocks: [text('answer', 'a' + id)],
  })
  if ('rejected' in judged || judged.ok.role !== 'assistant') throw new Error('Assistant fixture')
  return judged.ok
}

describe('J14: each group is read count, source, count', () => {
  it.each(['history', 'context', 'prompt', 'model', 'tools', 'control'] as const)(
    'a %s group that keeps changing is unavailable, never a half group',
    async group => {
      const f = createAssemblyFixture()
      f.sources.churn(group, true)
      expect(await f.operations().assemble(f.call)).toMatchObject({
        kind: 'unavailable',
        owner: 'input-source',
        diagnostic: `unstable-input:${group}`,
      })
    },
  )
  it('a change during one read discards that group and the second read is used', async () => {
    const f = createAssemblyFixture()
    const prompt = f.sources.values().prompt
    f.sources.afterSourceRead('prompt', () =>
      f.sources.update('prompt', {
        ...prompt,
        promptContributions: { contributions: [], digest: 'new', generation: 'g2' },
      }),
    )
    const result = candidate(await f.operations().assemble(f.call))
    expect(result.coverage.prompt.generation).toBe('g2')
    expect(f.sources.sourceReads('prompt')).toBe(2)
  })
  it('the adopted count is part of the third group: a fixation during the read re-reads the group', async () => {
    const f = createAssemblyFixture()
    const first = candidate(await f.operations().assemble(f.call))
    const adopted = f.sources
      .adopted as import('@omne-harness/request-context-contract/testing').MemoryAdoptedSource<string>
    const start = adopted.reads()
    adopted.afterSourceRead(() => adopted.set(adoptedOf(first)))
    const second = await f.operations().assemble(f.call)
    expect(second.kind).toBe('candidate-before-extension')
    expect(adopted.reads() - start).toBe(2)
  })
  it.each([
    [{ kind: 'denied' as const }, 'denied'],
    [{ kind: 'unknown' as const }, 'unknown'],
    [{ kind: 'unavailable' as const, diagnostic: 'offline' }, 'unavailable'],
  ])('a group read %j keeps its class', async (read, kind) => {
    const f = createAssemblyFixture()
    f.sources.fail('tools', read)
    expect((await f.operations().assemble(f.call)).kind).toBe(kind)
  })
  it('measurements are never reused: the same tokens measured twice use the second result', async () => {
    let n = 0
    const f = createAssemblyFixture({
      preparation: {
        meter: createScriptedInputMeter(countingBasis, () => ({
          ok: fixtureBudget(++n <= 2 ? '100' : '120'),
        })),
      },
    })
    const a = candidate(await f.operations().assemble(f.call))
    const b = candidate(await f.operations().assemble(f.call))
    expect(a.verdict.report.checks[0]?.measurement.amount).toBe('100')
    expect(b.verdict.report.checks[0]?.measurement.amount).toBe('120')
  })
})

describe('J41: ordinary access and eligibility', () => {
  it('a call without access is invalid before any source read', async () => {
    const f = createAssemblyFixture()
    const result = await f.operations().assemble({ ...f.call, access: null as never })
    expect(result).toMatchObject({ kind: 'invalid', field: 'access', reason: 'missing-access' })
    expect(f.sources.sourceReads('history')).toBe(0)
  })
  it('an access of another tenant is denied without probing the target', async () => {
    const f = createAssemblyFixture()
    const result = await f.operations().assemble({
      ...f.call,
      access: { principal: 'p', tenant: tenantOf('9') },
    })
    expect(result).toMatchObject({ kind: 'denied' })
    expect(f.sources.sourceReads('control')).toBe(0)
  })
  it.each([
    [{ kind: 'denied' as const }, 'denied'],
    [{ kind: 'unknown' as const }, 'unknown'],
    [{ kind: 'unavailable' as const, diagnostic: 'bridge' }, 'unavailable'],
  ])('eligibility %j before reading keeps its class and reads nothing', async (decision, kind) => {
    const f = createAssemblyFixture()
    const eligibility = f.sources.eligibility as ReturnType<
      typeof createMemoryReadEligibility<string>
    >
    eligibility.set(decision)
    expect((await f.operations().assemble(f.call)).kind).toBe(kind)
    expect(f.sources.sourceReads('control')).toBe(0)
  })
  it('eligibility withdrawn during the operation drops the result before it leaves', async () => {
    const f = createAssemblyFixture()
    const eligibility = f.sources.eligibility as ReturnType<
      typeof createMemoryReadEligibility<string>
    >
    f.sources.afterSourceRead('tools', () => eligibility.set({ kind: 'denied' }))
    expect(await f.operations().assemble(f.call)).toMatchObject({ kind: 'denied' })
  })
})

describe('J13: metering through the preparation lease', () => {
  it('each candidate acquires its own lease with this access and gives it back', async () => {
    const f = createAssemblyFixture()
    candidate(await f.operations().assemble(f.call))
    const calls = f.preparation.calls()
    expect(calls).toHaveLength(2)
    expect(calls.every(call => call.principal === 'p')).toBe(true)
    expect(calls.every(call => call.assembled.length === 1)).toBe(true)
    expect(f.preparation.outstanding()).toBe(0)
  })
  it('an acquire failure keeps its class and needs no release', async () => {
    const f = createAssemblyFixture({
      preparation: {
        acquire: () => ({ kind: 'unavailable', dependency: 'profile', diagnostic: 'gone' }),
      },
    })
    expect(await f.operations().assemble(f.call)).toMatchObject({
      kind: 'unavailable',
      owner: 'preparation',
    })
    expect(f.preparation.outstanding()).toBe(0)
  })
  it('a release failure after a fitting candidate is unavailable, never a fixable success', async () => {
    const f = createAssemblyFixture({
      preparation: {
        release: () => ({
          failure: { kind: 'unavailable', dependency: 'lease', diagnostic: 'stuck' },
        }),
      },
    })
    expect(await f.operations().assemble(f.call)).toMatchObject({
      kind: 'unavailable',
      owner: 'preparation',
    })
  })
})

describe('J48: source calls and continues', () => {
  it('lineage lists the source call of each assistant message once, in candidate order', async () => {
    const tenant = tenantOf()
    const rows = [row(0), rowWith(1, assistant('1'), { tenant, call: callId('one') })]
    const f = createAssemblyFixture({ tenant, rows })
    const result = candidate(await f.operations().assemble(f.call))
    expect(f.preparation.calls()[0]?.lineage).toEqual({
      sources: [{ message: rows[1]!.message.id, call: callId('one') }],
    })
    expect(result.assembled.messages).toHaveLength(2)
  })
  it('a source call of another tenant is rejected at the boundary', async () => {
    const rows = [rowWith(0, assistant('0'), { tenant: tenantOf('7'), call: callId('x') })]
    const f = createAssemblyFixture({ rows })
    expect(await f.operations().assemble(f.call)).toMatchObject({
      kind: 'invalid',
      reason: 'tenant-mismatch',
    })
  })
  it('continues is declared only while the fixed prefix and settings are unchanged', async () => {
    const tenant = tenantOf()
    const f = createAssemblyFixture({ tenant })
    const first = candidate(await f.operations().assemble(f.call))
    const fact = adoptedOf(first, {
      call: { tenant, call: callId('fixed') },
      continuation: {
        ...first.continuation,
        call: { tenant, call: callId('fixed') },
        fixed: evidence,
      },
    })
    const context = f.sources.values().context
    ;(
      f.sources
        .adopted as import('@omne-harness/request-context-contract/testing').MemoryAdoptedSource<string>
    ).set(fact)
    f.sources.update('context', context)
    candidate(await f.operations().assemble(f.call))
    expect(f.preparation.calls().at(-2)?.lineage).toEqual({ continues: callId('fixed') })
    // Changing the parameters breaks the precondition: continues is omitted, not an error.
    const model = f.sources.values().model
    f.sources.update('model', { ...model, replay: 'off' })
    candidate(await f.operations().assemble(f.call))
    expect(f.preparation.calls().at(-2)?.lineage).toEqual({})
  })
})

describe('decimal history sequence', () => {
  it('compares as integers, never as floating point or text', () => {
    const seq = (v: string) => must(decodeHistorySequence(v))
    expect(compareHistorySequence(seq('9'), seq('10'))).toBe(-1)
    expect(compareHistorySequence(seq('9007199254740993'), seq('9007199254740992'))).toBe(1)
    for (const bad of ['-1', '01', '1.0', ' 1', '1e3', ''])
      expect('failure' in decodeHistorySequence(bad)).toBe(true)
  })
  it('an empty history has no rows and no anchor row', async () => {
    const f = createAssemblyFixture({ rows: [] })
    const result = candidate(await f.operations().assemble(f.call))
    expect(result.coverage.snapshot.anchor.position).toEqual({ kind: 'empty' })
    expect(result.coverage.history.anchors).toEqual([])
  })
})

describe('J15: the incremental window of a later compaction', () => {
  it('plans against the previous compaction, its retained entry and the uncovered tail', async () => {
    const rows = [row(0), row(1), row(2)]
    const f = createAssemblyFixture({ rows })
    const record: CompactionMessage = {
      role: 'compaction',
      id: assistant('9').id,
      blocks: [text('old summary')],
      covers: { from: rows[0]!.entry, to: rows[1]!.entry },
      retained: [rows[1]!.entry],
      derivation: evidence,
    }
    const next = f.history.commitCompaction(record)
    const evidenceNow = f.history.evidence()
    const history = f.sources.values().history
    f.sources.update('history', { ...history, evidence: { ...evidenceNow, epoch: next } })
    const planned = await f.operations().planCompaction(f.call)
    expect(planned.kind).toBe('planned')
    if (planned.kind !== 'planned') return
    expect(planned.plan.basis.context.base.kind).toBe('previous')
    expect(planned.plan.covers.from).toBe(rows[0]!.entry)
    // The summarized first row is not in the window.
    expect(planned.plan.basis.context.covered.map(e => e.ref)).not.toContain(rows[0]!.entry)
  })
  it('a window that revives a summarized entry is a source conflict, not a consumed step', async () => {
    const f = createAssemblyFixture()
    const spy = {
      ...f,
      sources: {
        ...f.sources,
        history: {
          ...f.history,
          async compactionContext(input: Parameters<typeof f.history.compactionContext>[0]) {
            const result = await f.history.compactionContext(input)
            if (result.kind !== 'context') return result
            return {
              ...result,
              value: {
                ...result.value,
                open: [...result.value.open, rowWith(5, assistant('5')).entry],
              },
            }
          },
        },
      },
    }
    const operations = createAssemblyOperations({
      target: spy.target,
      sources: spy.sources,
      principalBinding: createTestingPrincipalBinding<string>(),
      policies: f.policies,
    })
    expect(await operations.planCompaction(f.call)).toMatchObject({
      kind: 'invalid',
      reason: 'source-evidence-conflict',
    })
  })
})
