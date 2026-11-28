import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { FloorPort } from '@omne-harness/plugin-ui'
import { createPluginUiModule } from '@omne-harness/plugin-ui/cordis'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { STYLE_POINT, definePart, type Trouble } from '@omne-harness/shell-contract'
import { ReferenceShell, serveProtocol, startShellOf } from '@omne-harness/shell-contract/testing'
import { fakeSource, given } from './support/fake-source.ts'

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

class Signed extends ReferenceShell {
  constructor(ctx: Context) {
    super(ctx)
    this.tenant = ALICE
  }
}

/** A shell that cannot read a red send button: it says so of the place, not of who put it. */
class Fussy extends Signed {
  protected override troubles(): readonly Trouble[] {
    return this.registry()
      .placed.filter(each => each.point === STYLE_POINT && each.key === 'notes.send')
      .map(each => ({
        point: each.point,
        key: each.key,
        id: each.id,
        at: ['base', 'color'],
        given: '"red"',
        allows: 'a color of the tokens',
      }))
  }
}

const send = definePart({
  name: 'notes.send',
  label: '发送按钮',
  summary: '把写好的一条发出去',
  depths: ['style'],
})
const title = definePart({
  name: 'notes.title',
  label: '标题',
  summary: '这一页的名字',
  depths: ['style'],
})
const colored = (color: string, key = 'notes.send') => ({
  point: STYLE_POINT,
  key,
  data: { base: { color } },
})

type Sent = Readonly<{
  client: string
  plugins: readonly Readonly<{
    name: string
    version: string
    state: string
    reason: string | null
  }>[]
  points: readonly Readonly<{ name: string }>[]
  parts: readonly Readonly<{ name: string }>[]
}>

async function world(floor?: FloorPort, reports?: boolean, shell: typeof Signed = Signed) {
  const started = await startShellOf(shell)
  let notes: Context | undefined
  await started.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply(ctx: Context) {
      send.declare(ctx.shell)
      notes = ctx
    },
  })
  const source = fakeSource()
  await serveProtocol(started.root, pluginProtocol, source.client)
  const module = started.root.plugin(
    createPluginUiModule({
      backoff: { delayMs: () => 1 },
      clientId: () => 'desktop-1',
      ...(floor && { floor }),
      ...(reports !== undefined && { reports }),
    }),
  )
  await module
  const sent = (): readonly Sent[] => source.reports as unknown as Sent[]
  const last = (): Sent | undefined => sent().at(-1)
  const quiet = async (): Promise<number> => {
    await new Promise(resolve => setTimeout(resolve, 30))
    return sent().length
  }
  return { ...started, source, module, notes: notes!, sent, last, quiet }
}

describe('what the client tells the server of itself', () => {
  it('is told once what to load is read: who it is, how each plugin stands, and the points and parts its tree has', async () => {
    const t = await world()
    t.source.set(ALICE, [])
    await vi.waitFor(() => expect(t.sent()).toHaveLength(1))
    const report = t.last()
    expect(report?.client).toBe('desktop-1')
    expect(report?.plugins).toEqual([])
    expect(report?.parts.map(part => part.name)).toEqual(['notes.send'])
    expect(report?.points.map(point => point.name)).toContain(STYLE_POINT)
    expect(t.source.opened.at(-1)).toMatchObject({ side: 'client', client: 'desktop-1' })
    expect(await t.quiet()).toBe(1)
  })

  it('is told nothing by a page drawn only to be looked at, though it loads the same', async () => {
    const t = await world(undefined, false)
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.source.opened.at(-1)).toMatchObject({ client: 'desktop-1' }))
    expect(await t.quiet()).toBe(0)
  })

  it('says of each plugin whether it is loaded, or failed and why, by name', async () => {
    const t = await world()
    t.source.set(ALICE, [
      given('brand', 'v1', colored('red')),
      given('aside', 'v2', colored('red', 'notes.nowhere')),
    ])
    await vi.waitFor(() =>
      expect(t.last()?.plugins).toEqual([
        {
          name: 'aside',
          version: 'v2',
          state: 'failed',
          reason: 'waits for reference notes.nowhere',
          waiting: ['notes.nowhere'],
        },
        { name: 'brand', version: 'v1', state: 'loaded', reason: null },
      ]),
    )
  })

  it('says of a plugin the floor holds back that it is held', async () => {
    const t = await world({
      rise: () => ({ want: ['plugin:brand@v1'], held: true }),
      want: () => undefined,
      unwant: () => undefined,
      settle: () => undefined,
    })
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() =>
      expect(t.last()?.plugins).toEqual([
        { name: 'brand', version: 'v1', state: 'held', reason: null },
      ]),
    )
  })

  it('says of two plugins that put on one key that both are loaded and neither counts there', async () => {
    const t = await world()
    t.source.set(ALICE, [
      given('brand', 'v1', colored('red')),
      given('other', 'v1', colored('blue')),
    ])
    await vi.waitFor(() =>
      expect(t.last()?.plugins).toEqual([
        {
          name: 'brand',
          version: 'v1',
          state: 'loaded',
          reason: `${STYLE_POINT} notes.send is put as well by plugin:other@v1: neither counts`,
        },
        {
          name: 'other',
          version: 'v1',
          state: 'loaded',
          reason: `${STYLE_POINT} notes.send is put as well by plugin:brand@v1: neither counts`,
        },
      ]),
    )
  })

  it('tells again when a plugin moved, and when the tree got a part, and not when nothing changed', async () => {
    const t = await world()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.last()?.plugins).toHaveLength(1))
    const told = await t.quiet()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.source.asked.length).toBeGreaterThan(1))
    expect(await t.quiet()).toBe(told)
    title.declare(t.notes.shell)
    await vi.waitFor(() =>
      expect(t.last()?.parts.map(part => part.name)).toEqual(['notes.send', 'notes.title']),
    )
    t.source.set(ALICE, [])
    await vi.waitFor(() => expect(t.last()?.plugins).toEqual([]))
  })

  it('tells again the next time it reads what to load, when the server did not take what it told', async () => {
    const t = await world()
    t.source.deliver(false)
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.last()?.plugins).toHaveLength(1))
    const told = await t.quiet()
    t.source.deliver(true)
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() => expect(t.sent().length).toBeGreaterThan(told))
    expect(t.last()?.plugins).toHaveLength(1)
    const after = await t.quiet()
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(await t.quiet()).toBe(after)
  })

  it('tells nothing before it has read what to load: the server keeps what it is told only for a client that observes', async () => {
    const t = await world()
    t.source.set(ALICE, 'unavailable')
    title.declare(t.notes.shell)
    expect(await t.quiet()).toBe(0)
    t.source.set(ALICE, [])
    await vi.waitFor(() => expect(t.sent()).toHaveLength(1))
  })

  it('goes by a name of its own making when it is given none: the same where it observes and where it tells', async () => {
    const started = await startShellOf(Signed)
    const source = fakeSource()
    await serveProtocol(started.root, pluginProtocol, source.client)
    await started.root.plugin(createPluginUiModule({ backoff: { delayMs: () => 1 } }))
    source.set(ALICE, [])
    await vi.waitFor(() => expect(source.reports).toHaveLength(1))
    const name = source.reports[0]?.['client']
    expect(typeof name === 'string' && name.length >= 8).toBe(true)
    expect(source.opened.at(-1)?.['client']).toBe(name)
  })

  it('tells nothing more once the module left', async () => {
    const t = await world()
    t.source.set(ALICE, [])
    await vi.waitFor(() => expect(t.sent()).toHaveLength(1))
    await t.module.dispose()
    title.declare(t.notes.shell)
    expect(await t.quiet()).toBe(1)
  })
})

describe("what the host could not read of a plugin, told as that plugin's refused", () => {
  it('names the plugin that put the item, with where, given and allows', async () => {
    const t = await world(undefined, undefined, Fussy)
    t.source.set(ALICE, [given('brand', 'v1', colored('red'))])
    await vi.waitFor(() =>
      expect(t.last()?.plugins).toEqual([
        {
          name: 'brand',
          version: 'v1',
          state: 'loaded',
          reason: null,
          refused: [
            {
              at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
              target: `${STYLE_POINT}「notes.send」`,
              rejection: { at: ['base', 'color'], given: '"red"', allows: 'a color of the tokens' },
            },
          ],
        },
      ]),
    )
  })
})
