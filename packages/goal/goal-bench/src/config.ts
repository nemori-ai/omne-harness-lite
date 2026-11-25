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

/** The configuration a file gives; without a file, the baseline scheme. */
export function configOf(file: string | undefined): JudgeConfig {
  if (file === undefined) return BASELINE_JUDGE_CONFIG
  return overBaseline(JSON.parse(readFileSync(file, 'utf8')) as Partial<JudgeConfig>)
}
