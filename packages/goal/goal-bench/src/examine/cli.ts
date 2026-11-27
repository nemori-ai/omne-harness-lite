import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DATA } from '../data.ts'
import { productSetIssues } from './checks.ts'
import { examCasesOf, loadProducts, type ExamCase, type Product } from './product.ts'
import { renderExamReport, type ExamReport } from './report.ts'
import { examineCase, type CaseResult, type Timing } from './run.ts'
import { examScore } from './score.ts'
import { EXAMINERS, type ExaminerKind } from './script.ts'
import { openStage, type StageOptions } from './stage.ts'

export const EXAMINE_USAGE = `  examine validate
      run the check of every criterion on every product, clean and with each break, and list the cases
  examine run --name <experiment> [--examiner real|truthful|lenient] [--model <model>]
      [--only <product or case>[,…]]
      [--key-file <file>] [--credential-file <file>] [--lab <bin.js>] [--cli <bin.js>]
      [--parallel <n>] [--max-cost <usd>] [--work <dir>] [--port <first>] [--out <dir>]
      hand every case to an examiner on a lab server of its own; keeps
      experiments/<name>/{answers.jsonl,examination.json} and writes <out>/<name>/examination.md.
      A case kept without an error is not run again. truthful and lenient are scripted and cost
      nothing: they prove the gauge (no error at all; every unmet criterion read as held).
      --model: the real examiner runs under this model, not the one the release sets
  examine report --name <experiment> [--out <dir>]
      write the page again from the kept answers; sends nothing
`
const EXPERIMENTS = join(DATA, '..', 'experiments')
const REPO = resolve(DATA, '..', '..', '..', '..')
const RELEASED = 'anthropic/claude-haiku-5.5'

function validate(): number {
  const products = loadProducts()
  const issues = productSetIssues(products)
  for (const issue of issues) console.error(issue)
  if (issues.length > 0) return 1
  const cases = products.flatMap(examCasesOf)
  for (const entry of cases)
    console.log(`${entry.id}\t${entry.steps.map(step => step.kind).join(' → ')}`)
  const batches = cases.reduce((sum, entry) => sum + entry.steps.length, 0)
  console.log(
    `${String(products.length)} products, ${String(cases.length)} cases, ${String(batches)} batches`,
  )
  return 0
}

const kept = (name: string): readonly CaseResult[] => {
  const file = join(EXPERIMENTS, name, 'answers.jsonl')
  if (!existsSync(file)) return []
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter(line => line !== '')
  return lines.map(line => JSON.parse(line) as CaseResult)
}

/** The last answer kept of each case: a case run again after an error stands by its later answer. */
const latest = (results: readonly CaseResult[]): readonly CaseResult[] => [
  ...new Map(results.map(result => [result.id, result])).values(),
]

type Told = Readonly<{ examiner: ExaminerKind; definition: string }>
const toldOf = (examiner: ExaminerKind, model = RELEASED): Told => ({
  examiner,
  definition: examiner === 'real' ? `examiner@${model}` : 'scripted',
})

function write(name: string, told: Told, out: string | undefined): ExamReport {
  const results = latest(kept(name)).toSorted((a, b) => a.id.localeCompare(b.id))
  const report: ExamReport = {
    name,
    ...told,
    products: new Set(results.map(result => result.product)).size,
    score: examScore(results),
  }
  writeFileSync(join(EXPERIMENTS, name, 'examination.json'), `${JSON.stringify(report, null, 2)}\n`)
  const pages = join(out ?? join(tmpdir(), 'goal-bench'), name)
  mkdirSync(pages, { recursive: true })
  const page = renderExamReport(report)
  writeFileSync(join(pages, 'examination.md'), page)
  console.log(page)
  return report
}

type Flags = Readonly<Record<string, string | undefined>>

function wanted(only: string | undefined): readonly [ExamCase, Product][] {
  const names = only?.split(',')
  return loadProducts().flatMap(product =>
    examCasesOf(product)
      .filter(
        entry => names === undefined || names.includes(entry.id) || names.includes(product.id),
      )
      .map((entry): [ExamCase, Product] => [entry, product]),
  )
}

const TIMING: Timing = {
  now: () =>
    /* wall-clock: operation-timing -- how long a batch took, and when to stop waiting for it */ performance.now(),
  wait: ms => new Promise(done => setTimeout(done, ms)),
  pollMs: 1500,
  batchMs: 15 * 60_000,
}

async function run(flags: Flags): Promise<number> {
  const { name, examiner = 'real' } = flags
  if (name === undefined || !/^[a-z0-9][a-z0-9-]*$/u.test(name)) {
    console.error('examine run needs --name <experiment> in lower case, digits and dashes')
    return 2
  }
  if (!EXAMINERS.includes(examiner as ExaminerKind)) {
    console.error(`--examiner is one of ${EXAMINERS.join(', ')}`)
    return 2
  }
  const kind = examiner as ExaminerKind
  const options: StageOptions = {
    lab: resolve(flags['lab'] ?? join(REPO, 'apps/harness-server/dist/lab/bin.js')),
    cli: resolve(flags['cli'] ?? join(REPO, 'apps/cli/dist/bin.js')),
    keyFile: resolve(flags['key-file'] ?? ''),
    credentialFile: resolve(flags['credential-file'] ?? ''),
    ...(flags['model'] === undefined ? {} : { examinerModel: flags['model'] }),
  }
  if (flags['key-file'] === undefined || flags['credential-file'] === undefined) {
    console.error(
      'examine run needs --key-file and --credential-file: the lab server is set up and logged in to with them',
    )
    return 2
  }
  mkdirSync(join(EXPERIMENTS, name), { recursive: true })
  const done = new Set(
    kept(name)
      .filter(result => result.error === null)
      .map(result => result.id),
  )
  const queue = wanted(flags['only']).filter(([entry]) => !done.has(entry.id))
  const cap = Number(flags['max-cost'] ?? '3')
  const work = resolve(flags['work'] ?? join(tmpdir(), 'goal-bench-examine', name))
  const first = Number(flags['port'] ?? '47400')
  let spent = examScore(latest(kept(name))).totalUsd
  let next = 0
  const lane = async (slot: number) => {
    for (;;) {
      const at = next
      next += 1
      const [entry, product] = queue[at] ?? []
      if (entry === undefined || product === undefined) return
      if (spent >= cap) {
        console.error(`not run, the cost cap of ${String(cap)} USD is reached: ${entry.id}`)
        continue
      }
      mkdirSync(work, { recursive: true })
      const directory = mkdtempSync(join(work, `${entry.id.replaceAll('/', '--')}-`))
      const stage = await openStage(directory, first + slot, entry.steps[0]?.files ?? {}, options)
      const machine = { run: directory, user: userInfo().username }
      const result = await examineCase(stage, entry, product, kind, TIMING, machine).finally(
        stage.close,
      )
      spent += result.batches.reduce((sum, batch) => sum + batch.usd, 0)
      appendFileSync(join(EXPERIMENTS, name, 'answers.jsonl'), `${JSON.stringify(result)}\n`)
      console.error(
        `${result.error === null ? 'ran' : `FAILED ${result.error}`}: ${entry.id} (${spent.toFixed(3)} USD so far)`,
      )
    }
  }
  const lanes = Math.max(1, Number(flags['parallel'] ?? '1'))
  await Promise.all(Array.from({ length: lanes }, (_, slot) => lane(slot)))
  const report = write(name, toldOf(kind, flags['model']), flags['out'])
  return report.score.failed.length === 0 ? 0 : 1
}

export async function examineMain(argv: readonly string[]): Promise<number> {
  const names = ['name', 'examiner', 'model', 'only', 'key-file', 'credential-file', 'lab', 'cli']
  const more = ['parallel', 'max-cost', 'work', 'port', 'out']
  const options = Object.fromEntries(
    [...names, ...more].map(key => [key, { type: 'string' as const }]),
  )
  const { positionals, values } = parseArgs({ args: [...argv], allowPositionals: true, options })
  const flags = values as Flags
  if (positionals[0] === 'validate') return validate()
  if (positionals[0] === 'run') return run(flags)
  if (positionals[0] === 'report' && flags['name'] !== undefined) {
    const before = join(EXPERIMENTS, flags['name'], 'examination.json')
    const was = JSON.parse(readFileSync(before, 'utf8')) as ExamReport
    write(flags['name'], { examiner: was.examiner, definition: was.definition }, flags['out'])
    return 0
  }
  console.error(EXAMINE_USAGE)
  return 2
}
