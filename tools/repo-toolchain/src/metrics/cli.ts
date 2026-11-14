#!/usr/bin/env node
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

type Scope =
  | { readonly kind: 'none' }
  | { readonly kind: 'base'; readonly ref: string }
  | {
      readonly kind: 'plan'
      readonly path: string
      readonly coverage: boolean
      readonly parallel?: CoverageParallelism
    }

interface Options {
  readonly scope: Scope
  readonly out?: string
}

const USAGE =
  '用法：metrics [--base <ref> | --plan <计划文件>] [--coverage [--coverage-parallel <M>x<W>]] [--out <dir>]'

const VALUED = ['--base', '--out', '--plan', '--coverage-parallel'] as const

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
  const at = planned === undefined ? located : { ...located, base: planned.plan.base }
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
    const members = files.map(file => memberOf(file.path)?.path)
    const targets = coverageTargets(members, planned.plan, config.coverage.roots)
    coverageRun = measureCoverage(root, targets, join(outDir, 'coverage'), {
      ...(planned.parallel === undefined ? {} : { parallel: planned.parallel }),
      historyDirs: [join(at.mainRoot, 'tmp', 'metrics'), dirname(outDir)],
    })
    // 先挂上处理：并行时要等静态度量做完才 await，其间失败不能算「没人处理」而直接结束进程。
    coverageRun.catch(() => undefined)
  }
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
