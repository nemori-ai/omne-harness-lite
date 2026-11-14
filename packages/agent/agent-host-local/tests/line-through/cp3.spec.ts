// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '@omne-harness/agent-contract'
import type { Outcome } from '@omne-harness/operation-result'
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
  withAd02AndHandoff,
  strangerAccess,
  type LineWorld,
} from './world.ts'
import { SESSION_ORDINARY_BASIS, sessionOnlyRollbackExplained } from './cp3-rollbacks.ts'
import { entriesOf } from '../host-support.ts'

const worlds: LineWorld[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

async function until(probe: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (!(await probe())) {
    if (Date.now() > end) throw new Error('the condition never held')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

const textOf = (message: { blocks: readonly unknown[] }): string =>
  message.blocks.map(block => (block as { kind: string; text?: string }).text ?? '').join('')

async function historyKinds(w: LineWorld): Promise<string[]> {
  let reader: { history: { begin(input: unknown): Promise<unknown> } } | undefined
  await w.mount({
    name: 'cp3-history-reader',
    inject: { session: { caller: 'reader' } },
    apply: (inner: { session: typeof reader }) => {
      reader = inner.session
    },
  })
  const principal = ok(
    await w.workPrincipals.forSession({
      actor: 'coordinator',
      tenant: intakeAccess.tenant,
      session: intakeAccess.session,
    }),
  )
  const page = ok(
    (await reader?.history.begin({
      principal,
      tenant: intakeAccess.tenant,
      session: intakeAccess.session,
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 1_000_000,
    })) as Outcome<{ entries: readonly { kind: string }[] }, unknown>,
  )
  return page.entries.map(entry => entry.kind)
}

describe('CP3: from a Session input to the save of the Model result on the session log', () => {
  it('runs the whole line on one real Cordis root over the real sqlite-provider', async () => {
    const w = await openLineWorld(withAd02AndHandoff())
    worlds.push(w)
    const agent = { principal: COORDINATOR, tenant: TENANT }

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

    await until(() => w.admits.length > 0)
    const work = ok(await w.transactions.readWork(intakeAccess))
    if (work.run.kind !== 'active') throw new Error(`the Run is ${work.run.kind}`)
    expect(work.run.first).toBe('cp3-input')
    const execution = await w.runExecution()
    if (execution === null) throw new Error('no execution')
    expect(String(execution)).toBe(work.run.execution.execution)

    const opening = w.commits.find(
      seen =>
        seen.participants.includes('execution-record') && seen.participants.includes('session'),
    )
    expect([...(opening?.participants ?? [])].sort()).toEqual([
      'execution-record',
      'session',
      'session-ordinary-basis',
    ])
    expect(opening?.result.kind).toBe('committed')

    expect(w.resolved.length).toBeGreaterThan(0)
    expect(w.assembled).toHaveLength(1)
    expect(w.assembled[0]!.map(textOf)).toEqual([...EARLIER])

    expect(w.admits).toHaveLength(1)
    expect(w.admits[0]).toHaveProperty('ok')
    const pushed = await Promise.all(w.pushes)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]).toMatchObject({ status: 'saved' })
    const rolledBack = w.commits.flatMap((seen, position) =>
      seen.result.kind === 'rolled_back' ? [{ seen, position, result: seen.result }] : [],
    )
    for (const { seen, position, result } of rolledBack) {
      for (const response of result.responses)
        expect([response.participant, response.reply.kind]).toEqual([
          response.participant,
          response.participant === SESSION_ORDINARY_BASIS ? 'participated' : 'conflict',
        ])
      if (seen.participants.includes('execution-record')) {
        const again = w.commits
          .slice(position + 1)
          .find(
            later =>
              later.result.kind === 'committed' &&
              later.result.identity.operation === result.identity.operation,
          )
        expect(again).toBeDefined()
      }
    }
    const sessionOnly = rolledBack.filter(
      ({ seen }) => !seen.participants.includes('execution-record'),
    )
    if (sessionOnly.length > 0) {
      const unexplained = async (): Promise<unknown[]> => {
        const held = ok(await w.transactions.readWork(intakeAccess))
        const readThroughOf = (execution: string): string | null =>
          held.run.kind === 'active' && held.run.execution.execution === execution
            ? held.run.execution.readThrough
            : (held.executions?.find(item => item.execution.execution === execution)?.execution
                .readThrough ?? null)
        return sessionOnly
          .filter(
            ({ position }) => !sessionOnlyRollbackExplained(w.commits, position, readThroughOf),
          )
          .map(({ seen }) => ({ log: seen.log, responses: seen.result }))
      }
      await until(async () => (await unexplained()).length === 0, 10_000).catch(() => undefined)
      expect(await unexplained()).toEqual([])
      const kinds = await historyKinds(w)
      expect(kinds.filter(kind => kind === 'run.batch-taken')).toHaveLength(1)
    }
    expect(
      w.commits.every(
        seen => seen.result.kind === 'committed' || seen.result.kind === 'rolled_back',
      ),
    ).toBe(true)

    const root = await w.published()
    expect(root.session).toBe(root.agent)
    const saved = ok(await w.fresh().load({ ...agent, execution }))
    expect(await w.published()).toEqual(root)
    const [effect] = saved.effects
    if (effect === undefined || effect.pending.kind !== 'model') throw new Error('no Model call')
    expect(await entriesOf(w.freshEntries(), { ...agent, execution })).toEqual([
      expect.objectContaining({ kind: 'received', consumption: effect.pending.consumption }),
    ])
    expect(saved.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })

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

    expect(await w.journal().load({ ...strangerAccess, execution })).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
    expect(await w.transactions.readWork(strangerAccess)).toMatchObject({
      failure: { kind: 'denied' },
    })
    expect(w.errors).toEqual([])
  })
})
