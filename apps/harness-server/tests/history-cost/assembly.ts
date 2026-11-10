// The assembly that the history-cost runs drive (C8): the release distribution with the payload
// tool added as `largeBodyRelease` adds it, real SQLite storage, the `omne` CLI and the local model
// gateway, all as `rows/tool-runtime/release-tool-delivery.spec.ts` assembles them. The server runs
// in this process, so `sql-probe.ts` sees its statements. One call is one Tools call in a new
// session, so the Agent's history stays one call long and only the tenant's history grows.
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

type Op = Readonly<{ kind: string; id: string; config?: Record<string, unknown> }>

/** The payload kind named on the command line. */
export function payloadKind(value: string | undefined): PayloadKind {
  if (value !== 'inline' && value !== 'text' && value !== 'json-lines')
    throw new Error('give a payload kind: inline, text or json-lines')
  return value
}

const setPhase = (value: number) => {
  const mark: unknown = Reflect.get(globalThis, 'historyCostPhase')
  if (typeof mark === 'function') mark(value)
}

/** Starts the server and returns what a run needs to drive calls and to end the assembly. */
/** A change of the operator configuration of one row, for a measurement that varies one setting. */
export type Tuning = (row: string, config: Record<string, unknown>) => Record<string, unknown>

export async function startAssembly(kind: PayloadKind, tune: Tuning = (_row, config) => config) {
  // The state lives in a short temporary path (socket paths have a length limit) and is removed at
  // the end; the evidence goes to the output directory of the run.
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'history-cost-')))
  const stateRoot = join(base, 'state')
  const storageRoot = join(stateRoot, 'storage')
  mkdirSync(stateRoot)

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
  const operator = {
    ...layer,
    ops: layer.ops.map(op => {
      const config = op.config ?? {}
      if (op.id === 'server-entry')
        return { ...op, config: { ...config, historyKinds: ['run.terminal'] } }
      if (op.id === 'tool-bindings') {
        const tools = config['tools'] as Record<string, unknown>
        return {
          ...op,
          config: {
            ...config,
            // A Tools reply fits the inline threshold, or the reply that carries a page offloads again.
            tools: {
              ...tools,
              contentPageBytes: PAGE_BYTES,
              replyMaxBytes: INLINE_THRESHOLD,
              attemptMs: 5000,
            },
          },
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
  operator.ops = operator.ops.map(op => ({ ...op, config: tune(op.id, op.config ?? {}) }))
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
  const server = `http://127.0.0.1:${String(port)}`

  async function cli(home: string, args: readonly string[], credential?: string) {
    const value = await runOmne({
      args,
      home,
      server,
      cwd: base,
      ...(credential === undefined ? {} : { credential }),
    })
    if (value.status !== 0) throw new Error(`omne ${args[0] ?? ''}: ${value.stderr}`)
    return value
  }

  /**
   * Null until the only Run of `session` reaches its terminal; then `completed`, or the whole
   * terminal as text, so a failed call reports its reason.
   */
  async function terminal(home: string, session: string): Promise<string | null> {
    const response = await fetch(`${server}/session-public/1`, {
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
    const reached = value.body.entries[0]?.payload.terminal
    if (reached?.outcome === undefined) return null
    return reached.outcome === 'completed' ? 'completed' : JSON.stringify(reached)
  }

  let calls = 0
  return {
    base,
    author,
    stderr,
    ready: () => until(() => connectable('127.0.0.1', port), 'the server to listen', 20_000),

    /** Registers the account `name` and logs it in; `home` then holds its tenant and proof. */
    async enrol(home: string, name: string) {
      await cli(home, ['register', '--login-identifier', name], 'history-cost-password-1')
      await cli(home, ['login', '--login-identifier', name], 'history-cost-password-1')
    },

    /**
     * One Tools call of the tenant of `home` in a new session, as SQL phase `ordinal`: from
     * `send-input` to the terminal of its Run. With `readBack` the model reads the whole body back
     * page by page and the digest is checked. `settleMs` keeps the work the call leaves behind (the
     * release of its delivered values) in its phase.
     */
    async call(home: string, ordinal: number, options: { readBack: boolean; settleMs: number }) {
      const session = String(
        bodyOf(await cli(home, ['create-session', '--definition', 'coding']))['session'],
      )
      model.start(options.readBack)
      setPhase(ordinal)
      const started = performance.now()
      await cli(home, [
        'send-input',
        '--session',
        session,
        '--text',
        `history cost ${kind} ${String(ordinal)}`,
      ])
      let outcome: string | null = null
      await until(
        async () => {
          outcome = await terminal(home, session)
          return outcome !== null
        },
        `the Run of call ${String(ordinal)}`,
        180_000,
      )
      const elapsedMs = performance.now() - started
      await sleep(options.settleMs)
      setPhase(0)
      if (outcome !== 'completed')
        throw new Error(`call ${String(ordinal)} ended ${String(outcome)}`)
      const result = model.result()
      if (result.errors.length > 0 || !result.completed)
        throw new Error(`call ${String(ordinal)}: ${JSON.stringify(result.errors)}`)
      calls += 1
      if (author.executions() !== calls) throw new Error('one payload execution per call')
      if (options.readBack && result.digest !== author.digest)
        throw new Error('the body read back differs')
      return { elapsedMs, pages: result.pages, requests: result.requests }
    },

    /**
     * Writes to `file`, for every database under the storage root: the bytes of the file with its
     * write-ahead log, the rows of each table, and the bytes of each table and index.
     */
    storageSnapshot(file: string) {
      const files: unknown[] = []
      const visit = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name)
          if (statSync(path).isDirectory()) visit(path)
          else if (name.endsWith('.sqlite')) {
            const main = statSync(path).size
            const wal = readdirSync(dir).includes(`${name}-wal`) ? statSync(`${path}-wal`).size : 0
            const db = new DatabaseSync(path, { readOnly: true })
            const tables: Record<string, number> = {}
            const tableBytes: Record<string, number> = {}
            try {
              for (const row of db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
                .all())
                tables[String(row['name'])] = Number(
                  db.prepare(`SELECT count(*) AS n FROM "${String(row['name'])}"`).get()?.['n'] ??
                    0,
                )
              for (const row of db
                .prepare('SELECT name, sum(pgsize) AS bytes FROM dbstat GROUP BY name')
                .all())
                tableBytes[String(row['name'])] = Number(row['bytes'])
            } finally {
              db.close()
            }
            files.push({
              file: path.slice(storageRoot.length + 1),
              bytes: main + wal,
              main,
              wal,
              tables,
              tableBytes,
            })
          }
        }
      }
      visit(storageRoot)
      writeFileSync(file, `${JSON.stringify(files, null, 2)}\n`)
    },

    /** Stops the server and the gateway and removes the state; answers the server's exit code. */
    async close(): Promise<number> {
      controller.abort('history cost run complete')
      const shutdown = await finished
      await gateway.close()
      rmSync(base, { recursive: true, force: true })
      return shutdown.exitCode
    },
  }
}
