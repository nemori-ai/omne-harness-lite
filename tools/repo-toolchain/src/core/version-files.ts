// 某个版本在一组路径下有没有文件：工作树查磁盘，提交查 Git 树。架构符合性报告据此决定方向行要不要取依赖图
// （arch/directions.ts），所以只在确知没有时回答「没有」：读不了、Git 失败、提交不在、链接或子模块挡住了视线，都回答「有」，
// 交给取图。路径相对 `root`；Git 命令以 `root` 为工作目录、路径按工作目录解释，与 deps/graph.ts 导出提交的方式相同，
// 所以 `root` 不必是仓库顶层。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { git } from './git.ts'

/** 要查的版本：工作树（含未提交的改动），或某个提交。 */
export interface FileVersion {
  readonly kind: 'worktree' | 'revision'
  readonly commit: string
}

/**
 * 回答「这个版本在 `patterns` 下可能有文件吗」的函数。`patterns` 用架构角色 `paths` 的写法：末尾 `/**` 是那个目录之下的
 * 任何文件，否则是精确路径（arch/constraints.ts 的 `matchesRolePath`）。同一个版本的 Git 查询结果在函数里复用。
 */
export function filePresence(
  root: string,
  version: FileVersion,
): (patterns: readonly string[]) => boolean {
  const present =
    version.kind === 'worktree' ? workingTreePresence(root) : revisionPresence(root, version.commit)
  return patterns => patterns.some(present)
}

/** 读磁盘时确知「没有」的两种失败：路径不存在，或路径上某一段不是目录。 */
function absent(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

/**
 * 工作树：目录模式从静态前缀往下找，遇到第一个不是目录的项（文件、链接或别的）就停。经过链接的路径照常跟进，
 * dependency-cruiser 也走进链接的目录。精确路径跟随链接后不是目录才算有：依赖图里只有文件。
 */
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

/** `a/b/c` 与它的上级：`a`、`a/b`、`a/b/c`。 */
const withAncestors = (path: string): string[] =>
  path.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))

/** 提交树里一项的种类。只从上一级树读，不需要这一项自己的对象（子模块、按需拉取的克隆都不缺）。 */
type Entry = 'missing' | 'tree' | 'file' | 'opaque'

/**
 * 提交：从最上一级往下逐段看在提交树里是什么。缺了就没有；普通文件挡在路径上，下面不会有文件；链接与子模块（`120000`、
 * `160000`）后面依赖图可能还有文件，Git 却不走进去，按有处理。目录模式的前缀是目录时，再看
 * `git ls-tree -r --name-only` 列不列得出东西。精确路径是普通文件、链接或子模块算有，是目录算没有。
 */
function revisionPresence(root: string, commit: string): (pattern: string) => boolean {
  /** 跑一条 git；失败为 undefined，由调用处按「有」处理。 */
  const run = (args: readonly string[]): string | undefined => {
    try {
      return git(root, args)
    } catch {
      return undefined
    }
  }
  // 提交本身不在，或那个对象不是提交（树、文件）：依赖图同样认它不出，交给取图记成不可得。
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
      // 普通文件：是精确路径本身就有；挡在路径上或就是目录前缀，下面都不会有文件。
      if (entry === 'file') return exact && path === target
    }
    // 走到这里，目标与它的上级都是目录。精确路径是目录，依赖图里不会有它。
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
