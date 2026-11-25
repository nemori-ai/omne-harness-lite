// 临时探针（不提交）：同一会话连跑几轮，每轮若干步工具调用（不撞 50 步上限），
// 逐步数存储读，并记下读历史、读工作快照的调用方。比较第一轮与最后一轮的每步读量。
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { parseArgs } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import * as cordis from '../../src/cordis.ts'
import { entryObjects } from '../../src/entry/index.ts'
import { runServe } from '../../src/run.ts'
import { startModelGateway } from '../fixtures/model-gateway.ts'
import { bodyOf, freePort, operatorLayer, runOmne } from '../r9/support.ts'
import { connectable, until } from '../support/listening.ts'
import { installWorkerCount } from './worker-count.ts'

const { values: args } = parseArgs({
  options: {
    steps: { type: 'string', default: '45' },
    rounds: { type: 'string', default: '4' },
    out: { type: 'string' },
  },
})
const STEPS = Number(args.steps)
const ROUNDS = Number(args.rounds)
const out = args.out ?? join(tmpdir(), `probe-steps-${Date.now()}`)
mkdirSync(out, { recursive: true })

Error.stackTraceLimit = 80
const count = installWorkerCount()
let round = 0
let stepInRound = 0
const phaseOf = () => round * 1000 + stepInRound
const stacks = new Map<number, Map<string, number>>()
const post = Worker.prototype.postMessage
Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: never[]) {
  let text = ''
  try {
    text = JSON.stringify(message).slice(0, 600)
  } catch {}
  const m = /"moduleUrl":"([^"]+)"/u.exec(text)
  if (m !== null && round > 0) {
    const handler = (m[1] ?? '').split('/').pop() ?? '?'
    const frames = (new Error().stack ?? '')
      .split('\n')
      .slice(2)
      .map(line => line.trim())
      .filter(
        line =>
          /\/(packages|apps)\//u.test(line) &&
          !/session-storage-sql|sqlite-provider|\/storage\/|worker-count|probe-steps|operation-result|sql-contract/u.test(
            line,
          ),
      )
      .map(line =>
        line
          .replace(/^at\s+(async\s+)?/u, '')
          .replace(/\(?file:\/\/\/.*?\/(packages|apps)\//u, '(')
          .replace(/\/(dist|src)\//u, ':')
          .replace(/:\d+\)?$/u, ''),
      )
      .slice(0, 5)
      .join(' <- ')
    const key = `${handler} | ${frames}`
    const phase = phaseOf()
    const bucket = stacks.get(phase) ?? new Map<string, number>()
    bucket.set(key, (bucket.get(key) ?? 0) + 1)
    stacks.set(phase, bucket)
  }
  return post.call(this, message, ...rest)
} as typeof post

const passes: { phase: number; ms: number }[] = []
const record = (value: unknown) => {
  if (typeof value !== 'object' || value === null) return
  if (
    Reflect.get(value, 'name') === 'omne.agent.pass.run' &&
    Reflect.get(value, 'signal') === 'segment-end'
  )
    passes.push({ phase: phaseOf(), ms: Number(Reflect.get(value, 'durationMs')) })
}

let sequence = 0
let roundDone: (() => void) | null = null
const gateway = await startModelGateway(() => {
  stepInRound += 1
  count.setPhase(phaseOf())
  const finishing = stepInRound > STEPS
  if (finishing) setTimeout(() => roundDone?.(), 0)
  const delta = finishing
    ? { content: `ROUND_${String(round)}_DONE` }
    : {
        tool_calls: [
          {
            index: 0,
            id: `probe_${String((sequence += 1))}`,
            type: 'function',
            function: {
              name: 'Shell',
              arguments: JSON.stringify({
                command: 'execute',
                intent: 'probe step',
                params: { script: `echo round ${String(round)} step ${String(stepInRound)}` },
              }),
            },
          },
        ],
      }
  const chunks = [
    { model: 'probe', provider: 'OpenAI', choices: [{ delta }] },
    { choices: [{ delta: {}, finish_reason: finishing ? 'stop' : 'tool_calls' }] },
  ]
  return {
    status: 200,
    contentType: 'text/event-stream',
    body: `${chunks.map(value => `data: ${JSON.stringify(value)}\n\n`).join('')}data: [DONE]\n\n`,
  }
})
gateway.trustInProcess()

const base = realpathSync(mkdtempSync(join(tmpdir(), 'probe-steps-')))
const stateRoot = join(base, 'state')
const storageRoot = join(stateRoot, 'storage')
mkdirSync(stateRoot)
const release: unknown = JSON.parse(
  readFileSync(new URL('../../config/serve.distribution.json', import.meta.url), 'utf8'),
)
const port = await freePort()
const operator = operatorLayer({ storageRoot, port, modelRoute: gateway.url })
const controller = new AbortController()
const finished = runServe({
  distribution: release,
  operator,
  plugins: cordis,
  entryObjects,
  stateRoot,
  stop: controller.signal,
  readinessTimeoutMs: 15_000,
  shutdownDeadlineMs: 10_000,
  write: record,
  stderr: () => {},
})
const server = `http://127.0.0.1:${String(port)}`
await until(() => connectable('127.0.0.1', port), 'the server to listen', 20_000)
const home = join(base, 'home')
async function cli(argv: readonly string[], credential?: string) {
  const value = await runOmne({
    args: argv,
    home,
    server,
    cwd: base,
    ...(credential === undefined ? {} : { credential }),
  })
  if (value.status !== 0) throw new Error(`omne ${argv[0] ?? ''}: ${value.stderr}`)
  return value
}
await cli(['register', '--login-identifier', 'probe'], 'probe-password-1')
await cli(['login', '--login-identifier', 'probe'], 'probe-password-1')
const session = String(bodyOf(await cli(['create-session', '--definition', 'coding']))['session'])
const started = performance.now()
const roundMs: number[] = []
for (let r = 1; r <= ROUNDS; r++) {
  round = r
  stepInRound = 0
  count.setPhase(phaseOf())
  const done = new Promise<void>(resolve => {
    roundDone = resolve
  })
  const t = performance.now()
  await cli(['send-input', '--session', session, '--text', `probe round ${String(r)}`])
  await Promise.race([done, sleep(600_000).then(() => Promise.reject(new Error('round timeout')))])
  roundMs.push(performance.now() - t)
  // 让这一轮收场；不轮询，免得读数里混进诊断读
  await sleep(4000)
}
const elapsed = performance.now() - started
round = 0
count.setPhase(-1)

const entries = (await cli(['read-session-diagnostics', '--session', session])).stdout
  .split('\n')
  .filter(line => line.startsWith('Run '))
const perRound: unknown[] = []
const callers: Record<string, Record<string, number>> = {}
for (let r = 1; r <= ROUNDS; r++) {
  const from = 5
  const to = STEPS - 5
  const total: Record<string, number> = {}
  let reads = 0
  let commits = 0
  const sum = new Map<string, number>()
  for (let s = from; s <= to; s++) {
    const c = count.phase(r * 1000 + s)
    reads += c.reads
    commits += c.commits
    for (const [k, v] of Object.entries(c.messages))
      if (k.startsWith('read:')) total[k] = (total[k] ?? 0) + v
    for (const [k, v] of stacks.get(r * 1000 + s) ?? []) sum.set(k, (sum.get(k) ?? 0) + v)
  }
  const n = to - from + 1
  const ms = passes.filter(p => Math.floor(p.phase / 1000) === r).map(p => p.ms)
  perRound.push({
    round: r,
    readsPerStep: reads / n,
    commitsPerStep: commits / n,
    passRunMsMedian: ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)] ?? null,
    passRuns: ms.length,
    roundMs: roundMs[r - 1],
    readsByHandlerPerStep: Object.fromEntries(
      Object.entries(total)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, Number((v / n).toFixed(2))]),
    ),
  })
  callers[`round${String(r)}`] = Object.fromEntries(
    [...sum]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([k, v]) => [k, Number((v / n).toFixed(2))]),
  )
}
writeFileSync(
  join(out, 'steps.json'),
  `${JSON.stringify({ elapsed, steps: STEPS, rounds: ROUNDS, runs: entries, perRound }, null, 2)}\n`,
)
writeFileSync(join(out, 'callers.json'), `${JSON.stringify(callers, null, 2)}\n`)
console.log(JSON.stringify({ out, elapsed, perRound }, null, 1))
controller.abort('probe done')
await finished
await gateway.close()
rmSync(base, { recursive: true, force: true })
