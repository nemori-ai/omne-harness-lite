// 准入证据核对：收口点 F 上要有一次完整通过的全量准入。F 的树与某个提交 C 的树相同时，C 上的全量准入就是 F 上的全量准入
// （integration.md 波末收口的树相同复用）。这里只核对树相同，不要求 F 是 gate 合并提交，也不看 C 与 F 的祖先关系。
// 接受条件逐项都要满足：记录是 schemaVersion 1 的 `admission-run`，`admission` 为真，带了 `FULL=1` 的全量（`mode: full` 且
// `fullRequested` 为真，或 `resumeFrom.fullRequested` 为真的 `mode: resume`——integration.md：用增量准入的证据复用时
// H1 上的整次运行必须带 `FULL=1`；只是计划判了全量的不算），运行时工作树干净，
// 没有快速失败，步骤表非空且每步都跑完、退出 0，有 `finishedAt`；记录的头在本仓库里，记录写的树与头的树一致；
// 树（记录缺 `tree` 时由头补算）等于 F 的树。任何一项不满足就拒绝并写明原因，读不出、算不出的一律按拒绝处理，不猜。
// 命令行形状（接线在 cli.ts）：`admission-evidence --for <F> [--record <路径>]`，接受退出 0、拒绝退出 1、用法错误退出 2。
import { git } from '@omne-harness/repo-toolchain/core/git'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  ADMISSION_RECORD_DIR,
  ADMISSION_RUN_KIND,
  ADMISSION_RUN_SCHEMA_VERSION,
  CACHE_STATES,
  type CacheState,
  type CacheStates,
} from './admission-run.ts'
import { parseFlags } from './support.ts'
import { parseRetriedFiles, type RetriedFile } from './test-retry.ts'

export const ADMISSION_EVIDENCE_USAGE = [
  '  admission-evidence --for <F> [--record <记录路径>]',
  '      核对 F 上有没有可采用的全量准入：给 --record 时只看那一份记录；不给时在本树 tmp/admission/*.json 里按 F 的树哈希找。',
  '      记录的树与 F 的树相同、且是一次干净且每步都通过、带了 FULL=1 的全量准入（或 H1 带了 FULL=1 的接续）时接受（退出 0），',
  '      否则逐项列出拒绝原因（退出 1）；用法错误退出 2',
].join('\n')

// 记录的形状归 admission-run.ts；这里不用它的整份解析（整份通过或不通过给不出逐项原因），只借它的常量与类型，
// 逐字段核对并逐项列出拒绝原因。
const SCHEMA_VERSION = ADMISSION_RUN_SCHEMA_VERSION
const RECORD_KIND = ADMISSION_RUN_KIND
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u

export type Caches = CacheStates

/** 拒绝的一项原因：`kind` 供程序分辨，`message` 给人读。 */
export type RejectionKind =
  | 'target-missing'
  | 'no-matching-record'
  | 'unreadable'
  | 'not-admission'
  | 'schema-version'
  | 'not-full'
  | 'full-not-requested'
  | 'dirty'
  | 'not-finished'
  | 'fast-failed'
  | 'no-steps'
  | 'step-failed'
  | 'step-not-run'
  | 'head-missing'
  | 'tree-inconsistent'
  | 'tree-differs'
export interface Rejection {
  readonly kind: RejectionKind
  readonly message: string
}

/** 一份记录的核对结果；`reasons` 为空就是可采用。 */
export interface RecordFinding {
  readonly record: string
  readonly reasons: readonly Rejection[]
  /** 记录里 test 步定向重跑过的文件（写得合法时）；确认者要看得到哪些用例是重跑才过的。 */
  readonly retried?: readonly RetriedFile[]
}

export interface CommitTree {
  readonly commit: string
  readonly tree: string
}

export type AdmissionEvidence =
  | {
      readonly kind: 'accepted'
      readonly target: CommitTree
      readonly source: CommitTree
      readonly record: string
      readonly caches: Caches
      /** 记录是接续了 H1 全量准入的组成证据时，H1 的头；一次整次全量没有。 */
      readonly resumedFrom?: string
      /** test 步定向重跑过的文件。 */
      readonly retried?: readonly RetriedFile[]
    }
  | {
      readonly kind: 'rejected'
      readonly forRef: string
      /** F 解析不出时没有。 */
      readonly target: CommitTree | undefined
      /** 不属于某一份记录的原因：F 解析不出、本树里没有同树的记录。 */
      readonly reasons: readonly Rejection[]
      /** 逐份记录的原因：给了 `--record` 时是那一份；按树找时是同树的各份，一份也没有时是读不出的各份。 */
      readonly records: readonly RecordFinding[]
    }

export interface EvidenceRequest {
  /** 收口点：任何能解析成提交的写法。 */
  readonly for: string
  /** 记录路径，相对路径按 `root` 解析；不给时在 `root` 的 `tmp/admission/*.json` 里按树哈希找。 */
  readonly record?: string
}

const reject = (kind: RejectionKind, message: string): Rejection => ({ kind, message })

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isObjectId = (value: unknown): value is string =>
  typeof value === 'string' && OBJECT_ID.test(value)

const isCacheState = (value: unknown): value is CacheState =>
  CACHE_STATES.some(state => state === value)

/** git 解析不出（对象不存在、引用写错）时返回 undefined；其余照 `git` 抛出。 */
function resolveObject(root: string, spec: string): string | undefined {
  try {
    const id = git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', spec])
    return isObjectId(id) ? id : undefined
  } catch {
    return undefined
  }
}

/** 读出来的记录：头、记录写的树（可能没有）、缓存状态，以及与树无关的全部拒绝原因。 */
type Inspected =
  | { readonly kind: 'unreadable'; readonly reason: Rejection }
  | {
      readonly kind: 'read'
      readonly head: string
      readonly tree: string | undefined
      readonly finishedAt: string
      readonly caches: Caches
      /** 接续记录写的 H1 的头；不是接续或写得不对时没有（写得不对已进 `problems`）。 */
      readonly resumedFrom: string | undefined
      readonly retried: readonly RetriedFile[] | undefined
      readonly problems: readonly Rejection[]
    }

const unreadable = (message: string): Inspected => ({
  kind: 'unreadable',
  reason: reject('unreadable', `记录读不出：${message}`),
})

/** 缓存状态只用于展示，不进接受条件；没写时三项都是 unknown，写了就要每项都是 on、off、unknown 之一。 */
function readCaches(value: unknown): Caches | undefined {
  if (value === undefined) return { test: 'unknown', depGraph: 'unknown', mutation: 'unknown' }
  if (!isObject(value)) return undefined
  const { test, depGraph, mutation } = value
  if (!isCacheState(test) || !isCacheState(depGraph) || !isCacheState(mutation)) return undefined
  return { test, depGraph, mutation }
}

function stepProblems(steps: unknown): Rejection[] {
  if (!Array.isArray(steps) || steps.length === 0)
    return [reject('no-steps', '没有步骤表：看不出跑了哪些检查')]
  return steps.flatMap((step: unknown, index): Rejection[] => {
    if (!isObject(step) || typeof step['name'] !== 'string' || step['name'] === '')
      return [reject('step-not-run', `第 ${index + 1} 步形状不对，看不出是哪一步、跑没跑`)]
    const { name, ran, exit } = step
    if (ran !== true) return [reject('step-not-run', `步骤 ${name} 没跑`)]
    if (exit !== 0) return [reject('step-failed', `步骤 ${name} 失败（退出 ${String(exit)}）`)]
    return []
  })
}

/** `fullRequested` 不是真时的原因：假就是没有带 FULL=1，别的写法看不出。 */
function notRequested(subject: string, value: unknown): Rejection {
  return reject(
    'full-not-requested',
    value === false
      ? `${subject}没有带 FULL=1：只是计划判了全量的不算全量准入`
      : `${subject}fullRequested=${JSON.stringify(value)}，看不出有没有带 FULL=1`,
  )
}

/**
 * 范围够不够全量：`full` 且带了 `FULL=1` 才够；`resume` 看它接续的 H1——H1 那次带了 `FULL=1`，
 * 「H1 全量（失败于 X）＋ 头上增量」合起来是全量准入；H1 只按影响面或只是计划判了全量时都不是。
 */
function modeProblem(record: Readonly<Record<string, unknown>>): Rejection | undefined {
  const { mode, fullRequested, resumeFrom } = record
  if (mode === 'full') return fullRequested === true ? undefined : notRequested('', fullRequested)
  if (mode !== 'resume') return reject('not-full', `不是全量：mode=${JSON.stringify(mode)}`)
  if (!isObject(resumeFrom))
    return reject(
      'not-full',
      `接续记录看不出 H1 那次的范围：resumeFrom=${JSON.stringify(resumeFrom)}`,
    )
  if (resumeFrom['mode'] === 'affected')
    return reject('not-full', '接续记录：H1 只按影响面运行，组成的证据不是全量准入')
  if (resumeFrom['fullRequested'] === true) return undefined
  return notRequested('接续记录：H1 那次', resumeFrom['fullRequested'])
}

/** 与树无关的接受条件；每项独立判断，全部列出。 */
function problemsOf(record: Readonly<Record<string, unknown>>): Rejection[] {
  const { schemaVersion, kind, admission, dirty, failedStep, steps, finishedAt } = record
  const problems: Rejection[] = []
  if (kind !== RECORD_KIND || admission !== true)
    problems.push(
      reject(
        'not-admission',
        `不是准入运行：kind=${JSON.stringify(kind)}，admission=${JSON.stringify(admission)}`,
      ),
    )
  if (schemaVersion !== SCHEMA_VERSION)
    problems.push(
      reject(
        'schema-version',
        `schemaVersion 是 ${JSON.stringify(schemaVersion)}，只认 ${SCHEMA_VERSION}`,
      ),
    )
  const scope = modeProblem(record)
  if (scope !== undefined) problems.push(scope)
  if (dirty !== false)
    problems.push(
      reject(
        'dirty',
        dirty === true
          ? '运行时工作树有未提交改动（dirty），不是对任何提交的证据'
          : `dirty=${JSON.stringify(dirty)}，看不出运行时工作树是否干净`,
      ),
    )
  if (failedStep !== null)
    problems.push(
      reject(
        'fast-failed',
        typeof failedStep === 'string'
          ? `快速失败于 ${failedStep}`
          : `failedStep=${JSON.stringify(failedStep)}，看不出有没有快速失败`,
      ),
    )
  problems.push(...stepProblems(steps))
  if (typeof finishedAt !== 'string' || finishedAt === '' || Number.isNaN(Date.parse(finishedAt)))
    problems.push(reject('not-finished', '没有正常结束：缺 finishedAt'))
  return problems
}

/** 边界解析：读文件、解析 JSON、取头与树。头或树的写法不对、缓存状态写得不对，按读不出算。 */
function inspect(path: string): Inspected {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    return unreadable(error instanceof Error ? error.message : String(error))
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return unreadable(`不是 JSON（${error instanceof Error ? error.message : String(error)}）`)
  }
  if (!isObject(parsed)) return unreadable('顶层不是对象')
  const { head, tree, finishedAt } = parsed
  if (!isObjectId(head)) return unreadable(`head=${JSON.stringify(head)} 不是提交号`)
  if (tree !== undefined && !isObjectId(tree))
    return unreadable(`tree=${JSON.stringify(tree)} 不是树哈希`)
  const caches = readCaches(parsed['caches'])
  if (caches === undefined)
    return unreadable(
      `caches=${JSON.stringify(parsed['caches'])} 不是 test、depGraph、mutation 各取 on、off、unknown`,
    )
  const resumeFrom = parsed['resumeFrom']
  const resumedFrom =
    parsed['mode'] === 'resume' && isObject(resumeFrom) && isObjectId(resumeFrom['head'])
      ? resumeFrom['head']
      : undefined
  return {
    kind: 'read',
    head,
    tree,
    finishedAt: typeof finishedAt === 'string' ? finishedAt : '',
    caches,
    resumedFrom,
    retried: parsed['retried'] === undefined ? undefined : parseRetriedFiles(parsed['retried']),
    problems: problemsOf(parsed),
  }
}

/** 一份记录对 F 的核对。`tree` 是比对用的树：记录写的，缺时由头补算；都得不到时为 undefined。 */
interface Judged {
  readonly finding: RecordFinding
  readonly tree: string | undefined
  readonly accepted:
    | {
        readonly source: CommitTree
        readonly caches: Caches
        readonly finishedAt: string
        readonly resumedFrom: string | undefined
      }
    | undefined
}

function judge(root: string, path: string, target: CommitTree): Judged {
  const record = display(root, path)
  const read = inspect(path)
  if (read.kind === 'unreadable')
    return { finding: { record, reasons: [read.reason] }, tree: undefined, accepted: undefined }
  const reasons = [...read.problems]
  const headTree = resolveObject(root, `${read.head}^{tree}`)
  if (headTree === undefined)
    reasons.push(
      reject(
        'head-missing',
        `记录的头 ${read.head} 在本仓库里找不到${read.tree === undefined ? '，也补算不出树' : ''}`,
      ),
    )
  else if (read.tree !== undefined && read.tree !== headTree)
    reasons.push(
      reject(
        'tree-inconsistent',
        `记录写的树 ${read.tree} 与它的头 ${read.head} 的树 ${headTree} 不一致`,
      ),
    )
  const tree = read.tree ?? headTree
  if (tree !== undefined && tree !== target.tree)
    reasons.push(
      reject(
        'tree-differs',
        `树不同：记录的树 ${tree}（头 ${read.head}），F ${target.commit} 的树 ${target.tree}`,
      ),
    )
  const accepted =
    reasons.length === 0 && tree !== undefined
      ? {
          source: { commit: read.head, tree },
          caches: read.caches,
          finishedAt: read.finishedAt,
          resumedFrom: read.resumedFrom,
        }
      : undefined
  return {
    finding: { record, reasons, ...(read.retried === undefined ? {} : { retried: read.retried }) },
    tree,
    accepted,
  }
}

/** 记录路径给人看：在 `root` 里写相对路径（`/` 分隔），在外面写绝对路径。 */
function display(root: string, path: string): string {
  const inside = relative(root, path)
  return inside === '' || inside.startsWith('..') || isAbsolute(inside)
    ? path
    : inside.replaceAll('\\', '/')
}

function recordsIn(root: string): string[] {
  const directory = join(root, ADMISSION_RECORD_DIR)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => join(directory, entry.name))
    .sort()
}

function accept(target: CommitTree, judged: Judged): AdmissionEvidence | undefined {
  if (judged.accepted === undefined) return undefined
  const { source, caches, resumedFrom } = judged.accepted
  return {
    kind: 'accepted',
    target,
    source,
    record: judged.finding.record,
    caches,
    ...(resumedFrom === undefined ? {} : { resumedFrom }),
    ...(judged.finding.retried === undefined ? {} : { retried: judged.finding.retried }),
  }
}

/** 定向重跑过的文件，给人看：没有或为空时没有这几行。 */
function retriedLines(retried: readonly RetriedFile[] | undefined, indent: string): string[] {
  if (retried === undefined || retried.length === 0) return []
  return [
    `${indent}test 步定向重跑 ${retried.length} 个测试文件（重跑才过的也在内）：`,
    ...retried.map(
      entry =>
        `${indent}  ${entry.file}（${entry.tier}，${entry.kind}：${entry.firstError}）→ ${entry.retryResult}`,
    ),
  ]
}

/** 按 F 的树在本树 `tmp/admission/*.json` 里找；同树且可采用的取最晚结束的那份。 */
function searchByTree(root: string, forRef: string, target: CommitTree): AdmissionEvidence {
  const all = recordsIn(root).map(path => judge(root, path, target))
  const sameTree = all.filter(judged => judged.tree === target.tree)
  const usable = sameTree
    .filter(judged => judged.accepted !== undefined)
    .sort((a, b) => (a.accepted?.finishedAt ?? '').localeCompare(b.accepted?.finishedAt ?? ''))
    .at(-1)
  const accepted = usable === undefined ? undefined : accept(target, usable)
  if (accepted !== undefined) return accepted
  if (sameTree.length > 0)
    return {
      kind: 'rejected',
      forRef,
      target,
      reasons: [],
      records: sameTree.map(judged => judged.finding),
    }
  const unknownTree = all.filter(judged => judged.tree === undefined)
  return {
    kind: 'rejected',
    forRef,
    target,
    reasons: [
      reject(
        'no-matching-record',
        `${ADMISSION_RECORD_DIR} 下没有树 ${target.tree} 的记录（共 ${all.length} 份，其中 ${unknownTree.length} 份看不出树）`,
      ),
    ],
    records: unknownTree.map(judged => judged.finding),
  }
}

/** 核对 F 上有没有可采用的全量准入；只读，不写任何文件。仓库本身出错（`root` 不是 git 检出等）照常抛出。 */
export function admissionEvidence(root: string, request: EvidenceRequest): AdmissionEvidence {
  const forRef = request.for
  const commit = resolveObject(root, `${forRef}^{commit}`)
  const tree = commit === undefined ? undefined : resolveObject(root, `${commit}^{tree}`)
  if (commit === undefined || tree === undefined)
    return {
      kind: 'rejected',
      forRef,
      target: undefined,
      reasons: [reject('target-missing', `F=${forRef} 在本仓库里解析不出提交`)],
      records: [],
    }
  const target = { commit, tree }
  if (request.record === undefined) return searchByTree(root, forRef, target)
  const judged = judge(root, resolve(root, request.record), target)
  return (
    accept(target, judged) ?? {
      kind: 'rejected',
      forRef,
      target,
      reasons: [],
      records: [judged.finding],
    }
  )
}

/** 给人读的结论：接受时一行；拒绝时先一行结论，再逐项列原因。 */
export function formatEvidence(evidence: AdmissionEvidence): string[] {
  if (evidence.kind === 'accepted') {
    const { target, source, record, caches, resumedFrom } = evidence
    const composed =
      resumedFrom === undefined ? '' : `（H1 ${resumedFrom} 的全量准入＋ C 上的增量准入）`
    return [
      `F ${target.commit} 采用 C ${source.commit} 的全量准入${composed}，树 ${target.tree} 相同；记录 ${record}；` +
        `缓存 test=${caches.test}, depGraph=${caches.depGraph}, mutation=${caches.mutation}`,
      ...retriedLines(evidence.retried, ''),
    ]
  }
  const { forRef, target, reasons, records } = evidence
  const subject = target === undefined ? `F ${forRef}` : `F ${target.commit}（树 ${target.tree}）`
  return [
    `${subject} 没有可采用的全量准入：`,
    ...reasons.map(reason => `  - ${reason.message}`),
    ...records.flatMap(finding => [
      `  记录 ${finding.record}：`,
      ...finding.reasons.map(reason => `    - ${reason.message}`),
      ...retriedLines(finding.retried, '    '),
    ]),
  ]
}

export interface CommandOutput {
  readonly out: (text: string) => void
  readonly err: (text: string) => void
}

const STANDARD_OUTPUT: CommandOutput = {
  out: text => process.stdout.write(text),
  err: text => process.stderr.write(text),
}

/** `admission-evidence` 子命令：接受 0、拒绝 1、用法错误 2。 */
export function admissionEvidenceCommand(
  root: string,
  argv: readonly string[],
  output: CommandOutput = STANDARD_OUTPUT,
): 0 | 1 | 2 {
  let forRef: string | undefined
  let record: string | undefined
  try {
    const flags = parseFlags(argv, ['--for', '--record'], [], `用法：\n${ADMISSION_EVIDENCE_USAGE}`)
    forRef = flags.values.get('--for')
    record = flags.values.get('--record')
  } catch (error) {
    output.err(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  if (forRef === undefined) {
    output.err(`admission-evidence 需要 --for <F>\n用法：\n${ADMISSION_EVIDENCE_USAGE}\n`)
    return 2
  }
  const evidence = admissionEvidence(
    root,
    record === undefined ? { for: forRef } : { for: forRef, record },
  )
  output.out(`${formatEvidence(evidence).join('\n')}\n`)
  return evidence.kind === 'accepted' ? 0 : 1
}
