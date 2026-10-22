#!/usr/bin/env node
// 结构度量入口：只读源码与 git，产出摘要、数据与审讯页。度量只报告，不判失败——
// 方向规则的失败由 `lint:rules` 承担；这里退出码非零只表示工具自己出错。
import { baselines } from '../core/task-context.ts'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { workingGraph } from '../deps/graph.ts'
import { readMetricsConfig } from './config.ts'
import { measureCoverage } from './coverage.ts'
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
  | { readonly kind: 'plan'; readonly path: string; readonly coverage: boolean }

interface Options {
  readonly scope: Scope
  readonly out?: string
}

const USAGE = '用法：metrics [--base <ref> | --plan <计划文件>] [--coverage] [--out <dir>]'

function parseArgs(argv: readonly string[]): Options {
  let base: string | undefined
  let out: string | undefined
  let plan: string | undefined
  let coverage = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--coverage') coverage = true
    else if (arg === '--base' || arg === '--out' || arg === '--plan') {
      const value = argv[index + 1]
      if (value === undefined || value === '') throw new Error(`${arg} 需要一个值`)
      if (arg === '--base') base = value
      else if (arg === '--plan') plan = value
      else out = value
      index += 1
    } else throw new Error(`未知参数 ${String(arg)}；${USAGE}`)
  }
  if (base !== undefined && plan !== undefined)
    throw new Error(`--base 与 --plan 不能同时给：计划里已有基线；${USAGE}`)
  // 覆盖采集与准入检查、变异读同一份计划，不自己按改动另选成员。
  if (coverage && plan === undefined)
    throw new Error(`--coverage 要给 --plan：先用 test-runner 的 plan --json 算计划；${USAGE}`)
  const scope: Scope =
    plan !== undefined
      ? { kind: 'plan', path: plan, coverage }
      : base !== undefined
        ? { kind: 'base', ref: base }
        : { kind: 'none' }
  return { scope, ...(out === undefined ? {} : { out }) }
}

function main(): void {
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

  let coverage: CoverageInput | undefined
  let coverageSeconds: ReadonlyMap<string, number> | undefined
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
    const measured = measureCoverage(root, targets, join(outDir, 'coverage'))
    coverage = measured
    coverageSeconds = measured.seconds
  }

  const baseTexts =
    changed !== undefined && at.base !== undefined
      ? baseTextsOf(root, at.base.mergeBase, changed.keys())
      : new Map<string, string | undefined>()

  const report = buildReport({
    files,
    graph: workingGraph(root),
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
  const actual = readActualArchitecture({
    root,
    ...(baseRef === undefined ? {} : { base: baseRef }),
  })
  const conformance = readConformance({
    root,
    ...(baseRef === undefined ? {} : { base: baseRef }),
  })
  const architecture = { ...buildArchitectureView(actual, config.bands), conformance }
  writeFileSync(join(outDir, 'conformance.json'), JSON.stringify(conformance, null, 2) + '\n')
  writeFileSync(join(outDir, 'actual.json'), JSON.stringify(actual, null, 2) + '\n')
  writeFileSync(join(outDir, 'architecture.json'), JSON.stringify(architecture, null, 2) + '\n')
  writeFileSync(reviewPath, renderPage(report, page, architecture))
  console.log(summary.join('\n'))
}

main()
