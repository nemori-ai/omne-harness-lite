#!/usr/bin/env node
// 结构度量入口：只读源码与 git，产出摘要、数据与审讯页。度量只报告，不判失败——
// 方向规则的失败由 `lint:rules` 承担；这里退出码非零只表示工具自己出错。
import { baselines } from '../core/task-context.ts'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { workingGraph } from '../deps/graph.ts'
import { readMetricsConfig } from './config.ts'
import {
  COVERAGE_PARALLEL_ENV,
  measureCoverage,
  parseCoverageParallel,
  type CoverageParallelism,
} from './coverage.ts'
import { coverageTargets, readMetricsPlan, unplannedMembers } from './plan.ts'
import { changedLines, commitShape, coordinates } from '../core/git.ts'
import { memberOf } from '../deps/graph.ts'
import { renderPage } from '../report/render.ts'
import { buildReport, summaryLines, type CoverageInput } from './report.ts'
import { baseTextsOf, collectMemberSources } from './sources.ts'
import { readActualArchitecture } from '../arch/actual.ts'
import { buildArchitectureView } from '../arch/view.ts'
import { readConformance } from '../arch/conformance.ts'
import { subjectRoot } from '../core/subject.ts'
import { fileTree, listWorkspaceMembers } from '../core/workspace.ts'

/** 基线从哪来：不给、给基线引用，或读计划文件。覆盖采集只在读计划时可选。 */
type Scope =
  | { readonly kind: 'none' }
  | { readonly kind: 'base'; readonly ref: string }
  | {
      readonly kind: 'plan'
      readonly path: string
      readonly coverage: boolean
      /** 覆盖采集跨成员并行的并发度；没有就逐个成员串行。 */
      readonly parallel?: CoverageParallelism
    }

interface Options {
  readonly scope: Scope
  readonly out?: string
}

const USAGE =
  '用法：metrics [--base <ref> | --plan <计划文件>] [--coverage [--coverage-parallel <M>x<W>]] [--out <dir>]'

const VALUED = ['--base', '--out', '--plan', '--coverage-parallel'] as const

/**
 * `--coverage-parallel` 没给时读环境变量 `OMNE_METRICS_COVERAGE_PARALLEL`（同 `--out` 与 `OMNE_METRICS_OUT`）；
 * 环境变量只在带 `--coverage` 时生效，参数则要求同时给 `--coverage`。
 */
function parseArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): Options {
  const values = new Map<string, string>()
  let coverage = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--coverage') coverage = true
    else if ((VALUED as readonly (string | undefined)[]).includes(arg)) {
      const value = argv[index + 1]
      if (value === undefined || value === '') throw new Error(`${arg} 需要一个值`)
      values.set(arg as string, value)
      index += 1
    } else throw new Error(`未知参数 ${String(arg)}；${USAGE}`)
  }
  const base = values.get('--base')
  const plan = values.get('--plan')
  const out = values.get('--out')
  if (base !== undefined && plan !== undefined)
    throw new Error(`--base 与 --plan 不能同时给：计划里已有基线；${USAGE}`)
  // 覆盖采集与准入检查、变异读同一份计划，不自己按改动另选成员。
  if (coverage && plan === undefined)
    throw new Error(`--coverage 要给 --plan：先用 test-runner 的 plan --json 算计划；${USAGE}`)
  const given = values.get('--coverage-parallel')
  if (given !== undefined && !coverage)
    throw new Error(`--coverage-parallel 只在带 --coverage 时有意义；${USAGE}`)
  const fromEnv = env[COVERAGE_PARALLEL_ENV]
  const parallelText = given ?? (coverage && fromEnv !== '' ? fromEnv : undefined)
  const parallel = parallelText === undefined ? undefined : parseCoverageParallel(parallelText)
  const scope: Scope =
    plan !== undefined
      ? { kind: 'plan', path: plan, coverage, ...(parallel === undefined ? {} : { parallel }) }
      : base !== undefined
        ? { kind: 'base', ref: base }
        : { kind: 'none' }
  return { scope, ...(out === undefined ? {} : { out }) }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const config = readMetricsConfig()
  const root = resolve(subjectRoot())
  const { scope } = options
  const planned =
    scope.kind === 'plan'
      ? {
          plan: readMetricsPlan(root, resolve(scope.path)),
          path: resolve(scope.path),
          coverage: scope.coverage,
          parallel: scope.parallel,
        }
      : undefined
  const givenBase = scope.kind === 'base' ? scope.ref : undefined
  const located = coordinates(
    root,
    planned === undefined ? baselines(root, givenBase).targetBase : undefined,
  )
  // 给了计划就用它算的合并点，不按基线引用重算：引用可能已经前进。
  const at = planned === undefined ? located : { ...located, base: planned.plan.base }
  // 架构对照按基线引用本身比较（见 arch/actual.ts），与给 --base 时一致。
  const baseRef = planned === undefined ? givenBase : planned.plan.base.ref
  const outDir = resolve(
    options.out ??
      process.env['OMNE_METRICS_OUT'] ??
      join(at.mainRoot, 'tmp', 'metrics', `${at.shortHead}${at.dirty ? '-dirty' : ''}`),
  )
  mkdirSync(outDir, { recursive: true })
  if (planned !== undefined) copyFileSync(planned.path, join(outDir, 'plan.json'))

  const files = collectMemberSources(root)
  const changed = at.base === undefined ? undefined : changedLines(root, at.base.mergeBase)
  const commits = at.base === undefined ? undefined : commitShape(root, at.base.mergeBase)

  let coverageRun: ReturnType<typeof measureCoverage> | undefined
  if (planned?.coverage === true) {
    const unplanned = unplannedMembers(
      changed?.keys() ?? [],
      planned.plan,
      config.coverage.roots,
      listWorkspaceMembers(fileTree(root), []),
    )
    if (unplanned.length > 0)
      throw new Error(`计划之后工作树改了计划外的成员：${unplanned.join('、')}：重新算计划`)
    // 其余成员照常做静态度量，覆盖率记为「这次没跑」。
    const members = files.map(file => memberOf(file.path)?.path)
    const targets = coverageTargets(members, planned.plan, config.coverage.roots)
    coverageRun = measureCoverage(root, targets, join(outDir, 'coverage'), {
      ...(planned.parallel === undefined ? {} : { parallel: planned.parallel }),
      // 按上次各成员的耗时排先后：缺省输出目录的上级，以及这次输出目录的上级。
      historyDirs: [join(at.mainRoot, 'tmp', 'metrics'), dirname(outDir)],
    })
    // 先挂上处理：并行时要等静态度量做完才 await，其间失败不能算「没人处理」而直接结束进程。
    coverageRun.catch(() => undefined)
  }
  // 串行时先等覆盖率跑完（与以前的先后相同）。并行时下面的静态度量与它同时进行：它们只读工作树，
  // 不读覆盖率；同步计算会推迟空出名额的补位，所以每步之间让出一次事件循环。
  let measured = planned?.parallel === undefined ? await coverageRun : undefined
  const yieldToCoverage = () => new Promise<void>(next => setImmediate(next))

  let baseTexts: Map<string, string | undefined>
  let graph: ReturnType<typeof workingGraph>
  let actual: ReturnType<typeof readActualArchitecture>
  let conformance: ReturnType<typeof readConformance>
  try {
    baseTexts =
      changed !== undefined && at.base !== undefined
        ? baseTextsOf(root, at.base.mergeBase, changed.keys())
        : new Map<string, string | undefined>()
    await yieldToCoverage()
    // 工作树的图算一次：度量与符合性的方向行读同一张。
    graph = workingGraph(root)
    await yieldToCoverage()
    actual = readActualArchitecture({
      root,
      ...(baseRef === undefined ? {} : { base: baseRef }),
    })
    await yieldToCoverage()
    conformance = readConformance({
      root,
      graph,
      ...(baseRef === undefined ? {} : { base: baseRef }),
    })
  } catch (error) {
    // 不丢下还在跑的覆盖率子进程：等它们结束再报静态度量的错。
    await coverageRun?.catch(() => undefined)
    throw error
  }
  measured ??= await coverageRun
  const coverage: CoverageInput | undefined = measured
  const coverageSeconds = measured?.seconds

  const report = buildReport({
    files,
    graph,
    thresholds: config.thresholds,
    bands: config.bands,
    ...(changed === undefined ? {} : { changed, baseTexts }),
    ...(commits === undefined ? {} : { commits }),
    ...(coverage === undefined ? {} : { coverage }),
  })

  const reviewPath = join(outDir, 'review.html')
  const summary = summaryLines(report, {
    shortHead: at.shortHead,
    branch: at.branch,
    dirty: at.dirty,
    reviewPath,
    top: config.summary.top,
    ...(at.base === undefined
      ? {}
      : { baseRef: `${at.base.ref}（函数变化 merge-base ${at.base.mergeBase}）` }),
  })
  const page = {
    head: at.head,
    shortHead: at.shortHead,
    branch: at.branch,
    dirty: at.dirty,
    generatedAt: new Date().toISOString(),
    summary,
    changedEdgeLimit: config.page.changedEdgeLimit,
    ...(at.base === undefined
      ? {}
      : { baseRef: `${at.base.ref}（函数变化 merge-base ${at.base.mergeBase}）` }),
  }
  const meta = {
    head: at.head,
    branch: at.branch,
    dirty: at.dirty,
    base: at.base ?? null,
    generatedAt: page.generatedAt,
    coverageExitCodes: coverage === undefined ? null : Object.fromEntries(coverage.members),
    coverageSeconds: coverageSeconds === undefined ? null : Object.fromEntries(coverageSeconds),
  }

  writeFileSync(join(outDir, 'summary.md'), `${summary.join('\n')}\n`)
  writeFileSync(
    join(outDir, 'metrics.json'),
    `${JSON.stringify({ meta, thresholds: report.thresholds, bands: report.bands, members: report.members, functions: report.functions }, null, 1)}\n`,
  )
  writeFileSync(
    join(outDir, 'graph.json'),
    `${JSON.stringify({ meta, layout: report.layout, edges: report.edges, findings: report.findings }, null, 1)}\n`,
  )
  const architecture = { ...buildArchitectureView(actual, config.bands), conformance }
  writeFileSync(join(outDir, 'conformance.json'), JSON.stringify(conformance, null, 2) + '\n')
  writeFileSync(join(outDir, 'actual.json'), JSON.stringify(actual, null, 2) + '\n')
  writeFileSync(join(outDir, 'architecture.json'), JSON.stringify(architecture, null, 2) + '\n')
  writeFileSync(reviewPath, renderPage(report, page, architecture))
  console.log(summary.join('\n'))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
})
