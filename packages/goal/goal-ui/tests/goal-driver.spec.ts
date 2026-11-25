import { describe, expect, it } from 'vitest'
import { GoalDriver } from '../src/model/goal-driver.ts'
import { fakeClient, goalOf, SESSION, settled, TENANT } from './fixtures/client.ts'

function driven(retryMs = 5_000) {
  const fake = fakeClient()
  const timers: { delayMs: number; run: () => void; cancelled: boolean }[] = []
  let ids = 0
  const driver = new GoalDriver({
    client: fake.client,
    tenant: TENANT,
    session: SESSION,
    newId: () => `op-${String((ids += 1))}`,
    retryMs,
    schedule: (delayMs, run) => {
      const timer = { delayMs, run, cancelled: false }
      timers.push(timer)
      return () => void (timer.cancelled = true)
    },
  })
  return { ...fake, driver, timers }
}
const WHERE = { tenant: TENANT, session: SESSION }
const namesOf = (calls: readonly [string, unknown][]) => calls.map(([name]) => name)

describe('keeping the goal of a session fresh', () => {
  it('reads nothing until somebody shows it, then reads at each frame of the server, the first one at once', async () => {
    const { driver, calls, streams } = driven()
    expect(driver.getState()).toMatchObject({ read: 'loading', goal: null })
    await settled()
    expect(calls).toEqual([])
    const release = driver.retain()
    streams[0]!.push()
    await settled()
    expect(calls).toEqual([['read-goal', WHERE]])
    expect(driver.getState()).toMatchObject({ read: 'read', goal: { state: { status: 'active' } } })
    streams[0]!.push()
    await settled()
    expect(namesOf(calls)).toEqual(['read-goal', 'read-goal'])
    release()
    expect(streams[0]!.signal.aborted).toBe(true)
  })

  it('watches once however many show it, and stops when the last lets go', async () => {
    const { driver, streams } = driven()
    const [one, two] = [driver.retain(), driver.retain()]
    await settled()
    expect(streams).toHaveLength(1)
    one()
    one()
    expect(streams[0]!.signal.aborted).toBe(false)
    two()
    expect(streams[0]!.signal.aborted).toBe(true)
  })

  it('opens the watching again after a while when the server ends it, and not once nobody shows the goal', async () => {
    const { driver, streams, timers } = driven(700)
    const release = driver.retain()
    streams[0]!.push()
    await settled()
    streams[0]!.end()
    await settled()
    expect(timers.map(timer => timer.delayMs)).toEqual([700])
    timers[0]!.run()
    await settled()
    expect(streams).toHaveLength(2)
    streams[1]!.end()
    await settled()
    release()
    expect(timers[1]!.cancelled).toBe(true)
    timers[1]!.run()
    await settled()
    expect(streams).toHaveLength(2)
  })

  it.each([
    ['denied', 'denied'],
    ['not-found', 'not-found'],
    ['basis-unavailable', 'unavailable'],
  ] as const)('says %s as it is when the goal cannot be read at first', async (outcome, read) => {
    const { driver, script, streams } = driven()
    script.read = { outcome }
    driver.retain()
    streams[0]!.push()
    await settled()
    expect(driver.getState()).toMatchObject({ read, goal: null })
  })

  it('keeps showing the goal it read when a later read fails: a goal is not taken away by a server that cannot answer', async () => {
    const { driver, script, streams } = driven()
    driver.retain()
    streams[0]!.push()
    await settled()
    script.read = new Error('offline')
    streams[0]!.push()
    await settled()
    expect(driver.getState()).toMatchObject({ read: 'read', goal: { state: { revision: 1 } } })
  })
})

describe('the commands of a person', () => {
  async function shown() {
    const all = driven()
    all.driver.retain()
    all.streams[0]!.push()
    await settled()
    all.calls.length = 0
    return all
  }

  it('names the goal the panel shows, and shows the goal the server answers', async () => {
    const { driver, calls } = await shown()
    await driver.command('pause')
    expect(calls).toEqual([
      ['command-goal', { ...WHERE, generation: 1, command: { kind: 'pause' } }],
    ])
    expect(driver.getState()).toMatchObject({
      busy: null,
      notice: null,
      goal: { state: { status: 'paused' } },
    })
    await driver.command('settle-by-exit', 'X2')
    expect(calls[1]).toEqual([
      'command-goal',
      { ...WHERE, generation: 1, command: { kind: 'settle-by-exit', exit: 'X2' } },
    ])
  })

  it('says why the state does not take it and reads the goal again', async () => {
    const { driver, script, calls } = await shown()
    script.command = { outcome: 'conflict', body: { reason: 'another-goal' } }
    script.read = { outcome: 'succeeded', body: { goal: goalOf({ generation: 2 }) } }
    await driver.command('pause')
    expect(namesOf(calls)).toEqual(['command-goal', 'read-goal'])
    expect(driver.getState()).toMatchObject({
      notice: '会话已经换了一个目标，面板重读了。',
      goal: { state: { generation: 2 } },
    })
  })

  it('does not guess after an unknown result: it says so and reads the goal', async () => {
    const { driver, script, calls } = await shown()
    script.command = { outcome: 'unknown' }
    script.read = {
      outcome: 'succeeded',
      body: { goal: goalOf({ status: 'paused', pause: { by: 'person' } }) },
    }
    await driver.command('pause')
    expect(namesOf(calls)).toEqual(['command-goal', 'read-goal'])
    expect(driver.getState()).toMatchObject({
      notice: '结果不知道。面板重读了目标，以读到的为准。',
      goal: { state: { status: 'paused' } },
    })
  })

  it.each([
    [{ outcome: 'denied' }, '你现在不能对这个会话的目标做这件事。'],
    [{ outcome: 'basis-unavailable' }, '服务端现在答不了，目标没有变。'],
    [new Error('offline'), '没有送到服务端，目标没有变。'],
  ] as const)('says what happened and leaves the goal as shown: %#', async (answer, notice) => {
    const { driver, script } = await shown()
    script.command = answer
    await driver.command('cancel')
    expect(driver.getState()).toMatchObject({
      busy: null,
      notice,
      goal: { state: { status: 'active' } },
    })
  })

  it('takes one command at a time, and none while no goal is shown', async () => {
    const { driver, calls } = await shown()
    await Promise.all([driver.command('pause'), driver.command('cancel')])
    expect(namesOf(calls)).toEqual(['command-goal'])
    const empty = driven()
    await empty.driver.command('pause')
    expect(empty.calls).toEqual([])
  })
})

describe('a direct edit', () => {
  const CHANGES = [{ op: 'purpose', text: '只降首页' }]
  async function shown() {
    const all = driven()
    all.driver.retain()
    all.streams[0]!.push()
    await settled()
    all.calls.length = 0
    return all
  }

  it('is written under an operation of its own, and the goal the server answers is shown', async () => {
    const { driver, calls } = await shown()
    expect(await driver.revise(CHANGES)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject([
      'write-goal',
      { ...WHERE, operation: 'op-1', proposal: { kind: 'revise' }, words: null },
    ])
    expect(driver.getState()).toMatchObject({ goal: { state: { revision: 2 } }, issues: [] })
  })

  it('shows what is wrong by entry and field, and leaves the goal as it was', async () => {
    const { driver, script } = await shown()
    const issues = [{ entry: 'A1', field: 'statement', problem: 'empty' }]
    script.write = { outcome: 'invalid', body: { issues } }
    expect(await driver.revise(CHANGES)).toBe(false)
    expect(driver.getState()).toMatchObject({ issues, goal: { state: { revision: 1 } } })
    driver.dismiss()
    expect(driver.getState()).toMatchObject({ issues: [], notice: null })
  })

  it.each([{ outcome: 'unknown' }, new Error('offline')] as const)(
    'is asked after by the same operation when its result is not known, and never written twice: %#',
    async answer => {
      const { driver, script, calls } = await shown()
      script.write = answer
      script.query = { outcome: 'succeeded', body: { goal: goalOf({ revision: 2 }) } }
      expect(await driver.revise(CHANGES)).toBe(true)
      expect(namesOf(calls)).toEqual(['write-goal', 'query-write-goal'])
      expect(calls[1]![1]).toEqual(calls[0]![1])
      script.query = { outcome: 'not-committed', body: {} }
      expect(await driver.revise(CHANGES)).toBe(false)
      expect(driver.getState().notice).toBe('这次修改没有写下，可以再提交一次。')
      expect(namesOf(calls).filter(name => name === 'write-goal')).toHaveLength(2)
    },
  )

  it('says so when neither the write nor its query can tell, and reads the goal', async () => {
    const { driver, script, calls } = await shown()
    script.write = { outcome: 'unknown' }
    script.query = { outcome: 'basis-unavailable' }
    expect(await driver.revise(CHANGES)).toBe(false)
    expect(namesOf(calls)).toEqual(['write-goal', 'query-write-goal', 'read-goal'])
    expect(driver.getState().notice).toBe('结果不知道。面板重读了目标，以读到的为准。')
  })

  it('says why the state does not take it', async () => {
    const { driver, script } = await shown()
    script.write = { outcome: 'conflict', body: { reason: 'nobody-attends' } }
    expect(await driver.revise(CHANGES)).toBe(false)
    expect(driver.getState().notice).toBe('这个会话无人值守，它的目标只能由建它的一方改。')
  })
})
