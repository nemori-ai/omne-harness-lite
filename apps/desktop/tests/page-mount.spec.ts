import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchMount, watchStable, type WatchedContents } from '../src/main/page-mount.ts'

/** The contents of a window as the watch sees them: events, and an answer to "has the page put its content in". */
function contents() {
  const events = new EventEmitter()
  let destroyed = false
  let rendered: boolean | Error = false
  const asked: string[] = []
  const fake: WatchedContents = {
    on: (event, listener) => events.on(event, listener as never),
    once: (event, listener) => events.once(event, listener as never),
    off: (event, listener) => events.off(event, listener as never),
    isDestroyed: () => destroyed,
    executeJavaScript: async code => {
      asked.push(code)
      if (rendered instanceof Error) throw rendered
      return rendered
    },
  }
  return {
    fake,
    asked,
    listeners: () => events.eventNames().reduce((sum, name) => sum + events.listenerCount(name), 0),
    finish: () => events.emit('did-finish-load'),
    render: (now: boolean | Error) => (rendered = now),
    failLoad: (code: number, main: boolean) => events.emit('did-fail-load', {}, code, '', '', main),
    gone: (reason: string) => events.emit('render-process-gone', {}, { reason }),
    destroy() {
      destroyed = true
      events.emit('destroyed')
    },
  }
}

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

describe('一次加载渲染出来没有', () => {
  it('文档加载完、页面把自己的内容放进去了：渲染出来了；加载完之前不去问', async () => {
    const page = contents()
    const mount = watchMount(page.fake, 5000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(page.asked).toEqual([])
    page.finish()
    await vi.advanceTimersByTimeAsync(300)
    expect(page.asked.length).toBeGreaterThan(1)
    expect(page.asked[0]).toContain(".booting') === null")
    page.render(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(await mount).toBe('mounted')
    expect(page.listeners()).toBe(0)
  })

  it('期限到了还是启动时的那一行：没渲染出来。问的时候出错不算渲染出来', async () => {
    const page = contents()
    const mount = watchMount(page.fake, 2000)
    page.finish()
    page.render(new Error('the frame is navigating'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(await mount).toBe('not-mounted')
    expect(page.listeners()).toBe(0)
  })

  it('主框架加载失败、渲染进程倒下、窗口关了：各是各的原因；取消的加载与子框架不算', async () => {
    const failed = contents()
    const first = watchMount(failed.fake, 5000)
    failed.failLoad(-3, true)
    failed.failLoad(-105, false)
    failed.failLoad(-105, true)
    expect(await first).toBe('load-failed')

    const fell = contents()
    const second = watchMount(fell.fake, 5000)
    fell.gone('clean-exit')
    fell.gone('crashed')
    expect(await second).toBe('renderer-gone')

    const closed = contents()
    const third = watchMount(closed.fake, 5000)
    closed.destroy()
    expect(await third).toBe('closed')
    expect(await watchMount(closed.fake, 5000)).toBe('closed')
  })

  it('渲染出来之后稳住了一段时间才算稳；这段时间里倒下就不算', async () => {
    const stays = contents()
    const stayed = watchStable(stays.fake, 1500)
    await vi.advanceTimersByTimeAsync(1500)
    expect(await stayed).toBe(true)
    expect(stays.listeners()).toBe(0)

    const falls = contents()
    const fell = watchStable(falls.fake, 1500)
    await vi.advanceTimersByTimeAsync(700)
    falls.gone('crashed')
    expect(await fell).toBe(false)
  })
})
