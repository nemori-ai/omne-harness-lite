// `baseline` 命令：统一缺省基线规则的入口（`pnpm run check` 开头用它）。
// 在造出来的仓库里跑真实的命令行，核对基线取自哪一条，以及已绑定任务的树拒绝不等于 targetBase 的显式基线。
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const CLI = fileURLToPath(new URL('../src/testing/cli.ts', import.meta.url))

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

function repository(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'baseline-command-')))
  roots.push(root)
  git(root, 'init', '-q')
  git(root, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  git(root, 'commit', '-q', '--allow-empty', '-m', 'root')
  return root
}

function baseline(root: string, args: string[] = [], env: Record<string, string> = {}) {
  const { BASELINE: _inherited, ...inherited } = process.env
  return spawnSync('node', ['--experimental-strip-types', CLI, 'baseline', ...args], {
    encoding: 'utf8',
    env: { ...inherited, ...env, OMNE_SUBJECT_ROOT: root },
  })
}

function bind(root: string, targetBase: string): void {
  // 和流程工具一样从 git 的顶层目录取真实路径：Windows 的临时目录是 8.3 短名，
  // 对它直接 realpath 不会展开成 git 回的长名。
  const actual = realpathSync(git(root, 'rev-parse', '--show-toplevel'))
  const gitDir = join(actual, '.git')
  const owner = {
    issue: { url: 'https://github.com/owner/repo/issues/1' },
    revision: 1,
    attempt: 'one',
    taskBase: targetBase,
    writeScope: ['src'],
  }
  writeFileSync(
    join(gitDir, 'omne-integration-context.json'),
    JSON.stringify({
      schemaVersion: 1,
      root: actual,
      gitDir: realpathSync(gitDir),
      branch: 'main',
      targetBase,
      tasks: [],
      ownerTask: owner,
      operation: null,
    }),
  )
}

describe('baseline 命令', () => {
  it('没有显式基线、任务上下文和 origin/main：取 main', () => {
    const result = baseline(repository())
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      state: 'pending',
      targetBase: 'main',
      source: 'main',
    })
  })

  it('本地有 origin/main：取 origin/main', () => {
    const root = repository()
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    expect(JSON.parse(baseline(root).stdout)).toMatchObject({
      targetBase: 'origin/main',
      source: 'origin/main',
    })
  })

  // 归慢层：在临时 git 仓库里连起几次 baseline 命令子进程。全量准入快层账本里这条 1.3 秒，负载下 3.3 秒，负载下超过单条预算 2.5 秒（tools/test-runner/README_ZH.md「归层」）。
  it('--base 先于环境变量 BASELINE，环境变量先于 origin/main', { tags: ['slow'] }, () => {
    const root = repository()
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    const both = baseline(root, ['--base', 'HEAD'], { BASELINE: 'main' })
    expect(JSON.parse(both.stdout)).toMatchObject({ targetBase: 'HEAD', source: 'explicit' })
    const env = baseline(root, [], { BASELINE: 'main' })
    expect(JSON.parse(env.stdout)).toMatchObject({ targetBase: 'main', source: 'explicit' })
  })

  // 归慢层：在临时 git 仓库里起 baseline 命令子进程。全量准入快层账本里这条 1.4 秒，负载下 3.0 秒，负载下超过单条预算 2.5 秒（tools/test-runner/README_ZH.md「归层」）。
  it(
    '已绑定任务的树：取固定的 targetBase；不等于它的显式基线被拒绝，退出 2',
    { tags: ['slow'] },
    () => {
      const root = repository()
      const target = git(root, 'rev-parse', 'HEAD')
      git(root, 'commit', '-q', '--allow-empty', '-m', 'task work')
      bind(root, target)
      expect(JSON.parse(baseline(root).stdout)).toMatchObject({
        state: 'bound',
        targetBase: target,
        source: 'task',
      })
      const refused = baseline(root, [], { BASELINE: 'HEAD' })
      expect(refused.status).toBe(2)
      expect(refused.stdout).toBe('')
      expect(refused.stderr).toContain('Explicit base differs from fixed targetBase')
    },
  )
})
