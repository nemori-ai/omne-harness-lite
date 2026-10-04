// 验收锁的正反夹具：拥有者与人改验收放行，实施角色改验收、未提交的验收改动报出。
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  agentRole,
  inspect,
  isAcceptancePath,
  judge,
  parseAcceptanceLockConfig,
  readAcceptanceLockConfig,
  render,
  type AcceptanceLockConfig,
} from '../src/acceptance/lock.ts'
import type { CommitRecord } from '../src/commits.ts'

const config: AcceptanceLockConfig = {
  memberRoots: ['packages', 'apps'],
  directory: 'acceptance',
  ownerRoles: ['main', 'qa'],
}
const SPEC = 'apps/cli/acceptance/ST-016-01.acceptance.ts'

const record = (
  message: string,
  sha = '0123456789abcdef0123456789abcdef01234567',
): CommitRecord => ({
  sha,
  authorName: 'panqiwei',
  authorEmail: 'someone@example.com',
  committerName: 'panqiwei',
  committerEmail: 'someone@example.com',
  trailers: '',
  message,
})

describe('验收锁：判断', () => {
  it('只有成员根下、路径里有一段叫 acceptance 的文件算验收文件', () => {
    expect(isAcceptancePath(SPEC, config)).toBe(true)
    expect(isAcceptancePath('packages/session/x/acceptance/deep/a.ts', config)).toBe(true)
    expect(isAcceptancePath('apps/cli/src/acceptance.ts', config)).toBe(false)
    expect(isAcceptancePath('apps/cli/tests/a.spec.ts', config)).toBe(false)
    expect(isAcceptancePath('docs/acceptance/a.md', config)).toBe(false)
    expect(isAcceptancePath('apps/cli/node_modules/x/acceptance/a.ts', config)).toBe(false)
  })

  it('角色取提交信息里最后一条 Agent-Role', () => {
    expect(agentRole('feat: x\n\nHarness: claude-code\nAgent-Role: developer\n')).toBe('developer')
    expect(agentRole('feat: x\n\nAgent-Role: developer\nAgent-Role:  qa ')).toBe('qa')
    expect(agentRole('feat: x\n\n正文里提到 Agent-Role: developer 不算')).toBeUndefined()
    expect(agentRole('feat: x')).toBeUndefined()
  })

  it('拥有者角色与没有来源 trailer 的提交放行', () => {
    const judged = judge(
      [
        { record: record('验收：第一张卡\n\nAgent-Role: main'), files: [SPEC] },
        { record: record('验收场景\n\nAgent-Role: qa'), files: [SPEC] },
        { record: record('人手写的验收'), files: [SPEC] },
      ],
      [],
      config,
    )
    expect(judged.violations).toEqual([])
    expect(judged.commits.map(commit => [commit.role, commit.allowed])).toEqual([
      ['main', true],
      ['qa', true],
      [undefined, true],
    ])
  })

  it('实施角色改了验收：报出，带提交短号、角色与文件', () => {
    const judged = judge(
      [{ record: record('fix: 让验收过\n\nHarness: codex\nAgent-Role: developer'), files: [SPEC] }],
      [],
      config,
    )
    expect(judged.commits[0]?.allowed).toBe(false)
    expect(judged.violations).toEqual([
      `提交 012345678（Agent-Role: developer）改了验收文件：${SPEC}`,
    ])
  })

  it('未提交的验收改动：报出，因为说不清是谁改的', () => {
    const judged = judge([], [SPEC], config)
    expect(judged.violations).toHaveLength(1)
    expect(judged.violations[0]).toContain('未提交的验收改动')
  })

  it('配置：写法不对就拒绝，仓库里那一份读得进来', () => {
    expect(() => parseAcceptanceLockConfig(null)).toThrow('须为对象')
    expect(() => parseAcceptanceLockConfig({ ...config, directory: 'a/b' })).toThrow('directory')
    expect(() => parseAcceptanceLockConfig({ ...config, ownerRoles: [] })).toThrow('ownerRoles')
    expect(() => parseAcceptanceLockConfig({ ...config, memberRoots: ['packages/x'] })).toThrow(
      'memberRoots',
    )
    expect(readAcceptanceLockConfig()).toEqual(config)
  })
})

describe('验收锁：读 Git', () => {
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

  /** 一个带一份验收与一份源码的仓库；返回它的根与基线提交。 */
  function repository(): { root: string; base: string } {
    const root = mkdtempSync(join(tmpdir(), 'acceptance-lock-'))
    made.push(root)
    git(root, 'init', '-q')
    write(root, SPEC, 'expect(version()).toBe("0.0.0")\n')
    write(root, 'apps/cli/src/main.ts', 'export const main = 1\n')
    return { root, base: commit(root, '基线\n\nAgent-Role: main') }
  }

  it('基线以来没人碰验收：没有变化，没有违反', () => {
    const { root, base } = repository()
    write(root, 'apps/cli/src/main.ts', 'export const main = 2\n')
    commit(root, 'feat: 实现\n\nAgent-Role: developer')
    const report = inspect(root, base, config)
    expect(report.changes).toEqual([])
    expect(report.commits).toEqual([])
    expect(report.violations).toEqual([])
    expect(render(report, config).join('\n')).toContain('基线以来没有验收文件被改动')
  })

  it('实施者改弱了验收：列出那个提交并判锁被破；拥有者补的验收不算', () => {
    const { root, base } = repository()
    write(root, 'apps/cli/acceptance/ST-016-02.acceptance.ts', 'expect(login()).toBe(true)\n')
    commit(root, '验收：第二张卡\n\nAgent-Role: main')
    write(root, SPEC, 'expect(version()).toBeDefined()\n')
    write(root, 'apps/cli/src/main.ts', 'export const main = 2\n')
    const weakened = commit(root, 'feat: 实现\n\nHarness: claude-code\nAgent-Role: developer')
    const report = inspect(root, base, config)
    expect(report.changes).toEqual([
      { status: 'modified', path: SPEC },
      { status: 'added', path: 'apps/cli/acceptance/ST-016-02.acceptance.ts' },
    ])
    expect(report.commits.map(found => [found.role, found.allowed, found.files])).toEqual([
      ['developer', false, [SPEC]],
      ['main', true, ['apps/cli/acceptance/ST-016-02.acceptance.ts']],
    ])
    expect(report.violations).toEqual([
      `提交 ${weakened.slice(0, 9)}（Agent-Role: developer）改了验收文件：${SPEC}`,
    ])
    expect(render(report, config).join('\n')).toContain('锁被破 1 处')
  })

  it('实施者删了验收、又在后一个提交里放回原样：净变化为零，两个提交照样列出', () => {
    const { root, base } = repository()
    rmSync(join(root, SPEC))
    commit(root, 'chore: 先挪开\n\nAgent-Role: developer')
    write(root, SPEC, 'expect(version()).toBe("0.0.0")\n')
    commit(root, 'chore: 放回\n\nAgent-Role: developer')
    const report = inspect(root, base, config)
    expect(report.changes).toEqual([])
    expect(report.commits).toHaveLength(2)
    expect(report.violations).toHaveLength(2)
  })

  it('工作树里未提交、未跟踪的验收改动都算', () => {
    const { root, base } = repository()
    write(root, SPEC, 'expect(true).toBe(true)\n')
    write(root, 'packages/core/x/acceptance/new.acceptance.ts', 'new\n')
    const report = inspect(root, base, config)
    expect(report.uncommitted).toEqual([SPEC, 'packages/core/x/acceptance/new.acceptance.ts'])
    expect(report.changes.map(change => change.status)).toEqual(['modified', 'added'])
    expect(report.violations).toHaveLength(1)
  })

  it('入口：锁没破退出 0，破了退出 1，缺参数或基线不存在退出 2', () => {
    const cli = fileURLToPath(new URL('../src/acceptance/cli.ts', import.meta.url))
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
        encoding: 'utf8',
      })
    const { root, base } = repository()
    expect(run('--base', base, '--root', root).status).toBe(0)
    write(root, SPEC, 'expect(true).toBe(true)\n')
    commit(root, 'fix\n\nAgent-Role: tui-developer')
    const broken = run('--base', base, '--root', root)
    expect(broken.status).toBe(1)
    expect(broken.stdout).toContain('Agent-Role: tui-developer')
    expect(run('--root', root).status).toBe(2)
    expect(run('--base', 'no-such-ref', '--root', root).status).toBe(2)
  })
})
