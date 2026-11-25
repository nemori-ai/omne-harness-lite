import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createGoalAccessPlugin } from '@omne-harness/goal-access/cordis'
import { goalProtocol } from '@omne-harness/goal-protocol'
import { expect, it } from 'vitest'
import { bodyOf, LOGIN, SUBJECT, WHERE } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<typeof goalProtocol>[] = []
  mount(contribution: never): void {
    this.ctx.effect(() => {
      this.mounted.push(contribution)
      return () => undefined
    }, 'test.mount')
  }
}

it('mounts goal/v1 on the registry, and takes the goals at each call: the protocol stays while they are away', async () => {
  const root = new Context()
  await root.plugin(RecordingRegistry)
  let mounted = false
  const asked: string[] = []
  await root.plugin(
    createGoalAccessPlugin({
      goals: () =>
        mounted
          ? {
              read: async (_caller, session) => {
                asked.push(session)
                return { kind: 'done', value: null, recalled: false }
              },
              write: async () => ({ kind: 'unknown' }),
              command: async () => ({ kind: 'unknown' }),
            }
          : undefined,
      entrance: () => ({
        admit: async () => ({ kind: 'admitted', subject: SUBJECT, by: 'acc-1' }),
      }),
      changes: () => undefined,
    }),
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  expect(registry.mounted.map(one => one.protocol)).toEqual([goalProtocol])
  const read = registry.mounted[0]!.operations['read-goal']
  const call = { principal: LOGIN, messageId: 'm-1', signal: new AbortController().signal }
  expect(await read(call, bodyOf('read-goal', WHERE))).toEqual({ outcome: 'basis-unavailable' })
  mounted = true
  expect(await read(call, bodyOf('read-goal', WHERE))).toEqual({
    outcome: 'succeeded',
    body: { goal: null },
  })
  expect(asked).toEqual([WHERE.session])
})
