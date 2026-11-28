import { expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { DurableEvidence, ProgramTools } from '@omne-harness/tool-contract'
import { programWorld } from './program-fixture.ts'

type World = Awaited<ReturnType<typeof programWorld>>

const object = (fields: Readonly<Record<string, string>>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(fields).map(([key, value]) => ({
    key,
    value: { kind: 'string', value },
  })),
})
const say = (tools: ProgramTools, ordinal: number, fields: Readonly<Record<string, string>>) =>
  tools.call({ ordinal, entry: 'Echo.say', arguments: object(fields) })

const proof = (instance: string): DurableEvidence => ({
  owner: 'program-lost-spec',
  record: 'state-lock',
  revision: '1',
  digest: `instance:${instance}`,
})

it('CM-11 when the host of a program is gone the program is not run again: its call fails as lost, its calls keep their results, nothing runs twice', async () => {
  let runs = 0
  const world: World = await programWorld({
    script: async tools => {
      runs += 1
      await say(tools, 1, { text: 'done' })
      await say(tools, 2, { text: 'slow', hold: 'never' })
      return 'not reached'
    },
  })
  let next: Awaited<ReturnType<World['newExecutor']>> | null = null
  try {
    const reference = await world.start('lost')
    await expect.poll(() => world.said).toEqual(['done', 'slow'])
    await world.plugins.close()
    next = await world.newExecutor({ lostContact: proof })
    const taken = next
    await expect
      .poll(
        async () => {
          const found = await taken.lookup(reference)
          return found.kind === 'found' ? found.state.phase : found.kind
        },
        { timeout: 5000 },
      )
      .toBe('settled')
    const parent = await taken.lookup(reference)
    expect(parent).toMatchObject({
      kind: 'found',
      state: { terminal: { kind: 'failed', cause: 'runtime-lost' }, effect: { kind: 'unknown' } },
    })
    // The table is closed for every call, with the cause of a failure, in the commit that settled it.
    const table = await taken.table(reference)
    expect(table.phase).toBe('closing')
    expect(table.fence).toMatchObject({ reach: 'all', cause: 'failed' })
    // The call that completed keeps its result; the one that was running ends under its own identity.
    await expect
      .poll(
        async () =>
          (await taken.table(reference)).positions.map(one => [
            one.ordinal,
            one.state,
            one.state === 'retained' ? one.terminal.kind : '',
          ]),
        { timeout: 5000 },
      )
      .toEqual([
        [1, 'retained', 'completed'],
        [2, 'retained', 'failed'],
      ])
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(runs).toBe(1)
    expect(world.said).toEqual(['done', 'slow'])
  } finally {
    await next?.close()
    await world.close()
  }
})
