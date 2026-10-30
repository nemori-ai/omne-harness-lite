// `check --resume-from <H1>`：H1 上跑过一次准入（全量，或按本次基线的影响面）、快速失败在第 X 步，修复后在 HEAD 上接着跑。
// 这里只做判断，不跑任何步骤：前提校验（哪一条不满足都拒绝）、全局路径退化为整次重跑、增量计划（每一步怎么跑）
// 与证据文本。全部输入由调用方给（git 事实、记录、步骤表、全局路径与影响面函数），
// 本模块是纯函数；`resumeFacts` 单独取 git 事实。规则归 docs/engineering/integration.md「增量准入」。
//
// 增量计划的原则是「H1 没跑到的检查与全部轻步骤，HEAD 上按 H1 那次的范围整次跑」：没有一个步骤只因为 H1 的记录里没有失败就少跑，
// 也没有一个步骤比 H1 那次的范围宽。
// - 常驻步骤（非 `planned`）每次都跑整仓，照旧。
// - 按计划的轻步骤（python）整次跑。
// - 按计划的重步骤（build、typecheck、test、acceptance）：X 与 H1 上没跑到的整次跑——H1 全量就选全部成员，
//   H1 按影响面就选 HEAD 相对本次基线的影响面；H1 上通过了的只跑 H1..HEAD 影响到的成员。整次跑的步骤需要它前面
//   （`after`，传递）的按计划步骤也整次跑：成员测试与验收读构建出来的 dist，缩了构建范围就会读到旧产物或读不到。
//   收窄的构建只重建 H1..HEAD 影响到的成员，其余 dist 是 H1 那次留在磁盘上的，所以只在 H1 那次的工作树里接续。
// - H1 按影响面时，它的基线合并点必须就是本次的：H1 的影响面（合并点..H1）与 H1..HEAD 的影响面合起来，
//   才覆盖 HEAD 相对本次基线的影响面（合并点..HEAD）。
// - H1..HEAD 碰到全局路径（锁文件也是）时不接续，按 H1 那次的范围整次重跑；锁文件的按 importer 映射只用于普通的影响面计划。
// - 接续运行的记录（`mode: resume`）不作 H1：接续不链式。
import { isLegacyFile } from '@omne-harness/repo-toolchain/core/check-scope'
import { git, nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import type { AdmissionRun, CacheStates, ResumeOrigin } from './admission-run.ts'
import { latestResumeOrigin } from './admission-run.ts'
import type { CheckStep } from './check-graph.ts'
import { patternToRegExp, sample, type CheckPlan } from './scope.ts'

/** H1 那次准入的范围：全量，或按本次基线（`ref`，合并点 `mergeBase`）的影响面。 */
export type OriginScope =
  | { readonly mode: 'full' }
  | { readonly mode: 'affected'; readonly ref: string; readonly mergeBase: string }

/**
 * 向影响面函数要一份计划：
 * - `whole`：HEAD 上按 H1 那次的范围整次算——`full` 是 `FULL=1` 的计划，`affected` 是 HEAD 相对本次基线的影响面；
 * - `since`：只按 H1..HEAD 的改动文件（不含全局文件：碰到全局文件时不接续）。
 */
export type PlanRequest =
  | { readonly kind: 'whole'; readonly mode: OriginScope['mode'] }
  | { readonly kind: 'since'; readonly paths: readonly string[] }

export type Planner = (request: PlanRequest) => CheckPlan

export interface ResumeInputs {
  /** H1，40 位。 */
  readonly from: string
  /** `git rev-parse H1^{tree}`，与记录的 `tree` 核对。 */
  readonly fromTree: string
  readonly head: string
  /** 本次运行所在工作树的根；与 H1 记录的 `worktree` 比，不同就拒绝。 */
  readonly worktree: string
  /** 本次基线（统一规则取到的）与它和 HEAD 的合并点；H1 按影响面准入时，它记下的基线必须是同一个合并点。 */
  readonly base: { readonly ref: string; readonly mergeBase: string }
  readonly dirty: boolean
  /** H1 是 HEAD 的祖先（含相等）。 */
  readonly isAncestor: boolean
  /** H1..HEAD 改动的仓库相对路径。 */
  readonly changedFiles: readonly string[]
  /** 检出里能找到的全部准入记录；由本模块挑 H1 的。 */
  readonly records: readonly AdmissionRun[]
  readonly globalPaths: readonly string[]
  readonly steps: readonly CheckStep[]
  readonly plan: Planner
}

/** `whole` 按 H1 那次的范围整次跑；`narrowed` 只跑 H1..HEAD 影响到的成员（只有 H1 上通过了的重步骤）；`resident` 常驻、整仓。 */
export type StepScope = 'whole' | 'narrowed' | 'resident'

export interface ResumeStep {
  readonly name: string
  readonly scope: StepScope
  readonly why: string
}

export type ResumeVerdict =
  | { readonly kind: 'rejected'; readonly reason: string }
  | {
      /** 不接续，HEAD 上按 H1 那次的范围整次重跑。 */
      readonly kind: 'rerun'
      readonly reason: string
      readonly origin: ResumeOrigin
      readonly scope: OriginScope
      readonly changedFiles: readonly string[]
    }
  | {
      readonly kind: 'resume'
      readonly origin: ResumeOrigin
      readonly scope: OriginScope
      /** H1 那次运行时各缓存的状态，原样带进证据；不据它拒绝。 */
      readonly caches: CacheStates
      readonly steps: readonly ResumeStep[]
      /** 写进 `tmp/check-plan/plan.json` 给各 `step` 命令读的计划：按步骤各取整次或 H1..HEAD 影响面的那一份。 */
      readonly plan: CheckPlan
      readonly changedFiles: readonly string[]
    }

const short = (sha: string) => sha.slice(0, 9)

type Prerequisites =
  | { readonly kind: 'rejected'; readonly reason: string }
  | {
      readonly kind: 'ok'
      readonly record: AdmissionRun
      readonly failedStep: string
      readonly scope: OriginScope
    }

/** H1 那次准入的说法：证据里用。 */
const originLabel = (scope: OriginScope) => (scope.mode === 'full' ? '全量' : '影响面准入')

/** H1 没有能作起点的记录时，说清是哪一种。 */
function missingOrigin(records: readonly AdmissionRun[], from: string): string {
  const own = records.filter(run => run.head === from)
  const started = own.filter(run => run.mode !== 'resume')
  if (started.some(run => !run.admission))
    return `${short(from)} 的记录不是准入运行（没有 OMNE_ADMISSION=1），不能接续`
  if (started.some(run => run.dirty))
    return `${short(from)} 只有带未提交改动的准入记录，不是对它的证据`
  if (own.some(run => run.mode === 'resume'))
    return `${short(from)} 只有接续运行（mode: resume）的记录：接续不链式，H1 要是一次整次准入（全量或按影响面）`
  return `${short(from)} 没有准入记录（tmp/admission/*.json 或 tmp/check-run/*/run.json）`
}

/** H1 那次的范围；按影响面时它的基线合并点要与本次相同，否则拒绝。 */
function scopeOf(
  record: AdmissionRun,
  base: ResumeInputs['base'],
): OriginScope | { readonly rejected: string } {
  if (record.mode !== 'affected') return { mode: 'full' }
  if (record.base !== base.mergeBase)
    return {
      rejected:
        `${short(record.head)} 的影响面准入基线是 ${record.base === null ? '（没写）' : short(record.base)}，` +
        `本次基线 ${base.ref} 的合并点是 ${short(base.mergeBase)}：` +
        '合并点相同，H1 的影响面与 H1..HEAD 的影响面合起来才是 HEAD 相对本次基线的影响面',
    }
  return { mode: 'affected', ref: base.ref, mergeBase: base.mergeBase }
}

/** 前提校验：每一条都明说原因；顺序是先看现场，再看记录。 */
function prerequisites(inputs: ResumeInputs): Prerequisites {
  const from = short(inputs.from)
  if (inputs.dirty) return { kind: 'rejected', reason: '工作树有未提交改动：先提交或清掉，再接续' }
  if (inputs.from === inputs.head)
    return {
      kind: 'rejected',
      reason: `${from} 就是当前头，没有修复提交；要重跑请整次准入`,
    }
  if (!inputs.isAncestor)
    return { kind: 'rejected', reason: `${from} 不是 HEAD ${short(inputs.head)} 的祖先` }
  const record = latestResumeOrigin(inputs.records, inputs.from)
  if (record === undefined)
    return { kind: 'rejected', reason: missingOrigin(inputs.records, inputs.from) }
  if (record.tree !== inputs.fromTree)
    return {
      kind: 'rejected',
      reason: `${from} 的记录写的树 ${short(record.tree)} 与它实际的树 ${short(inputs.fromTree)} 不符`,
    }
  if (record.worktree !== inputs.worktree)
    return {
      kind: 'rejected',
      reason:
        `${from} 那次准入在工作树 ${record.worktree} 里跑，本次在 ${inputs.worktree}：` +
        `接续只重建 ${from}..HEAD 影响到的成员，其余构建产物读 ${from} 那次留在磁盘上的，只能在同一棵工作树里接续；否则整次准入`,
    }
  const scope = scopeOf(record, inputs.base)
  if ('rejected' in scope) return { kind: 'rejected', reason: scope.rejected }
  const label = originLabel(scope)
  if (record.failedStep === null)
    return {
      kind: 'rejected',
      reason: `${from} 的${label}没有失败步骤${record.steps.every(step => step.ran) ? '（全部通过）' : '（有步骤没跑完）'}，没有可接续的步`,
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
      reason: `${from} 的${label}除 ${record.failedStep} 外还有步骤没通过：${others.join('、')}`,
    }
  if (!inputs.steps.some(step => step.name === record.failedStep))
    return {
      kind: 'rejected',
      reason: `${from} 失败的步骤 ${record.failedStep} 不在当前步骤表里`,
    }
  return { kind: 'ok', record, failedStep: record.failedStep, scope }
}

/** 碰到的全局文件（退役目录里的不算）。 */
function globalHits(paths: readonly string[], globalPaths: readonly string[]): string[] {
  const patterns = globalPaths.map(patternToRegExp)
  return paths.filter(path => !isLegacyFile(path) && patterns.some(pattern => pattern.test(path)))
}

/** 整次跑的按计划步骤：X、H1 上没跑到的与全部轻步骤，连同它们前面（传递）的按计划步骤。 */
function wholeScopeSteps(
  steps: readonly CheckStep[],
  record: AdmissionRun,
  failedStep: string,
): Set<string> {
  const byName = new Map(steps.map(step => [step.name, step]))
  const ranAt = new Map(record.steps.map(step => [step.name, step]))
  const seeds = steps.filter(step => {
    if (step.planned !== true) return false
    const at = ranAt.get(step.name)
    return step.name === failedStep || at === undefined || !at.ran || !step.heavy
  })
  const whole = new Set<string>()
  const visit = (name: string) => {
    const step = byName.get(name)
    if (step === undefined) return
    if (step.planned === true) whole.add(name)
    for (const before of step.after) visit(before)
  }
  for (const seed of seeds) visit(seed.name)
  return whole
}

/** 整次跑的理由：自己失败、自己没跑到、自己是轻步骤，或者它之后有整次跑的步骤（它们读它的产物）。 */
function whyWhole(record: AdmissionRun, failedStep: string, step: CheckStep): string {
  if (step.name === failedStep) return `${short(record.head)} 上失败`
  const at = record.steps.find(entry => entry.name === step.name)
  if (at === undefined || !at.ran) return `${short(record.head)} 上没跑到`
  if (!step.heavy) return '轻步骤，按整次运行的范围'
  return `${short(record.head)} 上通过，但整次跑的步骤在它之后`
}

const PLANNED_LISTS = ['build', 'typecheck', 'test', 'acceptance'] as const

/** 分组的名字：H1 按影响面时，整次跑的写明范围是本次基线的影响面。 */
function scopeName(scope: StepScope, origin: OriginScope): string {
  if (scope === 'whole') return origin.mode === 'full' ? '整次' : '整次（本次基线的影响面）'
  return scope === 'narrowed' ? '按影响面' : '常驻'
}

/** 按步骤各取整次或 H1..HEAD 影响面的那一份，合成一份计划文件。 */
function composePlan(
  whole: CheckPlan,
  since: CheckPlan,
  wholeScope: ReadonlySet<string>,
  origin: ResumeOrigin,
  scope: OriginScope,
  steps: readonly ResumeStep[],
): CheckPlan {
  const pick = <K extends (typeof PLANNED_LISTS)[number]>(key: K): CheckPlan[K] =>
    wholeScope.has(key) ? whole[key] : since[key]
  const names = (stepScope: StepScope) =>
    steps
      .filter(step => step.scope === stepScope)
      .map(step => step.name)
      .join('、')
  const from = short(origin.head)
  return {
    mode: 'scoped',
    reason:
      `接续 ${from} 的${scope.mode === 'full' ? '全量准入' : '影响面准入'}（失败于 ${origin.failedStep}）：` +
      `${scopeName('whole', scope)} ${names('whole') || '无'}；按 ${from}..HEAD 影响面 ${names('narrowed') || '无'}`,
    files: since.files,
    members: since.members,
    build: pick('build'),
    typecheck: pick('typecheck'),
    test: pick('test'),
    acceptance: pick('acceptance'),
    python: wholeScope.has('python') ? whole.python : since.python,
    ...(since.documentsOnly === undefined ? {} : { documentsOnly: since.documentsOnly }),
  }
}

/** 三种结论之一：拒绝并给原因；退化为按 H1 的范围整次重跑并给原因；增量计划。 */
export function resumePlan(inputs: ResumeInputs): ResumeVerdict {
  const checked = prerequisites(inputs)
  if (checked.kind === 'rejected') return checked
  const { record, failedStep, scope } = checked
  const origin: ResumeOrigin = {
    head: record.head,
    tree: record.tree,
    failedStep,
    mode: scope.mode,
    fullRequested: record.fullRequested,
  }
  const changedFiles = [...new Set(inputs.changedFiles)].sort()
  const rerun = (reason: string): ResumeVerdict => ({
    kind: 'rerun',
    reason,
    origin,
    scope,
    changedFiles,
  })

  // 锁文件与别的全局文件一样：碰到就不接续。按 importer 映射只用于普通的影响面计划。
  const hits = globalHits(changedFiles, inputs.globalPaths)
  if (hits.length > 0) return rerun(`${short(origin.head)}..HEAD 改了全局文件 ${sample(hits)}`)

  const since = inputs.plan({ kind: 'since', paths: changedFiles })
  if (since.mode === 'full')
    return rerun(`${short(origin.head)}..HEAD 的影响面判全量：${since.reason}`)
  const wholeScope = wholeScopeSteps(inputs.steps, record, failedStep)
  const steps = inputs.steps.map((step): ResumeStep => {
    if (step.planned !== true) return { name: step.name, scope: 'resident', why: '常驻，整仓' }
    if (wholeScope.has(step.name))
      return { name: step.name, scope: 'whole', why: whyWhole(record, failedStep, step) }
    return { name: step.name, scope: 'narrowed', why: `${short(record.head)} 上通过` }
  })
  const whole = inputs.plan({ kind: 'whole', mode: scope.mode })
  const plan = composePlan(whole, since, wholeScope, origin, scope, steps)
  return {
    kind: 'resume',
    origin,
    scope,
    caches: record.caches,
    steps,
    plan,
    changedFiles,
  }
}

function changedLines(label: string, changedFiles: readonly string[]): string[] {
  return [
    `${label} 差异 ${changedFiles.length} 个文件${changedFiles.length === 0 ? '' : '：'}`,
    ...changedFiles.map(path => `  ${path}`),
  ]
}

/**
 * 证据文本：「H1 全量（失败于 X）＋ HEAD 增量（基线 H1）」；H1 按影响面时是「H1 影响面准入（失败于 X）＋ HEAD 增量」，
 * 并写明两次是同一个基线合并点。附差异文件清单。退化与拒绝各有自己的说法。
 */
export function describeResume(verdict: ResumeVerdict, head: string): string[] {
  if (verdict.kind === 'rejected') return [`拒绝接续：${verdict.reason}`]
  const from = short(verdict.origin.head)
  const range = `${from}..${short(head)}`
  const started = `${from} ${originLabel(verdict.scope)}（失败于 ${verdict.origin.failedStep}）`
  const baseLine =
    verdict.scope.mode === 'full'
      ? []
      : [
          `${from} 的影响面基线与本次相同：${verdict.scope.ref}，合并点 ${short(verdict.scope.mergeBase)}`,
        ]
  if (verdict.kind === 'rerun')
    return [
      `准入证据：${started}不接续，${short(head)} ${verdict.scope.mode === 'full' ? '整次全量' : '整次按本次基线的影响面'}——${verdict.reason}`,
      ...baseLine,
      ...changedLines(range, verdict.changedFiles),
    ]
  const groups = (['whole', 'narrowed', 'resident'] as const).flatMap(scope => {
    const names = verdict.steps.filter(step => step.scope === scope)
    if (names.length === 0) return []
    const detail = names.map(step => `${step.name}（${step.why}）`).join('、')
    return [`  ${scopeName(scope, verdict.scope)}：${detail}`]
  })
  return [
    `准入证据：${started}＋ ${short(head)} 增量（基线 ${from}）`,
    ...baseLine,
    '步骤：',
    ...groups,
    `${from} 运行时的缓存：测试 ${verdict.caches.test}、依赖图 ${verdict.caches.depGraph}、变异 ${verdict.caches.mutation}`,
    ...changedLines(range, verdict.changedFiles),
  ]
}

export interface ResumeFacts {
  readonly from: string
  readonly fromTree: string
  readonly head: string
  readonly headTree: string
  readonly base: { readonly ref: string; readonly mergeBase: string }
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

/**
 * 从检出取接续要的 git 事实；`fromRef` 不是提交、`baseRef` 与 HEAD 没有合并点都抛错（调用方以 2 退出）。
 * 改动只看已提交的 H1..HEAD。`baseRef` 是统一规则取到的本次基线。
 */
export function resumeFacts(root: string, fromRef: string, baseRef: string): ResumeFacts {
  const from = git(root, ['rev-parse', '--verify', `${fromRef}^{commit}`])
  const head = git(root, ['rev-parse', 'HEAD'])
  return {
    from,
    fromTree: git(root, ['rev-parse', `${from}^{tree}`]),
    head,
    headTree: git(root, ['rev-parse', 'HEAD^{tree}']),
    base: { ref: baseRef, mergeBase: git(root, ['merge-base', baseRef, head]) },
    dirty: git(root, ['status', '--porcelain']) !== '',
    isAncestor: isAncestorOf(root, from, head),
    changedFiles: nulSeparated(
      git(root, ['diff', '--no-renames', '--name-only', '-z', from, head]),
    ).sort(),
  }
}
