import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { git } from './git.ts'

export interface FileVersion {
  readonly kind: 'worktree' | 'revision'
  readonly commit: string
}

export function filePresence(
  root: string,
  version: FileVersion,
): (patterns: readonly string[]) => boolean {
  const present =
    version.kind === 'worktree' ? workingTreePresence(root) : revisionPresence(root, version.commit)
  return patterns => patterns.some(present)
}

function absent(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

function workingTreePresence(root: string): (pattern: string) => boolean {
  const walk = (directory: string): boolean => {
    let entries
    try {
      entries = readdirSync(join(root, directory), { withFileTypes: true })
    } catch (error) {
      return !absent(error)
    }
    return entries.some(entry => !entry.isDirectory() || walk(`${directory}/${entry.name}`))
  }
  return pattern => {
    if (pattern.endsWith('/**')) return walk(pattern.slice(0, -3))
    try {
      return !statSync(join(root, pattern)).isDirectory()
    } catch (error) {
      return !absent(error)
    }
  }
}

const withAncestors = (path: string): string[] =>
  path.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))

type Entry = 'missing' | 'tree' | 'file' | 'opaque'

function revisionPresence(root: string, commit: string): (pattern: string) => boolean {
  const run = (args: readonly string[]): string | undefined => {
    try {
      return git(root, args)
    } catch {
      return undefined
    }
  }
  const isCommit = run(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]) !== undefined
  const entries = new Map<string, Entry | undefined>()
  const entryOf = (path: string): Entry | undefined => {
    if (entries.has(path)) return entries.get(path)
    const line = run(['--literal-pathspecs', 'ls-tree', commit, '--', path])
    const mode = line?.split(' ', 1)[0]
    const entry: Entry | undefined =
      line === undefined
        ? undefined
        : line === ''
          ? 'missing'
          : mode === '040000'
            ? 'tree'
            : mode === '100644' || mode === '100755'
              ? 'file'
              : 'opaque'
    entries.set(path, entry)
    return entry
  }
  return pattern => {
    if (!isCommit) return true
    const exact = !pattern.endsWith('/**')
    const target = exact ? pattern : pattern.slice(0, -3)
    for (const path of withAncestors(target)) {
      const entry = entryOf(path)
      if (entry === undefined || entry === 'opaque') return true
      if (entry === 'missing') return false
      if (entry === 'file') return exact && path === target
    }
    if (exact) return false
    const listed = run([
      '--literal-pathspecs',
      'ls-tree',
      '-r',
      '--name-only',
      commit,
      '--',
      target,
    ])
    return listed === undefined || listed !== ''
  }
}
