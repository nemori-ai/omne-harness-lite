// 读数用的线与断言写法，只从仓库根 repo-toolchain.config.json 读，不在适配层写死。
// omne 的 metrics 把 `metrics.thresholds` 的 warn、alert 用在函数的分数上：有覆盖时分数就是 CRAP，没有时是圈复杂度
// （repo-toolchain src/metrics/report.ts 的 levelOf）。所以同一对线同时交给 pqw 的 --cc 与 --crap，带位与 omne 一致。
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
  /** pqw --assert-pattern 的正则原文。 */
  readonly assertPattern: string
}

/** 从 metrics 一节与断言正则合成读数配置；线不是数或 warn 大于 alert 时抛错，不悄悄用缺省。 */
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

/** pqw 的线参数写法：`<warn>,<alert>`。 */
export const linesArgument = (lines: Lines): string => `${lines.warn},${lines.alert}`
