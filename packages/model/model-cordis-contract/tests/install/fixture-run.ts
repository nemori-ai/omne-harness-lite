// The steps of a fixture run that happen inside the consumer directory: compile `fixture.ts`
// against what was installed, run its paths in a child process whose resolve hook records every
// resolution, and judge what the fixture reported.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declarationProblems, type PathResult } from '../fixture-runner.ts'
import {
  judgeResolutions,
  judgeTypeFiles,
  listedFiles,
  resolutionLog,
  type Check,
} from './judgment.ts'
import { compilerCommand, diagnostics, exec, libraryRoot, tail } from './process.ts'

const SOURCE = 'fixture'
const OUTPUT = 'fixture-out'
const REPORT = 'fixture-report.json'
/** A path that never settles must not hold the facility for ever; real paths take milliseconds. */
export const FIXTURE_RUN_LIMIT_MS = 60_000

const here = dirname(fileURLToPath(import.meta.url))

/** What the fixture process reported: the role and what each path did. */
export type FixtureOutcome = Readonly<{ role: string; paths: readonly PathResult[] }>

/** Copies the TypeScript files and the compiler settings of a fixture next to the consumer project. */
export function copyFixture({
  project,
  directory,
}: Readonly<{ project: string; directory: string }>): void {
  const target = join(project, SOURCE)
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(directory, { withFileTypes: true }))
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name === 'tsconfig.json'))
      copyFileSync(join(directory, entry.name), join(target, entry.name))
}

/**
 * Compiles the fixture with the settings it brings, then judges which files the compiler loaded:
 * an import that only an ancestor `node_modules` could answer fails here, as does one that no
 * installed package answers.
 */
export function compileFixture(project: string): { files: number; checks: Check[] } {
  const run = exec(
    process.execPath,
    [
      compilerCommand(),
      '-p',
      join(SOURCE, 'tsconfig.json'),
      '--noEmit',
      'false',
      '--outDir',
      OUTPUT,
      '--listFiles',
    ],
    project,
  )
  if (run.status !== 0)
    return {
      files: 0,
      checks: [
        { id: 'fixture-compile', ok: false, detail: diagnostics(run.stdout) || tail(run.stderr) },
      ],
    }
  const files = listedFiles(run.stdout)
  const verdict = judgeTypeFiles(files, project, libraryRoot())
  return {
    files: files.length,
    checks: [
      {
        id: 'fixture-compile',
        ok: true,
        detail: 'the fixture compiles against the installed packages',
      },
      { id: 'fixture-type-resolution-inside-consumer', ok: verdict.ok, detail: verdict.detail },
    ],
  }
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPathResult(value: unknown): value is PathResult {
  if (!isRecord(value)) return false
  const { name, kind, decision, ok, error } = value
  return (
    typeof name === 'string' &&
    (kind === 'normal' || kind === 'failure') &&
    typeof ok === 'boolean' &&
    (decision === undefined || typeof decision === 'string') &&
    (error === undefined || typeof error === 'string')
  )
}

/** The report of a fixture process, or null when the file does not hold the agreed shape. */
export function readOutcome(path: string): FixtureOutcome | null {
  if (!existsSync(path)) return null
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
  if (!isRecord(value) || typeof value['role'] !== 'string') return null
  const paths = value['paths']
  if (!Array.isArray(paths) || !paths.every(isPathResult)) return null
  return { role: value['role'], paths }
}

/**
 * The two judgments of a report: whether the fixture declares what the runner demands, and whether
 * every path did what it should. They are separate checks, so a fixture with no failure path and a
 * fixture with a broken path are told apart.
 */
export function judgeOutcome(outcome: FixtureOutcome, expectedRole: string): Check[] {
  const problems = [
    ...(outcome.role === expectedRole
      ? []
      : [`the fixture says its role is ${outcome.role}, its manifest says ${expectedRole}`]),
    ...declarationProblems(outcome),
  ]
  const broken = outcome.paths.filter(path => !path.ok)
  return [
    {
      id: 'fixture-report',
      ok: problems.length === 0,
      detail: problems.join('; ') || `${outcome.paths.length} paths declared`,
    },
    {
      id: 'fixture-paths',
      ok: broken.length === 0,
      detail:
        broken.map(path => `${path.name}: ${path.error ?? 'failed'}`).join('; ') ||
        `${outcome.paths.length} paths passed`,
    },
  ]
}

/** How the fixture process ended, with the line of the error it died of when there is one. */
function exitDetail(run: ReturnType<typeof exec>): string {
  const how = run.signal === null ? `exit ${run.status}` : `killed by ${run.signal}`
  const thrown = run.stderr.split('\n').find(line => /^\w*Error\b/u.test(line))
  return `${how}: ${thrown ?? tail(`${run.stdout}\n${run.stderr}`)}`
}

/**
 * Runs the compiled fixture in the consumer directory with the recording resolve hook, then judges
 * the resolutions and the report. A fixture whose resolutions leave the directory fails even when
 * every path passed.
 */
export function runFixture({
  project,
  expectedRole,
  limitMs = FIXTURE_RUN_LIMIT_MS,
  execute = exec,
}: Readonly<{
  project: string
  expectedRole: string
  /** The time limit of the fixture process; `FIXTURE_RUN_LIMIT_MS` when not given. */
  limitMs?: number
  /** Starts the fixture process. Only a test replaces it, to read the limit that is passed. */
  execute?: typeof exec
}>): { outcome: FixtureOutcome | null; checks: Check[] } {
  for (const file of ['fixture-host.mjs', 'register.mjs'])
    copyFileSync(join(here, file), join(project, file))
  const log = join(project, 'resolutions.jsonl')
  const report = join(project, REPORT)
  writeFileSync(log, '')
  const run = execute(
    process.execPath,
    ['--import', './register.mjs', './fixture-host.mjs', REPORT],
    project,
    { PROBE_RESOLUTIONS: log },
    limitMs,
  )
  if (run.status !== 0)
    return { outcome: null, checks: [{ id: 'fixture-run', ok: false, detail: exitDetail(run) }] }
  const urls = resolutionLog(log)
  const { outside, source } = judgeResolutions(urls, project)
  const checks: Check[] = [
    { id: 'fixture-run', ok: true, detail: 'the fixture process ran to its end' },
    {
      id: 'fixture-resolution-inside-consumer',
      ok: outside.length === 0,
      detail: outside.join(', ') || `${urls.length} resolutions`,
    },
    {
      id: 'fixture-resolution-no-source',
      ok: source.length === 0,
      detail: source.join(', ') || 'no source path resolved',
    },
  ]
  const outcome = readOutcome(report)
  if (outcome === null)
    return {
      outcome,
      checks: [
        ...checks,
        { id: 'fixture-report', ok: false, detail: 'the fixture process wrote no readable report' },
      ],
    }
  return { outcome, checks: [...checks, ...judgeOutcome(outcome, expectedRole)] }
}
