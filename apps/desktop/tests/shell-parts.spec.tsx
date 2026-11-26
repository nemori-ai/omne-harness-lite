// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react'
import { partsOn } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setup } from './support/shell-setup.tsx'

const OWN = [
  'shell.figure',
  'shell.figure.label',
  'shell.figure.note',
  'shell.figure.told',
  'shell.figure.frame',
  'shell.back',
  'shell.sidebar.turn',
]

type Box = Readonly<{ left: number; top: number; width: number; height: number }>
const rect = ({ left, top, width, height }: Box): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    x: left,
    y: top,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }) as DOMRect

beforeEach(() => {
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset['figureSeat'] === 'home')
      return rect({ left: 12, top: 36, width: 32, height: 32 })
    if (this.classList.contains('shell-fold'))
      return rect({ left: 228, top: 36, width: 32, height: 32 })
    return rect({ left: 0, top: 0, width: 0, height: 0 })
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const back = defineUiModule({
  name: 'back',
  needs: {},
  apply(shell) {
    shell.contribute('back', { id: 'canvas', render: () => <p>反面</p> })
  },
})

const named = (selector: string) => document.querySelector(selector)?.getAttribute('data-omne-part')

describe('外壳为形与它写出来的东西声明的部位（DT-59）', () => {
  it('七个部位都由外壳声明，开令牌与样式两层', async () => {
    const t = await setup({ login: 'signed-in' })
    const read = partsOn(t.root.dynamis.registry())
    if (read.kind !== 'read') throw new Error(`the parts cannot be read: ${read.reason}`)
    const own = read.parts.filter(part => OWN.includes(part.name))
    expect(own.map(part => part.name).sort()).toEqual([...OWN].sort())
    for (const part of own) {
      expect(part.depths, part.name).toEqual(['tokens', 'style'])
      expect(part.by, part.name).toEqual(['DesktopShell'])
    }
  })

  it('窗口里的形的一层、告知笺、反面的外框、翻面的记号带着名字', async () => {
    const t = await setup({ login: 'signed-in', modules: [back] })
    const m = await t.module('m')
    act(() => m.shell.toast({ id: 't-1', tone: 'info', title: '提示' }))
    expect(named('.omne-figure-layer')).toBe('shell.figure')
    expect(named('.omne-told-note')).toBe('shell.figure.told')
    expect(named('#shell-back')).toBe('shell.back')
    expect(named('[data-turn]')).toBe('shell.sidebar.turn')
  })

  it('shell.piece 的说明给出形的三个 phase：seated、flying、held', async () => {
    const t = await setup({ login: 'signed-in' })
    const piece = t.service.described().points.find(point => point.name === 'shell.piece')
    const said = JSON.stringify(piece)
    for (const phase of ['seated:', 'flying:', 'held:']) expect(said).toContain(phase)
  })
})
