// `check --resume-from`：用真实步骤表、一份只在 oxlint 失败的 H1 记录（全量或按影响面）与造出来的影响面函数，核对
// 前提校验的每种拒绝、全局路径（锁文件也是）的退化、增量计划里每一步怎么跑、证据文本；另在临时仓库上核对取 git 事实
// 与结束时重新核对现场。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import {
  parseAdmissionRun,
  type AdmissionRun,
  type AdmissionStep,
} from '../src/testing/admission-run.ts'
import { checkSteps } from '../src/testing/check-steps.ts'
import { changedDuringRun } from '../src/testing/check.ts'
import {
  describeResume,
  resumeFacts,
  resumePlan,
  type PlanRequest,
  type ResumeInputs,
} from '../src/testing/resume.ts'
import type { CheckPlan } from '../src/testing/scope.ts'

const H1 = 'a'.repeat(40)
const HEAD = 'b'.repeat(40)
const TREE = 'c'.repeat(40)
/** 本次基线 main 与 HEAD 的合并点。 */
const MB = 'e'.repeat(40)
/** H1 那次准入与本次运行所在的工作树。 */
const WORKTREE = '/work/tree'

const STEPS = checkSteps({
  baseline: 'main',
  runnerCli: 'runner.ts',
  devFlowDeliveryCli: 'delivery.ts',
  devFlowIntegrationCli: 'integration.ts',
})
const STEP_NAMES = STEPS.map(step => step.name)
const HEAVY_PLANNED = STEPS.filter(step => step.planned === true && step.heavy).map(
  step => step.name,
)
const RESIDENT = STEPS.filter(step => step.planned !== true).map(step => step.name)

/** H1 的记录：`failed` 失败，`notRan` 没跑到，其余通过。 */
function record(
  failed: string | null,
  notRan: readonly string[],
  over: Record<string, unknown> = {},
): AdmissionRun {
  const steps = STEP_NAMES.map((name): AdmissionStep => {
    if (notRan.includes(name)) return { name, ran: false, exit: null, seconds: 0 }
    return { name, ran: true, exit: name === failed ? 1 : 0, seconds: 1 }
  })
  const base = {
    schemaVersion: 1,
    kind: 'admission-run',
    head: H1,
    tree: TREE,
    dirty: false,
    worktree: WORKTREE,
    admission: true,
    caches: { test: 'off', depGraph: 'off', mutation: 'unknown' },
    fullRequested: true,
    mode: 'full',
    base: null,
    resumeFrom: null,
    steps,
    failedStep: failed,
    startedAt: '2026-10-30T01:00:00.000Z',
    finishedAt: '2026-10-30T01:05:00.000Z',
  }
  const parsed = parseAdmissionRun({ ...base, ...over })
  if (parsed === undefined) throw new Error('夹具不是合法记录')
  return parsed
}

/** 快速失败在 oxlint：与它同时跑的轻步骤和构建已经结束，构建之后的都被终止或没开始。 */
const AFTER_BUILD = [
  'check:declarations',
  'contract-check',
  'typecheck',
  'test',
  'lint:rules',
  'lint:deps',
  'acceptance',
  'loop:status',
]
const OXLINT_FAILED = record('lint:oxlint', AFTER_BUILD)
/** 同样只在 oxlint 失败，但 H1 那次是按影响面准入，基线就是本次的合并点。 */
const OXLINT_FAILED_AFFECTED = record('lint:oxlint', AFTER_BUILD, {
  mode: 'affected',
  base: MB,
  fullRequested: false,
})

const ALL = ['packages/a', 'packages/b', 'tools/c']
const FULL_PLAN: CheckPlan = {
  mode: 'full',
  reason: '全量',
  files: [],
  members: [],
  build: ALL.map(path => ({ path, reason: 'selected' as const })),
  typecheck: ALL,
  test: ALL,
  acceptance: ['packages/a'],
  python: { run: true, reason: '全量' },
}
/** HEAD 相对本次基线的影响面：比全量窄，比 H1..HEAD 的宽。 */
const BASE_PLAN: CheckPlan = {
  mode: 'scoped',
  reason: '按基线影响面',
  files: [],
  members: [{ path: 'packages/a', changed: ['packages/a/src/y.ts'], reads: [] }],
  build: [
    { path: 'packages/a', reason: 'selected' },
    { path: 'packages/b', reason: 'selected' },
  ],
  typecheck: ['packages/a', 'packages/b'],
  test: ['packages/a', 'packages/b'],
  acceptance: ['packages/a'],
  python: { run: false, reason: '基线影响面不含 Python 工具' },
  documentsOnly: [],
}
const AFFECTED_PLAN: CheckPlan = {
  mode: 'scoped',
  reason: '按影响面',
  files: [],
  members: [{ path: 'packages/b', changed: ['packages/b/src/x.ts'], reads: [] }],
  build: [{ path: 'packages/b', reason: 'selected' }],
  typecheck: ['packages/b'],
  test: ['packages/b'],
  acceptance: [],
  python: { run: false, reason: '没有改动命中 Python 工具的路径' },
  documentsOnly: [],
}

const GLOBAL_PATHS = ['package.json', 'pnpm-lock.yaml', 'tsconfig*.json', '**/turbo.json']

interface Harness {
  readonly inputs: ResumeInputs
  readonly requests: PlanRequest[]
}

function harness(over: Partial<ResumeInputs> = {}, affected: CheckPlan = AFFECTED_PLAN): Harness {
  const requests: PlanRequest[] = []
  const inputs: ResumeInputs = {
    from: H1,
    fromTree: TREE,
    head: HEAD,
    worktree: WORKTREE,
    base: { ref: 'main', mergeBase: MB },
    dirty: false,
    isAncestor: true,
    changedFiles: ['packages/b/src/x.ts'],
    records: [OXLINT_FAILED],
    globalPaths: GLOBAL_PATHS,
    steps: STEPS,
    plan: request => {
      requests.push(request)
      if (request.kind === 'since') return affected
      return request.mode === 'full' ? FULL_PLAN : BASE_PLAN
    },
    ...over,
  }
  return { inputs, requests }
}

const rejected = (inputs: ResumeInputs) => {
  const verdict = resumePlan(inputs)
  expect(verdict.kind).toBe('rejected')
  return verdict.kind === 'rejected' ? verdict.reason : ''
}

describe('前提校验', () => {
  it('工作树有未提交改动：拒绝', () => {
    expect(rejected(harness({ dirty: true }).inputs)).toContain('未提交改动')
  })

  it('H1 不是 HEAD 的祖先：拒绝', () => {
    expect(rejected(harness({ isAncestor: false }).inputs)).toContain('不是 HEAD')
  })

  it('H1 就是当前头：拒绝，没有修复提交，要重跑就整次准入', () => {
    const { inputs, requests } = harness({ head: H1, changedFiles: [] })
    expect(rejected(inputs)).toBe(`${H1.slice(0, 9)} 就是当前头，没有修复提交；要重跑请整次准入`)
    expect(requests).toEqual([])
  })

  it('H1 那次准入在别的工作树里跑：拒绝，写明两棵树', () => {
    const reason = rejected(harness({ worktree: '/other/tree' }).inputs)
    expect(reason).toContain(`那次准入在工作树 ${WORKTREE} 里跑，本次在 /other/tree`)
    expect(reason).toContain('只能在同一棵工作树里接续')
  })

  it('H1 没有准入记录：别的提交的不算', () => {
    expect(rejected(harness({ records: [] }).inputs)).toContain('没有准入记录')
    expect(
      rejected(harness({ records: [record('lint:oxlint', [], { head: HEAD })] }).inputs),
    ).toContain('没有准入记录')
  })

  it('H1 的记录不是准入运行：拒绝并说明', () => {
    expect(
      rejected(
        harness({ records: [record('lint:oxlint', AFTER_BUILD, { admission: false })] }).inputs,
      ),
    ).toContain('不是准入运行')
  })

  it('H1 只有带未提交改动的全量记录：拒绝并说明', () => {
    expect(
      rejected(harness({ records: [record('lint:oxlint', AFTER_BUILD, { dirty: true })] }).inputs),
    ).toContain('带未提交改动')
  })

  it('记录写的树与 H1 实际的树不符：拒绝', () => {
    expect(rejected(harness({ fromTree: 'd'.repeat(40) }).inputs)).toContain('不符')
  })

  it('记录不是快速失败（全部通过，或没有失败步骤）：拒绝', () => {
    expect(rejected(harness({ records: [record(null, [])] }).inputs)).toContain('全部通过')
    expect(rejected(harness({ records: [record(null, ['test'])] }).inputs)).toContain('没跑完')
  })

  it('除 X 外还有步骤没通过：拒绝并点名', () => {
    const two = record('lint:oxlint', [], {
      steps: STEP_NAMES.map(name => ({
        name,
        ran: true,
        exit: name === 'lint:oxlint' || name === 'check:docs' ? 1 : 0,
        seconds: 1,
      })),
    })
    expect(rejected(harness({ records: [two] }).inputs)).toContain('check:docs')
  })

  it('记录不自洽（失败步骤在表里是通过的）或失败步骤不在当前步骤表：拒绝', () => {
    expect(
      rejected(harness({ records: [record(null, [], { failedStep: 'lint:oxlint' })] }).inputs),
    ).toContain('不自洽')
    const unknown = record('lint:oxlint', [], {
      failedStep: 'lint:old',
      steps: [{ name: 'lint:old', ran: true, exit: 1, seconds: 1 }],
    })
    expect(rejected(harness({ records: [unknown] }).inputs)).toContain('不在当前步骤表')
  })

  it('有多份记录时取 H1 最近一次干净的全量', () => {
    const passed = record(null, [], { startedAt: '2026-10-29T00:00:00.000Z' })
    const verdict = resumePlan(harness({ records: [passed, OXLINT_FAILED] }).inputs)
    expect(verdict.kind).toBe('resume')
  })
})

describe('退化为整次全量', () => {
  it('差异碰到全局路径：整次全量，写明文件，不问影响面', () => {
    const { inputs, requests } = harness({
      changedFiles: ['packages/b/src/x.ts', 'tsconfig.base.json'],
    })
    const verdict = resumePlan(inputs)
    expect(verdict.kind).toBe('rerun')
    if (verdict.kind === 'rerun') {
      expect(verdict.reason).toContain('tsconfig.base.json')
      expect(verdict.origin).toEqual({
        head: H1,
        tree: TREE,
        failedStep: 'lint:oxlint',
        mode: 'full',
        fullRequested: true,
      })
    }
    expect(requests).toEqual([])
  })

  it('退役目录里命中全局模式的文件不算全局；在役目录里的算', () => {
    const verdict = resumePlan(
      harness({ changedFiles: ['packages.0.0.1.legacy/x/turbo.json'] }).inputs,
    )
    expect(verdict.kind).toBe('resume')
    expect(resumePlan(harness({ changedFiles: ['packages/x/turbo.json'] }).inputs).kind).toBe(
      'rerun',
    )
  })

  it('锁文件是唯一命中的全局文件：也整次重跑，不按 importer 映射、不问影响面', () => {
    const { inputs, requests } = harness({
      changedFiles: ['pnpm-lock.yaml', 'packages/b/src/x.ts'],
    })
    const verdict = resumePlan(inputs)
    expect(verdict.kind).toBe('rerun')
    if (verdict.kind === 'rerun') expect(verdict.reason).toContain('改了全局文件 pnpm-lock.yaml')
    expect(requests).toEqual([])
  })

  it('没碰全局文件时，H1..HEAD 的改动原样交影响面函数', () => {
    const { inputs, requests } = harness({
      changedFiles: ['packages/b/src/x.ts', 'packages/b/README.md'],
    })
    expect(resumePlan(inputs).kind).toBe('resume')
    expect(requests[0]).toEqual({
      kind: 'since',
      paths: ['packages/b/README.md', 'packages/b/src/x.ts'],
    })
  })

  it('影响面函数自己判全量（有不认得的路径）：整次全量，带它的原因', () => {
    const verdict = resumePlan(
      harness({}, { ...FULL_PLAN, reason: '1 个改动文件不在任何规则里' }).inputs,
    )
    expect(verdict.kind).toBe('rerun')
    if (verdict.kind === 'rerun') expect(verdict.reason).toContain('不在任何规则里')
  })
})

describe('增量计划', () => {
  it('只在 oxlint 失败：常驻全跑；没跑到的按计划步骤整次，构建因它们而整次；轻步骤 python 整次', () => {
    const verdict = resumePlan(harness().inputs)
    expect(verdict.kind).toBe('resume')
    if (verdict.kind !== 'resume') return
    const scope = new Map(verdict.steps.map(step => [step.name, step.scope]))
    for (const name of RESIDENT) expect(scope.get(name), name).toBe('resident')
    expect(scope.get('typecheck')).toBe('whole')
    expect(scope.get('test')).toBe('whole')
    expect(scope.get('acceptance')).toBe('whole')
    expect(scope.get('build')).toBe('whole')
    expect(scope.get('python')).toBe('whole')
    expect(verdict.steps.find(step => step.name === 'python')?.why).toBe('轻步骤，按整次运行的范围')
    expect(verdict.steps.find(step => step.name === 'build')?.why).toContain('整次跑的步骤在它之后')
    expect(verdict.steps.find(step => step.name === 'test')?.why).toContain('没跑到')
    // 计划文件按步骤各取一份：整次的取全量清单，按影响面的取影响面那份。
    expect(verdict.plan.build).toEqual(FULL_PLAN.build)
    expect(verdict.plan.typecheck).toEqual(ALL)
    expect(verdict.plan.test).toEqual(ALL)
    expect(verdict.plan.acceptance).toEqual(['packages/a'])
    expect(verdict.plan.python).toEqual(FULL_PLAN.python)
    expect(verdict.plan.mode).toBe('scoped')
    expect(verdict.plan.reason).toContain('失败于 lint:oxlint')
    expect(verdict.steps.map(step => step.name)).toEqual(STEP_NAMES)
  })

  it('失败在最后一步、重步骤都通过了：重步骤只跑影响面；python 在 H1 上通过了也整次跑', () => {
    const verdict = resumePlan(harness({ records: [record('loop:status', [])] }).inputs)
    expect(verdict.kind).toBe('resume')
    if (verdict.kind !== 'resume') return
    expect(HEAVY_PLANNED).toEqual(['build', 'typecheck', 'test', 'acceptance'])
    for (const name of HEAVY_PLANNED)
      expect(verdict.steps.find(step => step.name === name)?.scope, name).toBe('narrowed')
    expect(verdict.steps.find(step => step.name === 'python')?.scope).toBe('whole')
    expect(verdict.plan.build).toEqual(AFFECTED_PLAN.build)
    expect(verdict.plan.test).toEqual(['packages/b'])
    // H1..HEAD 没碰 Python 工具（影响面那份不跑）；整次运行的范围要跑，取整次那份。
    expect(verdict.plan.python).toEqual(FULL_PLAN.python)
    expect(verdict.steps.find(step => step.name === 'loop:status')?.scope).toBe('resident')
  })

  it('失败在 python：python 整次跑，别的按计划步骤不受它牵连', () => {
    const verdict = resumePlan(harness({ records: [record('python', [])] }).inputs)
    expect(verdict.kind).toBe('resume')
    if (verdict.kind !== 'resume') return
    expect(verdict.plan.python.run).toBe(true)
    expect(verdict.steps.find(step => step.name === 'python')?.why).toContain('上失败')
    expect(verdict.steps.find(step => step.name === 'build')?.scope).toBe('narrowed')
  })

  it('失败在 test：test 整次，构建随之整次，typecheck 与验收仍按影响面', () => {
    const verdict = resumePlan(
      harness({ records: [record('test', ['acceptance', 'loop:status'])] }).inputs,
    )
    expect(verdict.kind).toBe('resume')
    if (verdict.kind !== 'resume') return
    const scope = new Map(verdict.steps.map(step => [step.name, step.scope]))
    expect(scope.get('test')).toBe('whole')
    expect(scope.get('build')).toBe('whole')
    expect(scope.get('acceptance')).toBe('whole')
    expect(scope.get('typecheck')).toBe('narrowed')
    expect(verdict.plan.typecheck).toEqual(['packages/b'])
  })

  it('H1 的记录里没有当前表新增的步骤：按没跑到处理', () => {
    const missing = record('lint:oxlint', AFTER_BUILD, {
      steps: OXLINT_FAILED.steps.filter(step => step.name !== 'python'),
    })
    const verdict = resumePlan(harness({ records: [missing] }).inputs)
    expect(verdict.kind).toBe('resume')
    if (verdict.kind === 'resume') expect(verdict.plan.python.run).toBe(true)
  })
})

describe('中间运行', () => {
  const H2 = 'f'.repeat(40)
  /** H1 之后在同一棵树上的一次接续运行，失败在 contract-check。 */
  const middle = (over: Record<string, unknown> = {}) =>
    record('contract-check', [], {
      head: H2,
      tree: 'd'.repeat(40),
      mode: 'resume',
      fullRequested: false,
      base: H1,
      resumeFrom: {
        head: H1,
        tree: TREE,
        failedStep: 'lint:oxlint',
        mode: 'full',
        fullRequested: true,
      },
      startedAt: '2026-10-30T02:00:00.000Z',
      finishedAt: '2026-10-30T02:20:00.000Z',
      ...over,
    })
  /** 影响面函数按路径前缀选成员：看得出交给它的改动集里有没有被撤回的成员。 */
  const byPaths = (request: PlanRequest): CheckPlan => {
    if (request.kind === 'whole') return FULL_PLAN
    const hit = ALL.filter(path => request.paths.some(file => file.startsWith(`${path}/`)))
    return {
      ...AFFECTED_PLAN,
      build: hit.map(path => ({ path, reason: 'selected' as const })),
      typecheck: hit,
      test: hit,
    }
  }
  /** 失败在最后一步、重步骤都通过了：构建只重建被改动影响到的成员，所以磁盘上的旧产物才要紧。 */
  const H1_LATE = record('loop:status', [])
  const withMiddle = (over: Partial<ResumeInputs>) =>
    harness({ records: [H1_LATE, middle()], plan: byPaths, ...over }).inputs
  const resumed = (inputs: ResumeInputs) => {
    const verdict = resumePlan(inputs)
    if (verdict.kind !== 'resume') throw new Error(`不是接续：${JSON.stringify(verdict)}`)
    return verdict
  }

  it('评审反例：中间运行重建过 a、HEAD 撤回了 a：计划的构建含 a', () => {
    const verdict = resumed(withMiddle({ intermediateChanges: { [H2]: ['packages/a/src/y.ts'] } }))
    expect(verdict.plan.build.map(entry => entry.path)).toEqual(['packages/a', 'packages/b'])
    expect(verdict.intermediate).toEqual({ heads: [H2], added: ['packages/a/src/y.ts'] })
    expect(verdict.changedFiles).toEqual(['packages/b/src/x.ts'])
  })

  it('中间运行的头到 HEAD 没改过的成员不补进', () => {
    const verdict = resumed(withMiddle({ intermediateChanges: { [H2]: ['packages/b/src/x.ts'] } }))
    expect(verdict.plan.build.map(entry => entry.path)).toEqual(['packages/b'])
    expect(verdict.intermediate.added).toEqual([])
  })

  it('中间运行带未提交改动：整次重跑，原因写未提交改动与它的头', () => {
    const verdict = resumePlan(
      withMiddle({ records: [H1_LATE, middle({ dirty: true })], intermediateChanges: {} }),
    )
    expect(verdict.kind).toBe('rerun')
    if (verdict.kind === 'rerun') {
      expect(verdict.reason).toContain('未提交改动')
      expect(verdict.reason).toContain(H2.slice(0, 9))
    }
  })

  it('中间运行的头算不出差异（标「算不出」或没给）：整次重跑，写明头', () => {
    for (const intermediateChanges of [{ [H2]: 'unknown' as const }, {}]) {
      const verdict = resumePlan(withMiddle({ intermediateChanges }))
      expect(verdict.kind).toBe('rerun')
      if (verdict.kind === 'rerun') expect(verdict.reason).toContain(H2.slice(0, 9))
    }
  })

  it('中间运行补进的改动碰到全局路径：整次重跑', () => {
    const verdict = resumePlan(
      withMiddle({ intermediateChanges: { [H2]: ['tsconfig.base.json'] } }),
    )
    expect(verdict.kind).toBe('rerun')
    if (verdict.kind === 'rerun') expect(verdict.reason).toContain('tsconfig.base.json')
  })

  it('没有中间运行（早于 H1 结束、别的工作树的记录都不算）：计划与只有 H1 记录时相同', () => {
    const before = middle({
      startedAt: '2026-10-30T00:10:00.000Z',
      finishedAt: '2026-10-30T00:20:00.000Z',
    })
    const elsewhere = middle({ worktree: '/other/tree' })
    const plain = harness({ records: [H1_LATE], plan: byPaths }).inputs
    const noisy = harness({ records: [H1_LATE, before, elsewhere], plan: byPaths }).inputs
    expect(resumePlan(noisy)).toEqual(resumePlan(plain))
    expect(resumed(plain).intermediate).toEqual({ heads: [], added: [] })
  })

  it('中间运行是非准入记录（手工 pnpm run check）：同样补建它改过的成员', () => {
    const verdict = resumed(
      withMiddle({
        records: [H1_LATE, middle({ admission: false })],
        intermediateChanges: { [H2]: ['packages/a/src/y.ts'] },
      }),
    )
    expect(verdict.plan.build.map(entry => entry.path)).toEqual(['packages/a', 'packages/b'])
    expect(verdict.intermediate.heads).toEqual([H2])
  })

  it('证据多一行：次数、各自的头与补进的文件', () => {
    const inputs = withMiddle({ intermediateChanges: { [H2]: ['packages/a/src/y.ts'] } })
    const text = describeResume(resumePlan(inputs), HEAD).join('\n')
    expect(text).toContain(`中间运行 1 次（头 ${H2.slice(0, 9)}）`)
    expect(text).toContain('补进 packages/a/src/y.ts')
  })
})

describe('H1 按影响面准入', () => {
  // H1 的影响面（合并点..H1）与 H1..HEAD 的影响面合起来就是 HEAD 相对本次基线的影响面，所以接续的范围不比 H1 宽。
  it('合并点与本次相同：接受；没跑到的步骤按本次基线的影响面整次跑，不取全量', () => {
    const { inputs, requests } = harness({ records: [OXLINT_FAILED_AFFECTED] })
    const verdict = resumePlan(inputs)
    expect(verdict.kind).toBe('resume')
    if (verdict.kind !== 'resume') return
    expect(verdict.scope).toEqual({ mode: 'affected', ref: 'main', mergeBase: MB })
    expect(requests).toContainEqual({ kind: 'whole', mode: 'affected' })
    expect(requests).not.toContainEqual({ kind: 'whole', mode: 'full' })
    expect(verdict.steps.find(step => step.name === 'test')?.scope).toBe('whole')
    expect(verdict.plan.test).toEqual(BASE_PLAN.test)
    expect(verdict.plan.build).toEqual(BASE_PLAN.build)
    expect(verdict.plan.typecheck).toEqual(BASE_PLAN.typecheck)
    expect(verdict.plan.python).toEqual(BASE_PLAN.python)
    expect(verdict.plan.reason).toContain('影响面准入（失败于 lint:oxlint）')
    const text = describeResume(verdict, HEAD)
    expect(text[0]).toBe(
      `准入证据：${H1.slice(0, 9)} 影响面准入（失败于 lint:oxlint）＋ ${HEAD.slice(0, 9)} 增量（基线 ${H1.slice(0, 9)}）`,
    )
    expect(text[1]).toContain(`main，合并点 ${MB.slice(0, 9)}`)
    expect(text.find(line => line.startsWith('  整次（本次基线的影响面）：'))).toContain('test（')
  })

  it('碰到全局路径时按 H1 的范围整次重跑：按本次基线的影响面，不是整次全量', () => {
    const verdict = resumePlan(
      harness({ records: [OXLINT_FAILED_AFFECTED], changedFiles: ['package.json'] }).inputs,
    )
    expect(verdict.kind).toBe('rerun')
    if (verdict.kind === 'rerun') expect(verdict.scope.mode).toBe('affected')
    const text = describeResume(verdict, HEAD)
    expect(text[0]).toContain('影响面准入（失败于 lint:oxlint）不接续')
    expect(text[0]).toContain('整次按本次基线的影响面')
    expect(text[0]).not.toContain('整次全量')
  })

  it('记录的基线合并点与本次不同，或没写基线：拒绝并写明两个合并点', () => {
    const other = 'f'.repeat(40)
    const moved = rejected(
      harness({
        records: [
          record('lint:oxlint', AFTER_BUILD, {
            mode: 'affected',
            base: other,
            fullRequested: false,
          }),
        ],
      }).inputs,
    )
    expect(moved).toContain(other.slice(0, 9))
    expect(moved).toContain(`本次基线 main 的合并点是 ${MB.slice(0, 9)}`)
    expect(
      rejected(
        harness({
          records: [
            record('lint:oxlint', AFTER_BUILD, {
              mode: 'affected',
              base: null,
              fullRequested: false,
            }),
          ],
        }).inputs,
      ),
    ).toContain('（没写）')
  })
})

describe('接续不链式', () => {
  // 接续记录本身形状完整、快速失败在 check:docs：被误当 H1 时会接续成功，只是失败步骤不同。
  const resumed = (over: Record<string, unknown> = {}) =>
    record('check:docs', AFTER_BUILD, {
      mode: 'resume',
      base: 'd'.repeat(40),
      fullRequested: false,
      resumeFrom: {
        head: 'd'.repeat(40),
        tree: TREE,
        failedStep: 'test',
        mode: 'full',
        fullRequested: true,
      },
      ...over,
    })

  it('H1 只有接续运行的记录：拒绝并说明', () => {
    expect(rejected(harness({ records: [resumed()] }).inputs)).toContain('接续不链式')
  })

  it('H1 上同时有更晚的接续记录与一次整次准入：取整次准入那份', () => {
    const verdict = resumePlan(
      harness({
        records: [OXLINT_FAILED, resumed({ startedAt: '2026-10-31T00:00:00.000Z' })],
        // 更晚的接续记录是中间运行：它的头到 HEAD 的差异要给。
        intermediateChanges: { [H1]: [] },
      }).inputs,
    )
    expect(verdict.kind).toBe('resume')
    if (verdict.kind === 'resume') expect(verdict.origin.failedStep).toBe('lint:oxlint')
  })
})

describe('证据文本', () => {
  it('接续：「H1 全量（失败于 X）＋ HEAD 增量（基线 H1）」，步骤按怎么跑分组，附差异清单', () => {
    const verdict = resumePlan(
      harness({ changedFiles: ['packages/b/src/x.ts', 'packages/b/README.md'] }).inputs,
    )
    const text = describeResume(verdict, HEAD)
    expect(text[0]).toBe(
      `准入证据：${H1.slice(0, 9)} 全量（失败于 lint:oxlint）＋ ${HEAD.slice(0, 9)} 增量（基线 ${H1.slice(0, 9)}）`,
    )
    expect(text).toContain(`${H1.slice(0, 9)}..${HEAD.slice(0, 9)} 差异 2 个文件：`)
    expect(text.slice(-2)).toEqual(['  packages/b/README.md', '  packages/b/src/x.ts'])
    expect(text.find(line => line.startsWith('  整次：'))).toContain('test（')
    expect(text.find(line => line.startsWith('  整次：'))).toContain('python（轻步骤')
    expect(text.find(line => line.startsWith('  常驻：'))).toContain('lint:oxlint（')
    expect(text).toContain(`${H1.slice(0, 9)} 运行时的缓存：测试 off、依赖图 off、变异 unknown`)
  })

  it('退化：写明不接续与原因；拒绝：写明原因', () => {
    const full = describeResume(
      resumePlan(harness({ changedFiles: ['package.json'] }).inputs),
      HEAD,
    )
    expect(full[0]).toContain('不接续')
    expect(full[0]).toContain('package.json')
    expect(full[1]).toContain('差异 1 个文件')
    expect(describeResume(resumePlan(harness({ dirty: true }).inputs), HEAD)).toEqual([
      '拒绝接续：工作树有未提交改动：先提交或清掉，再接续',
    ])
  })
})

// 每条用例在 beforeEach 建一棵临时仓库、再起多个 git 子进程：空闲时约 1 秒，负载下量到 6.5 秒
// （2026-11-01 准入），超过 vitest 默认的 5 秒。时限按负载下成本的三倍写明，钩子同样，不改断言。
describe('取 git 事实', { timeout: 20_000 }, () => {
  let repo: string
  const run = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: repo,
      env: repositoryEnv(process.env),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  const commit = (message: string) =>
    run(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.com',
      'commit',
      '-q',
      '--no-gpg-sign',
      '-m',
      message,
    )
  beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'omne-resume-git-')))
    run('init', '-q', '-b', 'main')
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    run('add', '.')
    commit('one')
  }, 20_000)
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('祖先、树哈希、H1..HEAD 的改动与未提交改动都从仓库取；不是提交的引用报错', () => {
    const first = run('rev-parse', 'HEAD')
    writeFileSync(join(repo, 'b.txt'), 'b\n')
    run('add', '.')
    commit('two')
    const facts = resumeFacts(repo, first.slice(0, 7), first)
    expect(facts.from).toBe(first)
    expect(facts.head).toBe(run('rev-parse', 'HEAD'))
    expect(facts.fromTree).toBe(run('rev-parse', `${first}^{tree}`))
    expect(facts.headTree).toBe(run('rev-parse', 'HEAD^{tree}'))
    expect(facts.fromTree).not.toBe(facts.headTree)
    expect(facts.isAncestor).toBe(true)
    expect(facts.changedFiles).toEqual(['b.txt'])
    expect(facts.dirty).toBe(false)
    // 本次基线与 HEAD 的合并点：基线是 HEAD 的祖先时就是它自己。
    expect(facts.base).toEqual({ ref: first, mergeBase: first })
    writeFileSync(join(repo, 'c.txt'), 'c\n')
    expect(resumeFacts(repo, first, 'main').dirty).toBe(true)
    expect(() => resumeFacts(repo, 'no-such-ref', 'main')).toThrow()
    expect(() => resumeFacts(repo, first, 'no-such-base')).toThrow()
  })

  it('skip-worktree 与 assume-unchanged 的文件改了内容也算 dirty（status 看不到）', () => {
    const first = run('rev-parse', 'HEAD')
    for (const flag of ['--skip-worktree', '--assume-unchanged']) {
      run('update-index', flag, 'a.txt')
      writeFileSync(join(repo, 'a.txt'), `changed ${flag}\n`)
      expect(run('status', '--porcelain')).toBe('')
      expect(resumeFacts(repo, first, 'main').dirty).toBe(true)
      expect(changedDuringRun(repo, first)).toBe(true)
      run('update-index', flag.replace('--', '--no-'), 'a.txt')
      run('checkout', '--', 'a.txt')
      expect(resumeFacts(repo, first, 'main').dirty).toBe(false)
    }
  })

  it('中间运行的头到 HEAD 的改动从仓库取；头不在仓库里记算不出', () => {
    const first = run('rev-parse', 'HEAD')
    writeFileSync(join(repo, 'b.txt'), 'b\n')
    run('add', '.')
    commit('two')
    const second = run('rev-parse', 'HEAD')
    writeFileSync(join(repo, 'c.txt'), 'c\n')
    run('add', '.')
    commit('three')
    const gone = 'f'.repeat(40)
    const origin = record('lint:oxlint', [], {
      head: first,
      tree: run('rev-parse', `${first}^{tree}`),
    })
    const later = (head: string) =>
      record('contract-check', [], {
        head,
        mode: 'resume',
        fullRequested: false,
        base: first,
        resumeFrom: {
          head: first,
          tree: TREE,
          failedStep: 'lint:oxlint',
          mode: 'full',
          fullRequested: true,
        },
        startedAt: '2026-10-30T02:00:00.000Z',
        finishedAt: '2026-10-30T02:20:00.000Z',
      })
    const facts = resumeFacts(repo, first, 'main', {
      records: [origin, later(second), later(gone)],
      worktree: WORKTREE,
    })
    expect(facts.intermediateChanges).toEqual({ [second]: ['c.txt'], [gone]: 'unknown' })
    expect(resumeFacts(repo, first, 'main').intermediateChanges).toEqual({})
  })

  it('结束时重新核对现场：头变了或有未提交改动才算变了，被忽略的文件不算', () => {
    writeFileSync(join(repo, '.gitignore'), 'tmp/\n')
    run('add', '.')
    commit('ignore tmp')
    const start = run('rev-parse', 'HEAD')
    expect(changedDuringRun(repo, start)).toBe(false)
    mkdirSync(join(repo, 'tmp'))
    writeFileSync(join(repo, 'tmp/run.json'), '{}\n')
    expect(changedDuringRun(repo, start)).toBe(false)
    writeFileSync(join(repo, 'stray.txt'), 'x\n')
    expect(changedDuringRun(repo, start)).toBe(true)
    rmSync(join(repo, 'stray.txt'))
    writeFileSync(join(repo, 'a.txt'), 'changed\n')
    expect(changedDuringRun(repo, start)).toBe(true)
    run('add', '.')
    commit('during the run')
    expect(changedDuringRun(repo, start)).toBe(true)
  })

  it('另一条分支上的提交不是祖先', () => {
    const first = run('rev-parse', 'HEAD')
    run('checkout', '-q', '-b', 'side')
    writeFileSync(join(repo, 's.txt'), 's\n')
    run('add', '.')
    commit('side')
    const side = run('rev-parse', 'HEAD')
    run('checkout', '-q', 'main')
    writeFileSync(join(repo, 'm.txt'), 'm\n')
    run('add', '.')
    commit('main two')
    expect(resumeFacts(repo, side, 'main').isAncestor).toBe(false)
    expect(resumeFacts(repo, first, 'main').isAncestor).toBe(true)
    // 本次基线在另一条分支上：合并点是分叉处。
    expect(resumeFacts(repo, first, side).base.mergeBase).toBe(first)
    // 同一个提交也算祖先：接续时差异为空。
    const same = resumeFacts(repo, 'HEAD', 'main')
    expect(same.isAncestor).toBe(true)
    expect(same.changedFiles).toEqual([])
  })
})
