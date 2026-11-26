import { expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { controlAssembly } from './fixtures/control-assembly.ts'
import { evidence, loadWithEntries, ok, operation } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'

it('settles a cancellation when the advance is revoked before the wait can be saved', async () => {
  let revoked = false
  const waits: string[] = []
  const wrap: Parameters<typeof controlAssembly>[1] = ports => ({
    ...ports,
    conditions: {
      ...ports.conditions,
      read: input =>
        revoked ? Promise.resolve(fail({ kind: 'stale-advance' })) : ports.conditions.read(input),
    },
    requests: {
      ...ports.requests,
      prepare: async () =>
        fail({
          kind: 'unavailable',
          owner: 'history-holder',
          diagnostic: 'the required guidance is unreadable',
        }),
    },
    journal: {
      ...ports.journal,
      commit: input => {
        if (
          input.state.kind === 'waiting' &&
          input.state.waits.some(wait => wait.kind === 'dependency' && wait.position === 'I1')
        ) {
          // Session has revoked the grant. The cancellation is still on its way to the Journal.
          revoked = true
          return Promise.resolve(fail({ kind: 'stale-advance' }))
        }
        return ports.journal.commit(input)
      },
    },
  })
  const assembly = await controlAssembly(
    {},
    wrap,
    {},
    {
      waiting: ({ step, node, owner, diagnostic }) =>
        waits.push(`${step} ${node} ${owner}: ${diagnostic}`),
    },
  )
  const handle = ok(await invoke(assembly))
  const input = { ...alice, execution: handle.execution }
  await eventually(async () => revoked && assembly.controls.clock.pending().length > 0)
  expect(waits.at(-1)).toBe(
    'step-1 E2 @omne-harness/agent: the advance is revoked and its cause is not in the Journal yet',
  )
  ok(
    await handle.control.control({
      ...input,
      operation: operation('cancel-after-revocation'),
      command: { kind: 'cancel', reason: evidence('cancel') },
    }),
  )
  await eventually(
    async () => (await loadWithEntries(assembly.dependencies, input)).state.kind === 'ended',
  )
  const ended = await loadWithEntries(assembly.dependencies, input)
  expect(ended.state).toMatchObject({
    kind: 'ended',
    conclusion: { kind: 'cancelled' },
  })
  expect(ended.effects).toEqual([])
  expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
})
