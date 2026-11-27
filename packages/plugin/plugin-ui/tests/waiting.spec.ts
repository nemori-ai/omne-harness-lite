import type { Context, Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { createPluginUiModule } from '@omne-harness/plugin-ui/cordis'
import { STYLE_POINT, changesOn, definePart, tenantScope } from '@omne-harness/shell-contract'
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

const late = definePart({
  name: 'late.part',
  label: '后来的部位',
  summary: '晚一点才声明',
  depths: ['style'],
})
const later = definePart({
  name: 'later.part',
  label: '更晚的部位',
  summary: '最后才声明',
  depths: ['style'],
})
const now = definePart({
  name: 'now.part',
  label: '现在的部位',
  summary: '一开始就在',
  depths: ['style'],
})
const style = (part: string, color: string) => ({
  point: STYLE_POINT,
  key: part,
  data: { base: { color } },
})

type Told = Readonly<{
  name: string
  state: string
  reason: string | null
  waiting?: readonly string[]
}>

async function world() {
  const started = await startShellOf(Signed)
  await started.root.plugin({
    name: 'now-ui',
    inject: ['shell'],
    apply: (ctx: Context) => now.declare(ctx.shell),
  })
  const source = fakeSource()
  await serveProtocol(started.root, pluginProtocol, source.client)
  await started.root.plugin(createPluginUiModule({ backoff: { delayMs: () => 1 } }))
  const styles = () =>
    changesOn(started.shell.registry(), tenantScope(ALICE), () => true)
      .standing.filter(each => each.point === STYLE_POINT)
      .map(each => `${each.key} by ${each.by.join('+')}`)
  /** How the last report told of one plugin. */
  const told = (name: string): Told | undefined =>
    (source.reports.at(-1)?.['plugins'] as readonly Told[] | undefined)?.find(
      each => each.name === name,
    )
  /** A module that declares the late part, the way a module that comes later does. */
  const declareLate = (): Promise<Fiber> =>
    started.root.plugin({
      name: 'late-ui',
      inject: ['shell'],
      apply: (ctx: Context) => late.declare(ctx.shell),
    }) as unknown as Promise<Fiber>
  return { ...started, source, styles, told, declareLate }
}

describe('a plugin whose part is declared later', () => {
  it('waits while the part is not declared, says so, and loads by itself in the same version once it is', async () => {
    const t = await world()
    t.source.set(ALICE, [given('tint', 'v1', style('late.part', 'red'))])
    await vi.waitFor(() =>
      expect(t.told('tint')).toEqual({
        name: 'tint',
        version: 'v1',
        state: 'failed',
        reason: 'waits for reference late.part',
        waiting: ['late.part'],
      }),
    )
    expect(t.styles()).toEqual([])

    await t.declareLate()
    await vi.waitFor(() => expect(t.styles()).toEqual(['late.part by plugin:tint@v1']))
    await vi.waitFor(() =>
      expect(t.told('tint')).toEqual({
        name: 'tint',
        version: 'v1',
        state: 'loaded',
        reason: null,
      }),
    )
  })

  it('loads by itself once another plugin of the tenant declares the part it waits for', async () => {
    const t = await world()
    const host = given('late', 'v1', {
      point: 'shell.parts',
      key: 'late.part',
      data: { label: '后来的部位', summary: '一份 Plugin 后来声明的部位', depths: ['style'] },
    })
    t.source.set(ALICE, [given('tint', 'v1', style('late.part', 'red'))])
    await vi.waitFor(() => expect(t.told('tint')?.waiting).toEqual(['late.part']))
    t.source.set(ALICE, [given('tint', 'v1', style('late.part', 'red')), host])
    await vi.waitFor(() => expect(t.told('late')).toMatchObject({ state: 'loaded', reason: null }))
    await vi.waitFor(() => expect(t.told('tint')).toMatchObject({ state: 'loaded', reason: null }))
    expect(t.styles()).toEqual(['late.part by plugin:tint@v1'])
  })

  it('waits for every part it lacks, and loads only when all of them are declared', async () => {
    const t = await world()
    t.source.set(ALICE, [
      given('tint', 'v1', style('late.part', 'red'), style('later.part', 'blue')),
    ])
    await vi.waitFor(() => expect(t.told('tint')?.waiting).toEqual(['late.part', 'later.part']))
    await t.declareLate()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.styles()).toEqual([])
    expect(t.told('tint')?.waiting).toEqual(['late.part', 'later.part'])

    await t.root.plugin({
      name: 'later-ui',
      inject: ['shell'],
      apply: (ctx: Context) => later.declare(ctx.shell),
    })
    await vi.waitFor(() =>
      expect(t.styles()).toEqual(['late.part by plugin:tint@v1', 'later.part by plugin:tint@v1']),
    )
  })

  it('fails, and does not wait, when one member is wrong for a reason that no wait mends', async () => {
    const t = await world()
    t.source.set(ALICE, [
      given('tint', 'v1', style('late.part', 'red'), {
        point: STYLE_POINT,
        key: 'now.part',
        data: 'red',
      }),
    ])
    await vi.waitFor(() =>
      expect(t.told('tint')).toEqual({
        name: 'tint',
        version: 'v1',
        state: 'failed',
        reason: `member 2 (${STYLE_POINT} now.part): the data is not a record of states and declarations`,
      }),
    )
  })

  it('waits for a point that is not declared now, and is judged again when the tree changes', async () => {
    const t = await world()
    t.source.set(ALICE, [given('board', 'v1', { point: 'notes.board', key: 'pins', data: {} })])
    await vi.waitFor(() => expect(t.told('board')?.waiting).toEqual(['notes.board']))
    expect(t.told('board')?.reason).toBe('waits for point notes.board')
  })

  it('forgets a waiting plugin the list drops: the part appearing later loads nothing', async () => {
    const t = await world()
    t.source.set(ALICE, [given('tint', 'v1', style('late.part', 'red'))])
    await vi.waitFor(() => expect(t.told('tint')?.waiting).toEqual(['late.part']))
    t.source.set(ALICE, [])
    await vi.waitFor(() => expect(t.told('tint')).toBeUndefined())
    await t.declareLate()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(t.styles()).toEqual([])
  })

  it('loads the new version of a waiting plugin the list moves to', async () => {
    const t = await world()
    t.source.set(ALICE, [given('tint', 'v1', style('late.part', 'red'))])
    await vi.waitFor(() => expect(t.told('tint')?.waiting).toEqual(['late.part']))
    t.source.set(ALICE, [given('tint', 'v2', style('now.part', 'red'))])
    await vi.waitFor(() => expect(t.styles()).toEqual(['now.part by plugin:tint@v2']))
  })

  it('tells a server before revision 3 the waiting plugin as failed, with what it waits for as the reason', async () => {
    const t = await world()
    t.source.knowWaiting(false)
    t.source.set(ALICE, [given('tint', 'v1', style('late.part', 'red'))])
    await vi.waitFor(() =>
      expect(t.told('tint')).toEqual({
        name: 'tint',
        version: 'v1',
        state: 'failed',
        reason: 'waits for reference late.part',
      }),
    )
  })
})
