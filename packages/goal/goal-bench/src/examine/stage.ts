import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { writeFiles } from './checks.ts'
import type { Files } from './product.ts'
import type { ModelScript } from './script.ts'

/** The programs and secrets a stage is built from. The key and the credential reach the programs as redirected standard input, and nothing else reads them. */
export type StageOptions = Readonly<{
  lab: string
  cli: string
  keyFile: string
  credentialFile: string
  /** The model the examinations run under; undefined: the one the release sets. */
  examinerModel?: string
}>
export type GapRow = Readonly<{ id: string; value?: string; reader?: string }>
export type GoalView = Readonly<{
  state: Readonly<{ status: string; generation: number; outcome: unknown }>
  gap: readonly GapRow[]
  examiner?: string
}>
export type Spent = Readonly<{ calls: number; usd: number; modelMs: number }>
export type Entry = Readonly<{ kind: string; payload: unknown }>
/** One server of the lab assembly with one working session on a directory of work, as the runner needs it. */
export type Stage = Readonly<{
  script(model: ModelScript): void
  setGoal(draft: object): Promise<void>
  goal(): Promise<GoalView | null>
  resume(generation: number): Promise<void>
  history(session: string): Promise<readonly Entry[]>
  spent(session: string): Spent
  work(): Files
  close(): Promise<void>
}>

const sleep = (ms: number) => new Promise(done => setTimeout(done, ms))
const REVISION = '3'
const WHOLE = ['--since', '2020-01-01T00:00:00Z', '--before', '2100-01-01T00:00:00Z']
const USAGE_ARGS = ['query-usage', ...WHOLE, '--zone', 'UTC', '--session']
/** The units a cost is kept in that are one US dollar each: the provider's credit is. */
const CREDIT_UNITS = new Set(['USD', 'openrouter-credit'])
const START_TURNS = 240

function listed(root: string, directory = root): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = join(directory, entry.name)
    return entry.isDirectory() ? listed(root, full) : [relative(root, full)]
  })
}

type Answer = Readonly<{ status: number; body: unknown }>

function caller(directory: string, port: number) {
  return async (protocol: string, operation: string, body: object): Promise<Answer> => {
    const login = JSON.parse(readFileSync(join(directory, 'omne-home', 'login.json'), 'utf8')) as {
      tenantId: string
      loginProof: string
    }
    const answered = await fetch(`http://127.0.0.1:${String(port)}/api/${protocol}/${operation}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${login.loginProof}`,
        'content-type': 'application/json',
        'omne-message-id': randomUUID(),
        'omne-contract-revision': REVISION,
      },
      body: JSON.stringify({ tenant: login.tenantId, ...body }),
    })
    const read = (await answered.json().catch(() => null)) as { body?: unknown } | null
    return { status: answered.status, body: read?.body }
  }
}

type Usage = Readonly<{
  calls: number
  cost: { sums: { known: string; unit: string }[] }
  duration: { total: { known: string } }
}>

function spentOf(text: string): Spent {
  const { total } = (JSON.parse(text) as { body: { total: Usage } }).body
  const usd = total.cost.sums
    .filter(sum => CREDIT_UNITS.has(sum.unit))
    .map(sum => Number(sum.known))
  return {
    calls: total.calls,
    usd: usd.reduce((sum, value) => sum + value, 0),
    modelMs: Number(total.duration.total.known),
  }
}

/** Sets a lab server up in `directory` with its own home, starts it on the model script, registers one person and creates the working session. */
export async function openStage(
  directory: string,
  port: number,
  files: Files,
  options: StageOptions,
): Promise<Stage> {
  const workspace = join(directory, 'workspace')
  const scriptFile = join(directory, 'model-script.json')
  mkdirSync(join(directory, 'os-home'), { recursive: true })
  writeFiles(workspace, files)
  writeFileSync(scriptFile, JSON.stringify({ steps: [] }))
  const env = {
    ...process.env,
    HOME: join(directory, 'os-home'),
    OMNE_SERVER_HOME: join(directory, 'os-home', 'server'),
    OMNE_HOME: join(directory, 'omne-home'),
    OMNE_SERVER: `http://127.0.0.1:${String(port)}`,
  }
  const run = (bin: string, argv: readonly string[], stdin?: string) =>
    spawnSync(process.execPath, [bin, ...argv], {
      env,
      cwd: directory,
      stdio: [stdin === undefined ? 'ignore' : openSync(stdin, 'r'), 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
  const must = (what: string, done: ReturnType<typeof run>) => {
    if (done.status !== 0) throw new Error(`${what} failed: ${done.stderr.slice(0, 400)}`)
    return done.stdout
  }
  const setup = ['setup', '--port', String(port), '--workspace', workspace]
  must('setup', run(options.lab, setup, options.keyFile))
  const out = join(directory, 'serve.out')
  const child = spawn(
    process.execPath,
    [
      options.lab,
      'serve',
      '--stop-on-stdin-close',
      '--model-script',
      scriptFile,
      ...(options.examinerModel === undefined ? [] : ['--examiner-model', options.examinerModel]),
    ],
    {
      env,
      cwd: directory,
      stdio: ['pipe', openSync(out, 'a'), openSync(join(directory, 'serve.err'), 'a')],
    },
  )
  const close = async () => {
    child.stdin?.end()
    for (let turn = 0; turn < 40 && child.exitCode === null; turn += 1) await sleep(250)
    if (child.exitCode === null) child.kill()
  }
  try {
    for (let turn = 0; turn < START_TURNS; turn += 1) {
      if (readFileSync(out, 'utf8').includes('accepting')) break
      if (child.exitCode !== null) throw new Error('the server ended before accepting')
      await sleep(500)
    }
    for (const step of ['register', 'login'])
      must(step, run(options.cli, [step, '--login-identifier', 'bench'], options.credentialFile))
    const made = must(
      'create-session',
      run(options.cli, ['create-session', '--definition', 'coding']),
    )
    const session = (JSON.parse(made) as { body: { session: string } }).body.session
    const call = caller(directory, port)
    const ok = (what: string, answer: Answer) => {
      if (answer.status !== 200) throw new Error(`${what}: ${JSON.stringify(answer).slice(0, 400)}`)
    }
    return {
      script: model => writeFileSync(scriptFile, JSON.stringify(model)),
      async setGoal(draft) {
        const proposal = { kind: 'set', draft }
        const body = { session, operation: 'bench-set', proposal, words: null }
        ok('write-goal', await call('goal/v1', 'write-goal', body))
      },
      async goal() {
        const read = await call('goal/v1', 'read-goal', { session })
        return (read.body as { goal?: GoalView | null } | undefined)?.goal ?? null
      },
      async resume(generation) {
        const body = { session, generation, command: { kind: 'resume' } }
        ok('resume', await call('goal/v1', 'command-goal', body))
      },
      async history(of) {
        const entries: Entry[] = []
        let body: object = { session: of, cursor: null, direction: 'forward', pageBytes: '65536' }
        for (;;) {
          const page = (await call('session/v1', 'read-history', body)).body as {
            entries: Entry[]
            exhausted: boolean
            next: unknown
          }
          entries.push(...page.entries)
          if (page.exhausted) return entries
          body = { session: of, cursor: page.next }
        }
      },
      spent: of => spentOf(must('query-usage', run(options.cli, [...USAGE_ARGS, of]))),
      work: () =>
        Object.fromEntries(
          listed(workspace).map(name => [name, readFileSync(join(workspace, name), 'utf8')]),
        ),
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}
