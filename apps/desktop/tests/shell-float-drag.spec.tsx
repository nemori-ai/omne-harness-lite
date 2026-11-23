// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent } from '@testing-library/react'
import type { Plugin } from '@deepseek-ai/cordis'
import { FLOAT_GRIP_ATTRIBUTE, type FloatProps } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { FloatPlace } from '../src/page/shell/float-place.ts'
import { fakeGate } from './support/fake-modules.tsx'
import { setup } from './support/shell-setup.tsx'

afterEach(() => cleanup())

const WINDOW = { width: 1000, height: 800 }
const SIZE = { width: 100, height: 60 }

/** The window and the frame have a size: the frame sits where its inline style puts it. */
function sized(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const box = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
      }) as DOMRect
    if (this.classList.contains('shell-float')) return box(0, 0, WINDOW.width, WINDOW.height)
    if (!this.classList.contains('shell-float-item')) return box(0, 0, 0, 0)
    const style = (this as HTMLElement).style
    const px = (name: string): number | undefined =>
      style.getPropertyValue(name) === ''
        ? undefined
        : Number.parseFloat(style.getPropertyValue(name))
    const left = px('left') ?? WINDOW.width - SIZE.width - (px('right') ?? 0)
    const top = px('top') ?? WINDOW.height - SIZE.height - (px('bottom') ?? 0)
    return box(left, top, SIZE.width, SIZE.height)
  })
}

const seen: FloatProps[] = []
let clicks = 0

function pet(): Plugin.Object {
  return defineUiModule({
    name: 'pet',
    needs: {},
    apply(shell) {
      shell.contribute('float', {
        id: 'pet',
        order: 0,
        render: props => {
          seen.push(props)
          return (
            <div data-pet="">
              <button type="button" data-handle="" {...props.grip} onClick={() => (clicks += 1)}>
                宠
              </button>
              <input data-field="" aria-label="话" />
            </div>
          )
        },
      })
    },
  })
}

const frame = () => document.querySelector<HTMLElement>('.shell-float-item')!
const handle = () => document.querySelector<HTMLElement>('[data-handle]')!
const field = () => document.querySelector<HTMLElement>('[data-field]')!
const at = (x: number, y: number, more: object = {}) => ({
  pointerId: 1,
  isPrimary: true,
  button: 0,
  buttons: 1,
  clientX: x,
  clientY: y,
  ...more,
})
const styled = () => {
  const { left, right, top, bottom } = frame().style
  return Object.fromEntries(
    Object.entries({ left, right, top, bottom }).filter(([, value]) => value !== ''),
  )
}

async function mounted(stored?: FloatPlace) {
  const held = new Map<string, FloatPlace>(stored === undefined ? [] : [['pet', stored]])
  const t = await setup({
    login: 'signed-in',
    modules: [fakeGate(), pet()],
    floats: { read: id => held.get(id), write: (id, place) => void held.set(id, place) },
  })
  return { t, held }
}

beforeEach(() => {
  seen.length = 0
  clicks = 0
  sized()
})
afterEach(() => vi.restoreAllMocks())

describe('浮层的一项：位置', () => {
  it('没记过时在右下角，告诉这一项它靠着哪个角、没被拖着，交给它可以拖的那组属性', async () => {
    await mounted()
    expect(styled()).toEqual({ right: '24px', bottom: '24px' })
    expect(seen.at(-1)).toMatchObject({ corner: { x: 'end', y: 'end' }, dragging: false })
    expect(seen.at(-1)?.grip).toEqual({ [FLOAT_GRIP_ATTRIBUTE]: '' })
    expect(frame().getAttribute('data-float')).toBe('pet')
  })

  it('记过的位置重新打开还在', async () => {
    await mounted({ x: { from: 'start', gap: 30 }, y: { from: 'start', gap: 40 } })
    expect(styled()).toEqual({ left: '30px', top: '40px' })
    expect(seen.at(-1)?.corner).toEqual({ x: 'start', y: 'start' })
  })

  it('记着的距离比窗口还大时，夹到整个在窗口里', async () => {
    await mounted({ x: { from: 'start', gap: 5000 }, y: { from: 'end', gap: 5000 } })
    expect(styled()).toEqual({ left: '900px', bottom: '740px' })
  })
})

describe('浮层的一项：拖动的全化表', () => {
  it('停着，按在别处：指针归这一项，之后怎么动都不拖', async () => {
    const { held } = await mounted()
    fireEvent.pointerDown(field(), at(950, 760))
    fireEvent.pointerMove(field(), at(500, 400))
    fireEvent.pointerUp(field(), at(500, 400))
    expect(styled()).toEqual({ right: '24px', bottom: '24px' })
    expect(held.size).toBe(0)
    expect(seen.every(props => !props.dragging)).toBe(true)
  })

  it('停着，没按下的移动与松开：不变', async () => {
    await mounted()
    fireEvent.pointerMove(handle(), at(500, 400, { buttons: 0 }))
    fireEvent.pointerUp(handle(), at(500, 400))
    expect(styled()).toEqual({ right: '24px', bottom: '24px' })
  })

  it('按着，移动没过阈值就松开：不拖，这一下照常是点', async () => {
    const { held } = await mounted()
    fireEvent.pointerDown(handle(), at(900, 740))
    fireEvent.pointerMove(handle(), at(902, 742))
    fireEvent.pointerUp(handle(), at(902, 742))
    fireEvent.click(handle())
    expect(clicks).toBe(1)
    expect(held.size).toBe(0)
    expect(seen.every(props => !props.dragging)).toBe(true)
  })

  it('按着，移动过了阈值：拖着，位置跟着指针，这一项知道自己被拖着、靠着哪个角', async () => {
    await mounted()
    fireEvent.pointerDown(handle(), at(900, 740))
    fireEvent.pointerMove(handle(), at(300, 200))
    expect(styled()).toEqual({ left: '276px', top: '176px' })
    expect(seen.at(-1)).toMatchObject({ dragging: true, corner: { x: 'start', y: 'start' } })
    expect(frame().hasAttribute('data-dragging')).toBe(true)
    fireEvent.pointerMove(handle(), at(301, 201))
    expect(styled()).toEqual({ left: '277px', top: '177px' })
  })

  it('拖着，松开：记下落点，回到停着；随后的那一下点吃掉，再下一下照常', async () => {
    const { held } = await mounted()
    fireEvent.pointerDown(handle(), at(900, 740))
    fireEvent.pointerMove(handle(), at(300, 200))
    fireEvent.pointerUp(handle(), at(300, 200))
    expect(held.get('pet')).toEqual({
      x: { from: 'start', gap: 276 },
      y: { from: 'start', gap: 176 },
    })
    expect(styled()).toEqual({ left: '276px', top: '176px' })
    expect(seen.at(-1)?.dragging).toBe(false)
    expect(frame().hasAttribute('data-dragging')).toBe(false)
    fireEvent.click(handle())
    expect(clicks).toBe(0)
    fireEvent.click(handle())
    expect(clicks).toBe(1)
  })

  it('拖着，取消：回到拖之前的位置，什么都不记', async () => {
    const { held } = await mounted()
    fireEvent.pointerDown(handle(), at(900, 740))
    fireEvent.pointerMove(handle(), at(300, 200))
    fireEvent.pointerCancel(handle(), at(300, 200))
    expect(styled()).toEqual({ right: '24px', bottom: '24px' })
    expect(held.size).toBe(0)
    expect(seen.at(-1)?.dragging).toBe(false)
    fireEvent.click(handle())
    expect(clicks).toBe(1)
  })

  it('按着，取消：回到停着，之后的移动不拖', async () => {
    await mounted()
    fireEvent.pointerDown(handle(), at(900, 740))
    fireEvent.pointerCancel(handle(), at(900, 740))
    fireEvent.pointerMove(handle(), at(300, 200))
    expect(styled()).toEqual({ right: '24px', bottom: '24px' })
  })

  it('按下之后指针一下就出了这一项：移动与松开落在别处，照样拖、照样记', async () => {
    const { held } = await mounted()
    fireEvent.pointerDown(handle(), at(900, 740))
    fireEvent.pointerMove(document.body, at(300, 200))
    expect(styled()).toEqual({ left: '276px', top: '176px' })
    expect(seen.at(-1)?.dragging).toBe(true)
    fireEvent.pointerUp(document.body, at(300, 200))
    expect(held.get('pet')).toEqual({
      x: { from: 'start', gap: 276 },
      y: { from: 'start', gap: 176 },
    })
    expect(seen.at(-1)?.dragging).toBe(false)
    fireEvent.pointerMove(document.body, at(100, 100))
    expect(styled()).toEqual({ left: '276px', top: '176px' })
  })

  it('这一项卸下之后，窗口上不留监听', async () => {
    const { t } = await mounted()
    fireEvent.pointerDown(handle(), at(900, 740))
    await act(async () => {
      t.login.set('signed-out')
    })
    expect(() => fireEvent.pointerMove(document.body, at(300, 200))).not.toThrow()
    expect(seen.every(props => !props.dragging)).toBe(true)
  })

  it('拖到窗口外面：留在窗口里', async () => {
    const { held } = await mounted()
    fireEvent.pointerDown(handle(), at(900, 740))
    fireEvent.pointerMove(handle(), at(-400, -300))
    fireEvent.pointerUp(handle(), at(-400, -300))
    expect(held.get('pet')).toEqual({ x: { from: 'start', gap: 0 }, y: { from: 'start', gap: 0 } })
  })

  it('不是主键、不是第一个指针：不算按下', async () => {
    await mounted()
    fireEvent.pointerDown(handle(), at(900, 740, { button: 2 }))
    fireEvent.pointerMove(handle(), at(300, 200))
    fireEvent.pointerUp(handle(), at(300, 200))
    fireEvent.pointerDown(handle(), at(900, 740, { isPrimary: false, pointerId: 2 }))
    fireEvent.pointerMove(handle(), at(300, 200, { pointerId: 2 }))
    expect(styled()).toEqual({ right: '24px', bottom: '24px' })
  })

  it('按着之后松开没送到（指针在别处抬起）：下一次没按着的移动不拖', async () => {
    await mounted()
    fireEvent.pointerDown(handle(), at(900, 740))
    fireEvent.pointerMove(handle(), at(300, 200, { buttons: 0 }))
    fireEvent.pointerMove(handle(), at(200, 100, { buttons: 0 }))
    expect(styled()).toEqual({ right: '24px', bottom: '24px' })
  })
})
