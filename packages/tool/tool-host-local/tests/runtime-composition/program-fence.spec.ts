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

it("TL-69 stops the calls of a stopped program where no caller may move a start guard: barring a position is the host's own step", async () => {
  const world: World = await programWorld({
    callersMoveNoGuard: true,
    script: async tools => {
      await say(tools, 1, { text: 'done' })
      await say(tools, 2, { text: 'slow', hold: 'never' })
      return 'not reached as a completion'
    },
  })
  try {
    const reference = await world.start('stopped-in-a-release')
    await expect.poll(() => world.said).toEqual(['done', 'slow'])
    const stopped = await world.api.commands.control({
      ...world.query(reference),
      intent: { kind: 'stop' },
    })
    expect(stopped).toMatchObject({ kind: 'committed' })
    await expect
      .poll(() => rows(world, reference))
      .toEqual([
        [1, 'retained', 'completed'],
        [2, 'retained', 'interrupted'],
      ])
    // The face other owners move their guards by stays closed to callers.
    const authority = world.root.get('toolStartAuthority') as ToolStartAuthority<unknown>
    const moved = await authority.invalidate({
      ...world.query(reference),
      operation: 'op-caller-moves-a-guard',
      guard: {
        owner: 'someone',
        resource: 'thing',
        revision: '0',
        evidence: { owner: 'someone', record: 'thing', revision: '0', digest: 'd' },
        scope: { kind: 'resource' },
      },
    } as never)
    expect(moved).toMatchObject({ failure: { kind: 'unavailable' } })
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

it('TL-66 a call admitted while the barrier was being set ends without starting: no position is left without an end', async () => {
  const asked = Promise.withResolvers<void>()
  const answer = Promise.withResolvers<void>()
  const world: World = await programWorld({
    admission: async () => {
      asked.resolve()
      await answer.promise
      return { kind: 'allowed' }
    },
    script: async tools => {
      await say(tools, 1, { text: 'late' })
      return 'not reached'
    },
  })
  try {
    const reference = await world.start('barred-early')
    await asked.promise
    expect(
      await world.api.commands.control({ ...world.query(reference), intent: { kind: 'stop' } }),
    ).toMatchObject({ kind: 'committed' })
    answer.resolve()
    await world.settled(reference)
    // Whatever the admission answered after the barrier, the position ends and its author never ran.
    const table = await world.table(reference)
    const position = table.positions[0]!
    expect(world.said).toEqual([])
    if (position.state === 'registered' || position.state === 'excluded') return
    const child = encodeToolInvocationRef({
      tenant: world.tenant,
      call: position.child,
      admission: position.admission,
    })
    if ('failure' in child) throw new Error('reference')
    expect((await world.settled(child.ok)).phase).toBe('settled')
  } finally {
    await world.close()
  }
})

it('TL-66 a call whose start was being permitted when the barrier was set ends as not started: its position has an end', async () => {
  const world: World = await programWorld({
    script: async tools => {
      await say(tools, 1, { text: 'late' })
      return 'not reached'
    },
  })
  try {
    // Holds the call the program made inside the permit of its start: after its start was recorded.
    const release = Promise.withResolvers<void>()
    const checks = new Map<unknown, number>()
    let held = 0
    world.hooks.startCheck = async ({ action, call }) => {
      if (action !== 'start') return
      checks.set(call, (checks.get(call) ?? 0) + 1)
      const made = [...checks.keys()].indexOf(call) === 1
      if (!made || checks.get(call) !== 2 || held > 0) return
      held += 1
      await release.promise
    }
    const reference = await world.start('barred-in-permit')
    await expect.poll(() => held).toBe(1)
    expect(
      await world.api.commands.control({ ...world.query(reference), intent: { kind: 'stop' } }),
    ).toMatchObject({ kind: 'committed' })
    await expect.poll(async () => (await rows(world, reference))[0]?.[2]).not.toBe('running')
    release.resolve()
    await world.settled(reference)
    const position = (await world.table(reference)).positions[0]!
    const child = encodeToolInvocationRef({
      tenant: world.tenant,
      call: position.child,
      admission: position.admission,
    })
    if ('failure' in child) throw new Error('reference')
    // The call does not stay in its start for ever: it ends, it never ran, and its position has the end.
    expect((await world.settled(child.ok)).effect).toEqual({ kind: 'not-started' })
    expect(world.said).toEqual([])
    await expect
      .poll(async () => (await rows(world, reference))[0])
      .toEqual([1, 'retained', 'unavailable'])
  } finally {
    await world.close()
  }
})

it('a call of a program that is refused where its start is ordered does not start, and the program is told it had no effect', async () => {
  let answer: unknown
  const world: World = await programWorld({
    script: async tools => {
      answer = await say(tools, 1, { text: 'late' })
      return 'returned'
    },
  })
  try {
    const starts = holdStarts(world)
    const reference = await world.start('revoked')
    await expect.poll(() => starts.held()).toBe(1)
    // The right is there when the start is taken up, and not where the start is ordered.
    world.revoke('start', 1)
    starts.go()
    expect((await world.settled(reference)).terminal).toEqual({ kind: 'completed' })
    // The author never ran, and the program got a named failure with no effect, not an empty value.
    expect(world.said).toEqual([])
    expect(answer).toMatchObject({ kind: 'failure', failure: { effect: 'none' } })
    expect(await rows(world, reference)).toEqual([[1, 'retained', 'unavailable']])
  } finally {
    await world.close()
  }
})

it('calls of one tool made together by a program run within the limit of that tool', async () => {
  const world: World = await programWorld({
    concurrency: 2,
    script: async tools => {
      const all = [1, 2, 3, 4, 5, 6].map(ordinal =>
        say(tools, ordinal, { text: `t${String(ordinal)}`, hold: `g${String(ordinal)}` }),
      )
      return String((await Promise.all(all)).length)
    },
  })
  try {
    const reference = await world.start('limited')
    const peaks: number[] = []
    for (let done = 0; done < 6; done += 2) {
      await expect.poll(() => world.said.length).toBe(done + 2)
      // Nothing more starts while two are running.
      await new Promise(resolve => setTimeout(resolve, 60))
      peaks.push(world.said.length - done)
      for (const text of world.said.slice(done, done + 2))
        world.gate(text.replace('t', 'g')).resolve()
    }
    expect(peaks).toEqual([2, 2, 2])
    expect((await world.settled(reference)).terminal).toEqual({ kind: 'completed' })
    expect((await rows(world, reference)).map(row => row[2])).toEqual(Array(6).fill('completed'))
  } finally {
    await world.close()
  }
})
