import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { changedFiles, fileAt, git } from '@omne-harness/repo-toolchain/core/git'
import {
  fileTree,
  listWorkspaceMembers,
  type WorkspaceMember,
} from '@omne-harness/repo-toolchain/core/workspace'

export interface Repo {
  readonly root: string
  mergeBase(base: string): string
  head(): string
  changedFiles(mergeBase: string): string[]
  changedMatching(mergeBase: string, pathspecs: readonly string[]): string[]
  show(ref: string, path: string): string | undefined
  read(path: string): string | undefined
  dirty(): boolean
  members(): WorkspaceMember[]
}

const lines = (output: string) => output.split('\n').filter(line => line !== '')

export function gitRepo(cwd: string): Repo {
  const root = git(cwd, ['rev-parse', '--show-toplevel'])
  return {
    root,
    mergeBase: base => git(root, ['merge-base', base, 'HEAD']),
    head: () => git(root, ['rev-parse', 'HEAD']),
    changedFiles: mergeBase => changedFiles(root, mergeBase),
    changedMatching: (mergeBase, pathspecs) =>
      pathspecs.length === 0
        ? []
        : [
            ...new Set([
              ...lines(
                git(root, ['diff', '--no-renames', '--name-only', mergeBase, '--', ...pathspecs]),
              ),
              ...lines(
                git(root, ['ls-files', '--others', '--exclude-standard', '--', ...pathspecs]),
              ),
            ]),
          ].sort(),
    show: (ref, path) => fileAt(root, ref, path),
    read: path =>
      existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined,
    dirty: () => git(root, ['status', '--porcelain']) !== '',
    members: () => listWorkspaceMembers(fileTree(root), []),
  }
}
