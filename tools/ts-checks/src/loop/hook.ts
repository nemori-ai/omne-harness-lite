import { actualFactIdentity } from '../arch/actual-model.ts'
import { assemblyMetadata } from './sensors/assembly.ts'
// 收工钩子的判断：宿主在 agent 收工时喂进一个 JSON，决定要不要把「这次变更里要解释的红项」作为事实反馈回去。
// 这里只有纯函数与一个以依赖注入编排的 `stopHook`；读标准输入、跑 git、起 worker、写文件都在 stop-hook.ts。
import { createHash } from 'node:crypto'
import type { DirectionFinding, ImportSite } from '../metrics/graph.ts'
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

/** 一条线外的读数：`key` 是归一后的类别与位置（不含行号），`text` 是给 agent 看的那一行。 */
export interface Finding {
  readonly key: string
  readonly text: string
}

/** 收工时量出来的东西：要解释的红项（不含克隆）、两条硬线、函数的 alert 线。 */
export interface HookReadings {
  readonly explain: Omit<Explain, 'clones'>
  readonly hardLines: Pick<HardLines, 'direction' | 'cycles'>
  readonly alert: number
}

const site = (at: Pick<ImportSite, 'path' | 'line'> | undefined) =>
  at === undefined ? '' : `（${at.path}:${at.line}）`

function hardLineFinding(kind: string, finding: DirectionFinding): Finding {
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
    ...hardLines.direction.map(finding => hardLineFinding('方向违规', finding)),
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

/** 一组读数的指纹：各条的类别与位置排序后求哈希。行号不进指纹，改一行别处的代码不让同一处再报一次。 */
export function fingerprintOf(findings: readonly Finding[]): string {
  const keys = findings.map(finding => finding.key).sort()
  return createHash('sha256').update(keys.join('\n')).digest('hex')
}

const HEAD = '收工前的结构读数（事实，不是指令）。这次变更里有下面几处读数落在线外：'
const TAIL = [
  '这些要在交付说明里逐条交代：已处理，或保留及理由。同一组读数不会再提醒第二次。',
  '完整输出：make loop-status BASE=<任务基线>',
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

/** 反馈过的一组读数。 */
export interface Reported {
  readonly branch: string
  readonly fingerprint: string
  readonly at: string
}

/** 反馈过的读数，按时间先后；超过上限丢最旧的。 */
export interface HookState {
  readonly reported: readonly Reported[]
}

const textField = (value: object, key: string): boolean =>
  typeof (value as Readonly<Record<string, unknown>>)[key] === 'string'

function isReported(entry: unknown): entry is Reported {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    ['branch', 'fingerprint', 'at'].every(key => textField(entry, key))
  )
}

/** 文件不存在时传 undefined；内容不合约定就抛出（由调用方记日志、不反馈）。 */
export function parseState(text: string | undefined): HookState {
  if (text === undefined) return { reported: [] }
  const value: unknown = JSON.parse(text)
  const reported =
    typeof value === 'object' && value !== null && 'reported' in value ? value.reported : undefined
  if (!Array.isArray(reported) || !reported.every(isReported))
    throw new Error('hook-state.json 不合约定：须为 {"reported": [{branch, fingerprint, at}]}')
  return { reported }
}

export function alreadyReported(state: HookState, branch: string, fingerprint: string): boolean {
  return state.reported.some(entry => entry.branch === branch && entry.fingerprint === fingerprint)
}

export function remember(state: HookState, entry: Reported, limit: number): HookState {
  return { reported: [...state.reported, entry].slice(-limit) }
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
    const config = deps.config()
    if (!config.enabled) return undefined
    const readings = await deps.measure(root, config.primaryBranch, config.timeoutSeconds * 1000)
    if (readings === undefined) return undefined
    const findings = findingsOf(readings)
    if (findings.length === 0) return undefined
    const fingerprint = fingerprintOf(findings)
    const state = parseState(deps.readState(home))
    if (alreadyReported(state, branch, fingerprint)) return undefined
    const next = remember(
      state,
      { branch, fingerprint, at: deps.now().toISOString() },
      config.stateLimit,
    )
    deps.writeState(home, `${JSON.stringify(next, null, 1)}\n`)
    return JSON.stringify({ decision: 'block', reason: renderReason(findings, config) })
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
