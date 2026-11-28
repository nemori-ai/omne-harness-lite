// @module-tag slow — the core and the local transport follow the SDK's 2026-07-28 server on a local port.
import { afterEach, expect, it } from 'vitest'
import { endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { changingServer } from '../fixtures/sdk/changing-http.ts'
import { ALICE, assemble } from './assembly.ts'

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(closers.splice(0).map(close => close()))
})

const until = async (check: () => boolean, ms = 10_000): Promise<boolean> => {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20))
  return check()
}

it('C107 after a refresh the core listens on the connection; a change the peer tells is taken and published without another refresh', async () => {
  const peer = await changingServer(['read'])
  closers.push(peer.close)
  const { services, adopt } = assemble()
  closers.push(async () => {
    await services.connections.closeAll()
  })
  const ref = endpointRefOf('follow')
  adopt(ref, peer.target)
  const heard: string[] = []
  services.status.subscribe({ changed: () => heard.push('changed'), closed: () => undefined })
  expect(await services.discovery.refresh(ALICE, { ref })).toMatchObject({
    ok: { kind: 'published' },
  })
  expect(await until(() => peer.asked.get('subscriptions/listen') === 1)).toBe(true)
  const names = async () => {
    const current = await services.discovery.current(ALICE, ref)
    return 'ok' in current && current.ok.kind === 'acquired'
      ? current.ok.actions.map(action => action.name)
      : []
  }
  expect(await names()).toEqual(['read'])
  peer.offer(['read', 'write'])
  expect(await until(() => heard.length === 2)).toBe(true)
  expect(await names()).toEqual(['read', 'write'])
  expect(peer.asked.get('tools/list')).toBe(2)
  expect(peer.asked.get('subscriptions/listen')).toBe(1)
})
