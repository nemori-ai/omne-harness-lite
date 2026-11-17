import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/public-contract'
import { createGovernance } from '../src/model/governance.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { permissionView, secretView, SHELL_ASSET } from './fixtures/views.ts'

const TENANT = 'tenant-a' as TenantId
const OTHER_TENANT = 'tenant-b' as TenantId
const MCP_VIEW = permissionView({ asset: { category: 'mcp', name: 'context7' } })
const SHELL_VIEW = permissionView()

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
    expect(list.body).toEqual({ tenant: TENANT, after: null, limit: 100 })
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
      { tenant: TENANT, after: null, limit: 100 },
      { tenant: OTHER_TENANT, after: null, limit: 100 },
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
    const secretSetting = secretView({ asset: MCP_VIEW.asset, editable: { kind: 'yes' } })
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
