// 结构度量入口：只读源码与 git，产出摘要、数据与审讯页。度量只报告，不判失败——
// 方向规则的失败由 `lint:rules` 承担；这里退出码非零只表示工具自己出错。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GROUP_DIRECTION_POLICY } from '../rules/group-direction.ts'
import { readMetricsConfig } from './config.ts'
import { measureCoverage } from './coverage.ts'
import { changedLines, commitShape, coordinates } from './git.ts'
import { memberOf } from './graph.ts'
import { renderPage } from './render.ts'
import { buildReport, summaryLines, type CoverageInput } from './report.ts'
import { baseTextsOf, collectMemberSources } from './sources.ts'
import { readActualArchitecture } from '../arch/actual.ts'
import { buildArchitectureView } from '../arch/view.ts'

interface Options {
  readonly base?: string
  readonly coverage: boolean
  readonly out?: string
}

function parseArgs(argv: readonly string[]): Options {
  let base: string | undefined
  let out: string | undefined
  let coverage = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--coverage') coverage = true
    else if (arg === '--base' || arg === '--out') {
      const value = argv[index + 1]
      if (value === undefined || value === '') throw new Error(`${arg} 需要一个值`)
      if (arg === '--base') base = value
      else out = value
      index += 1
    } else
      throw new Error(
        `未知参数 ${String(arg)}；用法：metrics [--base <ref>] [--coverage] [--out <dir>]`,
      )
  }
  return {
    coverage,
    ...(base === undefined ? {} : { base }),
    ...(out === undefined ? {} : { out }),
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const config = readMetricsConfig()
  const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
  const at = coordinates(root, options.base)
  const outDir = resolve(
    options.out ??
      process.env['OMNE_METRICS_OUT'] ??
      join(at.mainRoot, 'tmp', 'metrics', `${at.shortHead}${at.dirty ? '-dirty' : ''}`),
  )
  mkdirSync(outDir, { recursive: true })

  const files = collectMemberSources(root)
  const changed = at.base === undefined ? undefined : changedLines(root, at.base.mergeBase)
  const commits = at.base === undefined ? undefined : commitShape(root, at.base.mergeBase)

  let coverage: CoverageInput | undefined
  let coverageSeconds: ReadonlyMap<string, number> | undefined
  if (options.coverage) {
    // 只对配置里列出的根目录下的成员跑测试；其余成员照常做静态度量，覆盖率记为「这次没跑」。
    const all = [...new Set(files.map(file => memberOf(file.path)?.path))].filter(
      (path): path is string =>
        path !== undefined && config.coverage.roots.some(base => path.startsWith(`${base}/`)),
    )
    const targets =
      changed === undefined
        ? all
        : all.filter(member => [...changed.keys()].some(path => path.startsWith(`${member}/`)))
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
    policy: GROUP_DIRECTION_POLICY,
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
    `${JSON.stringify({ meta, layout: report.layout, edges: report.edges, findings: report.findings, exceptions: report.exceptions }, null, 1)}\n`,
  )
  const actual = readActualArchitecture({
    root,
    ...(options.base === undefined ? {} : { base: options.base }),
  })
  const architecture = buildArchitectureView(actual, config.bands)
  writeFileSync(join(outDir, 'actual.json'), JSON.stringify(actual, null, 2) + '\n')
  writeFileSync(join(outDir, 'architecture.json'), JSON.stringify(architecture, null, 2) + '\n')
  writeFileSync(reviewPath, renderPage(report, page, architecture))
  console.log(summary.join('\n'))
}

main()
