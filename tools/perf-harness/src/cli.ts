import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { besideOf, checkoutOf, watch } from './environment/collect.ts'
import type { Sources } from './environment/field.ts'
import type { CommitSettings, Probe } from './environment/probes.ts'
import { fitnessOf, idsOf, type Environment } from './environment/record.ts'
import type { Blocked } from './judgment/growth.ts'
import type { PairedVerdict } from './judgment/paired.ts'
import { baselineOf, compareCounts, readBaseline, writeBaseline } from './result/baseline.ts'
import { reportOf } from './result/report.ts'
import {
  FACILITY,
  outcomeOf,
  readResult,
  writeResult,
  type Outcome,
  type Result,
} from './result/result.ts'
import { runPaired, type PairedRun } from './suite/paired-run.ts'
import { affected, select, type Measured, type Plan, type Suite } from './suite/suite.ts'

export type Io = Readonly<{ out: (line: string) => void; err: (line: string) => void }>

export type Setting = Readonly<{
  root: string
  suites: readonly Suite[]
  baselines: string
  results: string
  scratch: string
  pinnedNode: string
  sources: Sources
  probe?: (dataDirectory: string, settings: CommitSettings) => Probe
  now: () => Date
  prepare?: (commit: string) => Promise<string | Blocked>
}>

const USAGE = [
  'Usage: perf <command>',
  '  env [suite] [--tier <tier>]     print the record of this machine, the identifiers and whether',
  '                                  there is a baseline; runs no suite',
  '  run [suite ...] [--tier <tier>] [--out <directory>] [--write-baseline]',
  '                                  run suites; write a result and print a report for each',
  '  compare <base> <candidate> [suite ...] [--tier <tier>] [--counts-only]',
  '                                  two commits: run both and compare the counts item by item, then',
  '                                  time them in rounds of base, base again, candidate.',
  '                                  two result directories: compare their counts',
  '  affected --base <commit>        list the suites the changes since a commit may move',
  '  report <result directory>       print the report of a result again',
  'Exit: 0 pass; 1 a gate failed, counts differ or the candidate is slower; 2 blocked or wrong use.',
].join('\n')

const EXIT: Readonly<Record<Outcome, number>> = { pass: 0, fail: 1, blocked: 2 }

type Parsed = Readonly<{ names: readonly string[]; options: ReadonlyMap<string, string | true> }>

const VALUED = new Set(['--tier', '--out', '--base'])
const FLAGS = new Set(['--write-baseline', '--counts-only'])

function parse(args: readonly string[]): Parsed | string {
  const names: string[] = []
  const options = new Map<string, string | true>()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (!arg.startsWith('--')) names.push(arg)
    else if (FLAGS.has(arg)) options.set(arg, true)
    else if (!VALUED.has(arg)) return `unknown option ${arg}`
    else {
      const value = args[(index += 1)]
      if (value === undefined) return `${arg} needs a value`
      options.set(arg, value)
    }
  }
  return { names, options }
}

const text = (options: Parsed['options'], name: string): string | undefined => {
  const value = options.get(name)
  return typeof value === 'string' ? value : undefined
}

type Chosen = Readonly<{ suite: Suite; tier: string }>

function choose(
  setting: Setting,
  names: readonly string[],
  options: Parsed['options'],
): readonly Chosen[] | string {
  const listed = `there are: ${setting.suites.map(one => one.id).join(', ') || 'none'}`
  const chosen = select(setting.suites, names)
  if ('unknown' in chosen) return `no suite named ${chosen.unknown.join(', ')}; ${listed}`
  if (chosen.suites.length === 0) return 'no suite is registered'
  const picked: Chosen[] = []
  for (const suite of chosen.suites) {
    const tier = text(options, '--tier') ?? suite.tiers[0]
    if (tier === undefined || !suite.tiers.includes(tier))
      return `${suite.id} has the tiers ${suite.tiers.join(', ')}`
    picked.push({ suite, tier })
  }
  return picked
}

const NO_PLAN: Plan = {
  workload: null,
  assembly: null,
  settings: { journalMode: 'wal', synchronous: 'full' },
  release: false,
}

const NOTHING: Measured = { readings: [], gates: [], controls: [], digests: [] }

async function recorded(
  setting: Setting,
  root: string,
  one: Chosen | null,
  work: (dataDirectory: string) => Promise<Measured>,
): Promise<Result> {
  const plan = one === null ? NO_PLAN : one.suite.plan(one.tier)
  mkdirSync(setting.scratch, { recursive: true })
  const dataDirectory = mkdtempSync(join(setting.scratch, 'perf-'))
  try {
    const watching = watch(setting.sources, {
      dataDirectory,
      settings: plan.settings,
      ...(setting.probe === undefined ? {} : { probe: setting.probe }),
    })
    const outcome = await work(dataDirectory)
    const { state, last } = watching.end()
    const environment: Environment = {
      machine: watching.machine,
      beside: besideOf(setting.sources),
      subject: {
        ...checkoutOf(setting.sources, root),
        release: plan.release,
        assembly: plan.assembly,
        workload: plan.workload,
      },
      state,
      probes: { first: watching.first, last },
    }
    return {
      schema: 1,
      facility: FACILITY,
      suite: one?.suite.id ?? '',
      tier: one?.tier ?? '',
      ids: idsOf(environment),
      environment,
      fitness: fitnessOf(environment, setting.pinnedNode),
      ...outcome,
      limits: one?.suite.limits ?? [],
    }
  } finally {
    rmSync(dataDirectory, { recursive: true, force: true })
  }
}

const measured = (setting: Setting, root: string, one: Chosen): Promise<Result> =>
  recorded(setting, root, one, dataDirectory =>
    one.suite.measure(one.tier, { root, dataDirectory }),
  )

async function env(setting: Setting, parsed: Parsed, io: Io): Promise<number> {
  const chosen =
    parsed.names.length === 0 ? [] : choose(setting, parsed.names.slice(0, 1), parsed.options)
  if (typeof chosen === 'string') {
    io.err(chosen)
    return 2
  }
  const one = chosen[0] ?? null
  const result = await recorded(setting, setting.root, one, () => Promise.resolve(NOTHING))
  const counts = one === null ? null : readBaseline(setting.baselines, one.suite.id, one.tier)
  io.out(
    JSON.stringify(
      {
        facility: FACILITY,
        ids: one === null ? { config: result.ids.config } : result.ids,
        suites: setting.suites.map(suite => ({
          id: suite.id,
          tiers: suite.tiers,
          title: suite.title,
        })),
        baselines: {
          counts:
            one === null
              ? 'name a suite to see its baseline of counts'
              : counts === null
                ? 'none'
                : {
                    commit: counts.commit,
                    sameQuestion:
                      counts.workload === result.ids.workload &&
                      counts.assembly === result.ids.assembly,
                  },
          timesOfThisMachine: existsSync(
            join(setting.baselines, 'machines', `${result.ids.config}.json`),
          )
            ? 'present'
            : 'none',
        },
        pinnedNode: setting.pinnedNode,
        fitness: result.fitness,
        environment: result.environment,
      },
      null,
      2,
    ),
  )
  return 0
}

const stamp = (at: Date): string => at.toISOString().replaceAll(/[:.]/g, '-')

async function run(setting: Setting, parsed: Parsed, io: Io): Promise<number> {
  const chosen = choose(setting, parsed.names, parsed.options)
  if (typeof chosen === 'string') {
    io.err(chosen)
    return 2
  }
  const out = text(parsed.options, '--out') ?? join(setting.results, stamp(setting.now()))
  let worst = 0
  for (const one of chosen) {
    const result = await measured(setting, setting.root, one)
    const directory = join(out, `${one.suite.id}.${one.tier}`)
    writeResult(directory, result)
    const baseline = readBaseline(setting.baselines, one.suite.id, one.tier)
    io.out(reportOf(result, compareCounts(baseline, result)))
    io.out(`Result: ${directory}`)
    worst = Math.max(worst, EXIT[outcomeOf(result)])
    if (!parsed.options.has('--write-baseline')) continue
    const made = baselineOf(result)
    if ('state' in made) {
      io.err(`${one.suite.id}: no baseline written: ${made.reason}`)
      worst = Math.max(worst, 2)
    } else io.out(`Baseline: ${writeBaseline(setting.baselines, made)}`)
  }
  return worst
}

function compareResults(directories: readonly string[], io: Io): number {
  const [base, candidate] = directories.map(readResult) as [Result | Blocked, Result | Blocked]
  if ('state' in base || 'state' in candidate) {
    io.err('state' in base ? base.reason : (candidate as Blocked).reason)
    return 2
  }
  const baseline = baselineOf(base)
  if ('state' in baseline) {
    io.err(`the base result cannot be compared against: ${baseline.reason}`)
    return 2
  }
  const compared = compareCounts(baseline, candidate)
  io.out(reportOf(candidate, compared))
  if (compared.state === 'equal') return EXIT[outcomeOf(candidate)]
  return compared.state === 'different' ? 1 : 2
}

const band = (verdict: PairedVerdict): string => {
  const share = (value: number): string => `${(value * 100).toFixed(1)}%`
  if (verdict.noise === null || verdict.change === null || verdict.median === null)
    return verdict.reason
  return `median ${share(verdict.median)}, middle half ${share(verdict.change.low)} to ${share(verdict.change.high)}, noise ${share(verdict.noise.low)} to ${share(verdict.noise.high)}, least ${verdict.least?.base.toFixed(0) ?? '?'} against ${verdict.least?.candidate.toFixed(0) ?? '?'}`
}

function timed(suite: string, paired: PairedRun, io: Io): number {
  if (paired.equivalence.state === 'unstable') {
    io.out(
      `${suite}: the output of the base differs between two of its own runs, first at item ${String(paired.equivalence.first)}: nothing can be judged`,
    )
    return 2
  }
  if (paired.equivalence.state === 'different' || paired.verdicts === null) {
    const first = paired.equivalence.state === 'different' ? paired.equivalence.first : 0
    io.out(
      `${suite}: the candidate does not do the same work as the base, first at item ${String(first)}: speed is not judged`,
    )
    return 1
  }
  const verdicts = Object.entries(paired.verdicts)
  for (const [measure, verdict] of verdicts)
    io.out(
      `${suite}: ${measure} ${verdict.state} after ${String(paired.rounds)} rounds (${band(verdict)})`,
    )
  const decisive = verdicts[0]?.[1].state
  return decisive === 'slower' ? 1 : decisive === 'insufficient' || decisive === undefined ? 2 : 0
}

async function compareCommits(setting: Setting, parsed: Parsed, io: Io): Promise<number> {
  const [base = '', candidate = '', ...names] = parsed.names
  const chosen = choose(setting, names, parsed.options)
  if (typeof chosen === 'string' || setting.prepare === undefined) {
    io.err(
      typeof chosen === 'string'
        ? chosen
        : 'two commits cannot be compared here: nothing prepares a checkout',
    )
    return 2
  }
  const roots = { base: await setting.prepare(base), candidate: await setting.prepare(candidate) }
  if (typeof roots.base !== 'string' || typeof roots.candidate !== 'string') {
    io.err(typeof roots.base !== 'string' ? roots.base.reason : (roots.candidate as Blocked).reason)
    return 2
  }
  const rootOf = { base: roots.base, self: roots.base, candidate: roots.candidate }
  let worst = 0
  for (const one of chosen) {
    const from = await measured(setting, roots.base, one)
    const to = await measured(setting, roots.candidate, one)
    const baseline = baselineOf(from)
    const compared = 'state' in baseline ? baseline : compareCounts(baseline, to)
    io.out(reportOf(to, compared))
    worst = Math.max(
      worst,
      compared.state === 'equal' ? EXIT[outcomeOf(to)] : compared.state === 'different' ? 1 : 2,
    )
    if (parsed.options.has('--counts-only')) continue
    if (to.fitness.times === 'blocked') {
      io.out(`${one.suite.id}: times are blocked on this machine: ${to.fitness.reasons.join('; ')}`)
      worst = Math.max(worst, 2)
      continue
    }
    const paired = await runPaired(async side => {
      mkdirSync(setting.scratch, { recursive: true })
      const dataDirectory = mkdtempSync(join(setting.scratch, 'perf-'))
      try {
        return await one.suite.sample(one.tier, { root: rootOf[side], dataDirectory })
      } finally {
        rmSync(dataDirectory, { recursive: true, force: true })
      }
    })
    worst = Math.max(worst, timed(one.suite.id, paired, io))
  }
  return worst
}

function compare(setting: Setting, parsed: Parsed, io: Io): Promise<number> | number {
  if (parsed.names.length < 2) {
    io.err('compare needs a base and a candidate: two commits, or two result directories')
    return 2
  }
  const pair = parsed.names.slice(0, 2)
  return pair.every(name => existsSync(join(name, 'result.json')))
    ? compareResults(pair, io)
    : compareCommits(setting, parsed, io)
}

function changedSince(setting: Setting, parsed: Parsed, io: Io): number {
  const base = text(parsed.options, '--base')
  const changed =
    base === undefined
      ? null
      : setting.sources.run('git', ['-C', setting.root, 'diff', '--name-only', `${base}...HEAD`])
  if (base === undefined || changed === null) {
    io.err(
      base === undefined
        ? 'affected needs --base <commit>'
        : `cannot list the changes since ${base}`,
    )
    return 2
  }
  for (const suite of affected(setting.suites, changed.split('\n').filter(Boolean)))
    io.out(suite.id)
  return 0
}

function report(setting: Setting, parsed: Parsed, io: Io): number {
  const result = parsed.names[0] === undefined ? undefined : readResult(parsed.names[0])
  if (result === undefined || 'state' in result) {
    io.err(result === undefined ? 'report needs a result directory' : result.reason)
    return 2
  }
  const baseline = readBaseline(setting.baselines, result.suite, result.tier)
  io.out(reportOf(result, compareCounts(baseline, result)))
  return EXIT[outcomeOf(result)]
}

export async function perf(args: readonly string[], setting: Setting, io: Io): Promise<number> {
  const [command, ...rest] = args
  const parsed = parse(rest)
  if (command === undefined || command === '--help' || command === 'help') {
    io.out(USAGE)
    return command === undefined ? 2 : 0
  }
  if (typeof parsed === 'string') {
    io.err(`${parsed}\n${USAGE}`)
    return 2
  }
  switch (command) {
    case 'env':
      return env(setting, parsed, io)
    case 'run':
      return run(setting, parsed, io)
    case 'compare':
      return compare(setting, parsed, io)
    case 'affected':
      return changedSince(setting, parsed, io)
    case 'report':
      return report(setting, parsed, io)
    default:
      io.err(`unknown command ${command}\n${USAGE}`)
      return 2
  }
}
