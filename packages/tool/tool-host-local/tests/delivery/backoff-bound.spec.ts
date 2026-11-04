// Property guard of the push backoff (R2-D273, R2-D282), the machine-readable twin of
// `verification/models/DeliveryBackoff.tla`. A seeded driver moves the clock by random steps
// (zero included, so bursts of drives in one instant happen), lets the receiver answer
// unavailable, denied or saved, and drives the real worker. A judge replays every drive against
// the model:
//   Q1 no push before the reported wait is over, and every wait of a streak doubles the last,
//   Q2 no wait is longer than maxMs,
//   Q3 the delivery stays owed until the receiver saved it,
//   Q4 the first wait after an answer without unavailable is initialMs again,
//   Q5 every push that the receiver answered unavailable writes exactly one named warning,
//   Q6 every push that failed definitively (denied) writes exactly one named failure warning, and
//      leaves the delivery owed (R2-D327),
//   L  a drive after the wait is over pushes (the backoff never stops the delivery).
// The negative control runs the same driver and judge against toy workers with one rule removed;
// the judge must report that rule.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it, vi } from 'vitest'
import { createLocalToolResultDelivery } from '../../src/result-delivery.ts'
import { fixture, ok } from './fixture.ts'

type Mode = 'unavailable' | 'denied' | 'saved'
type Observed = { pushed: boolean; pending: number; warnings: string[] }
type Subject = { step(now: number, mode: Mode): Promise<Observed> }

const INITIAL = 1000
const CAP = 8000

/** mulberry32: a small seeded generator, so a red run names the seed that reproduces it. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const waitOf = (warning: string): number | null => {
  const match = /the next push is in (\d+) ms/.exec(warning)
  return match === null ? null : Number(match[1])
}

/** Drives `subject` for `steps` drives and returns the violations the judge found. */
async function judge(subject: Subject, seed: number, steps: number): Promise<string[]> {
  const next = random(seed)
  const violations: string[] = []
  let now = 0
  let until = 0
  let last: number | null = null
  let saved = false
  for (let i = 1; i <= steps && !saved; i += 1) {
    const r = next()
    now += r < 0.4 ? 0 : r < 0.7 ? Math.floor(next() * INITIAL) : Math.floor(next() * 3 * CAP)
    const m = next()
    const mode: Mode = m < 0.85 ? 'unavailable' : m < 0.98 ? 'denied' : 'saved'
    const seen = await subject.step(now, mode)
    const say = (text: string) => violations.push(`drive ${String(i)} at ${String(now)}: ${text}`)
    const due = last === null || now >= until
    if (seen.pushed && !due) say(`Q1: pushed before the wait ended at ${String(until)}`)
    if (!seen.pushed && due) say('L: the wait was over and the drive did not push')
    if (!seen.pushed) {
      if (seen.warnings.length > 0) say('Q5: a warning without a push')
      if (seen.pending !== 1) say('Q3: the delivery is no longer owed')
      continue
    }
    if (mode === 'unavailable') {
      if (seen.warnings.length !== 1)
        say(`Q5: ${String(seen.warnings.length)} warnings for one paced push`)
      if (seen.pending !== 1) say('Q3: an unavailable push ended the delivery')
      const wait = seen.warnings.length === 0 ? null : waitOf(seen.warnings[0] as string)
      if (wait === null) {
        // Without the named wait the judge keeps the model's own wait, so Q1 still applies.
        last = last === null ? INITIAL : Math.min(2 * last, CAP)
      } else {
        if (wait > CAP) say(`Q2: the wait ${String(wait)} is above the cap`)
        if (last === null && wait !== INITIAL)
          say(`Q4: the first wait of a streak is ${String(wait)}, not ${String(INITIAL)}`)
        if (last !== null && wait <= CAP && wait !== Math.min(2 * last, CAP))
          say(`Q1: the wait ${String(wait)} does not double ${String(last)}`)
        last = wait
      }
      until = now + last
    } else {
      last = null
      if (mode === 'saved') {
        if (seen.warnings.length !== 0) say('Q5: a warning for a push that was not paced')
        if (seen.pending !== 0) say('Q3: a saved delivery is still owed')
        saved = true
      } else {
        if (seen.warnings.length !== 1)
          say(`Q6: ${String(seen.warnings.length)} warnings for one definite failure`)
        else if (waitOf(seen.warnings[0] as string) !== null)
          say('Q5: a definite failure was written as a paced push')
        if (seen.pending !== 1) say('Q3: a denied push ended the delivery')
      }
    }
  }
  return violations
}

async function realWorker(): Promise<Subject> {
  const f = await fixture()
  let now = 0
  let mode: Mode = 'unavailable'
  const warnings: string[] = []
  const push = vi.fn(async (args: Parameters<typeof f.receiver.push>[0]) =>
    mode === 'unavailable'
      ? fail({ kind: 'unavailable', dependency: 'agent-journal', diagnostic: 'refused' } as const)
      : mode === 'denied'
        ? fail({ kind: 'denied', action: 'recover' } as const)
        : f.receive(args),
  )
  const worker = createLocalToolResultDelivery({
    ...f.input,
    position: { ...f.input.position, receiver: async () => succeed({ push }) },
    pacing: { initialMs: INITIAL, maxMs: CAP },
    warn: message => warnings.push(message),
    now: () => now,
  })
  return {
    step: async (at, answer) => {
      now = at
      mode = answer
      const calls = push.mock.calls.length
      const written = warnings.length
      const { pending } = ok(await f.drive(worker))
      return { pushed: push.mock.calls.length > calls, pending, warnings: warnings.slice(written) }
    },
  }
}

const SEEDS = Array.from({ length: 30 }, (_, i) => 2000 + i)

describe('the push backoff keeps the DeliveryBackoff properties under random clocks', () => {
  it.each(SEEDS)('seed %i: the judge finds nothing', async seed => {
    expect(await judge(await realWorker(), seed, 60)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// Negative control: a toy worker with one rule removed must be caught by the same judge.
// ---------------------------------------------------------------------------------------------

type Fault = 'hot-loop' | 'no-cap' | 'no-reset' | 'drop' | 'silent' | 'silent-failure' | 'stuck'

/** The pacing of the worker in a few lines, with one rule removed. */
function toy(fault: Fault): Subject {
  let last: number | null = null
  let until = 0
  let pending = 1
  return {
    step: async (now, mode) => {
      if (pending === 0) return { pushed: false, pending, warnings: [] }
      const due = fault === 'hot-loop' || last === null || now >= until
      if (!due || (fault === 'stuck' && last !== null))
        return { pushed: false, pending, warnings: [] }
      if (mode === 'unavailable') {
        const doubled = last === null ? INITIAL : 2 * last
        last = fault === 'no-cap' ? doubled : Math.min(doubled, CAP)
        until = now + last
        if (fault === 'drop') pending = 0
        const warnings = fault === 'silent' ? [] : [`x; the next push is in ${String(last)} ms`]
        return { pushed: true, pending, warnings }
      }
      if (fault !== 'no-reset') last = null
      if (mode === 'saved') pending = 0
      const warnings =
        mode === 'saved' || fault === 'silent-failure' ? [] : ['y; failed definitively']
      return { pushed: true, pending, warnings }
    },
  }
}

describe('negative control: the judge reports a worker with one pacing rule removed', () => {
  it.each<[Fault, string]>([
    ['hot-loop', 'Q1'],
    ['no-cap', 'Q2'],
    ['no-reset', 'Q4'],
    ['drop', 'Q3'],
    ['silent', 'Q5'],
    ['silent-failure', 'Q6'],
    ['stuck', 'L'],
  ])('%s is reported as %s', async (fault, property) => {
    const found: string[] = []
    for (const seed of SEEDS) found.push(...(await judge(toy(fault), seed, 60)))
    expect(found.some(text => text.includes(` ${property}:`))).toBe(true)
  })
})
