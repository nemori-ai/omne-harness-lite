import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLACE,
  cornerOf,
  kept,
  placeAt,
  storedFloatPlaces,
  styleOf,
  type FloatPlace,
} from '../src/page/shell/float-place.ts'

const WINDOW = { width: 1000, height: 800 }
const ITEM = { width: 100, height: 60 }

describe('浮着的一项的位置', () => {
  it('缺省靠右下角，离两条边一样远', () => {
    expect(cornerOf(DEFAULT_PLACE)).toEqual({ x: 'end', y: 'end' })
    expect(DEFAULT_PLACE.x.gap).toBe(DEFAULT_PLACE.y.gap)
    expect(styleOf(DEFAULT_PLACE)).toEqual({
      right: DEFAULT_PLACE.x.gap,
      bottom: DEFAULT_PLACE.y.gap,
    })
  })

  it('写成样式时，靠哪条边就写哪条边', () => {
    const place: FloatPlace = { x: { from: 'start', gap: 7 }, y: { from: 'end', gap: 9 } }
    expect(styleOf(place)).toEqual({ left: 7, bottom: 9 })
    expect(cornerOf(place)).toEqual({ x: 'start', y: 'end' })
  })

  it('落点换算成靠最近的角：左上角没过中线的靠开头，过了的靠末尾', () => {
    expect(placeAt({ left: 40, top: 30 }, WINDOW, ITEM)).toEqual({
      x: { from: 'start', gap: 40 },
      y: { from: 'start', gap: 30 },
    })
    expect(placeAt({ left: 860, top: 700 }, WINDOW, ITEM)).toEqual({
      x: { from: 'end', gap: 40 },
      y: { from: 'end', gap: 40 },
    })
    expect(placeAt({ left: 450, top: 370 }, WINDOW, ITEM).x.from).toBe('start')
    expect(placeAt({ left: 451, top: 371 }, WINDOW, ITEM)).toEqual({
      x: { from: 'end', gap: 449 },
      y: { from: 'end', gap: 369 },
    })
  })

  it('落点在窗口外面时拉回窗口里：拖不出去', () => {
    expect(placeAt({ left: -50, top: -20 }, WINDOW, ITEM)).toEqual({
      x: { from: 'start', gap: 0 },
      y: { from: 'start', gap: 0 },
    })
    expect(placeAt({ left: 5000, top: 5000 }, WINDOW, ITEM)).toEqual({
      x: { from: 'end', gap: 0 },
      y: { from: 'end', gap: 0 },
    })
  })

  it('窗口比记着的距离小时，距离夹到这一项整个在窗口里；窗口够大时原样', () => {
    const place: FloatPlace = { x: { from: 'start', gap: 600 }, y: { from: 'end', gap: 500 } }
    expect(kept(place, WINDOW, ITEM)).toEqual(place)
    expect(kept(place, { width: 400, height: 300 }, ITEM)).toEqual({
      x: { from: 'start', gap: 300 },
      y: { from: 'end', gap: 240 },
    })
  })

  it('只有一个方向放不下时只夹那个方向，另一个方向原样', () => {
    const place: FloatPlace = { x: { from: 'start', gap: 600 }, y: { from: 'end', gap: 500 } }
    expect(kept(place, { width: 400, height: 800 }, ITEM)).toEqual({
      x: { from: 'start', gap: 300 },
      y: { from: 'end', gap: 500 },
    })
    expect(kept(place, { width: 1000, height: 300 }, ITEM)).toEqual({
      x: { from: 'start', gap: 600 },
      y: { from: 'end', gap: 240 },
    })
  })

  it('这一项比窗口还大时贴着它靠的那个角，距离不为负', () => {
    const small = { width: 80, height: 40 }
    expect(kept(DEFAULT_PLACE, small, ITEM)).toEqual({
      x: { from: 'end', gap: 0 },
      y: { from: 'end', gap: 0 },
    })
    expect(placeAt({ left: 10, top: 10 }, small, ITEM)).toEqual({
      x: { from: 'start', gap: 0 },
      y: { from: 'start', gap: 0 },
    })
  })
})

describe('记在本机的位置', () => {
  const memory = () => {
    const held = new Map<string, string>()
    return {
      held,
      store: {
        getItem: (key: string) => held.get(key) ?? null,
        setItem: (key: string, value: string) => void held.set(key, value),
      },
    }
  }

  it('按标识各记各的，写了就读得回', () => {
    const { store, held } = memory()
    const places = storedFloatPlaces(() => store)
    const place: FloatPlace = { x: { from: 'start', gap: 12 }, y: { from: 'end', gap: 34 } }
    expect(places.read('pet')).toBeUndefined()
    places.write('pet', place)
    expect(places.read('pet')).toEqual(place)
    expect(places.read('other')).toBeUndefined()
    expect([...held.keys()]).toEqual(['omne.float.pet'])
  })

  it('贴着角的位置（距离是 0）也读得回', () => {
    const { store } = memory()
    const places = storedFloatPlaces(() => store)
    const corner: FloatPlace = { x: { from: 'end', gap: 0 }, y: { from: 'start', gap: 0 } }
    places.write('pet', corner)
    expect(places.read('pet')).toEqual(corner)
  })

  it.each([
    ['不是 JSON', 'nope'],
    ['缺一条边', '{"x":{"from":"start","gap":1}}'],
    ['边名不认得', '{"x":{"from":"left","gap":1},"y":{"from":"end","gap":1}}'],
    ['距离不是数', '{"x":{"from":"start","gap":"1"},"y":{"from":"end","gap":1}}'],
    ['距离是负的', '{"x":{"from":"start","gap":-1},"y":{"from":"end","gap":1}}'],
    ['距离不是有限的数', '{"x":{"from":"start","gap":1e999},"y":{"from":"end","gap":1}}'],
    ['是个列表', '[]'],
    ['是空值', 'null'],
  ])('存的文字读不懂（%s）时答没有，不抛', (_name, text) => {
    const { store, held } = memory()
    held.set('omne.float.pet', text)
    expect(storedFloatPlaces(() => store).read('pet')).toBeUndefined()
  })

  it('存储读写抛出时，读答没有，写不抛', () => {
    const places = storedFloatPlaces(() => {
      throw new Error('no storage')
    })
    expect(places.read('pet')).toBeUndefined()
    expect(() => places.write('pet', DEFAULT_PLACE)).not.toThrow()
  })
})
