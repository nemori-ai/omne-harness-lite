import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { CheckStep, GraphRun } from './check-graph.ts'
import { parseEnvironmentHealing, type EnvironmentHealing } from './environment.ts'
import {
  parseFailedFiles,
  parseRetriedFiles,
  type FailedFile,
  type RetriedFile,
} from './test-retry.ts'

export const ADMISSION_RUN_SCHEMA_VERSION = 1
export const ADMISSION_RUN_KIND = 'admission-run'
export const RUN_RECORD_FILE = 'run.json'
export const ADMISSION_RECORD_DIR = 'tmp/admission'
export const CHECK_RUN_RECORD_DIR = 'tmp/check-run'

export type AdmissionMode = 'full' | 'affected' | 'resume'

export type CacheState = 'on' | 'off' | 'unknown'
export const CACHE_STATES: readonly CacheState[] = ['on', 'off', 'unknown']

export interface CacheStates {
  readonly test: CacheState
  readonly depGraph: CacheState
}

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

export interface ResumeOrigin {
  readonly head: string
  readonly tree: string
  readonly failedStep: string
  readonly mode: 'full' | 'affected'
  readonly fullRequested: boolean
}

interface AdmissionRunCommon {
  readonly schemaVersion: typeof ADMISSION_RUN_SCHEMA_VERSION
  readonly kind: typeof ADMISSION_RUN_KIND
  readonly head: string
  readonly tree: string
  readonly dirty: boolean
  readonly worktree: string
  readonly admission: boolean
  readonly caches: CacheStates
  readonly fullRequested: boolean
  readonly base: string | null
  readonly steps: readonly AdmissionStep[]
  readonly failedStep: string | null
  readonly startedAt: string
  readonly finishedAt: string
  readonly environment?: EnvironmentHealing
  readonly retried?: readonly RetriedFile[]
  readonly testFailures?: readonly FailedFile[]
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
  const { test, depGraph } = value
  if (!isCacheState(test) || !isCacheState(depGraph)) return undefined
  return { test, depGraph }
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
  const { head, tree, failedStep, mode, fullRequested } = value
  if (!isSha(head) || !isSha(tree) || typeof failedStep !== 'string' || failedStep === '')
    return undefined
  if (mode !== 'full' && mode !== 'affected') return undefined
  if (typeof fullRequested !== 'boolean') return undefined
  return { head, tree, failedStep, mode, fullRequested }
}

function parseCommon(value: Record<string, unknown>): AdmissionRunCommon | undefined {
  const {
    schemaVersion,
    kind,
    head,
    tree,
    dirty,
    worktree,
    admission,
    caches,
    fullRequested,
    base,
    steps,
    failedStep,
    startedAt,
    finishedAt,
    environment,
    retried,
    testFailures,
  } = value
  if (schemaVersion !== ADMISSION_RUN_SCHEMA_VERSION || kind !== ADMISSION_RUN_KIND)
    return undefined
  const parsedRetried = retried === undefined ? undefined : parseRetriedFiles(retried)
  if (retried !== undefined && parsedRetried === undefined) return undefined
  const parsedFailures = testFailures === undefined ? undefined : parseFailedFiles(testFailures)
  if (testFailures !== undefined && parsedFailures === undefined) return undefined
  const parsedEnvironment =
    environment === undefined ? undefined : parseEnvironmentHealing(environment)
  if (environment !== undefined && parsedEnvironment === undefined) return undefined
  if (!isSha(head) || !isSha(tree) || typeof dirty !== 'boolean') return undefined
  if (typeof worktree !== 'string' || worktree === '') return undefined
  if (typeof admission !== 'boolean' || typeof fullRequested !== 'boolean') return undefined
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
    worktree,
    admission,
    caches: parsedCaches,
    fullRequested,
    base,
    steps: parsed,
    failedStep,
    startedAt,
    finishedAt,
    ...(parsedEnvironment === undefined ? {} : { environment: parsedEnvironment }),
    ...(parsedRetried === undefined ? {} : { retried: parsedRetried }),
    ...(parsedFailures === undefined ? {} : { testFailures: parsedFailures }),
  }
}

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

export function writeAdmissionRun(path: string, run: AdmissionRun): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(run, null, 1)}\n`)
  renameSync(temporary, path)
}

export function worktreeRoot(root: string): string {
  return realpathSync.native(root)
}

export function recordPathBesideLog(logPath: string): string {
  return logPath.endsWith('.log') ? `${logPath.slice(0, -'.log'.length)}.json` : `${logPath}.json`
}

export interface AdmissionRunInputs {
  readonly steps: readonly CheckStep[]
  readonly run: GraphRun
  readonly head: string
  readonly tree: string
  readonly dirty: boolean
  readonly worktree: string
  readonly admission: boolean
  readonly caches: CacheStates
  readonly fullRequested: boolean
  readonly base: string | null
  readonly startedAt: Date
  readonly finishedAt: Date
  readonly environment?: EnvironmentHealing
  readonly testReport?: {
    readonly retried: readonly RetriedFile[]
    readonly failures: readonly FailedFile[]
  }
  readonly origin:
    | { readonly mode: 'full' | 'affected' }
    | { readonly mode: 'resume'; readonly from: ResumeOrigin }
}

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
    worktree: inputs.worktree,
    admission: inputs.admission,
    caches: inputs.caches,
    fullRequested: inputs.fullRequested,
    base: inputs.base,
    steps,
    failedStep: failed?.name ?? null,
    startedAt: inputs.startedAt.toISOString(),
    finishedAt: inputs.finishedAt.toISOString(),
    ...(inputs.environment === undefined ? {} : { environment: inputs.environment }),
    ...(inputs.testReport === undefined
      ? {}
      : { retried: inputs.testReport.retried, testFailures: inputs.testReport.failures }),
  }
  return inputs.origin.mode === 'resume'
    ? { ...common, mode: 'resume', resumeFrom: inputs.origin.from }
    : { ...common, mode: inputs.origin.mode, resumeFrom: null }
}

function listJson(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .map(name => join(directory, name))
}

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

export function latestResumeOrigin(
  runs: readonly AdmissionRun[],
  head: string,
): AdmissionRun | undefined {
  return runs
    .filter(run => run.head === head && run.mode !== 'resume' && run.admission && !run.dirty)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .at(-1)
}
