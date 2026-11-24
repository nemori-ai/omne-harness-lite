// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { TimeSource } from '@omne-harness/time-source'
import { dispatchWorld, everyMinute, MINUTE, START } from './world.ts'

type Random = () => number
function randomOf(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}
const below = (random: Random, limit: number) => Math.floor(random() * limit)
const settle = () => new Promise(resolve => setImmediate(resolve))

/** The clock a dispatcher sees, whose wall-clock hints are dropped or sent twice at random; waits by duration are kept. */
function hinting(source: TimeSource, random: Random): TimeSource {
  return {
    ...source,
    now: () => source.now(),
    elapsed: () => source.elapsed(),
    after: (delay, fire, options) => source.after(delay, fire, options),
    at(epoch, fire, options) {
      const roll = random()
      if (roll < 0.4) return () => {}
      const first = source.at(epoch, fire, options)
      if (roll < 0.7) return first
      const second = source.at(epoch, fire, options)
      return () => {
        first()
        second()
      }
    },
  }
}

type World = Awaited<ReturnType<typeof dispatchWorld>>

/** The model's invariants over what is stored: each minute from activation to now is either one receipt or inside
 * exactly one missed stretch, never both; counts match. */
function partition(w: World, id: string, upTo: number) {
  const receipts = w.rows(
    `SELECT slot_at, receipt FROM sc_receipts WHERE schedule_id = '${id}' ORDER BY slot_at`,
  )
  const lapses = w
    .rows(`SELECT from_at, through_at, lapse FROM sc_lapses WHERE schedule_id = '${id}'`)
    .map(row => ({
      from: Date.parse(String(row['from_at'])),
      through: Date.parse(String(row['through_at'])),
      count: JSON.parse(String(row['lapse'])).count as number,
    }))
  const received = new Set(receipts.map(row => Date.parse(String(row['slot_at']))))
  expect(received.size).toBe(receipts.length)
  for (let at = START + MINUTE; at <= upTo; at += MINUTE) {
    const inLapse = lapses.filter(lapse => at >= lapse.from && at < lapse.through).length
    expect(Number(received.has(at)) + inLapse, new Date(at).toISOString()).toBe(1)
  }
  const missed = lapses.reduce((sum, lapse) => sum + lapse.count, 0)
  const view = w.view(id)
  expect(view['eligibleConsumed']).toBe(receipts.length + missed)
  expect(view['acceptedJobCount']).toBe(w.jobs(id).length)
  return receipts.map(row => [
    row['slot_at'],
    JSON.parse(String(row['receipt'])).receipt.disposition,
  ])
}

async function runHints(seed: number, steps: readonly number[], drop: boolean) {
  const w = await dispatchWorld()
  try {
    const id = await w.create(everyMinute(), `hints-${seed}`)
    const random = randomOf(seed)
    const dispatcher = w.dispatcher(
      undefined,
      drop ? hinting(w.time.source, random) : w.time.source,
    )
    dispatcher.start()
    await dispatcher.round()
    for (const minutes of steps) {
      w.time.advance(minutes * MINUTE)
      for (const _ of [1, 2, 3]) await settle()
      await dispatcher.round()
    }
    await dispatcher.close()
    return partition(w, id, w.time.source.now())
  } finally {
    await w.close()
  }
}

describe('random sequences against the model', { tags: ['slow'], timeout: 600_000 }, () => {
  it('hints dropped or sent twice at random do not change any outcome: the periodic round is the authority', async () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 8; seed += 1) {
      const random = randomOf(seed * 7919)
      const steps = Array.from({ length: 3 + below(random, 4) }, () => 1 + below(random, 3))
      seen.add(steps.join(','))
      const exact = await runHints(seed, steps, false)
      const dropped = await runHints(seed, steps, true)
      expect(dropped, `seed ${seed}: ${steps.join(',')}`).toEqual(exact)
    }
    process.stdout.write(`hint sequences: ${seen.size} distinct of 8\n`)
    expect(seen.size).toBeGreaterThan(4)
  })

  it('two dispatchers, restarts and stretches of downtime in random order keep every minute disposed once, in one way', async () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 8; seed += 1) {
      const random = randomOf(seed * 104_729)
      const w = await dispatchWorld({ gapMs: 5 * MINUTE })
      try {
        const id = await w.create(everyMinute(), `pair-${seed}`)
        let generation = 0
        const make = () =>
          w.dispatcher(`00000000-0000-8000-8000-${String(++generation).padStart(12, '0')}`)
        let [a, b] = [make(), make()]
        const trail: string[] = []
        for (let step = 0; step < 8; step += 1) {
          const roll = below(random, 4)
          if (roll === 0) {
            const minutes = 1 + below(random, 3)
            trail.push(`+${minutes}`)
            w.time.advance(minutes * MINUTE)
          } else if (roll === 1) {
            trail.push('ab')
            await Promise.all([a.round(), b.round()])
          } else if (roll === 2) {
            trail.push('restart')
            await a.close()
            a = make()
          } else {
            const minutes = 6 + below(random, 30)
            trail.push(`down${minutes}`)
            await Promise.all([a.close(), b.close()])
            w.time.setWall(w.time.source.now() + minutes * MINUTE)
            ;[a, b] = [make(), make()]
          }
        }
        for (const _ of [1, 2, 3]) await Promise.all([a.round(), b.round()])
        seen.add(trail.join(' '))
        await Promise.all([a.close(), b.close()])
        partition(w, id, w.time.source.now())
      } finally {
        await w.close()
      }
    }
    process.stdout.write(`dispatcher sequences: ${seen.size} distinct of 8\n`)
    expect(seen.size).toBeGreaterThan(4)
  })
})
