#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readActualArchitecture } from './actual.ts'
import { readArchitectureReport } from './report.ts'
import { buildArchitectureView } from './view.ts'
import { readMetricsConfig } from '../metrics/config.ts'
import { renderPage } from '../report/render.ts'
import { summaryLines } from '../metrics/report.ts'
import { git } from '../core/git.ts'
import { projectConformance, readConformance } from './conformance.ts'

function argumentsOf(args: readonly string[]): {
  root: string
  revision?: string
  base?: string
  out?: string
  report?: string
  conformance: boolean
  member?: string
} {
  const values = new Map<string, string>()
  let conformance = false
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i],
      value = args[i + 1]
    if (flag === '--conformance' && !conformance) {
      conformance = true
      continue
    }
    if (
      flag === undefined ||
      !['--root', '--revision', '--base', '--out', '--report', '--member'].includes(flag) ||
      value === undefined ||
      value === '' ||
      value.startsWith('--') ||
      values.has(flag)
    )
      throw new Error(
        'Usage: omne-architecture --root <git-root> [--revision <ref>] [--base <ref>] [--out <json-file>] [--report <dir>]',
      )
    values.set(flag, value)
    i += 1
  }
  const revision = values.get('--revision'),
    base = values.get('--base'),
    out = values.get('--out'),
    report = values.get('--report')
  const member = values.get('--member')
  if (member !== undefined && !conformance) throw new Error('--member requires --conformance')
  if (
    out !== undefined &&
    report !== undefined &&
    [
      'report.html',
      'graph.json',
      'summary.md',
      'conformance.json',
      ...(conformance ? ['actual.json'] : []),
    ].some(name => resolve(out) === resolve(report, name))
  )
    throw new Error('--out must not overwrite a report file')
  return {
    root: resolve(values.get('--root') ?? '.'),
    conformance,
    ...(member === undefined ? {} : { member }),
    ...(revision === undefined ? {} : { revision }),
    ...(base === undefined ? {} : { base }),
    ...(out === undefined ? {} : { out }),
    ...(report === undefined ? {} : { report }),
  }
}
try {
  const args = argumentsOf(process.argv.slice(2))
  const config = args.report === undefined ? undefined : readMetricsConfig()
  const result = config === undefined ? undefined : readArchitectureReport(args, config)
  const document = result?.document ?? (args.conformance ? undefined : readActualArchitecture(args))
  const conformance = result?.conformance ?? (args.conformance ? readConformance(args) : undefined)
  const projected =
    args.member === undefined || conformance === undefined || document === undefined
      ? conformance
      : projectConformance(
          conformance,
          args.member,
          [...document.current.members, ...(document.baseline?.members ?? [])].map(
            member => member.path,
          ),
        )
  const json = `${JSON.stringify(args.conformance ? projected : document, null, 2)}\n`
  if (args.out !== undefined) {
    mkdirSync(dirname(args.out), { recursive: true })
    writeFileSync(args.out, json)
  }
  if (
    args.report !== undefined &&
    result !== undefined &&
    config !== undefined &&
    document !== undefined
  ) {
    const dir = resolve(args.report),
      reviewPath = join(dir, 'report.html')
    const source = document.current.source
    const branch =
      args.revision === undefined ? git(args.root, ['branch', '--show-current']) : '固定版本快照'
    const graph = {
      ...buildArchitectureView(document, config.bands),
      conformance: result.conformance,
    }
    const summary = summaryLines(result.report, {
      shortHead: source.commit.slice(0, 9),
      branch,
      dirty: source.inputDirty,
      reviewPath,
      top: config.summary.top,
      ...(document.baseline === undefined
        ? {}
        : { baseRef: `精确提交 ${document.baseline.source.commit}` }),
    })
    const html = renderPage(
      result.report,
      {
        head: source.commit,
        shortHead: source.commit.slice(0, 9),
        branch,
        dirty: source.inputDirty,
        generatedAt: document.generatedAt,
        summary,
        changedEdgeLimit: config.page.changedEdgeLimit,
        ...(document.baseline === undefined
          ? {}
          : { baseRef: `函数与架构均为精确提交 ${document.baseline.source.commit}` }),
      },
      graph,
    )
    mkdirSync(dir, { recursive: true })
    writeFileSync(reviewPath, html)
    writeFileSync(join(dir, 'actual.json'), JSON.stringify(document, null, 2) + '\n')
    writeFileSync(join(dir, 'conformance.json'), JSON.stringify(result.conformance, null, 2) + '\n')
    writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph, null, 2) + '\n')
    writeFileSync(
      join(dir, 'summary.md'),
      `实际架构 ${source.commit} · ${source.kind} · inputDirty ${source.inputDirty}\n产品成员 ${document.current.scope.productMembers.length}；具体未知 ${document.current.unknown.length}。\n符合性对照 ${result.conformance.comparedWith}；预期变更 ${result.conformance.changes.length}。运行绑定未观测。\n${summary.join('\n')}\n`,
    )
    process.stderr.write(`架构报告：${reviewPath}\n`)
  }
  process.stdout.write(json)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}
