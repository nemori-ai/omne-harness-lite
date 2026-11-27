import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { EndpointHolding, EndpointName, EndpointRef } from '@omne-harness/mcp-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { createCallbackReceiver } from '../../../src/rows/mcp/callback-receiver.ts'
import { forgettingRemoved } from '../../../src/rows/mcp/oauth.ts'
import { freePort } from './auth-server.ts'

function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

const reachable = (url: string) =>
  fetch(url).then(
    response => response.status,
    () => 'closed' as const,
  )

it('listens only after a connection began, answers only its callback path, and closes when nothing waits any more', async () => {
  const port = await freePort()
  let waiting = true
  const answers: string[] = []
  const receiver = createCallbackReceiver({
    port,
    now: () => Date.now(),
    awaiting: () => waiting,
    answer: async query => {
      answers.push(query.state ?? '')
      return query.state === 'good' ? 'connected' : 'not-connected'
    },
  })
  const base = `http://127.0.0.1:${String(port)}`
  expect(await reachable(`${base}/callback`)).toBe('closed')
  expect(await receiver.open(Date.now() + 60_000)).toEqual({ ok: `${base}/callback` })
  expect(await reachable(`${base}/other`)).toBe(404)
  const forged = await fetch(`${base}/callback?state=forged&code=c`)
  expect(await forged.text()).toContain('没有连上')
  expect(receiver.listening()).toBe(true)
  waiting = false
  const good = await fetch(`${base}/callback?state=good&code=c&iss=x`)
  const page = await good.text()
  expect(page).toContain('连上了')
  expect(page).not.toContain('good')
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(receiver.listening()).toBe(false)
  expect(answers).toEqual(['forged', 'good'])
  await receiver.close()
})

it('closes by itself when the last connection it was opened for runs out, and refuses to open on a port in use', async () => {
  const port = await freePort()
  const receiver = createCallbackReceiver({
    port,
    now: () => Date.now(),
    awaiting: () => true,
    answer: async () => 'not-connected',
  })
  await receiver.open(Date.now() + 30)
  expect(receiver.listening()).toBe(true)
  await new Promise(resolve => setTimeout(resolve, 80))
  expect(receiver.listening()).toBe(false)
  const taken = createServer()
  await new Promise<void>(resolve => taken.listen(port, '127.0.0.1', resolve))
  try {
    expect(await receiver.open(Date.now() + 60_000)).toEqual({ failure: 'unavailable' })
  } finally {
    await new Promise(resolve => taken.close(resolve))
    await receiver.close()
  }
})

it('a holding that is no longer held loses its grant at the next read of the tenant; an unreadable read forgets nothing', async () => {
  const home = tenantOf('s')
  const ref = (name: string, holding: string): EndpointRef => ({
    name: name as EndpointName,
    holding: holding as EndpointHolding,
  })
  let now: EndpointRef[] | 'unknown' = [ref('desk', 'h-1'), ref('docs', 'h-2')]
  const ended: unknown[] = []
  const held = forgettingRemoved(async () => (now === 'unknown' ? fail('unknown') : succeed(now)), {
    disconnect: async key => (ended.push(key), succeed(true)),
  })
  await held(home)
  expect(ended).toEqual([])
  now = 'unknown'
  await held(home)
  expect(ended).toEqual([])
  now = [ref('docs', 'h-2'), ref('desk', 'h-3')]
  await held(home)
  expect(ended).toEqual([{ tenant: home, holding: 'h-1', endpoint: 'desk' }])
})
