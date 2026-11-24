import { expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import {
  encodeToolInvocationRef,
  type ProgramTools,
  type ToolInvocationRef,
} from '@omne-harness/tool-contract'
import type { ToolStartAuthority } from '@omne-harness/tool-contract/provider'
import { programWorld } from './program-fixture.ts'

type World = Awaited<ReturnType<typeof programWorld>>

const object = (fields: Readonly<Record<string, string | boolean>>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(fields).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? { kind: 'string', value } : { kind: 'boolean', value },
  })),
})
const say = (tools: ProgramTools, ordinal: number, fields: Parameters<typeof object>[0]) =>
  tools.call({ ordinal, entry: 'Echo.say', arguments: object(fields) })

const rows = async (world: World, reference: ToolInvocationRef) =>
  (await world.table(reference)).positions.map(one => [
    one.ordinal,
    one.state,
    one.state === 'retained'
      ? one.terminal.kind
      : one.state === 'handed'
        ? (one.stop ?? 'running')
        : one.state === 'excluded'
          ? one.exclusion.kind
          : '',
  ])

it('TL-69 a program that fails after one call completed: the call that was running is asked to stop, the completed one stays', async () => {
  const world: World = await programWorld({
    script: async tools => {
      await say(tools, 1, { text: 'done' })
      void say(tools, 2, { text: 'slow', hold: 'never' })
      await expect.poll(() => world.said).toEqual(['done', 'slow'])
      const table = await tools.abandon()
      if ('failure' in table) throw new Error('the table was not closed')
      throw new Error('the program gave up')
    },
    settle: false,
  })
  try {
    const reference = await world.start('fails')
    expect((await world.settled(reference)).terminal).toMatchObject({ kind: 'failed' })
    const table = await world.table(reference)
    expect(table.phase).toBe('closing')
    expect(table.fence).toEqual({
      reach: 'all',
      cause: 'failed',
      cut: [{ ordinal: 2, relation: 'foreground' }],
    })
    // The child was stopped through its own control, and its own result came to its position.
    await expect
      .poll(() => rows(world, reference))
      .toEqual([
        [1, 'retained', 'completed'],
        [2, 'retained', 'interrupted'],
      ])
  } finally {
    await world.close()
  }
})

it('TL-69 stopping the call of a program closes its table in that commit and stops every call it still has', async () => {
  const world: World = await programWorld({
    script: async tools => {
      await say(tools, 1, { text: 'done' })
      await say(tools, 2, { text: 'slow', hold: 'never' })
      return 'not reached as a completion'
    },
  })
  try {
    const reference = await world.start('stopped')
    await expect.poll(() => world.said).toEqual(['done', 'slow'])
    const stopped = await world.api.commands.control({
      ...world.query(reference),
      intent: { kind: 'stop' },
    })
    expect(stopped).toMatchObject({ kind: 'committed' })
    const table = await world.table(reference)
    expect(table.fence).toMatchObject({ reach: 'all', cause: 'stopped' })
    expect((await world.settled(reference)).terminal).toMatchObject({ kind: 'interrupted' })
    await expect
      .poll(() => rows(world, reference))
      .toEqual([
        [1, 'retained', 'completed'],
        [2, 'retained', 'interrupted'],
      ])
    // TL-69: a closed program does not report completed, whatever its body returns afterwards.
    expect((await world.table(reference)).phase).toBe('closing')
  } finally {
    await world.close()
  }
})

/** Holds the start of the calls whose text is given, at the point where the start is ordered. */
function holdStarts(world: World) {
  const authority = world.root.get('toolStartAuthority') as ToolStartAuthority<unknown>
  const consume = authority.consume.bind(authority)
  const release = Promise.withResolvers<void>()
  let held = 0
  Object.assign(authority, {
    consume: async (input: Parameters<typeof consume>[0]) => {
      if (input.request.arguments.effective.includes('"late"')) {
        held += 1
        await release.promise
      }
      return consume(input)
    },
  })
  return { held: () => held, go: () => release.resolve() }
}

it('TL-66 a call that was accepted and had not started when the barrier was set does not start', async () => {
  const world: World = await programWorld({
    script: async tools => {
      await say(tools, 1, { text: 'late' })
      return 'not reached'
    },
  })
  try {
    const starts = holdStarts(world)
    const reference = await world.start('barred')
    await expect.poll(() => starts.held()).toBe(1)
    expect(await rows(world, reference)).toEqual([[1, 'handed', 'running']])
    expect(
      await world.api.commands.control({ ...world.query(reference), intent: { kind: 'stop' } }),
    ).toMatchObject({ kind: 'committed' })
    await expect.poll(async () => (await rows(world, reference))[0]?.[2]).not.toBe('running')
    starts.go()
    await world.settled(reference)
    const position = (await world.table(reference)).positions[0]!
    const child = encodeToolInvocationRef({
      tenant: world.tenant,
      call: position.child,
      admission: position.admission,
    })
    if ('failure' in child) throw new Error('reference')
    await world.settled(child.ok)
    // The author of the call never ran: nothing was said.
    expect(world.said).toEqual([])
  } finally {
    await world.close()
  }
})
