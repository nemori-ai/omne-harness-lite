// 命令要的 Git 事实。读法复用 repo-toolchain 的 `git`、`changedFiles` 与 `fileAt`；逻辑层只拿这个接口，用例换成内存里的假仓库。
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
  /** 给的基线与 HEAD 的合并点：基线是 HEAD 的祖先时就是它自己，与 pqw 的基线取法一致。 */
  mergeBase(base: string): string
  head(): string
  /** 合并点到工作树改动过的文件（含删除、未提交与未跟踪）。 */
  changedFiles(mergeBase: string): string[]
  /** 合并点到工作树改动过、且匹配这些 git pathspec 的文件。 */
  changedMatching(mergeBase: string, pathspecs: readonly string[]): string[]
  /** 某个 ref 上一个文件的文本；没有时为 undefined。 */
  show(ref: string, path: string): string | undefined
  /** 工作树里一个文件的文本；没有时为 undefined。 */
  read(path: string): string | undefined
  /** 工作树有没有未提交的改动或未跟踪的文件。 */
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
