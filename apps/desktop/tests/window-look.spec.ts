import { describe, expect, it } from 'vitest'
import type { Point } from '../src/page/desk/scene.ts'
import type { WindowAt, WindowRead } from '../src/page/shell/desk/device.ts'
import {
  ASK_EVERY,
  NOTHING_LABEL,
  WindowLook,
  type Seen,
} from '../src/page/shell/desk/window-look.ts'
import { TAKEN_AT, WINDOW, held, png } from './support/desk-stay.ts'

const META = { meta: true, shift: false }
const PLAIN = { meta: false, shift: false }
const AT: Point = { x: 1100, y: 350 }

const settle = async (done: () => boolean = () => false, ms = 50) => {
  const end = Date.now() + ms
  do await new Promise(next => setTimeout(next, 0))
  while (!done() && Date.now() < end)
}

/** A look with every call to the device written down, answers given by the test, and a clock moved by hand. */
function look(
  answers: Partial<{
    window: (at: Point) => Promise<WindowAt>
    own: (at: Point) => Promise<boolean | null>
    read: (lease: number, window: string) => Promise<WindowRead>
  }> = {},
) {
  const calls: string[] = []
  let now = 0
  let timers: { at: number; run: () => void }[] = []
  let can = true
  let changes = 0
  const made = new WindowLook({
    device: {
      window: at => {
        calls.push(`window ${at.x},${at.y}`)
        return (answers.window ?? (() => Promise.resolve(WINDOW)))(at)
      },
      own: at => {
        calls.push(`own ${at.x},${at.y}`)
        return (answers.own ?? (() => Promise.resolve(true)))(at)
      },
      read: (lease, window) => {
        calls.push(`read ${lease} ${window}`)
        return (answers.read ?? (() => Promise.resolve({ kind: 'gone' } as const)))(lease, window)
      },
    },
    clock: {
      now: () => now,
      later(ms, run) {
        const timer = { at: now + ms, run }
        timers.push(timer)
        return () => void (timers = timers.filter(each => each !== timer))
      },
    },
    can: () => can,
    changed: () => void (changes += 1),
  })
  const tick = (ms: number) => {
    now += ms
    const due = timers.filter(timer => timer.at <= now)
    timers = timers.filter(timer => timer.at > now)
    for (const timer of due) timer.run()
  }
  return {
    look: made,
    calls,
    tick,
    changes: () => changes,
    pending: () => timers.length,
    cannot: () => void (can = false),
  }
}

const asks = (calls: readonly string[]) => calls.filter(call => call.startsWith('window'))

describe('问 window：只在按着 ⌘ 而且 can() 成立时', () => {
  it('不按 ⌘ 不问，也不排一问', () => {
    const shell = look()
    shell.look.hand(AT, PLAIN)
    shell.tick(1000)
    expect(shell.calls).toEqual([])
    expect(shell.pending()).toBe(0)
  })

  it('can() 不成立时按着 ⌘ 也不问', () => {
    const shell = look()
    shell.cannot()
    shell.look.hand(AT, META)
    shell.tick(1000)
    expect(shell.calls).toEqual([])
    expect(shell.look.label(false)).toBeNull()
  })

  it('至多每 100ms 一次：第一问立刻；之后的移动排到上一问之后 100ms，问手最后在的那一点', () => {
    const shell = look()
    shell.look.hand(AT, META)
    expect(asks(shell.calls)).toEqual(['window 1100,350'])
    shell.tick(30)
    shell.look.hand({ x: 1110, y: 350 }, META)
    shell.look.hand({ x: 1120, y: 360 }, META)
    expect(shell.pending()).toBe(1)
    shell.tick(ASK_EVERY - 31)
    expect(asks(shell.calls)).toHaveLength(1)
    shell.tick(1)
    expect(asks(shell.calls)).toEqual(['window 1100,350', 'window 1120,360'])
    shell.tick(ASK_EVERY)
    shell.look.hand({ x: 1130, y: 360 }, META)
    expect(asks(shell.calls)).toHaveLength(3)
  })

  it('排着的一问到时 ⌘ 已经松开或 can() 不成立：不问', () => {
    const released = look()
    released.look.hand(AT, META)
    released.tick(10)
    released.look.hand(AT, META)
    released.look.hand(AT, PLAIN)
    released.tick(500)
    expect(asks(released.calls)).toHaveLength(1)
    const gone = look()
    gone.look.hand(AT, META)
    gone.tick(10)
    gone.look.hand(AT, META)
    gone.cannot()
    gone.tick(500)
    expect(asks(gone.calls)).toHaveLength(1)
  })
})

describe('框着的窗口与签', () => {
  it('答复到了才有框；框是窗口的矩形与盖住它的矩形，⇧ 合口', async () => {
    const shell = look()
    shell.look.hand(AT, META)
    expect(shell.look.frame()).toBeNull()
    expect(shell.look.label(false)).toEqual(NOTHING_LABEL)
    await settle()
    expect(shell.changes()).toBe(1)
    expect(shell.look.frame()).toEqual({
      rect: WINDOW.bounds,
      covered: WINDOW.covered,
      closed: false,
    })
    expect(shell.look.framed()?.id).toBe('w-1')
    shell.look.hand(AT, { meta: true, shift: true })
    expect(shell.look.frame()?.closed).toBe(true)
    expect(shell.look.label(false)?.[1]).toEqual({ text: '松手直接发送', tone: 'hint' })
  })

  it('⌘ 松开：框、签与框住的窗口立刻都没有', async () => {
    const shell = look()
    shell.look.hand(AT, META)
    await settle()
    shell.look.hand(AT, PLAIN)
    expect([shell.look.frame(), shell.look.label(false), shell.look.framed()]).toEqual([
      null,
      null,
      null,
    ])
  })

  it('答复回来时 ⌘ 已经松开、can() 不成立或已经有更新的一问：丢掉', async () => {
    const first = held<WindowAt>()
    const calls: Promise<WindowAt>[] = [first.promise, Promise.resolve({ ...WINDOW, id: 'w-2' })]
    const newer = look({ window: () => calls.shift()! })
    newer.look.hand(AT, META)
    newer.tick(ASK_EVERY)
    newer.look.hand(AT, META)
    await settle()
    first.settle(WINDOW)
    await settle()
    expect(newer.look.framed()?.id).toBe('w-2')

    const late = held<WindowAt>()
    const released = look({ window: () => late.promise })
    released.look.hand(AT, META)
    released.look.hand(AT, PLAIN)
    released.look.hand(AT, META)
    late.settle(WINDOW)
    await settle()
    expect(released.changes()).toBe(0)

    const unable = held<WindowAt>()
    const cannot = look({ window: () => unable.promise })
    cannot.look.hand(AT, META)
    cannot.cannot()
    unable.settle(WINDOW)
    await settle()
    expect(cannot.changes()).toBe(0)
  })
})

describe('own：一次松手问一次，放弃之后的答复丢掉', () => {
  it('答假是被盖着；答真与答不出不是', async () => {
    for (const [own, covered] of [
      [false, true],
      [true, false],
      [null, false],
    ] as const) {
      const shell = look({ own: () => Promise.resolve(own) })
      const taken: boolean[] = []
      shell.look.own(AT, yes => taken.push(yes))
      await settle()
      expect(taken).toEqual([covered])
    }
  })

  it('cancelOwn 之后答复到了不交', async () => {
    const shell = look()
    const taken: boolean[] = []
    shell.look.own(AT, yes => taken.push(yes))
    shell.look.cancelOwn()
    await settle()
    expect(taken).toEqual([])
  })
})

describe('read：每种答复给人看什么，迟到的丢掉', () => {
  const reading = async (read: WindowRead | Promise<WindowRead>, send = false, live = true) => {
    const shell = look({ read: () => Promise.resolve(read) })
    const taken: Seen[] = []
    shell.look.read(
      7,
      'w-1',
      AT,
      send,
      () => live,
      seen => taken.push(seen),
    )
    await settle(() => taken.length > 0, 2000)
    return { shell, taken }
  }
  const picture = {
    kind: 'picture',
    png: png(800, 600),
    bounds: WINDOW.bounds,
    scale: 2,
    takenAt: TAKEN_AT,
  } as const

  it('读的是给的租约与窗口标识', async () => {
    const { shell } = await reading({ kind: 'gone' })
    expect(shell.calls).toEqual(['read 7 w-1'])
  })

  it('图：两张，带 send', async () => {
    const { taken } = await reading(picture, true)
    expect(taken).toHaveLength(1)
    const [seen] = taken
    expect(seen?.kind === 'pictures' && seen.pictures.map(each => each.name)).toEqual([
      '窗口 09.05.07.png',
      '近看 09.05.07.png',
    ])
    expect(seen?.kind === 'pictures' && seen.send).toBe(true)
  })

  it('没有许可、出错、不在了', async () => {
    expect((await reading({ kind: 'not-authorized' })).taken).toEqual([{ kind: 'not-authorized' }])
    expect((await reading({ kind: 'failed', reason: '坏了' })).taken).toEqual([
      { kind: 'not-seen', reason: '坏了' },
    ])
    expect((await reading({ kind: 'gone' })).taken).toEqual([])
  })

  it('live() 不成立或 cancelRead 之后：丢掉', async () => {
    expect((await reading(picture, false, false)).taken).toEqual([])
    const shell = look({ read: () => Promise.resolve(picture) })
    const taken: Seen[] = []
    shell.look.read(
      7,
      'w-1',
      AT,
      false,
      () => true,
      seen => taken.push(seen),
    )
    shell.look.cancelRead()
    await settle(() => taken.length > 0, 400)
    expect(taken).toEqual([])
  })
})
