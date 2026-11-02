import { expect, it } from 'vitest'
import type { StatefulBlockDescriptor } from '@omne-harness/runtime-context-contract'
import { harness, issue, numberSchema, reader, scope, tenantA } from './support.js'

// B6 reading (a): a checkpointed block that is registered but has no step commit yet has no value
// to restore. The material may leave it out; after the replay it reads as before the restart.

function stateful<K extends `${string}.${string}`>(
  key: K,
  required: boolean,
): StatefulBlockDescriptor<K, unknown> {
  return {
    key,
    kind: 'stateful',
    schema: numberSchema,
    consumers: ['model'],
    required,
    disclosure: 'plain',
    carriesPrevious: false,
    volatility: 'per-step',
    writers: ['coordinator'],
    reduce: (_current, update) => update,
    persistence: 'checkpointed',
    singleWriterPerStep: true,
  }
}

it('restores checkpointed blocks without a step commit as absent, and the next step commit writes them', async () => {
  const h = harness()
  const target = scope('b6/session')
  h.ports.bind(target, tenantA)
  const begun = await h.rc.beginReplay('holder', {
    scope: target,
    tenant: tenantA,
    through: { commit: 'r2' },
    supersedes: null,
  })
  if (begun.kind !== 'replaying') throw new Error(begun.kind)
  const add = (key: 'state.required' | 'state.optional', basedOn: number, required: boolean) => ({
    commit: { commit: `r${basedOn + 1}` },
    change: {
      kind: 'add' as const,
      creating: true,
      scope: target,
      tenant: tenantA,
      key,
      basedOn,
      required,
      bindings: [],
      parameters: undefined,
      declaration: stateful(key, required),
    },
  })
  const ready = await h.rc.finishReplay('holder', {
    replay: begun.replay,
    material: {
      registrations: [add('state.required', 0, true), add('state.optional', 1, false)],
      checkpoints: [],
      end: null,
    },
  })
  expect(ready).toMatchObject({ kind: 'ready', state: 'open', registrationRevision: 2 })
  const r = await reader(h, await issue(h, target, tenantA, ['state.required', 'state.optional']))
  const before = await r.snapshot()
  expect(before.kind).toBe('success')
  if (before.kind !== 'success') return
  expect(before.value.missing.map(item => [item.key, item.cause])).toEqual([
    ['state.required', 'no-value'],
  ])
  expect(before.value.blocks.map(block => [block.key, block.state])).toEqual([
    ['state.optional', { kind: 'none' }],
  ])
  const step = await h.rc.applyCommit('holder', {
    kind: 'step',
    commit: { commit: 's1' },
    tenant: tenantA,
    executionEnded: false,
    stepCommit: {
      scope: target,
      step: { step: 'step-1' },
      committed: [
        {
          key: 'state.required',
          value: 3,
          updates: [
            { key: 'state.required', update: 3, writer: 'coordinator', origin: { origin: 'u1' } },
          ],
        },
      ],
      pending: [],
    },
  })
  expect(step.kind).toBe('applied')
  const after = await r.snapshot()
  expect(after.kind).toBe('success')
  if (after.kind !== 'success') return
  expect(after.value.missing).toEqual([])
  expect(after.value.blocks.find(block => block.key === 'state.required')?.state).toEqual({
    kind: 'value',
    value: 3,
  })
})
