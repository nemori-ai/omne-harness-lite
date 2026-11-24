import { expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import {
  encodeToolInvocationRef,
  type FixedToolRequest,
  type ProgramCallAnswer,
  type ProgramTools,
  type ToolStartRecord,
} from '@omne-harness/tool-contract'
import { TOOL_PROGRAM_OWNER } from '../../src/program-source.ts'
import { jsonOf, programWorld } from './program-fixture.ts'

const object = (fields: Readonly<Record<string, string | boolean>>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(fields).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? { kind: 'string', value } : { kind: 'boolean', value },
  })),
})
const say = (tools: ProgramTools, ordinal: number, fields: Parameters<typeof object>[0]) =>
  tools.call({ ordinal, entry: 'Echo.say', arguments: object(fields) })
const saidOf = (answer: ProgramCallAnswer): string => {
  if (answer.kind !== 'value') throw new Error(JSON.stringify(answer))
  const value = answer.value
  const said = value?.kind === 'object' ? value.entries.find(one => one.key === 'said') : undefined
  return said?.value.kind === 'string' ? said.value.value : ''
}

it('a program calls two functions in order and gets the value each one returned', async () => {
  const world = await programWorld({
    script: async tools => {
      const first = saidOf(await say(tools, 1, { text: 'one' }))
      return saidOf(await say(tools, 2, { text: `${first}+two` }))
    },
  })
  try {
    const ran = await world.run('sequence')
    expect(ran.state.terminal).toEqual({ kind: 'completed' })
    expect(JSON.parse(ran.text)).toMatchObject({
      output: 'one+two',
      table: {
        phase: 'sealed',
        positions: [
          { ordinal: 1, state: 'retained', terminal: { kind: 'completed' }, late: false },
          { ordinal: 2, state: 'retained', terminal: { kind: 'completed' }, late: false },
        ],
      },
    })
    expect(world.said).toEqual(['one', 'one+two'])
    expect(world.asked.map(one => [one.ordinal, one.target.name, one.target.command])).toEqual([
      [1, 'Echo', 'say'],
      [2, 'Echo', 'say'],
    ])
  } finally {
    await world.close()
  }
})

it('each call of a program has its own account: the parent counts the program only, and no call is counted twice', async () => {
  const world = await programWorld({
    script: async tools => {
      await say(tools, 1, { text: 'one' })
      return saidOf(await say(tools, 2, { text: 'two' }))
    },
  })
  try {
    const ran = await world.run('accounts')
    const parent = world.callOf(ran.reference)
    const read = await world.store.usage({
      tenant: world.tenant,
      range: null,
      consumer: null,
      order: 'ascending',
      after: null,
      limit: 10,
    })
    if (read.kind !== 'page') throw new Error(JSON.stringify(read))
    expect(read.facts).toHaveLength(3)
    expect(new Set(read.facts.map(fact => fact.call)).size).toBe(3)
    for (const fact of read.facts)
      expect(fact.account.subject).toEqual({ kind: 'tool_execution', id: fact.call })
    const children = read.facts.filter(fact => fact.call !== parent)
    expect(children.map(fact => [fact.consumer.owner, fact.consumer.work])).toEqual([
      [TOOL_PROGRAM_OWNER, parent],
      [TOOL_PROGRAM_OWNER, parent],
    ])
    expect(read.facts.filter(fact => fact.call === parent)).toHaveLength(1)
  } finally {
    await world.close()
  }
})

const failureOf = (answer: ProgramCallAnswer) => {
  if (answer.kind !== 'failure') throw new Error(JSON.stringify(answer))
  return answer.failure
}

it('calls made together answer each at its own position, whatever order the answers come in', async () => {
  const world = await programWorld({
    script: async tools => {
      const all = Promise.all(
        [1, 2, 3].map(ordinal => say(tools, ordinal, { text: `p${ordinal}`, hold: `g${ordinal}` })),
      )
      await expect.poll(() => world.said.length).toBe(3)
      for (const name of ['g3', 'g1', 'g2']) world.gate(name).resolve()
      return (await all).map(saidOf).join(',')
    },
  })
  try {
    const ran = await world.run('parallel')
    expect(JSON.parse(ran.text).output).toBe('p1,p2,p3')
    const table = await world.table(ran.reference)
    expect(table.positions.map(one => [one.ordinal, one.state])).toEqual([
      [1, 'retained'],
      [2, 'retained'],
      [3, 'retained'],
    ])
    expect(new Set(table.positions.map(one => one.child)).size).toBe(3)
  } finally {
    await world.close()
  }
})

it('only the branch the program takes is called', async () => {
  const world = await programWorld({
    script: async (tools, input) => {
      const picked = saidOf(await say(tools, 1, { text: input }))
      return picked === 'left'
        ? saidOf(await say(tools, 2, { text: 'went-left' }))
        : saidOf(await say(tools, 2, { text: 'went-right' }))
    },
  })
  try {
    expect(JSON.parse((await world.run('branch', 'left')).text).output).toBe('went-left')
    expect(world.said).toEqual(['left', 'went-left'])
  } finally {
    await world.close()
  }
})

it('TL-65 the same position sent again is the same call and runs once', async () => {
  let again: ProgramCallAnswer | undefined
  const world = await programWorld({
    script: async tools => {
      const first = await say(tools, 1, { text: 'once' })
      again = await say(tools, 1, { text: 'once' })
      const other = await say(tools, 1, { text: 'another' })
      return `${saidOf(first)}|${failureOf(other).kind}`
    },
  })
  try {
    const ran = await world.run('redeliver')
    expect(JSON.parse(ran.text).output).toBe('once|invalid')
    expect(again).toMatchObject({ kind: 'value' })
    expect(world.said).toEqual(['once'])
    const [position] = (await world.table(ran.reference)).positions
    const parent = {
      principal: world.principal,
      tenant: world.tenant,
      call: world.callOf(ran.reference),
    }
    const recovery = (await world.root.toolCommands.loadRecovery(parent)) as {
      ok: { start: Extract<ToolStartRecord, { kind: 'start' }>; request: FixedToolRequest }
    }
    const target = world.invokeRequest('Echo', 'say', { text: 'once' }, 'program')
    const resent = await world.plugins.programs()!.invoke({
      ...parent,
      start: recovery.ok.start,
      request: recovery.ok.request,
      ordinal: 1,
      target: target!,
    })
    expect(resent).toMatchObject({ kind: 'accepted', recovered: true })
    if (resent.kind !== 'accepted') throw new Error('accepted')
    expect(world.callOf(resent.reference)).toBe(position?.child)
    await world.settled(resent.reference)
    expect(world.said).toEqual(['once'])
  } finally {
    await world.close()
  }
})

it('TL-71 what is not open to programs is refused by name and leaves no position; a direct call still runs', async () => {
  const refused: string[] = []
  const world = await programWorld({
    script: async tools => {
      const tries: readonly [string, Parameters<typeof object>[0]][] = [
        ['Plain', { text: 'closed tool' }],
        ['Echo.hush', { text: 'closed command' }],
        ['Echo.shout', { text: 'closed argument', hold: 'never' }],
        ['Runner.execute', { value: 'itself' }],
        ['Nope.missing', { text: 'unknown' }],
      ]
      for (const [index, [entry, fields]] of tries.entries())
        refused.push(
          failureOf(await tools.call({ ordinal: index + 1, entry, arguments: object(fields) }))
            .kind,
        )
      return saidOf(
        await tools.call({ ordinal: 9, entry: 'Echo.shout', arguments: object({ text: 'open' }) }),
      )
    },
  })
  try {
    const ran = await world.run('closed')
    expect(JSON.parse(ran.text).output).toBe('open')
    expect(refused).toEqual([
      'unsupported',
      'unsupported',
      'unsupported',
      'unsupported',
      'unsupported',
    ])
    expect((await world.table(ran.reference)).positions.map(one => one.ordinal)).toEqual([9])
    expect(world.said).toEqual(['open'])
    expect(world.asked).toHaveLength(1)
    const direct = world.invokeRequest('Plain', null, { text: 'by the model' }, 'direct-plain')
    const reference = await world.api.invoke({
      principal: world.principal,
      tenant: world.tenant,
      request: direct!,
    })
    if (reference.kind !== 'accepted') throw new Error(JSON.stringify(reference))
    expect((await world.settled(reference.reference)).terminal).toEqual({ kind: 'completed' })
    expect(world.said).toEqual(['open', 'by the model'])
  } finally {
    await world.close()
  }
})

it('TL-67 a body that returns without waiting does not complete until its calls have ended', async () => {
  const world = await programWorld({
    script: async tools => {
      void say(tools, 1, { text: 'slow', hold: 'late' })
      await expect.poll(() => world.said.length).toBe(1)
      return 'returned early'
    },
  })
  try {
    const reference = await world.start('early')
    await expect.poll(async () => (await world.table(reference)).phase).toBe('sealed')
    const found = await world.api.queries.lookup(world.query(reference))
    expect(found).toMatchObject({ ok: { kind: 'found', state: { phase: 'running' } } })
    expect((await world.table(reference)).positions).toMatchObject([
      { ordinal: 1, state: 'handed' },
    ])
    world.gate('late').resolve()
    expect((await world.settled(reference)).terminal).toEqual({ kind: 'completed' })
    expect((await world.table(reference)).positions).toMatchObject([
      { ordinal: 1, state: 'retained', terminal: { kind: 'completed' } },
    ])
  } finally {
    await world.close()
  }
})

it('TL-72 a denied action is excluded and never runs; one the admission cannot answer waits at its position', async () => {
  let unanswered = 2
  const world = await programWorld({
    admission: async asked => {
      if (asked.ordinal === 1) return { kind: 'denied', reason: 'not this one' }
      return unanswered-- > 0 ? { kind: 'unanswerable', diagnostic: 'later' } : { kind: 'allowed' }
    },
    script: async tools => {
      const denied = failureOf(await say(tools, 1, { text: 'forbidden' }))
      const waited = saidOf(await say(tools, 2, { text: 'patient' }))
      return JSON.stringify({ denied, waited })
    },
  })
  try {
    const ran = await world.run('admission')
    expect(JSON.parse(JSON.parse(ran.text).output)).toEqual({
      denied: { kind: 'denied', effect: 'none', message: 'not this one' },
      waited: 'patient',
    })
    expect(world.said).toEqual(['patient'])
    expect(world.asked.map(one => one.ordinal)).toEqual([1, 2, 2, 2])
    expect((await world.table(ran.reference)).positions).toMatchObject([
      { ordinal: 1, state: 'excluded', exclusion: { kind: 'denied', reason: 'not this one' } },
      { ordinal: 2, state: 'retained' },
    ])
  } finally {
    await world.close()
  }
})

it('without an admission of nested actions a program call answers unavailable and leaves nothing', async () => {
  const world = await programWorld({
    admission: null,
    script: async tools => JSON.stringify(failureOf(await say(tools, 1, { text: 'nobody asks' }))),
  })
  try {
    const ran = await world.run('no-admission')
    expect(JSON.parse(JSON.parse(ran.text).output)).toMatchObject({
      kind: 'unavailable',
      effect: 'none',
    })
    expect(world.said).toEqual([])
    expect((await world.table(ran.reference)).positions).toEqual([])
  } finally {
    await world.close()
  }
})

it('a call that does not complete gives the program a named failure with its effect, never an empty value', async () => {
  let output: Record<string, unknown> = {}
  const world = await programWorld({
    script: async tools => {
      const invalid = failureOf(
        await tools.call({ ordinal: 1, entry: 'Echo.say', arguments: object({ hold: 'no text' }) }),
      )
      const threw = failureOf(await say(tools, 2, { text: 'boom', fail: true }))
      const mute = failureOf(await say(tools, 3, { text: 'quiet', mute: true }))
      const stopping = say(tools, 4, { text: 'stopped', hold: 'never' })
      await expect.poll(() => world.said.includes('stopped')).toBe(true)
      output = { invalid, threw, mute, stopping: await stopping }
      return 'done'
    },
  })
  try {
    const reference = await world.start('failures')
    await expect
      .poll(
        async () => (await world.table(reference)).positions.find(one => one.ordinal === 4)?.state,
      )
      .toBe('handed')
    const position = (await world.table(reference)).positions.find(one => one.ordinal === 4)!
    const child = encodeToolInvocationRef({
      tenant: world.tenant,
      call: position.child,
      admission: position.admission,
    })
    if ('failure' in child) throw new Error('reference')
    expect(
      await world.api.commands.control({ ...world.query(child.ok), intent: { kind: 'stop' } }),
    ).toMatchObject({ kind: 'committed' })
    expect(JSON.parse(await world.finished(reference)).output).toBe('done')
    expect(output.invalid).toMatchObject({ kind: 'invalid', effect: 'none' })
    expect(output.threw).toMatchObject({ kind: 'failed' })
    expect(output.mute).toEqual({
      kind: 'failed',
      effect: 'unknown',
      message: 'The call completed and gave a program no value.',
    })
    expect(output.stopping).toMatchObject({ kind: 'failure', failure: { kind: 'interrupted' } })
    expect((await world.table(reference)).positions.map(one => [one.ordinal, one.state])).toEqual([
      [2, 'retained'],
      [3, 'retained'],
      [4, 'retained'],
    ])
  } finally {
    await world.close()
  }
})

it('TL-67 the ledger does not record completed for a call whose positions have not ended, whatever its author does', async () => {
  const world = await programWorld({
    settle: false,
    script: async tools => {
      void say(tools, 1, { text: 'slow', hold: 'late' })
      await expect.poll(() => world.said.length).toBe(1)
      return 'returned early'
    },
  })
  try {
    const reference = await world.start('unsettled')
    const phase = async () => {
      const found = await world.api.queries.lookup(world.query(reference))
      return 'ok' in found && found.ok.kind === 'found' ? found.ok.state.phase : 'unknown'
    }
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(await phase()).toBe('running')
    expect((await world.table(reference)).positions).toMatchObject([
      { ordinal: 1, state: 'handed' },
    ])
    world.gate('late').resolve()
    await expect
      .poll(async () => (await world.table(reference)).positions[0]?.state)
      .toBe('retained')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect([(await world.table(reference)).phase, await phase()]).toEqual(['open', 'running'])
  } finally {
    await world.close()
  }
})

it("TL-71 a tool that forwards does not open what is closed: the source stays the program's and the ledger answers unsupported", async () => {
  const world = await programWorld({
    script: async tools => {
      const relay = (ordinal: number, name: string, command: string | null, text: string) =>
        tools.call({
          ordinal,
          entry: 'Relay.execute',
          arguments: jsonOf({ name, command, arguments: { text } }),
        })
      const closed = saidOf(await relay(1, 'Plain', null, 'through the back door'))
      const open = saidOf(await relay(2, 'Echo', 'say', 'relayed'))
      return JSON.stringify([JSON.parse(closed), JSON.parse(open).failure])
    },
  })
  try {
    const ran = await world.run('relay')
    expect(JSON.parse(JSON.parse(ran.text).output)).toEqual([
      { kind: 'rejected', failure: 'unsupported' },
      null,
    ])
    await expect.poll(() => world.said).toEqual(['relayed'])
    const direct = world.invokeRequest(
      'Relay',
      'execute',
      { name: 'Plain', command: null, arguments: { text: 'by the model' } },
      'direct-relay',
    )
    const reference = await world.api.invoke({
      principal: world.principal,
      tenant: world.tenant,
      request: direct!,
    })
    if (reference.kind !== 'accepted') throw new Error(JSON.stringify(reference))
    await world.settled(reference.reference)
    await expect.poll(() => world.said).toEqual(['relayed', 'by the model'])
  } finally {
    await world.close()
  }
})
