import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASELINE_JUDGE_CONFIG, DEFAULT_JUDGE_CONFIG } from '@omne-harness/goal-contract'
import { describe, expect, it } from 'vitest'
import { fileCache } from '../src/client.ts'
import { pairedLoss, spreadOf, talliesOf, type Paired, type Spread } from '../src/compare.ts'
import { loadParents } from '../src/data.ts'
import { graded, pairs } from '../src/grade.ts'
import { casesOf } from '../src/mutate.ts'
import { replay, type Decide, type Replayed } from '../src/replay.ts'
import { reportOf, type Report } from '../src/report.ts'

const EXPERIMENTS = join(import.meta.dirname, '..', 'experiments')
const kept = (name: string) => join(EXPERIMENTS, name, 'replies.jsonl')
const HELD_OUT = loadParents()
  .flatMap(casesOf)
  .filter(entry => entry.split !== 'tune')
const unkept: Decide = request =>
  Promise.reject(new Error(`a request to ${request.model} is not among the kept replies`))
const SIDES = [
  ['the baseline scheme', BASELINE_JUDGE_CONFIG, 'base', ['baseline-verify', 'baseline-canary']],
  [
    'the default scheme',
    DEFAULT_JUDGE_CONFIG,
    'candidate',
    ['final-verify', 'final-canary', 'f01-staleness-decided-heldout'],
  ],
] as const
const replayed = (side: (typeof SIDES)[number]): Promise<Replayed> =>
  replay(HELD_OUT, side[1], { decide: unkept, cache: fileCache(side[3].map(kept)) })

describe('the comparison the default scheme was settled on', () => {
  const compared = JSON.parse(
    readFileSync(join(EXPERIMENTS, 'default-vs-baseline-heldout', 'compare.json'), 'utf8'),
  ) as Readonly<{ base: Report; candidate: Report; paired: Paired; spreads: readonly Spread[] }>

  it.each(SIDES.map(side => ({ scheme: side[0], side })))(
    'replays for $scheme from the kept replies alone to the kept numbers: it still asks what it asked',
    async ({ side }) => {
      const again = await replayed(side)
      const report = reportOf('kept', side[1], 'verify,canary', again)
      expect(again.sent).toBe(0)
      expect(report.cases).toBe(compared[side[2]].cases)
      expect(report.gates).toEqual(compared[side[2]].gates)
      expect(report.ranking).toEqual(compared[side[2]].ranking)
      expect(report.falseSettled).toEqual(compared[side[2]].falseSettled)
    },
  )

  it('gives the kept paired difference and the kept intervals again: resampling is the same draw for the same data', async () => {
    const [base, candidate] = await Promise.all(SIDES.map(replayed))
    const tallies = (run: Replayed) => talliesOf(run.outcomes.flatMap(graded))
    expect(pairedLoss(tallies(base!), tallies(candidate!))).toEqual(compared.paired)
    expect(spreadOf(tallies(base!), pairs(base!.outcomes))).toEqual(compared.spreads[0])
    expect(spreadOf(tallies(candidate!), pairs(candidate!.outcomes))).toEqual(compared.spreads[1])
  })
})
