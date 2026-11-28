import { readFileSync } from 'node:fs'
import {
  BASELINE_JUDGE_CONFIG,
  JudgeConfigSchema,
  type JudgeConfig,
} from '@omne-harness/goal-contract'

/** A part of a configuration laid over the baseline scheme: every experiment says only what it changes. */
export function overBaseline(given: Partial<JudgeConfig>): JudgeConfig {
  const packaging = { ...BASELINE_JUDGE_CONFIG.packaging, ...given.packaging }
  const instructions = { ...BASELINE_JUDGE_CONFIG.instructions, ...given.instructions }
  return JudgeConfigSchema.parse({ ...BASELINE_JUDGE_CONFIG, ...given, packaging, instructions })
}

/** The configuration files give, laid over the baseline from left to right (`a.json,b.json`); without a file, the baseline scheme. */
export function configOf(files: string | undefined): JudgeConfig {
  if (files === undefined) return BASELINE_JUDGE_CONFIG
  const parts = files
    .split(',')
    .map(file => JSON.parse(readFileSync(file, 'utf8')) as Partial<JudgeConfig>)
  const given = parts.reduce<Partial<JudgeConfig>>(
    (under, over) => ({
      ...under,
      ...over,
      packaging: { ...under.packaging, ...over.packaging } as JudgeConfig['packaging'],
      instructions: { ...under.instructions, ...over.instructions } as JudgeConfig['instructions'],
    }),
    {},
  )
  return overBaseline(given)
}
