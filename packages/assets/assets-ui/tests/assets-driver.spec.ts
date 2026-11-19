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

describe('the assets driver creating', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)
  const PUBLISHED = { outcome: 'succeeded', body: { version: 'v', holding: 'h', changed: true } }

  it('a data body goes out in one call under a new operation', async () => {
    const { fake, driver } = await listed()
    driver.create({ kind: 'data', name: 'notes', body: { kind: 'null' } })
    expect((await fake.next('create-asset')).body).toEqual({
      tenant: TENANT,
      operation: 'op-1',
      category: 'skill',
      name: 'notes',
      body: { kind: 'null' },
    })
  })

  it('a directory: begin, then parts of the answered size from what the server has, then commit, all under one operation', async () => {
    const { fake, driver } = await listed()
    const files = [
      { path: 'SKILL.md', bytes: bytes('0123456789') },
      { path: 'a.txt', bytes: bytes('abc') },
    ]
    driver.create(
      {
        kind: 'directory',
        name: 'review',
        manifest: files.map(file => ({ path: file.path, bytes: file.bytes.length })),
      },
      files,
    )
    const begin = await fake.next('begin-asset-upload')
    expect(begin.body).toMatchObject({ operation: 'op-1', name: 'review' })
    begin.answer({
      outcome: 'succeeded',
      body: { partBytes: 4, received: [{ path: 'SKILL.md', bytes: 2 }] },
    })
    const sent: [string, number, string][] = []
    for (;;) {
      const append = await fake.next('append-asset-upload')
      const {
        path,
        offset,
        bytes: part,
        upload,
      } = append.body as {
        path: string
        offset: number
        bytes: Uint8Array
        upload: string
      }
      expect(upload).toBe('op-1')
      sent.push([path, offset, new TextDecoder().decode(part)])
      append.answer({ outcome: 'succeeded', body: { received: offset + part.length } })
      if (path === 'a.txt') break
    }
    expect(sent).toEqual([
      ['SKILL.md', 2, '2345'],
      ['SKILL.md', 6, '6789'],
      ['a.txt', 0, 'abc'],
    ])
    const commit = await fake.next('commit-asset-upload')
    expect(driver.getState().creating).toMatchObject({ kind: 'sending', received: 13 })
    expect(commit.body).toEqual({ tenant: TENANT, upload: 'op-1' })
    commit.answer(PUBLISHED)
    await settle()
    expect(driver.getState().creating).toEqual({ kind: 'done', text: '已成为 review 的新版本。' })
  })

  it('a part the server does not move past stops the upload before the commit', async () => {
    const { fake, driver } = await listed()
    const files = [{ path: 'SKILL.md', bytes: bytes('0123') }]
    driver.create(
      { kind: 'directory', name: 'review', manifest: [{ path: 'SKILL.md', bytes: 4 }] },
      files,
    )
    ;(await fake.next('begin-asset-upload')).answer({
      outcome: 'succeeded',
      body: { partBytes: 8, received: [] },
    })
    ;(await fake.next('append-asset-upload')).answer({
      outcome: 'succeeded',
      body: { received: 0 },
    })
    await settle()
    expect(driver.getState().creating).toMatchObject({
      kind: 'refused',
      notice: { text: '上传没有往前走，没有新建。' },
    })
    expect(fake.calls.some(call => call.operation === 'commit-asset-upload')).toBe(false)
  })

  it('a refused begin sends no part; its reason is what the slot shows', async () => {
    const { fake, driver } = await listed()
    driver.create(
      { kind: 'directory', name: 'review', manifest: [{ path: 'SKILL.md', bytes: 4 }] },
      [{ path: 'SKILL.md', bytes: bytes('0123') }],
    )
    ;(await fake.next('begin-asset-upload')).answer({
      outcome: 'invalid',
      body: { reason: '缺 SKILL.md' },
    })
    await settle()
    expect(driver.getState().creating).toMatchObject({
      kind: 'refused',
      notice: { text: '服务端没有收下：缺 SKILL.md。' },
    })
    expect(fake.calls.some(call => call.operation === 'append-asset-upload')).toBe(false)
  })

  it('a refused part stops the upload before the commit', async () => {
    const { fake, driver } = await listed()
    driver.create(
      { kind: 'directory', name: 'review', manifest: [{ path: 'SKILL.md', bytes: 4 }] },
      [{ path: 'SKILL.md', bytes: bytes('0123') }],
    )
    ;(await fake.next('begin-asset-upload')).answer({
      outcome: 'succeeded',
      body: { partBytes: 8, received: [] },
    })
    ;(await fake.next('append-asset-upload')).answer({ outcome: 'not-found', body: {} })
    await settle()
    expect(driver.getState().creating).toMatchObject({
      kind: 'refused',
      notice: { text: '这次上传已经过期或不在了，没有新建。请重新提交。' },
    })
    expect(fake.calls.some(call => call.operation === 'commit-asset-upload')).toBe(false)
  })

  it('an unknown directory creation is recalled as its commit; a data one with its body', async () => {
    const { fake, driver } = await listed()
    driver.create({ kind: 'data', name: 'notes', body: { kind: 'null' } })
    ;(await fake.next('create-asset')).answer({ outcome: 'unknown' })
    await settle()
    driver.dispatch({ kind: 'confirm-create' })
    expect((await fake.next('query-asset-operation')).body).toEqual({
      tenant: TENANT,
      operation: 'op-1',
      request: { kind: 'create-asset', category: 'skill', name: 'notes', body: { kind: 'null' } },
    })
  })
})
