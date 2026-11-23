import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { casual } from '../src/ink/casual.ts'
import { inkClock } from '../src/ink/clock.ts'
import { CENTRE, DEFAULT_HAND } from '../src/ink/ink.ts'
import { type InkFrame, type InkMark } from '../src/ink/ink-canvas.ts'
import { MOTES, MotesBody } from '../src/ink/motes.ts'
import { EYE_WEIGHT } from '../src/ink/ink.ts'

let frames = new Map<number, FrameRequestCallback>()
let requested = 0

function wait(ms: number): void {
  for (let i = 0; i < ms; i += 1) {
    vi.advanceTimersByTime(1)
    const due = frames
    frames = new Map()
    for (const callback of due.values()) callback(Date.now())
  }
}

beforeEach(() => {
  frames = new Map()
  requested = 0
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(0)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    requested += 1
    frames.set(requested, callback)
    return requested
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => void frames.delete(id))
  inkClock.use(() => Date.now())
  casual.use(() => 0.5)
})

afterEach(() => {
  casual.use(null)
  casual.setStill(null)
  inkClock.use(null)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const middle = (mark: InkMark): readonly [number, number] => {
  const line = mark.stroke.line
  const [ax, ay] = line[0]!
  const [bx, by] = line[line.length - 1]!
  return [(ax + bx) / 2, (ay + by) / 2]
}
const fromCentre = (mark: InkMark): number =>
  Math.hypot(middle(mark)[0] - CENTRE[0], middle(mark)[1] - CENTRE[1])
const angleOf = (mark: InkMark): number =>
  (Math.atan2(middle(mark)[1] - CENTRE[1], middle(mark)[0] - CENTRE[0]) * 180) / Math.PI
/** The marks that are there to stay: fully written, not drying. */
const settled = (frame: InkFrame): readonly InkMark[] =>
  frame.marks.filter(mark => mark.written === 1 && mark.opacity === 1)
const SETTLE = 2000

function watched(body: MotesBody): { frame: () => InkFrame; frames: () => number } {
  let last: InkFrame = { marks: [], wash: 0 }
  let count = 0
  body.subscribe(frame => {
    last = frame
    count += 1
  })
  return { frame: () => last, frames: () => count }
}

describe('墨点：五粒点落在一个看不见的圆上', () => {
  it('第一次出现时一粒粒点出来，不是一起出现', () => {
    const seen = watched(new MotesBody())
    expect(seen.frame().marks.length).toBeLessThan(MOTES.count)
    const counts = new Set<number>()
    for (let i = 0; i < SETTLE; i += 20) {
      wait(20)
      counts.add(seen.frame().marks.length)
    }
    expect([...counts].sort()).toEqual([1, 2, 3, 4, 5])
    expect(settled(seen.frame())).toHaveLength(MOTES.count)
  })

  it('每一粒都用主笔按「点」的份额；都在那个圆上，圆比形的圆小；口上不落点', () => {
    const seen = watched(new MotesBody())
    wait(SETTLE)
    const half = DEFAULT_HAND.gap / 2
    for (const mark of seen.frame().marks) {
      expect(mark.stroke.weight / EYE_WEIGHT).toBeGreaterThan(0.85)
      expect(mark.stroke.weight / EYE_WEIGHT).toBeLessThan(1.15)
      expect(Math.abs(fromCentre(mark) - MOTES.radius)).toBeLessThanOrEqual(MOTES.wander * 1.5)
      const away = Math.abs(((angleOf(mark) - DEFAULT_HAND.gapAt + 540) % 360) - 180)
      expect(away).toBeGreaterThan(half)
      expect(mark.tone).toBe('ink')
    }
    expect(MOTES.radius).toBeLessThan(DEFAULT_HAND.radius)
  })

  it('一笔蘸一次墨：顺着笔走的方向一粒比一粒淡、干', () => {
    casual.setStill(true)
    const seen = watched(new MotesBody(true))
    const marks = seen.frame().marks
    expect(marks).toHaveLength(MOTES.count)
    for (let i = 1; i < marks.length; i += 1) {
      expect(marks[i]!.stroke.ink).toBeLessThan(marks[i - 1]!.stroke.ink)
      expect(marks[i]!.stroke.wet).toBeLessThan(marks[i - 1]!.stroke.wet!)
    }
  })

  it('每次都不一样；减弱动效下是设计值', () => {
    let n = 0
    casual.use(() => ((n += 1) * 0.37) % 1)
    const first = watched(new MotesBody())
    const second = watched(new MotesBody())
    wait(SETTLE)
    expect(first.frame().marks.map(middle)).not.toEqual(second.frame().marks.map(middle))
    casual.setStill(true)
    const still = [watched(new MotesBody(true)), watched(new MotesBody(true))]
    expect(still[0]!.frame().marks.map(middle)).toEqual(still[1]!.frame().marks.map(middle))
  })
})

describe('墨点：没事就静着', () => {
  it('点完之后不再出帧，也没有等着的帧与计时', () => {
    const seen = watched(new MotesBody())
    wait(SETTLE)
    const frames = seen.frames()
    const asked = requested
    wait(30_000)
    expect(seen.frames()).toBe(frames)
    expect(requested).toBe(asked)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('墨点：在做事时一粒粒重点', () => {
  it('最旧的一粒干去，原处新点一粒；沿着圆一粒接一粒；回到没事就停', () => {
    const body = new MotesBody()
    const seen = watched(body)
    wait(SETTLE)
    const before = settled(seen.frame()).map(mark => mark.key)
    body.setDoing('working')
    wait(MOTES.rest[1] + MOTES.dab + MOTES.dry + 50)
    const after = settled(seen.frame()).map(mark => mark.key)
    expect(after).toHaveLength(MOTES.count)
    expect(after.filter(key => !before.includes(key)).length).toBeGreaterThanOrEqual(1)
    expect(after.includes(before[0]!)).toBe(false)
    wait(MOTES.count * (MOTES.rest[1] + MOTES.dab))
    const later = settled(seen.frame())
    expect(later.every(mark => !before.includes(mark.key))).toBe(true)
    body.setDoing('idle')
    wait(SETTLE)
    const frames = seen.frames()
    wait(30_000)
    expect(seen.frames()).toBe(frames)
    expect(settled(seen.frame())).toHaveLength(MOTES.count)
  })

  it('重点的那一粒落在原来那一粒的地方', () => {
    const body = new MotesBody()
    const seen = watched(body)
    wait(SETTLE)
    const was = seen.frame().marks[0]!
    body.setDoing('working')
    wait(MOTES.rest[1] + MOTES.dab + MOTES.dry + 50)
    const now = settled(seen.frame()).find(mark => !(mark.key === was.key))!
    const fresh = settled(seen.frame()).filter(mark => Math.abs(angleOf(mark) - angleOf(was)) < 25)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]!.key).not.toBe(was.key)
    expect(now).toBeDefined()
  })

  it('只剩后台在跑时，间歇长得多', () => {
    const body = new MotesBody()
    const seen = watched(body)
    wait(SETTLE)
    const before = seen.frame().marks.map(mark => mark.key)
    body.setDoing('background')
    wait(MOTES.backgroundRest[0] - 100)
    expect(seen.frame().marks.map(mark => mark.key)).toEqual(before)
    wait(MOTES.backgroundRest[1])
    expect(seen.frame().marks.map(mark => mark.key)).not.toEqual(before)
  })
})

describe('墨点：小框开着，圆心多一粒', () => {
  it('开着时圆心点一粒，收起后干去', () => {
    const body = new MotesBody()
    const seen = watched(body)
    wait(SETTLE)
    body.setListening(true)
    wait(MOTES.dab + 50)
    const marks = settled(seen.frame())
    expect(marks).toHaveLength(MOTES.count + 1)
    expect(marks.filter(mark => fromCentre(mark) < 3)).toHaveLength(1)
    body.setListening(true)
    wait(MOTES.dab + 50)
    expect(seen.frame().marks).toHaveLength(MOTES.count + 1)
    body.setListening(false)
    wait(MOTES.dry + 50)
    expect(seen.frame().marks).toHaveLength(MOTES.count)
    expect(seen.frame().marks.every(mark => fromCentre(mark) > 3)).toBe(true)
  })
})

describe('墨点：撒豆成兵', () => {
  it('被拖起来时只留第一粒，别的很快干去；在做事也不重点', () => {
    const body = new MotesBody()
    const seen = watched(body)
    wait(SETTLE)
    const first = seen.frame().marks[0]!.key
    body.setDoing('working')
    body.setListening(true)
    body.setCarried(true)
    wait(MOTES.lift + 50)
    expect(seen.frame().marks.map(mark => mark.key)).toEqual([first])
    wait(MOTES.rest[1] * 3)
    expect(seen.frame().marks.map(mark => mark.key)).toEqual([first])
  })

  it('放下时其余四粒依次点出来，留着的那一粒不动；在做事的接着重点', () => {
    const body = new MotesBody()
    const seen = watched(body)
    wait(SETTLE)
    const first = seen.frame().marks[0]!.key
    body.setCarried(true)
    wait(MOTES.lift + 50)
    body.setCarried(false)
    const counts = new Set<number>()
    for (let i = 0; i < SETTLE; i += 20) {
      wait(20)
      counts.add(seen.frame().marks.length)
    }
    expect([...counts].sort()).toEqual([2, 3, 4, 5])
    expect(settled(seen.frame())).toHaveLength(MOTES.count)
    expect(seen.frame().marks[0]!.key).toBe(first)
  })

  it('还没点完就被拖起来：留着第一粒', () => {
    const body = new MotesBody()
    const seen = watched(body)
    body.setCarried(true)
    wait(SETTLE)
    expect(settled(seen.frame())).toHaveLength(1)
    expect(Math.abs(angleOf(seen.frame().marks[0]!) - MOTES.angles[0]!)).toBeLessThan(15)
  })
})

describe('墨点：减弱动效', () => {
  it('一次到位，不出帧；在做事不重点；拖起放下也一次到位', () => {
    casual.setStill(true)
    const body = new MotesBody(true)
    const seen = watched(body)
    expect(settled(seen.frame())).toHaveLength(MOTES.count)
    body.setDoing('working')
    wait(30_000)
    expect(requested).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    body.setCarried(true)
    expect(seen.frame().marks).toHaveLength(1)
    body.setCarried(false)
    expect(settled(seen.frame())).toHaveLength(MOTES.count)
    body.setListening(true)
    expect(settled(seen.frame())).toHaveLength(MOTES.count + 1)
  })

  it('半路改成减弱动效：当场到位，不再重点', () => {
    const body = new MotesBody()
    const seen = watched(body)
    body.setDoing('working')
    wait(300)
    body.setReduced(true)
    expect(settled(seen.frame())).toHaveLength(MOTES.count)
    const frames = seen.frames()
    wait(30_000)
    expect(seen.frames()).toBe(frames)
  })
})

describe('墨点：收掉', () => {
  it('收掉之后没有帧也没有计时', () => {
    const body = new MotesBody()
    const seen = watched(body)
    body.setDoing('working')
    wait(500)
    body.dispose()
    const frames = seen.frames()
    wait(30_000)
    expect(seen.frames()).toBe(frames)
    expect(vi.getTimerCount()).toBe(0)
  })
})
