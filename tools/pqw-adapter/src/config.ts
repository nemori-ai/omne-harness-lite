import {
  readToolchainSection,
  toolchainConfigPath,
} from '@omne-harness/repo-toolchain/core/toolchain-config'
import { readLoopConfig } from '@omne-harness/repo-toolchain/loop/config'

export interface Lines {
  readonly warn: number
  readonly alert: number
}

export interface ReadingConfig {
  readonly cyclomatic: Lines
  readonly crap: Lines
  readonly assertPattern: string
}

export function readingConfigOf(metrics: unknown, assertion: RegExp): ReadingConfig {
  const thresholds =
    typeof metrics === 'object' && metrics !== null
      ? (metrics as { thresholds?: { warn?: unknown; alert?: unknown } }).thresholds
      : undefined
  const warn = thresholds?.warn
  const alert = thresholds?.alert
  if (typeof warn !== 'number' || typeof alert !== 'number' || !(warn <= alert))
    throw new Error('metrics.thresholds 的 warn 与 alert 须为数字且 warn ≤ alert')
  const lines = { warn, alert }
  return { cyclomatic: lines, crap: lines, assertPattern: assertion.source }
}

export function readReadingConfig(root: string): ReadingConfig {
  const path = toolchainConfigPath(root)
  return readingConfigOf(
    readToolchainSection('metrics', path),
    readLoopConfig(path).sensors.assertions.assertionPattern,
  )
}

export const linesArgument = (lines: Lines): string => `${lines.warn},${lines.alert}`
