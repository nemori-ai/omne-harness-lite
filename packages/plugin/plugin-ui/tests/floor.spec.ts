import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { Code, FloorPort } from '@omne-harness/plugin-ui'
import { createPluginUiModule } from '@omne-harness/plugin-ui/cordis'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import {
  STYLE_POINT,
  changesOn,
  definePart,
  defineRenderPoint,
  tenantScope,
} from '@omne-harness/shell-contract'
import { ReferenceShell, serveProtocol, startShellOf } from '@omne-harness/shell-contract/testing'
import { fakeSource, given } from './support/fake-source.ts'

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

class Signed extends ReferenceShell {
  private readonly listeners = new Set<(scope: string | undefined) => void>()
  override readonly scope = {
    get: () => this.tenant,
    set: (scope: string | undefined) => {
      this.tenant = scope
      this.rescope()
      for (const listener of this.listeners) listener(scope)
    },
    subscribe: (listener: (scope: string | undefined) => void) => {
      this.listeners.add(listener)
      return () => void this.listeners.delete(listener)
    },
  }
}

const send = definePart({
  name: 'notes.send',
  label: '发送按钮',
  summary: '把写好的一条发出去',
  depths: ['style'],
})
const card = defineRenderPoint({ name: 'notes.card', key: 'the kind', summary: 'A note.' })
const colored = (color: string, key = 'notes.send') => ({
  point: STYLE_POINT,
  key,
  data: { base: { color } },
})

async function world(risen: Readonly<{ want: readonly string[]; held: boolean }>, code?: Code) {
  const started = await startShellOf(Signed)
  started.shell.scope.set(ALICE)
  await started.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply: (ctx: Context) => send.declare(ctx.shell),
  })
  const source = fakeSource()
  await serveProtocol(started.root, pluginProtocol, source.client)
  const calls: string[] = []
  const floor: FloorPort = {
    rise(tenant) {
      calls.push(`rise ${tenant === ALICE ? 'alice' : tenant}`)
      return risen
    },
    want: (_tenant, fiber) => void calls.push(`want ${fiber}`),
    unwant: (_tenant, fiber) => void calls.push(`unwant ${fiber}`),
    settle: () => void calls.push('settle'),
  }
  const module = started.root.plugin(
    createPluginUiModule({ backoff: { delayMs: () => 1 }, floor, ...(code && { code }) }),
  )
  await module
  const styles = () =>
    changesOn(started.shell.registry(), tenantScope(ALICE), () => true)
      .standing.filter(each => each.point === STYLE_POINT)
      .map(each => each.by.join('+'))
  const settled = () => vi.waitFor(() => expect(calls.at(-1)).toBe('settle'))
  const without = (word: string) => calls.filter(call => call !== word)
  return { ...started, source, module, calls, styles, settled, without }
}

const UP = { want: [], held: false }

describe('the loader on the floor', () => {
  it('tells the floor what it is about to load before it loads it, and that all is settled once everything has an outcome', async () => {
    const t = await world(UP)
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    await t.settled()
    expect(t.without('settle')).toEqual(['rise alice', 'want plugin:brand@v1'])
    expect(t.calls.indexOf('settle')).toBeGreaterThan(t.calls.indexOf('want plugin:brand@v1'))
    expect(t.shell.fallen()).toEqual([])
  })

  it('does not load what the floor holds back, and has the shell name it', async () => {
    const t = await world({ want: ['plugin:brand@v1'], held: true })
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() =>
      expect(t.shell.fallen()).toEqual([{ name: 'plugin:brand@v1', why: 'held' }]),
    )
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.styles()).toEqual([])
    expect(t.without('settle')).toEqual(['rise alice'])
    let told = 0
    t.shell.watchAdoptions(() => (told += 1))
    const asked = t.source.asked.length
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.source.asked.length).toBeGreaterThan(asked))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(told).toBe(0)
  })

  it('lets a held plugin go when the list has another version of it: that one is loaded', async () => {
    const t = await world({ want: ['plugin:brand@v1'], held: true })
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.shell.fallen()).toHaveLength(1))
    t.source.set(ALICE, [given('brand', 'v2', colored('blue'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v2']))
    await t.settled()
    expect(t.without('settle')).toEqual([
      'rise alice',
      'want plugin:brand@v2',
      'unwant plugin:brand@v1',
    ])
    expect(t.shell.fallen()).toEqual([])
  })

  it('lets a held plugin go when the list no longer has it', async () => {
    const t = await world({ want: ['plugin:brand@v1'], held: true })
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.shell.fallen()).toHaveLength(1))
    t.source.set(ALICE, [])
    await vi.waitFor(() => expect(t.shell.fallen()).toEqual([]))
    expect(t.without('settle')).toEqual(['rise alice', 'unwant plugin:brand@v1'])
    t.source.set(ALICE, [given('other', 'v1', colored('blue'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:other@v1']))
    expect(t.calls.filter(call => call === 'unwant plugin:brand@v1')).toHaveLength(1)
  })

  it('holds a plugin only in the version the floor has: another plugin beside it is loaded', async () => {
    const t = await world({ want: ['plugin:brand@v1'], held: true })
    t.source.set(ALICE, [
      given('brand', 'v1', colored('red')),
      given('other', 'v1', colored('blue')),
    ])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:other@v1']))
    expect(t.shell.fallen()).toEqual([{ name: 'plugin:brand@v1', why: 'held' }])
  })

  it('tells the floor to forget what it had from the last run and the list no longer has', async () => {
    const t = await world({ want: ['plugin:old@v0', 'plugin:brand@v1'], held: false })
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    await t.settled()
    expect(t.without('settle')).toEqual([
      'rise alice',
      'want plugin:brand@v1',
      'unwant plugin:old@v0',
    ])
  })

  it('tells the floor to forget a plugin that could not be loaded, and one that was unloaded', async () => {
    const t = await world(UP)
    t.source.set(ALICE, [
      given('brand', 'v1', colored('red')),
      given('broken', 'v1', colored('red', 'notes.nowhere')),
    ])
    await vi.waitFor(() => expect(t.calls).toContain('unwant plugin:broken@v1'))
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    t.source.set(ALICE, [])
    await vi.waitFor(() => expect(t.calls).toContain('unwant plugin:brand@v1'))
    await t.settled()
  })

  it('says all is settled when the list is read and has nothing, and says nothing before the list is read', async () => {
    const t = await world(UP)
    t.source.set(ALICE, 'unavailable')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.calls).toEqual(['rise alice'])
    t.source.set(ALICE, [])
    await t.settled()
    expect(t.without('settle')).toEqual(['rise alice'])
  })

  it('does not say all is settled while a load is in the air', async () => {
    let land: ((file: unknown) => void) | undefined
    const t = await world(UP, {
      given: {},
      load: () => new Promise(resolve => (land = resolve)),
    })
    card.declare(t.shell)
    t.source.set(ALICE, [
      given('slow', 'v1', { point: 'notes.card', key: 'todo', module: 'a.js', export: 'a' }),
    ])
    await vi.waitFor(() => expect(land).toBeDefined())
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.calls).toEqual(['rise alice', 'want plugin:slow@v1'])
    land?.({ a: () => () => null })
    await t.settled()
  })

  it('tells the floor all is settled when the tenant leaves while a load is in the air: stopping in order is not going down', async () => {
    const t = await world(UP, { given: {}, load: () => new Promise(() => undefined) })
    card.declare(t.shell)
    t.source.set(ALICE, [
      given('slow', 'v1', { point: 'notes.card', key: 'todo', module: 'a.js', export: 'a' }),
    ])
    await vi.waitFor(() => expect(t.calls).toContain('want plugin:slow@v1'))
    expect(t.calls).not.toContain('settle')
    t.shell.scope.set(undefined)
    await t.settled()
  })

  it('loads as before, and names nothing, when the application gives no floor', async () => {
    const started = await startShellOf(Signed)
    started.shell.scope.set(ALICE)
    const source = fakeSource()
    await serveProtocol(started.root, pluginProtocol, source.client)
    await started.root.plugin(createPluginUiModule({ backoff: { delayMs: () => 1 } }))
    source.set(ALICE, [given('broken', 'v1', colored('red', 'notes.nowhere'))])
    await vi.waitFor(() => expect(source.asked.length).toBeGreaterThan(0))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(started.shell.fallen()).toEqual([])
  })

  it('takes its marks from the shell when the tenant leaves, and leaves the floor as it is', async () => {
    const t = await world({ want: ['plugin:brand@v1'], held: true })
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.shell.fallen()).toHaveLength(1))
    t.shell.scope.set(undefined)
    await vi.waitFor(() => expect(t.shell.fallen()).toEqual([]))
    expect(t.without('settle')).toEqual(['rise alice'])
  })
})
