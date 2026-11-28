import { expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { EndpointHolding, EndpointName, EndpointRef } from '@omne-harness/mcp-contract'
import type { GrantKey, HoldingRows, KeptHolding } from '@omne-harness/mcp-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import { sweepingRemoved } from '../../../src/rows/mcp/removed-holdings.ts'

function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

const home = tenantOf('s')
const ref = (name: string, holding: string): EndpointRef => ({
  name: name as EndpointName,
  holding: holding as EndpointHolding,
})
const kept = (holding: string, grants: string[] = []): KeptHolding => ({
  holding: holding as EndpointHolding,
  grants,
})
const settled = () => new Promise(resolve => setTimeout(resolve, 5))

function worldOf(rows: KeptHolding[], held: EndpointRef[]) {
  const world = {
    rows,
    held: held as EndpointRef[] | 'unknown',
    keptFails: false,
    endFails: false,
    lists: 0,
    forgot: [] as string[],
    ended: [] as GrantKey[],
  }
  const store: HoldingRows = {
    async kept() {
      world.lists += 1
      return world.keptFails ? fail('unavailable') : succeed(world.rows)
    },
    async forget(_tenant, holding) {
      world.forgot.push(holding)
      world.rows = world.rows.filter(row => row.holding !== holding)
      return succeed(true)
    },
  }
  const read = sweepingRemoved(
    async () => (world.held === 'unknown' ? fail('unknown') : succeed(world.held)),
    () => store,
    async key => {
      if (world.endFails) return fail('unavailable')
      world.ended.push(key)
      return succeed(true)
    },
  )
  return { world, read }
}

it('C206 on the first read of a tenant, a holding with rows that is not held loses its rows and its grant; a held one keeps them', async () => {
  const { world, read } = worldOf([kept('h-old', ['desk']), kept('h-1')], [ref('docs', 'h-1')])
  expect(await read(home)).toEqual({ ok: [ref('docs', 'h-1')] })
  await settled()
  expect(world.ended).toEqual([{ tenant: home, holding: 'h-old', endpoint: 'desk' }])
  expect(world.forgot).toEqual(['h-old'])
})

it('reads that hold the same holdings do not sweep again; a removal does', async () => {
  const { world, read } = worldOf([kept('h-1', ['docs'])], [ref('docs', 'h-1')])
  await read(home)
  await settled()
  await read(home)
  await settled()
  expect(world.lists).toBe(1)
  expect(world.forgot).toEqual([])
  world.held = []
  await read(home)
  await settled()
  expect(world.lists).toBe(2)
  expect(world.forgot).toEqual(['h-1'])
  expect(world.ended).toEqual([{ tenant: home, holding: 'h-1', endpoint: 'docs' }])
})

it('when another holding now holds the endpoint name, the old rows go and the secrets stay for it', async () => {
  const { world, read } = worldOf([kept('h-old', ['desk'])], [ref('desk', 'h-new')])
  await read(home)
  await settled()
  expect(world.ended).toEqual([])
  expect(world.forgot).toEqual(['h-old'])
})

it('nothing is forgotten when the rows cannot be listed or a grant cannot be ended, and the next read tries again', async () => {
  const { world, read } = worldOf([kept('h-old', ['desk'])], [])
  world.keptFails = true
  await read(home)
  await settled()
  expect(world.forgot).toEqual([])
  world.keptFails = false
  world.endFails = true
  await read(home)
  await settled()
  expect(world.forgot).toEqual([])
  world.endFails = false
  await read(home)
  await settled()
  expect(world.lists).toBe(3)
  expect(world.forgot).toEqual(['h-old'])
})

it('a read of what is held that is not known is answered as it is and sweeps nothing', async () => {
  const { world, read } = worldOf([kept('h-old')], [])
  world.held = 'unknown'
  expect(await read(home)).toEqual({ failure: 'unknown' })
  await settled()
  expect(world.lists).toBe(0)
  expect(world.forgot).toEqual([])
})
