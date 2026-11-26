import { describe, expect, it, vi } from 'vitest'
import type { Asked, LookDrawing, LookProjection } from '../src/page/desk/scene.ts'
import { createLookHost, type LookEvent } from '../src/page/surface/look-host.ts'

const ISSUER = 'shell-1'
const SCOPE = 'tenant-a'
const SEA = '/bridge/plugins/sea/1/'
const FIGURE: LookDrawing = {
  point: 'shell.piece',
  key: 'figure',
  source: { module: `${SEA}look.js`, export: 'figure', files: SEA },
}
const SEND: LookDrawing = {
  point: 'shell.icon',
  key: 'send',
  source: { module: `${SEA}icons.js`, export: 'send' },
}
const LOADING: LookDrawing = {
  point: 'shell.piece',
  key: 'loading',
  source: { module: `${SEA}look.js`, export: 'loading', files: SEA },
}

function look(
  version: number,
  drawings: readonly LookDrawing[] = [],
  more: Partial<LookProjection> = {},
): LookProjection {
  return { issuer: ISSUER, version, scope: SCOPE, css: `v${version}`, drawings, ...more }
}

function signedOut(projection: LookProjection): LookProjection {
  const copy: { -readonly [K in keyof LookProjection]: LookProjection[K] } = { ...projection }
  delete copy.scope
  return copy
}

type Deferred = { resolve(value: unknown): void; reject(error: unknown): void }

function setup() {
  const loads: string[] = []
  const pending = new Map<string, Deferred[]>()
  const timers: { ms: number; run: () => void; live: boolean }[] = []
  const steps: string[] = []
  const ups: Asked[] = []
  const events: LookEvent[] = []
  const host = createLookHost({
    load: module => {
      loads.push(module)
      return new Promise((resolve, reject) => {
        pending.set(module, [...(pending.get(module) ?? []), { resolve, reject }])
      })
    },
    given: { React: 'react', ui: 'ui' },
    later: (ms, run) => {
      const timer = { ms, run, live: true }
      timers.push(timer)
      return () => void (timer.live = false)
    },
    wear: {
      adopt: css => void steps.push(`adopt ${css}`),
      drop: () => void steps.push('drop'),
      inked: () => void steps.push('inked'),
    },
    up: asked => void ups.push(asked),
  })
  host.subscribe(event => void events.push(event))
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))
  const answer = async (module: string, file: unknown) => {
    for (const each of pending.get(module)?.splice(0) ?? []) each.resolve(file)
    await flush()
  }
  const fail = async (module: string, error: unknown) => {
    for (const each of pending.get(module)?.splice(0) ?? []) each.reject(error)
    await flush()
  }
  const elapse = () => {
    for (const timer of timers.splice(0)) if (timer.live) timer.run()
  }
  const version = () => host.held()?.version
  return { host, loads, timers, steps, ups, events, answer, fail, elapse, flush, version }
}

const drawing = () => () => 'drawn'
const fileOf = (exports: Record<string, unknown>) => exports

describe('画法宿主的全化表', () => {
  it('收到一份不比手里的新的：不理', async () => {
    const t = setup()
    t.host.take(look(2))
    t.host.take(look(2, [FIGURE], { css: 'other' }))
    t.host.take(look(1, [FIGURE]))
    expect(t.loads).toEqual([])
    expect(t.steps).toEqual(['adopt v2', 'drop', 'inked'])
  })

  it('收到和正在备的是同一份的：不理，不重取', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE]))
    t.host.take(look(1, [FIGURE]))
    expect(t.loads).toEqual([FIGURE.source.module])
    expect(t.timers).toHaveLength(1)
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    expect(t.version()).toBe(1)
    expect(t.steps.filter(step => step.startsWith('adopt'))).toEqual(['adopt v1'])
  })

  it('比手里的新而 issuer 不同：先说手里的幕作废，再照出处换上或改备', async () => {
    const t = setup()
    t.host.take(look(5))
    t.host.take(look(1, [], { issuer: 'shell-2' }))
    expect(t.events).toEqual(['worn', 'void', 'worn'])
    t.host.take(look(1, [FIGURE], { issuer: 'shell-3' }))
    expect(t.events).toEqual(['worn', 'void', 'worn', 'void'])
    expect(t.host.held()).toBeUndefined()
    expect(t.host.drawingAt('shell.piece', 'figure')).toBeUndefined()
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    expect(t.events.at(-1)).toBe('worn')
    expect(t.host.held()?.issuer).toBe('shell-3')
  })

  it('比手里的新，出处都已有画法：丢掉正在备的，立刻换上', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE]))
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    t.host.take(look(2, [FIGURE, SEND]))
    expect(t.version()).toBe(1)
    t.host.take(look(3, [FIGURE]))
    expect(t.version()).toBe(3)
    await t.answer(SEND.source.module, fileOf({ send: drawing }))
    expect(t.version()).toBe(3)
  })

  it('比手里的新，一个出处都没列：立刻换上', () => {
    const t = setup()
    t.host.take(look(1))
    expect(t.version()).toBe(1)
  })

  it('比手里的新，有出处还没有画法：丢掉正在备的，只取还没有画法的', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE]))
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    t.host.take(look(2, [FIGURE, SEND]))
    expect(t.loads).toEqual([FIGURE.source.module, SEND.source.module])
    expect(t.version()).toBe(1)
    await t.answer(SEND.source.module, fileOf({ send: drawing }))
    expect(t.version()).toBe(2)
  })

  it('正在备的每个出处都有了结局：换上它', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE, SEND]))
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    expect(t.host.held()).toBeUndefined()
    await t.fail(SEND.source.module, new Error('gone'))
    expect(t.version()).toBe(1)
    expect(t.host.drawingAt('shell.piece', 'figure')?.({} as never)).toBe('drawn')
    expect(t.host.drawingAt('shell.icon', 'send')).toBeUndefined()
  })

  it('丢掉的那一份里的模块后来有了结局：画法留着，不换上任何东西', async () => {
    const t = setup()
    t.host.take(look(1, [SEND]))
    t.host.take(look(2))
    const worn = t.steps.length
    await t.answer(SEND.source.module, fileOf({ send: drawing }))
    expect(t.version()).toBe(2)
    expect(t.steps).toHaveLength(worn)
    expect(t.ups).toEqual([])
    t.host.take(look(3, [SEND]))
    expect(t.version()).toBe(3)
    expect(t.loads).toEqual([SEND.source.module])
  })

  it('页面重新加载：新的宿主手里没有，收下任何一份', () => {
    const t = setup()
    expect(t.host.held()).toBeUndefined()
    t.host.take(look(1))
    expect(t.version()).toBe(1)
  })
})

describe('画法宿主：出处的结局', () => {
  it('得到过画法的出处留着：之后的版本用同一个画法，导出只调一次', async () => {
    const t = setup()
    const made = vi.fn(drawing)
    t.host.take(look(1, [FIGURE]))
    await t.answer(FIGURE.source.module, fileOf({ figure: made }))
    const first = t.host.drawingAt('shell.piece', 'figure')
    t.host.take(look(2, [FIGURE]))
    expect(t.version()).toBe(2)
    expect(t.host.drawingAt('shell.piece', 'figure')).toBe(first)
    expect(made).toHaveBeenCalledTimes(1)
    expect(t.loads).toHaveLength(1)
  })

  it('没得到的出处不留着：下一个列着它的版本再试', async () => {
    const t = setup()
    t.host.take(look(1, [SEND]))
    await t.fail(SEND.source.module, new Error('offline'))
    t.host.take(look(2, [SEND]))
    expect(t.loads).toEqual([SEND.source.module, SEND.source.module])
    await t.answer(SEND.source.module, fileOf({ send: drawing }))
    expect(t.host.drawingAt('shell.icon', 'send')).toBeDefined()
  })

  it('同一个模块的两个导出只取一次文件', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE, LOADING]))
    expect(t.loads).toEqual([FIGURE.source.module])
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing, loading: drawing }))
    expect(t.version()).toBe(1)
    expect(t.host.drawingAt('shell.piece', 'loading')).toBeDefined()
  })

  const undrawn = (drawn: LookDrawing, reason: unknown) => ({
    kind: 'undrawn',
    issuer: ISSUER,
    scope: SCOPE,
    point: drawn.point,
    key: drawn.key,
    module: drawn.source.module,
    export: drawn.source.export,
    reason,
  })

  it('地址不以 /bridge/plugins/ 开头：不取，上行原因，立刻有结局', () => {
    const t = setup()
    const away = { ...SEND, source: { module: 'https://elsewhere/icons.js', export: 'send' } }
    t.host.take(look(1, [away]))
    expect(t.loads).toEqual([])
    expect(t.version()).toBe(1)
    expect(t.ups).toEqual([undrawn(away, expect.stringContaining('/bridge/plugins/'))])
  })

  it.each([
    '/bridge/plugins/../../assets/main.js',
    '/bridge/plugins/sea/1/./icons.js',
    '/bridge/plugins/sea/1/../../../main.js',
    '/bridge/plugins/sea/1/icons.js?x=1',
    '/bridge/plugins//elsewhere/icons.js',
    '/bridge/plugins/sea/1/a%2f..%2fb.js',
  ])('地址在 /bridge/plugins/ 下但不是一段干净的路径（%s）：不取', module => {
    const t = setup()
    const away = { ...SEND, source: { module, export: 'send' } }
    t.host.take(look(1, [away]))
    expect(t.loads).toEqual([])
    expect(t.version()).toBe(1)
    expect(t.ups).toEqual([undrawn(away, expect.stringContaining('/bridge/plugins/'))])
  })

  it('取不到：上行原因', async () => {
    const t = setup()
    t.host.take(look(1, [SEND]))
    await t.fail(SEND.source.module, new Error('404'))
    expect(t.ups).toEqual([undrawn(SEND, expect.stringContaining('404'))])
    expect(t.version()).toBe(1)
  })

  it('导出不是函数：上行原因', async () => {
    const t = setup()
    t.host.take(look(1, [SEND]))
    await t.answer(SEND.source.module, fileOf({ send: 'not a function' }))
    expect(t.ups).toEqual([undrawn(SEND, expect.stringContaining('no function named send'))])
  })

  it('调导出时抛出，或它交回的不是函数：上行原因', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE, LOADING]))
    const throws = () => {
      throw new Error('broken')
    }
    await t.answer(FIGURE.source.module, fileOf({ figure: throws, loading: () => 'text' }))
    expect(t.ups).toEqual([
      undrawn(FIGURE, expect.stringContaining('broken')),
      undrawn(LOADING, expect.stringContaining('gave no drawing')),
    ])
    expect(t.version()).toBe(1)
  })

  it('从开始取起 4 秒没有结果：有了结局，换上；之后到的画法留着，不换上任何东西', async () => {
    const t = setup()
    t.host.take(look(1, [SEND]))
    expect(t.timers.map(timer => timer.ms)).toEqual([4000])
    t.elapse()
    expect(t.version()).toBe(1)
    expect(t.ups).toEqual([undrawn(SEND, expect.stringContaining('4000'))])
    const worn = t.steps.length
    await t.answer(SEND.source.module, fileOf({ send: drawing }))
    expect(t.steps).toHaveLength(worn)
    expect(t.host.drawingAt('shell.icon', 'send')).toBeUndefined()
    t.host.take(look(2, [SEND]))
    expect(t.version()).toBe(2)
    expect(t.host.drawingAt('shell.icon', 'send')).toBeDefined()
  })

  it('有了结果就不再等钟', async () => {
    const t = setup()
    t.host.take(look(1, [SEND]))
    await t.answer(SEND.source.module, fileOf({ send: drawing }))
    expect(t.timers.map(timer => timer.live)).toEqual([false])
    t.elapse()
    expect(t.ups).toEqual([])
  })

  it.each([
    'https://elsewhere/',
    '/bridge/plugins/sea/1',
    '/bridge/plugins/sea/1x',
    '/bridge/plugins/sea/../',
  ])('放它的一方的文件在哪不是 /bridge/plugins/ 下以 / 结尾的一段干净的路径（%s）：不取', files => {
    const t = setup()
    const away = { ...SEND, source: { ...SEND.source, files } }
    t.host.take(look(1, [away]))
    expect(t.loads).toEqual([])
    expect(t.ups).toEqual([undrawn(away, expect.stringContaining('/bridge/plugins/'))])
  })

  it('取来的文件什么都不是：上行原因', async () => {
    const t = setup()
    t.host.take(look(1, [SEND]))
    await t.answer(SEND.source.module, null)
    expect(t.ups).toEqual([undrawn(SEND, expect.stringContaining('exports no function'))])
  })

  it('同一份再到时不重备：已经没得到的那个出处不重取、不重报', async () => {
    const t = setup()
    const other = { ...SEND, source: { module: `${SEA}other.js`, export: 'send' } }
    t.host.take(look(1, [other, FIGURE]))
    await t.fail(other.source.module, new Error('404'))
    t.host.take(look(1, [other, FIGURE]))
    expect(t.loads).toEqual([other.source.module, FIGURE.source.module])
    expect(t.ups).toHaveLength(1)
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    expect(t.version()).toBe(1)
    expect(t.ups).toHaveLength(1)
  })

  it('丢掉的那一份里别的出处还没有结局：新的一份不等它们', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE]))
    t.host.take(look(2, [SEND]))
    await t.answer(SEND.source.module, fileOf({ send: drawing }))
    expect(t.version()).toBe(2)
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    expect(t.version()).toBe(2)
    expect(t.ups).toEqual([])
  })

  it('正在取的出处被新的一份列着：接着等它，不另起一只钟', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE]))
    t.host.take(look(2, [FIGURE, SEND]))
    expect(t.timers).toHaveLength(2)
    expect(t.loads).toEqual([FIGURE.source.module, SEND.source.module])
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    await t.answer(SEND.source.module, fileOf({ send: drawing }))
    expect(t.version()).toBe(2)
  })

  it('没登录的一份列着以前得到过的画法：画法表是空的', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE]))
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    expect(t.host.drawingAt('shell.piece', 'figure')).toBeDefined()
    t.host.take(signedOut(look(2, [FIGURE])))
    expect(t.version()).toBe(2)
    expect(t.host.drawingAt('shell.piece', 'figure')).toBeUndefined()
  })

  it('没登录或没有画法：一个模块都不取，立刻换上，样式文本照样收养', () => {
    const t = setup()
    t.host.take(signedOut(look(1, [FIGURE, SEND])))
    t.host.take(look(2, []))
    expect(t.loads).toEqual([])
    expect(t.steps).toEqual(['adopt v1', 'drop', 'inked', 'adopt v2', 'inked'])
    expect(t.host.drawingAt('shell.piece', 'figure')).toBeUndefined()
  })
})

describe('画法宿主：调导出时交的东西', () => {
  async function handed(drawn: LookDrawing) {
    const t = setup()
    let given: Record<string, unknown> = {}
    t.host.take(look(1, [drawn]))
    await t.answer(drawn.source.module, {
      [drawn.source.export]: (handed: Record<string, unknown>) => {
        given = handed
        return drawing()
      },
    })
    return { t, given }
  }

  it('交 React、ui、shell 与有 files 时的 files，冻住', async () => {
    const { given } = await handed(FIGURE)
    expect(Object.keys(given).sort()).toEqual(['React', 'files', 'shell', 'ui'])
    expect(given['React']).toBe('react')
    expect(given['ui']).toBe('ui')
    expect(Object.isFrozen(given)).toBe(true)
    expect(Object.isFrozen(given['shell'])).toBe(true)
    const files = given['files'] as { url(path: string): string | undefined }
    expect(files.url('pics/sea.png')).toBe(`${SEA}pics/sea.png`)
    expect(files.url('../other/x.png')).toBeUndefined()
  })

  it('出处没有 files 时不交 files', async () => {
    const { given } = await handed(SEND)
    expect(Object.keys(given).sort()).toEqual(['React', 'shell', 'ui'])
  })

  it('shell 的切页与提示写成上行，带手里那一份的 issuer 与 scope', async () => {
    const { t, given } = await handed(SEND)
    const shell = given['shell'] as {
      navigate(page: string, subject?: string): void
      toast(toast: object): void
    }
    shell.navigate('chat', 's-1')
    shell.navigate('home')
    const toast = { id: 't', tone: 'info', title: '你好' }
    shell.toast(toast)
    expect(t.ups).toStrictEqual([
      { kind: 'navigate', issuer: ISSUER, scope: SCOPE, page: 'chat', subject: 's-1' },
      { kind: 'navigate', issuer: ISSUER, scope: SCOPE, page: 'home' },
      { kind: 'toast', issuer: ISSUER, scope: SCOPE, toast },
    ])
  })

  it('手里还没有一份，或手里的一份没登录：切页与提示不上行，读租户答没有', async () => {
    const t = setup()
    let shell: {
      navigate(page: string): void
      toast(toast: object): void
      scope: { get(): unknown }
    } = { navigate: () => undefined, toast: () => undefined, scope: { get: () => 'unset' } }
    t.host.take(look(1, [SEND]))
    await t.answer(SEND.source.module, {
      send: (handed: { shell: typeof shell }) => {
        shell = handed.shell
        expect(shell.scope.get()).toBeUndefined()
        shell.navigate('chat')
        shell.toast({ id: 't', tone: 'info', title: '早了' })
        return drawing()
      },
    })
    expect(t.version()).toBe(1)
    expect(t.ups).toEqual([])
    t.host.take(signedOut(look(2, [SEND])))
    shell.navigate('chat')
    shell.toast({ id: 't', tone: 'info', title: '没登录' })
    expect(shell.scope.get()).toBeUndefined()
    expect(t.ups).toEqual([])
  })

  it('退订之后不再通知：租户的订阅与宿主的订阅', async () => {
    const { t, given } = await handed(SEND)
    const scope = (
      given['shell'] as { scope: { subscribe(l: (now: unknown) => void): () => void } }
    ).scope
    const heard: unknown[] = []
    const events: string[] = []
    const stopScope = scope.subscribe(now => heard.push(now))
    const stopHost = t.host.subscribe(event => void events.push(event))
    t.host.take(look(2, [SEND], { scope: 'tenant-b' }))
    expect([heard, events]).toEqual([['tenant-b'], ['worn']])
    stopScope()
    stopHost()
    t.host.take(look(3, [SEND], { scope: 'tenant-c' }))
    expect([heard, events]).toEqual([['tenant-b'], ['worn']])
  })

  it('shell 读当前租户答手里那一份的 scope；换上 scope 不同的一份才通知', async () => {
    const { t, given } = await handed(SEND)
    const scope = (given['shell'] as { scope: { get(): unknown; subscribe(l: unknown): unknown } })
      .scope
    const heard: unknown[] = []
    scope.subscribe((now: unknown) => heard.push(now))
    expect(scope.get()).toBe(SCOPE)
    t.host.take(look(2, [SEND]))
    t.host.take(look(3, [SEND], { scope: 'tenant-b' }))
    t.host.take(signedOut(look(4)))
    expect(heard).toEqual(['tenant-b', undefined])
    expect(scope.get()).toBeUndefined()
  })
})

describe('画法宿主：换上', () => {
  it('一步做完：收养样式、换画法表、第一次摘令牌、告诉墨迹，然后通知', async () => {
    const t = setup()
    const seen: unknown[] = []
    const host = createLookHost({
      load: async () => ({ figure: drawing }),
      given: {},
      later: () => () => undefined,
      wear: {
        adopt: css => seen.push(['adopt', css, host.drawingAt('shell.piece', 'figure')]),
        drop: () => seen.push(['drop', host.drawingAt('shell.piece', 'figure') !== undefined]),
        inked: () => seen.push(['inked']),
      },
      up: () => undefined,
    })
    host.subscribe(event => seen.push([event]))
    host.take(look(1, [FIGURE]))
    await t.flush()
    host.take(look(2, [FIGURE]))
    expect(seen).toEqual([
      ['adopt', 'v1', undefined],
      ['drop', true],
      ['inked'],
      ['worn'],
      ['adopt', 'v2', expect.any(Function)],
      ['inked'],
      ['worn'],
    ])
  })

  it('画的时候抛出，而手里没有一份、或那个点与键上没有画法：不上行', async () => {
    const t = setup()
    t.host.threw('shell.piece', 'figure', new Error('early'))
    t.host.take(look(1, [FIGURE]))
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    t.host.threw('shell.piece', 'loading', new Error('other key'))
    t.host.threw('shell.icon', 'figure', new Error('other point'))
    expect(t.ups).toEqual([])
  })

  it('画的时候抛出：同一个点、键、版本只上行一次', async () => {
    const t = setup()
    t.host.take(look(1, [FIGURE]))
    await t.answer(FIGURE.source.module, fileOf({ figure: drawing }))
    t.host.threw('shell.piece', 'figure', new Error('bad paint'))
    t.host.threw('shell.piece', 'figure', new Error('bad paint'))
    t.host.take(look(2, [FIGURE]))
    t.host.threw('shell.piece', 'figure', new Error('bad paint'))
    expect(t.ups).toHaveLength(2)
    expect(t.ups[0]).toMatchObject({
      kind: 'undrawn',
      issuer: ISSUER,
      point: 'shell.piece',
      key: 'figure',
      module: FIGURE.source.module,
      reason: expect.stringContaining('bad paint'),
    })
  })
})
