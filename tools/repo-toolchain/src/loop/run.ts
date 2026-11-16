import { baselines } from '../core/task-context.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  auditHistory,
  readAcceptanceLockConfig,
  render as renderAcceptanceLock,
} from '../acceptance/lock.ts'
import { readMetricsConfig, type MetricsConfig } from '../metrics/config.ts'
import { changedFiles, changedLines, coordinates, git, type Coordinates } from '../core/git.ts'
import { memberOf, revisionGraph, workingGraph, type DependencyGraph } from '../deps/graph.ts'
import { buildReport, isMeasuredSource, type Report } from '../metrics/report.ts'
import { baseTextsOf, collectMemberSources } from '../metrics/sources.ts'
import { isTestPath, type SourceFile } from '../core/rule.ts'
import { judgeMember, type MemberBaseline, type MemberBudget } from './budget.ts'
import { readCatalogue } from './catalogue.ts'
import { readLoopConfig, type IndicatorId, type LoopConfig } from './config.ts'
import { baseFilesOf, judgeAgainstBase } from './function-baseline.ts'
import { loopHome } from './home.ts'
import { writeProposal } from './proposals.ts'
import { data, noData, type Reading } from './reading.ts'
import { engineeringEvidence, parseScope, type SensorScope } from './product-inputs.ts'
import {
  readAcceptanceTiming,
  type AcceptanceLocation,
  type AcceptanceTiming,
} from './sensors/acceptance.ts'
import { casesWithoutAssertions, type CaseWithoutAssertion } from './sensors/assertions.ts'
import { cochange, readCommitMembers, type CochangeResult } from './sensors/cochange.ts'
import { detectDuplication, type DuplicationResult } from './sensors/duplication.ts'
import { edgeDelta, type EdgeDelta } from './sensors/new-edges.ts'
import { stableOnUnstable, type StabilityEdge } from './sensors/stability.ts'
import { readTopicChurn, type TopicChurn } from './sensors/topic-churn.ts'
import { readWorktrees, sharedMembers, type WorktreeChanges } from './sensors/worktrees.ts'
import {
  hardLinesBroken,
  indicatorSnapshots,
  judgeIndicators,
  judgeSensors,
  renderStatus,
  type Explain,
  type HardLines,
  type IndicatorInput,
  type OverBudget,
  type RangeLine,
  type SensorLine,
} from './status.ts'
import {
  ancestorSnapshots,
  ancestryOf,
  appendSnapshot,
  baselineSnapshot,
  previousSnapshot,
  readTrend,
  snapshotDecision,
  type Ancestry,
  type BaselineSnapshot,
  type Snapshot,
  type SnapshotDecision,
} from './trend.ts'

import type { AssemblyObservations, AssemblyDelta } from './sensors/assembly.ts'
import { readArchitectureSensors } from './sensors/conformance.ts'
import type { ConstraintChange } from '../arch/conformance-model.ts'

const OFF = '配置里关了'

export interface RunOptions {
  readonly root: string
  readonly base?: string
  readonly snapshot: boolean
  readonly out?: string
  readonly strict: boolean
  readonly scope?: SensorScope['kind']
}

export interface RunResult {
  readonly code: 0 | 1
  readonly lines: readonly string[]
}

interface Sensors {
  readonly conformance: Reading<import('../arch/conformance-model.ts').Conformance>
  readonly stability: Reading<readonly StabilityEdge[]>
  readonly cochange: Reading<CochangeResult>
  readonly duplication: Reading<DuplicationResult>
  readonly assertions: Reading<readonly CaseWithoutAssertion[]>
  readonly newEdges: Reading<EdgeDelta>
  readonly topicChurn: Reading<readonly TopicChurn[]>
  readonly worktrees: Reading<readonly WorktreeChanges[]>
  readonly acceptance: Reading<AcceptanceTiming>
  readonly architecture: Reading<AssemblyObservations>
  readonly assemblyDelta: Reading<AssemblyDelta>
  readonly architectureChanges: Reading<readonly ConstraintChange[]>
}

export interface Change {
  readonly mergeBase: string
  readonly paths: ReadonlySet<string>
  readonly baseTexts: ReadonlyMap<string, string | undefined>
}

export function changeSince(root: string, mergeBase: string): Change {
  const paths = new Set(changedFiles(root, mergeBase))
  return { mergeBase, paths, baseTexts: baseTextsOf(root, mergeBase, paths) }
}

export function measuredReport(
  root: string,
  files: readonly SourceFile[],
  metrics: MetricsConfig,
  change: Change | undefined,
  graph: DependencyGraph = workingGraph(root),
): Report {
  return buildReport({
    files,
    graph,
    thresholds: metrics.thresholds,
    bands: metrics.bands,
    ...(change === undefined
      ? {}
      : { changed: changedLines(root, change.mergeBase), baseTexts: change.baseTexts }),
  })
}

export function readStability(
  report: Report,
  config: LoopConfig['sensors']['stability'],
): Reading<readonly StabilityEdge[]> {
  return config.enabled
    ? data(stableOnUnstable(report.members, report.edges, config.margin))
    : noData(OFF)
}

function readCochange(root: string, config: LoopConfig['sensors']['cochange']) {
  if (!config.enabled) return noData<CochangeResult>(OFF)
  const result = cochange(readCommitMembers(root, config.window), config)
  return result.counted === 0
    ? noData<CochangeResult>(`最近 ${config.window} 个非合并提交里没有可计的、碰过成员的提交`)
    : data(result)
}

async function readDuplication(
  files: readonly SourceFile[],
  config: LoopConfig['sensors']['duplication'],
): Promise<Reading<DuplicationResult>> {
  if (!config.enabled) return noData(OFF)
  const measured = files.filter(file => isMeasuredSource(file.path) && memberOf(file.path))
  if (measured.length === 0) return noData('成员里没有产品源码')
  return data(await detectDuplication(measured, config))
}

export function readAssertions(
  files: readonly SourceFile[],
  config: LoopConfig['sensors']['assertions'],
): Reading<readonly CaseWithoutAssertion[]> {
  if (!config.enabled) return noData(OFF)
  const tests = files.filter(file => memberOf(file.path) !== undefined && isTestPath(file.path))
  if (tests.length === 0) return noData('成员里没有测试文件')
  return data(tests.flatMap(file => casesWithoutAssertions(file, config)))
}

export function readNewEdges(
  root: string,
  report: Report,
  change: Change | undefined,
  enabled: boolean,
): Reading<EdgeDelta> {
  if (!enabled) return noData(OFF)
  if (change === undefined) return noData('没给基线')
  return data(edgeDelta(report.edges, revisionGraph(root, change.mergeBase).edges))
}

async function readSensors(
  root: string,
  config: LoopConfig,
  files: readonly SourceFile[],
  report: Report,
  graph: DependencyGraph,
  change: Change | undefined,
  acceptanceAt: AcceptanceLocation,
): Promise<Sensors> {
  const { sensors } = config
  const windowStart = new Date(Date.now() - sensors.topicChurn.windowDays * 24 * 60 * 60 * 1000)
  const { architecture, assemblyDelta, architectureChanges, conformance } = readArchitectureSensors(
    root,
    sensors.architecture,
    change?.mergeBase,
    graph,
  )
  return {
    conformance,
    stability: readStability(report, sensors.stability),
    cochange: readCochange(root, sensors.cochange),
    duplication: await readDuplication(files, sensors.duplication),
    assertions: readAssertions(files, sensors.assertions),
    newEdges: readNewEdges(root, report, change, sensors.newEdges.enabled),
    topicChurn: sensors.topicChurn.enabled
      ? readTopicChurn(root, sensors.topicChurn.productRoot, windowStart)
      : noData(OFF),
    worktrees: sensors.worktrees.enabled
      ? data(readWorktrees(root, config.primaryBranch))
      : noData(OFF),
    architecture,
    assemblyDelta,
    architectureChanges,
    acceptance: sensors.acceptance.enabled ? readAcceptanceTiming(acceptanceAt) : noData(OFF),
  }
}

const map = <T, U>(reading: Reading<T>, f: (value: T) => U): Reading<U> =>
  reading.status === 'data' ? data(f(reading.data)) : reading

function indicatorValues(
  report: Report,
  sensors: Sensors,
  config: LoopConfig,
): Record<IndicatorId, IndicatorInput> {
  const churnWarn = config.indicators.topicRevChurn.lines?.warn
  const churned =
    sensors.topicChurn.status === 'data' && churnWarn !== undefined
      ? sensors.topicChurn.data.filter(topic => topic.revisions >= churnWarn)
      : []
  const shared = map(sensors.worktrees, sharedMembers)
  const sharedNote =
    shared.status === 'data' && shared.data.length > 0
      ? shared.data
          .slice(0, 3)
          .map(entry => `${entry.member}（${entry.worktrees.length} 棵）`)
          .join('、') + (shared.data.length > 3 ? ' 等，各是哪几棵见 status.json' : '')
      : undefined
  const unreadable =
    sensors.worktrees.status === 'data'
      ? sensors.worktrees.data.filter(tree => tree.problem !== undefined)
      : []
  return {
    addedAssemblyFacts: { reading: map(sensors.assemblyDelta, result => result.added.length) },
    removedAssemblyFacts: { reading: map(sensors.assemblyDelta, result => result.removed.length) },
    changedAssemblyFacts: { reading: map(sensors.assemblyDelta, result => result.changed.length) },
    architectureChanges: { reading: map(sensors.architectureChanges, items => items.length) },
    unresolvedServiceNames: {
      reading: map(sensors.architecture, result => result.current.serviceIdentifiers.unresolved),
    },
    redMembers: { reading: data(report.members.filter(m => m.band === 'red').length) },
    functionsOverAlert: {
      reading: data(report.functions.filter(row => row.level === 'alert').length),
    },
    stableOnUnstable: { reading: map(sensors.stability, edges => edges.length) },
    cochangePairs: { reading: map(sensors.cochange, result => result.pairs.length) },
    newEdges: { reading: map(sensors.newEdges, delta => delta.added.length) },
    testsWithoutAssertions: { reading: map(sensors.assertions, found => found.length) },
    duplicationPercent: { reading: map(sensors.duplication, result => result.percent) },
    topicRevChurn: {
      reading: map(sensors.topicChurn, topics =>
        topics.reduce((most, topic) => Math.max(most, topic.revisions), 0),
      ),
      note: `HEAD 历史窗口口径，未提交新增 topic 计 0${churned.length === 0 ? '' : `；达到提醒线的：${churned.map(topic => `${topic.topic} ${topic.revisions}`).join('、')}`}`,
    },
    worktrees: {
      reading: map(sensors.worktrees, trees => trees.length),
      ...(unreadable.length === 0 ? {} : { note: `其中 ${unreadable.length} 棵读不出改动` }),
    },
    worktreeSharedMembers: {
      reading: map(shared, entries => entries.length),
      ...(sharedNote === undefined ? {} : { note: sharedNote }),
    },
    acceptanceSeconds: {
      reading: acceptanceMeasured(sensors.acceptance, timing => timing.totalSeconds),
      ...(sensors.acceptance.status === 'data'
        ? { note: acceptanceNote(sensors.acceptance.data) }
        : {}),
    },
    acceptanceSlowestSeconds: {
      reading: acceptanceMeasured(sensors.acceptance, timing => timing.slowest?.seconds ?? 0),
      ...(sensors.acceptance.status === 'data' && sensors.acceptance.data.slowest !== undefined
        ? { note: sensors.acceptance.data.slowest.path }
        : {}),
    },
  }
}

export function acceptanceMeasured(
  reading: Reading<AcceptanceTiming>,
  value: (timing: AcceptanceTiming) => number,
): Reading<number> {
  if (reading.status === 'data' && reading.data.files === 0 && reading.data.skipped !== undefined)
    return noData(
      `这个提交的验收被跳过：${reading.data.skipped.reason}（${reading.data.skipped.members.join('、')}；${reading.data.ledger?.path ?? ''}）`,
    )
  return map(reading, value)
}

function acceptanceNote(timing: AcceptanceTiming): string {
  if (timing.members === 0) return '0 份：没有成员有 acceptance 脚本'
  const skipped =
    timing.skipped === undefined
      ? ''
      : `；跳过 ${timing.skipped.members.length} 个成员（${timing.skipped.reason}）`
  return `${timing.files} 份（${timing.members} 个成员），记录开始于 ${timing.ledger?.startedAt ?? '？'}${skipped}`
}

function memberBaseline(
  enabled: boolean,
  baseline: BaselineSnapshot,
): (member: string) => MemberBaseline {
  if (!enabled) return () => ({ kind: 'off' })
  if (baseline.kind === 'none') return () => ({ kind: 'none' })
  return member => ({ kind: 'snapshot', entry: baseline.snapshot.members[member] })
}

function memberBudgets(
  report: Report,
  sensors: Sensors,
  config: LoopConfig,
  history: readonly Snapshot[],
  head: string,
  baseline: BaselineSnapshot,
): MemberBudget[] {
  const baselineOfMember = memberBaseline(config.budgetBaseline, baseline)
  const duplication =
    sensors.duplication.status === 'data'
      ? new Map(sensors.duplication.data.members.map(entry => [entry.member, entry.percent]))
      : undefined
  const untested = new Map<string, number>()
  if (sensors.assertions.status === 'data')
    for (const found of sensors.assertions.data) {
      const member = memberOf(found.path)?.path
      if (member !== undefined) untested.set(member, (untested.get(member) ?? 0) + 1)
    }
  const excluded = new Set(config.budgetExcludeGroups)
  return report.members
    .filter(member => !excluded.has(member.group))
    .map(member =>
      judgeMember({
        member: member.path,
        values: {
          overAlert: member.overAlert,
          risk: member.risk,
          duplication: duplication === undefined ? undefined : (duplication.get(member.path) ?? 0),
          testsWithoutAssertions:
            sensors.assertions.status === 'data' ? (untested.get(member.path) ?? 0) : undefined,
        },
        budget: config.memberBudget,
        history,
        head,
        relapseLimit: config.relapseLimit,
        baseline: baselineOfMember(member.path),
      }),
    )
}

export function explainOf(
  root: string,
  report: Report,
  sensors: Pick<Sensors, 'newEdges' | 'stability' | 'assertions' | 'duplication'>,
  change: Change,
): Explain {
  const touched = (path: string) => change.paths.has(path)
  const added = map(sensors.newEdges, delta => delta.added)
  const unstable =
    sensors.stability.status === 'data'
      ? new Map(sensors.stability.data.map(edge => [`${edge.from}\u0000${edge.to}`, edge]))
      : undefined
  const candidates = report.functions
    .filter(row => row.changed && row.level !== 'ok')
    .sort((a, b) => b.score - a.score)
  const { kept, notWorse } = judgeAgainstBase(
    candidates,
    report.functions,
    baseFilesOf(root, change.mergeBase, new Set(candidates.map(row => row.path))),
  )
  return {
    functions: kept,
    functionsNotWorse: notWorse,
    newEdges: added,
    newStableOnUnstable:
      unstable === undefined
        ? noData(OFF)
        : map(added, edges =>
            edges.flatMap(edge => {
              const found = unstable.get(`${edge.from}\u0000${edge.to}`)
              return found === undefined ? [] : [found]
            }),
          ),
    casesWithoutAssertions: map(sensors.assertions, found =>
      found.filter(entry => touched(entry.path)),
    ),
    clones: map(sensors.duplication, result =>
      result.clones.filter(clone => touched(clone.a.path) || touched(clone.b.path)),
    ),
  }
}

function writeProposals(
  budgets: readonly MemberBudget[],
  report: Report,
  sensors: Sensors,
  config: LoopConfig,
  dir: string,
  at: Coordinates,
): OverBudget[] {
  return budgets
    .filter(budget => budget.over.length > 0)
    .map(budget => {
      if (budget.structural) return { budget }
      const inMember = (path: string) => memberOf(path)?.path === budget.member
      const proposal = writeProposal(dir, {
        budget,
        lines: config.memberBudget,
        commit: at.head,
        dirty: at.dirty,
        functions: report.functions.filter(
          row => row.member === budget.member && row.level === 'alert',
        ),
        clones:
          sensors.duplication.status === 'data'
            ? sensors.duplication.data.clones.filter(
                clone => inMember(clone.a.path) || inMember(clone.b.path),
              )
            : [],
        casesWithoutAssertions:
          sensors.assertions.status === 'data'
            ? sensors.assertions.data.filter(found => inMember(found.path))
            : [],
      })
      return { budget, proposal }
    })
}

function refHead(root: string, branch: string): string | undefined {
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`])
  } catch {
    return undefined
  }
}

function baselineOf(
  root: string,
  at: Coordinates,
  config: LoopConfig,
  snapshots: readonly Snapshot[],
  headAncestry: Ancestry,
): { baseline: BaselineSnapshot; from: string } {
  let mergeBase = at.base?.mergeBase
  let from = `取基线 ${at.base?.ref ?? ''} 的合并点`
  if (mergeBase === undefined) {
    if (refHead(root, config.primaryBranch) === undefined)
      return { baseline: { kind: 'none' }, from: `没给基线，也没有 ${config.primaryBranch} 分支` }
    mergeBase = git(root, ['merge-base', config.primaryBranch, 'HEAD'])
    from = `没给基线，取与 ${config.primaryBranch} 的合并点 ${mergeBase.slice(0, 9)}`
  }
  const ancestry = mergeBase === at.head ? headAncestry : ancestryOf(root, mergeBase)
  return { baseline: baselineSnapshot(snapshots, mergeBase, ancestry, at.head), from }
}

export function directionLines(
  report: Pick<Report, 'findings'>,
): Pick<HardLines, 'direction' | 'cycles'> {
  const findings = report.findings.filter(finding => finding.rule !== 'no-unresolvable')
  return {
    cycles: findings.filter(finding => finding.kind.endsWith('cycle')),
    direction: findings.filter(finding => !finding.kind.endsWith('cycle')),
  }
}

function hardLinesOf(
  root: string,
  dependencyLines: ReturnType<typeof directionLines>,
  base: string | undefined,
  sensors: SensorLine,
  history: ReturnType<typeof auditHistory>,
): HardLines {
  const bound = baselines(root, base).state === 'bound'
  const range = (judge: (base: string) => readonly string[]): RangeLine =>
    base === undefined
      ? { status: 'unjudged', reason: '没给基线' }
      : { status: 'judged', violations: judge(base) }
  return {
    ...dependencyLines,
    acceptanceLock: range(() =>
      history.flatMap(item =>
        item.acceptance.unresolvedViolations.map(message =>
          bound ? `${item.label} ${item.base}..${item.head}: ${message}` : message,
        ),
      ),
    ),
    sensors,
  }
}

function checkStrict(options: RunOptions): void {
  if (!options.strict) return
  if (options.base === undefined)
    throw new Error('严格模式要给基线（--base）：要解释的红项、新增依赖与验收锁都靠它')
  if (options.out === undefined)
    throw new Error('严格模式要给产物目录（--out）：它不往回路目录里写任何东西')
  if (options.snapshot) throw new Error('严格模式只读趋势，不能与 --snapshot 同用')
}

export async function runLoopStatus(
  options: RunOptions,
  env: NodeJS.ProcessEnv,
  config: LoopConfig = readLoopConfig(),
  metrics: MetricsConfig = readMetricsConfig(),
): Promise<RunResult> {
  const selectedBase = baselines(options.root, options.base).targetBase
  options = { ...options, ...(selectedBase === undefined ? {} : { base: selectedBase }) }
  const scopeKind = parseScope(options.scope)
  if (scopeKind === 'engineering' && !options.strict)
    throw new Error('--scope engineering 要与 --strict 同用')
  checkStrict(options)
  const { root } = options
  const at = coordinates(root, options.base)
  const home = loopHome(at.mainRoot, env)
  const outDir = resolve(
    options.out ?? join(home, 'status', `${at.shortHead}${at.dirty ? '-dirty' : ''}`),
  )

  const files = collectMemberSources(root)
  const acceptanceConfig = readAcceptanceLockConfig()
  const audits = auditHistory(root, options.base, acceptanceConfig)
  const scope: SensorScope =
    scopeKind === 'all'
      ? { kind: 'all' }
      : {
          kind: 'engineering',
          evidence: engineeringEvidence(root, files, [
            ...(selectedBase === undefined ? [] : [selectedBase]),
            ...(at.base === undefined ? [] : [at.base.mergeBase]),
            ...audits.map(range => range.base),
          ]),
        }
  const change = at.base === undefined ? undefined : changeSince(root, at.base.mergeBase)
  const graph = workingGraph(root)
  const report = measuredReport(root, files, metrics, change, graph)
  const sensors = await readSensors(root, config, files, report, graph, change, {
    root,
    mainRoot: at.mainRoot,
    shortHead: at.shortHead,
    dirty: at.dirty,
    env,
    excludeRoots: config.sensors.acceptance.excludeRoots,
  })

  const trendPath = join(home, 'trend.jsonl')
  const trend = readTrend(trendPath)
  const headAncestry = ancestryOf(root, at.head)
  const previous = previousSnapshot(trend.snapshots, headAncestry)
  const { baseline, from } = baselineOf(root, at, config, trend.snapshots, headAncestry)

  const indicators = judgeIndicators({
    values: indicatorValues(report, sensors, config),
    config,
    previous,
    baseline,
  })
  const budgets = memberBudgets(
    report,
    sensors,
    config,
    ancestorSnapshots(trend.snapshots, headAncestry),
    at.head,
    baseline,
  )
  const proposalDir = join(options.strict ? outDir : home, 'proposals')
  const overBudget = writeProposals(budgets, report, sensors, config, proposalDir, at)
  const hardLines = hardLinesOf(
    root,
    directionLines(report),
    options.base,
    options.strict
      ? judgeSensors(sensors, config, scope)
      : { status: 'unjudged', reason: '只在严格模式（STRICT=1）下判' },
    audits,
  )
  const catalogue = readCatalogue(
    root,
    config.sensors.catalogue.path,
    config.sensors.catalogue.doctrinePath,
  )

  const decision: SnapshotDecision = options.strict
    ? { write: false, reason: '严格模式只读趋势，不写快照' }
    : snapshotDecision({
        requested: options.snapshot,
        dirty: at.dirty,
        headIsPrimary: refHead(root, config.primaryBranch) === at.head,
        primaryBranch: config.primaryBranch,
        alreadyRecorded: trend.snapshots.some(snapshot => snapshot.commit === at.head),
      })
  const generatedAt = new Date().toISOString()
  if (decision.write)
    appendSnapshot(trendPath, {
      schema: 1,
      commit: at.head,
      committedAt: git(root, ['show', '-s', '--format=%cI', 'HEAD']),
      recordedAt: generatedAt,
      branch: at.branch,
      indicators: indicatorSnapshots(indicators),
      members: Object.fromEntries(
        budgets.map(budget => [
          budget.member,
          {
            overAlert: budget.values.overAlert ?? null,
            risk: budget.values.risk ?? null,
            duplication: budget.values.duplication ?? null,
            testsWithoutAssertions: budget.values.testsWithoutAssertions ?? null,
            band: budget.band,
          },
        ]),
      ),
    })

  const notes = [
    ...audits.flatMap(range => [
      `审计：${range.label} ${range.base}..${range.head}`,
      ...renderAcceptanceLock(range.acceptance, acceptanceConfig),
    ]),
    `趋势：${trendPath}；上一次的带位${previous === undefined ? '：没有更早的快照' : `取自 ${previous.commit.slice(0, 9)}`}；` +
      (decision.write ? '已写入这个提交的快照' : decision.reason) +
      (trend.badLines.length === 0
        ? ''
        : `；趋势文件第 ${trend.badLines.join('、')} 行读不了，已跳过`),
    `产物：${outDir}/status.md 与 status.json`,
  ]
  const explain =
    change === undefined
      ? undefined
      : {
          ...explainOf(root, report, sensors, change),
          assemblyDelta: sensors.assemblyDelta,
          conformance: sensors.conformance,
        }
  const lines = renderStatus({
    shortHead: at.shortHead,
    branch: at.branch,
    dirty: at.dirty,
    ...(at.base === undefined ? {} : { base: at.base }),
    baseline,
    baselineFrom: from,
    notes,
    hardLines,
    indicators,
    explain,
    architecture: sensors.architecture,
    explainTop: config.explainTop,
    overBudget,
    budgets,
    budgetBaseline: config.budgetBaseline,
    proposalDir,
    catalogue,
    cataloguePath: config.sensors.catalogue.path,
  })

  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'status.md'), `${lines.join('\n')}\n`)
  writeFileSync(
    join(outDir, 'status.json'),
    `${JSON.stringify(
      {
        meta: {
          head: at.head,
          branch: at.branch,
          dirty: at.dirty,
          base: at.base ?? null,
          generatedAt,
          home,
          trend: { path: trendPath, badLines: trend.badLines, snapshot: decision },
        },
        baseline: { ...baseline, from },
        auditRanges: audits,
        scope,
        previous: previous?.commit ?? null,
        hardLines,
        indicators,
        explain: explain ?? null,
        members: budgets,
        overBudget,
        sensors,
        catalogue,
      },
      null,
      1,
    )}\n`,
  )
  return { code: hardLinesBroken(hardLines) ? 1 : 0, lines }
}
