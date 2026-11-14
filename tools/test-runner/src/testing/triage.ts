import { mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { VITEST_MAX_WORKERS_ENV, type RunScript } from './config.ts'
import type { Failure, VitestJsonReport } from './ledger.ts'
import { readReport, spawnLogged } from './run.ts'
import { pnpmCommand } from './support.ts'

export type RerunOutcome = 'passed' | 'failed' | 'not-run'

export type TriageClass = 'passes-alone' | 'fails-alone' | 'unstable-alone' | 'not-isolated'

export function classify(outcomes: readonly RerunOutcome[]): TriageClass {
  if (outcomes.length === 0 || outcomes.includes('not-run')) return 'not-isolated'
  if (outcomes.every(outcome => outcome === 'passed')) return 'passes-alone'
  if (outcomes.every(outcome => outcome === 'failed')) return 'fails-alone'
  return 'unstable-alone'
}

export function namePattern(fullName: string): string {
  return `^${fullName.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`
}

export function outcomeOf(
  report: VitestJsonReport | undefined,
  exitCode: number,
  test: string | undefined,
): RerunOutcome {
  const results = report?.testResults ?? []
  if (results.length === 0) return 'not-run'
  if (test === undefined)
    return exitCode === 0 && results.every(result => result.status === 'passed')
      ? 'passed'
      : 'failed'
  const matched = results.flatMap(result =>
    result.assertionResults.filter(
      assertion =>
        assertion.fullName === test &&
        (assertion.status === 'passed' || assertion.status === 'failed'),
    ),
  )
  if (matched.length === 0) return 'not-run'
  return matched.every(assertion => assertion.status === 'passed') ? 'passed' : 'failed'
}

export interface TriageEntry extends Failure {
  readonly outcomes: readonly RerunOutcome[]
  readonly class: TriageClass
  readonly wholeFile?: RerunOutcome
}

const CLASS_TEXT: Readonly<Record<TriageClass, string>> = {
  'fails-alone': '隔离仍失败——单独跑也不过，与同时运行的其他负载无关',
  'unstable-alone': '隔离时过时不过——用例单独跑就不稳定',
  'passes-alone':
    '隔离稳定通过——不是这条用例单独的逻辑错误；原运行里的失败与同时在跑的东西有关（并行负载、用例之间的相互影响或执行顺序，本工具不区分是哪一种）',
  'not-isolated': '未能单独重跑——看日志',
}

const OUTCOME_TEXT: Readonly<Record<RerunOutcome, string>> = {
  passed: '过',
  failed: '不过',
  'not-run': '没跑到',
}

export function triageSummary(entries: readonly TriageEntry[], triageDir: string): string[] {
  const lines = [`失败 ${entries.length} 处，各单独重跑后的归类：`]
  for (const kind of ['fails-alone', 'unstable-alone', 'passes-alone', 'not-isolated'] as const) {
    const group = entries.filter(entry => entry.class === kind)
    if (group.length === 0) continue
    lines.push(`${CLASS_TEXT[kind]}（${group.length} 处）`)
    for (const entry of group)
      lines.push(
        `  ${entry.file ?? entry.member}${entry.test === undefined ? '' : ` › ${entry.test}`}` +
          (entry.outcomes.length === 0
            ? ''
            : `：${entry.outcomes.map(outcome => OUTCOME_TEXT[outcome]).join('、')}`) +
          (entry.wholeFile === undefined
            ? ''
            : `；整个文件单独跑：${OUTCOME_TEXT[entry.wholeFile]}`),
      )
  }
  lines.push(`各次重跑的日志与报告：${triageDir}`)
  return lines
}

export async function rerunInFile(
  root: string,
  script: string,
  member: string,
  file: string,
  test: string | undefined,
  base: string,
): Promise<RerunOutcome> {
  const memberDir = join(root, member)
  const reportPath = `${base}.json`
  const pnpm = pnpmCommand()
  const result = await spawnLogged(
    pnpm.command,
    [
      ...pnpm.args,
      'run',
      script,
      relative(memberDir, join(root, file)),
      ...(test === undefined ? [] : ['-t', namePattern(test)]),
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${reportPath}`,
      ...(script === 'test:slow' ? [] : ['--typecheck.enabled=false']),
    ],
    {
      cwd: memberDir,
      env: { ...process.env, [VITEST_MAX_WORKERS_ENV]: '1' },
      logPath: `${base}.log`,
    },
  )
  return outcomeOf(readReport(reportPath), result.exitCode, test)
}

export async function triage(
  root: string,
  script: RunScript,
  failures: readonly Failure[],
  repeats: number,
  triageDir: string,
  onDone: (entry: TriageEntry, finished: number) => void,
): Promise<TriageEntry[]> {
  mkdirSync(triageDir, { recursive: true })
  const entries: TriageEntry[] = []
  for (const [index, failure] of failures.entries()) {
    let entry: TriageEntry
    if (failure.file === undefined) entry = { ...failure, outcomes: [], class: 'not-isolated' }
    else {
      const target = { ...failure, file: failure.file }
      const outcomes: RerunOutcome[] = []
      for (let attempt = 1; attempt <= repeats; attempt += 1)
        outcomes.push(
          await rerunInFile(
            root,
            script,
            target.member,
            target.file,
            failure.test,
            join(triageDir, `${index + 1}-${attempt}`),
          ),
        )
      const kind = classify(outcomes)
      entry =
        kind === 'passes-alone' && failure.test !== undefined
          ? {
              ...failure,
              outcomes,
              class: kind,
              wholeFile: await rerunInFile(
                root,
                script,
                target.member,
                target.file,
                undefined,
                join(triageDir, `${index + 1}-file`),
              ),
            }
          : { ...failure, outcomes, class: kind }
    }
    entries.push(entry)
    onDone(entry, index + 1)
  }
  return entries
}
