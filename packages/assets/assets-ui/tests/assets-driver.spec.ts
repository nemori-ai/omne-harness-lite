import { describe, expect, it } from 'vitest'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { AssetsDriver } from '../src/model/assets-driver.ts'
import { createFakeClient } from './fixtures/fake-client.ts'

const TENANT = readTenantText(
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}',
) as TenantId
const ROW = {
  category: 'skill',
  name: 'review',
  version: 'sha256:00',
  selection: 'follow',
  enabled: true,
  holding: 'held-1',
  origin: 'customized',
  summary: null,
} as const

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

async function started() {
  const fake = createFakeClient()
  let id = 0
  const driver = new AssetsDriver({
    client: fake.client,
    tenant: TENANT,
    category: 'skill',
    newId: () => `op-${++id}`,
  })
  let told = 0
  driver.subscribe(() => (told += 1))
  driver.start()
  const category = await fake.next('describe-category')
  const list = await fake.next('list-assets')
  return { fake, driver, category, list, told: () => told }
}

async function listed() {
  const run = await started()
  run.list.answer({
    outcome: 'succeeded',
    body: { items: [ROW], next: null, completeness: 'complete' },
  })
  await settle()
  return run
}

describe('the assets driver', () => {
  it('starts by reading the category and the first page of its assets for this tenant', async () => {
    const { category, list, driver, told } = await started()
    expect(category.body).toEqual({ category: 'skill' })
    expect(list.body).toEqual({ tenant: TENANT, category: 'skill', after: null, limit: 100 })
    category.answer({
      outcome: 'succeeded',
      body: {
        category: 'skill',
        title: '技能',
        summary: '目录。',
        hint: null,
        creation: { kind: 'none' },
      },
    })
    await settle()
    expect(driver.getState().category).toMatchObject({ kind: 'read', title: '技能' })
    expect(told()).toBeGreaterThan(0)
  })

  it('disables and removes under a new operation that carries the holding', async () => {
    const { fake, driver } = await listed()
    driver.change('review', { kind: 'disable' })
    expect((await fake.next('set-asset-enabled')).body).toEqual({
      tenant: TENANT,
      operation: 'op-1',
      holding: 'held-1',
      enabled: false,
    })
  })

  it('a remove goes out as a removal of the holding', async () => {
    const { fake, driver } = await listed()
    driver.change('review', { kind: 'remove' })
    expect((await fake.next('remove-asset')).body).toEqual({
      tenant: TENANT,
      operation: 'op-1',
      holding: 'held-1',
    })
  })

  it('a call that throws was not sent', async () => {
    const { fake, driver } = await listed()
    driver.change('review', { kind: 'enable' })
    ;(await fake.next('set-asset-enabled')).fail(new Error('offline'))
    await settle()
    expect(driver.getState().actions.get('review')).toEqual({
      kind: 'refused',
      notice: { kind: 'unavailable', text: '没有发出去。' },
    })
  })

  it('an unknown change is recalled with the same operation and the same request', async () => {
    const { fake, driver } = await listed()
    driver.change('review', { kind: 'enable' })
    ;(await fake.next('set-asset-enabled')).answer({ outcome: 'unknown' })
    await settle()
    driver.dispatch({ kind: 'confirm', name: 'review' })
    expect((await fake.next('query-asset-operation')).body).toEqual({
      tenant: TENANT,
      operation: 'op-1',
      request: { kind: 'set-asset-enabled', holding: 'held-1', enabled: true },
    })
  })

  it('a recall of a removal asks about the removal', async () => {
    const { fake, driver } = await listed()
    driver.change('review', { kind: 'remove' })
    ;(await fake.next('remove-asset')).answer({ outcome: 'uncertain' })
    await settle()
    driver.dispatch({ kind: 'confirm', name: 'review' })
    expect((await fake.next('query-asset-operation')).body).toMatchObject({
      request: { kind: 'remove-asset', holding: 'held-1' },
    })
  })

  it('an opened asset is described, and once disposed an answer changes nothing and tells no one', async () => {
    const { fake, driver, told } = await listed()
    driver.dispatch({ kind: 'open', name: 'review' })
    const described = await fake.next('describe-asset')
    expect(described.body).toEqual({ tenant: TENANT, category: 'skill', name: 'review' })
    const before = driver.getState()
    const seen = told()
    driver.dispose()
    described.answer({ outcome: 'not-found', body: {} })
    await settle()
    expect(driver.getState()).toBe(before)
    expect(told()).toBe(seen)
  })
})
