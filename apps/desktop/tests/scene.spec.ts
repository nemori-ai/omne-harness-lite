import { describe, expect, it } from 'vitest'
import { readDown, readUp } from '../src/page/desk/scene.ts'

const SCENE = {
  lease: 3,
  serial: 2,
  look: { theme: 'light', size: 'medium', reduced: false },
  figure: { waiting: 0 },
  where: { mode: 'rest', at: { x: 10, y: 20 } },
  label: null,
  note: null,
}
const sceneWith = (more: object) => ({ kind: 'scene', scene: { ...SCENE, ...more } })
const without = (key: keyof typeof SCENE) => ({
  kind: 'scene',
  scene: Object.fromEntries(Object.entries(SCENE).filter(([name]) => name !== key)),
})

describe('从外壳到桌面层的消息', () => {
  it('形状对的一幕与手的小消息原样过', () => {
    const scenes = [
      { kind: 'scene', scene: SCENE },
      sceneWith({ where: { mode: 'none' } }),
      sceneWith({ where: { mode: 'hand', at: { x: 1, y: 2 } } }),
      sceneWith({ where: { mode: 'home', at: { x: 1, y: 2 } } }),
      { kind: 'hand', lease: 3, at: { x: 4, y: 5 } },
    ]
    for (const message of scenes) expect(readDown(message)).toBe(message)
  })

  it('形状不对的答 undefined：不是对象、不认识的种类、缺字段、类型不对', () => {
    const wrong: unknown[] = [
      undefined,
      null,
      5,
      'scene',
      {},
      { kind: 'other', scene: SCENE },
      { kind: 'scene' },
      { kind: 'scene', scene: null },
      without('lease'),
      without('serial'),
      without('look'),
      without('figure'),
      without('where'),
      sceneWith({ lease: '3' }),
      sceneWith({ serial: Number.NaN }),
      sceneWith({ look: null }),
      sceneWith({ figure: 'idle' }),
      sceneWith({ where: null }),
      sceneWith({ where: { mode: 'away', at: { x: 1, y: 2 } } }),
      sceneWith({ where: { mode: 'rest' } }),
      sceneWith({ where: { mode: 'hand', at: { x: 1 } } }),
      sceneWith({ where: { mode: 'home', at: { x: '1', y: 2 } } }),
      { kind: 'hand', at: { x: 4, y: 5 } },
      { kind: 'hand', lease: Number.POSITIVE_INFINITY, at: { x: 4, y: 5 } },
      { kind: 'hand', lease: 3 },
      { kind: 'hand', lease: 3, at: { x: 4, y: null } },
    ]
    for (const message of wrong) expect(readDown(message), JSON.stringify(message)).toBeUndefined()
  })
})

describe('从桌面层到外壳的消息', () => {
  it('形状对的交接、人的输入与发送原样过', () => {
    const right = [
      { kind: 'painted', lease: 1, serial: 2 },
      { kind: 'arrived', lease: 1, serial: 2 },
      { kind: 'cleared', lease: 1, serial: 2 },
      { kind: 'input', lease: 1, input: 'lift', at: null },
      { kind: 'input', lease: 1, input: 'drop', at: { x: 3, y: 4 } },
      { kind: 'input', lease: 1, input: 'show', at: null },
      { kind: 'input', lease: 1, input: 'send', words: '你好', to: { kind: 'new' } },
      { kind: 'input', lease: 1, input: 'send', words: '', to: { kind: 'target', key: 's-1' } },
    ]
    for (const message of right) expect(readUp(message)).toBe(message)
  })

  it('报到只留种类', () => {
    expect(readUp({ kind: 'hello', lease: 4 })).toEqual({ kind: 'hello' })
  })

  it('形状不对的答 undefined：不是对象、不认识的种类、缺字段、类型不对', () => {
    const wrong: unknown[] = [
      undefined,
      null,
      7,
      'hello',
      {},
      { kind: 'other', lease: 1, serial: 2 },
      { kind: 'painted', serial: 2 },
      { kind: 'arrived', lease: 1 },
      { kind: 'cleared', lease: '1', serial: 2 },
      { kind: 'painted', lease: 1, serial: Number.NaN },
      { kind: 'input', input: 'lift', at: null },
      { kind: 'input', lease: 1, input: 'jump', at: null },
      { kind: 'input', lease: 1, input: 'lift' },
      { kind: 'input', lease: 1, input: 'drop', at: { x: 3 } },
      { kind: 'input', lease: 1, input: 'send', to: { kind: 'new' } },
      { kind: 'input', lease: 1, input: 'send', words: 5, to: { kind: 'new' } },
      { kind: 'input', input: 'send', words: '你好', to: { kind: 'new' } },
      { kind: 'input', lease: 1, input: 'send', words: '你好' },
      { kind: 'input', lease: 1, input: 'send', words: '你好', to: { kind: 'other' } },
      { kind: 'input', lease: 1, input: 'send', words: '你好', to: { kind: 'target' } },
      { kind: 'input', lease: 1, input: 'send', words: '你好', to: { kind: 'target', key: 9 } },
    ]
    for (const message of wrong) expect(readUp(message), JSON.stringify(message)).toBeUndefined()
  })
})

describe('读窗口多出的消息', () => {
  it('图的字节单走一条，形状对的原样过，不对的答 undefined', () => {
    const right = { kind: 'picture', id: '1', bytes: new Uint8Array([1, 2]) }
    expect(readDown(right)).toBe(right)
    const wrong: unknown[] = [
      { kind: 'picture', bytes: new Uint8Array([1]) },
      { kind: 'picture', id: 1, bytes: new Uint8Array([1]) },
      { kind: 'picture', id: '1', bytes: [1, 2] },
      { kind: 'picture', id: '1' },
    ]
    for (const message of wrong) expect(readDown(message)).toBeUndefined()
  })

  it('修饰键、去掉一张图、打开系统设置、发送带图的标识：形状对的原样过', () => {
    const right = [
      { kind: 'input', lease: 1, input: 'move', at: { x: 3, y: 4 }, meta: true },
      { kind: 'input', lease: 1, input: 'drop', at: { x: 3, y: 4 }, meta: true, shift: true },
      { kind: 'input', lease: 1, input: 'settings', at: null },
      { kind: 'input', lease: 1, input: 'unpicture', picture: '2' },
      { kind: 'input', lease: 1, input: 'send', words: '', to: { kind: 'new' }, pictures: ['1'] },
    ]
    for (const message of right) expect(readUp(message)).toBe(message)
  })

  it('形状不对的答 undefined', () => {
    const wrong: unknown[] = [
      { kind: 'input', lease: 1, input: 'move', at: null, meta: 'yes' },
      { kind: 'input', lease: 1, input: 'drop', at: null, shift: 1 },
      { kind: 'input', lease: 1, input: 'unpicture' },
      { kind: 'input', lease: 1, input: 'unpicture', picture: 2 },
      { kind: 'input', input: 'unpicture', picture: '2' },
      { kind: 'input', lease: 1, input: 'send', words: '', to: { kind: 'new' }, pictures: '1' },
      { kind: 'input', lease: 1, input: 'send', words: '', to: { kind: 'new' }, pictures: [1] },
    ]
    for (const message of wrong) expect(readUp(message), JSON.stringify(message)).toBeUndefined()
  })
})
