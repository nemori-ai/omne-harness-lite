import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { packJudge } from '@omne-harness/goal-contract'
import { SPLITS, type Case, type Split } from './case.ts'
import { datasetIssues, parentIssues } from './check.ts'
import { fileCache, openRouterDecide } from './client.ts'
import { DATA, digestOf, loadParents, loadSignOffs, unsigned, type SignOff } from './data.ts'
import { pairedLoss, renderComparison, spreadOf, talliesOf } from './compare.ts'
import { configOf } from './config.ts'
import { graded, pairs } from './grade.ts'
import { casesOf } from './mutate.ts'
import { replay, requestKey, type Decide, type Replayed } from './replay.ts'
import { renderReport, reportOf } from './report.ts'
import { flips } from './score.ts'

const USAGE = `goal-bench: the bench of the goal judge
  validate [--parent <id>]
      check the parents (one, or the whole set with its sign-offs) and list their cases
  sign --by <who>
      sign off every parent whose checks pass and whose sign-off is missing or out of date
  run --name <experiment> [--split tune|verify|canary|all] [--config <file.json>]
      [--key-file <file>] [--offline] [--repeats <n>] [--shuffle <seed>] [--max-cost <usd>] [--out <dir>]
      replay the judge over a split; keeps experiments/<name>/{report.json,replies.jsonl}
      and writes the page <out>/<name>/report.md (default: the system's temporary directory)
      --config   a partial configuration merged over the baseline scheme (configs/final.json is the default one)
      --offline  answer from the kept replies only; a request that is not kept fails the run
  show --case <parent>/<case> [--config <file.json>] [--ids <id>[,<id>…]]
      print what one case asks the judge under a configuration, what the kept reply answered
      and what the right answers are; sends nothing
  compare --name <comparison> --split <split>[,<split>…] --config <file.json> [--base <file.json>]
      [--key-file <file>] [--offline] [--max-cost <usd>] [--out <dir>]
      replay two configurations over the same cases and set them side by side;
      keeps experiments/<name>/compare.json and writes the page <out>/<name>/compare.md
      --base     the configuration compared against (default: the baseline scheme)
`
const EXPERIMENTS = join(DATA, '..', 'experiments')
const PRICE_GUESS = 0.0002

function validate(only: string | undefined): number {
  const all = loadParents()
  const parents = only === undefined ? all : all.filter(parent => parent.id === only)
  if (parents.length === 0) {
    console.error(`no parent ${String(only)}`)
    return 2
  }
  const issues =
    only === undefined
      ? [
          ...datasetIssues(parents),
          ...unsigned(parents, loadSignOffs()).map(id => `${id}: not signed off`),
        ]
      : parents.flatMap(parentIssues)
  for (const issue of issues) console.error(issue)
  if (issues.length > 0) return 1
  const cases = parents.flatMap(casesOf)
  for (const entry of cases)
    console.log(`${entry.id}\t${entry.family}\t${entry.split}\trow ${String(entry.expected.row)}`)
  console.log(`${String(parents.length)} parents, ${String(cases.length)} cases`)
  return 0
}

function sign(by: string | undefined, at: string): number {
  if (by === undefined) {
    console.error('sign needs --by <who>')
    return 2
  }
  const parents = loadParents()
  const kept = loadSignOffs().filter(entry =>
    parents.some(parent => parent.id === entry.parent && digestOf(parent) === entry.digest),
  )
  const added = parents
    .filter(parent => !kept.some(entry => entry.parent === parent.id))
    .flatMap((parent): SignOff[] => {
      const issues = parentIssues(parent)
      for (const issue of issues) console.error(issue)
      if (issues.length > 0) return []
      return [{ parent: parent.id, digest: digestOf(parent), checks: 'passed', signedBy: by, at }]
    })
  const all = [...kept, ...added].toSorted((a, b) => a.parent.localeCompare(b.parent))
  writeFileSync(join(DATA, 'signoff.json'), `${JSON.stringify(all, null, 2)}\n`)
  console.log(
    `${String(added.length)} signed now, ${String(all.length)} of ${String(parents.length)} signed`,
  )
  return all.length === parents.length ? 0 : 1
}

function casesIn(split: string): readonly Case[] {
  const cases = loadParents().flatMap(casesOf)
  if (split === 'all') return cases
  const wanted = split.split(',')
  for (const name of wanted)
    if (!SPLITS.includes(name as Split)) throw new Error(`no split ${name}`)
  return cases.filter(entry => wanted.includes(entry.split))
}

function replyFiles(name: string): readonly string[] {
  mkdirSync(join(EXPERIMENTS, name), { recursive: true })
  const others = readdirSync(EXPERIMENTS)
    .filter(entry => entry !== name)
    .map(entry => join(EXPERIMENTS, entry, 'replies.jsonl'))
  return [...others, join(EXPERIMENTS, name, 'replies.jsonl')]
}

type RunFlags = Readonly<{
  name?: string
  split?: string
  config?: string
  'key-file'?: string
  offline?: boolean
  repeats?: string
  shuffle?: string
  'max-cost'?: string
  out?: string
}>

const said = (replayed: Replayed): readonly string[] =>
  replayed.outcomes.flatMap(outcome => graded(outcome).map(entry => entry.said))

async function run(flags: RunFlags): Promise<number> {
  const { name, split = 'tune' } = flags
  if (name === undefined || !/^[a-z0-9][a-z0-9-]*$/u.test(name)) {
    console.error('run needs --name <experiment> in lower case, digits and dashes')
    return 2
  }
  const config = configOf(flags.config)
  const cases = casesIn(split)
  const repeats = Number(flags.repeats ?? '1')
  const cache = fileCache(replyFiles(name))
  const unkept = cases.flatMap(entry =>
    packJudge(entry.material, config).requests.filter(
      request => cache.get(requestKey({ ...request, model: config.model }, 0, 0)) === undefined,
    ),
  ).length
  const worst =
    unkept * config.votes * (repeats + (flags.shuffle === undefined ? 0 : 1)) * PRICE_GUESS
  const ceiling = Number(flags['max-cost'] ?? '1')
  if (worst > ceiling) {
    console.error(
      `this run may cost about ${worst.toFixed(2)} USD, over --max-cost ${String(ceiling)}`,
    )
    return 2
  }
  const offline: Decide = () =>
    Promise.reject(new Error('offline: a request is not among the kept replies'))
  const live = flags.offline === true ? null : openRouterDecide(flags['key-file'] ?? '')
  const options = { decide: live?.decide ?? offline, cache }
  try {
    const first = await replay(cases, config, options)
    const report = reportOf(name, config, split, first)
    const again: Replayed[] = []
    for (let repeat = 1; repeat < repeats; repeat += 1)
      again.push(await replay(cases, config, { ...options, repeat }))
    const readings = [first, ...again].map(said)
    const stability =
      repeats > 1
        ? flips(readings[0]!.map((_reading, index) => readings.map(run => run[index]!)))
        : null
    const moved =
      flags.shuffle === undefined
        ? null
        : said(await replay(cases, config, { ...options, shuffle: Number(flags.shuffle) }))
    const order =
      moved === null ? null : flips(readings[0]!.map((reading, index) => [reading, moved[index]!]))
    const whole = { ...report, stability, order }
    const out = join(EXPERIMENTS, name)
    writeFileSync(join(out, 'report.json'), `${JSON.stringify(whole, null, 2)}\n`)
    const pages = join(flags.out ?? join(tmpdir(), 'goal-bench'), name)
    mkdirSync(pages, { recursive: true })
    const extra = [
      stability === null
        ? ''
        : `稳定性：同一条目问 ${String(repeats)} 遍，读数不一致的占 ${(stability.rate * 100).toFixed(1)}%（${String(stability.errors)}/${String(stability.n)}）。`,
      order === null
        ? ''
        : `次序：打乱题目与证据的次序后，读数变了的占 ${(order.rate * 100).toFixed(1)}%（${String(order.errors)}/${String(order.n)}）。`,
    ].filter(Boolean)
    writeFileSync(
      join(pages, 'report.md'),
      `${renderReport(report)}${extra.length === 0 ? '' : `\n## 稳定性与次序\n\n${extra.join('\n\n')}\n`}`,
    )
    const { gates, ranking, cost } = report
    console.log(
      `${name}\t${split}\tcases ${String(report.cases)}\tfalse-holds ${String(gates.falseHolds.errors)}/${String(gates.falseHolds.n)}\tfalse-settles ${String(gates.falseSettles.errors)}/${String(gates.falseSettles.n)}\tloss ${ranking.loss.toFixed(3)}\tsent ${String(cost.sent)}\thits ${String(cost.hits)}\tcost ${cost.costTotal.toFixed(4)}`,
    )
    return 0
  } finally {
    await live?.close()
  }
}

type ShowFlags = Readonly<{ case?: string; config?: string; ids?: string }>

/** What one case asks the judge under a configuration, with the kept answers and the right ones beside it. */
function show(flags: ShowFlags): number {
  const entry = loadParents()
    .flatMap(casesOf)
    .find(candidate => candidate.id === flags.case)
  if (entry === undefined) {
    console.error('show needs --case <parent>/<case>, as `validate` lists them')
    return 2
  }
  const config = configOf(flags.config)
  const cache = fileCache(
    readdirSync(EXPERIMENTS).map(entry => join(EXPERIMENTS, entry, 'replies.jsonl')),
  )
  const wanted = flags.ids?.split(',')
  const only = <T>(byId: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(Object.entries(byId).filter(([id]) => wanted?.includes(id) ?? true))
  const packed = packJudge(entry.material, config)
  const shown = packed.requests.map(request => {
    const kept = cache.get(requestKey({ ...request, model: config.model }, 0, 0))
    return {
      state: request.state,
      questions: only(request.questions),
      answers: kept === undefined ? 'no reply is kept for this request' : only(kept.answers),
    }
  })
  const page = { case: entry.id, right: only(entry.expected.entries), requests: shown }
  console.log(JSON.stringify(page, null, 2))
  return 0
}

type CompareFlags = RunFlags & Readonly<{ base?: string }>

/** Replays the base and the candidate over the same cases and keeps the two reports with the paired difference of their loss. */
async function compare(flags: CompareFlags): Promise<number> {
  const { name, split = 'verify,canary' } = flags
  if (name === undefined || !/^[a-z0-9][a-z0-9-]*$/u.test(name) || flags.config === undefined) {
    console.error('compare needs --name <comparison> and --config <file.json>')
    return 2
  }
  const sides = [configOf(flags.base), configOf(flags.config)] as const
  const cases = casesIn(split)
  const cache = fileCache(replyFiles(name))
  const unkept = sides.flatMap(config =>
    cases.flatMap(entry =>
      packJudge(entry.material, config).requests.filter(
        request => cache.get(requestKey({ ...request, model: config.model }, 0, 0)) === undefined,
      ),
    ),
  ).length
  const ceiling = Number(flags['max-cost'] ?? '1')
  if (unkept * PRICE_GUESS > ceiling) {
    console.error(`this comparison may cost about ${(unkept * PRICE_GUESS).toFixed(2)} USD`)
    return 2
  }
  const offline: Decide = () =>
    Promise.reject(new Error('offline: a request is not among the kept replies'))
  const live = flags.offline === true ? null : openRouterDecide(flags['key-file'] ?? '')
  try {
    const options = { decide: live?.decide ?? offline, cache }
    const [base, candidate] = [
      await replay(cases, sides[0], options),
      await replay(cases, sides[1], options),
    ]
    const reports = [
      reportOf(`${name}:base`, sides[0], split, base),
      reportOf(`${name}:candidate`, sides[1], split, candidate),
    ] as const
    const tallies = (replayed: Replayed) => talliesOf(replayed.outcomes.flatMap(graded))
    const paired = pairedLoss(tallies(base), tallies(candidate))
    const spreads = [
      spreadOf(tallies(base), pairs(base.outcomes)),
      spreadOf(tallies(candidate), pairs(candidate.outcomes)),
    ] as const
    const kept = { base: reports[0], candidate: reports[1], paired, spreads }
    writeFileSync(join(EXPERIMENTS, name, 'compare.json'), `${JSON.stringify(kept, null, 2)}\n`)
    const pages = join(flags.out ?? join(tmpdir(), 'goal-bench'), name)
    mkdirSync(pages, { recursive: true })
    const page = `# ${name}\n\n${renderComparison(reports[0], reports[1], paired, spreads)}`
    writeFileSync(join(pages, 'compare.md'), page)
    console.log(page)
    return 0
  } finally {
    await live?.close()
  }
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      parent: { type: 'string' },
      by: { type: 'string' },
      name: { type: 'string' },
      split: { type: 'string' },
      config: { type: 'string' },
      'key-file': { type: 'string' },
      offline: { type: 'boolean' },
      repeats: { type: 'string' },
      shuffle: { type: 'string' },
      'max-cost': { type: 'string' },
      out: { type: 'string' },
      base: { type: 'string' },
      case: { type: 'string' },
      ids: { type: 'string' },
    },
  })
  switch (positionals[0]) {
    case 'validate':
      return validate(values.parent)
    case 'sign':
      return sign(
        values.by,
        /* wall-clock: observation-time -- when the sign-off was written */ new Date().toISOString(),
      )
    case 'run':
      return run(values)
    case 'compare':
      return compare(values)
    case 'show':
      return show(values)
    default:
      console.error(USAGE)
      return 2
  }
}

process.exitCode = await main()
