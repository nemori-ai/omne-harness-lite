// 影响面的计划：用仓库里真实的路径规则（test-runs.config.json）、一份造出来的成员清单，核对每类改动被判成什么、
// 选中谁、为什么；规则一旦退化（例如读者规则丢了、全局清单漏了锁文件），这里会变红。
// 另核对取改动的那一步：改名拆成两侧、基线不存在时报错而不是改判全量。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { changedFiles } from '../src/metrics/git.ts'
import {
  classify,
  describeCheckPlan,
  patternToRegExp,
  planCheck,
  type CheckPlan,
} from '../src/testing/affected.ts'
import { readTestRunsConfig } from '../src/testing/config.ts'
import { fileTree, listWorkspaceMembers, type WorkspaceMember } from '../src/testing/members.ts'
import { commitChanges, replayTable } from '../src/testing/replay.ts'
import { computePlan, fullRequested } from '../src/testing/steps.ts'

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const RULES = readTestRunsConfig().affected
const CONFIG = 'tools/ts-checks/test-runs.config.json'

const SCRIPTS = { build: 'tsc', typecheck: 'tsc', test: 'vitest run' }
const member = (
  path: string,
  dependencies: string[] = [],
  extra: Record<string, string> = {},
): WorkspaceMember => ({
  path,
  name: `@x/${path.split('/').pop() ?? path}`,
  scripts: { ...SCRIPTS, ...extra },
  dependencies,
})

// base ← mid ← top（top 有验收）；custodian-user 依赖读自己 README 的 credential-custodian-local。
const MEMBERS = [
  member('packages/core/identity-values'),
  member('packages/core/base'),
  member('packages/core/mid', ['@x/base']),
  member('packages/core/stream-assembly'),
  member('packages/infra/leaf'),
  member('packages/infra/plain'),
  member('packages/infra/credential-custodian-local'),
  member('packages/infra/custodian-user', ['@x/credential-custodian-local']),
  member('packages/model/model-profile-directory'),
  member('packages/frontend/governance-client-operations'),
  member('packages/tenancy/governance-center-entry'),
  member('apps/top', ['@x/mid'], { acceptance: 'vitest run --dir acceptance' }),
  member('tools/core-verification', ['@x/base']),
  member('tools/ts-checks', ['@x/identity-values']),
]

const plan = (paths: string[], full = false) => planCheck(paths, MEMBERS, RULES, full)
const describe_ = (checkPlan: CheckPlan) => describeCheckPlan(checkPlan, RULES, CONFIG).join('\n')
const RESIDENT_BUILD = [{ path: 'packages/core/identity-values', reason: 'resident' }]

describe('路径模式', () => {
  it('`*` 不跨目录，`**` 跨目录，`**/` 也匹配零层目录', () => {
    expect(patternToRegExp('tsconfig*.json').test('tsconfig.base.json')).toBe(true)
    expect(patternToRegExp('tsconfig*.json').test('packages/a/tsconfig.json')).toBe(false)
    expect(patternToRegExp('docs/**').test('docs/a/b.md')).toBe(true)
    expect(patternToRegExp('**/*.md').test('README.md')).toBe(true)
    expect(patternToRegExp('**/*.md').test('packages/a/b/README.md')).toBe(true)
    expect(patternToRegExp('packages/**/*.ts').test('packages/a/b/src/x.ts')).toBe(true)
    expect(patternToRegExp('packages/**/*.ts').test('packages/a/b/src/x.tsx')).toBe(false)
  })
})

describe('影响面计划（真实规则）', () => {
  it('纯文档：只需常驻检查；构建恰好是常驻检查需要的 identity-values，其余全跳并说出依据', () => {
    const result = plan(['docs/development.md', 'README.md'])
    expect(result.mode).toBe('scoped')
    expect(result.files.map(file => [file.category, file.rule])).toEqual([
      ['resident', 'README.md'],
      ['resident', 'docs/**'],
    ])
    expect(result.members).toEqual([])
    expect(result.build).toEqual(RESIDENT_BUILD)
    expect([result.typecheck, result.test, result.acceptance]).toEqual([[], [], []])
    expect(result.python.run).toBe(false)
    const text = describe_(result)
    expect(text).toContain('判为只需常驻检查，跳过了类型检查、成员测试、验收、pytest')
    expect(text).toContain(`${CONFIG} 的 affected.residentPaths`)
    expect(text).toContain('packages/core/identity-values——lint:rules 经')
    expect(text).toContain('成员测试：没有要跑的成员')
  })

  it('叶子成员的源码：它自己，加上读全部产品源码的 ts-checks；ts-checks 的依赖进构建', () => {
    const result = plan(['packages/infra/leaf/src/a.ts'])
    expect(result.test).toEqual(['packages/infra/leaf', 'tools/ts-checks'])
    expect(result.members).toEqual([
      { path: 'packages/infra/leaf', changed: ['packages/infra/leaf/src/a.ts'], reads: [] },
      {
        path: 'tools/ts-checks',
        changed: [],
        reads: [{ path: 'packages/infra/leaf/src/a.ts', pattern: 'packages/**/*.ts' }],
      },
    ])
    expect(result.build).toEqual([
      { path: 'packages/core/identity-values', reason: 'dependency' },
      { path: 'packages/infra/leaf', reason: 'selected' },
      { path: 'tools/ts-checks', reason: 'selected' },
    ])
    expect(result.acceptance).toEqual([])
    expect(result.python.run).toBe(false)
  })

  it('底层成员的源码：反向依赖传递进来，并说出经谁；读核心源码的 core-verification 也进来', () => {
    const result = plan(['packages/core/base/src/a.ts'])
    expect(result.test).toEqual([
      'packages/core/base',
      'packages/core/mid',
      'apps/top',
      'tools/core-verification',
      'tools/ts-checks',
    ])
    const why = Object.fromEntries(result.members.map(entry => [entry.path, entry]))
    expect(why['packages/core/mid']?.dependsOn).toBe('packages/core/base')
    expect(why['apps/top']?.dependsOn).toBe('packages/core/mid')
    expect(why['tools/core-verification']?.dependsOn).toBe('packages/core/base')
    expect(why['tools/core-verification']?.reads).toEqual([
      { path: 'packages/core/base/src/a.ts', pattern: 'packages/core/*/src/**' },
    ])
    expect(result.acceptance).toEqual(['apps/top'])
    expect(describe_(result)).toContain('apps/top：依赖 packages/core/mid')
  })

  it('没有测试读它的成员 README：不算成员改动，只需常驻检查', () => {
    const result = plan(['packages/infra/plain/README.md'])
    expect(result.files[0]).toMatchObject({ category: 'resident', rule: '**/*.md' })
    expect(result.files[0]?.owner).toBeUndefined()
    expect(result.test).toEqual([])
    expect(result.build).toEqual(RESIDENT_BUILD)
  })

  it('测试运行自己 README 代码块的成员：只它自己，不沿反向依赖传播', () => {
    const result = plan(['packages/infra/credential-custodian-local/README_ZH.md'])
    expect(result.files[0]?.category).toBe('reader')
    expect(result.test).toEqual(['packages/infra/credential-custodian-local'])
    expect(result.members[0]?.dependsOn).toBeUndefined()
  })

  it('登记文件：只选读它的两个成员', () => {
    const result = plan(['.meta_harness/design/registry/catalog.json'])
    expect(result.test).toEqual(['packages/core/stream-assembly', 'tools/core-verification'])
    expect(result.members.every(entry => entry.changed.length === 0)).toBe(true)
    expect(result.python.run).toBe(false)
  })

  it('另一个成员的 schema/：那个成员与它的反向依赖，再加读它的 stream-assembly', () => {
    const result = plan(['packages/core/base/schema/base.schema.json'])
    expect(result.files[0]).toMatchObject({ category: 'reader', owner: 'packages/core/base' })
    expect(result.test).toEqual([
      'packages/core/base',
      'packages/core/mid',
      'packages/core/stream-assembly',
      'apps/top',
      'tools/core-verification',
    ])
  })

  it('别的成员的 TLS 夹具：那个成员自己，加上没声明依赖却读它的 governance-client-operations', () => {
    const result = plan(['packages/tenancy/governance-center-entry/tests/fixtures/tls/ca.pem'])
    expect(result.test).toEqual([
      'packages/frontend/governance-client-operations',
      'packages/tenancy/governance-center-entry',
    ])
  })

  it('stories.py：既跑 pytest，又带上读它的 ts-checks', () => {
    const result = plan(['.meta_harness/tooling/src/stories.py'])
    expect(result.files[0]).toMatchObject({
      category: 'reader',
      python: '.meta_harness/tooling/**',
    })
    expect(result.test).toEqual(['tools/ts-checks'])
    expect(result.python.run).toBe(true)
  })

  it('.meta_harness/agents 下的改动：只跑 pytest，不测成员，构建只做常驻需要的', () => {
    const result = plan(['.meta_harness/agents/roles/developer/assembly.toml'])
    expect(result.files[0]?.category).toBe('python')
    expect(result.python).toEqual({
      run: true,
      reason:
        '.meta_harness/agents/roles/developer/assembly.toml 命中 Python 工具的路径（.meta_harness/agents/**）',
    })
    expect(result.test).toEqual([])
    expect(result.typecheck).toEqual([])
    expect(result.build).toEqual(RESIDENT_BUILD)
  })

  it('规格：全量，理由说出文件与命中的模式', () => {
    const result = plan(['docs/a.md', '.meta_harness/design/spec/data/x/v1/contract.md'])
    expect(result.mode).toBe('full')
    expect(result.reason).toBe(
      '全局文件 .meta_harness/design/spec/data/x/v1/contract.md 有改动（命中 .meta_harness/design/spec/**）',
    )
    expect(result.test).toHaveLength(MEMBERS.length)
    expect(result.acceptance).toEqual(['apps/top'])
    expect(result.python.run).toBe(true)
    expect(describe_(result)).toContain('构建：全部（根 pnpm run build')
  })

  it('锁文件：全量', () => {
    expect(plan(['pnpm-lock.yaml']).mode).toBe('full')
  })

  it('没有规则认得的路径：全量，理由点名前几个并给总数', () => {
    const paths = ['a/1.txt', 'a/2.txt', 'a/3.txt', 'a/4.txt', 'a/5.txt', '.gitignore', 'docs/x.md']
    const result = plan(paths)
    expect(result.mode).toBe('full')
    expect(result.reason).toBe(
      '6 个改动文件不在任何规则里，影响面未知：.gitignore、a/1.txt、a/2.txt、a/3.txt、a/4.txt 等 6 个',
    )
  })

  it('混合：文档与叶子源码，范围与只改叶子源码相同，文档归只需常驻检查', () => {
    const mixed = plan(['docs/development.md', 'packages/infra/leaf/src/a.ts'])
    const leafOnly = plan(['packages/infra/leaf/src/a.ts'])
    expect(mixed.test).toEqual(leafOnly.test)
    expect(mixed.build).toEqual(leafOnly.build)
    expect(mixed.files.map(file => file.category)).toEqual(['resident', 'reader'])
  })

  it('空改动：按范围、什么成员都不选、不跑 pytest，理由写明没有改动', () => {
    const result = plan([])
    expect(result).toMatchObject({ mode: 'scoped', reason: '基线以来没有改动', test: [] })
    expect(result.python.run).toBe(false)
  })

  it('改名的两侧都算：旧路径与新路径各自归属的成员都进来', () => {
    const result = plan(['packages/core/base/src/old.ts', 'packages/infra/leaf/src/new.ts'])
    expect(result.members.filter(entry => entry.changed.length > 0).map(e => e.path)).toEqual([
      'packages/core/base',
      'packages/infra/leaf',
    ])
  })

  it('FULL=1：全量，理由写明是要求的', () => {
    const result = plan(['docs/a.md'], true)
    expect(result).toMatchObject({ mode: 'full', reason: 'FULL=1：要求全量' })
    expect(fullRequested({ FULL: '1' })).toBe(true)
    expect(fullRequested({ FULL: '' })).toBe(false)
    expect(fullRequested({})).toBe(false)
    expect(() => fullRequested({ FULL: 'yes' })).toThrow('FULL 只能是 1')
  })

  it('规则点名的成员不存在：报错，不悄悄忽略', () => {
    const without = MEMBERS.filter(entry => entry.path !== 'packages/core/stream-assembly')
    expect(() => planCheck(['docs/a.md'], without, RULES)).toThrow(
      '影响面规则点名了不存在的成员：packages/core/stream-assembly',
    )
  })

  it('成员目录里的文件按最长前缀归属；被排除的 examples 的 TS 只带上 ts-checks', () => {
    expect(classify('packages/infra/leaf/package.json', MEMBERS, RULES)).toMatchObject({
      category: 'reader',
      owner: 'packages/infra/leaf',
    })
    const example = plan(['examples/demo/src/main.ts', 'examples/demo/README.md'])
    expect(example.test).toEqual(['tools/ts-checks'])
    expect(example.files.map(file => file.category)).toEqual(['resident', 'reader'])
  })
})

describe('真实仓库', () => {
  it('规则点名的成员都存在', () => {
    const members = listWorkspaceMembers(fileTree(ROOT), RULES.excludeRoots)
    expect(() => planCheck([], members, RULES)).not.toThrow()
  })

  it('基线不存在：引擎报错，不改判全量', () => {
    expect(() => computePlan(ROOT, 'no-such-ref-for-affected-spec', false)).toThrow()
  })
})

describe('取改动', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })
  const run = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const put = (root: string, path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }

  it('改名拆成删与增：工作树改动与单个提交的改动都给出两侧', () => {
    const root = mkdtempSync(join(tmpdir(), 'affected-rename-'))
    roots.push(root)
    run(root, 'init', '-q')
    run(root, 'config', 'user.email', 'x@example.com')
    run(root, 'config', 'user.name', 'x')
    put(root, 'packages/a/x/src/old.ts', 'export const a = 1\n')
    run(root, 'add', '-A')
    run(root, 'commit', '-q', '-m', 'base')
    const base = run(root, 'rev-parse', 'HEAD').trim()
    mkdirSync(join(root, 'packages/a/y/src'), { recursive: true })
    run(root, 'mv', 'packages/a/x/src/old.ts', 'packages/a/y/src/new.ts')
    put(root, 'untracked.txt', '')
    expect(changedFiles(root, base)).toEqual([
      'packages/a/x/src/old.ts',
      'packages/a/y/src/new.ts',
      'untracked.txt',
    ])
    run(root, 'commit', '-q', '-m', 'rename')
    expect(commitChanges(root, 'HEAD').sort()).toEqual([
      'packages/a/x/src/old.ts',
      'packages/a/y/src/new.ts',
    ])
  })

  it('回放表：每行一个提交，末行按模式计数', () => {
    const lines = replayTable([
      {
        commit: 'aaa',
        subject: 'docs | x',
        files: 1,
        mode: 'scoped',
        tests: 0,
        python: false,
        reason: '只需常驻检查',
      },
      {
        commit: 'bbb',
        subject: 'lock',
        files: 2,
        mode: 'full',
        tests: 9,
        python: true,
        reason: '全局文件 pnpm-lock.yaml 有改动',
        fullBecause: ['pnpm-lock.yaml'],
      },
    ])
    expect(lines[2]).toBe('| aaa | docs \\| x | 1 | scoped | 0 | — | 只需常驻检查 |')
    expect(lines[3]).toContain('全局或未归类：pnpm-lock.yaml')
    expect(lines.at(-1)).toBe('共 2 个提交：全量 1，按影响面 1（其中只需常驻检查 1），引擎出错 0')
  })
})
