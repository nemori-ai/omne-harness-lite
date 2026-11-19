import { describe, expect, it } from 'vitest'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { createTenantChanges } from '../src/model/tenant-changes.ts'
import { createFakeClient } from './fixtures/fake-client.ts'

const tenantOf = (account: string) =>
  readTenantText(
    `{"organization":"org_00000000000000000000000000","account":"acc_0000000000000000000000000${account}"}`,
  ) as TenantId
const TENANT = tenantOf('1')
const OTHER = tenantOf('2')

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function setup() {
  const fake = createFakeClient()
  const waited: number[] = []
  const changes = createTenantChanges({
    client: fake.client,
    backoff: [10, 20],
    wait: ms => {
      waited.push(ms)
      return Promise.resolve()
    },
  })
  return { fake, changes, waited }
}

describe('the changes of a tenant', () => {
  it('every view of one tenant shares one observation, and each frame tells all of them', async () => {
    const { fake, changes } = setup()
    const told: string[] = []
    changes.subscribe(TENANT, () => told.push('a'))
    changes.subscribe(TENANT, () => told.push('b'))
    const stream = await fake.nextStream()
    expect(stream.open).toEqual({ tenant: TENANT })
    stream.frame()
    await settle()
    expect(told).toEqual(['a', 'b'])
    expect(fake.streams).toHaveLength(1)
  })

  it('an ended observation is opened again after a pause, and its first frame tells the views again', async () => {
    const { fake, changes, waited } = setup()
    let told = 0
    changes.subscribe(TENANT, () => (told += 1))
    ;(await fake.nextStream()).end()
    const again = await fake.nextStream()
    expect(waited).toEqual([10])
    again.frame()
    await settle()
    expect(told).toBe(1)
  })

  it('the pause grows while openings keep failing, up to the last step, and a frame resets it', async () => {
    const { fake, changes, waited } = setup()
    changes.subscribe(TENANT, () => undefined)
    for (let ended = 0; ended < 3; ended += 1) (await fake.nextStream()).end()
    const fourth = await fake.nextStream()
    expect(waited).toEqual([10, 20, 20])
    fourth.frame()
    await settle()
    fourth.end()
    await fake.nextStream()
    expect(waited).toEqual([10, 20, 20, 10])
  })

  it('the observation is closed with its last view, and not opened again', async () => {
    const { fake, changes } = setup()
    const first = changes.subscribe(TENANT, () => undefined)
    const second = changes.subscribe(TENANT, () => undefined)
    const stream = await fake.nextStream()
    first()
    expect(stream.signal.aborted).toBe(false)
    second()
    expect(stream.signal.aborted).toBe(true)
    await settle()
    expect(fake.streams).toHaveLength(1)
    changes.subscribe(TENANT, () => undefined)
    expect((await fake.nextStream()).signal.aborted).toBe(false)
  })

  it('another tenant has its own observation', async () => {
    const { fake, changes } = setup()
    const told: string[] = []
    changes.subscribe(TENANT, () => told.push('mine'))
    changes.subscribe(OTHER, () => told.push('other'))
    const [mine, other] = [await fake.nextStream(), await fake.nextStream()]
    expect([mine.open, other.open]).toEqual([{ tenant: TENANT }, { tenant: OTHER }])
    other.frame()
    await settle()
    expect(told).toEqual(['other'])
  })
})
