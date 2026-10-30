// 验收锁的正反夹具：拥有者与人改验收放行，实施角色改验收、未提交的验收改动报出。
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  agentRole,
  inspect,
  isAcceptancePath,
  isPlaceholderEntry,
  judge,
  namesByCommit,
  parseAcceptanceLockConfig,
  readAcceptanceLockConfig,
  render,
  type AcceptanceLockConfig,
} from '../src/acceptance/lock.ts'
import {
  inspectAgainst,
  inspectHistoricalApproval,
  matchHistoricalApproval,
  observeHistoricalChange,
} from '../src/acceptance/historical-approvals.ts'
import {
  HISTORICAL_APPROVALS,
  NULL_OBJECT_ID,
  assertUniqueApprovals,
  type HistoricalApproval,
} from '../src/acceptance/historical-approvals.data.ts'
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

  it('模板占位：只有验收目录里的 README.md、index.md 带独立一行占位标记才算', () => {
    const marked = '# Acceptance\n\n<!-- documentation:placeholder -->\n'
    expect(isPlaceholderEntry('packages/a/b/acceptance/README.md', marked)).toBe(true)
    expect(isPlaceholderEntry('packages/a/b/acceptance/fixtures/index.md', marked)).toBe(true)
    expect(
      isPlaceholderEntry('packages/a/b/acceptance/README.md', '# Acceptance\n\nreal steps\n'),
    ).toBe(false)
    expect(isPlaceholderEntry('packages/a/b/acceptance/notes.md', marked)).toBe(false)
    expect(isPlaceholderEntry('packages/a/b/acceptance/x.acceptance.ts', marked)).toBe(false)
    expect(
      isPlaceholderEntry(
        'packages/a/b/acceptance/README.md',
        'see <!-- documentation:placeholder --> here\n',
      ),
    ).toBe(false)
    expect(isPlaceholderEntry('packages/a/b/acceptance/README.md', undefined)).toBe(false)
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
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'acceptance-lock-')))
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

  it('模板占位的验收入口：实施者新增、改动、删除都不破锁；写成真实内容照常计入', () => {
    const { root, base } = repository()
    const entry = 'packages/core/x/acceptance/README.md'
    const index = 'packages/core/x/acceptance/fixtures/index.md'
    const marked = (title: string) => `# ${title}\n\n<!-- documentation:placeholder -->\n`
    write(root, entry, marked('Acceptance'))
    write(root, index, marked('Fixtures'))
    commit(root, 'feat: 新建包骨架\n\nAgent-Role: developer')
    write(root, entry, marked('Acceptance of x'))
    commit(root, 'docs: 改占位标题\n\nAgent-Role: developer')
    rmSync(join(root, index))
    commit(root, 'chore: 去掉夹具入口\n\nAgent-Role: developer')
    const quiet = inspect(root, base, config)
    expect(quiet.changes).toEqual([])
    expect(quiet.commits).toEqual([])
    expect(quiet.violations).toEqual([])
    write(root, entry, '# Acceptance of x\n\nStep 1: run the CLI.\n')
    const written = commit(root, 'docs: 写验收说明\n\nAgent-Role: developer')
    const report = inspect(root, base, config)
    expect(report.changes).toEqual([{ status: 'added', path: entry }])
    expect(report.violations).toEqual([
      `提交 ${written.slice(0, 9)}（Agent-Role: developer）改了验收文件：${entry}`,
    ])
    write(root, entry, marked('again'))
    expect(inspect(root, base, config).uncommitted).toEqual([])
  })

  // 归慢层：建一棵带合并与无关根历史的临时仓库，再逐个提交起 diff-tree 作对照，本机空闲时 1.8 秒，负载下会超过单条预算 2.5 秒（tools/test-runner/README_ZH.md「归层」）。
  it(
    '一次 git log 读出的每个提交的路径，与逐个提交 diff-tree 列出的相同：合并、根提交、用户配置都一样',
    { tags: ['slow'] },
    () => {
      const { root, base } = repository()
      // 用户配置想把 -m 改成只比第一父、让 log 列根提交的路径：结果不该跟着变。
      git(root, 'config', 'log.diffMerges', 'first-parent')
      git(root, 'config', 'log.showRoot', 'true')
      const trunk = git(root, 'rev-parse', '--abbrev-ref', 'HEAD')
      git(root, 'checkout', '-q', '-b', 'side')
      write(root, SPEC, 'expect(version()).toBeDefined()\n')
      commit(root, 'side: 改验收\n\nAgent-Role: developer')
      git(root, 'checkout', '-q', trunk)
      write(root, 'apps/cli/src/main.ts', 'export const main = 2\n')
      commit(root, 'trunk: 改源码\n\nAgent-Role: developer')
      git(root, 'merge', '-q', '--no-ff', '--no-edit', 'side')
      const clean = git(root, 'rev-parse', 'HEAD')
      // 一棵无关的根历史并进来：根提交本身不列路径（diff-tree 不加 --root 时就是这样）。
      git(root, 'checkout', '-q', '--orphan', 'orphan')
      git(root, 'rm', '-rqf', '.')
      write(root, 'apps/other/acceptance/a.acceptance.ts', 'orphan\n')
      const orphan = commit(root, 'orphan root')
      git(root, 'checkout', '-q', trunk)
      git(root, 'merge', '-q', '--no-edit', '--allow-unrelated-histories', 'orphan')
      const range = `${base}..HEAD`
      const shas = git(root, 'log', '--format=%H', range).split('\n')
      for (const integration of [false, true]) {
        const batched = namesByCommit(root, range, integration)
        const oneByOne = (sha: string) =>
          [
            ...new Set(
              git(
                root,
                'diff-tree',
                '--no-commit-id',
                '--name-only',
                '--no-renames',
                '-r',
                integration ? '--cc' : '-m',
                sha,
              )
                .split('\n')
                .filter(Boolean),
            ),
          ].sort()
        for (const sha of shas) expect([...(batched.get(sha) ?? [])].sort()).toEqual(oneByOne(sha))
      }
      // 干净的合并：-m 相对第一父列出 side 带进来的验收，--cc 什么也不列；根提交两种都不列。
      expect([...(namesByCommit(root, range, false).get(clean) ?? [])].sort()).toEqual([
        SPEC,
        'apps/cli/src/main.ts',
      ])
      expect([...(namesByCommit(root, range, true).get(clean) ?? [])]).toEqual([])
      expect([...(namesByCommit(root, range, false).get(orphan) ?? [])]).toEqual([])
      expect(inspect(root, base, config).commits.map(found => found.subject)).toEqual([
        expect.stringMatching(/^Merge branch 'orphan'/u),
        expect.stringMatching(/^Merge branch 'side'/u),
        'side: 改验收',
      ])
    },
  )

  it('工作树里未提交、未跟踪的验收改动都算', () => {
    const { root, base } = repository()
    write(root, SPEC, 'expect(true).toBe(true)\n')
    write(root, 'packages/core/x/acceptance/new.acceptance.ts', 'new\n')
    const report = inspect(root, base, config)
    expect(report.uncommitted).toEqual([SPEC, 'packages/core/x/acceptance/new.acceptance.ts'])
    expect(report.changes.map(change => change.status)).toEqual(['modified', 'added'])
    expect(report.violations).toHaveLength(1)
  })

  // 归慢层：在临时 git 仓库里连起几次验收锁 CLI 子进程与 git 子进程。全量准入快层账本里这条 1.8 秒，负载下 3.9 秒，负载下超过单条预算 2.5 秒（tools/test-runner/README_ZH.md「归层」）。
  it(
    '入口：锁没破退出 0，破了退出 1，不给基线时取 main，认不出的参数或基线不存在退出 2',
    { tags: ['slow'] },
    () => {
      const cli = fileURLToPath(new URL('../src/acceptance/cli.ts', import.meta.url))
      // `pnpm run check` 把解析出的基线导成 BASELINE；这里要的是不给基线时的缺省，所以去掉它。
      const { BASELINE: _inherited, ...env } = process.env
      const run = (...args: string[]) =>
        spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
          encoding: 'utf8',
          env,
        })
      const { root, base } = repository()
      expect(run('--base', base, '--root', root).status).toBe(0)
      write(root, SPEC, 'expect(true).toBe(true)\n')
      commit(root, 'fix\n\nAgent-Role: tui-developer')
      const broken = run('--base', base, '--root', root)
      expect(broken.status).toBe(1)
      expect(broken.stdout).toContain('Agent-Role: tui-developer')
      git(root, 'checkout', '-q', '-B', 'work')
      git(root, 'branch', '-f', 'main', base)
      const byDefault = run('--root', root)
      expect(byDefault.status).toBe(1)
      expect(byDefault.stdout).toContain('验收锁（基线 main，')
      expect(run('--bogus', '--root', root).status).toBe(2)
      expect(run('--base', 'no-such-ref', '--root', root).status).toBe(2)
    },
  )

  // 归慢层：在临时 git 仓库里连起几次验收锁 CLI 子进程与 git 子进程。全量准入快层账本里这条 1.1 秒，负载下 2.7 秒，负载下超过单条预算 2.5 秒（tools/test-runner/README_ZH.md「归层」）。
  it(
    '入口：不给基线时按统一规则取，BASELINE 与 origin/main 都先于 main',
    { tags: ['slow'] },
    () => {
      const cli = fileURLToPath(new URL('../src/acceptance/cli.ts', import.meta.url))
      const { BASELINE: _inherited, ...inherited } = process.env
      const run = (env: Record<string, string>) =>
        spawnSync(process.execPath, ['--experimental-strip-types', cli, '--root', root], {
          encoding: 'utf8',
          env: { ...inherited, ...env },
        })
      const { root, base } = repository()
      write(root, SPEC, 'expect(true).toBe(true)\n')
      commit(root, 'fix\n\nAgent-Role: tui-developer')
      git(root, 'checkout', '-q', '-B', 'work')
      git(root, 'branch', '-f', 'main', 'HEAD')
      expect(run({}).status).toBe(0)
      git(root, 'update-ref', 'refs/remotes/origin/main', base)
      const remote = run({})
      expect(remote.status).toBe(1)
      expect(remote.stdout).toContain('验收锁（基线 origin/main，')
      const explicit = run({ BASELINE: 'main' })
      expect(explicit.status).toBe(0)
      expect(explicit.stdout).toContain('验收锁（基线 main，')
    },
  )
})

describe('D010 exact historical approval', () => {
  it('keeps the real developer violation and separately approves its exact historical change', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const report = inspect(
      root,
      'e7aab8ec73002713d2ef6486401816850c984fb1',
      config,
      '48ad37d292796326d65055a75e8a1fde44fe4233',
    )
    expect(report.violations).toHaveLength(1)
    expect(report.commits[0]?.allowed).toBe(false)
    expect(report.approvedExceptions).toEqual([
      {
        commit: '48ad37d292796326d65055a75e8a1fde44fe4233',
        parent: 'e7aab8ec73002713d2ef6486401816850c984fb1',
        path: 'packages/agent/agent/acceptance/README.md',
        oldBlob: 'f7fac2fc21bfceb51c3dd84542b866eb7bb12c89',
        newBlob: 'fbf0d08732f5d2004c3d63cff6c8be11442da99b',
        diffSha256: 'eee5be00ebfdf300db6978cb2981a1b989dcd977846fc3de2669bb835edf3a2c',
        decisionUrl:
          'https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6367449357',
      },
    ])
    expect(report.unresolvedViolations).toEqual([])
    const output = render(report, config).join('\n')
    expect(output).toContain(report.violations[0])
    expect(output).toContain('已批准历史例外 1')
    expect(output).toContain('未解决违规 0')
    expect(output).not.toContain('没有不该改验收的角色动过它')
  })
})

const historical = {
  commit: '48ad37d292796326d65055a75e8a1fde44fe4233',
  parent: 'e7aab8ec73002713d2ef6486401816850c984fb1',
  path: 'packages/agent/agent/acceptance/README.md',
  oldBlob: 'f7fac2fc21bfceb51c3dd84542b866eb7bb12c89',
  newBlob: 'fbf0d08732f5d2004c3d63cff6c8be11442da99b',
  diffSha256: 'eee5be00ebfdf300db6978cb2981a1b989dcd977846fc3de2669bb835edf3a2c',
  decisionUrl: 'https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6367449357',
}

describe('historical fingerprint rejection', () => {
  it.each(['commit', 'parent', 'path', 'oldBlob', 'newBlob', 'diffSha256', 'decisionUrl'])(
    'rejects a single changed %s',
    field => {
      expect(
        matchHistoricalApproval({ ...historical, [field]: 'different' }, [historical.path]),
      ).toBeUndefined()
    },
  )

  it('rejects a missing decision and additional protected paths', () => {
    const { decisionUrl: _decision, ...missingDecision } = historical
    expect(matchHistoricalApproval(missingDecision, [historical.path])).toBeUndefined()
    expect(matchHistoricalApproval(historical, [historical.path, SPEC])).toBeUndefined()
    expect(matchHistoricalApproval(historical, [])).toBeUndefined()
    expect(matchHistoricalApproval(historical, [SPEC])).toBeUndefined()
    expect(matchHistoricalApproval(historical, [historical.path])).toEqual(historical)
  })

  it('does not attach the known approval to a range without that violation', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const report = inspect(root, historical.parent, config, historical.parent)
    expect(report.approvedExceptions).toEqual([])
    expect(report.unresolvedViolations).toEqual([])
    expect(() =>
      inspectHistoricalApproval('/no-such-repository', historical.commit, [historical.path]),
    ).toThrow()
  })
})

describe('#769 historical approvals against real Git objects', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const decision =
    'https://github.com/nemori-ai/omne-harness-lite/issues/769#issuecomment-6411908205'
  const issue769 = HISTORICAL_APPROVALS.filter(item => item.decisionUrl === decision)
  const commits = [...new Set(issue769.map(item => item.commit))]
  const pathsOf = (commit: string) =>
    HISTORICAL_APPROVALS.filter(item => item.commit === commit).map(item => item.path)
  const flip = (hex: string) => `${hex.slice(0, -1)}${hex.endsWith('0') ? '1' : '0'}`

  it('registers the six decided commits, one entry for each protected path', () => {
    expect(commits.map(commit => commit.slice(0, 9))).toEqual([
      '19f457a15',
      '9f3967cc5',
      '69bdedfab',
      '837d333fd',
      '14b0fcfcb',
      '06acd53ca',
    ])
    expect(issue769).toHaveLength(27)
  })

  it.each(commits)('recognizes every registered path of %s from the repository', commit => {
    const paths = pathsOf(commit)
    expect(inspectHistoricalApproval(root, commit, paths)).toEqual(
      HISTORICAL_APPROVALS.filter(item => item.commit === commit),
    )
  })

  it.each(commits)('rejects %s when one byte of its fingerprint changes', commit => {
    const paths = pathsOf(commit)
    for (const approval of HISTORICAL_APPROVALS.filter(item => item.commit === commit)) {
      expect(matchHistoricalApproval(approval, paths)).toBe(approval)
      for (const field of ['oldBlob', 'newBlob', 'diffSha256'] as const)
        expect(
          matchHistoricalApproval({ ...approval, [field]: flip(approval[field]) }, paths),
        ).toBeUndefined()
    }
  })

  it.each(commits)('rejects %s against a parent other than the registered one', commit => {
    const approval = HISTORICAL_APPROVALS.find(item => item.commit === commit)!
    const parents = execFileSync('git', ['show', '-s', '--format=%P', commit], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split(' ')
    const other =
      parents.find(parent => parent !== approval.parent) ??
      execFileSync('git', ['rev-parse', `${approval.parent}^`], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
    const observed = observeHistoricalChange(root, commit, other, approval.path)
    expect(
      matchHistoricalApproval({ ...approval, ...observed, parent: other }, pathsOf(commit)),
    ).toBeUndefined()
    expect(matchHistoricalApproval({ ...approval, parent: other }, pathsOf(commit))).toBeUndefined()
  })

  it('recomputes an added path as the null object on the parent side, and nothing else matches', () => {
    const added = issue769.filter(item => item.oldBlob === NULL_OBJECT_ID)
    expect(added).toHaveLength(8)
    for (const approval of added) {
      const { commit, parent, path } = approval
      expect(observeHistoricalChange(root, commit, parent, path).oldBlob).toBe(NULL_OBJECT_ID)
      const realBlob = execFileSync('git', ['rev-parse', `${commit}:${path}`], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
      expect(
        matchHistoricalApproval({ ...approval, oldBlob: realBlob }, pathsOf(commit)),
      ).toBeUndefined()
    }
  })

  it('approves a commit only when its protected paths are exactly the registered ones', () => {
    const commit = '69bdedfabc097585cea516ccec8a6ba1d58003ae'
    const paths = pathsOf(commit)
    expect(paths).toHaveLength(8)
    expect(inspectHistoricalApproval(root, commit, paths.slice(1))).toEqual([])
    expect(inspectHistoricalApproval(root, commit, [...paths, SPEC])).toEqual([])
    expect(inspectHistoricalApproval(root, commit, [...paths, paths[0]!])).toEqual([])
    const approval = HISTORICAL_APPROVALS.find(item => item.commit === commit)!
    expect(matchHistoricalApproval(approval, paths.slice(1))).toBeUndefined()
  })

  it('keeps one decision per commit: D010 is not approved by the #769 entry for the same change', () => {
    const d010 = HISTORICAL_APPROVALS.find(item => item.commit === historical.commit)!
    const sameChange = issue769.find(item => item.diffSha256 === d010.diffSha256)!
    expect(sameChange.commit).not.toBe(d010.commit)
    expect(
      matchHistoricalApproval({ ...sameChange, commit: d010.commit }, [d010.path]),
    ).toBeUndefined()
    expect(
      matchHistoricalApproval({ ...d010, commit: sameChange.commit }, [d010.path]),
    ).toBeUndefined()
  })

  it('compiles the list read-only', () => {
    expect(Object.isFrozen(HISTORICAL_APPROVALS)).toBe(true)
    expect(HISTORICAL_APPROVALS.every(item => Object.isFrozen(item))).toBe(true)
  })

  it('refuses a list with a duplicate (commit, path) instead of taking the first entry', () => {
    expect(() => assertUniqueApprovals(HISTORICAL_APPROVALS)).not.toThrow()
    const [first] = HISTORICAL_APPROVALS
    const duplicate = { ...first!, diffSha256: flip(first!.diffSha256) }
    expect(() => assertUniqueApprovals([first!, duplicate])).toThrow('duplicate (commit, path)')
    expect(() => inspectAgainst([first!, duplicate], root, first!.commit, [first!.path])).toThrow(
      'duplicate (commit, path)',
    )
  })
})

// Fast tier: a small local repository. The registered parent goes straight into the candidate, so
// only the two parent guards in inspectAgainst can reject a wrong parent.
describe('historical approval parent guards', () => {
  const made: string[] = []
  afterEach(() => {
    for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true })
  })
  const git = (root: string, ...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=someone', '-c', 'user.email=someone@example.com', ...args],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
  const path = 'packages/x/acceptance/README.md'
  const decisionUrl = 'https://example.com/decision'

  /** Three commits in a line: grandparent, parent, commit, each with different content at `path`. */
  function history() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'historical-parent-')))
    made.push(root)
    git(root, 'init', '-q')
    mkdirSync(join(root, dirname(path)), { recursive: true })
    const commits = ['first\n', 'second\n', 'third\n'].map(content => {
      writeFileSync(join(root, path), content)
      git(root, 'add', path)
      git(root, 'commit', '-qm', content.trim())
      return git(root, 'rev-parse', 'HEAD')
    })
    const [grandparent, parent, commit] = commits as [string, string, string]
    return { root, grandparent, parent, commit }
  }
  const entry = (root: string, commit: string, parent: string): HistoricalApproval => ({
    commit,
    parent,
    path,
    ...observeHistoricalChange(root, commit, parent, path),
    decisionUrl,
  })

  it('approves an entry whose parent is the real parent', () => {
    const { root, parent, commit } = history()
    const approval = entry(root, commit, parent)
    expect(inspectAgainst([approval], root, commit, [path])).toEqual([approval])
  })

  it('rejects an entry that names the grandparent, even with fingerprints observed against it', () => {
    const { root, grandparent, commit } = history()
    expect(inspectAgainst([entry(root, commit, grandparent)], root, commit, [path])).toEqual([])
  })

  it('rejects a real parent whose object a Git replacement has changed', () => {
    const { root, parent, commit } = history()
    const approval = entry(root, commit, parent)
    const replacement = git(root, 'commit-tree', `${parent}^{tree}`, '-m', 'replacement')
    git(root, 'replace', parent, replacement)
    expect(inspectAgainst([approval], root, commit, [path])).toEqual([])
  })
})

// Slow tier: clones historical Git objects and runs the real CLI in child processes.
describe('historical CLI audit with real Git objects', { tags: ['slow'] }, () => {
  const made: string[] = []
  afterEach(() => {
    for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  const git = (root: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()

  function repository() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'historical-acceptance-')))
    made.push(root)
    const source = fileURLToPath(new URL('../../../', import.meta.url))
    git(root, 'clone', '--quiet', '--shared', '--no-checkout', source, '.')
    git(root, 'sparse-checkout', 'set', '--no-cone', `/${historical.path}`)
    git(root, 'checkout', '--quiet', '--detach', historical.commit)
    return root
  }

  const cli = fileURLToPath(new URL('../src/acceptance/cli.ts', import.meta.url))
  const run = (root: string, env: NodeJS.ProcessEnv = process.env) =>
    spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, '--root', root, '--base', historical.parent],
      { env, encoding: 'utf8' },
    )

  it('exits zero only for the exact history, and still rejects uncommitted and future developer changes', () => {
    const root = repository()
    const approved = run(root)
    expect(approved.status, approved.stderr).toBe(0)
    expect(approved.stdout).toContain('原始违规')
    expect(approved.stdout).toContain(historical.decisionUrl)
    expect(approved.stdout).toContain(historical.diffSha256)
    expect(approved.stdout).toContain('未解决违规 0')
    writeFileSync(join(root, historical.path), 'a different acceptance contract\n')
    const dirty = run(root)
    expect(dirty.status, dirty.stderr).toBe(1)
    expect(dirty.stdout).toContain('未提交的验收改动')
    git(root, 'add', historical.path)
    git(
      root,
      '-c',
      'user.name=someone',
      '-c',
      'user.email=someone@example.com',
      'commit',
      '-qm',
      'future edit\n\nAgent-Role: developer',
    )
    const future = run(root)
    expect(future.status, future.stderr).toBe(1)
    expect(future.stdout).toContain('已批准历史例外 1')
    expect(future.stdout).toContain('未解决违规 1')
    const report = inspect(root, historical.parent, config)
    expect(report.violations).toHaveLength(2)
    expect(report.approvedExceptions).toEqual([historical])
    expect(report.unresolvedViolations).toHaveLength(1)
  })

  it('passes the M1 freeze head against origin/main of that time only through the seven named decisions', () => {
    const root = repository()
    git(root, 'checkout', '--quiet', '--detach', '115bd78ba68ff95a644f6575d38749ae834203a7')
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        cli,
        '--root',
        root,
        '--base',
        '93b6235ef319938235648724ef959ff53884d2eb',
      ],
      { encoding: 'utf8' },
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('原始违规（锁被破 7 处）')
    expect(result.stdout).toContain('已批准历史例外 28 处')
    expect(result.stdout).toContain('未解决违规 0 处')
    for (const commit of new Set(HISTORICAL_APPROVALS.map(item => item.commit)))
      expect(result.stdout).toContain(commit)
  })

  it('still approves the exact history when repository configuration changes diff output', () => {
    const root = repository()
    git(root, 'config', 'core.abbrev', '12')
    git(root, 'config', 'diff.noprefix', 'true')
    git(root, 'config', 'diff.mnemonicPrefix', 'true')
    git(root, 'config', 'diff.algorithm', 'histogram')
    const approved = run(root)
    expect(approved.status, approved.stderr).toBe(0)
    expect(approved.stdout).toContain('原始违规（锁被破 1 处）')
    expect(approved.stdout).toContain('已批准历史例外 1 处')
  })

  const scratch = () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'historical-config-')))
    made.push(directory)
    return directory
  }
  const infoAttributes = (root: string, line: string) => {
    const info = join(git(root, 'rev-parse', '--absolute-git-dir'), 'info')
    mkdirSync(info, { recursive: true })
    writeFileSync(join(info, 'attributes'), `${line}\n`)
  }

  const markdownAttributesTree = (root: string) => {
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: root,
      input: '*.md diff=markdown\n',
      encoding: 'utf8',
    }).trim()
    return execFileSync('git', ['mktree'], {
      cwd: root,
      input: `100644 blob ${blob}\t.gitattributes\n`,
      encoding: 'utf8',
    }).trim()
  }

  // Each setup changes the bytes of a plain `git diff` for the approved commit.
  it.each<[string, (root: string) => NodeJS.ProcessEnv]>([
    ['diff.context=5', root => (git(root, 'config', 'diff.context', '5'), process.env)],
    [
      'diff.suppressBlankEmpty=true',
      root => (git(root, 'config', 'diff.suppressBlankEmpty', 'true'), process.env),
    ],
    [
      'diff.srcPrefix and diff.dstPrefix',
      root => (
        git(root, 'config', 'diff.srcPrefix', 'X/'),
        git(root, 'config', 'diff.dstPrefix', 'Y/'),
        process.env
      ),
    ],
    ['color.diff=always', root => (git(root, 'config', 'color.diff', 'always'), process.env)],
    [
      'a textconv driver from info/attributes',
      root => (
        infoAttributes(root, '*.md diff=tc'),
        git(root, 'config', 'diff.tc.textconv', 'sed s/a/b/'),
        process.env
      ),
    ],
    [
      'a global core.attributesFile with a markdown diff driver',
      () => {
        const directory = scratch()
        const attributes = join(directory, 'attributes')
        const global = join(directory, 'gitconfig')
        writeFileSync(attributes, '*.md diff=markdown\n')
        // Git 配置值里的 `\` 是转义符；Windows 路径换成 `/` 写进去，Git 照样认。
        writeFileSync(global, `[core]\n\tattributesFile = ${attributes.replaceAll('\\', '/')}\n`)
        return { ...process.env, GIT_CONFIG_GLOBAL: global }
      },
    ],
    ['GIT_DIFF_OPTS=--unified=1', () => ({ ...process.env, GIT_DIFF_OPTS: '--unified=1' })],
    [
      'a worktree .gitattributes with a markdown diff driver',
      root => (writeFileSync(join(root, '.gitattributes'), '*.md diff=markdown\n'), process.env),
    ],
    [
      'GIT_ATTR_SOURCE and attr.tree naming a tree with a markdown diff driver',
      root => {
        const tree = markdownAttributesTree(root)
        git(root, 'config', 'attr.tree', tree)
        return { ...process.env, GIT_ATTR_SOURCE: tree }
      },
    ],
  ])('still approves the exact history under %s', (_name, setup) => {
    const root = repository()
    const approved = run(root, setup(root))
    expect(approved.status, approved.stderr).toBe(0)
    expect(approved.stdout).toContain('原始违规（锁被破 1 处）')
    expect(approved.stdout).toContain('已批准历史例外 1 处')
  })

  it('known limit: a funcname diff driver in info/attributes changes the bytes, so approval fails closed', () => {
    const root = repository()
    infoAttributes(root, '*.md diff=markdown')
    const rejected = run(root)
    expect(rejected.status, rejected.stderr).toBe(1)
    expect(rejected.stdout).toContain('已批准历史例外 0')
  })

  it('rejects Git replacement objects even when the reported SHA and diff still match', () => {
    const root = repository()
    const replacement = git(
      root,
      '-c',
      'user.name=someone',
      '-c',
      'user.email=someone@example.com',
      'commit-tree',
      `${historical.commit}^{tree}`,
      '-p',
      historical.parent,
      '-m',
      'replacement metadata\n\nAgent-Role: developer',
    )
    git(root, 'replace', historical.commit, replacement)
    const result = run(root)
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain('已批准历史例外 0')
    expect(result.stdout).toContain('未解决违规 1')
  })

  // Windows 上 Node 按 PATH 找 `git` 只认 .com/.exe，无扩展名的 sh 替身截不住真实 git，故障注不进去。
  it
    .skipIf(process.platform === 'win32')
    .each(['--binary', `${historical.commit}:${historical.path}`])(
    'propagates failed Git read %s as CLI exit 2',
    failedArgument => {
      const root = repository()
      const bin = join(root, 'fault-bin')
      mkdirSync(bin)
      const actualGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
      writeFileSync(
        join(bin, 'git'),
        `#!/bin/sh\nfor arg in "$@"; do\n  if [ "$arg" = "${failedArgument}" ]; then echo fingerprint-read-failed >&2; exit 42; fi\ndone\nexec '${actualGit}' "$@"\n`,
        { mode: 0o755 },
      )
      const failed = run(root, { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` })
      expect(failed.status).toBe(2)
      expect(failed.stderr).toContain('fingerprint-read-failed')
      expect(failed.stdout).not.toContain('已批准历史例外 1')
    },
  )
})
