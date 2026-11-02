import { describe, expect, it } from 'vitest'
import type { ScopeRef, SupplyAnswer } from '@omne-harness/runtime-context-contract'
import type { RuntimeContextConfig } from '@omne-harness/runtime-context'
import {
  deferred,
  firstBlock,
  harness,
  issue,
  producer,
  reader,
  scope,
  tenantA,
  type Harness,
} from './support.js'

// RC-09 restored supply, review N4: the first ordinary reads after a replay call the source under
// a concurrency limit and a retry interval. Concurrent reads of one block share one source call.

async function restored(h: Harness, target: ScopeRef): Promise<void> {
  h.ports.bind(target, tenantA)
  const begun = await h.rc.beginReplay('holder', {
    scope: target,
    tenant: tenantA,
    through: null,
    supersedes: null,
  })
  if (begun.kind !== 'replaying') throw new Error(begun.kind)
  const ready = await h.rc.finishReplay('holder', {
    replay: begun.replay,
    material: {
      registrations: [
        {
          commit: { commit: `${target.ref}:r1` },
          change: {
            kind: 'add',
            creating: true,
            scope: target,
            tenant: tenantA,
            key: 'test.value',
            basedOn: 0,
            required: false,
            bindings: [],
            parameters: undefined,
          },
        },
      ],
      checkpoints: [],
      end: null,
    },
  })
  if (ready.kind !== 'ready') throw new Error(ready.kind)
}

async function setup(config: RuntimeContextConfig, answer: () => Promise<SupplyAnswer<unknown>>) {
  const h = harness(config)
  const calls: string[] = []
  await producer(h, tenantA, 'test.value', {
    supply: input => {
      calls.push(input.scope.ref)
      return answer()
    },
  })
  return { h, calls }
}

describe('supply after a replay', () => {
  it('concurrent first reads of one block share one source call', async () => {
    const gate = deferred<SupplyAnswer<unknown>>()
    const { h, calls } = await setup({}, () => gate.promise)
    const a = scope('refresh/join')
    await restored(h, a)
    const first = await reader(h, await issue(h, a, tenantA, ['test.value']))
    const second = await reader(h, await issue(h, a, tenantA, ['test.value']))
    const reads = [firstBlock(first), firstBlock(second)]
    while (calls.length === 0) await new Promise(resolve => setTimeout(resolve, 1))
    gate.resolve({ kind: 'value', value: 7 })
    expect(await Promise.all(reads)).toEqual([
      { kind: 'value', value: 7 },
      { kind: 'value', value: 7 },
    ])
    expect(calls).toEqual([a.ref])
  })

  it('beyond the concurrency limit a read answers unknown without calling the source', async () => {
    const gate = deferred<SupplyAnswer<unknown>>()
    const { h, calls } = await setup({ refreshConcurrency: 1 }, () => gate.promise)
    const a = scope('refresh/one')
    const b = scope('refresh/two')
    await restored(h, a)
    await restored(h, b)
    const ra = await reader(h, await issue(h, a, tenantA, ['test.value']))
    const rb = await reader(h, await issue(h, b, tenantA, ['test.value']))
    const pending = firstBlock(ra)
    while (calls.length === 0) await new Promise(resolve => setTimeout(resolve, 1))
    expect(await rb.snapshot()).toEqual({ kind: 'unknown', cause: 'source-unknown' })
    expect(calls).toEqual([a.ref])
    expect(
      h.diagnostics.filter(d => d.kind === 'refresh-deferred' && d.reason === 'concurrency'),
    ).toHaveLength(1)
    gate.resolve({ kind: 'value', value: 1 })
    expect(await pending).toEqual({ kind: 'value', value: 1 })
    // The mark is kept: the next read of b refreshes it.
    expect(await firstBlock(rb)).toEqual({ kind: 'value', value: 1 })
    expect(calls).toEqual([a.ref, b.ref])
  })

  it('within the retry interval a failed refresh is not called again; the failure is reported', async () => {
    const { h, calls } = await setup({ refreshRetryMs: 60_000 }, async () => ({
      kind: 'unknown',
    }))
    const a = scope('refresh/retry')
    await restored(h, a)
    const r = await reader(h, await issue(h, a, tenantA, ['test.value']))
    expect(await r.snapshot()).toEqual({ kind: 'unknown', cause: 'source-unknown' })
    expect(await r.snapshot()).toEqual({ kind: 'unknown', cause: 'source-unknown' })
    expect(calls).toHaveLength(1)
    expect(
      h.diagnostics.filter(d => d.kind === 'refresh-deferred' && d.reason === 'retry-interval'),
    ).toHaveLength(1)
  })

  it('with a zero retry interval every read tries the source again', async () => {
    const { h, calls } = await setup({ refreshRetryMs: 0 }, async () => ({ kind: 'unknown' }))
    const a = scope('refresh/again')
    await restored(h, a)
    const r = await reader(h, await issue(h, a, tenantA, ['test.value']))
    await r.snapshot()
    await r.snapshot()
    expect(calls).toHaveLength(2)
  })
})
