import { describe, expect, it } from 'vitest'
import {
  createAssemblyFixture,
  fixtureBudget,
  countingBasis,
} from '@omne-harness/request-context-contract/testing'
import {
  row,
  rowWith,
  message,
  tenantOf,
  callId,
  policiesFixture as fixturePolicies,
} from './fixtures.js'

function reuseFixture() {
  const tenant = tenantOf()
  const rows = [
    rowWith(0, { ...message('answer'), role: 'assistant' }, { tenant, call: callId('shared') }),
    row(1),
  ] as const
  const policies = fixturePolicies()
  return createAssemblyFixture({
    tenant,
    rows,
    policies: {
      ...policies,
      compaction: {
        ...policies.compaction,
        async plan({ measure }) {
          expect(await measure([rows[0].entry])).toEqual({ kind: 'measured', tokens: '1' })
          expect(await measure(rows.map(item => item.entry))).toEqual({
            kind: 'measured',
            tokens: '1',
          })
          expect(await measure([rows[0].entry])).toEqual({ kind: 'measured', tokens: '1' })
          return {
            kind: 'draft',
            coverTo: rows[1].entry,
            retained: [rows[0].entry],
            bound: '2',
            shape: { kind: 'summarize', trimFirst: false },
          }
        },
      },
    },
  })
}

describe('one compaction measurement session', () => {
  it('reacquires for changed message-to-call sources and starts a fresh session on the next plan', async () => {
    const first = message('one', 'a'.repeat(22))
    const second = message('two', 'b'.repeat(22))
    const tenant = tenantOf()
    const rows = [
      rowWith(0, { ...first, role: 'assistant' }, { tenant, call: callId('one') }),
      rowWith(1, { ...second, role: 'assistant' }, { tenant, call: callId('one') }),
    ] as const
    const policies = fixturePolicies()
    const f = createAssemblyFixture({
      tenant,
      rows,
      policies: {
        ...policies,
        compaction: {
          ...policies.compaction,
          async plan({ measure }) {
            await measure([rows[0].entry])
            await measure([rows[1].entry])
            await measure(rows.map(item => item.entry))
            return {
              kind: 'draft',
              coverTo: rows[1].entry,
              retained: [rows[0].entry],
              bound: '2',
              shape: { kind: 'summarize', trimFirst: false },
            }
          },
        },
      },
    })
    const operations = f.operations()
    for (let operation = 0; operation < 2; operation++) {
      expect((await operations.planCompaction(f.call)).kind).toBe('planned')
      expect(f.preparation.calls()).toHaveLength(3 * (operation + 1))
      expect(f.preparation.outstanding()).toBe(0)
    }
    expect(
      f.preparation
        .calls()
        .slice(0, 3)
        .map(call => call.lineage),
    ).toEqual([
      { sources: [{ message: rows[0].message.id, call: callId('one') }] },
      { sources: [{ message: rows[1].message.id, call: callId('one') }] },
      { sources: rows.map(item => ({ message: item.message.id, call: callId('one') })) },
    ])
  })

  it('reuses one lease for different candidates with the same lineage and measures every candidate', async () => {
    const f = reuseFixture()
    expect((await f.operations().planCompaction(f.call)).kind).toBe('planned')
    expect(f.preparation.calls()).toHaveLength(1)
    expect(f.preparation.calls()[0]?.assembled.map(input => input.messages.length)).toEqual([
      1, 2, 1, 1,
    ])
    expect(f.preparation.outstanding()).toBe(0)
  })

  it('waits for the complete asynchronous measurement before releasing the lease', async () => {
    const started = Promise.withResolvers<void>()
    const result = Promise.withResolvers<ReturnType<typeof fixtureBudget>>()
    let released = 0
    const f = createAssemblyFixture({
      preparation: {
        meter: {
          basis: countingBasis,
          async measure() {
            started.resolve()
            return { ok: await result.promise }
          },
        },
        release: () => {
          released++
          return {}
        },
      },
    })
    const pending = f.operations().assemble(f.call)
    const observed = pending.catch(error => error)
    await started.promise
    await Promise.resolve()
    expect(released).toBe(0)
    result.resolve(fixtureBudget())
    expect((await observed).kind).toBe('candidate-before-extension')
    expect(released).toBe(2)
  })
})
