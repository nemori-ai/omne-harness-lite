import { describe, expect, it } from 'vitest'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { createGovernance } from '../src/model/governance.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { permissionView, secretView, SHELL_ASSET } from './fixtures/views.ts'
import type { AssetEntry, CategorySnapshot } from '../src/model/governance.ts'

const TENANT_TEXT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const tenantOf = (text: string): TenantId => {
  const tenant = readTenantText(text)
  if (tenant === undefined) throw new Error(`not a tenant: ${text}`)
  return tenant
}
const TENANT = tenantOf(TENANT_TEXT)
const OTHER_TENANT = tenantOf(
  TENANT_TEXT.replace('acc_00000000000000000000000001', 'acc_00000000000000000000000002'),
)
const MCP_VIEW = permissionView({ owner: { kind: 'asset', category: 'mcp', name: 'context7' } })
const SHELL_VIEW = permissionView()
const ASSETS = { kind: 'asset' }

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function page(items: readonly unknown[], next: string | null = null, completeness = 'complete') {
  return { outcome: 'succeeded', body: { items, next, completeness } }
}

function setup() {
  const fake = createFakeClient()
  let id = 0
  const governance = createGovernance({ client: fake.client, newId: () => `op-${++id}` })
  return { fake, governance }
}

describe('the governance port: one category of one tenant', () => {
  it('reads first, then gives only the assets of the category it was opened for', async () => {
    const { fake, governance } = setup()
    const mcp = governance.open(TENANT, 'mcp')
    expect(mcp.getSnapshot()).toEqual({ kind: 'reading' })
    const list = await fake.next('list-settings')
    expect(list.body).toEqual({ tenant: TENANT, scope: ASSETS, after: null, limit: 100 })
    list.answer(page([SHELL_VIEW, MCP_VIEW]))
    await settle()
    const snapshot = mcp.getSnapshot()
    expect(snapshot.kind).toBe('read')
    if (snapshot.kind !== 'read') return
    expect(snapshot.partial).toBe(false)
    expect(snapshot.holdings.map(holding => [holding.category, holding.name])).toEqual([
      ['mcp', 'context7'],
    ])
  })

  it('a list that cannot be read is unreadable with its reason, and gives no asset at all', async () => {
    const { fake, governance } = setup()
    const mcp = governance.open(TENANT, 'mcp')
    ;(await fake.next('list-settings')).answer({ outcome: 'unavailable' })
    await settle()
    expect(mcp.getSnapshot()).toEqual({
      kind: 'unreadable',
      notice: { kind: 'unavailable', text: '没有发出去。' },
    })
  })

  it('a partial page marks the whole list as not complete', async () => {
    const { fake, governance } = setup()
    const mcp = governance.open(TENANT, 'mcp')
    ;(await fake.next('list-settings')).answer(page([MCP_VIEW], 'cursor-1', 'partial'))
    expect(mcp.getSnapshot()).toEqual({ kind: 'reading' })
    ;(await fake.next('list-settings')).answer(page([]))
    await settle()
    expect(mcp.getSnapshot()).toMatchObject({ kind: 'read', partial: true })
  })

  it('two categories of one tenant opened at once read the list once', async () => {
    const { fake, governance } = setup()
    const mcp = governance.open(TENANT, 'mcp')
    const tool = governance.open(TENANT, 'tool')
    ;(await fake.next('list-settings')).answer(page([SHELL_VIEW, MCP_VIEW]))
    await settle()
    expect(fake.calls.filter(call => call.operation === 'list-settings')).toHaveLength(1)
    const names = (snapshot: ReturnType<typeof mcp.getSnapshot>) =>
      snapshot.kind === 'read' ? snapshot.holdings.map(holding => holding.name) : []
    expect(names(mcp.getSnapshot())).toEqual(['context7'])
    expect(names(tool.getSnapshot())).toEqual([SHELL_ASSET.name])
  })

  it('the same tenant read from its text twice is one tenant: one read, one state', async () => {
    const { fake, governance } = setup()
    const fromPage = governance.openAll(tenantOf(TENANT_TEXT))
    const fromPort = governance.open(tenantOf(TENANT_TEXT), 'mcp')
    ;(await fake.next('list-settings')).answer(page([SHELL_VIEW, MCP_VIEW]))
    await settle()
    expect(fake.calls.filter(call => call.operation === 'list-settings')).toHaveLength(1)
    expect(fromPage.getSnapshot()).toMatchObject({ kind: 'read' })
    expect(fromPort.getSnapshot()).toMatchObject({ kind: 'read' })
  })

  it('gives the same snapshot object while nothing changed, and tells subscribers when it does', async () => {
    const { fake, governance } = setup()
    const mcp = governance.open(TENANT, 'mcp')
    let told = 0
    mcp.subscribe(() => told++)
    expect(mcp.getSnapshot()).toBe(mcp.getSnapshot())
    ;(await fake.next('list-settings')).answer(page([MCP_VIEW]))
    await settle()
    expect(told).toBe(1)
    expect(mcp.getSnapshot()).toBe(mcp.getSnapshot())
  })

  it('once the last view of a tenant closes, a late answer counts for nothing; opening again reads again', async () => {
    const { fake, governance } = setup()
    const first = governance.open(TENANT, 'mcp')
    const list = await fake.next('list-settings')
    let told = 0
    first.subscribe(() => told++)
    first.close()
    list.answer(page([MCP_VIEW]))
    await settle()
    expect(told).toBe(0)
    const again = governance.open(TENANT, 'mcp')
    expect(again.getSnapshot()).toEqual({ kind: 'reading' })
    await settle()
    expect(fake.calls.filter(call => call.operation === 'list-settings')).toHaveLength(2)
  })

  it('another tenant has its own read, and answers for the first never reach it', async () => {
    const { fake, governance } = setup()
    const a = governance.open(TENANT, 'mcp')
    const b = governance.open(OTHER_TENANT, 'mcp')
    const [listA, listB] = [await fake.next('list-settings'), await fake.next('list-settings')]
    expect([listA.body, listB.body]).toEqual([
      { tenant: TENANT, scope: ASSETS, after: null, limit: 100 },
      { tenant: OTHER_TENANT, scope: ASSETS, after: null, limit: 100 },
    ])
    listA.answer(page([MCP_VIEW]))
    await settle()
    expect(a.getSnapshot().kind).toBe('read')
    expect(b.getSnapshot()).toEqual({ kind: 'reading' })
  })
})

describe('the governance port: one write, by the table of one submission', () => {
  async function opened() {
    const { fake, governance } = setup()
    const mcp = governance.open(TENANT, 'mcp')
    const secretSetting = secretView({ owner: MCP_VIEW.owner, editable: { kind: 'yes' } })
    ;(await fake.next('list-settings')).answer(page([MCP_VIEW, secretSetting]))
    await settle()
    const snapshot = mcp.getSnapshot()
    if (snapshot.kind !== 'read') throw new Error('not read')
    const [permission, secret] = snapshot.holdings[0]!.rows
    return { fake, mcp, permissionKey: permission!.key, secretKey: secret!.key }
  }

  it('a change goes out once with a new operation; while it is out the row cannot send again', async () => {
    const { fake, mcp, permissionKey } = await opened()
    mcp.set(permissionKey, 'auto')
    mcp.set(permissionKey, 'deny')
    await settle()
    const writes = fake.calls.filter(call => call.operation === 'set-setting')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.body).toMatchObject({
      operation: 'op-1',
      value: { kind: 'permission', pick: 'auto' },
    })
    expect(writes[0]?.options).toEqual({ messageId: 'op-1' })
  })

  it('an unknown result is asked about with the same operation, not sent again as a new one', async () => {
    const { fake, mcp, permissionKey } = await opened()
    mcp.set(permissionKey, 'auto')
    ;(await fake.next('set-setting')).answer({ outcome: 'unknown' })
    await settle()
    mcp.confirm(permissionKey)
    const again = await fake.next('set-setting')
    expect(again.body).toMatchObject({ operation: 'op-1' })
    expect(again.options).toEqual({ messageId: 'op-1' })
  })

  it('a row that could not be read again is read again on retry', async () => {
    const { fake, mcp, permissionKey } = await opened()
    mcp.set(permissionKey, 'auto')
    ;(await fake.next('set-setting')).answer({ outcome: 'succeeded', body: { revision: '2' } })
    ;(await fake.next('describe-setting')).answer({ outcome: 'unavailable' })
    await settle()
    mcp.retryRow(permissionKey)
    expect((await fake.next('describe-setting')).body).toMatchObject({ item: MCP_VIEW.item })
  })

  it('clearing a setting goes out as a clear with its own operation', async () => {
    const { fake, mcp, permissionKey } = await opened()
    mcp.clear(permissionKey)
    const clear = await fake.next('clear-setting')
    expect(clear.body).toMatchObject({ tenant: TENANT, item: MCP_VIEW.item, operation: 'op-1' })
  })

  it('a secret goes out in the write only; its value is never in a snapshot', async () => {
    const { fake, mcp, secretKey } = await opened()
    mcp.setSecret(secretKey, 'sk-very-secret')
    const write = await fake.next('set-setting')
    expect(write.body).toMatchObject({ value: { kind: 'secret', secret: 'sk-very-secret' } })
    expect(JSON.stringify(mcp.getSnapshot())).not.toContain('sk-very-secret')
    write.answer({ outcome: 'unknown' })
    await settle()
    expect(JSON.stringify(mcp.getSnapshot())).not.toContain('sk-very-secret')
  })
})

describe('the governance port: the assets of a category, and changes made elsewhere', () => {
  const count = (fake: ReturnType<typeof createFakeClient>, operation: string) =>
    fake.calls.filter(call => call.operation === operation).length

  const assetRow = (name: string, category = 'tool') => ({
    category,
    name,
    version: 'sha256:00',
    selection: 'follow',
    enabled: true,
    holding: `held-${name}`,
    origin: 'customized',
    summary: null,
  })
  const assetsIn = (view: { getSnapshot: () => CategorySnapshot }) => {
    const snapshot = view.getSnapshot()
    if (snapshot.kind !== 'read') throw new Error(`snapshot is ${snapshot.kind}`)
    return snapshot.assets
  }
  const entriesIn = (view: { getSnapshot: () => CategorySnapshot }): readonly AssetEntry[] => {
    const assets = assetsIn(view)
    return assets.kind === 'read' ? assets.entries : []
  }
  const CREATION = { kind: 'data', schema: { type: 'object' } }

  async function read(
    fake: ReturnType<typeof createFakeClient>,
    settings: readonly unknown[],
    assets: readonly unknown[],
  ) {
    ;(await fake.next('list-settings')).answer(page(settings))
    ;(await fake.next('list-assets')).answer(page(assets))
    await settle()
  }

  it('the snapshot lists the assets of the category, each with its own settings, and how it creates one', async () => {
    const { fake, governance } = setup()
    const tool = governance.open(TENANT, 'tool')
    ;(await fake.next('describe-category')).answer({
      outcome: 'succeeded',
      body: { category: 'tool', title: '工具', summary: '', hint: null, creation: CREATION },
    })
    await read(fake, [SHELL_VIEW, MCP_VIEW], [assetRow('files'), assetRow('shell')])
    const snapshot = tool.getSnapshot()
    expect(snapshot).toMatchObject({ kind: 'read', creation: CREATION })
    expect(assetsIn(tool)).toMatchObject({ kind: 'read', partial: false })
    expect(entriesIn(tool).map(entry => [entry.row.name, entry.settings.length])).toEqual([
      ['files', 0],
      ['shell', 1],
    ])
  })

  it('the join: a listed asset without settings is there with none; settings whose asset is not listed are not', async () => {
    const { fake, governance } = setup()
    const tool = governance.open(TENANT, 'tool')
    await read(fake, [SHELL_VIEW], [assetRow('files')])
    expect(assetsIn(tool)).toEqual({
      kind: 'read',
      partial: false,
      entries: [{ row: assetRow('files'), settings: [], detail: null, action: { kind: 'none' } }],
    })
  })

  it('settings read but assets not yet: the assets are reading; assets unreadable: said with the reason', async () => {
    const { fake, governance } = setup()
    const tool = governance.open(TENANT, 'tool')
    ;(await fake.next('list-settings')).answer(page([SHELL_VIEW]))
    await settle()
    expect(assetsIn(tool)).toEqual({ kind: 'reading' })
    ;(await fake.next('list-assets')).answer({ outcome: 'denied' })
    await settle()
    expect(assetsIn(tool)).toEqual({
      kind: 'unreadable',
      notice: { kind: 'refused', text: '没有权限，或登录已失效。' },
    })
    tool.read()
    await settle()
    expect(count(fake, 'list-assets')).toBe(2)
    expect(count(fake, 'list-settings')).toBe(1)
  })

  it('two views of one category share one reading of its assets and one snapshot of them', async () => {
    const { fake, governance } = setup()
    const first = governance.open(TENANT, 'skill')
    const second = governance.open(TENANT, 'skill')
    await read(fake, [], [])
    expect(fake.calls.find(call => call.operation === 'list-assets')?.body).toEqual({
      tenant: TENANT,
      category: 'skill',
      after: null,
      limit: 100,
    })
    expect(count(fake, 'list-assets')).toBe(1)
    expect(count(fake, 'describe-category')).toBe(1)
    expect(assetsIn(first)).toEqual(assetsIn(second))
  })

  it('an asset change tells subscribers once and gives a new snapshot, then the same one while nothing changes', async () => {
    const { fake, governance } = setup()
    const tool = governance.open(TENANT, 'tool')
    let told = 0
    tool.subscribe(() => told++)
    ;(await fake.next('list-settings')).answer(page([]))
    await settle()
    const before = tool.getSnapshot()
    told = 0
    ;(await fake.next('list-assets')).answer(page([assetRow('files')]))
    await settle()
    expect(told).toBe(1)
    expect(tool.getSnapshot()).not.toBe(before)
    expect(tool.getSnapshot()).toBe(tool.getSnapshot())
  })

  it('opening and changing an asset show in its entry', async () => {
    const { fake, governance } = setup()
    const tool = governance.open(TENANT, 'tool')
    await read(fake, [], [assetRow('files')])
    tool.openAsset('files')
    tool.setEnabled('files', false)
    expect((await fake.next('set-asset-enabled')).body).toMatchObject({
      holding: 'held-files',
      enabled: false,
    })
    expect(entriesIn(tool)[0]).toMatchObject({
      detail: { kind: 'reading' },
      action: { kind: 'submitting' },
    })
  })

  it('the opening frame and every later one read the settings and the assets again', async () => {
    const { fake, governance } = setup()
    governance.open(TENANT, 'skill')
    await read(fake, [], [])
    const stream = await fake.nextStream()
    expect(stream.open).toEqual({ tenant: TENANT })
    stream.frame()
    await settle()
    expect(count(fake, 'list-settings')).toBe(2)
    expect(count(fake, 'list-assets')).toBe(2)
    for (let frame = 0; frame < 5; frame += 1) stream.frame()
    await settle()
    expect(count(fake, 'list-settings')).toBe(2)
    expect(count(fake, 'list-assets')).toBe(2)
    await read(fake, [], [])
    await settle()
    expect(count(fake, 'list-settings')).toBe(3)
    expect(count(fake, 'list-assets')).toBe(3)
  })

  it('the view of all categories reads no assets and says so', async () => {
    const { fake, governance } = setup()
    const all = governance.openAll(TENANT)
    ;(await fake.next('list-settings')).answer(page([SHELL_VIEW]))
    await settle()
    expect(count(fake, 'list-assets')).toBe(0)
    expect(assetsIn(all)).toMatchObject({ kind: 'unreadable' })
  })

  it('once the last view closes, the observation of the tenant is closed', async () => {
    const { fake, governance } = setup()
    const skill = governance.open(TENANT, 'skill')
    const stream = await fake.nextStream()
    skill.close()
    expect(stream.signal.aborted).toBe(true)
  })
})
