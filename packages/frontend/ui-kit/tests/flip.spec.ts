import { describe, expect, it } from 'vitest'

import {
  FaceFlip,
  FLIP,
  type FlipHost,
  flipPlan,
  type FlipState,
  type FlipToward,
  foldAt,
} from '../src/paper/flip.ts'

const VIEW = { width: 1200, height: 800, size: 1 }
const FRAME = 16

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 2 ** 32
  }
}

/** A host on a clock the case moves: timers fire when it passes them, a frame comes every 16 ms unless frames are stopped. */
function bench(options: { reduced?: boolean; frames?: boolean; random?: () => number } = {}) {
  let now = 0
  type Timer = { at: number; run: () => void; live: boolean }
  const timers: Timer[] = []
  let waiting: Timer[] = []
  const host: FlipHost = {
    now: () => now,
    later(run, ms) {
      const timer = { at: now + ms, run, live: true }
      timers.push(timer)
      return () => {
        timer.live = false
      }
    },
    frame(run) {
      const timer = { at: 0, run, live: true }
      waiting.push(timer)
      return () => {
        timer.live = false
      }
    },
    reduced: () => options.reduced === true,
    plan: toward => flipPlan(VIEW, toward, { x: 40, y: 60 }, options.random),
  }
  const flip = new FaceFlip(host)
  const seen: FlipState[] = []
  flip.subscribe(() => seen.push(flip.current()))
  let swaps = 0
  const turn = (toward: FlipToward = 'right'): void => flip.turn(toward, () => (swaps += 1))
  const due = (until: number) =>
    timers.filter(timer => timer.live && timer.at <= until).sort((one, other) => one.at - other.at)
  const advance = (ms: number): void => {
    const end = now + ms
    while (now < end) {
      const stepEnd = Math.min(now + FRAME, end)
      for (let timer = due(stepEnd)[0]; timer !== undefined; timer = due(stepEnd)[0]) {
        now = Math.max(now, timer.at)
        timer.live = false
        timer.run()
      }
      now = stepEnd
      if (options.frames === false) continue
      const frames = waiting
      waiting = []
      for (const frame of frames) if (frame.live) frame.run()
    }
  }
  return {
    flip,
    seen,
    turn,
    advance,
    swaps: () => swaps,
    now: () => now,
    phases: () => seen.map(state => state.phase),
  }
}

const settledAt = (b: ReturnType<typeof bench>, limit = FLIP.most + 100): number => {
  const start = b.now()
  while (b.flip.current().phase !== 'idle' && b.now() - start < limit) b.advance(1)
  return b.now() - start
}

describe('the flip on a clock the host hands in (FE-I58)', () => {
  it('goes to the edge, takes hold, carries, settles, and rests within 1500 ms, the face changed once at the start', () => {
    const b = bench()
    b.turn()
    expect(b.swaps()).toBe(1)
    expect(b.flip.current().phase).toBe('approach')
    const took = settledAt(b)
    expect(took).toBeLessThanOrEqual(FLIP.most)
    expect(b.phases()).toEqual(['approach', 'hold', 'carry', 'settle', 'idle'])
    expect(b.flip.current()).toEqual({ phase: 'idle', cut: false })
    expect(b.swaps()).toBe(1)
  })

  it('tells whoever follows it its way before the face changes', () => {
    const b = bench()
    let phaseAtSwap: string | undefined
    b.flip.turn('left', () => (phaseAtSwap = b.flip.current().phase))
    expect(phaseAtSwap).toBe('approach')
  })

  it('stops on the face it was turning to at once when pressed, in any phase', () => {
    for (const after of [0, 100, 300, 420, 700, 1100]) {
      const b = bench()
      b.turn()
      b.advance(after)
      b.flip.stop()
      expect(b.flip.current(), String(after)).toEqual({ phase: 'idle', cut: true })
      expect(b.swaps()).toBe(1)
      const seen = b.seen.length
      b.advance(2000)
      expect(b.seen.length, `nothing after the stop at ${after}`).toBe(seen)
    }
  })

  it('stops at once on the face of the first turn when turned again, and does not turn back', () => {
    const b = bench()
    b.turn('right')
    b.advance(500)
    b.turn('left')
    expect(b.flip.current()).toEqual({ phase: 'idle', cut: true })
    expect(b.swaps()).toBe(1)
  })

  it('turns again once at rest', () => {
    const b = bench()
    b.turn()
    settledAt(b)
    b.turn('left')
    expect(b.swaps()).toBe(2)
    expect(b.flip.current().phase).toBe('approach')
  })

  it('changes the face with no phase in between when motion is reduced', () => {
    const b = bench({ reduced: true })
    b.turn()
    b.turn()
    b.advance(2000)
    expect(b.swaps()).toBe(2)
    expect(b.seen).toEqual([])
    expect(b.flip.current().phase).toBe('idle')
  })

  it('stops at 1500 ms on the face it was turning to when no frame comes', () => {
    const b = bench({ frames: false })
    b.turn()
    const took = settledAt(b)
    expect(took).toBe(FLIP.most)
    expect(b.flip.current()).toEqual({ phase: 'idle', cut: true })
    expect(b.phases()).toEqual(['approach', 'hold', 'idle'])
  })

  it('never rests half way: after any run of turns, presses and time, the face shown depends only on the turns taken at rest', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = seeded(seed)
      const b = bench({ random })
      let expected = 0
      const began: number[] = []
      for (let step = 0; step < 40; step += 1) {
        const roll = random()
        if (roll < 0.3) {
          const atRest = b.flip.current().phase === 'idle'
          b.turn(random() < 0.5 ? 'left' : 'right')
          if (atRest) {
            expected += 1
            began.push(b.now())
            expect(b.flip.current().phase).toBe('approach')
          } else expect(b.flip.current()).toEqual({ phase: 'idle', cut: true })
        } else if (roll < 0.4) {
          b.flip.stop()
          expect(b.flip.current().phase).toBe('idle')
        } else b.advance(Math.floor(random() * 700))
        if (b.flip.current().phase !== 'idle')
          expect(b.now() - began.at(-1)!, `seed ${seed}`).toBeLessThan(FLIP.most)
      }
      b.advance(FLIP.most)
      expect(b.flip.current().phase, `seed ${seed}`).toBe('idle')
      expect(b.swaps(), `seed ${seed}`).toBe(expected)
    }
  })
})

describe('the way of a flip', () => {
  it('takes the edge it leaves and carries it to the other, at the height of the figure kept to the middle band', () => {
    const right = flipPlan(VIEW, 'right', { x: 40, y: 60 })
    expect(right.take).toEqual({ x: 6, y: 240 })
    expect(right.give).toEqual({ x: 1194, y: 240 })
    const left = flipPlan({ ...VIEW, size: 1.5 }, 'left', { x: 600, y: 400 })
    expect(left.take).toEqual({ x: 1191, y: 400 })
    expect(left.give).toEqual({ x: 9, y: 400 })
  })

  it('is a little different each time, within its bounds, never longer than the designed flip from the same place', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const random = seeded(seed)
      const figure = { x: random() * VIEW.width, y: random() * VIEW.height }
      const designed = flipPlan(VIEW, 'left', figure)
      const plan = flipPlan(VIEW, 'left', figure, random)
      expect(plan.approach).toBeGreaterThanOrEqual(FLIP.approach.least)
      expect(plan.approach).toBeLessThanOrEqual(FLIP.approach.most)
      expect(plan.carry).toBeGreaterThanOrEqual(FLIP.carry.least)
      expect(plan.carry).toBeLessThanOrEqual(FLIP.carry.most)
      expect(plan.settle).toBeLessThanOrEqual(FLIP.settle.most)
      expect(plan.take.y).toBeGreaterThanOrEqual(VIEW.height * 0.3)
      expect(plan.take.y).toBeLessThanOrEqual(VIEW.height * 0.6)
      expect(plan.approach + plan.carry + plan.settle).toBeLessThanOrEqual(
        designed.approach + designed.carry + designed.settle,
      )
    }
  })

  it('keeps the sheet whole until the carry, then folds it with the brush from edge to edge', () => {
    const b = bench()
    b.turn('right')
    expect(foldAt(b.flip.current(), b.now())).toBeNull()
    while (b.flip.current().phase !== 'carry') b.advance(1)
    const state = b.flip.current()
    if (state.phase !== 'carry' || state.carried === null) throw new Error('not carrying')
    const { take, give, carry } = state.plan
    expect(foldAt(state, state.carried)).toEqual({ x: take.x, share: 0 })
    const middle = foldAt(state, state.carried + carry / 2)!
    expect(middle.x).toBeGreaterThan(take.x)
    expect(middle.x).toBeLessThan(give.x)
    expect(foldAt(state, state.carried + carry)).toEqual({ x: give.x, share: 1 })
    while (b.flip.current().phase !== 'settle') b.advance(1)
    expect(foldAt(b.flip.current(), b.now())?.share).toBe(1)
  })
})
