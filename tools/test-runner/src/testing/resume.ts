import { isLegacyFile } from '@omne-harness/repo-toolchain/core/check-scope'
import { git, nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import type { AdmissionRun, CacheStates, ResumeOrigin } from './admission-run.ts'
import type { FailedFile } from './test-retry.ts'
import { latestResumeOrigin } from './admission-run.ts'
import type { CheckStep } from './check-graph.ts'
import { patternToRegExp, sample, type CheckPlan } from './scope.ts'

export type OriginScope =
  | { readonly mode: 'full' }
  | { readonly mode: 'affected'; readonly ref: string; readonly mergeBase: string }

export type PlanRequest =
  | { readonly kind: 'whole'; readonly mode: OriginScope['mode'] }
  | { readonly kind: 'since'; readonly paths: readonly string[] }

export type Planner = (request: PlanRequest) => CheckPlan

export interface ResumeInputs {
  readonly from: string
  readonly fromTree: string
  readonly head: string
  readonly worktree: string
  readonly base: { readonly ref: string; readonly mergeBase: string }
  readonly dirty: boolean
  readonly isAncestor: boolean
  readonly changedFiles: readonly string[]
  readonly intermediateChanges?: Readonly<Record<string, readonly string[] | 'unknown'>>
  readonly records: readonly AdmissionRun[]
  readonly globalPaths: readonly string[]
  readonly steps: readonly CheckStep[]
  readonly plan: Planner
}

export type StepScope = 'whole' | 'narrowed' | 'resident' | 'files'

export interface ResumeStep {
  readonly name: string
  readonly scope: StepScope
  readonly why: string
}

export interface IntermediateSummary {
  readonly heads: readonly string[]
  readonly added: readonly string[]
}

export type ResumeVerdict =
  | { readonly kind: 'rejected'; readonly reason: string }
  | {
      readonly kind: 'rerun'
      readonly reason: string
      readonly origin: ResumeOrigin
      readonly scope: OriginScope
      readonly changedFiles: readonly string[]
      readonly intermediate: IntermediateSummary
    }
  | {
      readonly kind: 'resume'
      readonly origin: ResumeOrigin
      readonly scope: OriginScope
      readonly caches: CacheStates
      readonly steps: readonly ResumeStep[]
      readonly plan: CheckPlan
      readonly changedFiles: readonly string[]
      readonly intermediate: IntermediateSummary
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

const originLabel = (scope: OriginScope) => (scope.mode === 'full' ? '全量' : '影响面准入')

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

export function intermediateRuns(
  records: readonly AdmissionRun[],
  origin: AdmissionRun,
  worktree: string,
): AdmissionRun[] {
  const after = Date.parse(origin.finishedAt)
  const runs = new Map<string, AdmissionRun>()
  for (const run of records)
    if (run !== origin && run.worktree === worktree && Date.parse(run.startedAt) > after)
      runs.set(`${run.head}|${run.startedAt}`, run)
  return [...runs.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

function globalHits(paths: readonly string[], globalPaths: readonly string[]): string[] {
  const patterns = globalPaths.map(patternToRegExp)
  return paths.filter(path => !isLegacyFile(path) && patterns.some(pattern => pattern.test(path)))
}

function wholeScopeSteps(
  steps: readonly CheckStep[],
  record: AdmissionRun,
  failedStep: string,
  narrowedFailed: boolean,
): Set<string> {
  const byName = new Map(steps.map(step => [step.name, step]))
  const ranAt = new Map(record.steps.map(step => [step.name, step]))
  const seeds = steps.filter(step => {
    if (step.planned !== true) return false
    const at = ranAt.get(step.name)
    if (step.name === failedStep) return !narrowedFailed
    return at === undefined || !at.ran || !step.heavy
  })
  const whole = new Set<string>()
  const visit = (name: string) => {
    const step = byName.get(name)
    if (step === undefined) return
    if (step.planned === true) whole.add(name)
    for (const before of step.after) visit(before)
  }
  for (const seed of seeds) visit(seed.name)
  if (narrowedFailed) whole.delete(failedStep)
  return whole
}

function whyWhole(
  record: AdmissionRun,
  failedStep: string,
  step: CheckStep,
  narrowing: TestNarrowing | undefined,
): string {
  if (step.name === failedStep)
    return `${short(record.head)} 上失败${narrowing !== undefined && 'fallback' in narrowing ? `；${narrowing.fallback}` : ''}`
  const at = record.steps.find(entry => entry.name === step.name)
  if (at === undefined || !at.ran) return `${short(record.head)} 上没跑到`
  if (!step.heavy) return '轻步骤，按整次运行的范围'
  return `${short(record.head)} 上通过，但整次跑的步骤在它之后`
}

const PLANNED_LISTS = ['build', 'typecheck', 'test', 'acceptance'] as const

function scopeName(scope: StepScope, origin: OriginScope): string {
  if (scope === 'whole') return origin.mode === 'full' ? '整次' : '整次（本次基线的影响面）'
  if (scope === 'files') return '只跑失败用例文件'
  return scope === 'narrowed' ? '按影响面' : '常驻'
}

const TEST_STEP = 'test'

type TestNarrowing = { readonly files: readonly FailedFile[] } | { readonly fallback: string }

function narrowTest(
  record: AdmissionRun,
  failedStep: string,
  changed: readonly string[],
): TestNarrowing | undefined {
  if (failedStep !== TEST_STEP) return undefined
  const files = record.testFailures ?? []
  if (files.length === 0) return { fallback: '记录没写失败的测试文件，整次' }
  if (files.some(file => file.tier !== 'slow'))
    return { fallback: '失败在快层，慢层在 H1 上没跑过，整次' }
  const members = new Set(files.map(file => file.member))
  const outside = changed.filter(
    path => ![...members].some(member => path.startsWith(`${member}/`)),
  )
  if (outside.length > 0)
    return { fallback: `差异碰到失败用例所在成员以外的路径（${sample(outside)}），整次` }
  return { files }
}

function composePlan(
  whole: CheckPlan,
  since: CheckPlan,
  wholeScope: ReadonlySet<string>,
  origin: ResumeOrigin,
  scope: OriginScope,
  steps: readonly ResumeStep[],
  testFiles: readonly FailedFile[] | undefined,
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
      `${scopeName('whole', scope)} ${names('whole') || '无'}；按 ${from}..HEAD 影响面 ${names('narrowed') || '无'}` +
      (testFiles === undefined
        ? ''
        : `；test 只跑 ${from} 上失败的 ${testFiles.length} 个文件加影响面`),
    files: since.files,
    members: since.members,
    build: pick('build'),
    typecheck: pick('typecheck'),
    test: pick('test'),
    acceptance: pick('acceptance'),
    python: wholeScope.has('python') ? whole.python : since.python,
    ...(since.documentsOnly === undefined ? {} : { documentsOnly: since.documentsOnly }),
    ...(testFiles === undefined ? {} : { testResume: { files: testFiles } }),
  }
}

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
  let intermediate: IntermediateSummary = { heads: [], added: [] }
  const rerun = (reason: string): ResumeVerdict => ({
    kind: 'rerun',
    reason,
    origin,
    scope,
    changedFiles,
    intermediate,
  })

  const middle = intermediateRuns(inputs.records, record, inputs.worktree)
  const dirtyRun = middle.find(run => run.dirty)
  if (dirtyRun !== undefined)
    return rerun(
      `${short(origin.head)} 之后这棵树上跑过带未提交改动的运行（${short(dirtyRun.head)}），磁盘上的产物说不清对应哪份源码，整次重跑`,
    )
  const known = new Set(changedFiles)
  const added = new Set<string>()
  for (const run of middle) {
    const paths = inputs.intermediateChanges?.[run.head]
    if (paths === undefined || paths === 'unknown')
      return rerun(
        `${short(origin.head)} 之后的中间运行头 ${short(run.head)} 算不出到 HEAD 的差异，整次重跑`,
      )
    for (const path of paths) if (!known.has(path)) added.add(path)
  }
  intermediate = { heads: middle.map(run => run.head), added: [...added].sort() }
  const planned = [...new Set([...changedFiles, ...intermediate.added])].sort()

  const hits = globalHits(planned, inputs.globalPaths)
  if (hits.length > 0)
    return rerun(
      `${short(origin.head)}..HEAD${intermediate.heads.length > 0 ? '（含中间运行补进的改动）' : ''}改了全局文件 ${sample(hits)}`,
    )

  const since = inputs.plan({ kind: 'since', paths: planned })
  if (since.mode === 'full')
    return rerun(`${short(origin.head)}..HEAD 的影响面判全量：${since.reason}`)
  const narrowing = narrowTest(record, failedStep, planned)
  const testFiles = narrowing !== undefined && 'files' in narrowing ? narrowing.files : undefined
  const wholeScope = wholeScopeSteps(inputs.steps, record, failedStep, testFiles !== undefined)
  const steps = inputs.steps.map((step): ResumeStep => {
    if (step.planned !== true) return { name: step.name, scope: 'resident', why: '常驻，整仓' }
    if (testFiles !== undefined && step.name === failedStep)
      return {
        name: step.name,
        scope: 'files',
        why: `${short(record.head)} 上慢层失败于 ${testFiles.map(file => file.file).join('、')}，差异都在这些成员里：只跑这些文件加 ${short(record.head)}..HEAD 影响面`,
      }
    if (wholeScope.has(step.name))
      return {
        name: step.name,
        scope: 'whole',
        why: whyWhole(record, failedStep, step, narrowing),
      }
    return { name: step.name, scope: 'narrowed', why: `${short(record.head)} 上通过` }
  })
  const whole = inputs.plan({ kind: 'whole', mode: scope.mode })
  const plan = composePlan(whole, since, wholeScope, origin, scope, steps, testFiles)
  return {
    kind: 'resume',
    origin,
    scope,
    caches: record.caches,
    steps,
    plan,
    changedFiles,
    intermediate,
  }
}

function intermediateLines(summary: IntermediateSummary): string[] {
  if (summary.heads.length === 0) return []
  const added = summary.added.length === 0 ? '没有补进文件' : `补进 ${sample(summary.added)}`
  return [
    `中间运行 ${summary.heads.length} 次（头 ${summary.heads.map(short).join('、')}），${added}`,
  ]
}

function changedLines(label: string, changedFiles: readonly string[]): string[] {
  return [
    `${label} 差异 ${changedFiles.length} 个文件${changedFiles.length === 0 ? '' : '：'}`,
    ...changedFiles.map(path => `  ${path}`),
  ]
}

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
      ...intermediateLines(verdict.intermediate),
    ]
  const groups = (['whole', 'files', 'narrowed', 'resident'] as const).flatMap(scope => {
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
    `${from} 运行时的缓存：测试 ${verdict.caches.test}、依赖图 ${verdict.caches.depGraph}`,
    ...changedLines(range, verdict.changedFiles),
    ...intermediateLines(verdict.intermediate),
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
  readonly intermediateChanges: Readonly<Record<string, readonly string[] | 'unknown'>>
}

export function workingTreeDirty(root: string): boolean {
  if (git(root, ['status', '--porcelain']) !== '') return true
  return /^[a-zS] /mu.test(git(root, ['ls-files', '-v']))
}

function isAncestorOf(root: string, ancestor: string, descendant: string): boolean {
  try {
    git(root, ['merge-base', '--is-ancestor', ancestor, descendant])
    return true
  } catch (error) {
    if ((error as { status?: unknown }).status === 1) return false
    throw error
  }
}

export function resumeFacts(
  root: string,
  fromRef: string,
  baseRef: string,
  context?: { readonly records: readonly AdmissionRun[]; readonly worktree: string },
): ResumeFacts {
  const from = git(root, ['rev-parse', '--verify', `${fromRef}^{commit}`])
  const head = git(root, ['rev-parse', 'HEAD'])
  return {
    from,
    fromTree: git(root, ['rev-parse', `${from}^{tree}`]),
    head,
    headTree: git(root, ['rev-parse', 'HEAD^{tree}']),
    base: { ref: baseRef, mergeBase: git(root, ['merge-base', baseRef, head]) },
    dirty: workingTreeDirty(root),
    isAncestor: isAncestorOf(root, from, head),
    changedFiles: diffPaths(root, from, head),
    intermediateChanges: intermediateChanges(root, from, head, context),
  }
}

const diffPaths = (root: string, from: string, to: string) =>
  nulSeparated(git(root, ['diff', '--no-renames', '--name-only', '-z', from, to])).sort()

function intermediateChanges(
  root: string,
  from: string,
  head: string,
  context: { readonly records: readonly AdmissionRun[]; readonly worktree: string } | undefined,
): Record<string, readonly string[] | 'unknown'> {
  const result: Record<string, readonly string[] | 'unknown'> = {}
  const origin = context === undefined ? undefined : latestResumeOrigin(context.records, from)
  if (context === undefined || origin === undefined) return result
  for (const run of intermediateRuns(context.records, origin, context.worktree)) {
    if (run.head in result) continue
    try {
      result[run.head] = diffPaths(root, run.head, head)
    } catch {
      result[run.head] = 'unknown'
    }
  }
  return result
}
