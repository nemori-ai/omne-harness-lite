import { isTestPath } from '@omne-harness/repo-toolchain/core/rule'
import type { FunctionBand, HygieneBaseline, HygieneLimits } from './baseline.ts'
import { outsideAllowlist } from './documents.ts'
import { measureSource } from './source.ts'

export interface TextFile {
  readonly path: string
  readonly text: string
}

export interface FunctionMeasure extends FunctionBand {
  readonly longestLine: number
}

export interface Measurements {
  readonly documentPaths: ReadonlySet<string>
  readonly sourcePaths: ReadonlySet<string>
  readonly documents: readonly string[]
  readonly comments: ReadonlyMap<string, { readonly count: number; readonly firstLine: number }>
  readonly files: ReadonlyMap<string, number>
  readonly functions: ReadonlyMap<string, FunctionMeasure>
}

const SOURCE_ROOTS = /^(packages|apps|tools)\//u
const SOURCE_EXTENSION = /\.(ts|tsx|mts|mjs)$/u
const SKIPPED_SEGMENT = /(^|\/)(node_modules|dist)\//u

export function isCheckedSource(path: string): boolean {
  return (
    SOURCE_ROOTS.test(path) &&
    path.includes('/src/') &&
    SOURCE_EXTENSION.test(path) &&
    !SKIPPED_SEGMENT.test(path) &&
    !/\.d\.[cm]?ts$/u.test(path) &&
    !/\.generated\./u.test(path) &&
    !isTestPath(path)
  )
}

export function measure(
  documentPaths: readonly string[],
  isPrivateMember: (directory: string) => boolean,
  sources: readonly TextFile[],
  limits: HygieneLimits,
): Measurements {
  const comments = new Map<string, { count: number; firstLine: number }>()
  const files = new Map<string, number>()
  const functions = new Map<string, FunctionMeasure>()
  const sourcePaths = new Set<string>()
  for (const source of sources) {
    if (!isCheckedSource(source.path)) continue
    sourcePaths.add(source.path)
    const result = measureSource(source.path, source.text, limits.functionLines)
    if (result.comments.count > 0) comments.set(source.path, result.comments)
    if (result.lines > limits.fileLines) files.set(source.path, result.lines)
    if (result.functions.count > 0) functions.set(source.path, result.functions)
  }
  return {
    documentPaths: new Set(documentPaths),
    sourcePaths,
    documents: outsideAllowlist(documentPaths, isPrivateMember),
    comments,
    files,
    functions,
  }
}

export function baselineOf(current: Measurements, limits: HygieneLimits): HygieneBaseline {
  return {
    limits,
    documents: [...current.documents],
    comments: Object.fromEntries([...current.comments].map(([path, value]) => [path, value.count])),
    sizes: {
      files: Object.fromEntries(current.files),
      functions: Object.fromEntries(
        [...current.functions].map(([path, value]) => [
          path,
          { count: value.count, longest: value.longest },
        ]),
      ),
    },
  }
}
