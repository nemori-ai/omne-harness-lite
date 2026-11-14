import { functionMetrics, MODULE_UNIT, type FunctionMetric } from '../metrics/complexity.ts'
import { fileAt, git } from '../core/git.ts'
import type { FunctionRow } from '../metrics/report.ts'
import type { AgainstBase, ExplainedFunction } from './against-base.ts'

export type BaseFile =
  | { readonly kind: 'new-file' }
  | { readonly kind: 'text'; readonly path: string; readonly text: string }
  | { readonly kind: 'unreadable'; readonly reason: string }

export interface FunctionsAgainstBase {
  readonly kept: readonly ExplainedFunction[]
  readonly notWorse: readonly ExplainedFunction[]
}

export function parseNameStatus(output: string): Map<string, string> {
  const fields = output.split('\u0000').filter(field => field !== '')
  const out = new Map<string, string>()
  for (let index = 0; index < fields.length;) {
    const status = fields[index] ?? ''
    const [from, to] = [fields[index + 1] ?? '', fields[index + 2] ?? '']
    if (status.startsWith('R')) out.set(to, from)
    else if (!/^[ACD]/u.test(status)) out.set(from, from)
    index += /^[RC]/u.test(status) ? 3 : 2
  }
  return out
}

export function baseFilesOf(
  root: string,
  mergeBase: string,
  paths: ReadonlySet<string>,
): Map<string, BaseFile> {
  const out = new Map<string, BaseFile>()
  if (paths.size === 0) return out
  const tracked = parseNameStatus(
    git(root, ['diff', '--no-color', '-M', '-z', '--name-status', mergeBase]),
  )
  for (const path of paths) {
    const before = tracked.get(path)
    if (before === undefined) {
      out.set(path, { kind: 'new-file' })
      continue
    }
    const text = fileAt(root, mergeBase, before)
    const renamed = before === path ? '' : `（改名前是 ${before}）`
    out.set(
      path,
      text === undefined
        ? { kind: 'unreadable', reason: `基线文本取不到${renamed}` }
        : { kind: 'text', path: before, text },
    )
  }
  return out
}

type BaseUnits =
  | { readonly kind: 'new-file' }
  | { readonly kind: 'units'; readonly units: readonly FunctionMetric[] }
  | { readonly kind: 'unreadable'; readonly reason: string }

function unitsOf(base: BaseFile | undefined): BaseUnits {
  if (base === undefined) return { kind: 'unreadable', reason: '没有取基线文本' }
  if (base.kind !== 'text') return base
  try {
    return { kind: 'units', units: functionMetrics({ path: base.path, text: base.text }) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { kind: 'unreadable', reason: `基线文本解析不了：${message}` }
  }
}

function judgeOne(row: FunctionRow, sameNameNow: number, base: BaseUnits): AgainstBase {
  if (base.kind === 'new-file') return { kind: 'new', reason: 'new-file' }
  if (base.kind === 'unreadable') return { kind: 'unsure', reason: base.reason }
  const [only, ...others] = base.units.filter(unit => unit.name === row.name)
  if (only === undefined)
    return row.name === MODULE_UNIT
      ? judgeComplexity(row.complexity, 1)
      : { kind: 'new', reason: 'new-function' }
  if (others.length > 0 || sameNameNow > 1)
    return {
      kind: 'unsure',
      reason: `同一文件里同名函数现在 ${sameNameNow} 个、基线上 ${others.length + 1} 个，对不上`,
    }
  return judgeComplexity(row.complexity, only.complexity)
}

function judgeComplexity(now: number, baseline: number): AgainstBase {
  return now > baseline ? { kind: 'worse', baseline } : { kind: 'not-worse', baseline }
}

export function judgeAgainstBase(
  candidates: readonly FunctionRow[],
  all: readonly FunctionRow[],
  bases: ReadonlyMap<string, BaseFile>,
): FunctionsAgainstBase {
  const units = new Map<string, BaseUnits>()
  const kept: ExplainedFunction[] = []
  const notWorse: ExplainedFunction[] = []
  for (const row of candidates) {
    let base = units.get(row.path)
    if (base === undefined) {
      base = unitsOf(bases.get(row.path))
      units.set(row.path, base)
    }
    const sameNameNow = all.filter(other => other.path === row.path && other.name === row.name)
    const againstBase = judgeOne(row, sameNameNow.length, base)
    ;(againstBase.kind === 'not-worse' ? notWorse : kept).push({ ...row, againstBase })
  }
  return { kept, notWorse }
}
