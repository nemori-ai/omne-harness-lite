import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import type { Violation } from '@omne-harness/repo-toolchain/core/rule'
import { baseCandidates, compareToBase, gitBaseAccess, readBaseBaseline } from './base.ts'
import {
  baselineOf,
  isCheckedSource,
  measure,
  type Measurements,
  type TextFile,
} from './measure.ts'
import { readHygieneBaseline, type HygieneBaseline } from './baseline.ts'
import {
  commentViolations,
  documentViolations,
  looseBaselineViolations,
  sizeViolations,
} from './checks.ts'
import { SPEC_PATH, specContentViolations, specShapeViolations } from './spec.ts'

export const HYGIENE_CHECK_COUNT = 5

function readTracked(root: string, paths: readonly string[]): TextFile[] {
  const out: TextFile[] = []
  for (const path of paths) {
    const full = join(root, path)
    if (existsSync(full)) out.push({ path, text: readFileSync(full, 'utf8') })
  }
  return out
}

export function trackedPaths(root: string, pathspecs: readonly string[]): string[] {
  return nulSeparated(git(root, ['ls-files', '-z', '--', ...pathspecs])).filter(path =>
    existsSync(join(root, path)),
  )
}

export function privateMemberReader(root: string): (directory: string) => boolean {
  const cache = new Map<string, boolean>()
  return directory => {
    const known = cache.get(directory)
    if (known !== undefined) return known
    const manifest = join(root, directory, 'package.json')
    let result = false
    if (existsSync(manifest)) {
      const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
      result =
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as Record<string, unknown>)['private'] === true
    }
    cache.set(directory, result)
    return result
  }
}

export interface Snapshot {
  readonly current: Measurements
  readonly specs: TextFile[]
  readonly isPrivateMember: (directory: string) => boolean
}

export function snapshotOf(root: string, baseline: HygieneBaseline): Snapshot {
  const documents = trackedPaths(root, ['*.md'])
  const isPrivateMember = privateMemberReader(root)
  const sourcePaths = trackedPaths(root, ['packages', 'apps', 'tools']).filter(isCheckedSource)
  return {
    current: measure(documents, isPrivateMember, readTracked(root, sourcePaths), baseline.limits),
    specs: readTracked(
      root,
      documents.filter(path => SPEC_PATH.test(path)),
    ),
    isPrivateMember,
  }
}

export interface HygieneResult {
  readonly violations: Violation[]
  readonly note: string | undefined
}

export function runHygiene(root: string, baselineFile: string): HygieneResult {
  const baseline = readHygieneBaseline(baselineFile)
  const { current, specs, isPrivateMember } = snapshotOf(root, baseline)
  const violations = [
    ...documentViolations(current, baseline),
    ...specShapeViolations(specs, baseline.limits.specLines),
    ...specContentViolations(specs),
    ...commentViolations(current, baseline),
    ...sizeViolations(current, baseline),
    ...looseBaselineViolations(current, baseline, isPrivateMember),
  ]
  const base = compareToBase(baseline, readBaseBaseline(baseCandidates(root), gitBaseAccess(root)))
  violations.push(...base.violations)
  return { violations, note: base.note }
}

export function currentBaseline(root: string, existing: HygieneBaseline): HygieneBaseline {
  return baselineOf(snapshotOf(root, existing).current, existing.limits)
}
