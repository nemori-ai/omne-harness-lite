// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { FigureReport } from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import { FigureSeat } from '@omne-harness/ui-kit'
import { activeSeat, pressSeat } from '../src/page/shell/seats.ts'
import { current, home, settle, setup } from './support/shell-setup.tsx'

const rect = (left: number, top: number, side: number): DOMRect =>
  ({
    left,
    top,
    width: side,
    height: side,
    x: left,
    y: top,
    right: left + side,
    bottom: top + side,
    toJSON: () => ({}),
  }) as DOMRect

beforeEach(() => {
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const seat = this.dataset['figureSeat']
    if (seat === undefined || this.closest('[hidden]') !== null) return rect(0, 0, 0)
    return seat === 'header' ? rect(600, 20, 32) : rect(12, 36, 32)
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** A module that places one page and keeps the shell service to report through it. */
function reporter(id: string, order: number, seat = false) {
  const held: { shell?: ShellService } = {}
  const plugin = defineUiModule({
    name: `reporter-${id}`,
    needs: {},
    apply(shell) {
      held.shell = shell
      shell.contribute('pages', {
        id,
        title: `页${id}`,
        order,
        icon: 'topics',
        render: () =>
          seat ? (
            <header>
              <button type="button" data-header-control={id}>
                <FigureSeat name="header" priority={2} />
              </button>
            </header>
          ) : null,
      })
    },
  })
  const report = (value: FigureReport) => act(() => held.shell!.figure(value))
  return { plugin, report }
}

const said = () => document.querySelector('.omne-figure-layer [role="status"]')?.textContent

describe('外壳：一个页面一个形（FE-I18）', () => {
  it('没登录时形在门上，登录后在家里；页面里始终只有一层形、一个形，大小是 56 乘字号档的系数', async () => {
    const a = reporter('a', 0)
    const headed = reporter('h', 1, true)
    const t = await setup({ modules: [a.plugin, headed.plugin] })
    await act(async () => {
      await settle()
    })
    expect(document.querySelectorAll('.omne-figure-layer')).toHaveLength(1)
    expect(document.querySelector('[data-figure-seat="gate"]')).not.toBeNull()
    expect(activeSeat()?.dataset['figureSeat']).toBe('gate')
    act(() => t.login.set('signed-in'))
    expect(document.querySelectorAll('.omne-figure-layer')).toHaveLength(1)
    expect(document.querySelector('[data-figure-seat="gate"]')).toBeNull()
    expect(activeSeat()?.dataset['figureSeat']).toBe('home')
    act(() => t.service.navigate('h'))
    expect(activeSeat()?.dataset['figureSeat']).toBe('header')
    const figures = document.querySelectorAll<HTMLElement>('.omne-figure-carried')
    expect(figures).toHaveLength(1)
    expect(figures[0]!.style.width).toBe('56px')
  })
})

describe('外壳：形口合并之后交给形', () => {
  it('放了当前页的模块在前台；别的模块不是 idle 的只算后台；前台的活动写成一句隐藏的状态', async () => {
    const a = reporter('a', 0)
    const b = reporter('b', 1)
    const t = await setup({ login: 'signed-in', modules: [a.plugin, b.plugin] })
    expect(said()).toBe('Agent 闲着')
    a.report({ doing: 'writing', subject: '整理清单' })
    expect(said()).toBe('Agent 在写：整理清单')
    b.report({ doing: 'thinking' })
    expect(said()).toBe('Agent 在写：整理清单')
    a.report({ doing: 'idle' })
    expect(said()).toBe('Agent 在后台做事')
    act(() => t.service.navigate('b'))
    expect(said()).toBe('Agent 在想')
    b.report({ doing: 'looking', subject: '日历' })
    expect(said()).toBe('Agent 在查：日历')
  })

  it('模块卸载，它的报告随之撤掉', async () => {
    const a = reporter('a', 0)
    const b = reporter('b', 1)
    const t = await setup({ login: 'signed-in', modules: [a.plugin, b.plugin] })
    b.report({ doing: 'thinking' })
    expect(said()).toBe('Agent 在后台做事')
    await act(async () => {
      t.root.registry.delete(b.plugin)
      await settle()
    })
    expect(said()).toBe('Agent 闲着')
  })

  it('家可按：去次序最前的一页；待答数大于零时去报了待答的、次序最前的那一页', async () => {
    const a = reporter('a', 0)
    const b = reporter('b', 1)
    const c = reporter('c', 2)
    const t = await setup({ login: 'signed-in', modules: [a.plugin, b.plugin, c.plugin] })
    act(() => t.service.navigate('c'))
    act(() => home()!.click())
    expect(current()).toBe('家')
    c.report({ doing: 'idle', waiting: 1, waitingPage: 'c' })
    b.report({ doing: 'idle', waiting: 2, waitingPage: 'b' })
    act(() => home()!.click())
    expect(current()).toBe('页b')
    b.report({ doing: 'idle', waiting: 0, waitingPage: 'b' })
    act(() => home()!.click())
    expect(current()).toBe('页c')
    c.report({ doing: 'idle' })
    act(() => home()!.click())
    expect(current()).toBe('家')
  })
})

describe('外壳：按形', () => {
  it('按形等于按它坐的那个座位所在的控件：在家是家，在一页的头上是那页头上的控件', () => {
    const pressed: string[] = []
    const view = render(
      <div>
        <button type="button" onClick={() => pressed.push('home')}>
          <span data-figure-seat="home" />
        </button>
        <header>
          <button type="button" onClick={() => pressed.push('header')}>
            <span data-figure-seat="header" />
          </button>
        </header>
      </div>,
    )
    pressSeat()
    expect(pressed).toEqual(['header'])
    view.container.querySelector('header')!.setAttribute('hidden', '')
    pressSeat()
    expect(pressed).toEqual(['header', 'home'])
  })

  it('坐在门上时没有控件，按形什么都不做', () => {
    render(<span data-figure-seat="gate" />)
    expect(activeSeat()?.dataset['figureSeat']).toBe('gate')
    expect(() => pressSeat()).not.toThrow()
  })
})
