// 读 git 的那几层与入口本身，用临时仓库：一起改的提交、rev 翻动、并行工作树、祖先关系，
// 以及入口的退出码（硬线破了是 1，其余报告项再多也是 0，用法错是 2）与快照的写入。
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readLoopConfig } from '../src/loop/config.ts'
import { readCommitMembers } from '../src/loop/sensors/cochange.ts'
import { readTopicChurn } from '../src/loop/sensors/topic-churn.ts'
import { readWorktrees } from '../src/loop/sensors/worktrees.ts'
import { ancestryOf } from '../src/loop/trend.ts'

const made: string[] = []
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
})

function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=someone', '-c', 'user.email=someone@example.com', ...args],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

function commit(root: string, message: string): string {
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', message)
  return git(root, 'rev-parse', 'HEAD')
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'loop-repo-'))
  made.push(root)
  // 本机 git 可能早于 `init -b`，用 symbolic-ref 定主线分支名。
  git(root, 'init', '-q')
  git(root, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  write(root, 'README.md', 'repo\n')
  commit(root, 'init')
  return root
}

// 这两组每条用例都要起若干次 git 或 node 子进程；全量检查满载时单条会超过默认的 5 秒，所以写明时限。
describe('读 git 的传感器', { timeout: 30_000 }, () => {
  it('一起改：最近若干个非合并提交各自碰过的成员，新的在前', () => {
    const root = repository()
    write(root, 'packages/core/a/src/x.ts', '1\n')
    write(root, 'packages/infra/b/src/y.ts', '1\n')
    commit(root, 'both')
    write(root, 'apps/cli/src/main.ts', '1\n')
    commit(root, 'cli')
    expect(readCommitMembers(root, 10)).toEqual([
      ['apps/cli'],
      ['packages/core/a', 'packages/infra/b'],
      [],
    ])
    expect(readCommitMembers(root, 1)).toEqual([['apps/cli']])
  })

  it('rev 翻动：只数改了 revision 那一行的提交，按窗口起点截；目录不存在就没数据', () => {
    const root = repository()
    const readme = (revision: number, body: string) =>
      `---\nid: PF-001\nrevision: ${revision}\n---\n\n${body}\n`
    write(root, 'design/product/PF-001-x/README.md', readme(1, 'a'))
    write(root, 'design/product/PF-002-y/README.md', readme(1, 'a'))
    commit(root, 'topics')
    write(root, 'design/product/PF-001-x/README.md', readme(2, 'a'))
    commit(root, 'rev 2')
    write(root, 'design/product/PF-001-x/README.md', readme(2, 'b'))
    commit(root, 'body only')
    write(root, 'design/product/PF-001-x/README.md', readme(3, 'b'))
    commit(root, 'rev 3')
    const churn = readTopicChurn(root, 'design/product', new Date(Date.now() - 86400000))
    expect(churn).toEqual({
      status: 'data',
      data: [
        { path: 'design/product/PF-001-x/README.md', topic: 'PF-001-x', revisions: 3 },
        { path: 'design/product/PF-002-y/README.md', topic: 'PF-002-y', revisions: 1 },
      ],
    })
    const future = readTopicChurn(root, 'design/product', new Date(Date.now() + 86400000))
    expect(future.status === 'data' && future.data.every(topic => topic.revisions === 0)).toBe(true)
    expect(readTopicChurn(root, 'no/such/dir', new Date())).toEqual({
      status: 'no-data',
      reason: '目录 no/such/dir 不存在',
    })
  })

  it('并行工作树：主检出不算，各自相对主线合并点改过的成员（含未提交），分离头指针不算', () => {
    const root = repository()
    const x = join(root, '.worktrees', 'x')
    const y = join(root, '.worktrees', 'y')
    const z = join(root, '.worktrees', 'z')
    git(root, 'worktree', 'add', '-q', '-b', 'someone/x', x)
    git(root, 'worktree', 'add', '-q', '-b', 'someone/y', y)
    git(root, 'worktree', 'add', '-q', '--detach', z)
    write(x, 'packages/core/a/src/x.ts', '1\n')
    commit(x, 'x')
    write(y, 'packages/core/a/src/y.ts', '1\n')
    write(y, 'apps/cli/src/main.ts', '1\n')
    const trees = readWorktrees(root, 'main')
    expect(trees.map(tree => [tree.branch, tree.members])).toEqual([
      ['someone/x', ['packages/core/a']],
      ['someone/y', ['apps/cli', 'packages/core/a']],
    ])
  })

  it('祖先关系：tip 自己是 0，越往前越大；别的分支上的提交不在其中', () => {
    const root = repository()
    const first = git(root, 'rev-parse', 'HEAD')
    write(root, 'a.txt', '1\n')
    const second = commit(root, 'second')
    git(root, 'checkout', '-q', '-b', 'side', first)
    write(root, 'b.txt', '1\n')
    const side = commit(root, 'side')
    const ancestry = ancestryOf(root, second)
    expect(ancestry.get(second)).toBe(0)
    expect(ancestry.get(first)).toBe(1)
    expect(ancestry.has(side)).toBe(false)
  })
})

/** 成员预算「超 alert 的函数数」的处置线：要造一个超预算的成员，就造这么多个超 alert 的函数，不随负责人调线而失效。 */
const OVER = readLoopConfig().memberBudget.overAlert.act

describe('入口', { timeout: 60_000 }, () => {
  const cli = fileURLToPath(new URL('../src/loop/cli.ts', import.meta.url))
  const run = (root: string, home: string, ...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', cli, '--root', root, ...args], {
      encoding: 'utf8',
      env: { ...process.env, OMNE_METRICS_HOME: home },
    })

  /** 一个带两个成员的仓库：core 的 a、infra 的 b，彼此不依赖。 */
  function members(): { root: string; home: string } {
    const root = repository()
    const home = mkdtempSync(join(tmpdir(), 'loop-home-'))
    made.push(home)
    write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
    write(root, 'packages/infra/b/src/index.ts', 'export const b = 2\n')
    commit(root, 'members')
    return { root, home }
  }

  // 归慢层：子进程：在临时 git 仓库里反复起回路入口 CLI 子进程与 git 子进程。
  it(
    '硬线破了（core 依赖了 infra）：退出 1，硬线一段标出；撤掉后退出 0',
    { tags: ['slow'] },
    () => {
      const { root, home } = members()
      write(
        root,
        'packages/core/a/src/probe.ts',
        "import { b } from '@omne-harness-lite/b'\nexport const p = b\n",
      )
      const broken = run(root, home)
      expect(broken.stderr).toBe('')
      expect(broken.status).toBe(1)
      expect(broken.stdout).toMatch(
        /✗ 方向违规 1：packages\/core\/a 依赖了更外层的 packages\/infra\/b/u,
      )
      expect(broken.stdout).toContain('packages/core/a/src/probe.ts:1')
      rmSync(join(root, 'packages/core/a/src/probe.ts'))
      const fixed = run(root, home)
      expect(fixed.status).toBe(0)
      expect(fixed.stdout).toContain('  方向违规 0')
    },
  )

  it('其余报告项再多也是 0：超阈值的函数、重复代码、没有断言的测试、超预算的成员', () => {
    const { root, home } = members()
    const branches = Array.from({ length: 14 }, (_, i) => `  if (x === ${i}) return ${i}`).join(
      '\n',
    )
    const tangled = Array.from(
      { length: OVER },
      (_, n) => `export function tangled${n}(x: number) {\n${branches}\n  return -1\n}\n`,
    ).join('\n')
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    write(root, 'packages/infra/b/src/tangled.ts', tangled)
    write(root, 'packages/core/a/tests/a.spec.ts', "it('不断言', () => { run() })\n")
    const result = run(root, home)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('  没有断言的测试数 1')
    expect(result.stdout).toMatch(/全仓重复行占比（%） \d/u)
    expect(result.stdout).toContain(`packages/core/a：超 alert 的函数数 ${OVER}`)
    const draft = join(home, 'proposals', 'packages-core-a.md')
    expect(existsSync(draft)).toBe(true)
    expect(readFileSync(draft, 'utf8')).toContain('## 要清理的条目')
  })

  it('配置里排除的成员组（初值 examples）不判预算、不生成草稿；全仓指标照样计入', () => {
    const { root, home } = members()
    const branches = Array.from({ length: 14 }, (_, i) => `  if (x === ${i}) return ${i}`).join(
      '\n',
    )
    const tangled = Array.from(
      { length: OVER },
      (_, n) => `export function tangled${n}(x: number) {\n${branches}\n  return -1\n}\n`,
    ).join('\n')
    write(root, 'examples/demo/src/tangled.ts', tangled)
    write(root, 'packages/core/a/src/tangled.ts', tangled.replaceAll('return', 'return 1 +'))
    const result = run(root, home)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`超 alert 的函数数 ${OVER * 2}`)
    expect(result.stdout).toContain(`packages/core/a：超 alert 的函数数 ${OVER}`)
    expect(result.stdout).not.toContain('examples/demo：')
    expect(existsSync(join(home, 'proposals', 'packages-core-a.md'))).toBe(true)
    expect(existsSync(join(home, 'proposals', 'examples-demo.md'))).toBe(false)
  })

  it('给了基线：有要解释的红项一段与验收锁一行；锁被破退出 1', () => {
    const { root, home } = members()
    const base = git(root, 'rev-parse', 'HEAD')
    write(root, 'packages/core/a/acceptance/a.acceptance.ts', 'expect(a).toBe(1)\n')
    commit(root, 'weaken\n\nAgent-Role: developer')
    write(root, 'packages/core/a/tests/a.spec.ts', "it('不断言', () => { run() })\n")
    const result = run(root, home, '--base', base)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('✗ 验收锁 破 1 处')
    expect(result.stdout).toContain('改动过的测试文件里没有断言的用例 1 条：')
    expect(result.stdout).toContain('packages/core/a/tests/a.spec.ts:1 不断言')
  })

  // 归慢层：子进程：在临时 git 仓库里反复起回路入口 CLI 子进程与 git 子进程。
  it(
    '给了基线：删卡记录与验收锁并列一行；删卡不带 trailer 退出 1，没给基线不判',
    { tags: ['slow'] },
    () => {
      const { root, home } = members()
      const stories = '.meta_harness/design/product/PF-016-x/stories.md'
      write(root, stories, '**已发到**：ST-016-01\n\n### ST-016-01 · 一张卡\n- **就绪**：是\n')
      const base = commit(root, 'cut a card')
      expect(run(root, home, '--base', base).stdout).toContain('  删卡记录 齐\n')
      expect(run(root, home).stdout).toContain('  删卡记录 未判：没给基线\n')
      write(root, stories, '**已发到**：ST-016-01\n')
      commit(root, 'drop the card')
      const result = run(root, home, '--base', base)
      expect(result.status).toBe(1)
      expect(result.stdout).toMatch(
        /✗ 删卡记录 缺 1 处：提交 \w{9}（drop the card）：ST-016-01 从 stories\.md 里删掉了/u,
      )
    },
  )

  // 归慢层：子进程：在临时 git 仓库里反复起回路入口 CLI 子进程与 git 子进程。
  it('快照：干净的工作树上 --snapshot 写一条，再跑不重复写；不干净不写', { tags: ['slow'] }, () => {
    const { root, home } = members()
    const trend = join(home, 'trend.jsonl')
    const lines = () =>
      readFileSync(trend, 'utf8')
        .split('\n')
        .filter(line => line !== '').length
    // 在 main 头上：不要求也写。
    expect(run(root, home).stdout).toContain('已写入这个提交的快照')
    expect(lines()).toBe(1)
    const again = run(root, home, '--snapshot')
    expect(again.stdout).toContain('这个提交已有快照，不重复写')
    expect(lines()).toBe(1)
    git(root, 'checkout', '-q', '-b', 'work')
    write(root, 'packages/core/a/src/index.ts', 'export const a = 2\n')
    commit(root, 'work')
    expect(run(root, home).stdout).toContain('没要求写快照，HEAD 也不是 main 的头')
    write(root, 'packages/core/a/src/dirty.ts', 'export const d = 1\n')
    expect(run(root, home, '--snapshot').stdout).toContain('工作树不干净，不写快照')
    rmSync(join(root, 'packages/core/a/src/dirty.ts'))
    const written = run(root, home, '--snapshot')
    expect(written.stdout).toContain('已写入这个提交的快照')
    expect(written.stdout).toMatch(/基线快照：[0-9a-f]{9}（合并点那个提交/u)
    expect(lines()).toBe(2)
  })

  // 归慢层：子进程：在临时 git 仓库里反复起回路入口 CLI 子进程与 git 子进程。
  it('用法错或基线不存在：退出 2', { tags: ['slow'] }, () => {
    const { root, home } = members()
    expect(run(root, home, '--nope').status).toBe(2)
    expect(run(root, home, '--base').status).toBe(2)
    expect(run(root, home, '--base', 'no-such-ref').status).toBe(2)
  })
})
