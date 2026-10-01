// 回路状态入口：只读源码与 git，回答「整洁的各项指标各在哪条带上、这次变更里有哪些红项要解释、哪些成员超了预算」。
// 除两条硬线外一切只报告：退出码 1 只在方向违规或环、或给了 BASE 且验收锁被破时；2 是工具自己出错。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect, readAcceptanceLockConfig } from '../acceptance/lock.ts'
import { readMetricsConfig } from '../metrics/config.ts'
import { changedFiles, changedLines, coordinates, git, type Coordinates } from '../metrics/git.ts'
import { memberGraph, memberOf, type Member } from '../metrics/graph.ts'
import { buildReport, isMeasuredSource, type Report } from '../metrics/report.ts'
import { baseTextsOf, collectMemberSources } from '../metrics/sources.ts'
import { GROUP_DIRECTION_POLICY } from '../rules/group-direction.ts'
import { isTestPath, type SourceFile } from '../rule.ts'
import { judgeMember, type MemberBudget } from './budget.ts'
import { readCatalogue } from './catalogue.ts'
import { readLoopConfig, type IndicatorId, type LoopConfig } from './config.ts'
import { writeProposal } from './proposals.ts'
import { data, noData, type Reading } from './reading.ts'
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
  renderStatus,
  type Explain,
  type HardLines,
  type IndicatorInput,
  type OverBudget,
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
} from './trend.ts'

const USAGE = '用法：loop-status [--base <ref>] [--snapshot] [--out <dir>] [--root <检出目录>]'
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const OFF = '配置里关了'

interface Options {
  readonly base?: string
  readonly snapshot: boolean
  readonly out?: string
  /** 被量的检出；缺省是本工具所在的检出。测试用它指向临时仓库。 */
  readonly root: string
}

function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string>()
  let snapshot = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--snapshot') snapshot = true
    else if (arg === '--base' || arg === '--out' || arg === '--root') {
      const value = argv[index + 1]
      if (value === undefined || value === '') throw new Error(`${arg} 需要一个值\n${USAGE}`)
      values.set(arg, value)
      index += 1
    } else throw new Error(`认不出的参数 ${String(arg)}\n${USAGE}`)
  }
  const base = values.get('--base')
  const out = values.get('--out')
  return {
    snapshot,
    root: resolve(values.get('--root') ?? ROOT),
    ...(base === undefined ? {} : { base }),
    ...(out === undefined ? {} : { out }),
  }
}

/** 各传感器的原始结果；status.json 原样收下。 */
interface Sensors {
  readonly stability: Reading<readonly StabilityEdge[]>
  readonly cochange: Reading<CochangeResult>
  readonly duplication: Reading<DuplicationResult>
  readonly assertions: Reading<readonly CaseWithoutAssertion[]>
  readonly newEdges: Reading<EdgeDelta>
  readonly topicChurn: Reading<readonly TopicChurn[]>
  readonly worktrees: Reading<readonly WorktreeChanges[]>
}

interface Change {
  readonly mergeBase: string
  readonly paths: ReadonlySet<string>
  readonly baseTexts: ReadonlyMap<string, string | undefined>
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

function readAssertions(
  files: readonly SourceFile[],
  config: LoopConfig['sensors']['assertions'],
): Reading<readonly CaseWithoutAssertion[]> {
  if (!config.enabled) return noData(OFF)
  const tests = files.filter(file => memberOf(file.path) !== undefined && isTestPath(file.path))
  if (tests.length === 0) return noData('成员里没有测试文件')
  return data(tests.flatMap(file => casesWithoutAssertions(file, config)))
}

function readNewEdges(
  files: readonly SourceFile[],
  change: Change | undefined,
  enabled: boolean,
): Reading<EdgeDelta> {
  if (!enabled) return noData(OFF)
  if (change === undefined) return noData('没给基线')
  const head = memberGraph(files)
  const members = new Map<string, Member>(head.members.map(member => [member.path, member]))
  for (const path of change.paths) {
    const member = memberOf(path)
    if (member !== undefined && !members.has(member.path)) members.set(member.path, member)
  }
  const baseFiles: SourceFile[] = []
  for (const [path, text] of change.baseTexts)
    if (text !== undefined) baseFiles.push({ path, text })
  return data(
    edgeDelta({
      headEdges: head.edges,
      members: [...members.values()],
      changedPaths: change.paths,
      baseFiles,
    }),
  )
}

async function readSensors(
  root: string,
  config: LoopConfig,
  files: readonly SourceFile[],
  report: Report,
  change: Change | undefined,
): Promise<Sensors> {
  const { sensors } = config
  const windowStart = new Date(Date.now() - sensors.topicChurn.windowDays * 24 * 60 * 60 * 1000)
  return {
    stability: sensors.stability.enabled
      ? data(stableOnUnstable(report.members, report.edges, sensors.stability.margin))
      : noData(OFF),
    cochange: readCochange(root, sensors.cochange),
    duplication: await readDuplication(files, sensors.duplication),
    assertions: readAssertions(files, sensors.assertions),
    newEdges: readNewEdges(files, change, sensors.newEdges.enabled),
    topicChurn: sensors.topicChurn.enabled
      ? readTopicChurn(root, sensors.topicChurn.productRoot, windowStart)
      : noData(OFF),
    worktrees: sensors.worktrees.enabled
      ? data(readWorktrees(root, config.primaryBranch))
      : noData(OFF),
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
      ...(churned.length === 0
        ? {}
        : {
            note: `达到提醒线的：${churned.map(topic => `${/^PF-\d+/u.exec(topic.topic)?.[0] ?? topic.topic} ${topic.revisions}`).join('、')}`,
          }),
    },
    worktrees: {
      reading: map(sensors.worktrees, trees => trees.length),
      ...(unreadable.length === 0 ? {} : { note: `其中 ${unreadable.length} 棵读不出改动` }),
    },
    worktreeSharedMembers: {
      reading: map(shared, entries => entries.length),
      ...(sharedNote === undefined ? {} : { note: sharedNote }),
    },
  }
}

function memberBudgets(
  report: Report,
  sensors: Sensors,
  config: LoopConfig,
  history: readonly Snapshot[],
  head: string,
): MemberBudget[] {
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
      }),
    )
}

function explainOf(report: Report, sensors: Sensors, change: Change): Explain {
  const touched = (path: string) => change.paths.has(path)
  const added = map(sensors.newEdges, delta => delta.added)
  const unstable =
    sensors.stability.status === 'data'
      ? new Map(sensors.stability.data.map(edge => [`${edge.from}\u0000${edge.to}`, edge]))
      : undefined
  return {
    functions: report.functions
      .filter(row => row.changed && row.level !== 'ok')
      .sort((a, b) => b.score - a.score),
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

/** 找基线快照用的合并点：给了 BASE 用它的合并点；没给就用与主线的合并点。 */
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

function hardLinesOf(root: string, report: Report, base: string | undefined): HardLines {
  const cycles = report.findings.filter(finding => finding.kind.endsWith('cycle'))
  const direction = report.findings.filter(finding => !finding.kind.endsWith('cycle'))
  if (base === undefined)
    return { direction, cycles, acceptanceLock: { status: 'unjudged', reason: '没给基线' } }
  const lock = inspect(root, base, readAcceptanceLockConfig())
  return { direction, cycles, acceptanceLock: { status: 'judged', violations: lock.violations } }
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv)
  const config = readLoopConfig()
  const metrics = readMetricsConfig()
  const { root } = options
  const at = coordinates(root, options.base)
  const home = resolve(process.env['OMNE_METRICS_HOME'] ?? join(at.mainRoot, 'tmp', 'clean-loop'))
  const outDir = resolve(
    options.out ?? join(home, 'status', `${at.shortHead}${at.dirty ? '-dirty' : ''}`),
  )

  const files = collectMemberSources(root)
  let change: Change | undefined
  if (at.base !== undefined) {
    const paths = new Set(changedFiles(root, at.base.mergeBase))
    change = {
      mergeBase: at.base.mergeBase,
      paths,
      baseTexts: baseTextsOf(root, at.base.mergeBase, paths),
    }
  }
  const report = buildReport({
    files,
    policy: GROUP_DIRECTION_POLICY,
    thresholds: metrics.thresholds,
    bands: metrics.bands,
    ...(at.base === undefined || change === undefined
      ? {}
      : { changed: changedLines(root, at.base.mergeBase), baseTexts: change.baseTexts }),
  })
  const sensors = await readSensors(root, config, files, report, change)

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
  )
  const proposalDir = join(home, 'proposals')
  const overBudget = writeProposals(budgets, report, sensors, config, proposalDir, at)
  const hardLines = hardLinesOf(root, report, options.base)
  const catalogue = readCatalogue(
    root,
    config.sensors.catalogue.path,
    config.sensors.catalogue.doctrinePath,
  )

  const decision = snapshotDecision({
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
    `趋势：${trendPath}；上一次的带位${previous === undefined ? '：没有更早的快照' : `取自 ${previous.commit.slice(0, 9)}`}；` +
      (decision.write ? '已写入这个提交的快照' : decision.reason) +
      (trend.badLines.length === 0
        ? ''
        : `；趋势文件第 ${trend.badLines.join('、')} 行读不了，已跳过`),
    `产物：${outDir}/status.md 与 status.json`,
  ]
  const explain = change === undefined ? undefined : explainOf(report, sensors, change)
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
    explainTop: config.explainTop,
    overBudget,
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
  console.log(lines.join('\n'))
  return hardLinesBroken(hardLines) ? 1 : 0
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
