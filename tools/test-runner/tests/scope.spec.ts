// 影响面的计划：用仓库里真实的路径规则（test-runs.config.json）、一份造出来的成员清单，核对每类改动被判成什么、
// 选中谁、为什么；规则一旦退化（例如读者规则丢了、全局清单漏了锁文件），这里会变红。
// 另核对取改动的那一步：改名拆成两侧、基线不存在时报错而不是改判全量。
import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { changedFiles, coordinates } from '@omne-harness/repo-toolchain/core/git'
import {
  classify,
  describeCheckPlan,
  patternToRegExp,
  planCheck,
  RESIDENT_STEPS,
  type CheckPlan,
} from '../src/testing/scope.ts'
import { readTestRunsConfig } from '../src/testing/config.ts'
import {
  fileTree,
  listWorkspaceMembers,
  type WorkspaceMember,
} from '@omne-harness/repo-toolchain/core/workspace'
import { commitChanges, replayTable } from '../src/testing/replay.ts'
import { computePlan, fullRequested, readPlanFile } from '../src/testing/steps.ts'
import { dependentMembers, listedMembers, packageNames } from '../src/testing/turbo.ts'

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const RULES = readTestRunsConfig().affected
const CONFIG = 'tools/test-runner/test-runs.config.json'

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
// 读者规则与常驻构建点名的真实成员也在清单里：agent-host-local 依赖 agent-cordis-contract，
// m2-contract-skeleton 依赖 message，用来核对「被读的成员根目录文档只选读者、不带下游」。
const MEMBERS = [
  member('packages/common/legal-identity'),
  member('packages/agent/agent'),
  member('packages/agent/agent-cordis-contract'),
  member('packages/agent/agent-host-local', ['@x/agent-cordis-contract']),
  member('packages/common/message'),
  member('packages/model/pi-ai-transport'),
  member('apps/m2-contract-skeleton', ['@x/message']),
  member('packages/core/base'),
  member('packages/core/mid', ['@x/base']),
  member('packages.0.0.1.legacy/core/stream-assembly'),
  member('packages/infra/leaf'),
  member('packages/infra/plain'),
  member('packages.0.0.1.legacy/infra/credential-custodian-local'),
  member('packages/infra/custodian-user', ['@x/credential-custodian-local']),
  member('packages.0.0.1.legacy/model/model-profile-directory-local'),
  member('packages.0.0.1.legacy/tools/tool-execution-local', [], {
    acceptance: 'vitest run --config vitest.acceptance.config.ts',
  }),
  member('packages.0.0.1.legacy/frontend/governance-client-operations-local'),
  member('packages/tenancy/governance-center-entry-node'),
  member('apps/top', ['@x/mid'], { acceptance: 'vitest run --dir acceptance' }),
  member('tools/core-verification'),
  member('tools/repo-toolchain'),
  member('tools/dev-flow', ['@x/repo-toolchain']),
  member('tools/product-checks', ['@x/repo-toolchain', '@x/legal-identity']),
  member('tools/test-runner', ['@x/repo-toolchain']),
]

/**
 * 模拟 turbo 的依赖图（`--filter=...<包>`）：这些成员连同直接、间接依赖它们的成员。
 * 退役目录不是 workspace 成员，turbo 不认得。
 */
function dependentsLike(
  seeds: readonly string[],
  members: readonly WorkspaceMember[],
): Set<string> {
  const active = members.filter(entry => !entry.path.includes('.legacy'))
  const found = new Set(seeds)
  const byName = new Map(active.map(entry => [entry.name, entry.path]))
  for (let grew = true; grew;) {
    grew = false
    for (const entry of active)
      if (
        !found.has(entry.path) &&
        entry.dependencies.some(name => found.has(byName.get(name) ?? ''))
      ) {
        found.add(entry.path)
        grew = true
      }
  }
  return found
}
/** 模拟 turbo 的 `--affected`：成员目录里有任何文件改动就选中它（按包计，含文档），再加上依赖它的成员。 */
function turboLike(paths: readonly string[], members: readonly WorkspaceMember[]): Set<string> {
  const active = members.filter(entry => !entry.path.includes('.legacy'))
  const owners = paths.flatMap(path => {
    const owner = active
      .filter(entry => path.startsWith(`${entry.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0]
    return owner === undefined ? [] : [owner.path]
  })
  return dependentsLike(owners, members)
}
const planWith = (paths: string[], members: readonly WorkspaceMember[], full = false) =>
  planCheck(paths, members, RULES, turboLike(paths, members), full, seeds =>
    dependentsLike(seeds, members),
  )
const plan = (paths: string[], full = false) => planWith(paths, MEMBERS, full)
const describe_ = (checkPlan: CheckPlan) => describeCheckPlan(checkPlan, RULES, CONFIG).join('\n')
const RESIDENT_BUILD = [
  { path: 'packages/common/legal-identity', reason: 'resident' },
  { path: 'packages/agent/agent', reason: 'resident' },
  { path: 'tools/repo-toolchain', reason: 'resident' },
]

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
  it('纯文档：只需常驻检查；构建恰好是常驻检查需要的 legal-identity、agent 与 repo-toolchain，其余全跳并说出依据', () => {
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
    expect(text).toContain(
      '构建：只构建 packages/common/legal-identity、packages/agent/agent、tools/repo-toolchain——常驻检查需要：lint:rules 经',
    )
    expect(text).toContain('成员测试：没有要跑的成员')
  })

  it('叶子成员的源码：它自己，加上读全部产品源码的 product-checks；上游由 turbo 先构建，不进清单', () => {
    const result = plan(['packages/infra/leaf/src/a.ts'])
    expect(result.test).toEqual(['packages/infra/leaf', 'tools/product-checks'])
    expect(result.members).toEqual([
      { path: 'packages/infra/leaf', changed: ['packages/infra/leaf/src/a.ts'], reads: [] },
      {
        path: 'tools/product-checks',
        changed: [],
        reads: [{ path: 'packages/infra/leaf/src/a.ts', pattern: 'packages/**/*.ts' }],
      },
    ])
    expect(result.build).toEqual([
      { path: 'packages/common/legal-identity', reason: 'resident' },
      { path: 'packages/agent/agent', reason: 'resident' },
      { path: 'packages/infra/leaf', reason: 'selected' },
      { path: 'tools/repo-toolchain', reason: 'resident' },
      { path: 'tools/product-checks', reason: 'selected' },
    ])
    expect(result.acceptance).toEqual([])
    expect(result.python.run).toBe(false)
  })

  it('底层成员的源码：turbo 选出的下游进来，并说出是因为依赖', () => {
    const result = plan(['packages/core/base/src/a.ts'])
    expect(result.test).toEqual([
      'packages/core/base',
      'packages/core/mid',
      'apps/top',
      'tools/product-checks',
    ])
    const why = Object.fromEntries(result.members.map(entry => [entry.path, entry]))
    expect(why['packages/core/mid']?.downstream).toBe(true)
    expect(why['apps/top']?.downstream).toBe(true)
    expect(why['tools/core-verification']).toBeUndefined()
    expect(result.acceptance).toEqual(['apps/top'])
    expect(describe_(result)).toContain('apps/top：依赖了改动过代码的成员（turbo --affected）')
  })

  it('没有测试读它的成员 README：不算成员改动，turbo 按包选中也不选，计划只需常驻检查并说明只改了文档', () => {
    const result = plan(['packages/infra/plain/README.md'])
    expect(result.files[0]).toMatchObject({
      category: 'resident',
      rule: 'packages/*/*/*.md',
      documentOf: 'packages/infra/plain',
    })
    expect(result.files[0]?.owner).toBeUndefined()
    expect(result.members).toEqual([])
    expect([result.test, result.typecheck, result.acceptance]).toEqual([[], [], []])
    expect(result.build).toEqual(RESIDENT_BUILD)
    expect(result.reason).toBe(
      '只需常驻检查：1 个改动文件都只被常驻检查读；只改了文档、不选的成员 1 个',
    )
    const text = describe_(result)
    expect(text).toContain('判为只需常驻检查')
    expect(text).toContain(
      '只改了文档、不选的成员（成员根目录文档不算成员改动，也不带下游；依据：tools/test-runner/test-runs.config.json 的 affected.memberDocuments）：',
    )
    expect(text).toContain('  packages/infra/plain：只改了 packages/infra/plain/README.md')
  })

  it('退役成员的 README 不再触发读者或成员测试', () => {
    const result = plan(['packages.0.0.1.legacy/infra/credential-custodian-local/README_ZH.md'])
    expect(result.files[0]?.category).toBe('excluded')
    expect(result.mode).toBe('scoped')
    expect(result.test).toEqual([])
    expect(result.build).toEqual(RESIDENT_BUILD)
  })

  it('没有读者的旧核心 schema 路径：影响面未知，回退全量', () => {
    const result = plan(['packages/core/messages/schema/messages.schema.json'])
    expect(result.mode).toBe('full')
    expect(result.files[0]?.category).toBe('unclassified')
  })

  it('成员自己的 schema/：那个成员与它的反向依赖', () => {
    const result = plan(['packages/core/base/schema/base.schema.json'])
    expect(result.files[0]).toMatchObject({ category: 'member', owner: 'packages/core/base' })
    expect(result.test).toEqual(['packages/core/base', 'packages/core/mid', 'apps/top'])
  })

  it('别的成员的 TLS 夹具：只选在役成员，不选已退役的外部读者', () => {
    const result = plan(['packages/tenancy/governance-center-entry-node/tests/fixtures/tls/ca.pem'])
    expect(result.test).toEqual(['packages/tenancy/governance-center-entry-node'])
  })

  it('当前产品 README、正文与编号场景触发实际 TS 消费者', () => {
    for (const file of ['README.md', 'design.md', 'acceptance.md']) {
      const result = plan([`.meta_harness/design/product/skills/${file}`])
      expect(result.files[0]?.category).toBe('reader')
      expect(result.test).toEqual(['tools/dev-flow', 'tools/product-checks'])
    }
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

  it('根清单：全量，理由说出文件与命中的模式', () => {
    const result = plan(['docs/a.md', 'pnpm-lock.yaml'])
    expect(result.mode).toBe('full')
    expect(result.reason).toBe('全局文件 pnpm-lock.yaml 有改动（命中 pnpm-lock.yaml）')
    expect(result.test).toEqual(
      MEMBERS.filter(member => !member.path.includes('.legacy/')).map(member => member.path),
    )
    expect(result.acceptance).toEqual(['apps/top'])
    expect(result.python.run).toBe(true)
    expect(describe_(result)).toContain('个计划成员，含必要依赖准备')
  })

  it('根 package.json 与 scripts 下的入口脚本：全量——命令入口只在这两处，与 scripts/check.sh 同等对待', () => {
    for (const path of [
      'package.json',
      'scripts/check.sh',
      'scripts/check-design.sh',
      'scripts/metrics.sh',
      'scripts/slot-unless-plan-only.sh',
      'scripts/test-tier.sh',
    ]) {
      const result = plan([path])
      expect(result.mode, path).toBe('full')
      expect(result.files[0]?.category, path).toBe('global')
    }
  })

  it('锁文件：全量', () => {
    expect(plan(['pnpm-lock.yaml']).mode).toBe('full')
  })

  it('选择配置和依赖规则：全量，理由指向全局文件', () => {
    for (const path of ['turbo.json', 'docs/architecture/constraints.json']) {
      const result = plan([path])
      expect(result.mode).toBe('full')
      expect(result.files[0]?.category).toBe('global')
      expect(result.reason).toContain(path)
    }
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
    const without = MEMBERS.filter(entry => entry.path !== 'packages/common/legal-identity')
    expect(() => planCheck(['docs/a.md'], without, RULES, new Set())).toThrow(
      '影响面规则点名了不存在的成员：packages/common/legal-identity',
    )
  })

  it('成员根与部署说明的 .md 不算成员改动，turbo 按包选中也不选；tests/ 下的 .md 是夹具，算成员改动', () => {
    const docs = plan(['apps/top/deploy/docker/README.md', 'packages/infra/leaf/README.md'])
    expect(docs.files.map(file => [file.category, file.documentOf])).toEqual([
      ['resident', 'apps/top'],
      ['resident', 'packages/infra/leaf'],
    ])
    expect(docs.members).toEqual([])
    expect(docs.test).toEqual([])
    // loop-canary.spec.ts 把这份 README 复制进临时仓、改它的 revision 行再断言修订次数。
    const fixture = plan([
      'tools/repo-toolchain/tests/fixtures/loop-canary/repo/.meta_harness/design/product/canary/README.md',
    ])
    expect(fixture.files[0]).toMatchObject({ category: 'member', owner: 'tools/repo-toolchain' })
    // 依赖 repo-toolchain 的三个工具成员按 turbo 的下游规则一起选中。
    expect(fixture.test).toEqual([
      'tools/repo-toolchain',
      'tools/dev-flow',
      'tools/product-checks',
      'tools/test-runner',
    ])
  })

  it('依赖成环：turbo 选出的环上成员都进来', () => {
    const ring = [
      ...MEMBERS,
      member('packages/infra/ring-a', ['@x/ring-b']),
      member('packages/infra/ring-b', ['@x/ring-a']),
    ]
    const result = planWith(['packages/infra/ring-a/data/x.json'], ring)
    expect([...result.test].sort()).toEqual(['packages/infra/ring-a', 'packages/infra/ring-b'])
  })

  it('模型工具demo输入不再选择退役产品验收成员', () => {
    const result = plan(['examples/model-invocation-minimal-demo/src/bootstrap.ts'])
    expect(result.mode).toBe('scoped')
    expect(result.acceptance).toEqual([])
    expect(result.test).toEqual(['tools/product-checks'])
    expect(result.build.some(entry => entry.path.startsWith('examples/'))).toBe(false)
  })

  it('成员目录里的文件按最长前缀归属；被排除的 examples 的 TS 只带上 product-checks', () => {
    expect(classify('packages/infra/leaf/package.json', MEMBERS, RULES)).toMatchObject({
      category: 'reader',
      owner: 'packages/infra/leaf',
    })
    const example = plan(['examples/demo/src/main.ts', 'examples/demo/README.md'])
    expect(example.test).toEqual(['tools/product-checks'])
    expect(example.files.map(file => file.category)).toEqual(['resident', 'reader'])
  })
})

// #793 按测量收窄的三条规则：每条有正例与反例；硬线（改代码跑影响面测试、未识别文件全量）不变。
describe('按测量收窄的规则（#793）', () => {
  it('N1：只改 .meta_harness/human/ 下的文件只需常驻检查；.meta_harness 下别的未登记目录仍判全量', () => {
    const human = plan([
      '.meta_harness/human/README.md',
      '.meta_harness/human/map-reduce-delivery/templates/line-pack.md',
    ])
    expect(human.mode).toBe('scoped')
    expect(human.files.map(file => [file.category, file.rule])).toEqual([
      ['resident', '.meta_harness/human/**'],
      ['resident', '.meta_harness/human/**'],
    ])
    expect([human.members, human.test, human.python.run]).toEqual([[], [], false])
    expect(human.build).toEqual(RESIDENT_BUILD)
    for (const path of ['.meta_harness/humans/x.md', '.meta_harness/new-area/x.md']) {
      const other = plan([path])
      expect(other.mode, path).toBe('full')
      expect(other.files[0]?.category, path).toBe('unclassified')
    }
  })

  it('N2：只改一个不被测试读的成员 SPEC，不选这个成员，也不带它的下游', () => {
    const result = plan(['packages/core/base/SPEC.md'])
    expect(result.mode).toBe('scoped')
    expect(result.members).toEqual([])
    expect([result.test, result.typecheck, result.acceptance]).toEqual([[], [], []])
    expect(result.build).toEqual(RESIDENT_BUILD)
    expect(describe_(result)).toContain('  packages/core/base：只改了 packages/core/base/SPEC.md')
  })

  it('N2：被测试读的成员根目录文档按读者规则选中读它的成员，不带下游', () => {
    const cases = [
      ['packages/agent/agent-cordis-contract/SPEC.md', 'packages/agent/agent-cordis-contract'],
      ['packages/common/message/README.md', 'packages/common/message'],
      ['apps/m2-contract-skeleton/README.md', 'apps/m2-contract-skeleton'],
      ['apps/m2-contract-skeleton/README_ZH.md', 'apps/m2-contract-skeleton'],
      ['apps/m2-contract-skeleton/SPEC.md', 'apps/m2-contract-skeleton'],
    ] as const
    for (const [path, reader] of cases) {
      const result = plan([path])
      expect(result.files[0], path).toMatchObject({ category: 'reader', documentOf: reader })
      expect(result.members, path).toEqual([
        { path: reader, changed: [], reads: [{ path, pattern: path }] },
      ])
      expect(result.test, path).toEqual([reader])
      expect(describe_(result), path).not.toContain('只改了文档、不选的成员')
    }
  })

  it('N2：同一成员既改文档又改代码，照旧选中它与它的下游', () => {
    const result = plan(['packages/core/base/SPEC.md', 'packages/core/base/src/a.ts'])
    expect(result.test).toEqual([
      'packages/core/base',
      'packages/core/mid',
      'apps/top',
      'tools/product-checks',
    ])
    expect(result.members.find(entry => entry.path === 'packages/core/mid')?.downstream).toBe(true)
    expect(describe_(result)).not.toContain('只改了文档、不选的成员')
  })

  it('N2：只改了文档的成员同时是代码改动成员的下游，照旧作为下游选中', () => {
    const result = plan(['packages/core/base/src/a.ts', 'packages/core/mid/README.md'])
    expect(result.test).toEqual([
      'packages/core/base',
      'packages/core/mid',
      'apps/top',
      'tools/product-checks',
    ])
    expect(result.members.find(entry => entry.path === 'packages/core/mid')).toEqual({
      path: 'packages/core/mid',
      changed: [],
      reads: [],
      downstream: true,
    })
  })

  it('N2：文档改在一个成员、代码改在不相干的成员，只选代码这一侧', () => {
    const result = plan(['packages/core/base/README.md', 'packages/infra/leaf/src/a.ts'])
    expect(result.test).toEqual(['packages/infra/leaf', 'tools/product-checks'])
    expect(result.reason).toContain('只改了文档、不选的成员 1 个')
  })

  it('N2：被读的文档与别处代码一起改：读者只按读者规则选中、不带它的下游；读者是代码下游时两个原因都记', () => {
    const apart = plan([
      'packages/agent/agent-cordis-contract/SPEC.md',
      'packages/common/message/src/a.ts',
    ])
    expect(apart.test).toEqual([
      'packages/agent/agent-cordis-contract',
      'packages/common/message',
      'apps/m2-contract-skeleton',
      'tools/product-checks',
    ])
    const both = plan(['apps/m2-contract-skeleton/SPEC.md', 'packages/common/message/src/a.ts'])
    expect(both.members.find(entry => entry.path === 'apps/m2-contract-skeleton')).toEqual({
      path: 'apps/m2-contract-skeleton',
      changed: [],
      reads: [
        { path: 'apps/m2-contract-skeleton/SPEC.md', pattern: 'apps/m2-contract-skeleton/SPEC.md' },
      ],
      downstream: true,
    })
  })

  it('N2：有只改了文档的成员却没给依赖图，算计划报错，不照 turbo 多选也不猜着少选', () => {
    const paths = ['packages/core/base/SPEC.md']
    expect(() => planCheck(paths, MEMBERS, RULES, turboLike(paths, MEMBERS))).toThrow(
      'packages/core/base 只改了文档，要拿掉它们带出的下游，但没有给出 turbo 的依赖图',
    )
  })

  it('N2：同一成员既改文档又改代码时没有只改了文档的成员，不要依赖图，照旧选中它与下游', () => {
    const paths = ['packages/core/base/SPEC.md', 'packages/core/base/src/a.ts']
    const result = planCheck(paths, MEMBERS, RULES, turboLike(paths, MEMBERS))
    expect(result.test).toEqual([
      'packages/core/base',
      'packages/core/mid',
      'apps/top',
      'tools/product-checks',
    ])
    expect(result.documentsOnly).toEqual([])
  })

  it('N2：一个成员改了几份文档：计划给出这个成员与全部文档，说明只列前两份并写总数', () => {
    const result = plan([
      'packages/core/base/SPEC.md',
      'packages/core/base/README.md',
      'packages/core/base/README_ZH.md',
    ])
    expect(result.documentsOnly).toEqual([
      {
        path: 'packages/core/base',
        files: [
          'packages/core/base/README.md',
          'packages/core/base/README_ZH.md',
          'packages/core/base/SPEC.md',
        ],
      },
    ])
    expect(describe_(result)).toContain(
      '  packages/core/base：只改了 packages/core/base/README.md、packages/core/base/README_ZH.md 等 3 个',
    )
  })

  it('N2：turbo 选中了改动解释不了的成员时不拿文档种子的下游，判全量：多改一份文档不会让计划变小', () => {
    // 模拟 turbo 的种子里有这里没认出的改动（例如根 turbo.json 的 globalDependencies 多了一个成员目录外的文件）：
    // turbo 选中全部在役成员，而改动只有一份常驻文档。
    const all = new Set(
      MEMBERS.filter(entry => !entry.path.includes('.legacy')).map(entry => entry.path),
    )
    const graph = (seeds: readonly string[]) => dependentsLike(seeds, MEMBERS)
    const alone = planCheck(['docs/requirements.md'], MEMBERS, RULES, all, false, graph)
    expect(alone.mode).toBe('scoped')
    expect(new Set(alone.test)).toEqual(all)
    const withDocument = planCheck(
      ['docs/requirements.md', 'packages/core/base/SPEC.md'],
      MEMBERS,
      RULES,
      all,
      false,
      graph,
    )
    expect(withDocument.mode).toBe('full')
    expect(withDocument.reason).toContain(
      '不在代码改动成员与只改了文档的成员的下游里，影响面未知：packages/common/legal-identity',
    )
    expect(withDocument.test).toEqual(alone.test)
    // 改动能解释 turbo 的选择时照常拿掉：同一份文档单独改，只需常驻检查。
    expect(plan(['packages/core/base/SPEC.md']).test).toEqual([])
  })

  it('N3b：dev-flow 的 integration 代码是成员文件，选中 dev-flow，不判全量；引擎自身的源码仍判全量', () => {
    const integration = plan(['tools/dev-flow/src/integration/parse.ts'])
    expect(integration.mode).toBe('scoped')
    expect(integration.files[0]).toMatchObject({ category: 'member', owner: 'tools/dev-flow' })
    expect(integration.test).toEqual(['tools/dev-flow'])
    const engine = plan(['tools/test-runner/src/testing/scope.ts'])
    expect(engine.mode).toBe('full')
    expect(engine.files[0]).toMatchObject({
      category: 'global',
      rule: 'tools/test-runner/src/testing/scope.ts',
    })
  })

  it('模型组架构页被 pi-ai-transport 的测试读：只选它；同目录下别的文档只需常驻检查', () => {
    const read = plan(['packages/model/docs/architecture.md'])
    expect(read.files[0]).toMatchObject({ category: 'reader' })
    expect(read.test).toEqual(['packages/model/pi-ai-transport'])
    const other = plan(['packages/model/docs/other.md'])
    expect(other.files[0]).toMatchObject({ category: 'resident', rule: 'packages/**/*.md' })
    expect(other.test).toEqual([])
  })

  it('新顶层文件仍判全量；改代码仍选中成员与下游', () => {
    expect(plan(['m793-new.txt']).mode).toBe('full')
    expect(plan(['packages/core/mid/src/a.ts']).test).toEqual([
      'packages/core/mid',
      'apps/top',
      'tools/product-checks',
    ])
  })
})

describe('真实仓库', () => {
  it('读者规则里不带通配符的路径都在仓库里：文件改名或删掉后规则还指着旧路径，是规则错了', () => {
    const literal = RULES.readers
      .flatMap(reader => reader.paths)
      .filter(path => !path.includes('*'))
    expect(literal.filter(path => !existsSync(join(ROOT, path)))).toEqual([])
  })

  it('turbo 的依赖图：没有成员时不跑 turbo、给空集；清单外的成员在起 turbo 之前报错', () => {
    const members = listWorkspaceMembers(fileTree(ROOT), RULES.excludeRoots)
    expect(dependentMembers(ROOT, members, [])).toEqual(new Set())
    expect(() => dependentMembers(ROOT, members, ['packages/no/such-member'])).toThrow(
      '成员 packages/no/such-member 不在 workspace 成员清单里',
    )
  })

  it(
    'turbo 的依赖图：给出成员连同依赖它的成员，点名几个成员就带上几个成员的下游',
    // 起 turbo 子进程：真实的 `--filter=...<包>` 只有 turbo 能核对，造出来的依赖图测不到。
    { tags: ['slow'] },
    () => {
      const members = listWorkspaceMembers(fileTree(ROOT), RULES.excludeRoots)
      const found = dependentMembers(ROOT, members, ['packages/agent/agent-cordis-contract'])
      expect(found.has('packages/agent/agent-cordis-contract')).toBe(true)
      expect(found.has('packages/agent/agent-host-local')).toBe(true)
      expect(found.has('tools/test-runner')).toBe(false)
      const two = dependentMembers(ROOT, members, [
        'packages/agent/agent-cordis-contract',
        'packages/common/message',
      ])
      expect(two.has('packages/agent/agent-host-local')).toBe(true)
      expect(two.has('apps/m2-contract-skeleton')).toBe(true)
    },
  )

  it('规则点名的成员都存在', () => {
    const members = listWorkspaceMembers(fileTree(ROOT), RULES.excludeRoots)
    expect(() => planCheck([], members, RULES, new Set())).not.toThrow()
  })

  it('基线不存在：引擎报错，不改判全量', () => {
    expect(() => computePlan(ROOT, 'no-such-ref-for-affected-spec', false)).toThrow()
  })
})

describe('turbo 输出的解析', () => {
  const members = [member('packages/core/base'), member('packages/core/mid', ['@x/base'])]
  const listing = (...names: string[]) =>
    JSON.stringify({ packages: { items: names.map(name => ({ name })) } })

  it('包名：读出 packages.items 里的 name；不是 JSON 或形状不对时给 undefined，不给部分结果', () => {
    expect(packageNames(listing('@x/base', '@x/mid'))).toEqual(['@x/base', '@x/mid'])
    expect(packageNames(listing())).toEqual([])
    for (const stdout of [
      'not json',
      'null',
      '{}',
      '{"packages":null}',
      '{"packages":{"items":"x"}}',
      '{"packages":{"items":{}}}',
      '{"packages":{"items":null}}',
      '{"packages":{"items":[{"name":"@x/base"},{}]}}',
      '{"packages":{"items":[{"name":1}]}}',
      '{"packages":{"items":[null]}}',
    ])
      expect(packageNames(stdout), stdout).toBeUndefined()
  })

  it('成员：turbo 成功且输出读得出时换成成员目录；退出码非 0、输出读不出或报出清单外的包都报错，不当作空集', () => {
    const ok = { status: 0, stdout: listing('@x/mid'), stderr: '' }
    expect(listedMembers(ok, members, '下游')).toEqual(new Set(['packages/core/mid']))
    expect(() =>
      listedMembers({ status: 1, stdout: listing('@x/mid'), stderr: 'boom' }, members, '下游'),
    ).toThrow('turbo 没有给出下游（退出码 1）：boom')
    expect(() =>
      listedMembers({ status: 0, stdout: 'not json', stderr: '' }, members, '下游'),
    ).toThrow('turbo 没有给出下游（退出码 0）')
    expect(() => listedMembers({ status: 0, stdout: 'null', stderr: '' }, members, '下游')).toThrow(
      'turbo 没有给出下游（退出码 0）',
    )
    expect(() =>
      listedMembers({ status: 0, stdout: listing('@x/other'), stderr: '' }, members, '下游'),
    ).toThrow('turbo 报出的包 @x/other 不在 workspace 成员清单里')
  })
})

describe('计划文件', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  const fixed = baselines(ROOT)
  const baseRef = fixed.targetBase ?? head
  const base = coordinates(ROOT, baseRef).base
  const planFile = (overrides: Record<string, unknown>) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'check-plan-')))
    dirs.push(dir)
    const path = join(dir, 'plan.json')
    const file = { head, dirty: false, base, plan: plan([]) }
    writeFileSync(path, JSON.stringify({ ...file, ...overrides }))
    return path
  }

  it('对当前提交算的：读得回来', () => {
    expect(readPlanFile(ROOT, planFile({})).head).toBe(head)
  })

  it.skipIf(fixed.state === 'pending')('与固定基线不同的真实提交：拒绝执行', () => {
    expect(() =>
      readPlanFile(ROOT, planFile({ base: { ref: `${baseRef}^`, mergeBase: head } })),
    ).toThrow('Explicit base differs from fixed targetBase')
  })

  it('不存在、形状不对、对别的提交算的：都报错，不照着跑', () => {
    expect(() => readPlanFile(ROOT, join(tmpdir(), 'no-such-check-plan.json'))).toThrow('不存在')
    expect(() => readPlanFile(ROOT, planFile({ plan: { mode: 'scoped' } }))).toThrow('形状不对')
    expect(() => readPlanFile(ROOT, planFile({ head: '0'.repeat(40) }))).toThrow(
      '是对提交 000000000 算的',
    )
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

  it('改名拆成删与增、非 ASCII 文件名原样：工作树改动与单个提交的改动都是如此', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'affected-rename-')))
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
    // 非 ASCII 的文件名要原样给出：git 缺省会给它加引号、转义成八进制，那样就归不了类、整份判全量。
    put(root, 'docs/本机实测.md', '')
    run(root, 'add', 'docs/本机实测.md')
    expect(changedFiles(root, base)).toEqual([
      'docs/本机实测.md',
      'packages/a/x/src/old.ts',
      'packages/a/y/src/new.ts',
      'untracked.txt',
    ])
    run(root, 'commit', '-q', '-m', 'rename')
    expect(commitChanges(root, 'HEAD').sort()).toEqual([
      'docs/本机实测.md',
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

describe('计划打印的常驻清单', () => {
  /** `scripts/check.sh` 里每次都跑的 `pnpm run <脚本>`，按出现顺序；按计划跑的那些经 `step`，不是 pnpm 调用。 */
  function residentStepsOfCheckScript(): string[] {
    const script = readFileSync(join(ROOT, 'scripts/check.sh'), 'utf8')
    return [...script.matchAll(/^pnpm (?:--silent )?run ([\w:]+)/gmu)].flatMap(match =>
      match[1] === undefined ? [] : [match[1]],
    )
  }

  it('与 scripts/check.sh 的常驻步骤一致，含 check:lines 与 contract:api；打印原样列出', () => {
    expect([...RESIDENT_STEPS]).toEqual(residentStepsOfCheckScript())
    expect(RESIDENT_STEPS).toContain('check:lines')
    expect(RESIDENT_STEPS).toContain('contract:api')
    const text = describe_(plan(['docs/development.md']))
    expect(text).toContain(`常驻：${RESIDENT_STEPS.join('、')}`)
  })
})
