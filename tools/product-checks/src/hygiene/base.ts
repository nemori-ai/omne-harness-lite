import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { fileAt, git } from '@omne-harness/repo-toolchain/core/git'
import type { Violation } from '@omne-harness/repo-toolchain/core/rule'
import { HYGIENE_BASELINE_PATH, parseHygieneBaseline, type HygieneBaseline } from './baseline.ts'
import { growthViolations } from './checks.ts'

export type BaseBaseline =
  | { readonly status: 'found'; readonly ref: string; readonly baseline: HygieneBaseline }
  | { readonly status: 'absent'; readonly reason: string }

export interface BaseAccess {
  resolves(ref: string): boolean
  show(ref: string): string | undefined
}

export function readBaseBaseline(
  candidates: readonly (string | undefined)[],
  access: BaseAccess,
): BaseBaseline {
  const tried = candidates.filter((ref): ref is string => ref !== undefined && ref !== '')
  const ref = tried.find(candidate => access.resolves(candidate))
  if (ref === undefined)
    return { status: 'absent', reason: `取不到基点（试过 ${tried.join('、')}）` }
  const text = access.show(ref)
  if (text === undefined) return { status: 'absent', reason: `基点 ${ref} 上没有这份基线文件` }
  try {
    return {
      status: 'found',
      ref,
      baseline: parseHygieneBaseline(text, `${ref}:${HYGIENE_BASELINE_PATH}`),
    }
  } catch (error) {
    return { status: 'absent', reason: error instanceof Error ? error.message : String(error) }
  }
}

export function compareToBase(
  current: HygieneBaseline,
  base: BaseBaseline,
): { violations: Violation[]; note: string | undefined } {
  if (base.status === 'absent')
    return { violations: [], note: `基线只减不增 未检查（${base.reason}）` }
  return { violations: growthViolations(current, base.baseline), note: undefined }
}

export function gitBaseAccess(root: string): BaseAccess {
  return {
    resolves(ref) {
      try {
        git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
        return true
      } catch {
        return false
      }
    },
    show: ref => fileAt(root, ref, HYGIENE_BASELINE_PATH),
  }
}

export function baseCandidates(root: string): (string | undefined)[] {
  return [
    baselines(root).targetBase,
    process.env['BASELINE'],
    'origin/integration/mainline',
    'origin/main',
  ]
}
