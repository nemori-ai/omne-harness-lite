import { expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { controlAssembly } from './fixtures/control-assembly.ts'
import { evidence, loadWithEntries, ok, operation } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'

it('settles a cancellation when the advance is revoked before the wait can be saved', async () => {
  let revoked = false
  const assembly = await controlAssembly({}, ports => ({
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
  }))
  const handle = ok(await invoke(assembly))
  const input = { ...alice, execution: handle.execution }
  await eventually(async () => revoked && assembly.controls.clock.pending().length > 0)
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
