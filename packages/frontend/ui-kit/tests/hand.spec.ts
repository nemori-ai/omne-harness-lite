import { afterEach, describe, expect, it, vi } from 'vitest'
import { inkClock } from '../src/ink/clock.ts'
import {
  follow,
  Hand,
  LIFT_DISTANCE,
  resting,
  type FigureHand,
  type PointerAt,
  type Spring,
} from '../src/ink/hand.ts'
import { type Placement } from '../src/ink/travel.ts'

const SEAT: Placement = { x: 100, y: 80 }
const STILL = (at: Placement): Spring => ({ x: at.x, y: at.y, vx: 0, vy: 0 })

interface Bench {
  readonly hand: Hand
  readonly look: { reduced: boolean; drawn: boolean }
  readonly told: FigureHand[]
  readonly carried: Placement[]
  readonly ended: (readonly [Placement, boolean])[]
  readonly abandoned: () => number
  readonly pending: () => number
  readonly frame: () => void
  readonly tick: (ms: number) => void
  onTell: (hand: FigureHand) => void
}

let now = 1000

function bench({ reduced = false, drawn = true } = {}): Bench {
  now = 1000
  inkClock.use(() => now)
  const frames = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next += 1
    frames.set(next, callback)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  const look = { reduced, drawn }
  const told: FigureHand[] = []
  const carried: Placement[] = []
  const ended: (readonly [Placement, boolean])[] = []
  let abandoned = 0
  const self: Bench = {
    hand: new Hand({
      centre: () => SEAT,
      drawn: () => look.drawn,
      reduced: () => look.reduced,
      tell: hand => {
        told.push(hand)
        self.onTell(hand)
        return false
      },
      lifted: () => undefined,
      carried: at => carried.push(at),
      ended: (at, taken) => ended.push([at, taken]),
      abandoned: () => {
        abandoned += 1
      },
    }),
    look,
    told,
    carried,
    ended,
    abandoned: () => abandoned,
    pending: () => frames.size,
    frame: () => {
      const due = [...frames.values()]
      frames.clear()
      for (const callback of due) callback(now)
    },
    tick: ms => {
      now += ms
      self.frame()
    },
    onTell: () => undefined,
  }
  return self
}

const pointer = (x: number, y: number, more: Partial<PointerAt> = {}): PointerAt => ({
  id: 1,
  buttons: 1,
  client: { x, y },
  screen: { x: x + 1000, y: y + 500 },
  meta: false,
  shift: false,
  ...more,
})

const up = (x: number, y: number, more: Partial<PointerAt> = {}): PointerAt =>
  pointer(x, y, { buttons: 0, ...more })

function lift({ hand }: Bench, to: Placement = { x: 300, y: 200 }): void {
  hand.down(pointer(SEAT.x, SEAT.y))
  hand.move(pointer(to.x, to.y))
}

const placed = (spring: Spring): Placement => ({ x: spring.x, y: spring.y })

afterEach(() => {
  inkClock.use(null)
  vi.unstubAllGlobals()
})

describe('the spring is at rest only when it is both near and slow', () => {
  const target = { x: 0, y: 0 }
  it.each([
    ['near and slow', 0.04, 0.9, true],
    ['exactly 0.05px away', 0.05, 0, false],
    ['exactly 1px/s', 0, 1, false],
    ['still but far', 1, 0, false],
    ['near but fast', 0.04, 2, false],
  ] as const)('%s', (_, off, speed, rests) => {
    expect(resting({ x: off, y: 0, vx: speed, vy: 0 }, target)).toBe(rests)
  })

  it('left alone, the hand lands exactly under the pointer and asks for no more frames', () => {
    const rig = bench()
    lift(rig)
    let frames = 0
    while (rig.pending() > 0 && frames < 1000) {
      rig.tick(16)
      frames += 1
    }
    expect(frames).toBeLessThan(1000)
    expect(rig.carried.at(-1)).toEqual({ x: 300, y: 200 })
    expect(rig.carried.at(-2)).not.toEqual({ x: 300, y: 200 })
  })
})

describe('a frame steps the spring by the time the clock went by', () => {
  it('the first frame after the lift is the spring after those milliseconds', () => {
    const rig = bench()
    lift(rig)
    rig.tick(16)
    expect(rig.carried).toEqual([placed(follow(STILL(SEAT), { x: 300, y: 200 }, 0.016))])
  })

  it('a frame on a clock that did not move leaves it where it was and asks again', () => {
    const rig = bench()
    lift(rig)
    rig.frame()
    expect(rig.carried).toEqual([SEAT])
    expect(rig.pending()).toBe(1)
  })

  it('a move while a frame is waiting does not restart the step', () => {
    const rig = bench()
    lift(rig)
    rig.tick(10)
    const first = follow(STILL(SEAT), { x: 300, y: 200 }, 0.01)
    now += 3
    rig.hand.move(pointer(320, 210))
    rig.tick(3)
    expect(rig.carried).toEqual([placed(first), placed(follow(first, { x: 320, y: 210 }, 0.006))])
  })

  it('after the spring rested, a move asks for a frame and steps from the move', () => {
    const rig = bench()
    lift(rig)
    while (rig.pending() > 0) rig.tick(16)
    now += 500
    rig.hand.move(pointer(400, 300))
    expect(rig.pending()).toBe(1)
    rig.tick(16)
    expect(rig.carried.at(-1)).toEqual(
      placed(follow(STILL({ x: 300, y: 200 }), { x: 400, y: 300 }, 0.016)),
    )
  })
})

describe('moves and frames', () => {
  it('without reduced motion, neither the lift nor a move puts it under the pointer before a frame', () => {
    const rig = bench()
    lift(rig)
    rig.hand.move(pointer(320, 210))
    expect(rig.carried).toEqual([])
  })

  it('without reduced motion, many moves in one frame ask for one frame', () => {
    const rig = bench()
    lift(rig)
    rig.hand.move(pointer(310, 200))
    rig.hand.move(pointer(320, 210))
    expect(rig.pending()).toBe(1)
  })

  it('with reduced motion, the lift and each move put it under the pointer at once, and no frame follows it', () => {
    const rig = bench({ reduced: true })
    lift(rig)
    expect(rig.carried).toEqual([{ x: 300, y: 200 }])
    expect(rig.pending()).toBe(0)
    rig.hand.move(pointer(320, 210))
    expect(rig.carried).toEqual([
      { x: 300, y: 200 },
      { x: 320, y: 210 },
    ])
    rig.tick(16)
    expect(rig.told.map(hand => hand.kind)).toEqual(['lift', 'move'])
    expect(rig.carried).toHaveLength(2)
    expect(rig.pending()).toBe(0)
  })

  it('a figure that is not drawn is never placed, and is put under the pointer when redrawn', () => {
    const rig = bench({ reduced: true, drawn: false })
    lift(rig)
    rig.hand.move(pointer(320, 210))
    expect(rig.carried).toEqual([])
    rig.look.drawn = true
    rig.hand.redrawn()
    expect(rig.carried).toEqual([{ x: 320, y: 210 }])
  })

  it('redrawn with nothing in the hand places nothing', () => {
    const rig = bench()
    rig.hand.redrawn()
    rig.hand.down(pointer(SEAT.x, SEAT.y))
    rig.hand.redrawn()
    expect(rig.carried).toEqual([])
  })

  it('a host that ends the hand when told of a move hears nothing more and no frame follows', () => {
    const rig = bench()
    lift(rig)
    rig.onTell = hand => {
      if (hand.kind === 'move') rig.hand.stop()
    }
    rig.hand.move(pointer(320, 210))
    rig.tick(16)
    expect(rig.carried).toEqual([])
    expect(rig.pending()).toBe(0)
  })
})

describe('how a hand ends', () => {
  it('a new press cancels the frame the hand had asked for', () => {
    const rig = bench()
    lift(rig)
    expect(rig.pending()).toBe(1)
    rig.hand.down(pointer(SEAT.x, SEAT.y, { id: 2 }))
    expect(rig.pending()).toBe(0)
  })

  it('letting go cancels the frame the hand had asked for', () => {
    const rig = bench()
    lift(rig)
    expect(rig.hand.up(up(300, 200))).toBe('held')
    expect(rig.pending()).toBe(0)
    expect(rig.ended).toEqual([[{ x: 300, y: 200 }, false]])
  })

  it('an up answers press with nothing held, other for another pointer, held for the hand, then press again', () => {
    const rig = bench()
    expect(rig.hand.up(up(0, 0))).toBe('press')
    rig.hand.down(pointer(SEAT.x, SEAT.y))
    expect(rig.hand.up(up(0, 0, { id: 2 }))).toBe('other')
    expect(rig.hand.up(up(SEAT.x, SEAT.y))).toBe('press')
    expect(rig.hand.up(up(SEAT.x, SEAT.y))).toBe('press')
    lift(rig)
    expect(rig.hand.up(up(300, 200, { id: 2 }))).toBe('other')
    expect(rig.hand.up(up(300, 200))).toBe('held')
    expect(rig.hand.up(up(300, 200))).toBe('press')
  })

  it('a cancel naming no pointer ends the hand as an Escape', () => {
    const rig = bench()
    lift(rig)
    expect(rig.hand.cancel(undefined)).toBe('held')
    expect(rig.told.map(hand => hand.kind)).toEqual(['lift', 'escape'])
    expect(rig.hand.holding).toBe(false)
  })

  it(`a move that finds the button up before ${LIFT_DISTANCE}px abandons the press once, and what follows is no press`, () => {
    const rig = bench()
    rig.hand.down(pointer(SEAT.x, SEAT.y))
    rig.hand.move(up(SEAT.x + 2, SEAT.y))
    expect(rig.abandoned()).toBe(1)
    expect(rig.hand.up(up(SEAT.x + 2, SEAT.y))).toBe('press')
    expect(rig.hand.cancel(undefined)).toBe('press')
    expect(rig.told).toEqual([])
    expect(rig.ended).toEqual([])
  })
})
