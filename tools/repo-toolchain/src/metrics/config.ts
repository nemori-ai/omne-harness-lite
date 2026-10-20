// 度量的阈值、色带与页面参数只在仓库根 `repo-toolchain.config.json` 的 `metrics` 一节里定一次；这里读它并校验，`pnpm run metrics` 与
// `pnpm run loop:status` 共用同一份。
import { readToolchainSection, toolchainConfigPath } from '../core/toolchain-config.ts'
import type { Bands, Thresholds } from './report.ts'

export interface MetricsConfig {
  readonly thresholds: Thresholds
  readonly bands: Bands
  readonly summary: { readonly top: number }
  readonly page: { readonly changedEdgeLimit: number }
  readonly coverage: { readonly roots: readonly string[] }
}

export function readMetricsConfig(file: string = toolchainConfigPath()): MetricsConfig {
  const path = `${file} metrics`
  const parsed: unknown = readToolchainSection('metrics', file)
  const config = parsed as Partial<MetricsConfig>
  const warn = config.thresholds?.warn
  const alert = config.thresholds?.alert
  const green = config.bands?.green
  const yellow = config.bands?.yellow
  const red = config.bands?.red
  const top = config.summary?.top
  if (typeof warn !== 'number' || typeof alert !== 'number' || !(warn <= alert))
    throw new Error(`${path}: thresholds.warn 与 thresholds.alert 须为数字且 warn ≤ alert`)
  if (
    typeof green !== 'number' ||
    typeof yellow !== 'number' ||
    typeof red !== 'number' ||
    !(green <= yellow && yellow <= red)
  )
    throw new Error(`${path}: bands 的 green、yellow、red 须为数字且依次不减`)
  if (typeof top !== 'number' || !Number.isInteger(top) || top < 1 || top > 5)
    throw new Error(`${path}: summary.top 须为 1 到 5 的整数（摘要不超过 12 行）`)
  const changedEdgeLimit = config.page?.changedEdgeLimit
  if (
    typeof changedEdgeLimit !== 'number' ||
    !Number.isInteger(changedEdgeLimit) ||
    changedEdgeLimit < 0
  )
    throw new Error(`${path}: page.changedEdgeLimit 须为非负整数`)
  const roots = config.coverage?.roots
  if (
    !Array.isArray(roots) ||
    roots.length === 0 ||
    !roots.every((item): item is string => typeof item === 'string' && /^[\w.-]+$/u.test(item))
  )
    throw new Error(`${path}: coverage.roots 须为非空的顶层目录名数组`)
  return {
    thresholds: { warn, alert },
    bands: { green, yellow, red },
    summary: { top },
    page: { changedEdgeLimit },
    coverage: { roots },
  }
}
