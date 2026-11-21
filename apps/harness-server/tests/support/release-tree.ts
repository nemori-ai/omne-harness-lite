import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { expect, onTestFailed, onTestFinished } from 'vitest'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { ListPoolSchema, type PoolItem } from '@omne-harness/human-intervention'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SessionId, SessionOperationId } from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { toolRuntimeKey } from '@omne-harness/tool-cordis-contract/cordis'
import type { ToolRuntime } from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import * as cordis from '../../src/cordis.ts'
import { entryObjects } from '../../src/entry/index.ts'
import { sessionWorkIssuerOf, toolDecisionsIssuerOf } from '../../src/entry/principals.ts'
import { agentAdoptionsConfig } from '../../src/rows/agent-adoptions/config.ts'
import {
  createContextCompactionRow,
  type ContextCompactionRowInput,
} from '../../src/rows/context-compaction/index.ts'
import {
  toolHitlHolder,
  type HitlAudience,
  type ToolHitlHolder,
} from '../../src/rows/tool-hitl/holder.ts'
import { runServe, type S0Record } from '../../src/run.ts'
import type { EntryEnv, EntryObjectModule } from '../../src/types.ts'
import { startModelGateway, type GatewayScript } from '../fixtures/model-gateway.ts'
import {
  bodyOf,
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  savedLoginProof,
  savedTenant,
} from '../r9/support.ts'
import {
  readHistoryFrom,
  readHistoryPage,
  savedClients,
  type HistoryEntry,
  type ProtocolClients,
} from './protocol-clients.ts'

export function releaseDistribution(modes: ReleaseModes = {}): unknown {
  const distribution = JSON.parse(
    readFileSync(new URL('../../config/serve.distribution.json', import.meta.url), 'utf8'),
  ) as { rows: Array<{ id: string; config: unknown }> }
  const nonresident = modes.nonresident ?? []
  if (
    modes.permission === undefined &&
    modes.collaboration === undefined &&
    modes.model === undefined &&
    nonresident.length === 0
  )
    return distribution
  const adoptionRow = distribution.rows.find(row => row.id === 'agent-adoptions')
  if (adoptionRow === undefined) throw new Error('No Agent mappings')
  const mappings = agentAdoptionsConfig.parse(adoptionRow.config)
  const coding = mappings.mappings.find(mapping => mapping.name === 'coding')
  if (coding === undefined) throw new Error('No coding mapping')
  if (modes.permission !== undefined)
    coding.modes.permission = modes.permission as typeof coding.modes.permission
  if (modes.collaboration !== undefined) coding.modes.collaboration = modes.collaboration
  if (modes.model !== undefined) {
    if (coding.initialModelSelection === undefined) throw new Error('No coding model selection')
    coding.initialModelSelection.name = modes.model
  }
  const references = coding.definition['references'] as {
    capability: { name: string }
    resident: boolean
  }[]
  for (const reference of references)
    if (nonresident.includes(reference.capability.name)) reference.resident = false
  adoptionRow.config = mappings
  return distribution
}

type ReleaseModes = Readonly<{
  permission?: string
  collaboration?: 'co-work' | 'auto-drive'
  /** The model a coding session starts on, in place of the distribution's. */
  model?: string
  /** Release tools the coding Agent reaches only through Tools in this tree. */
  nonresident?: readonly string[]
}>

export const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

export type ScriptedToolCall = Readonly<{ id: string; tool: string; arguments: string }>

export function toolCallsThenText(
  pick: (body: string) => readonly ScriptedToolCall[],
): GatewayScript {
  return toolCallsByRequest(body => (body.includes('"role":"tool"') ? [] : pick(body)))
}

/** A model that answers each request with the calls `pick` gives, or with text when it gives none. */
export function toolCallsByRequest(
  pick: (body: string) => readonly ScriptedToolCall[],
): GatewayScript {
  return ({ body }) => {
    const serving = {
      model: (JSON.parse(body) as { model?: string }).model ?? 'm',
      provider: 'OpenAI',
    }
    const calls = pick(body)
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse(
        calls.length === 0
          ? [
              { ...serving, choices: [{ delta: { content: 'done' } }] },
              { choices: [{ delta: {}, finish_reason: 'stop' }] },
            ]
          : [
              {
                ...serving,
                choices: [
                  {
                    delta: {
                      tool_calls: calls.map((call, index) => ({
                        index,
                        id: call.id,
                        type: 'function',
                        function: { name: call.tool, arguments: call.arguments },
                      })),
                    },
                  },
                ],
              },
              { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
            ],
      ),
    }
  }
}

/**
 * A scripted model that, like a real one, has nothing to add when a request ends with its own
 * finished reply: it answers with an empty reply, and the request is counted in `asked`.
 * Every other request goes to `script`.
 */
export function likeARealModel(script: GatewayScript, asked: { ownReply: number }): GatewayScript {
  return request => {
    const body = JSON.parse(request.body) as {
      model?: string
      messages?: readonly Readonly<{ role?: string; tool_calls?: readonly unknown[] }>[]
    }
    const last = body.messages?.at(-1)
    if (last?.role !== 'assistant' || (last.tool_calls?.length ?? 0) > 0) return script(request)
    asked.ownReply += 1
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        {
          model: body.model ?? 'm',
          provider: 'OpenAI',
          choices: [{ delta: {}, finish_reason: 'stop' }],
        },
      ]),
    }
  }
}

function withHistoryKinds(layer: unknown, extra: readonly string[] = []): unknown {
  const { ops } = layer as { ops: Readonly<{ kind: string; id: string; config?: object }>[] }
  return {
    ops: ops.map(op =>
      op.id === 'session-access'
        ? {
            ...op,
            config: {
              ...op.config,
              historyKinds: [
                'message.user',
                'message.assistant',
                'message.tool',
                'message.compaction',
                'run.started',
                'run.terminal',
                ...extra,
              ],
            },
          }
        : op,
    ),
  }
}

function withQueueCapacity(layer: unknown, capacity: number | undefined): unknown {
  if (capacity === undefined) return layer
  const { ops } = layer as { ops: Readonly<{ kind: string; id: string; config?: object }>[] }
  return {
    ops: ops.map(op => {
      if (op.id !== 'tool-records') return op
      const config = op.config as { configuration: object }
      return {
        ...op,
        config: { ...config, configuration: { ...config.configuration, queueCapacity: capacity } },
      }
    }),
  }
}

/** The operator's values for the settings release tools declare, given on the tool-host row. */
function withToolSettings(
  layer: unknown,
  settings: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined,
): unknown {
  if (settings === undefined) return layer
  const { ops } = layer as { ops: Readonly<{ kind: string; id: string; config?: object }>[] }
  return {
    ops: ops.map(op =>
      op.id === 'tool-host' ? { ...op, config: { ...op.config, settings } } : op,
    ),
  }
}

function withObservationPolicy(
  layer: unknown,
  policy: Readonly<Record<string, number>> | undefined,
): unknown {
  if (policy === undefined) return layer
  const { ops } = layer as { ops: readonly object[] }
  return { ops: [...ops, { kind: 'replace', id: 'session-observation', config: { policy } }] }
}

function withAgentWaitInterval(layer: unknown): unknown {
  const { ops } = layer as { ops: Readonly<{ kind: string; id: string; config?: object }>[] }
  return {
    ops: ops.map(op =>
      op.id === 'agent-host'
        ? { ...op, config: { ...op.config, reconciliationDelaysMs: [50] } }
        : op,
    ),
  }
}

function withCompaction(layer: unknown, options: ReleaseTreeOptions): unknown {
  const { ops } = layer as {
    ops: Readonly<{ kind: string; id: string; config?: Record<string, unknown> }>[]
  }
  return {
    ops: ops.map(op => {
      if (op.id === 'agent-host' && options.compactionProvider !== undefined)
        return {
          ...op,
          config: { ...op.config, compactionProvider: options.compactionProvider.binding },
        }
      if (options.compactionTriggerPercent === undefined) return op
      if (op.id === 'model-profiles')
        return {
          ...op,
          config: { ...op.config, compactionTriggerPercent: options.compactionTriggerPercent },
        }
      if (op.id === 'model-records') {
        const sendStage = op.config?.['sendStage'] as Record<string, unknown>
        return {
          ...op,
          config: {
            ...op.config,
            sendStage: {
              ...sendStage,
              profiles: {
                ...(sendStage['profiles'] as object),
                compactionTriggerPercent: options.compactionTriggerPercent,
              },
            },
          },
        }
      }
      return op
    }),
  }
}

export type Entry = HistoryEntry

// The whole history of a session, page after page: one page holds only its first 256 KB.
export async function history(
  port: number,
  home: string,
  session: string,
): Promise<readonly Entry[]> {
  const clients = savedClients(port, home)
  const tenant = savedTenant(home)
  const entries: Entry[] = []
  let page = await readHistoryPage(clients, tenant, session)
  while (page.outcome === 'succeeded') {
    entries.push(...page.body.entries)
    if (page.body.exhausted || page.body.next === null) return entries
    page = await readHistoryFrom(clients, tenant, session, page.body.next)
  }
  return []
}

function sqliteFiles(storageRoot: string): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(sqlite|db)$/.test(entry.name)) files.push(path)
    }
  }
  walk(storageRoot)
  return files
}

type LedgerRow = Readonly<{ kind: string; name: string; record: Record<string, unknown> }>

export function executionFailures(storageRoot: string): readonly unknown[] {
  const failures: unknown[] = []
  for (const file of sqliteFiles(storageRoot)) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      if (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'er_fact'")
          .get() === undefined
      )
        continue
      for (const row of db
        .prepare('SELECT tenant, body FROM er_fact ORDER BY pub DESC, ord DESC LIMIT 12')
        .all()) {
        const text = unpackText(row['body'] as Uint8Array)
        if (!text.includes('node-failed') && !text.includes('compaction-failed')) continue
        const fact = JSON.parse(text) as { claim?: { failure?: { detail?: { digest: string } } } }
        const detail = fact.claim?.failure?.detail
        if (detail !== undefined) {
          const digest = detail.digest.startsWith('sha256:')
            ? detail.digest
            : `sha256:${detail.digest}`
          const blob = db
            .prepare('SELECT payload FROM sl_blob WHERE tenant = ? AND digest = ?')
            .get(String(row['tenant']), digest)
          if (blob !== undefined)
            failures.push(JSON.parse(unpackText(blob['payload'] as Uint8Array)))
        }
      }
    } finally {
      db.close()
    }
  }
  return failures
}

function ledgerRows(storageRoot: string): readonly LedgerRow[] {
  const rows: LedgerRow[] = []
  const unpacked = (value: unknown) => JSON.parse(unpackText(value as Uint8Array)) as unknown
  for (const file of sqliteFiles(storageRoot)) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const table = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tl_record'`)
        .get()
      if (table === undefined) continue
      for (const row of db.prepare(`SELECT kind, name, record, fixed FROM tl_record`).all()) {
        const record = unpacked(row['record']) as Record<string, unknown>
        const call = record['call']
        rows.push({
          kind: String(row['kind']),
          name: String(row['name']),
          record:
            row['fixed'] === null || typeof call !== 'object' || call === null
              ? record
              : { ...record, call: { ...call, request: unpacked(row['fixed']) } },
        })
      }
    } finally {
      db.close()
    }
  }
  return rows
}

export function toolRecords(storageRoot: string): Readonly<{ phases: string[]; stages: string[] }> {
  const phases: string[] = []
  const stages: string[] = []
  for (const row of ledgerRows(storageRoot)) {
    const record = row.record as {
      kind: string
      call?: { state?: { phase?: string } }
      entry?: { stage?: string }
    }
    if (record.kind === 'call' && record.call?.state?.phase !== undefined)
      phases.push(record.call.state.phase)
    if (record.kind === 'queue-entry' && record.entry?.stage !== undefined)
      stages.push(record.entry.stage)
  }
  return { phases, stages }
}

export type ToolCallRow = Readonly<{
  call: string
  tool: string
  phase: string
  /** Where the result stands with its consumer: `pending`, `released` once the consumer saved it, or null. */
  delivery: string | null
  entry: Readonly<{
    domain: string
    ordinal: string
    stage: string
    scopeBudget: number | null
  }> | null
}>

/** What the local Tool host recorded: permits, acceptances, rejections and the rest, as stored. */
export function hostRecords(storageRoot: string): readonly Readonly<Record<string, unknown>>[] {
  return ledgerRows(storageRoot).flatMap(row => {
    const record = row.record as {
      kind?: string
      host?: { value?: Record<string, unknown> | null }
    }
    const value = record.host?.value
    return record.kind === 'host' && value != null ? [value] : []
  })
}

/** The acceptance records of Tool starts: each start has one, with what it consumed. */
export function startAcceptances(
  storageRoot: string,
): readonly Readonly<Record<string, unknown>>[] {
  return hostRecords(storageRoot).filter(value => value['kind'] === 'acceptance')
}

export function toolCalls(storageRoot: string): readonly ToolCallRow[] {
  const calls = new Map<string, { tool: string; phase: string; delivery: string | null }>()
  const entries = new Map<string, NonNullable<ToolCallRow['entry']>>()
  for (const row of ledgerRows(storageRoot)) {
    const record = row.record as {
      kind: string
      call?: {
        call: string
        state: { phase: string; delivery: { kind: string } | null }
        request: { availability: { definition?: { name: string } } }
      }
      entry?: { call: string; ordinal: string; stage: string; scopeBudget: number | null }
    }
    if (record.kind === 'call' && record.call !== undefined)
      calls.set(record.call.call, {
        tool: record.call.request.availability.definition?.name ?? '',
        phase: record.call.state.phase,
        delivery: record.call.state.delivery?.kind ?? null,
      })
    if (record.kind === 'queue-entry' && record.entry !== undefined)
      entries.set(record.entry.call, {
        domain: row.name,
        ordinal: record.entry.ordinal,
        stage: record.entry.stage,
        scopeBudget: record.entry.scopeBudget,
      })
  }
  return [...calls]
    .map(([call, row]) => ({ call, ...row, entry: entries.get(call) ?? null }))
    .sort((left, right) => Number(left.entry?.ordinal ?? 0) - Number(right.entry?.ordinal ?? 0))
}

export type ToolCallFacts = Readonly<{
  arguments: string
  starts: number
  accounts: readonly string[]
  /** The duration of each account the ledger holds for the call, as stored. */
  durations: readonly unknown[]
  /** The receipt of each account: `received`, or `late` once a late version took the next revision. */
  receipts: readonly string[]
  /** The relation of each result version: `original`, or `late` for a real end after the logical one. */
  results: readonly string[]
}>

/** Per call of the Tool ledger: its admitted effective arguments, its start operations, its accounts and its result versions. */
export function toolCallFacts(storageRoot: string): ReadonlyMap<string, ToolCallFacts> {
  const args = new Map<string, string>()
  const starts = new Map<string, number>()
  const accounts = new Map<string, string[]>()
  const durations = new Map<string, unknown[]>()
  const receipts = new Map<string, string[]>()
  const results = new Map<string, string[]>()
  for (const row of ledgerRows(storageRoot)) {
    const record = row.record as {
      kind: string
      call?: { call: string; request: { arguments: { effective: string } } }
      operation?: { call: string; operation: string }
      account?: {
        call: string
        event: string
        value?: { duration?: unknown; receipt?: string }
      }
      result?: { call: string; relation: string }
    }
    if (record.kind === 'call' && record.call !== undefined)
      args.set(record.call.call, record.call.request.arguments.effective)
    if (record.kind === 'operation' && record.operation?.operation.endsWith('/start') === true)
      starts.set(record.operation.call, (starts.get(record.operation.call) ?? 0) + 1)
    if (record.kind === 'account' && record.account !== undefined) {
      accounts.set(record.account.call, [
        ...(accounts.get(record.account.call) ?? []),
        record.account.event,
      ])
      durations.set(record.account.call, [
        ...(durations.get(record.account.call) ?? []),
        record.account.value?.duration,
      ])
      receipts.set(record.account.call, [
        ...(receipts.get(record.account.call) ?? []),
        String(record.account.value?.receipt),
      ])
    }
    if (record.kind === 'result' && record.result !== undefined)
      results.set(record.result.call, [
        ...(results.get(record.result.call) ?? []),
        record.result.relation,
      ])
  }
  return new Map(
    [...args].map(([call, value]) => [
      call,
      {
        arguments: value,
        starts: starts.get(call) ?? 0,
        accounts: accounts.get(call) ?? [],
        durations: durations.get(call) ?? [],
        receipts: receipts.get(call) ?? [],
        results: results.get(call) ?? [],
      },
    ]),
  )
}

export type ToolCallLedger = Readonly<{
  call: string
  tool: string
  phase: string
  terminal: string | null
  execution: string
  waits: readonly Readonly<{ phase: string; cause: string | null }>[]
  tasks: readonly string[]
  released: boolean
}>

export function toolLedger(storageRoot: string): readonly ToolCallLedger[] {
  const rows = ledgerRows(storageRoot)
  const queued = new Set(
    rows.flatMap(row =>
      row.record['kind'] === 'queue-entry'
        ? [String((row.record['entry'] as { call: string }).call)]
        : [],
    ),
  )
  return rows.flatMap(({ kind, name, record }) => {
    if (record['kind'] !== 'call') return []
    const call = record['call'] as {
      call: string
      state: {
        phase: string
        terminal?: { kind: string }
        execution: { kind: string }
        queue: { kind: string }
      }
      request: { availability: { definition?: { name: string } } }
    }
    const domain = rows.filter(row => row.kind === kind && row.name === name)
    return [
      {
        call: call.call,
        tool: call.request.availability.definition?.name ?? '',
        phase: call.state.phase,
        terminal: call.state.terminal?.kind ?? null,
        execution: call.state.execution.kind,
        waits: domain.flatMap(row => {
          if (row.record['kind'] !== 'wait') return []
          const wait = (row.record['wait'] as { record: { phase: string; cause?: string } }).record
          return [{ phase: wait.phase, cause: wait.cause ?? null }]
        }),
        tasks: domain.flatMap(row => {
          if (row.record['kind'] !== 'task') return []
          const task = row.record['task'] as { kind: string; action?: string }
          return [task.action === undefined ? task.kind : `${task.kind}/${task.action}`]
        }),
        released: call.state.queue.kind === 'released' && !queued.has(call.call),
      },
    ]
  })
}

export type ReleaseToolRuntime = ToolRuntime<unknown, ToolMessageContentBlock>

export type ReleaseTree = Readonly<{
  port: number
  home: string
  clients: ProtocolClients
  storageRoot: string
  env: EntryEnv
  scope: Context
  hitl: ToolHitlHolder
  toolRuntime(): ReleaseToolRuntime
  records: readonly S0Record[]
  cli(args: readonly string[], credential?: string): ReturnType<typeof runOmne>
  relogin(): Promise<string>
  startSession(text: string, definition?: string): Promise<string>
  registrar(): Readonly<{ tenant: TenantId; principal: ActingForTenantPrincipal }>
  cards(
    filter?: Readonly<{ sessionRef?: string; states?: readonly string[] }>,
  ): Promise<readonly PoolItem[]>
  archive(session: string): ReturnType<SessionService['work']['control']>
}>

export type ReleaseTreeOptions = Readonly<{
  script: GatewayScript
  permission?: string
  collaboration?: 'co-work' | 'auto-drive'
  model?: string
  nonresident?: readonly string[]
  audience?: (registrar: string) => HitlAudience
  queueCapacity?: number
  observationPolicy?: Readonly<Record<string, number>>
  compactionProvider?: ContextCompactionRowInput
  compactionTriggerPercent?: string
  /** History kinds read through session/v1 besides the five every tree reads. */
  extraHistoryKinds?: readonly string[]
  /** Runs while no service is up, before the service of each run starts on the same state. */
  beforeRun?: (run: number, storageRoot: string) => Promise<void>
  /** The operator's values for the settings release tools declare, by tool name and item id. */
  toolSettings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  /** Rows left out of the release, together with the operator's values for them. */
  /** The rows left out of every run, or of each run by its index. */
  withoutRows?: readonly string[] | ((run: number) => readonly string[])
  /** Rows a test adds to the release, each with the row plugin that serves it. */
  addedRows?: readonly AddedRow[]
  /** The screen backend the host row is given; absent: the one of the machine the test runs on. */
  hostScreen?: NonNullable<Parameters<typeof runServe>[0]['hostScreen']>
}>

export type AddedRow = Readonly<{
  id: string
  plugin: string
  config: unknown
  definition: Plugin.Object
}>

const rowsLeftOut = (left: ReleaseTreeOptions['withoutRows'], run: number): readonly string[] =>
  typeof left === 'function' ? left(run) : (left ?? [])

function withoutRows<T>(layered: T, key: 'rows' | 'ops', left: readonly string[] = []): T {
  const list = (layered as Record<string, readonly { id: string }[]>)[key] ?? []
  return { ...layered, [key]: list.filter(entry => !left.includes(entry.id)) }
}

function withAddedRows(distribution: unknown, added: readonly AddedRow[] = []): unknown {
  const { rows } = distribution as { rows: readonly object[] }
  return {
    ...(distribution as object),
    rows: [...rows, ...added.map(({ id, plugin, config }) => ({ id, plugin, config }))],
  }
}

export async function onReleaseTree(
  options: ReleaseTreeOptions,
  body: (tree: ReleaseTree) => Promise<void>,
): Promise<number | undefined> {
  const [exitCode] = await onReleaseTreeRuns(options, [body])
  return exitCode
}

export async function onReleaseTreeRuns(
  options: ReleaseTreeOptions,
  bodies: readonly ((tree: ReleaseTree) => Promise<void>)[],
): Promise<readonly (number | undefined)[]> {
  const dir = newScratch('release-tree-')
  let port = await freePort()
  const home = join(dir.base, 'home')
  const gateway = await startModelGateway(options.script)
  gateway.trustInProcess()
  const exitCodes: (number | undefined)[] = []
  const serve = async (run: number, body: (tree: ReleaseTree) => Promise<void>) => {
    await options.beforeRun?.(run, dir.storageRoot)
    for (let attempt = 1; ; attempt += 1) {
      const state = { dir, port, home, modelRoute: gateway.url }
      const left = rowsLeftOut(options.withoutRows, run)
      const outcome = await serveOnce({ ...options, withoutRows: left }, state, run === 0, body)
      if (outcome !== PORT_TAKEN) return outcome
      if (attempt === PORT_ATTEMPTS)
        throw new Error(`port ${String(port)} was taken on ${String(PORT_ATTEMPTS)} starts`)
      if (run === 0) port = await freePort()
    }
  }
  try {
    for (const [run, body] of bodies.entries()) exitCodes.push(await serve(run, body))
  } finally {
    await gateway.close()
    dir.remove()
  }
  return exitCodes
}

// An idle machine starts the release tree in four to five seconds. The limit stays far above that, so a
// busy machine does not turn a slow start into a failed one; the test's own timeout is the bound.
const READINESS_TIMEOUT_MS = 100_000
const STDERR_TAIL_LINES = 20

const stderrTail = (lines: readonly string[]) =>
  lines.length === 0
    ? ''
    : `\nserver stderr, last ${Math.min(lines.length, STDERR_TAIL_LINES)} of ${lines.length} lines:\n${lines.slice(-STDERR_TAIL_LINES).join('\n')}`
const SHUTDOWN_DEADLINE_MS = 100_000

// Any socket may take the probed port before the server binds it. Such a start accepted nothing, so it
// is started again: the first run on a new port, a later run on the port its saved clients know.
const PORT_ATTEMPTS = 5
const PORT_TAKEN = Symbol('port taken')

function lostThePort(started: S0Record | undefined): boolean {
  const failure = started?.['startFailure'] as { detail?: unknown } | undefined
  return started?.['outcome'] === 'start-failed' && String(failure?.detail).includes('EADDRINUSE')
}

type ReleaseState = Readonly<{
  dir: ReturnType<typeof newScratch>
  port: number
  home: string
  modelRoute: string
}>

async function serveOnce(
  options: ReleaseTreeOptions,
  state: ReleaseState,
  register: boolean,
  body: (tree: ReleaseTree) => Promise<void>,
): Promise<number | undefined | typeof PORT_TAKEN> {
  const { dir, port, home } = state
  const controller = new AbortController()
  const records: S0Record[] = []
  const serverErrors: string[] = []
  const startup = Promise.withResolvers<S0Record | undefined>()
  let env: EntryEnv | undefined
  let hitl: ToolHitlHolder | undefined
  let toolRuntime: (() => ReleaseToolRuntime) | undefined
  let toolScope: Context | undefined
  let exitCode: number | undefined
  const objects: readonly EntryObjectModule[] = entryObjects.map(object =>
    object.name === 'toolClock'
      ? {
          ...object,
          async install(scope, given) {
            await object.install(scope, given)
            env = given
            toolScope = scope
            hitl = toolHitlHolder(scope)
            toolRuntime = () => {
              const runtime = scope.get(toolRuntimeKey) as ReleaseToolRuntime | undefined
              if (runtime === undefined) throw new Error('no Tool runtime')
              return runtime
            }
          },
        }
      : object,
  )
  const finished = runServe({
    ...(options.hostScreen === undefined ? {} : { hostScreen: options.hostScreen }),
    distribution: withAddedRows(
      withoutRows(releaseDistribution(options), 'rows', rowsLeftOut(options.withoutRows, 0)),
      options.addedRows,
    ),
    operator: withoutRows(
      withToolSettings(
        withObservationPolicy(
          withAgentWaitInterval(
            withQueueCapacity(
              withHistoryKinds(
                withCompaction(
                  operatorLayer({
                    storageRoot: dir.storageRoot,
                    port,
                    modelRoute: state.modelRoute,
                  }),
                  options,
                ),
                options.extraHistoryKinds,
              ),
              options.queueCapacity,
            ),
          ),
          options.observationPolicy,
        ),
        options.toolSettings,
      ),
      'ops',
      rowsLeftOut(options.withoutRows, 0),
    ),
    plugins: {
      ...cordis,
      ...Object.fromEntries((options.addedRows ?? []).map(row => [row.plugin, row.definition])),
      ...(options.compactionProvider === undefined
        ? {}
        : {
            contextCompactionRow: createContextCompactionRow(options.compactionProvider),
          }),
    },
    entryObjects: objects,
    stateRoot: dir.stateRoot,
    stop: controller.signal,
    readinessTimeoutMs: READINESS_TIMEOUT_MS,
    shutdownDeadlineMs: SHUTDOWN_DEADLINE_MS,
    write: record => {
      records.push(record)
      if (record.kind === 'startup-result') startup.resolve(record)
    },
    stderr: line => serverErrors.push(line),
  })
  void finished.then(
    () => startup.resolve(undefined),
    () => startup.resolve(undefined),
  )
  try {
    const started = await startup.promise
    if (lostThePort(started)) {
      await finished.catch(() => undefined)
      return PORT_TAKEN
    }
    if (started?.['accepting'] !== true)
      throw new Error(
        `the server did not start accepting: ${JSON.stringify(started ?? null)}${stderrTail(serverErrors)}`,
      )
    if (
      env === undefined ||
      hitl === undefined ||
      toolRuntime === undefined ||
      toolScope === undefined
    )
      throw new Error('toolClock was not installed')
    const scope = toolScope
    const issue = toolDecisionsIssuerOf(env)
    const cli = (args: readonly string[], credential?: string) =>
      runOmne({
        args: [...args],
        home,
        server: `http://127.0.0.1:${String(port)}`,
        cwd: dir.base,
        ...(credential === undefined ? {} : { credential }),
      })
    const credential = 'erin-pw-release-tree-71f3'
    if (register) {
      expect((await cli(['register', '--login-identifier', 'erin'], credential)).status).toBe(0)
      expect((await cli(['login', '--login-identifier', 'erin'], credential)).status).toBe(0)
    }
    const registrar = () => {
      const parsed = tenantCodec.parse(savedTenant(home))
      if (!parsed.ok) throw new Error('the saved tenant does not parse')
      const principal = issue(parsed.value)
      if (principal === undefined) throw new Error('no registering principal')
      return { tenant: parsed.value, principal }
    }
    if (options.audience !== undefined)
      hitl.audience = options.audience(standingPrincipalRef(registrar().principal))
    const relogin = async () => {
      const again = await cli(['login', '--login-identifier', 'erin'], credential)
      expect(again.status, again.stderr).toBe(0)
      return savedLoginProof(home)
    }
    const startSession = async (text: string, definition = 'coding') => {
      const created = await cli(['create-session', '--definition', definition])
      expect(created.status, created.stderr).toBe(0)
      const session = String(bodyOf(created)['session'])
      const sent = await cli(['send-input', '--session', session, '--text', text])
      expect(sent.status, sent.stderr).toBe(0)
      return session
    }
    const holder = hitl
    const cards: ReleaseTree['cards'] = async (filter = {}) => {
      const at = await holder.host?.tenant(savedTenant(home))
      if (at?.kind !== 'ready') return []
      const page = await at.tenant.application.listPool(
        registrar().principal,
        ListPoolSchema.parse({
          protocol: 'hitl/1',
          tenantRef: savedTenant(home),
          locationRef: 'local',
          filter: { states: ['pending'], ...filter },
          limit: 20,
        }),
      )
      return page.kind === 'page' ? page.items : []
    }
    const issueWork = sessionWorkIssuerOf(env)
    const archive: ReleaseTree['archive'] = async session => {
      const { tenant } = registrar()
      const principal = issueWork({ tenant, session })
      if ('failure' in principal) throw new Error('no session work principal')
      const service = scope.intercept(sessionKey, { caller: 'intake' }).get(sessionKey) as
        | SessionService
        | undefined
      if (service === undefined) throw new Error('no Session service')
      return service.work.control({
        principal: principal.ok,
        tenant,
        session: session as SessionId,
        operation: `sop_release-tree-archive-${session}` as SessionOperationId,
        intent: { kind: 'archive' },
      })
    }
    await body({
      port,
      home,
      clients: savedClients(port, home),
      storageRoot: dir.storageRoot,
      env,
      scope,
      hitl,
      toolRuntime,
      records,
      cli,
      relogin,
      startSession,
      registrar,
      cards,
      archive,
    })
  } catch (error) {
    if (serverErrors.length > 0)
      process.stderr.write(`release tree, server stderr:\n${serverErrors.join('\n')}\n`)
    throw error
  } finally {
    controller.abort('test: stop')
    exitCode = (await finished.catch(() => undefined))?.exitCode
    if (exitCode !== undefined && exitCode !== 0)
      process.stderr.write(`release tree, server exit ${String(exitCode)}: ${unsettled(records)}\n`)
  }
  return exitCode
}

// What a shutdown left unsettled, row by row: a server that exits non-zero names its own cause.
function unsettled(records: readonly S0Record[]): string {
  const result = records.findLast(record => record['kind'] === 'shutdown-result')
  if (result === undefined) return 'no shutdown result was written'
  const outcomes = result['outcomes'] as readonly Readonly<{ result: { kind: string } }>[]
  return JSON.stringify({
    ...result,
    outcomes: outcomes.filter(outcome => outcome.result.kind !== 'settled'),
  })
}

export async function pollUntil<T>(
  what: string,
  read: () => T | Promise<T>,
  done: (value: T) => boolean,
): Promise<T> {
  let value = await read()
  let testOver = false
  onTestFinished(() => {
    testOver = true
  })
  onTestFailed(() => {
    if (!done(value))
      process.stderr.write(`release tree: ${what} had not happened: ${JSON.stringify(value)}\n`)
  })
  while (!done(value)) {
    if (testOver) throw new Error(`${what} did not happen: ${JSON.stringify(value)}`)
    await sleep(200)
    value = await read()
  }
  return value
}

function textsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(textsOf)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  if (record['kind'] === 'text' && typeof record['text'] === 'string') return [record['text']]
  return Object.values(record).flatMap(textsOf)
}

export const toolResults = (entries: readonly Entry[]): string[] =>
  entries
    .filter(entry => entry.kind === 'message.tool')
    .map(entry => textsOf(entry.payload).join('\n'))

export async function answerCard(tree: ReleaseTree, session: string, text: string): Promise<void> {
  const [item] = await pollUntil(
    'the card of the session',
    () => tree.cards({ sessionRef: session }),
    cards => cards.length === 1,
  )
  if (item === undefined) throw new Error('the session has no card')
  const answered = await tree.cli([
    'submit-reply',
    '--request',
    item.card.ref.request.requestId,
    '--card',
    item.card.ref.cardId,
    '--revision',
    item.card.revision,
    '--text',
    text,
    '--reply-id',
    `reply-${session}`,
  ])
  expect(answered.status, answered.stderr).toBe(0)
}

export function historyOf(tree: ReleaseTree, session: string): Promise<readonly Entry[]> {
  return history(tree.port, tree.home, session)
}
