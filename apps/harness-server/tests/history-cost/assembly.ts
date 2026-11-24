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
import type { Context } from '@deepseek-ai/cordis'
import * as cordis from '../../src/cordis.ts'
import { entryObjects } from '../../src/entry/index.ts'
import type { EntryObjectModule } from '../../src/types.ts'
import { runServe } from '../../src/run.ts'
import { startModelGateway } from '../fixtures/model-gateway.ts'
import { bodyOf, freePort, operatorLayer, runOmne, savedTenant } from '../r9/support.ts'
import { connectable, until } from '../support/listening.ts'
import { protocolClients, readHistoryPage, savedCredentials } from '../support/protocol-clients.ts'
import {
  INLINE_THRESHOLD,
  PAGE_BYTES,
  PAYLOAD_FILE,
  PAYLOAD_SCRIPT,
  payload,
  type PayloadKind,
} from './payload.ts'
import { createTraversal } from './traversal.ts'

type Op = Readonly<{ kind: string; id: string; config?: Record<string, unknown> }>

export function payloadKind(value: string | undefined): PayloadKind {
  if (value !== 'inline' && value !== 'text') throw new Error('give a payload kind: inline or text')
  return value
}

const setPhase = (value: number) => {
  const mark: unknown = Reflect.get(globalThis, 'historyCostPhase')
  if (typeof mark === 'function') mark(value)
}

export type Tuning = (row: string, config: Record<string, unknown>) => Record<string, unknown>

export type AssemblyOptions = Readonly<{
  historyKinds?: readonly string[]
  record?: (record: unknown) => void
  script?: () => string
  /** Gets the scope of the serving tree once its entry objects are installed. */
  onScope?: (scope: Context, env: Parameters<EntryObjectModule['install']>[1]) => void
}>

export async function startAssembly(
  kind: PayloadKind,
  tune: Tuning = (_row, config) => config,
  options: AssemblyOptions = {},
) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'history-cost-')))
  const stateRoot = join(base, 'state')
  const storageRoot = join(stateRoot, 'storage')
  mkdirSync(stateRoot)

  const author = payload(kind)
  const model = createTraversal({
    body: author.body,
    script: options.script ?? PAYLOAD_SCRIPT,
    pageBytes: PAGE_BYTES,
  })
  let modelMs = 0
  const gateway = await startModelGateway(request => {
    const started = performance.now()
    try {
      return model.script(request)
    } finally {
      modelMs += performance.now() - started
    }
  })
  gateway.trustInProcess()
  const release: unknown = JSON.parse(
    readFileSync(new URL('../../config/serve.distribution.json', import.meta.url), 'utf8'),
  )
  const controller = new AbortController()
  const port = await freePort()
  const layer = operatorLayer({ storageRoot, port, modelRoute: gateway.url }) as { ops: Op[] }
  const operator = {
    ...layer,
    ops: layer.ops.map(op => {
      const config = op.config ?? {}
      if (op.id === 'session-access')
        return {
          ...op,
          config: { ...config, historyKinds: [...(options.historyKinds ?? ['run.terminal'])] },
        }
      if (op.id === 'tool-bindings') {
        const tools = config['tools'] as Record<string, unknown>
        return {
          ...op,
          config: {
            ...config,
            tools: {
              ...tools,
              contentPageBytes: PAGE_BYTES,
              replyMaxBytes: INLINE_THRESHOLD,
              attemptMs: 5000,
            },
          },
        }
      }
      // Shell runs in the working directory of the session: without a workspace, the default one.
      if (op.id === 'session-ad03')
        writeFileSync(join(String(config['defaultDirectory']), PAYLOAD_FILE), author.body)
      const construction = config['construction'] as Record<string, unknown> | undefined
      if (construction?.['Shell'] !== undefined) {
        const shell = construction['Shell'] as Record<string, unknown>
        return {
          ...op,
          config: {
            ...config,
            construction: { ...construction, Shell: { ...shell, resultMaxBytes: 131_072 } },
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
  const [first, ...others] = entryObjects
  const objects: readonly EntryObjectModule[] =
    first === undefined || options.onScope === undefined
      ? entryObjects
      : [
          {
            ...first,
            async install(scope, given) {
              await first.install(scope, given)
              options.onScope?.(scope, given)
            },
          },
          ...others,
        ]
  const finished = runServe({
    distribution: release,
    operator,
    plugins: cordis,
    entryObjects: objects,
    stateRoot,
    stop: controller.signal,
    readinessTimeoutMs: 15_000,
    shutdownDeadlineMs: 10_000,
    write: record => options.record?.(record),
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

  async function terminal(home: string, session: string): Promise<string | null> {
    const answer = await readHistoryPage(
      protocolClients(server, savedCredentials(home)),
      savedTenant(home),
      session,
    )
    if (answer.outcome === 'basis-unavailable') return null
    if (answer.outcome !== 'succeeded') throw new Error(`read-history ${answer.outcome}`)
    const reached = (answer.body.entries[0]?.payload as { terminal?: { outcome?: string } })
      ?.terminal
    if (reached?.outcome === undefined) return null
    return reached.outcome === 'completed' ? 'completed' : JSON.stringify(reached)
  }

  return {
    base,
    stateRoot,
    storageRoot,
    server,
    cli,
    model,
    modelMs: () => modelMs,
    author,
    stderr,
    ready: () => until(() => connectable('127.0.0.1', port), 'the server to listen', 20_000),

    async enrol(home: string, name: string) {
      await cli(home, ['register', '--login-identifier', name], 'history-cost-password-1')
      await cli(home, ['login', '--login-identifier', name], 'history-cost-password-1')
    },

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
      if (options.readBack && result.digest !== author.digest)
        throw new Error('the body read back differs')
      return { elapsedMs, pages: result.pages, requests: result.requests }
    },

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

    async close(): Promise<number> {
      controller.abort('history cost run complete')
      const shutdown = await finished
      await gateway.close()
      rmSync(base, { recursive: true, force: true })
      return shutdown.exitCode
    },
  }
}
