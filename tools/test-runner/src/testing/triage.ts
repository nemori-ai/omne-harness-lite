// 失败归因：把一次运行里失败的用例逐个单独重跑若干次，按结果分类。
// 它回答的是「这条用例单独跑过不过」，不替人下「是机器的问题」这样的结论——分类的措辞只说重跑看到了什么。
import { mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { VITEST_MAX_WORKERS_ENV, type RunScript } from './config.ts'
import type { Failure, VitestJsonReport } from './ledger.ts'
import { readReport, spawnLogged } from './run.ts'
import { pnpmCommand } from './support.ts'

export type RerunOutcome = 'passed' | 'failed' | 'not-run'

export type TriageClass =
  /** 每次单独重跑都通过。 */
  | 'passes-alone'
  /** 每次单独重跑都失败。 */
  | 'fails-alone'
  /** 单独重跑有过有不过。 */
  | 'unstable-alone'
  /** 没能把它单独跑起来（名字选不中、报告缺失，或失败不在任何测试文件里）。 */
  | 'not-isolated'

export function classify(outcomes: readonly RerunOutcome[]): TriageClass {
  if (outcomes.length === 0 || outcomes.includes('not-run')) return 'not-isolated'
  if (outcomes.every(outcome => outcome === 'passed')) return 'passes-alone'
  if (outcomes.every(outcome => outcome === 'failed')) return 'fails-alone'
  return 'unstable-alone'
}

/** vitest 的 `-t` 是不加锚的正则，按用例全名匹配；转义并加锚才能只选中这一条。 */
export function namePattern(fullName: string): string {
  return `^${fullName.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`
}

/** 一次单独重跑的结论：报告里这个文件（或这条用例）的状态。 */
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
  /** 仅当用例单独跑全过时补做：它所在的文件整个单独跑一次的结果。 */
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

async function rerun(
  root: string,
  script: RunScript,
  failure: Failure & { readonly file: string },
  test: string | undefined,
  base: string,
): Promise<RerunOutcome> {
  const memberDir = join(root, failure.member)
  const reportPath = `${base}.json`
  // 经成员自己的脚本跑（它是 `vitest run …`，验收的那份还带着自己的配置），后面的参数原样传给 vitest。
  // 命令行的 `--reporter` 替换配置里的报告器，`vitest.tiers.mts` 的过滤守卫不在场：选不中时退出码可能是 0，
  // 归类只看 JSON 报告（`outcomeOf`），没选中的记为没跑到。
  // Windows 上 PATH 里的 pnpm 是 pnpm.cmd，Node 不经 shell 起不了；pnpmCommand 按平台给出起法。
  const pnpm = pnpmCommand()
  const result = await spawnLogged(
    pnpm.command,
    [
      ...pnpm.args,
      'run',
      script,
      relative(memberDir, join(root, failure.file)),
      ...(test === undefined ? [] : ['-t', namePattern(test)]),
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${reportPath}`,
      // 类型检查与用例是否通过无关，重跑时关掉。
      '--typecheck.enabled=false',
    ],
    {
      cwd: memberDir,
      // 一次只跑这一条，不给它并行的同伴。
      env: { ...process.env, [VITEST_MAX_WORKERS_ENV]: '1' },
      logPath: `${base}.log`,
    },
  )
  return outcomeOf(readReport(reportPath), result.exitCode, test)
}

/** 串行地逐个重跑：归因要的就是「旁边没有别的东西在跑」。 */
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
          await rerun(
            root,
            script,
            target,
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
              wholeFile: await rerun(
                root,
                script,
                target,
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
