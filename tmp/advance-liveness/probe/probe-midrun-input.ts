// 临时探针（不提交）：一轮进行中再发一句，看这一轮能否收场、第二句有没有被模型读到。
// --when tool    第二句在第 2 次模型请求到达时发出（循环在跑，后面还有工具步）
// --when finish  第二句在最后一次模型请求到达时发出，模型的收尾回复延后 2 秒（输入与收场并发）
// --when cancel-model  第 2 次模型请求到达时取消这一轮，模型随即回复；1 秒后发第二句
// --when cancel-tool   第 2 步的工具（sleep 3）执行中取消这一轮；1 秒后发第二句
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import * as cordis from '../../src/cordis.ts'
import { entryObjects } from '../../src/entry/index.ts'
import { runServe } from '../../src/run.ts'
import { startModelGateway } from '../fixtures/model-gateway.ts'
import { bodyOf, freePort, operatorLayer, runOmne } from '../r9/support.ts'
import { connectable, until } from '../support/listening.ts'

const { values: args } = parseArgs({
  options: {
    when: { type: 'string', default: 'tool' },
    steps: { type: 'string', default: '4' },
    out: { type: 'string' },
    waitMs: { type: 'string', default: '90000' },
    secondAt: { type: 'string', default: '2' },
    keepGoing: { type: 'boolean', default: false },
  },
})
const STEPS = Number(args.steps)
const WHEN = args.when
const SECOND_AT = Number(args.secondAt)
const out = args.out ?? join(tmpdir(), `probe-midrun-${Date.now()}`)
mkdirSync(out, { recursive: true })

const t0 = performance.now()
const at = () => Math.round(performance.now() - t0)
const events: unknown[] = []
const note = (kind: string, data: unknown) => events.push({ at: at(), kind, data })

const record = (value: unknown) => {
  if (typeof value !== 'object' || value === null) return
  const name = Reflect.get(value, 'name')
  const signal = Reflect.get(value, 'signal')
  if (name === 'omne.session.diagnostic') note('diagnostic', Reflect.get(value, 'fields'))
  else if (signal === 'log') {
    const level = Reflect.get(value, 'level')
    if (level === 'warn' || level === 'error')
      note(`log:${String(Reflect.get(value, 'component'))}`, Reflect.get(value, 'fields'))
  }
}

let requests = 0
let sequence = 0
let sendSecond: (() => Promise<void>) | null = null
let cancelRun: (() => Promise<void>) | null = null
let cancelled = false
let secondSent = false
const seenSecond: number[] = []
const gateway = await startModelGateway(async ({ body }) => {
  requests += 1
  const index = requests
  const hasSecond = body.includes('SECOND_INPUT_MARK')
  if (hasSecond) seenSecond.push(index)
  note('model-request', { index, hasSecond, bytes: body.length })
  const finishing = index > STEPS || (hasSecond && args.keepGoing !== true)
  if (WHEN.startsWith('cancel') && index === 2 && !cancelled && cancelRun !== null) {
    cancelled = true
    const act = async () => {
      await cancelRun?.()
      note('cancel-accepted', null)
      await sleep(1000)
      secondSent = true
      await sendSecond?.()
      note('second-input-accepted', null)
    }
    if (WHEN === 'cancel-model') await cancelRun().then(() => note('cancel-accepted', null))
    if (WHEN === 'cancel-model')
      void sleep(1000).then(async () => {
        secondSent = true
        await sendSecond?.()
        note('second-input-accepted', null)
      })
    else void sleep(150).then(act)
  }
  const trigger =
    WHEN === 'tool' ? index === SECOND_AT : WHEN === 'finish' ? index === STEPS + 1 : false
  if (trigger && !secondSent && sendSecond !== null) {
    secondSent = true
    await sendSecond()
    note('second-input-accepted', null)
    if (WHEN === 'finish') await sleep(2000)
  }
  const delta = finishing
    ? { content: hasSecond ? 'PROBE_DONE_WITH_SECOND' : 'PROBE_DONE' }
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
                params: {
                  script: `sleep ${WHEN === 'cancel-tool' && index === 2 ? '3' : '0.3'}; echo step ${String(index)}`,
                },
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

const base = realpathSync(mkdtempSync(join(tmpdir(), 'probe-midrun-')))
const stateRoot = join(base, 'state')
const storageRoot = join(stateRoot, 'storage')
mkdirSync(stateRoot)
const release: unknown = JSON.parse(
  readFileSync(new URL('../../config/serve.distribution.json', import.meta.url), 'utf8'),
)
const port = await freePort()
const operator = operatorLayer({ storageRoot, port, modelRoute: gateway.url })
const controller = new AbortController()
const stderr: string[] = []
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
  stderr: line => {
    stderr.push(line)
  },
})
const server = `http://127.0.0.1:${String(port)}`
await until(() => connectable('127.0.0.1', port), 'the server to listen', 20_000)
const home = join(base, 'home')
async function cli(argv: readonly string[], credential?: string) {
  return runOmne({
    args: argv,
    home,
    server,
    cwd: base,
    ...(credential === undefined ? {} : { credential }),
  })
}
const must = async (argv: readonly string[], credential?: string) => {
  const value = await cli(argv, credential)
  if (value.status !== 0) throw new Error(`omne ${argv[0] ?? ''}: ${value.stderr}`)
  return value
}
await must(['register', '--login-identifier', 'probe'], 'probe-password-1')
await must(['login', '--login-identifier', 'probe'], 'probe-password-1')
const session = String(bodyOf(await must(['create-session', '--definition', 'coding']))['session'])
sendSecond = async () => {
  await must(['send-input', '--session', session, '--text', 'SECOND_INPUT_MARK please also do this'])
}
cancelRun = async () => {
  const text = (await cli(['read-session-diagnostics', '--session', session])).stdout
  const run = /^Run (\S+) /mu.exec(text)?.[1]
  if (run === undefined) throw new Error(`no run to cancel in: ${text.slice(0, 300)}`)
  const answer = await cli(['cancel-run', '--session', session, '--run', run])
  note('cancel-run', { run, status: answer.status, out: answer.stdout.slice(0, 200), err: answer.stderr.slice(0, 200) })
}
await must(['send-input', '--session', session, '--text', 'probe first input'])
note('first-input-accepted', null)

const diagnostics = async () =>
  (await cli(['read-session-diagnostics', '--session', session])).stdout
const waitMs = Number(args.waitMs)
let ended = false
let last = ''
const deadline = performance.now() + waitMs
while (performance.now() < deadline) {
  await sleep(1000)
  last = await diagnostics()
  if ((secondSent || WHEN === 'none') && /^Run /mu.test(last) && !/not ended/u.test(last)) {
    ended = true
    break
  }
}
note('poll-finished', { ended })
const history = (await cli(['read-history', '--session', session])).stdout
controller.abort('probe done')
const shutdown = await finished
await gateway.close()
const summary = {
  when: WHEN,
  secondAt: SECOND_AT,
  steps: STEPS,
  modelRequests: requests,
  secondSent,
  modelRequestsThatSawSecond: seenSecond,
  ended,
  runLines: last.split('\n').filter(line => line.startsWith('Run ')),
  elapsedMs: at(),
  serveExitCode: shutdown.exitCode,
  diagnosticCounts: events
    .filter(e => (e as { kind: string }).kind === 'diagnostic')
    .reduce<Record<string, number>>((acc, e) => {
      const f = (e as { data: Record<string, unknown> }).data
      const key = `${String(f['owner'])}/${String(f['step'])}/${String(f['reason'])}`
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
}
writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
writeFileSync(join(out, 'events.json'), `${JSON.stringify(events, null, 1)}\n`)
writeFileSync(join(out, 'diagnostics.txt'), last)
writeFileSync(join(out, 'history.txt'), history)
writeFileSync(join(out, 'stderr.txt'), stderr.join('\n'))
console.log(JSON.stringify(summary))
rmSync(base, { recursive: true, force: true })
