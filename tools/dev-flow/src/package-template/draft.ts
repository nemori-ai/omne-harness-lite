import {
  closeSync,
  openSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, parse, resolve } from 'node:path'
import type { FileTemplate } from './model.ts'
import { safeRelative } from './template.ts'

const validated = Symbol('validated draft')
export interface DraftPlan {
  readonly [validated]: true
  readonly target: string
  readonly files: ReadonlyMap<string, string>
}
export function checkDirectories(path: string): void {
  const absolute = resolve(path)
  const paths: string[] = []
  for (let current = absolute; current !== parse(current).root; current = dirname(current))
    paths.push(current)
  for (const current of paths.reverse()) {
    const stat = lstatSync(current, { throwIfNoEntry: false })
    if (stat !== undefined && (!stat.isDirectory() || stat.isSymbolicLink()))
      throw new Error(`Not a real package directory: ${current}`)
  }
}
export function requireNewTarget(target: string): void {
  checkDirectories(dirname(target))
  if (lstatSync(target, { throwIfNoEntry: false }) !== undefined)
    throw new Error(`Package target already exists: ${target}`)
}
export function planDraft(
  target: string,
  directory: string,
  templates: readonly FileTemplate[],
  values: Readonly<Record<string, string>>,
): DraftPlan {
  requireNewTarget(target)
  if (templates.length === 0) throw new Error('Template contains no files')
  const files = new Map<string, string>()
  for (const file of templates) {
    if (!safeRelative(file.source) || !safeRelative(file.target))
      throw new Error('Invalid template path')
    if (files.has(file.target)) throw new Error(`Duplicate generated file: ${file.target}`)
    const source = join(directory, file.source)
    checkDirectories(dirname(source))
    if (!lstatSync(source).isFile())
      throw new Error(`Template source is not a real file: ${source}`)
    files.set(
      file.target,
      readFileSync(source, 'utf8').replace(/\{\{([A-Z_]+)\}\}/gu, (_, key: string) => {
        const value = values[key]
        if (value === undefined) throw new Error(`Unknown template variable: ${key}`)
        return value
      }),
    )
  }
  for (const path of files.keys())
    if ([...files.keys()].some(other => path.startsWith(`${other}/`)))
      throw new Error(`Generated file is also a directory: ${path}`)
  return { [validated]: true, target: resolve(target), files }
}
export function writeDraft(plan: DraftPlan): void {
  requireNewTarget(plan.target)
  const owned: { path: string; ino: number; dev: number; directory: boolean }[] = []
  function remember(path: string, directory: boolean): void {
    const stat = lstatSync(path)
    owned.push({ path, ino: stat.ino, dev: stat.dev, directory })
  }
  function parents(path: string): void {
    checkDirectories(path)
    if (lstatSync(path, { throwIfNoEntry: false }) !== undefined) return
    parents(dirname(path))
    mkdirSync(path)
    remember(path, true)
  }
  try {
    parents(dirname(plan.target))
    // This mkdir claims the target exclusively, including against a dangling link.
    mkdirSync(plan.target)
    remember(plan.target, true)
    for (const [file, text] of plan.files) {
      const path = join(plan.target, file)
      parents(dirname(path))
      const descriptor = openSync(path, 'wx')
      try {
        remember(path, false)
        writeFileSync(descriptor, text)
      } finally {
        closeSync(descriptor)
      }
    }
  } catch (error) {
    for (const node of owned.reverse()) {
      try {
        checkDirectories(dirname(node.path))
        const stat = lstatSync(node.path, { throwIfNoEntry: false })
        if (stat?.ino !== node.ino || stat.dev !== node.dev || stat.isSymbolicLink()) continue
        if (node.directory) rmdirSync(node.path)
        else unlinkSync(node.path)
      } catch (cleanupError) {
        if (
          !(
            cleanupError instanceof Error &&
            'code' in cleanupError &&
            cleanupError.code === 'ENOTEMPTY'
          )
        )
          throw new AggregateError([error, cleanupError], 'Draft creation and cleanup failed')
      }
    }
    throw error
  }
}
