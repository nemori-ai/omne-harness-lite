// One history-cost run on the release tree (C8, V7b and V7c): the release distribution with the
// payload tool added as `largeBodyRelease` adds it, real SQLite storage, the `omne` CLI and the
// local model gateway, all as `rows/tool-runtime/release-tool-delivery.spec.ts` assembles them.
// Every call is one Tools call in a new session of the same tenant, so the Agent's history stays one
// call long and only the tenant's Tool and host history grows. Seeding calls leave their body
// unread; the measured calls read it back page by page. The run measures `measured` calls after 20
// settled calls and `measured` calls after 200, each from `send-input` to the terminal of its Run,
// and marks each call's phase for `sql-probe.ts`, so the SQL counts of a call can be compared at
// both history sizes.
//
// node --import ./tests/history-cost/sql-probe.ts tests/history-cost/run.ts <out> <kind> [measured]
// Build `apps/cli` and the workspace first. Writes `<out>/samples.json`; the probe writes
// `<out>/sql-trace/`, and the run ends by judging them with `summarize.ts`: the exit code is
// non-zero when the run or a Tool or host count fails. With `HISTORY_COST_TRACE_DIR` unset
// nothing is counted or judged.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import * as cordis from '../../src/cordis.ts'
import { runServe } from '../../src/run.ts'
import { startModelGateway } from '../fixtures/model-gateway.ts'
import {
  bodyOf,
  freePort,
  operatorLayer,
  runOmne,
  savedLoginProof,
  savedTenant,
} from '../r9/support.ts'
import { connectable, until } from '../rows/server-entry/support.ts'
import { adoptLargeBody, largeBodyRelease } from '../rows/tool-runtime/large-body-release.ts'
import { INLINE_THRESHOLD, PAGE_BYTES, payload, type PayloadKind } from './payload.ts'
import { createTraversal } from './traversal.ts'

const [outArg, kindArg, measuredArg] = process.argv.slice(2)
if (outArg === undefined) throw new Error('give an output directory')
if (kindArg !== 'inline' && kindArg !== 'text' && kindArg !== 'json-lines')
  throw new Error('give a payload kind: inline, text or json-lines')
const kind: PayloadKind = kindArg
const measured = Number(measuredArg ?? '10')
const HISTORIES = [20, 200] as const

const out = resolve(outArg)
mkdirSync(out, { recursive: true })
// The state lives in a short temporary path (socket paths have a length limit) and is removed at
// the end; the evidence goes to `out`.
const base = realpathSync(mkdtempSync(join(tmpdir(), 'history-cost-')))
const stateRoot = join(base, 'state')
const storageRoot = join(stateRoot, 'storage')
const home = join(base, 'home')
mkdirSync(stateRoot)

type Op = Readonly<{ kind: string; id: string; config?: Record<string, unknown> }>

const author = payload(kind)
const model = createTraversal({ body: author.body, pageBytes: PAGE_BYTES })
const gateway = await startModelGateway(model.script)
gateway.trustInProcess()
const release: unknown = JSON.parse(
  readFileSync(new URL('../../config/serve.distribution.json', import.meta.url), 'utf8'),
)
const extension = largeBodyRelease(author.module)
const controller = new AbortController()
const port = await freePort()
const layer = operatorLayer({ storageRoot, port, modelRoute: gateway.url }) as { ops: Op[] }
const configOf = (op: Op) => op.config ?? {}
const operator = {
  ...layer,
  ops: layer.ops.map(op => {
    const config = configOf(op)
    if (op.id === 'server-entry')
      return { ...op, config: { ...config, historyKinds: ['run.terminal'] } }
    if (op.id === 'tool-bindings') {
      const tools = config['tools'] as Record<string, unknown>
      return {
        ...op,
        config: { ...config, tools: { ...tools, contentPageBytes: PAGE_BYTES, attemptMs: 5000 } },
      }
    }
    if (op.id === 'tool-records') {
      const configuration = config['configuration'] as Record<string, unknown>
      const offloading = configuration['offloading'] as Record<string, unknown>
      return {
        ...op,
        config: {
          ...config,
          configuration: {
            ...configuration,
            offloading: {
              ...offloading,
              maxInlineUtf8Bytes: INLINE_THRESHOLD,
              maxPageBytes: PAGE_BYTES,
            },
          },
        },
      }
    }
    return op
  }),
}
const stderr: string[] = []
const finished = runServe({
  distribution: adoptLargeBody(release),
  operator,
  plugins: { ...cordis, toolHostRow: extension.toolHostRow },
  entryObjects: extension.entryObjects,
  stateRoot,
  stop: controller.signal,
  readinessTimeoutMs: 15_000,
  shutdownDeadlineMs: 10_000,
  write: () => undefined,
  stderr: line => {
    stderr.push(line)
    if (stderr.length > 100) stderr.shift()
  },
})

async function cli(args: readonly string[], credential?: string) {
  const value = await runOmne({
    args,
    home,
    server: `http://127.0.0.1:${String(port)}`,
    cwd: base,
    ...(credential === undefined ? {} : { credential }),
  })
  if (value.status !== 0) throw new Error(`omne ${args[0] ?? ''}: ${value.stderr}`)
  return value
}

/** Whether the only Run of `session` has reached its terminal, and with which outcome. */
async function terminal(session: string): Promise<string | null> {
  const response = await fetch(`http://127.0.0.1:${String(port)}/session-public/1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      protocolVersion: 'session-public/1',
      messageId: 'history-cost-terminal',
      operation: 'read-history',
      body: {
        tenant: savedTenant(home),
        session,
        cursor: null,
        direction: 'forward',
        pageBytes: '262144',
      },
      loginProof: savedLoginProof(home),
    }),
  })
  if (response.status === 503) return null
  if (response.status !== 200) throw new Error(`read-history ${String(response.status)}`)
  const value = (await response.json()) as {
    body: { entries: { payload: { terminal?: { outcome?: string } } }[] }
  }
  return value.body.entries[0]?.payload.terminal?.outcome ?? null
}

const setPhase = (value: number) => {
  const mark: unknown = Reflect.get(globalThis, 'historyCostPhase')
  if (typeof mark === 'function') mark(value)
}

type Sample = Readonly<{
  ordinal: number
  settledBefore: number
  measured: boolean
  elapsedMs: number
  pages: number
  requests: number
}>

const samples: Sample[] = []
let outcome: Record<string, unknown> = { ok: false }
try {
  await until(() => connectable('127.0.0.1', port), 'the server to listen', 20_000)
  await cli(['register', '--login-identifier', 'history-cost'], 'history-cost-password-1')
  await cli(['login', '--login-identifier', 'history-cost'], 'history-cost-password-1')
  const last = (HISTORIES.at(-1) ?? 0) + measured
  for (let ordinal = 1; ordinal <= last; ordinal += 1) {
    const settledBefore = ordinal - 1
    const measuring = HISTORIES.some(n => settledBefore >= n && settledBefore < n + measured)
    const session = String(
      bodyOf(await cli(['create-session', '--definition', 'coding']))['session'],
    )
    model.start(measuring)
    setPhase(ordinal)
    const started = performance.now()
    await cli([
      'send-input',
      '--session',
      session,
      '--text',
      `history cost ${kind} ${String(ordinal)}`,
    ])
    let outcomeOfRun: string | null = null
    await until(
      async () => {
        outcomeOfRun = await terminal(session)
        return outcomeOfRun !== null
      },
      `the Run of call ${String(ordinal)}`,
      180_000,
    )
    const elapsedMs = performance.now() - started
    // Work the call leaves behind (the release of its delivered values) stays in its phase.
    await sleep(measuring ? 500 : 0)
    setPhase(0)
    if (outcomeOfRun !== 'completed')
      throw new Error(`call ${String(ordinal)} ended ${String(outcomeOfRun)}`)
    const result = model.result()
    if (result.errors.length > 0 || !result.completed)
      throw new Error(`call ${String(ordinal)}: ${JSON.stringify(result.errors)}`)
    if (author.executions() !== ordinal) throw new Error('one payload execution per call')
    if (measuring && result.digest !== author.digest) throw new Error('the body read back differs')
    samples.push({
      ordinal,
      settledBefore,
      measured: measuring,
      elapsedMs,
      pages: result.pages,
      requests: result.requests,
    })
    writeFileSync(join(out, 'samples.json'), `${JSON.stringify(samples, null, 2)}\n`)
  }
  outcome = {
    ok: true,
    kind,
    bytes: author.bytes,
    measured,
    histories: HISTORIES,
    calls: samples.length,
  }
} catch (error) {
  outcome = { ok: false, kind, error: String(error), stderr }
} finally {
  controller.abort('history cost run complete')
  const shutdown = await finished
  await gateway.close()
  rmSync(base, { recursive: true, force: true })
  outcome['exitCode'] = shutdown.exitCode
  if (shutdown.exitCode !== 0) outcome['ok'] = false
  writeFileSync(join(out, 'result.json'), `${JSON.stringify(outcome, null, 2)}\n`)
  console.log(JSON.stringify(outcome).slice(0, 2000))
  const flush: unknown = Reflect.get(globalThis, 'historyCostFlush')
  // A run without the probe has nothing to judge; a measured run is judged by `summarize.ts`.
  const judged =
    typeof flush === 'function' && outcome['ok'] === true
      ? (flush(),
        spawnSync(
          process.execPath,
          [fileURLToPath(new URL('summarize.ts', import.meta.url)), out],
          {
            stdio: 'inherit',
          },
        ).status)
      : 0
  process.exitCode = outcome['ok'] === true && judged === 0 ? 0 : 1
}
