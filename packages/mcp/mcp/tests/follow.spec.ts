import { expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ListenEnd, ListenEvent, ListenFilter } from '@omne-harness/mcp-contract/provider'
import { endpointRefOf, millisOf } from '@omne-harness/mcp-contract/testing'
import { assemble } from '../src/internal/assembly.ts'
import { createChangeFeed } from '../src/internal/changes.ts'
import { coalesced } from '../src/internal/follow.ts'
import { alice, home } from './doubles/identities.ts'
import { listing, peer } from './doubles/peer.ts'
import { reshapedTransports } from './doubles/transports.ts'
import { adoptHttp } from './doubles/world.ts'

type Listened = Readonly<{
  filter: ListenFilter
  signal: AbortSignal
  observe: (event: ListenEvent) => void
  end: (end: ListenEnd) => void
}>

const files = endpointRefOf('files')
const settle = () => new Promise(resolve => setTimeout(resolve, 5))
const ACK = (toolsListChanged: boolean): ListenEvent => ({
  kind: 'acknowledged',
  agreed: { toolsListChanged },
})

// A peer whose second and third listings carry one more action each; its long requests end when the test says.
function arranged(
  settings: Parameters<typeof adoptHttp>[2] = { auth: 'none' },
  pause: (ms: number) => Promise<void> = async () => undefined,
) {
  const p = peer({
    listing: {
      '': [
        listing([{ name: 'read' }]),
        listing([{ name: 'read' }, { name: 'write' }]),
        listing([{ name: 'read' }, { name: 'write' }, { name: 'list' }]),
      ],
    },
  })
  adoptHttp(p, files, settings)
  const listens: Listened[] = []
  const pauses: number[] = []
  const transports = reshapedTransports(p.ports.transports, () => ({
    listen(filter, signal, observe) {
      return new Promise<ListenEnd>(end => {
        listens.push({ filter, signal, observe, end })
        signal.addEventListener('abort', () => end({ kind: 'stopped' }), { once: true })
      })
    },
  }))
  const { services } = assemble({ ...p.ports, transports }, p.config, undefined, async ms => {
    pauses.push(ms)
    await pause(ms)
  })
  const heard: TenantId[] = []
  services.status.subscribe({ changed: tenant => heard.push(tenant), closed: () => undefined })
  const names = async () => {
    const current = await services.discovery.current(alice, files)
    return 'ok' in current && current.ok.kind === 'acquired'
      ? current.ok.actions.map(action => action.name)
      : []
  }
  return { p, services, listens, pauses, heard, names }
}

it('follows the changes of the tools on a connection: a change takes the catalog once and publishes it (C107)', async () => {
  const { services, listens, heard, names } = arranged()
  expect(await services.discovery.refresh(alice, { ref: files })).toMatchObject({
    ok: { kind: 'published' },
  })
  await settle()
  expect(listens.map(listened => listened.filter)).toEqual([{ toolsListChanged: true }])
  expect(heard).toEqual([home])
  listens[0]?.observe(ACK(true))
  expect(listens[0]?.signal.aborted).toBe(false)
  listens[0]?.observe({ kind: 'tools-changed' })
  await settle()
  expect(await names()).toEqual(['read', 'write'])
  expect(heard).toEqual([home, home])
  expect(await services.discovery.refresh(alice, { ref: files })).toMatchObject({
    ok: { kind: 'published' },
  })
  await settle()
  expect(listens).toHaveLength(1)
})

it('a broken long request is opened again after a backoff that grows, and the catalog is taken once before each (C107, C112)', async () => {
  const { p, services, listens, pauses, names } = arranged()
  await services.discovery.refresh(alice, { ref: files })
  await settle()
  const listed = p.requests('tools/list').length
  listens[0]?.end({ kind: 'broken' })
  await settle()
  expect(pauses).toEqual([250])
  expect(p.requests('tools/list')).toHaveLength(listed + 1)
  expect(await names()).toEqual(['read', 'write'])
  expect(listens).toHaveLength(2)
  listens[1]?.end({ kind: 'broken' })
  await settle()
  expect(pauses).toEqual([250, 500])
  expect(listens).toHaveLength(3)
  expect(p.requests('tools/call')).toEqual([])
})

it('a long request that ends any other way is not opened again', async () => {
  const { services, listens, pauses } = arranged()
  await services.discovery.refresh(alice, { ref: files })
  await settle()
  listens[0]?.end({ kind: 'ended' })
  await settle()
  expect(pauses).toEqual([])
  expect(listens).toHaveLength(1)
})

it('after the backoff, a connection that is gone is not refreshed and not listened to again', async () => {
  let resume: () => void = () => undefined
  const { p, services, listens } = arranged({ auth: 'none' }, () => new Promise(r => (resume = r)))
  await services.discovery.refresh(alice, { ref: files })
  await settle()
  const listed = p.requests('tools/list').length
  listens[0]?.end({ kind: 'broken' })
  await settle()
  await services.connections.release(alice, files)
  resume()
  await settle()
  expect(p.requests('tools/list')).toHaveLength(listed)
  expect(listens).toHaveLength(1)
})

it('a peer that did not agree to tell the changes of its tools is not listened to any more', async () => {
  const { services, listens } = arranged()
  await services.discovery.refresh(alice, { ref: files })
  await settle()
  listens[0]?.observe(ACK(false))
  expect(listens[0]?.signal.aborted).toBe(true)
  await settle()
  expect(listens).toHaveLength(1)
})

it('a change is taken within the bound the first refresh was asked with: an endpoint with no timeout of its own still follows (C107)', async () => {
  const { services, listens, names } = arranged({
    auth: 'none',
    settings: { connectTimeout: { kind: 'absent' } },
  })
  const refreshed = await services.discovery.refresh(alice, {
    ref: files,
    connectBound: millisOf(10_000),
  })
  expect(refreshed).toMatchObject({ ok: { kind: 'published' } })
  await settle()
  listens[0]?.observe({ kind: 'tools-changed' })
  await settle()
  expect(await names()).toEqual(['read', 'write'])
})

it('a transport without long requests is not followed', async () => {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) } })
  adoptHttp(p, files, { auth: 'none' })
  const { services } = assemble(p.ports, p.config)
  expect(await services.discovery.refresh(alice, { ref: files })).toMatchObject({
    ok: { kind: 'published' },
  })
  await settle()
  expect(p.requests('tools/list')).toHaveLength(1)
})

it('refreshes one at a time: changes heard while one runs make exactly one more run, and later ones run again', async () => {
  const runs: (() => void)[] = []
  const change = coalesced(() => new Promise<void>(done => runs.push(done)))
  change()
  change()
  change()
  expect(runs).toHaveLength(1)
  runs[0]?.()
  await settle()
  expect(runs).toHaveLength(2)
  runs[1]?.()
  await settle()
  expect(runs).toHaveLength(2)
  change()
  expect(runs).toHaveLength(3)
  runs[2]?.()
})

it('the change feed: a closed feed tells each subscriber once, tells nothing more, and tells a late subscriber at once', () => {
  const feed = createChangeFeed()
  const said: string[] = []
  feed.subscribe({ changed: () => said.push('changed'), closed: () => said.push('closed') })
  feed.changed(home)
  feed.close()
  feed.changed(home)
  expect(said).toEqual(['changed', 'closed'])
  feed.subscribe({
    changed: () => said.push('late changed'),
    closed: () => said.push('late closed'),
  })
  feed.changed(home)
  expect(said).toEqual(['changed', 'closed', 'late closed'])
})
