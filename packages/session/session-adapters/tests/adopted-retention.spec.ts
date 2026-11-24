import { afterEach, describe, expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { SessionAdoptedRequests } from '@omne-harness/session-cordis-contract'
import { sessionAdoptedRequestsKey } from '@omne-harness/session-cordis-contract/cordis'
import { createSessionJournalInterpretationPlugin } from '../src/cordis/journal-interpretation.ts'
import { invocation } from './fixtures/adopted-request.ts'
import { adopt, endAndSettle, openHanded } from './fixtures/adopted-settled.ts'
import { ok } from './fixtures/common-journal.ts'
import { endOpened, refusedByModel } from './fixtures/finish.ts'
import { cordisScene, nextRun, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: SqlScene[] = []
const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  for (const s of scenes.splice(0)) await s.close()
})

const representation = (tag: string) => ({
  message: `msg_${tag.repeat(22).slice(0, 22)}`,
  block: `block-${tag}`,
  choice: 'derived',
  source: null,
  mediaType: 'image/png',
})
const choiceOf = (tag: string) => ({
  message: `msg_${tag.repeat(22).slice(0, 22)}`,
  block: `block-${tag}`,
  choice: 'derived',
  mediaType: 'image/png',
})

async function mounted(s: SqlScene) {
  const c = await cordisScene(s)
  disposers.push(() => c.dispose())
  const interpretation = createSessionJournalInterpretationPlugin<string>({
    coordinator: async () => succeed(s.access.principal),
  })
  await c.mount(interpretation.plugin)
  const requests = () => c.ctx.get(sessionAdoptedRequestsKey) as SessionAdoptedRequests<unknown>
  return {
    c,
    // The Session takes in what the execution recorded; once it has all of it, it acknowledges.
    interpret: async (at: SqlScene) =>
      ok(
        await interpretation.interpret({
          tenant: at.access.tenant,
          session: at.access.session,
          execution: at.execution,
        }),
      ),
    journal: () => c.journal(),
    latest: () => requests().readAdoptedRequest({ access: s.access, session: s.access.session }),
    choices: (tag: string) =>
      requests().readRequestChoices({
        access: s.access,
        session: s.access.session,
        reference: invocation(s.access.tenant, tag),
      }),
  }
}

async function settled(at: SqlScene) {
  await vi.waitFor(
    () => {
      const row = at.controls?.select(
        `SELECT settled FROM er_execution WHERE execution = '${at.execution}'`,
      ).rows[0]
      expect(row?.[0] ?? null).not.toBeNull()
    },
    { timeout: 5000 },
  )
}

async function world(name: string) {
  const s = await sqlScene(name)
  scenes.push(s)
  const target = { tenant: s.access.tenant, scope: { ref: `scope:${name}` } as never }
  return { s, target, m: await mounted(s) }
}

describe('the adopted request of a session outlives the settle of its execution', () => {
  it('the latest adoption reads the same before and after each settle, across a second execution and a restart', async () => {
    const { s, target, m } = await world('retained-latest')
    const opened = await openHanded(s, m.journal())
    await adopt(s, m.journal(), opened, target, '1', { representations: [representation('a')] })
    const first = await m.latest()
    expect(first).toMatchObject({
      kind: 'value',
      value: { execution: s.execution, reference: invocation(s.access.tenant, '1') },
    })
    await endOpened(s, m.journal(), opened, refusedByModel())
    await m.interpret(s)
    await settled(s)
    expect(await m.latest()).toEqual(first)

    const s2 = await nextRun(s, 2)
    const opened2 = await openHanded(s2, m.journal(), '2')
    expect(await m.latest()).toEqual(first)
    await adopt(s2, m.journal(), opened2, target, '2', { representations: [representation('b')] })
    const second = await m.latest()
    expect(second).toMatchObject({
      kind: 'value',
      value: { execution: s2.execution, reference: invocation(s.access.tenant, '2') },
    })
    if (first.kind !== 'value' || second.kind !== 'value') throw new Error('two values expected')
    expect(BigInt(second.value!.order) > BigInt(first.value!.order)).toBe(true)
    await endOpened(s2, m.journal(), opened2, refusedByModel())
    await m.interpret(s2)
    await settled(s2)
    expect(await m.latest()).toEqual(second)

    await m.c.dispose()
    const restarted = await mounted(s)
    expect(await restarted.latest()).toEqual(second)
  })

  it('the choices of each adopted request read the same while its execution lives, after it settles and after a restart; a call never adopted reads null', async () => {
    const { s, target, m } = await world('retained-choices')
    const opened = await openHanded(s, m.journal())
    await adopt(s, m.journal(), opened, target, '1', { representations: [representation('a')] })
    const live = await m.choices('1')
    expect(live).toEqual({ kind: 'value', value: [choiceOf('a')] })
    await endAndSettle(s, m.journal(), opened)
    expect(await m.choices('1')).toEqual(live)
    expect(await m.choices('never')).toEqual({ kind: 'value', value: null })

    await m.c.dispose()
    const restarted = await mounted(s)
    expect(await restarted.choices('1')).toEqual(live)
    expect(await restarted.choices('never')).toEqual({ kind: 'value', value: null })
  })

  it('two model calls of one execution that adopt byte-identical records each get their choices', async () => {
    const { s, target, m } = await world('retained-identical')
    const opened = await openHanded(s, m.journal())
    const values = { representations: [representation('a')] }
    await adopt(s, m.journal(), opened, target, '1', values)
    const one = await m.latest()
    await adopt(s, m.journal(), opened, target, '2', { ...values, bytesOf: '1' })
    const two = await m.latest()
    if (one.kind !== 'value' || two.kind !== 'value') throw new Error('two values expected')
    expect(two.value?.reference).not.toBe(one.value?.reference)
    expect(two.value?.record).toEqual(one.value?.record)
    expect(await m.choices('1')).toEqual({ kind: 'value', value: [choiceOf('a')] })
    expect(await m.choices('2')).toEqual({ kind: 'value', value: [choiceOf('a')] })
  })
})
