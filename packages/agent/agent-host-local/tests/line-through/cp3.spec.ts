// CP3, the third in-line checkpoint (E.1): one real Cordis 4.0.4 root carries a Session input
// through startRun, the Agent invoke, the assembly of the Model request with the earlier context, a
// scripted Model reply and the save of the receiver, to the commit on the session log.
//
// Real: the sqlite-provider (real Workers and files), session-storage-sql, the session provider of
// session-cordis, AD-14 `createSessionAgentDrivePlugin`, the `agentJournal` plugin
// `SessionLogAgentJournalProvider`, the `agent-host` plugin with `createAgentRuntime` and the
// directory plugin, agent-context `AgentContextProvider` over the real request-context-cordis and
// runtime-context-cordis providers, and the receiver `createLocalModelReceiver`.
// Doubles: J06 (`createScriptedMessageHandoff`, `createTableConditions`, R1-D33); the Model (the
// scripted provider and result pusher of model-contract); the receiver is built in the test world
// and is not registered through the host plugin (C22 G2), and its `targets` port is answered from
// the Journal's public `load`; the earlier context is the history of the K-RQ holder double, not a
// read of the Session log (AD-03 and AD-04 are not delivered); the remaining Agent, context and
// Session side ports are doubles. Each one is listed where it is built, in ./world.ts.
//
// What this checkpoint does not reach in this wave: the receiver's save is a commit of the
// execution-record participant on the common root; the Session interpretation of the result is
// AD-02 (wave 2, R1-D35), and with J06 a double the reply message does not enter the Session log.
// So the last assertion is that the received entry and the Agent's original records are visible
// at one common root count, which the Agent count and the Session root read alike. The receiver
// writes through its own session-log Journal copy, so the plugin's event stream is not woken by
// it: the Agent picks the entry up at its reconciliation check, which the test reaches by moving
// the manual Agent clock.
// @module-tag slow
// Why slow: real Workers, real files and the whole line on one root.
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '@omne-harness/agent-contract'
import {
  creation,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import {
  COORDINATOR,
  EARLIER,
  INPUT_TEXT,
  REPLY_TEXT,
  SESSION,
  TENANT,
  intakeAccess,
  ok,
  openLineWorld,
  strangerAccess,
  type LineWorld,
} from './world.ts'

const worlds: LineWorld[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

/** Waits for `probe` on later turns, at most `ms` milliseconds. */
async function until(probe: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (!(await probe())) {
    if (Date.now() > end) throw new Error('the condition never held')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

const textOf = (message: { blocks: readonly unknown[] }): string =>
  message.blocks.map(block => (block as { kind: string; text?: string }).text ?? '').join('')

describe('CP3: from a Session input to the save of the Model result on the session log', () => {
  it('runs the whole line on one real Cordis root over the real sqlite-provider', async () => {
    const w = await openLineWorld()
    worlds.push(w)
    const agent = { principal: COORDINATOR, tenant: TENANT }

    // Input: the intake face creates the session and accepts one input.
    w.bindings.controls.bind(TENANT, sessionId(SESSION))
    ok(
      await w.intake.management.create({
        ...intakeAccess,
        operation: operationId('cp3-create'),
        creation: creation(),
      }),
    )
    ok(
      await w.intake.work.accept({
        ...intakeAccess,
        operation: operationId('cp3-accept'),
        value: ordinaryInput('cp3-input', INPUT_TEXT),
      }),
    )

    // startRun: S1 opened a Run for the input; invoke reached the Model through the Agent.
    await until(() => w.admits.length > 0)
    const work = ok(await w.transactions.readWork(intakeAccess))
    if (work.run.kind !== 'active') throw new Error(`the Run is ${work.run.kind}`)
    expect(work.run.first).toBe('cp3-input')
    const execution = await w.runExecution()
    if (execution === null) throw new Error('no execution')
    expect(String(execution)).toBe(work.run.execution.execution)

    // invoke: the Journal open was one storage commit of the Agent records and the Session check.
    const opening = w.commits.filter(seen => seen.participants.includes('execution-record'))[0]
    expect([...(opening?.participants ?? [])].sort()).toEqual(['execution-record', 'session'])
    expect(opening?.result.kind).toBe('committed')

    // The assembly read the earlier context through the Agent's history head and built the Model
    // request from it, in order.
    expect(w.resolved.length).toBeGreaterThan(0)
    expect(w.assembled).toHaveLength(1)
    expect(w.assembled[0]!.map(textOf)).toEqual([...EARLIER])

    // The scripted Model answered the one admitted call; the receiver saved it.
    expect(w.admits).toHaveLength(1)
    expect(w.admits[0]).toHaveProperty('ok')
    const pushed = await Promise.all(w.pushes)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]).toMatchObject({ status: 'saved' })
    expect(w.commits.every(seen => seen.result.kind === 'committed')).toBe(true)

    // The common root after the save: the Agent count and the Session root read the same number,
    // and a copy rebuilt from the durable records at that count holds the received entry next to
    // the Agent's original records of the same call.
    const root = await w.published()
    expect(root.session).toBe(root.agent)
    const saved = ok(await w.fresh().load({ ...agent, execution }))
    expect(await w.published()).toEqual(root)
    const [effect] = saved.effects
    if (effect === undefined || effect.pending.kind !== 'model') throw new Error('no Model call')
    expect(saved.entries).toEqual([
      expect.objectContaining({ kind: 'received', consumption: effect.pending.consumption }),
    ])
    expect(saved.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })

    // The Agent adopts the saved result at its reconciliation check: the reply is its message.
    const messages = async (): Promise<string[]> => {
      const page = ok(
        await w.journal().output.read({ ...agent, execution, after: null, limit: 100 }),
      )
      if (page.kind !== 'page') return []
      return page.events
        .map((event: AgentEvent) => event.body)
        .flatMap(body => (body.kind === 'message' ? [textOf(body.message)] : []))
    }
    await until(async () => {
      w.clock.advanceTo(new Date(Date.parse(w.clock.now()) + 2000).toISOString())
      return (await messages()).length > 0
    })
    expect(await messages()).toEqual([REPLY_TEXT])

    // Another tenant is denied the execution, as the Session is denied to it.
    expect(await w.journal().load({ ...strangerAccess, execution })).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
    expect(await w.transactions.readWork(strangerAccess)).toMatchObject({
      failure: { kind: 'denied' },
    })
    expect(w.errors).toEqual([])
  })
})
