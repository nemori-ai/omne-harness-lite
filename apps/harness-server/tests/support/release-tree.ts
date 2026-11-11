// 发行树端到端的共用支架：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），模型走本进程的
// 脚本网关，每条 CLI 命令起一个 `omne` 子进程（先构建 `apps/cli`）。场景只给网关脚本与断言。
// 支架提供：起停服务、注册与登录一个用户、再登录一次、建会话并送一条输入、读会话历史、读 Tool 的耐久记录、经进程内的
// HITL 应用列卡，以及经 HITL 位置（`/hitl-public/1`）的真实 HTTP 往返。停服后答服务的退出码。入口对象 `toolClock` 被包一层，只为取得本次运行
// 的入口环境、Tool 决策方的共享状态、Tool 运行时服务与 Session 服务，树的其余部分不变。卡片的受众是发行注入的规则，场景可以换掉它。
// 公开契约没有归档会话的操作，所以归档经进程内 Session 服务的 `work.control`，主体是该会话的会话工作主体。
// 场景可以换掉 Tool 队列的容量（运维者层 `tool-records` 行的 `queueCapacity`）。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { ListPoolSchema, type PoolItem } from '@omne-harness/human-intervention'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  encodeHitlRequest,
  readHitlResponse,
  type HitlOperation,
  type HitlRequest,
  type HitlResponse,
} from '@omne-harness/public-contract'
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
  toolHitlHolder,
  type HitlAudience,
  type ToolHitlHolder,
} from '../../src/rows/tool-hitl/holder.ts'
import { runServe, type S0Record } from '../../src/run.ts'
import type { EntryEnv, EntryObjectModule } from '../../src/types.ts'
import { startModelGateway, type GatewayScript } from '../fixtures/model-gateway.ts'
import { SESSION_PATH } from '../r9/flow.ts'
import {
  bodyOf,
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  savedLoginProof,
  savedTenant,
} from '../r9/support.ts'
import { connectable, until } from '../rows/server-entry/support.ts'

/**
 * The release distribution. `modes` replaces modes of the `coding` definition when given: the
 * permission mode, for a scenario that must not stop at the permission inquiry; the collaboration
 * mode, for a scenario of a session that does not ask a person.
 */
export function releaseDistribution(modes: ReleaseModes = {}): unknown {
  const distribution = JSON.parse(
    readFileSync(new URL('../../config/serve.distribution.json', import.meta.url), 'utf8'),
  ) as { rows: Array<{ id: string; config: unknown }> }
  if (modes.permission === undefined && modes.collaboration === undefined) return distribution
  const adoptionRow = distribution.rows.find(row => row.id === 'agent-adoptions')
  if (adoptionRow === undefined) throw new Error('No Agent mappings')
  const mappings = agentAdoptionsConfig.parse(adoptionRow.config)
  const coding = mappings.mappings.find(mapping => mapping.name === 'coding')
  if (coding === undefined) throw new Error('No coding mapping')
  if (modes.permission !== undefined)
    coding.modes.permission = modes.permission as typeof coding.modes.permission
  if (modes.collaboration !== undefined) coding.modes.collaboration = modes.collaboration
  adoptionRow.config = mappings
  return distribution
}

type ReleaseModes = Readonly<{ permission?: string; collaboration?: 'co-work' | 'auto-drive' }>

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

export type ScriptedToolCall = Readonly<{ id: string; tool: string; arguments: string }>

/**
 * A gateway script: a request without a tool result answers with the calls that `pick` gives for
 * the request body (none: the text `done`); a request that has a tool result answers with `done`.
 */
export function toolCallsThenText(
  pick: (body: string) => readonly ScriptedToolCall[],
): GatewayScript {
  return ({ body }) => {
    const serving = {
      model: (JSON.parse(body) as { model?: string }).model ?? 'm',
      provider: 'OpenAI',
    }
    const calls = body.includes('"role":"tool"') ? [] : pick(body)
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

/** The operator layer with `read-history` listing the tool messages and the Run boundaries too. */
function withHistoryKinds(layer: unknown): unknown {
  const { ops } = layer as { ops: Readonly<{ kind: string; id: string; config?: object }>[] }
  return {
    ops: ops.map(op =>
      op.id === 'server-entry'
        ? {
            ...op,
            config: {
              ...op.config,
              historyKinds: [
                'message.user',
                'message.assistant',
                'message.tool',
                'run.started',
                'run.terminal',
              ],
            },
          }
        : op,
    ),
  }
}

/** The operator layer with the Tool queue capacity replaced, when `capacity` is given. */
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

async function post(port: number, body: unknown): Promise<{ status: number; body: string }> {
  const response = await fetch(`http://127.0.0.1:${String(port)}${SESSION_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.text() }
}

export type Entry = Readonly<{ kind: string; payload: Record<string, unknown> }>

export async function history(
  port: number,
  home: string,
  session: string,
): Promise<readonly Entry[]> {
  const answer = await post(port, {
    protocolVersion: 'session-public/1',
    messageId: `ask-history-${String(Date.now())}`,
    operation: 'read-history',
    body: {
      tenant: savedTenant(home),
      session,
      cursor: null,
      direction: 'forward',
      pageBytes: '262144',
    },
    loginProof: savedLoginProof(home),
  })
  if (answer.status !== 200) return []
  return (JSON.parse(answer.body) as { body: { entries: Entry[] } }).body.entries
}

/** The SQLite files under `storageRoot`. */
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

/** One row of the Tool ledger as SQLite holds it: the domain it belongs to and its record. */
type LedgerRow = Readonly<{ kind: string; name: string; record: Record<string, unknown> }>

/**
 * The Tool ledger rows of every tenant domain under `storageRoot`. The store keeps a record as
 * packed text, and the fixed request of a call record in a column of its own: both are read back
 * the way the store reads them.
 */
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

/** The durable Tool records of the tenant domain: call states and queue entries, read from SQLite. */
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

/** One Tool call of the tenant domain, as SQLite holds it, with its queue entry while it has one. */
export type ToolCallRow = Readonly<{
  call: string
  tool: string
  phase: string
  /** The queue entry: its domain (the concurrency scope), ordinal, stage and scope budget. */
  entry: Readonly<{
    domain: string
    ordinal: string
    stage: string
    scopeBudget: number | null
  }> | null
}>

/** The Tool calls of the tenant domain, read from SQLite, in the order of their queue ordinal. */
export function toolCalls(storageRoot: string): readonly ToolCallRow[] {
  const calls = new Map<string, { tool: string; phase: string }>()
  const entries = new Map<string, NonNullable<ToolCallRow['entry']>>()
  for (const row of ledgerRows(storageRoot)) {
    const record = row.record as {
      kind: string
      call?: {
        call: string
        state: { phase: string }
        request: { availability: { definition?: { name: string } } }
      }
      entry?: { call: string; ordinal: string; stage: string; scopeBudget: number | null }
    }
    if (record.kind === 'call' && record.call !== undefined)
      calls.set(record.call.call, {
        tool: record.call.request.availability.definition?.name ?? '',
        phase: record.call.state.phase,
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
    .map(([call, { tool, phase }]) => ({ call, tool, phase, entry: entries.get(call) ?? null }))
    .sort((left, right) => Number(left.entry?.ordinal ?? 0) - Number(right.entry?.ordinal ?? 0))
}

/** One Tool call as its call domain holds it: the state, its waits, its open duties and its release. */
export type ToolCallLedger = Readonly<{
  call: string
  tool: string
  phase: string
  /** The kind of the terminal of a settled call, else null. */
  terminal: string | null
  /** The kind of the physical execution: `suspended` while no resume segment started. */
  execution: string
  /** The waits of the call, each with its phase and, once closed, its cause. */
  waits: readonly Readonly<{ phase: string; cause: string | null }>[]
  /** The duties of the call that are still there: the kind, and the action of a wait duty. */
  tasks: readonly string[]
  /**
   * The entry of the call was released: the call settled with a released queue position and the
   * queue domain holds no entry of it. A release deletes the entry and writes nothing else.
   */
  released: boolean
}>

/** The Tool calls of the tenant domain with their waits and duties, read from SQLite. */
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

/** HITL 位置的路径（承载绑定表）。 */
export const HITL_PATH = '/hitl-public/1'
const HITL_LIMITS = {
  maxBytes: 4_194_304,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 1_000,
  maxStringLength: 1_048_576,
  maxNumberLength: 100,
}

/** 一次 HITL 位置的往返：状态、响应头（不含 `date`）、正文字节，以及按公开契约读出的响应。 */
export type HitlExchange = Readonly<{
  status: number
  headers: readonly (readonly [string, string])[]
  bytes: string
  response: HitlResponse<HitlOperation> | undefined
}>

/**
 * 经真实 HTTP 送一条 HITL 请求。请求按公开契约编码，响应按公开契约读取，与 SDK 的 `createHitlClient` 用同一对编解码函数。
 * `date` 头随秒变化，不进比较。
 */
export async function hitlPublic(port: number, request: HitlRequest): Promise<HitlExchange> {
  const encoded = encodeHitlRequest({ request, limits: HITL_LIMITS })
  if (encoded.kind !== 'encoded')
    throw new Error(`the HITL request does not encode: ${encoded.kind}`)
  const answer = await fetch(`http://127.0.0.1:${String(port)}${HITL_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: encoded.bytes,
  })
  const bytes = new Uint8Array(await answer.arrayBuffer())
  const read = readHitlResponse({
    bytes,
    operation: request.operation,
    expectedMessageId: request.messageId,
    limits: HITL_LIMITS,
  })
  return {
    status: answer.status,
    headers: [...answer.headers].filter(([name]) => name !== 'date'),
    bytes: new TextDecoder().decode(bytes),
    response: read.kind === 'response' ? read.response : undefined,
  }
}

/** The Tool runtime service of the release, over the release's content blocks. */
export type ReleaseToolRuntime = ToolRuntime<unknown, ToolMessageContentBlock>

export type ReleaseTree = Readonly<{
  port: number
  home: string
  storageRoot: string
  /** The entry environment of the run: the narrow issuer views of `src/entry/principals.ts` take it. */
  env: EntryEnv
  /** The shared state of the Tool decision owner over HITL (`rows/tool-hitl`). */
  hitl: ToolHitlHolder
  /** The Tool runtime service of the run, as the Agent host reads it; a scenario may wrap `invoke`. */
  toolRuntime(): ReleaseToolRuntime
  records: readonly S0Record[]
  cli(args: readonly string[], credential?: string): ReturnType<typeof runOmne>
  /** Logs the same user in once more and answers the new login proof; the CLI then uses it. */
  relogin(): Promise<string>
  /** Creates a session of `definition` (default `coding`), sends it one input, answers its id. */
  startSession(text: string, definition?: string): Promise<string>
  /** The registering principal of the decision owner for the logged-in tenant. */
  registrar(): Readonly<{ tenant: TenantId; principal: ActingForTenantPrincipal }>
  /** The cards that the registering principal reads in the pool, with the given filter. */
  cards(
    filter?: Readonly<{ sessionRef?: string; states?: readonly string[] }>,
  ): Promise<readonly PoolItem[]>
  /**
   * Archives `session` through the in-process Session service, as the session work principal of the
   * session; answers what `work.control` answers.
   */
  archive(session: string): ReturnType<SessionService['work']['control']>
}>

export type ReleaseTreeOptions = Readonly<{
  script: GatewayScript
  permission?: string
  collaboration?: 'co-work' | 'auto-drive'
  audience?: (registrar: string) => HitlAudience
  /** Replaces the `queueCapacity` of the Tool runtime (the `tool-records` row of the operator layer). */
  queueCapacity?: number
}>

/**
 * Starts the release tree with `script`, registers and logs in one user, runs `body`, then stops.
 * `audience` replaces the readers and responders of HITL cards that the release injects (the entry
 * principal of the tenant); it gets the reference of the registering principal of the decision owner.
 * Answers the exit code of the stopped service, or undefined when the service did not finish.
 */
export async function onReleaseTree(
  options: ReleaseTreeOptions,
  body: (tree: ReleaseTree) => Promise<void>,
): Promise<number | undefined> {
  const [exitCode] = await onReleaseTreeRuns(options, [body])
  return exitCode
}

/**
 * Starts the release tree once per body on the same state root, storage root, port and home, and
 * stops it after each body. The first run registers and logs in one user; the later runs use the
 * login that the first saved. Answers the exit code of each stop, in order. The state is removed
 * after the last run.
 */
export async function onReleaseTreeRuns(
  options: ReleaseTreeOptions,
  bodies: readonly ((tree: ReleaseTree) => Promise<void>)[],
): Promise<readonly (number | undefined)[]> {
  const dir = newScratch('release-tree-')
  const port = await freePort()
  const home = join(dir.base, 'home')
  const gateway = await startModelGateway(options.script)
  gateway.trustInProcess()
  const exitCodes: (number | undefined)[] = []
  try {
    for (const [run, body] of bodies.entries())
      exitCodes.push(
        await serveOnce(options, { dir, port, home, modelRoute: gateway.url }, run === 0, body),
      )
  } finally {
    await gateway.close()
    dir.remove()
  }
  return exitCodes
}

type ReleaseState = Readonly<{
  dir: ReturnType<typeof newScratch>
  port: number
  home: string
  modelRoute: string
}>

/** One start and stop of the release tree on `state`; `register` registers and logs in the user. */
async function serveOnce(
  options: ReleaseTreeOptions,
  state: ReleaseState,
  register: boolean,
  body: (tree: ReleaseTree) => Promise<void>,
): Promise<number | undefined> {
  const { dir, port, home } = state
  const controller = new AbortController()
  const records: S0Record[] = []
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
    distribution: releaseDistribution(options),
    operator: withQueueCapacity(
      withHistoryKinds(
        operatorLayer({ storageRoot: dir.storageRoot, port, modelRoute: state.modelRoute }),
      ),
      options.queueCapacity,
    ),
    plugins: { ...cordis },
    entryObjects: objects,
    stateRoot: dir.stateRoot,
    stop: controller.signal,
    readinessTimeoutMs: 15_000,
    shutdownDeadlineMs: 5000,
    write: record => records.push(record),
    stderr: () => {},
  })
  try {
    await until(() => connectable('127.0.0.1', port), 'the server to listen', 20_000)
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
      storageRoot: dir.storageRoot,
      env,
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
  } finally {
    controller.abort('test: stop')
    exitCode = (await finished.catch(() => undefined))?.exitCode
  }
  return exitCode
}

/** Polls `read` until `done` holds for its value, for at most two minutes; answers the value. */
export async function pollUntil<T>(
  what: string,
  read: () => T | Promise<T>,
  done: (value: T) => boolean,
): Promise<T> {
  let value = await read()
  for (const end = Date.now() + 120_000; !done(value); await sleep(200)) {
    if (Date.now() > end) throw new Error(`${what} did not happen: ${JSON.stringify(value)}`)
    value = await read()
  }
  return value
}

/** The texts of the text blocks in a value, in order. */
function textsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(textsOf)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  if (record['kind'] === 'text' && typeof record['text'] === 'string') return [record['text']]
  return Object.values(record).flatMap(textsOf)
}

/** The result texts of the tool messages in a history, one per tool message. */
export const toolResults = (entries: readonly Entry[]): string[] =>
  entries
    .filter(entry => entry.kind === 'message.tool')
    .map(entry => textsOf(entry.payload).join('\n'))

/** Answers the one pending card of `session` with own words `text` through the CLI. */
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

/** Reads the history of `session` as the logged-in user. */
export function historyOf(tree: ReleaseTree, session: string): Promise<readonly Entry[]> {
  return history(tree.port, tree.home, session)
}
