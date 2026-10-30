// SessionStart hook for Claude Code: name the worktrees under the main checkout's
// `.worktrees/` whose skill copies may be stale. Claude Code loads the skills of a
// nested `.claude/skills/` once the session touches files there, and it re-attaches
// invoked skills after compaction, so a session can read an old copy.
//
// A worktree is listed when it has a skill projection (`.claude/skills/`) and one of these holds:
// - its branch no longer exists;
// - its HEAD is a strict ancestor of the main checkout's HEAD (merged, or created from an older base);
// - Git no longer registers the directory as a worktree.
// The session's own checkout is never listed.
//
// The hook is read-only. It prints one line, or nothing. Any error prints nothing and exits 0.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

const REPOSITORY_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_SHALLOW_FILE',
]

function gitEnv() {
  const env = { ...process.env }
  for (const key of REPOSITORY_KEYS) delete env[key]
  return env
}

const env = gitEnv()

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env })
  if (result.error || result.status === null) throw new Error(`git ${args[0]} did not run`)
  return { ok: result.status === 0, out: result.stdout.trim() }
}

function required(cwd, args) {
  const result = git(cwd, args)
  if (!result.ok) throw new Error(`git ${args.join(' ')} failed`)
  return result.out
}

function canonical(path) {
  const real = realpathSync.native(path)
  return process.platform === 'win32' ? real.toLowerCase() : real
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function sessionDirectory() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    payload = {}
  }
  const cwd =
    payload && typeof payload.cwd === 'string' && isAbsolute(payload.cwd) ? payload.cwd : undefined
  return cwd && isDirectory(cwd) ? cwd : process.cwd()
}

// `git worktree list --porcelain`: records split by blank lines, one `key value` per line.
function registeredWorktrees(main) {
  const records = new Map()
  for (const block of required(main, ['worktree', 'list', '--porcelain']).split(/\r?\n\r?\n/)) {
    const record = {}
    for (const line of block.split(/\r?\n/)) {
      const space = line.indexOf(' ')
      const key = space < 0 ? line : line.slice(0, space)
      record[key] = space < 0 ? true : line.slice(space + 1)
    }
    if (typeof record.worktree !== 'string') continue
    try {
      records.set(canonical(record.worktree), record)
    } catch {
      // The registered path is gone. Its directory, if any, is not under `.worktrees/` any more.
    }
  }
  return records
}

function staleReason(main, mainHead, record) {
  if (!record) return '工作树已不在 Git 登记中'
  let tip = typeof record.HEAD === 'string' ? record.HEAD : undefined
  if (typeof record.branch === 'string') {
    const branch = git(main, ['rev-parse', '--verify', '--quiet', `${record.branch}^{commit}`])
    if (!branch.ok) return '分支已删除'
    tip = branch.out
  }
  if (!mainHead || !tip || tip === mainHead) return undefined
  const merged = git(main, ['merge-base', '--is-ancestor', tip, mainHead])
  return merged.ok ? '已合入主检出当前分支' : undefined
}

function staleWorktrees(cwd) {
  const top = required(cwd, ['rev-parse', '--show-toplevel'])
  const main = dirname(resolve(top, required(top, ['rev-parse', '--git-common-dir'])))
  const parent = join(main, '.worktrees')
  if (!isDirectory(parent)) return []
  const own = canonical(top)
  const head = git(main, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'])
  const mainHead = head.ok ? head.out : undefined
  const records = registeredWorktrees(main)
  const stale = []
  for (const name of readdirSync(parent).sort()) {
    const directory = join(parent, name)
    if (!isDirectory(directory) || !isDirectory(join(directory, '.claude', 'skills'))) continue
    const key = canonical(directory)
    if (key === own) continue
    const reason = staleReason(main, mainHead, records.get(key))
    if (reason) stale.push(`.worktrees/${name}（${reason}）`)
  }
  return stale
}

try {
  const stale = staleWorktrees(sessionDirectory())
  if (stale.length)
    process.stdout.write(
      `技能请从当前检出加载；以下工作树里的技能副本可能过期：${stale.join('、')}\n`,
    )
} catch {
  // A broken hook never blocks the session and never prints a partial list.
}
process.exitCode = 0
