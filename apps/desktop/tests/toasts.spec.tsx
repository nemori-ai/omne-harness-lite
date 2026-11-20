// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { ShellLoginState, Toast } from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { shellPlugin } from '../src/page/shell/service.ts'
import { Shell } from '../src/page/shell/shell.tsx'
import { createShellState } from '../src/page/shell/state.ts'

beforeAll(() => {
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})
afterEach(() => cleanup())

function fakeClock() {
  let now = 0
  const due = new Set<{ at: number; run: () => void }>()
  return {
    schedule(run: () => void, delayMs: number) {
      const timer = { at: now + delayMs, run }
      due.add(timer)
      return () => {
        due.delete(timer)
      }
    },
    advance(ms: number) {
      now += ms
      act(() => {
        for (const timer of [...due].sort((a, b) => a.at - b.at))
          if (timer.at <= now && due.delete(timer)) timer.run()
      })
    },
  }
}

const signedIn = {
  state: (): ShellLoginState => 'signed-in',
  subscribe: () => () => undefined,
  login: async () => 'signed-in' as const,
  logout: async () => 'signed-out' as const,
}

async function setup() {
  const clock = fakeClock()
  const state = createShellState(signedIn, {
    toasts: { visible: 2, durationMs: 1000, schedule: clock.schedule },
  })
  const root = new Context()
  await root.plugin(shellPlugin(state))
  const seen: (string | undefined)[] = []
  await root.plugin({
    name: 'inbox-page',
    inject: ['shell'],
    apply(ctx: Context) {
      ctx.shell.contribute('pages', {
        id: 'home',
        title: '首页',
        order: 0,
        icon: 'topics',
        render: () => null,
      })
      ctx.shell.contribute('pages', {
        id: 'inbox',
        title: '收件箱',
        order: 1,
        icon: 'mail',
        render: ({ subject }) => {
          seen.push(subject)
          return <p data-subject={subject ?? ''}>收件箱</p>
        },
      })
    },
  })
  render(
    <Shell
      appName="omne"
      state={state}
      connectivity={{ current: () => 'connected', subscribe: () => () => undefined }}
      theme={{ initial: 'light', select: () => 'light' }}
    />,
  )
  async function module(name: string): Promise<{ fiber: Fiber; shell: ShellService }> {
    let shell: ShellService | undefined
    const fiber = root.plugin({
      name,
      inject: ['shell'],
      apply(ctx: Context) {
        shell = ctx.shell
      },
    })
    await fiber
    return { fiber, shell: shell! }
  }
  return { clock, state, module, seen }
}

const toast = (id: string, more: Partial<Toast> = {}): Toast => ({
  id,
  tone: 'attention',
  title: `提示 ${id}`,
  ...more,
})
const shownTitles = () =>
  [...document.querySelectorAll('[data-toast]')].map(
    node => node.querySelector('[data-toast-title]')?.textContent,
  )
const current = () => document.querySelector('[aria-current="page"]')?.textContent

describe('外壳：瞬时提示', () => {
  it('外壳用共用的提示件画出模块交来的数据，到时撤下', async () => {
    const t = await setup()
    const m = await t.module('m')
    act(() => m.shell.toast(toast('a', { body: '一行正文' })))
    const region = screen.getByRole('region', { name: '提示' })
    expect(within(region).getByRole('alert').textContent).toContain('一行正文')
    expect(shownTitles()).toEqual(['提示 a'])
    t.clock.advance(1000)
    expect(screen.queryByRole('region', { name: '提示' })).toBeNull()
  })

  it('同一个标识再来是替换，不叠加', async () => {
    const t = await setup()
    const m = await t.module('m')
    act(() => m.shell.toast(toast('a', { title: '旧的' })))
    act(() => m.shell.toast(toast('a', { title: '新的' })))
    expect(shownTitles()).toEqual(['新的'])
  })

  it('超出同时显示的条数时排队，前面的走了才显示', async () => {
    const t = await setup()
    const m = await t.module('m')
    act(() => {
      for (const id of ['a', 'b', 'c']) m.shell.toast(toast(id))
    })
    expect(shownTitles()).toEqual(['提示 a', '提示 b'])
    t.clock.advance(1000)
    expect(shownTitles()).toEqual(['提示 c'])
  })

  it('模块卸载时它显示着的与排着队的提示都撤掉，别的模块的留着', async () => {
    const t = await setup()
    const first = await t.module('first')
    const second = await t.module('second')
    act(() => {
      first.shell.toast(toast('a'))
      second.shell.toast(toast('b'))
      first.shell.toast(toast('c'))
    })
    await act(async () => {
      await first.fiber.dispose()
    })
    expect(shownTitles()).toEqual(['提示 b'])
    t.clock.advance(1000)
    expect(shownTitles()).toEqual([])
  })

  it('人可以点掉一条，队里的下一条接上', async () => {
    const t = await setup()
    const m = await t.module('m')
    act(() => {
      for (const id of ['a', 'b', 'c']) m.shell.toast(toast(id))
    })
    fireEvent.click(within(screen.getAllByRole('alert')[0]!).getByRole('button', { name: '关闭' }))
    expect(shownTitles()).toEqual(['提示 b', '提示 c'])
  })

  it('点动作去那一页并带上对象，同时关掉这一条；从导航切页不带对象', async () => {
    const t = await setup()
    const m = await t.module('m')
    act(() =>
      m.shell.toast(toast('a', { action: { label: '去看看', page: 'inbox', subject: 'n-7' } })),
    )
    expect(current()).toBe('首页')
    fireEvent.click(screen.getByRole('button', { name: '去看看' }))
    expect(current()).toBe('收件箱')
    expect(document.querySelector('[data-subject]')?.getAttribute('data-subject')).toBe('n-7')
    expect(shownTitles()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: '首页' }))
    fireEvent.click(screen.getByRole('button', { name: '收件箱' }))
    expect(document.querySelector('[data-subject]')?.getAttribute('data-subject')).toBe('')
  })

  it('动作要去的页不在时只关掉这一条，当前页不变', async () => {
    const t = await setup()
    const m = await t.module('m')
    act(() => m.shell.toast(toast('a', { action: { label: '去看看', page: 'absent' } })))
    fireEvent.click(screen.getByRole('button', { name: '去看看' }))
    expect(current()).toBe('首页')
    expect(shownTitles()).toEqual([])
  })
})
