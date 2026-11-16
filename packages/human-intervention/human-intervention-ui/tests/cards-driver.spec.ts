import { describe, expect, it } from 'vitest'
import { defaultBackoff } from '@omne-harness/client-assembly'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { CardsDriver } from '../src/model/cards-driver.ts'
import { CardsHub } from '../src/model/cards-hub.ts'
import { page } from './fixtures/cards.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'

const TENANT_TEXT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const TENANT = readTenantText(TENANT_TEXT) as TenantId
const OTHER_TENANT = readTenantText(
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}',
) as TenantId

type Timer = { delayMs: number; run: () => void; cancelled: boolean }

function setup() {
  const fake = createFakeClient()
  const timers: Timer[] = []
  const schedule = (delayMs: number, run: () => void) => {
    const timer = { delayMs, run, cancelled: false }
    timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }
  const driver = new CardsDriver({ client: fake.client, tenant: TENANT, schedule })
  return { fake, timers, driver }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

const lists = (fake: FakeClient) => fake.calls.filter(call => call.operation === 'list-cards')

async function answerLists(fake: FakeClient): Promise<void> {
  await settle()
  for (const call of lists(fake)) call.answer(page([]))
  await settle()
}

describe('持有与停下', () => {
  it('D1 持有数从 0 变 1 才开始：读一遍列表，建立这个租户的观察；再持有不另起', async () => {
    const { fake, driver } = setup()
    await settle()
    expect(fake.calls).toEqual([])
    expect(fake.observations).toEqual([])
    driver.retain()
    driver.retain()
    await settle()
    expect(lists(fake)).toHaveLength(1)
    expect(fake.observations).toHaveLength(1)
    expect(fake.observations[0]!.open).toEqual({ tenant: TENANT })
  })

  it('D2 持有数从 1 变 0 才停下：中止观察；同一个放手函数调两次只算一次', async () => {
    const { fake, driver } = setup()
    const first = driver.retain()
    const second = driver.retain()
    await settle()
    first()
    first()
    expect(fake.observations[0]!.signal.aborted).toBe(false)
    second()
    expect(fake.observations[0]!.signal.aborted).toBe(true)
  })

  it('D3 停下时取消等着的重连', async () => {
    const { fake, timers, driver } = setup()
    const release = driver.retain()
    await answerLists(fake)
    fake.observations[0]!.end({ kind: 'unavailable' })
    await settle()
    expect(timers).toHaveLength(1)
    release()
    expect(timers[0]!.cancelled).toBe(true)
  })

  it('D4 dispose 中止观察', async () => {
    const { fake, driver } = setup()
    driver.retain()
    await settle()
    driver.dispose()
    expect(fake.observations[0]!.signal.aborted).toBe(true)
  })

  it('D5 dispose 取消等着的重连，之后到点也不再观察', async () => {
    const { fake, timers, driver } = setup()
    driver.retain()
    await answerLists(fake)
    fake.observations[0]!.end({ kind: 'unavailable' })
    await settle()
    driver.dispose()
    expect(timers[0]!.cancelled).toBe(true)
    timers[0]!.run()
    await settle()
    expect(fake.observations).toHaveLength(1)
  })
})

describe('帧与重连', () => {
  it('F1 一帧触发一次重读', async () => {
    const { fake, driver } = setup()
    driver.retain()
    await answerLists(fake)
    expect(lists(fake)).toHaveLength(1)
    fake.observations[0]!.frame()
    await settle()
    expect(lists(fake)).toHaveLength(2)
  })

  it('F2 观察断了：按注入的 schedule 等 defaultBackoff 给的间隔，到点重读并重新观察', async () => {
    const { fake, timers, driver } = setup()
    driver.retain()
    await answerLists(fake)
    fake.observations[0]!.end({ kind: 'uncertain' })
    await settle()
    expect(timers.map(timer => timer.delayMs)).toEqual([defaultBackoff.delayMs(0)])
    expect(driver.getState().live).toEqual({ kind: 'retrying', generation: 1, attempt: 1 })
    timers[0]!.run()
    await settle()
    expect(fake.observations).toHaveLength(2)
    expect(lists(fake)).toHaveLength(2)
    expect(driver.getState().live).toEqual({ kind: 'on', generation: 2, attempt: 1 })
    fake.observations[1]!.end({ kind: 'uncertain' })
    await settle()
    expect(timers.map(timer => timer.delayMs)).toEqual([
      defaultBackoff.delayMs(0),
      defaultBackoff.delayMs(1),
    ])
  })

  it('F3 观察被拒：不重连', async () => {
    const { fake, timers, driver } = setup()
    driver.retain()
    await answerLists(fake)
    fake.observations[0]!.end({ kind: 'ended', reason: 'denied' })
    await settle()
    expect(timers).toEqual([])
    expect(driver.getState().live).toEqual({ kind: 'denied' })
  })

  it('F4 列表只取待定的卡，不带会话过滤', async () => {
    const { fake, driver } = setup()
    driver.retain()
    const call = await fake.next('list-cards')
    expect(call.body).toMatchObject({ filter: { states: ['pending'] } })
    expect((call.body as { filter: object }).filter).toEqual({ states: ['pending'] })
  })
})

describe('存放', () => {
  it('H1 同一个租户给同一个驱动，不同租户各一个；hub 停下时停下全部驱动', async () => {
    const fake = createFakeClient()
    const hub = new CardsHub({ client: fake.client })
    const one = hub.driver(TENANT)
    expect(hub.driver(readTenantText(TENANT_TEXT) as TenantId)).toBe(one)
    const other = hub.driver(OTHER_TENANT)
    expect(other).not.toBe(one)
    one.retain()
    other.retain()
    await settle()
    hub.dispose()
    expect(fake.observations.map(observation => observation.signal.aborted)).toEqual([true, true])
  })
})
