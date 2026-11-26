import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { externalTarget } from '../src/main/external-links.ts'
import { onlyMicrophone } from '../src/main/permissions.ts'
import {
  RELOAD_CYCLE_MS,
  createRecovery,
  type LoadFailureChoice,
  type UnresponsiveChoice,
  type UtilityHeldChoice,
  type UtilityState,
} from '../src/main/recovery.ts'
import { TRAFFIC_LIGHT_POSITION, windowChrome } from '../src/main/window-chrome.ts'
import { readWindowState, usableState, windowStateFile } from '../src/main/window-state.ts'
import { gate, settle } from './support/fake-server.ts'

describe('外链', () => {
  it('只有 http、https 与 mailto 交给系统浏览器', () => {
    expect(externalTarget('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(externalTarget('http://example.com')).toBe('http://example.com/')
    expect(externalTarget('mailto:a@example.com')).toBe('mailto:a@example.com')
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'omne-app://app/', 'x', ''])
      expect(externalTarget(url)).toBeUndefined()
  })
})

describe('窗口的标题栏', () => {
  it('macOS 隐藏标题栏，红绿灯嵌在侧栏顶上那条里；别的平台用系统的标题栏', () => {
    expect(windowChrome('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 16 },
    })
    expect(TRAFFIC_LIGHT_POSITION).toEqual({ x: 14, y: 16 })
    for (const platform of ['win32', 'linux'] as const) expect(windowChrome(platform)).toEqual({})
  })
})

describe('窗口的位置与大小', () => {
  const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 }
  const saved = (bounds: object, maximized?: unknown) => JSON.stringify({ bounds, maximized })

  it('读得出的才用：缺字段、不是整数、小于最小尺寸、不是 JSON 都当没存过', () => {
    expect(readWindowState(saved({ x: 10, y: 20, width: 900, height: 700 }, true))).toEqual({
      bounds: { x: 10, y: 20, width: 900, height: 700 },
      maximized: true,
    })
    expect(readWindowState(saved({ x: 10, y: 20, width: 900, height: 700 }))?.maximized).toBe(false)
    for (const text of [
      'not json',
      'null',
      '{}',
      saved({ x: 0, y: 0, width: 900 }),
      saved({ x: 0.5, y: 0, width: 900, height: 700 }),
      saved({ x: 0, y: 0, width: 100, height: 700 }),
      saved({ x: 0, y: 0, width: 900, height: 100 }),
      saved({ x: 1e9, y: 0, width: 900, height: 700 }),
    ])
      expect(readWindowState(text)).toBeUndefined()
  })

  it('窗口在某块屏幕上露得够多才沿用，否则回缺省', () => {
    const at = (x: number, y: number) =>
      usableState({ bounds: { x, y, width: 900, height: 700 }, maximized: false }, [SCREEN])
    expect(at(100, 100)).toBeDefined()
    expect(at(1920 - 120, 100)).toBeDefined()
    expect(at(1920 - 119, 100)).toBeUndefined()
    expect(at(5000, 100)).toBeUndefined()
    expect(at(100, -650)).toBeUndefined()
    expect(usableState(undefined, [SCREEN])).toBeUndefined()
    expect(at(2100, 100)).toBeUndefined()
    expect(
      usableState({ bounds: { x: 2100, y: 100, width: 900, height: 700 }, maximized: false }, [
        SCREEN,
        { x: 1920, y: 0, width: 1920, height: 1080 },
      ]),
    ).toBeDefined()
  })

  it('存了再读是同一份；读不到或写不进不抛出', () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'omne-window-')))
    try {
      const file = windowStateFile(join(directory, 'nested', 'window-state.json'))
      expect(file.load()).toBeUndefined()
      const state = { bounds: { x: 1, y: 2, width: 900, height: 700 }, maximized: true }
      file.save(state)
      expect(file.load()).toEqual(state)
      expect(readFileSync(join(directory, 'nested', 'window-state.json'), 'utf8')).toBe(
        JSON.stringify(state),
      )
      writeFileSync(join(directory, 'blocker'), '')
      const blocked = windowStateFile(join(directory, 'blocker', 'window-state.json'))
      expect(() => blocked.save(state)).not.toThrow()
      expect(blocked.load()).toBeUndefined()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('页面的恢复', () => {
  function recovery(utility: UtilityState = 'ready') {
    const done: string[] = []
    let time = 0
    let loadFailed = gate<LoadFailureChoice>()
    let hung = gate<UnresponsiveChoice>()
    let held = gate<UtilityHeldChoice>()
    // Like Electron: an aborted question closes and answers as if cancelled.
    const asked =
      <Choice>(name: string, answer: () => { promise: Promise<Choice> }, cancel: Choice) =>
      (signal: AbortSignal) => {
        done.push(`ask-${name}`)
        const { promise } = answer()
        return new Promise<Choice>(resolve => {
          signal.addEventListener('abort', () => {
            done.push(`dismiss-${name}`)
            resolve(cancel)
          })
          void promise.then(resolve)
        })
      }
    const made = createRecovery(
      {
        reload: () => void done.push('reload'),
        close: () => void done.push('close'),
        askLoadFailed: asked('load', () => loadFailed, 'close'),
        askUnresponsive: asked('hung', () => hung, 'close'),
        askUtilityHeld: asked('held', () => held, 'close'),
        retryUtility: () => void done.push('retry-utility'),
      },
      () => time,
      utility,
    )
    return {
      made,
      done,
      advance: (ms: number) => void (time += ms),
      async answerLoad(choice: LoadFailureChoice) {
        loadFailed.open(choice)
        loadFailed = gate()
        await settle()
      },
      async answerHung(choice: UnresponsiveChoice) {
        hung.open(choice)
        hung = gate()
        await settle()
      },
      async answerHeld(choice: UtilityHeldChoice) {
        held.open(choice)
        held = gate()
        await settle()
      },
    }
  }

  it('第一次失败自动重载一次；周期内再失败改为问人', async () => {
    const { made, done, advance, answerLoad } = recovery()
    made.failed()
    expect(done).toEqual(['reload'])
    advance(RELOAD_CYCLE_MS - 1)
    made.failed()
    expect(done).toEqual(['reload', 'ask-load'])
    await answerLoad('reload')
    expect(done).toEqual(['reload', 'ask-load', 'reload'])
    made.failed()
    await answerLoad('close')
    expect(done.slice(3)).toEqual(['ask-load', 'close'])
  })

  it('过了一个周期再失败，又自动重载一次', () => {
    const { made, done, advance } = recovery()
    made.failed()
    advance(RELOAD_CYCLE_MS)
    made.failed()
    expect(done).toEqual(['reload', 'reload'])
  })

  it('同一时刻只问一次', async () => {
    const { made, done, answerLoad } = recovery()
    made.failed()
    made.failed()
    made.failed()
    made.unresponsive()
    expect(done).toEqual(['reload', 'ask-load'])
    await answerLoad('close')
    expect(done).toEqual(['reload', 'ask-load', 'close'])
  })

  it('没有响应：等待什么都不做，重新加载与关闭照做', async () => {
    for (const [choice, effect] of [
      ['wait', []],
      ['reload', ['reload']],
      ['close', ['close']],
    ] as const) {
      const { made, done, answerHung } = recovery()
      made.unresponsive()
      await answerHung(choice)
      expect(done).toEqual(['ask-hung', ...effect])
    }
  })

  it('问着的时候页面自己恢复了：问题收起，选什么都不再动它', async () => {
    const { made, done, answerHung } = recovery()
    made.unresponsive()
    made.responsive()
    await answerHung('reload')
    expect(done).toEqual(['ask-hung', 'dismiss-hung'])
  })

  it('卡着的页面崩了：没有响应的问题收起，失败照常自动重载', async () => {
    const { made, done, answerHung } = recovery()
    made.unresponsive()
    made.failed()
    await answerHung('close')
    expect(done).toEqual(['ask-hung', 'dismiss-hung', 'reload'])
  })

  it('卡着的页面在周期内又失败：改问加载失败，不停在一个没人问的坏页面上', async () => {
    const { made, done, answerLoad } = recovery()
    made.failed()
    made.unresponsive()
    made.failed()
    expect(done).toEqual(['reload', 'ask-hung', 'dismiss-hung', 'ask-load'])
    await answerLoad('reload')
    expect(done.at(-1)).toBe('reload')
  })

  it('utility 进程没就绪：自动重载等它就绪再做，并且这时才算用掉额度', () => {
    const { made, done, advance } = recovery('starting')
    made.failed()
    made.failed()
    expect(done).toEqual([])
    advance(RELOAD_CYCLE_MS)
    made.utility('ready')
    expect(done).toEqual(['reload'])
    advance(RELOAD_CYCLE_MS - 1)
    made.failed()
    expect(done).toEqual(['reload', 'ask-load'])
  })

  it('人选的重新加载也等 utility 进程就绪', async () => {
    const { made, done, answerLoad } = recovery()
    made.failed()
    made.failed()
    made.utility('starting')
    await answerLoad('reload')
    expect(done).toEqual(['reload', 'ask-load'])
    made.utility('ready')
    expect(done).toEqual(['reload', 'ask-load', 'reload'])
  })

  it('utility 进程到上限不再重启：问人；选再试一次就重启它，就绪之后重新加载；选关闭就关', async () => {
    const first = recovery()
    first.made.utility('held')
    first.made.utility('held')
    expect(first.done).toEqual(['ask-held'])
    await first.answerHeld('retry')
    expect(first.done).toEqual(['ask-held', 'retry-utility'])
    first.made.utility('starting')
    first.made.utility('ready')
    expect(first.done).toEqual(['ask-held', 'retry-utility', 'reload'])

    const second = recovery()
    second.made.utility('held')
    await second.answerHeld('close')
    expect(second.done).toEqual(['ask-held', 'close'])
  })

  it('问着加载失败或没有响应时 utility 进程停了：收起那一问，改问这一件；它自己好了就收起', async () => {
    const { made, done, advance } = recovery()
    made.failed()
    advance(10)
    made.failed()
    expect(done).toEqual(['reload', 'ask-load'])
    made.utility('held')
    expect(done).toEqual(['reload', 'ask-load', 'dismiss-load', 'ask-held'])
    made.failed()
    made.unresponsive()
    expect(done).toHaveLength(4)
    made.utility('ready')
    expect(done.at(-1)).toBe('dismiss-held')
  })

  it('等着的时候 utility 进程启动失败：不再等，问人', async () => {
    const { made, done, answerLoad } = recovery('starting')
    made.failed()
    made.utility('failed')
    expect(done).toEqual(['ask-load'])
    made.utility('starting')
    await answerLoad('reload')
    made.utility('ready')
    expect(done).toEqual(['ask-load', 'reload'])
  })

  it('排着重新加载、又问着没有响应时 utility 启动失败：收起那一问，改问加载失败', async () => {
    const { made, done, answerHung, answerLoad } = recovery('starting')
    made.unresponsive()
    await answerHung('reload')
    made.unresponsive()
    made.utility('failed')
    // Answering "wait" to the hung question would have left the page with nothing queued.
    expect(done).toEqual(['ask-hung', 'ask-hung', 'dismiss-hung', 'ask-load'])
    made.utility('starting')
    await answerLoad('reload')
    made.utility('ready')
    expect(done.at(-1)).toBe('reload')
  })

  it('页面好好的：utility 进程换代不动它', () => {
    const { made, done } = recovery()
    made.utility('starting')
    made.utility('failed')
    made.utility('starting')
    made.utility('ready')
    expect(done).toEqual([])
  })

  it('等着的时候人选了关闭：就绪之后不再重载', async () => {
    const { made, done, answerHung } = recovery('starting')
    made.failed()
    made.unresponsive()
    await answerHung('close')
    made.utility('ready')
    expect(done).toEqual(['ask-hung', 'close'])
  })
})

describe('the permissions of the page', () => {
  it('only the microphone is granted: video with it, no media type, and every other permission are refused', () => {
    expect(onlyMicrophone('media', ['audio'])).toBe(true)
    expect(onlyMicrophone('media', ['video'])).toBe(false)
    expect(onlyMicrophone('media', ['audio', 'video'])).toBe(false)
    expect(onlyMicrophone('media', ['unknown'])).toBe(false)
    expect(onlyMicrophone('media', [])).toBe(false)
    for (const other of ['geolocation', 'notifications', 'display-capture', 'clipboard-read'])
      expect(onlyMicrophone(other, ['audio'])).toBe(false)
  })
})
