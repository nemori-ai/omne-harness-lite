import { actualFactIdentity } from '../arch/actual-model.ts'
import { assemblyMetadata } from './sensors/assembly.ts'
// 收工钩子的判断：宿主在 agent 收工时喂进一个 JSON，决定要不要把「这次变更里要解释的红项」作为事实反馈回去。
// 这里只有纯函数与一个以依赖注入编排的 `stopHook`；读标准输入、跑 git、起 worker、写文件都在 stop-hook.ts。
import { sameTree } from '../core/subject.ts'
import type { DependencyFinding, ImportSite } from '../deps/graph.ts'
import { describeAgainstBase, type ExplainedFunction } from './against-base.ts'
import type { HookConfig } from './config.ts'
import type { Explain, HardLines } from './status.ts'

/** 宿主输入里本钩子用到的两项；其余字段不看。 */
export interface HookInput {
  readonly stopHookActive: boolean
  readonly cwd?: string
}

/** 解析不了、不是对象 → undefined（不反馈）。 */
export function parseHookInput(text: string): HookInput | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Readonly<Record<string, unknown>>
  const cwd = record['cwd']
  return {
    stopHookActive: record['stop_hook_active'] === true,
    ...(typeof cwd === 'string' && cwd !== '' ? { cwd } : {}),
  }
}

/**
 * 一条线外的读数：`key` 是归一后的类别与位置（不含行号），`text` 是给 agent 看的那一行；
 * `amount` 是能比大小的那个值（函数的圈复杂度），同一处变大算变差。
 */
export interface Finding {
  readonly key: string
  readonly text: string
  readonly amount?: number
}

/** 收工时量出来的东西：要解释的红项（不含克隆）、两条硬线、函数的 alert 线。 */
export interface HookReadings {
  readonly explain: Omit<Explain, 'clones'>
  readonly hardLines: Pick<HardLines, 'direction' | 'cycles'>
  readonly alert: number
}

const site = (at: Pick<ImportSite, 'path' | 'line'> | undefined) =>
  at === undefined ? '' : `（${at.path}:${at.line}）`

function hardLineFinding(kind: string, finding: DependencyFinding<string>): Finding {
  const edges = finding.edges.map(edge => `${edge.from}→${edge.to}`).join(',')
  return {
    key: `${kind}\u0000${finding.kind}\u0000${edges === '' ? finding.message : edges}`,
    text: `✗ 硬线 · ${kind}：${finding.message}${site(finding.sites[0])}`,
  }
}

/** 函数那一行末尾与基线比的说明：现值前面已经写了，涨了的只补「原 N」。 */
function baseNote(row: ExplainedFunction): string {
  const against = row.againstBase
  return against.kind === 'worse' || against.kind === 'not-worse'
    ? `原 ${against.baseline}`
    : describeAgainstBase(row)
}

/** Neutral assembly changes retain their own identity and order. */
function assemblyFindings(reading: Explain['assemblyDelta']): Finding[] {
  if (reading?.status !== 'data') return []
  let out: Finding[] = []
  const delta = reading.data
  for (const [kind, rows] of [
    ['added', delta.added],
    ['removed', delta.removed],
  ] as const)
    for (const row of rows)
      out.push({
        key: JSON.stringify(['assembly', kind, actualFactIdentity(row), assemblyMetadata(row)]),
        text: `${kind === 'added' ? '新增静态装配事实' : '不再静态可见（不证明运行时释放）'}：${row.member} ${row.kind} ${row.key}${site(row)}；中性变化，符合性另看全局约束与行为`,
      })
  for (const row of delta.changed)
    out.push({
      key: JSON.stringify([
        'assembly-metadata',
        row.before.map(assemblyMetadata),
        row.after.map(assemblyMetadata),
        row.after.map(actualFactIdentity),
      ]),
      text: `静态装配元数据变化：${row.after[0]?.member} ${row.after[0]?.kind} ${row.after[0]?.key}；contract/owner 等前后值见完整输出`,
    })
  return out
}

/** 硬线排最前：条目多了被截断时，截掉的是报告项而不是硬线。 */
export function findingsOf(readings: HookReadings): Finding[] {
  const { explain, hardLines, alert } = readings
  let out: Finding[] = [
    ...hardLines.direction.map(finding => hardLineFinding('依赖违规', finding)),
    ...hardLines.cycles.map(finding => hardLineFinding('环', finding)),
  ]
  if (explain.conformance?.status === 'data') {
    for (const row of explain.conformance.data.changes)
      out.push({
        key: `intent\u0000${row.id}\u0000${row.before}\u0000${row.after}`,
        text: `架构预期改动：${row.id}（${row.path}）；与新增偏离分别核对`,
      })
    for (const row of explain.conformance.data.sourceChanges)
      out.push({
        key: `intent-source\u0000${row.path}\u0000${row.before}\u0000${row.after}`,
        text: `架构依据字节变化：${row.path}；须核对含义，哈希不证明语义变化或符合`,
      })
    for (const row of explain.conformance.data.rows.filter(row => row.age === 'new'))
      out.push({
        key: `conformance\u0000${row.id}`,
        text: `新增架构偏离 · ${row.rule}：${row.member} ${row.key}${site(row.sites[0])}；${row.reason}`,
      })
  }
  out = out.concat(assemblyFindings(explain.assemblyDelta))
  for (const row of explain.functions)
    if (row.level === 'alert')
      out.push({
        key: `function\u0000${row.path}\u0000${row.name}`,
        amount: row.complexity,
        text: `超过 alert 的函数：${row.path}:${row.line} ${row.name} 圈复杂度 ${row.complexity}（alert ${alert}），${baseNote(row)}`,
      })
  if (explain.newEdges.status === 'data')
    for (const edge of explain.newEdges.data)
      out.push({
        key: `edge\u0000${edge.from}\u0000${edge.to}`,
        text: `新增的跨成员依赖：${edge.from} → ${edge.to}${site(edge.site)}`,
      })
  if (explain.newStableOnUnstable.status === 'data')
    for (const edge of explain.newStableOnUnstable.data)
      out.push({
        key: `unstable\u0000${edge.from}\u0000${edge.to}`,
        text: `新增的稳定依赖不稳定的边：${edge.from}（I ${edge.fromInstability.toFixed(2)}）→ ${edge.to}（I ${edge.toInstability.toFixed(2)}）${site(edge.site)}`,
      })
  if (explain.casesWithoutAssertions.status === 'data')
    for (const found of explain.casesWithoutAssertions.data)
      out.push({
        key: `case\u0000${found.path}\u0000${found.name}`,
        text: `没有断言的测试用例：${found.path}:${found.line} 「${found.name}」`,
      })
  return out
}

const HEAD = '收工前的结构读数（事实，不是指令）。这次编辑新增或变差了下面几处落在线外的读数：'
const TAIL = [
  '这些要在交付说明里逐条交代：已处理，或保留及理由。提醒过、之后没再变差的不再列。',
  '完整输出：pnpm run loop:status --base <任务基线>',
]

/**
 * 反馈的文字：列前 `maxItems` 条，多出的写「另有 N 条」；整段不超过 `maxChars` 个字符，
 * 放不下就再少列几条，连抬头都放不下时截断。
 */
export function renderReason(
  findings: readonly Finding[],
  limits: Pick<HookConfig, 'maxItems' | 'maxChars'>,
): string {
  const render = (shown: number) => {
    const rest = findings.length - shown
    return [
      HEAD,
      ...findings.slice(0, shown).map(finding => `- ${finding.text}`),
      ...(rest > 0 ? [`- 另有 ${rest} 条`] : []),
      ...TAIL,
    ].join('\n')
  }
  for (let shown = Math.min(findings.length, limits.maxItems); shown >= 0; shown -= 1) {
    const text = render(shown)
    if (text.length <= limits.maxChars) return text
  }
  return render(0).slice(0, limits.maxChars)
}

/** 读数在状态里只留类别与位置，及能比大小的那个值。 */
export type Seen = Pick<Finding, 'key' | 'amount'>

/** 一棵工作树、一条分支上最近一次量出的读数：下一次只报比它新出现或变差的。 */
export interface LastReading {
  readonly root: string
  readonly branch: string
  readonly at: string
  readonly findings: readonly Seen[]
}

/** 各棵工作树、各条分支最近一次的读数，按记下的先后；超过上限丢最旧的。 */
export interface HookState {
  readonly readings: readonly LastReading[]
}

/** 状态文件名。与旧版的 `hook-state.json` 分开：同一个回路目录里，还停在旧代码上的工作树照旧写那一份。 */
export const STATE_FILE = 'hook-readings.json'

const isText = (value: unknown): value is string => typeof value === 'string'

function isSeen(value: unknown): value is Seen {
  if (typeof value !== 'object' || value === null) return false
  const { key, amount } = value as Readonly<Record<string, unknown>>
  return isText(key) && (amount === undefined || typeof amount === 'number')
}

function isLastReading(value: unknown): value is LastReading {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Readonly<Record<string, unknown>>
  const findings = entry['findings']
  return (
    isText(entry['root']) &&
    isText(entry['branch']) &&
    isText(entry['at']) &&
    Array.isArray(findings) &&
    findings.every(isSeen)
  )
}

/** 文件不存在时传 undefined；内容不合约定就抛出（由调用方记日志、给用户警告）。 */
export function parseState(text: string | undefined): HookState {
  if (text === undefined) return { readings: [] }
  const value: unknown = JSON.parse(text)
  const readings =
    typeof value === 'object' && value !== null && 'readings' in value ? value.readings : undefined
  if (!Array.isArray(readings) || !readings.every(isLastReading))
    throw new Error(
      `${STATE_FILE} 不合约定：须为 {"readings": [{root, branch, at, findings: [{key, amount?}]}]}`,
    )
  return { readings }
}

export function lastReading(
  state: HookState,
  root: string,
  branch: string,
): LastReading | undefined {
  return state.readings.find(entry => entry.root === root && entry.branch === branch)
}

/** 比上一次新出现的（类别与位置没见过），或同一处的值变大了的；没有上一次时全部算新。 */
export function newOrWorse(findings: readonly Finding[], last: LastReading | undefined): Finding[] {
  if (last === undefined) return [...findings]
  const before = new Map(last.findings.map(seen => [seen.key, seen.amount]))
  return findings.filter(finding => {
    if (!before.has(finding.key)) return true
    const was = before.get(finding.key)
    return finding.amount !== undefined && was !== undefined && finding.amount > was
  })
}

const seenOf = (findings: readonly Finding[]): Seen[] =>
  findings.map(({ key, amount }) => (amount === undefined ? { key } : { key, amount }))

/** 记下这棵工作树、这条分支这一次的读数，替换它上一次的那条；超过上限丢最旧的。 */
export function record(state: HookState, entry: LastReading, limit: number): HookState {
  const others = state.readings.filter(
    reading => reading.root !== entry.root || reading.branch !== entry.branch,
  )
  return { readings: [...others, entry].slice(-limit) }
}

/** 钩子用到的外部动作；入口给真实的，测试给替身。任何一个抛错都按「钩子自己出错」处理。 */
export interface HookDeps {
  readonly env: NodeJS.ProcessEnv
  readonly cwd: string
  readonly now: () => Date
  readonly config: () => HookConfig & { readonly primaryBranch: string }
  /** 工作目录所在 git 仓库的根、分支与回路目录；不在 git 仓库里 → undefined。 */
  readonly repository: (cwd: string) => { root: string; branch: string; home: string } | undefined
  /**
   * 这次变更（相对与主线的合并点，求不出就只看未提交的）碰了产品源码时量出读数；没碰 → undefined。
   * 超过时限以拒绝结束。
   */
  readonly measure: (
    root: string,
    primaryBranch: string,
    timeoutMs: number,
  ) => Promise<HookReadings | undefined>
  readonly readState: (home: string) => string | undefined
  readonly writeState: (home: string, text: string) => void
  readonly log: (home: string, line: string) => void
  /**
   * 正在跑的这份钩子所在检出的根。给了且与被量的根不是同一棵树时，钩子不量、报「量不了」：别的检出的工具与配置
   * 可能落后。有意让检查器与被检仓库分开（`OMNE_RUNNER_ROOT`）时为 undefined，不比。
   */
  readonly toolRoot: () => string | undefined
}

type Repository = NonNullable<ReturnType<HookDeps['repository']>>

/**
 * 返回标准输出的全文（恰好一个 JSON 对象），没有要说的就是 undefined。从不抛出。
 * 要反馈：`{"decision":"block","reason"}`；钩子自己出错：`{"systemMessage"}`，只给用户看、不拦。
 */
export async function stopHook(stdin: string, deps: HookDeps): Promise<string | undefined> {
  if (deps.env['OMNE_LOOP_HOOK'] === 'off') return undefined
  const input = parseHookInput(stdin)
  if (input === undefined || input.stopHookActive) return undefined
  let repository: Repository | undefined
  try {
    repository = deps.repository(input.cwd ?? deps.cwd)
  } catch {
    return undefined
  }
  return repository === undefined ? undefined : feedback(repository, deps)
}

/** 警告里引的出错原因最多这么多个字符；全文在日志里。 */
const WARNING_REASON_CHARS = 300

/**
 * 钩子自己出错时给人看的警告：宿主把 `systemMessage` 显示给用户，不交给 agent、不拦收工。
 * 不出这一句，「钩子坏了」与「没有红项」在会话里看起来一模一样。
 */
export function renderWarning(reason: string, home: string): string {
  const shown =
    reason.length > WARNING_REASON_CHARS ? `${reason.slice(0, WARNING_REASON_CHARS)}…` : reason
  return `收工钩子没能量出这次变更的结构读数，所以没有反馈，agent 照常收工。原因：${shown}（全文在 ${home}/hook.log）`
}

/**
 * 找到了仓库之后：量、去重、记状态、出文字。这里的任何错误都记进回路目录的日志，并作为警告显示给用户；
 * 不反馈给 agent——钩子自己出错从不影响 agent 收工。
 */
async function feedback(
  { root, branch, home }: Repository,
  deps: HookDeps,
): Promise<string | undefined> {
  try {
    const tool = deps.toolRoot()
    if (tool !== undefined && !sameTree(tool, root))
      throw new Error(
        `跑的是 ${tool} 里的收工钩子，量的却是 ${root}：本工作树没装依赖或没有这份脚本，钩子才退回到别的检出；` +
          '别的检出的工具可能落后，量不了。在本工作树 pnpm install 之后再量',
      )
    const config = deps.config()
    if (!config.enabled) return undefined
    const readings = await deps.measure(root, config.primaryBranch, config.timeoutSeconds * 1000)
    if (readings === undefined) return undefined
    const findings = findingsOf(readings)
    const state = parseState(deps.readState(home))
    const last = lastReading(state, root, branch)
    const fresh = newOrWorse(findings, last)
    const seen = seenOf(findings)
    if (last === undefined || JSON.stringify(last.findings) !== JSON.stringify(seen)) {
      const entry = { root, branch, at: deps.now().toISOString(), findings: seen }
      deps.writeState(home, `${JSON.stringify(record(state, entry, config.stateLimit), null, 1)}\n`)
    }
    if (fresh.length === 0) return undefined
    return JSON.stringify({ decision: 'block', reason: renderReason(fresh, config) })
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).replaceAll('\n', ' ')
    try {
      deps.log(home, `${deps.now().toISOString()} ${root} ${reason}`)
    } catch {
      // 写日志失败也不拦人：钩子自己出错从不影响 agent 收工。
    }
    return JSON.stringify({ systemMessage: renderWarning(reason, home) })
  }
}
