// 「要解释的函数」与基线比：碰过、带位不是 ok 的函数里，只留比基线涨了的、新出现的，
// 以及拿不准的（照留并注明原因）；原来就在线外、这次没有变差的拿出来另计，不让它们无声消失。
// 基线上的圈复杂度用度量同一套解析与算法（`functionMetrics`）对基线提交上的文件文本算，
// 只取这些函数所在的文件，不扫全仓。结果的形状与说明文字在 against-base.ts。
import { functionMetrics, MODULE_UNIT, type FunctionMetric } from '../metrics/complexity.ts'
import { fileAt, git } from '../metrics/git.ts'
import type { FunctionRow } from '../metrics/report.ts'
import type { AgainstBase, ExplainedFunction } from './against-base.ts'

/** 一个文件在基线提交上的样子：新文件、能取到的文本（改名的是改名前的路径），或取不到。 */
export type BaseFile =
  | { readonly kind: 'new-file' }
  | { readonly kind: 'text'; readonly path: string; readonly text: string }
  | { readonly kind: 'unreadable'; readonly reason: string }

export interface FunctionsAgainstBase {
  /** 要解释的：涨了的、新出现的、拿不准的。顺序同输入。 */
  readonly kept: readonly ExplainedFunction[]
  /** 碰过、原来就在线外、这次没有变差的。 */
  readonly notWorse: readonly ExplainedFunction[]
}

/**
 * `git diff -M -z --name-status` 的输出 → 现在的路径 → 基线上的路径。新增的（含复制出来的）不在其中，
 * 删除的也不在其中。改名与复制一条三段（状态、原路径、新路径），其余两段。
 */
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

/**
 * `paths` 里每个文件在基线提交上的样子。基线以来已跟踪的改动按 git 的改名判定（`-M`）对回改名前的路径；
 * 不在已跟踪改动里的是未跟踪的新文件。没有要取的文件时不跑 git。
 */
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
    // 不在已跟踪改动里（未跟踪），或 git 认作新增的：新文件。
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
    // 顶层判定点为零时度量不出 <module> 这个单元：基线上没有它，它那时就是 1，不是新出现。
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

/**
 * @param candidates 碰过、带位不是 ok 的函数。
 * @param all 当前全部函数，用来数同一文件里的同名函数。
 * @param bases 候选函数所在文件在基线上的样子（`baseFilesOf`）。
 */
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
