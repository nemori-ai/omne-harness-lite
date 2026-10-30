// 准入运行记录：`pnpm run check` 的准入模式每次运行写一份 JSON，记下在哪个提交、哪棵树上、以什么模式跑了哪些步骤、
// 各自的退出码与快速失败的那一步。`check --resume-from <H1>`（resume.ts）读 H1 的记录决定能不能接续；
// dev-flow 的放行核对按 `tree` 复用树相同的全量记录。形状是本线定下的接口（schemaVersion 1），两边都按它读。
// 读取只信边界上解析过的记录：解析失败、形状不对都按「没有记录」处理，不猜。写入先写临时名再改名，半截文件不会被读成记录。
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { CheckStep, GraphRun } from './check-graph.ts'

export const ADMISSION_RUN_SCHEMA_VERSION = 1
export const ADMISSION_RUN_KIND = 'admission-run'
/** 每次运行在 `tmp/check-run/<短号>/` 留的副本文件名。 */
export const RUN_RECORD_FILE = 'run.json'
/** 文本准入日志的目录（与 check.ts 的 `ADMISSION_LOG_DIR` 同值；这里不导入 check.ts，免得把运行正文拉进只读记录的模块）。 */
export const ADMISSION_RECORD_DIR = 'tmp/admission'
export const CHECK_RUN_RECORD_DIR = 'tmp/check-run'

export type AdmissionMode = 'full' | 'affected' | 'resume'

/** 运行时一种缓存开没开；读不出来记 `unknown`。 */
export type CacheState = 'on' | 'off' | 'unknown'
export const CACHE_STATES: readonly CacheState[] = ['on', 'off', 'unknown']

/** 这次运行时各缓存的状态：测试结果缓存、依赖图缓存、变异增量。放行时拿它核对「没有用缓存给自己作证」。 */
export interface CacheStates {
  readonly test: CacheState
  readonly depGraph: CacheState
  readonly mutation: CacheState
}

/** 一步的结果：跑完了有退出码；没跑到（没开始或被终止）没有。 */
export type AdmissionStep =
  | {
      readonly name: string
      readonly ran: true
      readonly exit: number
      readonly seconds: number
    }
  | {
      readonly name: string
      readonly ran: false
      readonly exit: null
      readonly seconds: number
    }

/** 接续模式的来源：H1 的头、树与它快速失败的那一步。 */
export interface ResumeOrigin {
  readonly head: string
  readonly tree: string
  readonly failedStep: string
}

interface AdmissionRunCommon {
  readonly schemaVersion: typeof ADMISSION_RUN_SCHEMA_VERSION
  readonly kind: typeof ADMISSION_RUN_KIND
  /** 40 位提交号。 */
  readonly head: string
  /** `git rev-parse HEAD^{tree}`。 */
  readonly tree: string
  /** 运行时工作树有未提交改动：这样的记录不是对 `head` 的证据。 */
  readonly dirty: boolean
  /** 这次运行是准入（`OMNE_ADMISSION=1` 或 `--admission`）；只有准入运行写 `tmp/admission/`，也只有它能被接续或复用。 */
  readonly admission: boolean
  readonly caches: CacheStates
  /** 影响面基线；全量没有。 */
  readonly base: string | null
  readonly steps: readonly AdmissionStep[]
  /** 快速失败的那一步（最早结束的失败步骤）；全部通过为 null。 */
  readonly failedStep: string | null
  readonly startedAt: string
  readonly finishedAt: string
}

export type AdmissionRun =
  | (AdmissionRunCommon & { readonly mode: 'full' | 'affected'; readonly resumeFrom: null })
  | (AdmissionRunCommon & { readonly mode: 'resume'; readonly resumeFrom: ResumeOrigin })

const SHA = /^[0-9a-f]{40}$/u

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSha = (value: unknown): value is string => typeof value === 'string' && SHA.test(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isCacheState = (value: unknown): value is CacheState =>
  typeof value === 'string' && (CACHE_STATES as readonly string[]).includes(value)

function parseCaches(value: unknown): CacheStates | undefined {
  if (!isRecord(value)) return undefined
  const { test, depGraph, mutation } = value
  if (!isCacheState(test) || !isCacheState(depGraph) || !isCacheState(mutation)) return undefined
  return { test, depGraph, mutation }
}

function parseStep(value: unknown): AdmissionStep | undefined {
  if (!isRecord(value)) return undefined
  const { name, ran, exit, seconds } = value
  if (typeof name !== 'string' || name === '' || !isFiniteNumber(seconds)) return undefined
  if (ran === true && Number.isInteger(exit) && isFiniteNumber(exit))
    return { name, ran: true, exit, seconds }
  if (ran === false && exit === null) return { name, ran: false, exit: null, seconds }
  return undefined
}

function parseOrigin(value: unknown): ResumeOrigin | undefined {
  if (!isRecord(value)) return undefined
  const { head, tree, failedStep } = value
  if (!isSha(head) || !isSha(tree) || typeof failedStep !== 'string' || failedStep === '')
    return undefined
  return { head, tree, failedStep }
}

function parseCommon(value: Record<string, unknown>): AdmissionRunCommon | undefined {
  const {
    schemaVersion,
    kind,
    head,
    tree,
    dirty,
    admission,
    caches,
    base,
    steps,
    failedStep,
    startedAt,
    finishedAt,
  } = value
  if (schemaVersion !== ADMISSION_RUN_SCHEMA_VERSION || kind !== ADMISSION_RUN_KIND)
    return undefined
  if (!isSha(head) || !isSha(tree) || typeof dirty !== 'boolean') return undefined
  if (typeof admission !== 'boolean') return undefined
  const parsedCaches = parseCaches(caches)
  if (parsedCaches === undefined) return undefined
  if (base !== null && typeof base !== 'string') return undefined
  if (failedStep !== null && (typeof failedStep !== 'string' || failedStep === '')) return undefined
  if (typeof startedAt !== 'string' || typeof finishedAt !== 'string') return undefined
  if (!Array.isArray(steps)) return undefined
  const parsed: AdmissionStep[] = []
  for (const step of steps) {
    const entry = parseStep(step)
    if (entry === undefined) return undefined
    parsed.push(entry)
  }
  return {
    schemaVersion: ADMISSION_RUN_SCHEMA_VERSION,
    kind: ADMISSION_RUN_KIND,
    head,
    tree,
    dirty,
    admission,
    caches: parsedCaches,
    base,
    steps: parsed,
    failedStep,
    startedAt,
    finishedAt,
  }
}

/** 边界解析：不是 schemaVersion 1 的 `admission-run`，或任一栏形状不对，就不是记录。 */
export function parseAdmissionRun(value: unknown): AdmissionRun | undefined {
  if (!isRecord(value)) return undefined
  const common = parseCommon(value)
  if (common === undefined) return undefined
  const { mode, resumeFrom } = value
  if ((mode === 'full' || mode === 'affected') && resumeFrom === null)
    return { ...common, mode, resumeFrom }
  if (mode === 'resume') {
    const origin = parseOrigin(resumeFrom)
    return origin === undefined ? undefined : { ...common, mode, resumeFrom: origin }
  }
  return undefined
}

/** 读一份记录；文件不存在、不是 JSON、形状不对都返回 undefined。 */
export function readAdmissionRun(path: string): AdmissionRun | undefined {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  return parseAdmissionRun(parsed)
}

/** 原子写：先写同目录的临时名，再改名；读到的要么是旧的完整记录，要么是新的。 */
export function writeAdmissionRun(path: string, run: AdmissionRun): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(run, null, 1)}\n`)
  renameSync(temporary, path)
}

/** 文本准入日志旁边同名的记录：`tmp/admission/<时间>-<短号>.log` → `.json`。 */
export function recordPathBesideLog(logPath: string): string {
  return logPath.endsWith('.log') ? `${logPath.slice(0, -'.log'.length)}.json` : `${logPath}.json`
}

export interface AdmissionRunInputs {
  readonly steps: readonly CheckStep[]
  readonly run: GraphRun
  readonly head: string
  readonly tree: string
  readonly dirty: boolean
  readonly admission: boolean
  readonly caches: CacheStates
  readonly base: string | null
  readonly startedAt: Date
  readonly finishedAt: Date
  readonly origin:
    | { readonly mode: 'full' | 'affected' }
    | { readonly mode: 'resume'; readonly from: ResumeOrigin }
}

/**
 * 由一次步骤图运行写成记录：步骤按表的顺序；跑完的记退出码，被终止的与没开始的记 `ran: false`。
 * 快速失败的那一步是最早结束的失败步骤（`--keep-going` 时可能还有别的失败步骤，都在 `steps` 里）。
 */
export function admissionRunFrom(inputs: AdmissionRunInputs): AdmissionRun {
  const byName = new Map(inputs.run.results.map(result => [result.name, result]))
  const steps = inputs.steps.map((step): AdmissionStep => {
    const result = byName.get(step.name)
    const seconds = result === undefined ? 0 : (result.endedMs - result.startedMs) / 1000
    if (result === undefined || result.cancelled)
      return { name: step.name, ran: false, exit: null, seconds }
    return { name: step.name, ran: true, exit: result.exitCode, seconds }
  })
  const failed = inputs.run.results
    .filter(result => !result.cancelled && result.exitCode !== 0)
    .sort((a, b) => a.endedMs - b.endedMs)[0]
  const common: AdmissionRunCommon = {
    schemaVersion: ADMISSION_RUN_SCHEMA_VERSION,
    kind: ADMISSION_RUN_KIND,
    head: inputs.head,
    tree: inputs.tree,
    dirty: inputs.dirty,
    admission: inputs.admission,
    caches: inputs.caches,
    base: inputs.base,
    steps,
    failedStep: failed?.name ?? null,
    startedAt: inputs.startedAt.toISOString(),
    finishedAt: inputs.finishedAt.toISOString(),
  }
  return inputs.origin.mode === 'resume'
    ? { ...common, mode: 'resume', resumeFrom: inputs.origin.from }
    : { ...common, mode: inputs.origin.mode, resumeFrom: null }
}

/** 一份记录全部步骤都跑完且通过：`ran: false` 当作没通过。 */
export function allStepsPassed(run: AdmissionRun): boolean {
  return run.steps.length > 0 && run.steps.every(step => step.ran && step.exit === 0)
}

/**
 * 这份记录是不是一次完整通过的全量准入：准入运行、全量模式、工作树干净、没有失败步骤、全部步骤跑完且通过。
 * 放行核对按树哈希复用别的提交的全量准入时，只认满足它的记录。
 */
export function isCompleteFullAdmission(run: AdmissionRun): boolean {
  return (
    run.admission &&
    run.mode === 'full' &&
    !run.dirty &&
    run.failedStep === null &&
    allStepsPassed(run)
  )
}

function listJson(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .map(name => join(directory, name))
}

/** 检出里能找到的全部记录：`tmp/admission/*.json` 与 `tmp/check-run/<短号>/run.json`；读不出的跳过。 */
export function collectAdmissionRuns(root: string): AdmissionRun[] {
  const runDir = join(root, CHECK_RUN_RECORD_DIR)
  const copies = existsSync(runDir)
    ? readdirSync(runDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => join(runDir, entry.name, RUN_RECORD_FILE))
    : []
  return [...listJson(join(root, ADMISSION_RECORD_DIR)), ...copies].flatMap(path => {
    const run = readAdmissionRun(path)
    return run === undefined ? [] : [run]
  })
}

/** 某个提交最近一次干净的全量准入记录；非准入的、带未提交改动的不算。一个也没有返回 undefined。 */
export function latestCleanFullRun(
  runs: readonly AdmissionRun[],
  head: string,
): AdmissionRun | undefined {
  return runs
    .filter(run => run.head === head && run.mode === 'full' && run.admission && !run.dirty)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .at(-1)
}
