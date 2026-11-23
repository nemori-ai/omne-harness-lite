import type { Context, Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createPluginUiModule } from '@omne-harness/plugin-ui/cordis'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { STYLE_POINT, changesOn, definePart, tenantScope } from '@omne-harness/shell-contract'
import { ReferenceShell, serveProtocol, startShellOf } from '@omne-harness/shell-contract/testing'
import { fakeSource, given } from './support/fake-source.ts'

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const BOB =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'

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
const colored = (color: string) => ({
  point: STYLE_POINT,
  key: 'notes.send',
  data: { base: { color } },
})

async function world(tenant: string | undefined = ALICE, served = true) {
  const started = await startShellOf(Signed)
  started.shell.scope.set(tenant)
  await started.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply: (ctx: Context) => send.declare(ctx.shell),
  })
  const source = fakeSource()
  const serve = (): Promise<Fiber> => serveProtocol(started.root, pluginProtocol, source.client)
  const protocol = served ? await serve() : undefined
  const module = started.root.plugin(createPluginUiModule({ backoff: { delayMs: () => 1 } }))
  await module
  const styles = (asker: string | undefined = started.shell.scope.get()) =>
    changesOn(started.shell.registry(), tenantScope(asker), () => true)
      .standing.filter(each => each.point === STYLE_POINT)
      .map(each => each.by.join('+'))
  const css = () => started.shell.changes().css
  return { ...started, source, module, protocol, serve, styles, css }
}

describe('the loader on the client tree', () => {
  it('brings what the signed-in tenant is to load onto the points, in the scope of that tenant', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    expect(t.css()).toContain('color:red')
    expect(t.styles(BOB)).toEqual([])
    expect(t.styles('')).toEqual([])
  })

  it('follows the source: another version takes the place of the one before; a plugin that left is taken away', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    t.source.set(ALICE, [given('brand', 'v2', colored('blue'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v2']))
    expect(t.css()).toContain('color:blue')
    t.source.set(ALICE, [])
    await vi.waitFor(() => expect(t.styles()).toEqual([]))
  })

  it('leaves what is loaded as it is while the source cannot be read', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    const before = t.source.asked.length
    t.source.set(ALICE, 'unavailable')
    await vi.waitFor(() => expect(t.source.asked.length).toBeGreaterThan(before + 1))
    expect(t.styles()).toEqual(['plugin:brand@v1'])
  })

  it('takes everything away when the tenant signs out, and asks the source nothing for nobody', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    t.shell.scope.set(undefined)
    await vi.waitFor(() => expect(t.styles(ALICE)).toEqual([]))
    const asked = t.source.asked.length
    t.source.set(ALICE, [given('brand', 'v2', colored('blue'))])
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.source.asked.length).toBe(asked)
  })

  it('loads for the tenant that signs in next what that tenant is to load, in its own scope', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    t.source.set(BOB, [given('brand', 'v1', colored('green'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    t.shell.scope.set(BOB)
    await vi.waitFor(() => expect(t.css()).toContain('color:green'))
    expect(t.styles(ALICE)).toEqual([])
    expect(t.source.asked.at(-1)).toBe(BOB)
  })

  it('loads nothing while the protocol is not served, and loads once it is', async () => {
    const t = await world(ALICE, false)
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.styles()).toEqual([])
    expect(t.source.asked).toEqual([])
    await t.serve()
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
  })

  it('takes away what it loaded when the protocol is withdrawn', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    await t.protocol?.dispose()
    await vi.waitFor(() => expect(t.styles()).toEqual([]))
  })

  it('takes away what it loaded when the module leaves', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    await t.module.dispose()
    expect(t.styles()).toEqual([])
    const asked = t.source.asked.length
    t.source.set(ALICE, [given('brand', 'v2', colored('blue'))])
    t.shell.scope.set(BOB)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.source.asked.length).toBe(asked)
  })

  it('does not start over when it is told again of the tenant it already loads for', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    const asked = t.source.asked.length
    t.shell.scope.set(ALICE)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.source.asked.length).toBe(asked)
    expect(t.styles()).toEqual(['plugin:brand@v1'])
  })

  it('does not load for a tenant that left again before its turn came', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    t.shell.scope.set(BOB)
    t.shell.scope.set(ALICE)
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.source.asked).not.toContain(BOB)
  })

  it('lets neither of two plugins count where both put on one key; taking one away lets the other count at once', async () => {
    const t = await world()
    t.source.set(ALICE, [
      given('brand', 'v1', colored('red')),
      given('other', 'v1', colored('blue')),
    ])
    await vi.waitFor(() =>
      expect(t.shell.changes().conflicts).toEqual([
        { point: STYLE_POINT, key: 'notes.send', by: ['plugin:brand@v1', 'plugin:other@v1'] },
      ]),
    )
    expect(t.styles()).toEqual([])
    expect(t.css()).not.toContain('color:')
    t.source.set(ALICE, [given('other', 'v1', colored('blue'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:other@v1']))
    expect(t.css()).toContain('color:blue')
  })

  it('asks the source nothing for a scope that is not a tenant', async () => {
    const t = await world('somebody')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.source.asked).toEqual([])
  })

  it('keeps a plugin that cannot be put from the others: the one that can is loaded', async () => {
    const t = await world()
    t.source.set(ALICE, [
      given('brand', 'v1', colored('red')),
      given('broken', 'v1', { point: STYLE_POINT, key: 'notes.nowhere', data: {} }),
    ])
    await vi.waitFor(() => expect(t.styles()).toEqual(['plugin:brand@v1']))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(t.shell.changes().refused).toEqual([])
  })
})
