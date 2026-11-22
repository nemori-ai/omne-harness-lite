// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup } from '@testing-library/react'
import type { Fiber } from '@deepseek-ai/cordis'
import type { ShellSlots, SlotName } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { createShellState } from '../src/page/shell/state.ts'
import { fakeGate, fakeSidebar } from './support/fake-modules.tsx'
import { settle, setup } from './support/shell-setup.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const page = (name: string, id: string) =>
  defineUiModule({
    name,
    inject: [],
    apply: shell =>
      shell.contribute('pages', { id, title: id, order: 0, icon: 'topics', render: () => null }),
  })

const attach = (name: string, anchor: string, id: string) =>
  defineUiModule({
    name,
    inject: [],
    apply: shell => shell.contribute('attached', { anchor, id, order: 0, render: () => null }),
  })

async function loaded(t: Awaited<ReturnType<typeof setup>>, plugin: ReturnType<typeof page>) {
  let fiber: Fiber | undefined
  await act(async () => {
    fiber = await t.root.plugin(plugin)
    await settle()
  })
  return fiber as Fiber
}

const unload = (fiber: Fiber) =>
  act(async () => {
    await fiber.dispose()
    await settle()
  })

const saidOf = () => document.querySelector('.omne-figure-layer [role="status"]')?.textContent

describe('外壳：一页是谁放的', () => {
  it('记下放这一页的模块；它卸载，这一页的记录整条删掉', async () => {
    const t = await setup({ login: 'signed-in', modules: [fakeGate()] })
    const one = await loaded(t, page('one', 'p'))
    expect(t.state.pageOwners.get('p')).toHaveLength(1)
    await unload(one)
    expect(t.state.pageOwners.has('p')).toBe(false)
  })

  it('两个模块放了同一页：各记一个；一个卸载只去掉它自己，另一个还在', async () => {
    const t = await setup({ login: 'signed-in', modules: [fakeGate()] })
    vi.spyOn(t.root.logger, 'error').mockImplementation(() => undefined)
    const one = await loaded(t, page('one', 'p'))
    const two = await loaded(t, page('two', 'p'))
    const [first, second] = t.state.pageOwners.get('p') ?? []
    expect(t.state.pageOwners.get('p')).toHaveLength(2)
    expect(first).not.toBe(second)
    await unload(one)
    expect(t.state.pageOwners.get('p')).toEqual([second])
    await unload(two)
    expect(t.state.pageOwners.has('p')).toBe(false)
  })

  it('只记页面：侧栏的一项与附着的一项不算谁的页', async () => {
    const t = await setup({ login: 'signed-in', modules: [fakeGate()] })
    await loaded(t, fakeSidebar({ id: 'side', order: 0, text: '侧栏占位' }))
    await loaded(t, attach('att', 'test.a', 'x'))
    expect([...t.state.pageOwners.keys()]).toEqual([])
  })

  it('当前页有两个模块在抢：谁都不算在前台，它们的活动只算后台', async () => {
    const held: { report?: () => void } = {}
    const reporting = defineUiModule({
      name: 'one',
      inject: [],
      apply(shell) {
        held.report = () => shell.figure({ doing: 'writing', subject: '清单' })
        shell.contribute('pages', {
          id: 'p',
          title: 'p',
          order: 0,
          icon: 'topics',
          render: () => null,
        })
      },
    })
    const t = await setup({ login: 'signed-in', modules: [fakeGate()] })
    vi.spyOn(t.root.logger, 'error').mockImplementation(() => undefined)
    await loaded(t, reporting)
    act(() => t.service.navigate('p'))
    act(() => held.report?.())
    expect(saidOf()).toBe('Agent 在写：清单')
    await loaded(t, page('two', 'p'))
    expect(saidOf()).toBe('Agent 在后台做事')
  })
})

describe('外壳：装错的地方写进日志', () => {
  it('页面、侧栏、附着位置的冲突各写一条，写明是哪一处、哪两家', async () => {
    const t = await setup({ login: 'signed-in', modules: [fakeGate()] })
    const logged = vi.spyOn(t.root.logger, 'error').mockImplementation(() => undefined)
    await loaded(t, page('one', 'p'))
    await loaded(t, page('two', 'p'))
    await loaded(t, fakeSidebar({ id: 'side', order: 0, text: '甲' }))
    await loaded(t, {
      ...fakeSidebar({ id: 'side', order: 0, text: '乙' }),
      name: 'another-sidebar',
    })
    await loaded(t, attach('left', 'test.a', 'x'))
    await loaded(t, attach('right', 'test.a', 'x'))
    const lines = logged.mock.calls.map(call => String(call[0]))
    expect(lines).toContain('shell: pages p is put by one, two; none of them is drawn')
    expect(lines).toContain(
      'shell: sidebar side is put by another-sidebar, fake-sidebar-side; none of them is drawn',
    )
    expect(lines).toContain('shell: attached test.a x is put by left, right; none of them is drawn')
  })

  it('两个没声明的点各写一条；同一个问题还在，登记表再变也不重写', async () => {
    const t = await setup({ login: 'signed-in', modules: [fakeGate()] })
    const logged = vi.spyOn(t.root.logger, 'error').mockImplementation(() => undefined)
    const about = (point: string) =>
      logged.mock.calls.filter(call => String(call[0]).includes(`the point ${point} `)).length
    await loaded(t, attach('a', 'ghost.one', 'x'))
    await loaded(t, attach('b', 'ghost.two', 'x'))
    expect(about('ghost.one')).toBe(1)
    expect(about('ghost.two')).toBe(1)
    await loaded(t, attach('c', 'test.a', 'y'))
    expect(about('ghost.one')).toBe(1)
    expect(about('ghost.two')).toBe(1)
  })
})

type Stub = ShellSlots & { tell(slot: SlotName): void; watching(): number }

function stub(tag: string): Stub {
  const watchers = new Set<{ slot: SlotName; listener: () => void }>()
  return {
    items: () => [{ id: tag }] as never,
    conflicts: () => [{ slot: 'gate', anchor: undefined, id: tag, by: [tag] }] as never,
    subscribe(slot, listener) {
      const watcher = { slot, listener }
      watchers.add(watcher)
      return () => void watchers.delete(watcher)
    },
    tell: slot => {
      for (const watcher of [...watchers]) if (watcher.slot === slot) watcher.listener()
    },
    watching: () => watchers.size,
  }
}

const relay = () =>
  createShellState({
    state: () => 'signed-out',
    subscribe: () => () => undefined,
    login: async () => 'signed-in',
    logout: async () => 'signed-out',
  }).slots

/** The state itself watches the slots; this is how many watchers it keeps on a shell behind it. */
const OWN = (() => {
  const probe = stub('probe')
  relay().bind(probe)
  return probe.watching()
})()

describe('页面读位置经过的那一层：外壳服务在它后面换', () => {
  it('后面没有外壳：什么都是空的，订阅不出错', () => {
    const slots = relay()
    expect(slots.items('pages')).toEqual([])
    expect(slots.conflicts('gate')).toEqual([])
    const stop = slots.subscribe('pages', () => undefined)
    expect(() => stop()).not.toThrow()
  })

  it('外壳接上：已有的订阅者被通知一次并接到它上面；外壳的变化传得到；读到的是它的', () => {
    const slots = relay()
    const heard = vi.fn()
    slots.subscribe('pages', heard)
    const one = stub('one')
    slots.bind(one)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(one.watching()).toBe(OWN + 1)
    expect(slots.items('pages')).toEqual([{ id: 'one' }])
    expect(slots.conflicts('gate')).toEqual([
      { slot: 'gate', anchor: undefined, id: 'one', by: ['one'] },
    ])
    one.tell('pages')
    expect(heard).toHaveBeenCalledTimes(2)
    one.tell('sidebar')
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('换一个外壳：旧的那边不再留订阅，订阅者接到新的上并被通知；旧外壳的撤除不动新的', () => {
    const slots = relay()
    const heard = vi.fn()
    slots.subscribe('pages', heard)
    const one = stub('one')
    const two = stub('two')
    const undoOne = slots.bind(one)
    slots.bind(two)
    expect(one.watching()).toBe(0)
    expect(two.watching()).toBe(OWN + 1)
    expect(heard).toHaveBeenCalledTimes(2)
    undoOne()
    expect(slots.items('pages')).toEqual([{ id: 'two' }])
    expect(two.watching()).toBe(OWN + 1)
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('外壳撤了：订阅者被通知，读到空的；外壳那边不留订阅', () => {
    const slots = relay()
    const heard = vi.fn()
    slots.subscribe('pages', heard)
    const one = stub('one')
    const undo = slots.bind(one)
    undo()
    expect(heard).toHaveBeenCalledTimes(2)
    expect(one.watching()).toBe(0)
    expect(slots.items('pages')).toEqual([])
  })

  it('退订：外壳那边的订阅撤掉；之后外壳再换也不通知它', () => {
    const slots = relay()
    const heard = vi.fn()
    const one = stub('one')
    slots.bind(one)
    const stop = slots.subscribe('pages', heard)
    expect(one.watching()).toBe(OWN + 1)
    stop()
    expect(one.watching()).toBe(OWN)
    slots.bind(stub('two'))
    one.tell('pages')
    expect(heard).not.toHaveBeenCalled()
  })
})
