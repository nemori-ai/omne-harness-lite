import { describe, expect, it } from 'vitest'
import { readDown, readIn, readLook, readUp } from '../src/page/desk/scene.ts'

const SCENE = {
  lease: 3,
  serial: 2,
  look: { theme: 'light', size: 'medium', reduced: false, issuer: 'shell-1', version: 1 },
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

const SOURCE = { module: '/bridge/plugins/sea/1/icons.js', export: 'send' }
const LOOK = {
  issuer: 'shell-1',
  version: 2,
  scope: 'tenant-a',
  css: '@layer omne-changes{}',
  drawings: [
    { point: 'shell.icon', key: 'send', source: SOURCE },
    {
      point: 'shell.piece',
      key: 'figure',
      source: { ...SOURCE, export: 'figure', files: '/bridge/plugins/sea/1/' },
    },
  ],
}
const lookWith = (more: object) => ({ kind: 'look', look: { ...LOOK, ...more } })
const lookWithout = (key: keyof typeof LOOK) => ({
  kind: 'look',
  look: Object.fromEntries(Object.entries(LOOK).filter(([name]) => name !== key)),
})
const drawingWith = (more: object) => lookWith({ drawings: [{ ...LOOK.drawings[0], ...more }] })

describe('改动的投影：下行', () => {
  it('形状对的投影原样过：没登录时没有 scope，一个出处都没列也行', () => {
    const right = [{ kind: 'look', look: LOOK }, lookWithout('scope'), lookWith({ drawings: [] })]
    for (const message of right) expect(readLook(message), JSON.stringify(message)).toBe(message)
  })

  it('投影不是一幕、一幕也不是投影：各自的读法不认对方', () => {
    expect(readDown({ kind: 'look', look: LOOK })).toBeUndefined()
    expect(readLook({ kind: 'scene', scene: SCENE })).toBeUndefined()
  })

  it('一幕的观感带着 issuer 与 version 时原样过', () => {
    const message = sceneWith({ look: { ...SCENE.look, issuer: 'shell-1', version: 3 } })
    expect(readDown(message)).toBe(message)
  })

  it('一幕的观感里 issuer 或 version 缺了或类型不对，答 undefined', () => {
    const wrong = [
      sceneWith({ look: { ...SCENE.look, issuer: 1, version: 3 } }),
      sceneWith({ look: { ...SCENE.look, issuer: 'shell-1', version: '3' } }),
      sceneWith({ look: { theme: 'light', size: 'medium', reduced: false, version: 3 } }),
      sceneWith({ look: { theme: 'light', size: 'medium', reduced: false, issuer: 'shell-1' } }),
    ]
    for (const message of wrong) expect(readDown(message), JSON.stringify(message)).toBeUndefined()
  })

  it('形状不对的投影答 undefined：缺字段、类型不对、出处不全', () => {
    const wrong: unknown[] = [
      undefined,
      'look',
      { kind: 'look' },
      { kind: 'look', look: null },
      lookWithout('issuer'),
      lookWithout('version'),
      lookWithout('css'),
      lookWithout('drawings'),
      lookWith({ issuer: 1 }),
      lookWith({ version: '2' }),
      lookWith({ scope: null }),
      lookWith({ css: null }),
      lookWith({ drawings: {} }),
      lookWith({ drawings: [null] }),
      drawingWith({ point: 1 }),
      drawingWith({ key: undefined }),
      drawingWith({ source: null }),
      drawingWith({ source: { export: 'send' } }),
      drawingWith({ source: { module: 'x.js' } }),
      drawingWith({ source: { ...SOURCE, files: 3 } }),
    ]
    for (const message of wrong) expect(readLook(message), JSON.stringify(message)).toBeUndefined()
  })
})

const UNDRAWN = {
  kind: 'undrawn',
  issuer: 'shell-1',
  scope: 'tenant-a',
  point: 'shell.icon',
  key: 'send',
  module: SOURCE.module,
  export: 'send',
  reason: 'the export is not a function',
}
const NAVIGATE = { kind: 'navigate', issuer: 'shell-1', scope: 'tenant-a', page: 'chat' }
const TOAST = {
  kind: 'toast',
  issuer: 'shell-1',
  scope: 'tenant-a',
  toast: { id: 't-1', tone: 'info', title: '画好了' },
}
const upWith = (message: Readonly<Record<string, unknown>>, more: object) => ({
  ...message,
  ...more,
})
const upWithout = (message: Readonly<Record<string, unknown>>, key: string) =>
  Object.fromEntries(Object.entries(message).filter(([name]) => name !== key))
const toastWith = (more: object) => ({ ...TOAST, toast: { ...TOAST.toast, ...more } })

describe('画法宿主的上行', () => {
  it('形状对的没得到画法、切页与提示原样过', () => {
    const right = [
      UNDRAWN,
      upWithout(UNDRAWN, 'scope'),
      NAVIGATE,
      upWith(NAVIGATE, { subject: 'session-1' }),
      TOAST,
      toastWith({ tone: 'attention', body: '一行', action: { label: '去看', page: 'chat' } }),
      toastWith({ action: { label: '去看', page: 'chat', subject: 'session-1' } }),
    ]
    for (const message of right) expect(readUp(message), JSON.stringify(message)).toBe(message)
  })

  it('形状不对的答 undefined：缺字段、类型不对', () => {
    const wrong: unknown[] = [
      ...['issuer', 'point', 'key', 'module', 'export', 'reason'].map(key =>
        upWithout(UNDRAWN, key),
      ),
      upWith(UNDRAWN, { scope: 4 }),
      upWith(UNDRAWN, { reason: null }),
      ...['issuer', 'scope', 'page'].map(key => upWithout(NAVIGATE, key)),
      upWith(NAVIGATE, { page: 5 }),
      upWith(NAVIGATE, { subject: 5 }),
      ...['issuer', 'scope', 'toast'].map(key => upWithout(TOAST, key)),
      upWith(TOAST, { scope: null }),
      upWith(TOAST, { toast: 'hi' }),
      toastWith({ id: 1 }),
      toastWith({ tone: 'loud' }),
      toastWith({ title: undefined }),
      toastWith({ body: 2 }),
      toastWith({ action: { page: 'chat' } }),
      toastWith({ action: { label: '去看', page: 'chat', subject: 1 } }),
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

describe('说话笺的字跟着外壳的状态', () => {
  const NOTE = {
    targets: [{ key: 's-1', label: '周报' }],
    to: { kind: 'new' },
    fate: null,
    words: '写了一半',
    edit: 2,
  }
  const noteWith = (more: object) => sceneWith({ note: { ...NOTE, ...more } })
  const noteWithout = (key: keyof typeof NOTE) =>
    sceneWith({ note: Object.fromEntries(Object.entries(NOTE).filter(([name]) => name !== key)) })
  const UNSENT = { kind: 'input', lease: 1, input: 'unsent', words: '写了一半', edit: 2 }

  it('一幕的笺带整段字与 edit 号，人选过说给谁时也带它：形状对的原样过', () => {
    const right = [
      noteWith({}),
      noteWith({ words: '' }),
      noteWith({ chosen: { kind: 'new' } }),
      noteWith({ chosen: { kind: 'target', key: 's-1' } }),
    ]
    for (const message of right) expect(readDown(message)).toBe(message)
  })

  it('一幕的笺缺字或 edit 号、类型不对，或说给谁形状不对：答 undefined', () => {
    const wrong: unknown[] = [
      noteWithout('words'),
      noteWithout('edit'),
      noteWith({ words: 5 }),
      noteWith({ edit: '2' }),
      noteWith({ edit: Number.NaN }),
      noteWith({ chosen: { kind: 'target' } }),
      noteWith({ chosen: 'new' }),
    ]
    for (const message of wrong) expect(readDown(message), JSON.stringify(message)).toBeUndefined()
  })

  it('上行 unsent 带租约号、整段字、对着的 edit 号，人选过时带说给谁：形状对的原样过', () => {
    const right = [
      UNSENT,
      { ...UNSENT, words: '' },
      { ...UNSENT, chosen: { kind: 'new' } },
      { ...UNSENT, chosen: { kind: 'target', key: 's-1' } },
    ]
    for (const message of right) expect(readUp(message)).toBe(message)
  })

  it('unsent 缺租约号、字或 edit 号，类型不对，或说给谁形状不对：答 undefined', () => {
    const without = (key: keyof typeof UNSENT) =>
      Object.fromEntries(Object.entries(UNSENT).filter(([name]) => name !== key))
    const wrong: unknown[] = [
      without('lease'),
      without('words'),
      without('edit'),
      { ...UNSENT, words: 5 },
      { ...UNSENT, edit: '2' },
      { ...UNSENT, chosen: { kind: 'target', key: 9 } },
      { ...UNSENT, chosen: null },
    ]
    for (const message of wrong) expect(readUp(message), JSON.stringify(message)).toBeUndefined()
  })

  it('一幕的笺带回的话（整段字、三种状态之一、后面还有）与现成的话（键与按钮上的字）：形状对的原样过', () => {
    const right = [
      noteWith({ reply: { text: '', state: 'coming' } }),
      noteWith({ reply: { text: '看过了', state: 'ended', more: true } }),
      noteWith({ reply: { text: '一半', state: 'unknown' } }),
      noteWith({ phrases: [] }),
      noteWith({ phrases: [{ key: 'shell.todo', label: '记成待办' }] }),
    ]
    for (const message of right) expect(readDown(message)).toBe(message)
  })

  it('回的话或现成的话形状不对：答 undefined', () => {
    const wrong: unknown[] = [
      noteWith({ reply: { state: 'coming' } }),
      noteWith({ reply: { text: '一半', state: 'said' } }),
      noteWith({ reply: { text: '一半', state: 'coming', more: false } }),
      noteWith({ reply: '一半' }),
      noteWith({ phrases: [{ key: 'shell.todo' }] }),
      noteWith({ phrases: [{ key: 7, label: '记成待办' }] }),
      noteWith({ phrases: { key: 'shell.todo', label: '记成待办' } }),
    ]
    for (const message of wrong) expect(readDown(message), JSON.stringify(message)).toBeUndefined()
  })

  it('上行 phrase 带租约号与键：形状对的原样过；缺租约号或键、类型不对，答 undefined', () => {
    const PHRASE = { kind: 'input', lease: 1, input: 'phrase', key: 'shell.todo' }
    expect(readUp(PHRASE)).toBe(PHRASE)
    const wrong: unknown[] = [
      { kind: 'input', lease: 1, input: 'phrase' },
      { kind: 'input', input: 'phrase', key: 'shell.todo' },
      { ...PHRASE, key: 3 },
      { ...PHRASE, lease: '1' },
    ]
    for (const message of wrong) expect(readUp(message), JSON.stringify(message)).toBeUndefined()
  })
})

describe('从外壳到桌面层：一条消息往哪走', () => {
  const PROJECTION = {
    kind: 'look',
    look: {
      issuer: 'shell-1',
      version: 2,
      css: '',
      drawings: [],
    },
  }

  it('投影先进换画口，不回给页面：命名它的那一幕到的时候它已经在手里', () => {
    const taken: unknown[] = []
    const takeLook = (look: unknown) => void taken.push(look)
    expect(readIn(PROJECTION, takeLook)).toBeUndefined()
    expect(taken).toEqual([PROJECTION.look])
  })

  it('别的小消息读得过就交给页面', () => {
    const hand = { kind: 'hand', lease: 3, at: { x: 4, y: 5 } }
    expect(readIn(hand, () => undefined)).toBe(hand)
    expect(readIn({ kind: 'scene', scene: SCENE }, () => undefined)).toMatchObject({
      kind: 'scene',
    })
  })

  it('读不过的哪一边都不给', () => {
    const taken: unknown[] = []
    const takeLook = (look: unknown) => void taken.push(look)
    expect(readIn({ kind: 'look', look: { issuer: 'shell-1' } }, takeLook)).toBeUndefined()
    expect(readIn({ kind: 'other' }, takeLook)).toBeUndefined()
    expect(taken).toEqual([])
  })
})
