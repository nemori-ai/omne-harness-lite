import { isDeepStrictEqual } from 'node:util'
import { expect, it } from 'vitest'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { createReceiveRecord } from '../src/receive-evidence.ts'

function generator(seed: number) {
  let state = seed >>> 0
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % bound
  }
}

function fact(index: number, ended: boolean): TransportFact {
  return ended
    ? { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }
    : { kind: 'block-delta', index: '0', delta: `d${index}` }
}

it('P and Q hold for random orders of yield, body claim, proof and replay', () => {
  let proofs = 0
  for (let seed = 1; seed <= 4000; seed++) {
    const next = generator(seed)
    const record = createReceiveRecord()
    const yielded: TransportFact[] = []
    const proven: TransportFact[] = []
    let sinceProof: TransportFact[] = []
    let bodyRead = false
    let ended = false
    let voided = false
    let last: { window: string; batch: TransportFact[] } | null = null
    let windows = 0
    for (let step = 0; step < 24; step++) {
      const action = next(10)
      if (action < 4 && !ended) {
        const made = fact(yielded.length, next(6) === 0)
        if (made.kind === 'ended') ended = true
        record.yielded(made)
        yielded.push(made)
        if (!voided) sinceProof.push(made)
      } else if (action === 4) {
        record.bodyClaimed()
        bodyRead = true
      } else if (action < 8) {
        const shape = next(5)
        const batch =
          shape < 2
            ? [...sinceProof]
            : shape === 2
              ? sinceProof.slice(1)
              : shape === 3
                ? [...sinceProof, fact(999, false)]
                : sinceProof.slice(0, -1)
        const window = `w${++windows}`
        const answer = record.prove(window, batch)
        const expected = !voided && isDeepStrictEqual(batch, sinceProof) && (!bodyRead || ended)
        expect(answer, `seed ${seed} step ${step}`).toBe(expected)
        if (answer) {
          proofs++
          proven.push(...batch)
          expect(proven, `seed ${seed} step ${step}: P`).toEqual(yielded)
          expect(!bodyRead || ended, `seed ${seed} step ${step}: Q`).toBe(true)
          last = { window, batch }
          sinceProof = []
        } else {
          voided = true
          sinceProof = []
        }
      } else if (last !== null) {
        const same = next(3) !== 0
        const answer = record.prove(last.window, same ? last.batch : [fact(998, false)])
        expect(answer, `seed ${seed} step ${step}: replay`).toBe(!voided && same)
        if (!answer) {
          voided = true
          sinceProof = []
        }
      }
    }
  }
  expect(proofs).toBeGreaterThan(1000)
})
