// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import type { Plugin } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { fakeGate } from './support/fake-modules.tsx'
import { CHAT, chatPage, settle, setup } from './support/shell-setup.tsx'

afterEach(() => cleanup())

const layer = () => document.querySelector('.shell-float')
const floating = () =>
  [...(layer()?.children ?? [])].flatMap(frame =>
    [...frame.children].map(node => node.getAttribute('data-floating')),
  )

function floater(
  id: string,
  order: number,
  render: (scope: string | undefined) => ReactNode = scope => (
    <p data-floating={id} data-scope={scope ?? ''}>{`浮着${id}`}</p>
  ),
): Plugin.Object {
  return defineUiModule({
    name: `floater-${id}`,
    needs: {},
    apply(shell) {
      shell.contribute('float', { id, order, render: ({ scope }) => render(scope) })
    },
  })
}

describe('外壳：浮层', () => {
  it('没有项时没有这一层', async () => {
    await setup({ login: 'signed-in' })
    expect(layer()).toBeNull()
  })

  it('登录之后各项画在主区之外的一层里，按次序排，各自是这一层的直接子元素，收到当前租户', async () => {
    const t = await setup({
      login: 'signed-in',
      modules: [fakeGate(), chatPage, floater('late', 2), floater('early', 1)],
    })
    await t.provide(CHAT)
    act(() => t.state.scope.set('tenant-x'))
    expect(floating()).toEqual(['early', 'late'])
    expect(layer()?.parentElement?.classList.contains('app-shell')).toBe(true)
    expect(layer()?.closest('main')).toBeNull()
    expect(screen.getByText('浮着early').getAttribute('data-scope')).toBe('tenant-x')
    expect(screen.getByText('对话占位')).toBeTruthy()
  })

  it('没登录时不画', async () => {
    const t = await setup({ modules: [fakeGate(), floater('pet', 0)] })
    expect(layer()).toBeNull()
    act(() => t.login.set('signed-in'))
    expect(floating()).toEqual(['pet'])
    act(() => t.login.set('signed-out'))
    expect(layer()).toBeNull()
  })

  it('放它的模块卸载，这一项随之撤掉；最后一项撤了，这一层也没有了', async () => {
    const t = await setup({ login: 'signed-in', modules: [fakeGate(), floater('stay', 0)] })
    let fiber: { dispose(): unknown } | undefined
    await act(async () => {
      fiber = await t.root.plugin(floater('leave', 1))
      await settle()
    })
    expect(floating()).toEqual(['stay', 'leave'])
    await act(async () => {
      await fiber?.dispose()
      await settle()
    })
    expect(floating()).toEqual(['stay'])
  })

  describe('一项坏了', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('只有这一项不画，不写「读不出」；别的项与页面照常', async () => {
      function Boom(): ReactNode {
        throw new Error('boom')
      }
      const t = await setup({
        login: 'signed-in',
        modules: [fakeGate(), chatPage, floater('bad', 0, () => <Boom />), floater('good', 1)],
      })
      await t.provide(CHAT)
      expect(floating()).toEqual(['good'])
      expect(document.querySelector('.shell-item-failed')).toBeNull()
      expect(screen.getByText('对话占位')).toBeTruthy()
    })
  })

  it('这一层自己不接指针，画在它里面的根元素接；它在侧栏之上、告知笺之下', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'page', 'styles.css'), 'utf8')
    const rule = (selector: string): string => {
      const at = css.indexOf(`\n${selector} {`)
      expect(at, selector).toBeGreaterThan(-1)
      return css.slice(at, css.indexOf('}', at))
    }
    const own = rule('.shell-float')
    expect(own).toContain('position: fixed;')
    expect(own).toContain('inset: 0;')
    expect(own).toContain('pointer-events: none;')
    const height = Number(/z-index: (\d+);/u.exec(own)?.[1])
    const sidebar = Number(/z-index: (\d+);/u.exec(rule('.shell-sidebar'))?.[1])
    expect(height).toBeGreaterThan(sidebar)
    expect(height).toBeLessThan(32)
    expect(rule('.shell-float > *')).toContain('pointer-events: auto;')
  })
})
