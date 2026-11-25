import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASELINE_JUDGE_CONFIG, DEFAULT_JUDGE_CONFIG } from '@omne-harness/goal-contract'
import { describe, expect, it } from 'vitest'
import { fileCache } from '../src/client.ts'
import { loadParents } from '../src/data.ts'
import { casesOf } from '../src/mutate.ts'
import { replay, type Decide } from '../src/replay.ts'
import { reportOf, type Report } from '../src/report.ts'

const EXPERIMENTS = join(import.meta.dirname, '..', 'experiments')
const kept = (name: string) => join(EXPERIMENTS, name, 'replies.jsonl')
const HELD_OUT = loadParents()
  .flatMap(casesOf)
  .filter(entry => entry.split !== 'tune')
const unkept: Decide = request =>
  Promise.reject(new Error(`a request to ${request.model} is not among the kept replies`))

describe('the comparison the default scheme was settled on', () => {
  const compared = JSON.parse(
    readFileSync(join(EXPERIMENTS, 'final-vs-baseline-heldout', 'compare.json'), 'utf8'),
  ) as Readonly<{ base: Report; candidate: Report }>

  it.each([
    ['the baseline scheme', BASELINE_JUDGE_CONFIG, 'base', ['baseline-verify', 'baseline-canary']],
    ['the default scheme', DEFAULT_JUDGE_CONFIG, 'candidate', ['final-verify', 'final-canary']],
  ] as const)(
    'replays for %s from the kept replies alone to the kept numbers: it still asks what it asked',
    async (_name, config, side, experiments) => {
      const replayed = await replay(HELD_OUT, config, {
        decide: unkept,
        cache: fileCache(experiments.map(kept)),
      })
      const report = reportOf('kept', config, 'verify,canary', replayed)
      expect(replayed.sent).toBe(0)
      expect(report.cases).toBe(compared[side].cases)
      expect(report.gates).toEqual(compared[side].gates)
      expect(report.ranking).toEqual(compared[side].ranking)
      expect(report.falseSettled).toEqual(compared[side].falseSettled)
    },
  )
})
