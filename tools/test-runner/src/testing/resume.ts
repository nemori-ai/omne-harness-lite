// `check --resume-from <H1>`：H1 上跑过一次全量准入、快速失败在第 X 步，修复后在 HEAD 上接着跑。
// 这里只做判断，不跑任何步骤：前提校验（哪一条不满足都拒绝）、全局路径退化为整次全量、增量计划（每一步怎么跑）
// 与证据文本。全部输入由调用方给（git 事实、记录、步骤表、全局路径、lockfile 判定与影响面函数），
// 本模块是纯函数；`resumeFacts` 单独取 git 事实。
//
// 增量计划的原则是「H1 没跑到的检查，HEAD 上整次跑」：没有一个步骤只因为 H1 的记录里没有失败就少跑。
// - 常驻步骤（非 `planned`）每次都跑整仓，照旧。
// - 按计划的步骤（python、build、typecheck、test、acceptance）：X 与 H1 上没跑到的整次跑（选中全部成员）；
//   H1 上通过了的只跑 H1..HEAD 影响到的成员。整次跑的步骤需要它前面（`after`，传递）的按计划步骤也整次跑：
//   成员测试与验收读构建出来的 dist，缩了构建范围就会读到旧产物或读不到。
// - H1..HEAD 碰到全局路径时不接续，整次全量；`pnpm-lock.yaml` 是唯一命中时交 lockfile 判定（切片 11）决定。
import { isLegacyFile } from '@omne-harness/repo-toolchain/core/check-scope'
import { git, nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import type { AdmissionRun, CacheStates, ResumeOrigin } from './admission-run.ts'
import { latestCleanFullRun } from './admission-run.ts'
import type { CheckStep } from './check-graph.ts'
import { LOCKFILE_PATH, patternToRegExp, sample, type CheckPlan } from './scope.ts'

/** lockfile 判定（切片 11 的模块）的结论；只在 `pnpm-lock.yaml` 是唯一命中的全局文件时才问它。 */
export type LockfileVerdict =
  | { readonly kind: 'members'; readonly members: ReadonlySet<string>; readonly reason: string }
  | { readonly kind: 'full'; readonly reason: string }
  | { readonly kind: 'none'; readonly reason: string }

export type LockfileJudge = () => LockfileVerdict

/** 向影响面函数要一份计划：整次，或按 H1..HEAD 的改动文件（lockfile 映射到的成员另给）。 */
export type PlanRequest =
  | { readonly full: true }
  | {
      readonly full: false
      readonly paths: readonly string[]
      readonly lockfileMembers: ReadonlySet<string>
    }

export type Planner = (request: PlanRequest) => CheckPlan

export interface ResumeInputs {
  /** H1，40 位。 */
  readonly from: string
  /** `git rev-parse H1^{tree}`，与记录的 `tree` 核对。 */
  readonly fromTree: string
  readonly head: string
  readonly dirty: boolean
  /** H1 是 HEAD 的祖先（含相等）。 */
  readonly isAncestor: boolean
  /** H1..HEAD 改动的仓库相对路径。 */
  readonly changedFiles: readonly string[]
  /** 检出里能找到的全部准入记录；由本模块挑 H1 的。 */
  readonly records: readonly AdmissionRun[]
  readonly globalPaths: readonly string[]
  readonly judgeLockfile: LockfileJudge
  readonly steps: readonly CheckStep[]
  readonly plan: Planner
}

export type StepScope = 'full' | 'affected' | 'resident'

export interface ResumeStep {
  readonly name: string
  readonly scope: StepScope
  readonly why: string
}

export type ResumeVerdict =
  | { readonly kind: 'rejected'; readonly reason: string }
  | {
      readonly kind: 'full'
      readonly reason: string
      readonly origin: ResumeOrigin
      readonly changedFiles: readonly string[]
    }
  | {
      readonly kind: 'resume'
      readonly origin: ResumeOrigin
      /** H1 那次运行时各缓存的状态，原样带进证据；不据它拒绝。 */
      readonly caches: CacheStates
      readonly steps: readonly ResumeStep[]
      /** 写进 `tmp/check-plan/plan.json` 给各 `step` 命令读的计划：按步骤各取整次或影响面的那一份。 */
      readonly plan: CheckPlan
      readonly changedFiles: readonly string[]
      /** lockfile 判定给出的说明；没问它时没有。 */
      readonly lockfile?: string
    }

const short = (sha: string) => sha.slice(0, 9)

type Prerequisites =
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'ok'; readonly record: AdmissionRun; readonly failedStep: string }

/** 前提校验：每一条都明说原因；顺序是先看现场，再看记录。 */
function prerequisites(inputs: ResumeInputs): Prerequisites {
  const from = short(inputs.from)
  if (inputs.dirty) return { kind: 'rejected', reason: '工作树有未提交改动：先提交或清掉，再接续' }
  if (!inputs.isAncestor)
    return { kind: 'rejected', reason: `${from} 不是 HEAD ${short(inputs.head)} 的祖先` }
  const record = latestCleanFullRun(inputs.records, inputs.from)
  if (record === undefined) {
    const fulls = inputs.records.filter(run => run.head === inputs.from && run.mode === 'full')
    const reason = fulls.some(run => !run.admission)
      ? `${from} 的全量记录不是准入运行（没有 OMNE_ADMISSION=1），不能接续`
      : fulls.some(run => run.dirty)
        ? `${from} 只有带未提交改动的全量准入记录，不是对它的证据`
        : `${from} 没有全量准入记录（tmp/admission/*.json 或 tmp/check-run/*/run.json）`
    return { kind: 'rejected', reason }
  }
  if (record.tree !== inputs.fromTree)
    return {
      kind: 'rejected',
      reason: `${from} 的记录写的树 ${short(record.tree)} 与它实际的树 ${short(inputs.fromTree)} 不符`,
    }
  if (record.failedStep === null)
    return {
      kind: 'rejected',
      reason: `${from} 的全量准入没有失败步骤${record.steps.every(step => step.ran) ? '（全部通过）' : '（有步骤没跑完）'}，没有可接续的步`,
    }
  const failed = record.steps.find(step => step.name === record.failedStep)
  if (failed === undefined || !failed.ran || failed.exit === 0)
    return {
      kind: 'rejected',
      reason: `${from} 的记录不自洽：失败步骤 ${record.failedStep} 在步骤表里没有对应的失败结果`,
    }
  const others = record.steps
    .filter(step => step.name !== record.failedStep && step.ran && step.exit !== 0)
    .map(step => step.name)
  if (others.length > 0)
    return {
      kind: 'rejected',
      reason: `${from} 的全量准入除 ${record.failedStep} 外还有步骤没通过：${others.join('、')}`,
    }
  if (!inputs.steps.some(step => step.name === record.failedStep))
    return {
      kind: 'rejected',
      reason: `${from} 失败的步骤 ${record.failedStep} 不在当前步骤表里`,
    }
  return { kind: 'ok', record, failedStep: record.failedStep }
}

/** 碰到的全局文件（退役目录里的不算）。 */
function globalHits(paths: readonly string[], globalPaths: readonly string[]): string[] {
  const patterns = globalPaths.map(patternToRegExp)
  return paths.filter(path => !isLegacyFile(path) && patterns.some(pattern => pattern.test(path)))
}

/** 整次跑的按计划步骤，连同它们前面（传递）的按计划步骤。 */
function fullScopeSteps(
  steps: readonly CheckStep[],
  record: AdmissionRun,
  failedStep: string,
): Set<string> {
  const byName = new Map(steps.map(step => [step.name, step]))
  const ranAt = new Map(record.steps.map(step => [step.name, step]))
  const seeds = steps.filter(step => {
    if (step.planned !== true) return false
    const at = ranAt.get(step.name)
    return step.name === failedStep || at === undefined || !at.ran
  })
  const full = new Set<string>()
  const visit = (name: string) => {
    const step = byName.get(name)
    if (step === undefined) return
    if (step.planned === true) full.add(name)
    for (const before of step.after) visit(before)
  }
  for (const seed of seeds) visit(seed.name)
  return full
}

/** 整次跑的理由：自己失败、自己没跑到，或者它之后有整次跑的步骤（它们读它的产物）。 */
function whyFull(record: AdmissionRun, failedStep: string, name: string): string {
  if (name === failedStep) return `${short(record.head)} 上失败`
  const at = record.steps.find(step => step.name === name)
  if (at === undefined || !at.ran) return `${short(record.head)} 上没跑到`
  return `${short(record.head)} 上通过，但整次跑的步骤在它之后`
}

const PLANNED_LISTS = ['build', 'typecheck', 'test', 'acceptance'] as const

/** 按步骤各取整次或影响面的那一份，合成一份计划文件。 */
function composePlan(
  full: CheckPlan,
  affected: CheckPlan,
  fullScope: ReadonlySet<string>,
  origin: ResumeOrigin,
  steps: readonly ResumeStep[],
): CheckPlan {
  const pick = <K extends (typeof PLANNED_LISTS)[number]>(key: K): CheckPlan[K] =>
    fullScope.has(key) ? full[key] : affected[key]
  const planned = steps.filter(step => step.scope !== 'resident')
  const describe = (scope: StepScope) =>
    planned
      .filter(step => step.scope === scope)
      .map(step => step.name)
      .join('、')
  return {
    mode: 'scoped',
    reason:
      `接续 ${short(origin.head)} 的全量准入（失败于 ${origin.failedStep}）：` +
      `整次 ${describe('full') || '无'}；按 ${short(origin.head)}..HEAD 影响面 ${describe('affected') || '无'}`,
    files: affected.files,
    members: affected.members,
    build: pick('build'),
    typecheck: pick('typecheck'),
    test: pick('test'),
    acceptance: pick('acceptance'),
    python: fullScope.has('python')
      ? { run: true, reason: `${short(origin.head)} 上没跑到或失败，整次跑` }
      : affected.python,
    ...(affected.documentsOnly === undefined ? {} : { documentsOnly: affected.documentsOnly }),
  }
}

/** 三种结论之一：拒绝并给原因；退化为整次全量并给原因；增量计划。 */
export function resumePlan(inputs: ResumeInputs): ResumeVerdict {
  const checked = prerequisites(inputs)
  if (checked.kind === 'rejected') return checked
  const { record, failedStep } = checked
  const origin: ResumeOrigin = { head: record.head, tree: record.tree, failedStep }
  const changedFiles = [...new Set(inputs.changedFiles)].sort()
  const full = (reason: string): ResumeVerdict => ({ kind: 'full', reason, origin, changedFiles })

  const hits = globalHits(changedFiles, inputs.globalPaths)
  let paths: readonly string[] = changedFiles
  let lockfileMembers: ReadonlySet<string> = new Set()
  let lockfile: string | undefined
  if (hits.length === 1 && hits[0] === LOCKFILE_PATH) {
    const verdict = inputs.judgeLockfile()
    if (verdict.kind === 'full') return full(`${LOCKFILE_PATH} 有改动：${verdict.reason}`)
    lockfile = verdict.reason
    paths = changedFiles.filter(path => path !== LOCKFILE_PATH)
    if (verdict.kind === 'members') lockfileMembers = verdict.members
  } else if (hits.length > 0)
    return full(`${short(origin.head)}..HEAD 改了全局文件 ${sample(hits)}`)

  const affected = inputs.plan({ full: false, paths, lockfileMembers })
  if (affected.mode === 'full')
    return full(`${short(origin.head)}..HEAD 的影响面判全量：${affected.reason}`)
  const fullScope = fullScopeSteps(inputs.steps, record, failedStep)
  const steps = inputs.steps.map((step): ResumeStep => {
    if (step.planned !== true) return { name: step.name, scope: 'resident', why: '常驻，整仓' }
    if (fullScope.has(step.name))
      return { name: step.name, scope: 'full', why: whyFull(record, failedStep, step.name) }
    return { name: step.name, scope: 'affected', why: `${short(record.head)} 上通过` }
  })
  const plan = composePlan(inputs.plan({ full: true }), affected, fullScope, origin, steps)
  return {
    kind: 'resume',
    origin,
    caches: record.caches,
    steps,
    plan,
    changedFiles,
    ...(lockfile === undefined ? {} : { lockfile }),
  }
}

const SCOPE_NAMES: Readonly<Record<StepScope, string>> = {
  full: '整次',
  affected: '按影响面',
  resident: '常驻',
}

function changedLines(label: string, changedFiles: readonly string[]): string[] {
  return [
    `${label} 差异 ${changedFiles.length} 个文件${changedFiles.length === 0 ? '' : '：'}`,
    ...changedFiles.map(path => `  ${path}`),
  ]
}

/** 证据文本：「H1 全量（失败于 X）＋ HEAD 增量（基线 H1）」，附差异文件清单；退化与拒绝各有自己的说法。 */
export function describeResume(verdict: ResumeVerdict, head: string): string[] {
  if (verdict.kind === 'rejected') return [`拒绝接续：${verdict.reason}`]
  const from = short(verdict.origin.head)
  const range = `${from}..${short(head)}`
  if (verdict.kind === 'full')
    return [
      `准入证据：${from} 全量（失败于 ${verdict.origin.failedStep}）不接续，${short(head)} 整次全量——${verdict.reason}`,
      ...changedLines(range, verdict.changedFiles),
    ]
  const groups = (['full', 'affected', 'resident'] as const).flatMap(scope => {
    const names = verdict.steps.filter(step => step.scope === scope)
    if (names.length === 0) return []
    const detail = names.map(step => `${step.name}（${step.why}）`).join('、')
    return [`  ${SCOPE_NAMES[scope]}：${detail}`]
  })
  return [
    `准入证据：${from} 全量（失败于 ${verdict.origin.failedStep}）＋ ${short(head)} 增量（基线 ${from}）`,
    '步骤：',
    ...groups,
    `${from} 运行时的缓存：测试 ${verdict.caches.test}、依赖图 ${verdict.caches.depGraph}、变异 ${verdict.caches.mutation}`,
    ...(verdict.lockfile === undefined ? [] : [`lockfile：${verdict.lockfile}`]),
    ...changedLines(range, verdict.changedFiles),
  ]
}

export interface ResumeFacts {
  readonly from: string
  readonly fromTree: string
  readonly head: string
  readonly headTree: string
  readonly dirty: boolean
  readonly isAncestor: boolean
  readonly changedFiles: readonly string[]
}

/** `git merge-base --is-ancestor`：0 是，1 不是，别的退出码照常抛出。 */
function isAncestorOf(root: string, ancestor: string, descendant: string): boolean {
  try {
    git(root, ['merge-base', '--is-ancestor', ancestor, descendant])
    return true
  } catch (error) {
    if ((error as { status?: unknown }).status === 1) return false
    throw error
  }
}

/** 从检出取接续要的 git 事实；`fromRef` 不是提交就抛错（调用方以 2 退出）。改动只看已提交的 H1..HEAD。 */
export function resumeFacts(root: string, fromRef: string): ResumeFacts {
  const from = git(root, ['rev-parse', '--verify', `${fromRef}^{commit}`])
  const head = git(root, ['rev-parse', 'HEAD'])
  return {
    from,
    fromTree: git(root, ['rev-parse', `${from}^{tree}`]),
    head,
    headTree: git(root, ['rev-parse', 'HEAD^{tree}']),
    dirty: git(root, ['status', '--porcelain']) !== '',
    isAncestor: isAncestorOf(root, from, head),
    changedFiles: nulSeparated(
      git(root, ['diff', '--no-renames', '--name-only', '-z', from, head]),
    ).sort(),
  }
}
