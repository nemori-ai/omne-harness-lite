// The Session log combination over SQL for the production Journal provider: the Session storage
// port of session-storage-sql and the session-log Journal on one storage, with one session that
// has an active Run and an opened execution. The storage is either a node:sqlite test double that
// runs the real participant, migration and read handler modules of the published materials, or
// the real sqlite-provider (real Workers and files). The double models receipts, rollback by a
// stopping reply, recognition by identity and the read rules; it does not model Workers or
// durability, and a pass on it proves neither.
import { Context, Service } from '@deepseek-ai/cordis'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  decodeAgentExecutionId,
  decodeInputId,
  type AcceptedInput,
  type AgentJournal,
} from '@omne-harness/agent-contract'
import { agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionAccessDecision,
  SessionAccessRequest,
  SessionCommand,
  SessionFaces,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  evidence,
  guard,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import {
  SessionAccessCheckService,
  SessionService,
  sessionTransactionsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import { createSessionStorage, sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import {
  combinationManifest,
  inputDigestV2,
  manifestDigest,
  type CommitResultV2,
  type ReceiptV2,
  type ReadRequest,
  type ReadResult,
  type RecordedReply,
  type SqlIdentity,
  type SqlMaterialCatalog,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type {
  MigrationModule,
  ParticipantModule,
  QueryRows,
  ReadHandlerModule,
  SqlCell,
  SqlValue,
} from '@omne-harness/sql-contract/worker'
import { StorageService, TenantDomainLookupService } from '@omne-harness/sql-contract/cordis'
import { createSqliteStorage as createRealStorage } from '@omne-harness/sqlite-provider'
import {
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
} from '@omne-harness/agent-contract/testing'
import type { DurableEvidence } from '@omne-harness/agent-contract'
import { createSessionLogJournal } from '../../src/cordis/agent-journal.ts'
import { SessionLogAgentJournalProvider } from '../../src/cordis/agent-journal-provider.ts'
import { encodeSessionSlotRef } from '../../src/slot-ref.ts'
import { checkpoint, instance, ok, openInput, operation } from './common-journal.ts'

const COMBINATION = 'c1'

function catalogOf(): { catalog: SqlMaterialCatalog; digest: string } {
  const materials = sessionStorageMaterials({ readOutputLimitBytes: 20971520 })
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: materials.participants,
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: {
      tenant: { combinationVersion: COMBINATION, participants: [...SESSION_LOG_PARTICIPANTS] },
      system: null,
    },
  }
  const manifest = combinationManifest({ catalog, participants: [...SESSION_LOG_PARTICIPANTS] })
  if (manifest.kind !== 'manifest') throw new Error(`combination is ${manifest.kind}`)
  return { catalog, digest: manifestDigest(manifest.manifest) }
}

function rowsOf(db: DatabaseSync, sql: string, params: readonly SqlValue[]): QueryRows {
  const statement = db.prepare(sql)
  statement.setReadBigInts(true)
  if (/^\s*(SELECT|WITH)/i.test(sql)) {
    const rows = statement.all(...(params as never[])) as Record<string, SqlCell>[]
    const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
    return {
      columns,
      rows: rows.map(row => columns.map(name => row[name] ?? null)),
      changes: 0n,
      lastInsertRowid: null,
    }
  }
  const result = statement.run(...(params as never[]))
  return {
    columns: [],
    rows: [],
    changes: BigInt(result.changes),
    lastInsertRowid: BigInt(result.lastInsertRowid),
  }
}

export type DoubleControls = Readonly<{
  /** Throws at the next statement of a write transaction that matches `pattern`. */
  failWrite(pattern: RegExp): void
  /** The next commit runs and its reply is lost: the caller sees `unknown`. */
  loseNextReply(): void
  /** The next commit does not run and the caller sees `unknown`. */
  dropNext(): void
  /** Every handler read so far, by handler name. */
  reads: string[]
  /** Rows of the domain, outside any transaction. */
  select(sql: string): QueryRows
}>

/** A node:sqlite storage that runs the modules the published materials name. */
async function doubleStorage(): Promise<{ storage: SqlStorage; controls: DoubleControls }> {
  const materials = sessionStorageMaterials({ readOutputLimitBytes: 20971520 })
  const participants = new Map<string, ParticipantModule>()
  for (const item of materials.participants)
    participants.set(
      item.participant,
      ((await import(item.moduleUrl)) as { default: ParticipantModule }).default,
    )
  const migrations: MigrationModule[] = []
  for (const item of materials.migrations)
    migrations.push(((await import(item.moduleUrl)) as { default: MigrationModule }).default)
  const handlers = new Map<string, ReadHandlerModule>()
  for (const item of materials.readHandlers)
    handlers.set(
      item.handler,
      ((await import(item.moduleUrl)) as { default: ReadHandlerModule }).default,
    )
  const db = new DatabaseSync(':memory:')
  for (const migration of migrations)
    migration.up({ execute: (sql, params) => rowsOf(db, sql, params) })
  const receipts = new Map<string, ReceiptV2>()
  let fault: RegExp | null = null
  let lose = false
  let drop = false
  const reads: string[] = []
  const key = (identity: SqlIdentity) => JSON.stringify([identity.operation, identity.operationKey])
  const execute = (request: Parameters<SqlStorage['commit']>[0]): ReceiptV2 => {
    const responses: { participant: string; protocol: string; reply: RecordedReply }[] = []
    const finish = (kind: 'committed' | 'rolled_back') =>
      ({
        kind,
        identity: request.identity,
        inputDigest: inputDigestV2(request),
        combinationVersion: request.combinationVersion,
        manifestDigest: request.manifestDigest,
        responses,
      }) as unknown as ReceiptV2
    db.exec('BEGIN IMMEDIATE')
    const ordered = [...request.commands].sort((a, b) =>
      a.participant < b.participant ? -1 : a.participant > b.participant ? 1 : 0,
    )
    for (const command of ordered) {
      const module = participants.get(command.participant)
      if (module === undefined) throw new Error(`no participant ${command.participant}`)
      let reply: RecordedReply
      try {
        const raw = module.execute(structuredClone(command.facts), {
          execute: (sql, params) => {
            if (fault !== null && fault.test(sql)) {
              fault = null
              throw new Error('injected write failure')
            }
            return rowsOf(db, sql, params)
          },
          requireFact: () => null,
          provideFact: () => undefined,
        })
        reply =
          raw.kind === 'failed'
            ? { kind: 'failed', category: 'participant_reported', diagnostic: raw.diagnostic }
            : raw
      } catch (error) {
        reply = { kind: 'failed', category: 'participant_threw', diagnostic: String(error) }
      }
      responses.push({ participant: command.participant, protocol: module.protocol, reply })
      if (reply.kind !== 'participated') {
        db.exec('ROLLBACK')
        return finish('rolled_back')
      }
    }
    db.exec('COMMIT')
    return finish('committed')
  }
  const storage: SqlStorage = {
    registerCombination: input => Promise.resolve({ kind: 'registered', registration: input }),
    commit(request): Promise<CommitResultV2> {
      if (drop) {
        drop = false
        return Promise.resolve({
          kind: 'unknown',
          identity: request.identity,
          diagnostic: 'dropped',
        })
      }
      const existing = receipts.get(key(request.identity))
      if (existing !== undefined)
        return Promise.resolve(
          existing.inputDigest === inputDigestV2(request)
            ? existing
            : { kind: 'identity_conflict', identity: request.identity, existing },
        )
      const receipt = execute(request)
      receipts.set(key(request.identity), receipt)
      if (lose) {
        lose = false
        return Promise.resolve({ kind: 'unknown', identity: request.identity, diagnostic: 'lost' })
      }
      return Promise.resolve(receipt)
    },
    query: identity =>
      Promise.resolve(
        receipts.get(key(identity)) ?? {
          kind: 'not_committed',
          identity,
          proofs: {
            writerGenerationExcluded: true,
            oldTransactionTerminated: true,
            databaseRecoveryFinished: true,
            authoritativeReadSucceeded: true,
            operationNotQueued: true,
          },
        },
      ),
    read(request) {
      reads.push(request.handler)
      const module = handlers.get(request.handler)
      if (module === undefined)
        return Promise.resolve({
          kind: 'unavailable',
          requestKey: request.requestKey,
          reason: 'handler_unavailable',
          diagnostic: null,
        } as never)
      const outcome = module.read(structuredClone(request.input), {
        execute: (sql, params) => {
          if (!/^\s*SELECT/i.test(sql) || !/\blimit\b/i.test(sql))
            throw new Error('a read handler ran a write or a statement without LIMIT')
          return rowsOf(db, sql, params)
        },
      })
      return Promise.resolve(
        outcome.kind === 'read'
          ? { kind: 'read', requestKey: request.requestKey, output: outcome.output }
          : ({
              kind: 'unavailable',
              requestKey: request.requestKey,
              reason: 'read_failed',
              diagnostic: null,
            } as never),
      )
    },
  }
  return {
    storage,
    controls: {
      failWrite: pattern => {
        fault = pattern
      },
      loseNextReply: () => {
        lose = true
      },
      dropNext: () => {
        drop = true
      },
      reads,
      select: sql => rowsOf(db, sql, []),
    },
  }
}

export type SqlSceneOptions = Readonly<{
  storage?: 'double' | 'real'
  /** The Session access decisions; every request is allowed when absent. */
  decide?: (request: SessionAccessRequest<string>) => SessionAccessDecision
  /** Tenants the domain lookup knows; the scene's own tenant when absent. */
  registered?: 'own' | 'none'
  /** Installs the test cancellation policy in the Journal (the finishing protocol). */
  cancellation?: 'installed'
  /** The manifest digest the Journal is configured with; the registered one when absent. */
  manifest?: string
  /**
   * `slot`: the first attempt records the session slot reference of the Run's adoption, as the
   * Session coordinator writes it, so AD-14 can take its instance. A fixed test instance when absent.
   */
  instance?: 'slot'
}>

export async function sqlScene(name = 'sql-session', options: SqlSceneOptions = {}) {
  const access = memoryAccess('tester', name)
  const tenantText = (tenant: TenantId) => {
    const encoded = tenantCodec.encode(tenant)
    if (!encoded.ok) throw new Error('unminted tenant')
    return encoded.value
  }
  const { catalog, digest } = catalogOf()
  const domain = {
    scope: { kind: 'tenant' as const, tenant: tenantText(access.tenant) },
    transactionDomain: 'dom_0',
  }
  let root: string | null = null
  let close: () => Promise<void> = () => Promise.resolve()
  let storage: SqlStorage
  let controls: DoubleControls | null = null
  if (options.storage === 'real') {
    root = await realpath(await mkdtemp(join(tmpdir(), 'journal-real-')))
    const { realConfig } = await import('./sql-real-config.ts')
    const created = await createRealStorage({
      config: realConfig(join(root, 'storage')),
      materials: catalog,
      closeLeases: { admit: name => ({ name }), release: () => undefined },
    })
    if (created.kind !== 'created') throw new Error(`provider rejected: ${created.reason}`)
    storage = created.storage
    close = async () => {
      await created.control.close({ initiator: 'disposal' }).catch(() => undefined)
      if (root !== null) await rm(root, { recursive: true, force: true })
    }
  } else {
    const made = await doubleStorage()
    storage = made.storage
    controls = made.controls
  }
  // Every commit that reaches the storage, with the participants of its commands.
  const commits: string[][] = []
  const inner = storage
  /** Rewrites what a read answers, to show a reader a durable record that Session never wrote. */
  const rewriteReads: {
    current: ((request: ReadRequest, answer: ReadResult) => ReadResult) | null
  } = { current: null }
  storage = {
    registerCombination: input => inner.registerCombination(input),
    commit: request => {
      commits.push(request.commands.map(command => command.participant))
      return inner.commit(request)
    },
    query: identity => inner.query(identity),
    read: async (request, readOptions) => {
      const answer = await inner.read(request, readOptions)
      return rewriteReads.current === null ? answer : rewriteReads.current(request, answer)
    },
  }
  const registered = await storage.registerCombination({
    ...domain,
    combinationVersion: COMBINATION,
    manifestDigest: digest,
    participants: [...SESSION_LOG_PARTICIPANTS],
  })
  if (registered.kind !== 'registered') throw new Error(`registration ${registered.kind}`)
  const decided: SessionAccessRequest<string>[] = []
  const sessionAccessCheck = {
    check(request: SessionAccessRequest<string>): Promise<SessionAccessDecision> {
      decided.push(request)
      return Promise.resolve(
        options.decide?.(request) ?? {
          kind: 'allowed',
          evidence: evidence(`access/${request.operation}/${decided.length}`),
        },
      )
    },
  }
  const combination = { combinationVersion: COMBINATION, manifestDigest: digest }
  const tenantDomainLookup: TenantDomainLookup = {
    lookup: input =>
      Promise.resolve(
        options.registered !== 'none' && input.tenant === domain.scope.tenant
          ? { kind: 'ready', domain }
          : { kind: 'unregistered' },
      ),
  }
  const port = createSessionStorage<string>({
    storage,
    domains: {
      resolve: input =>
        Promise.resolve(
          input.tenant === domain.scope.tenant
            ? { kind: 'ready', entry: { tenant: input.tenant, domain } }
            : { kind: 'unavailable', diagnostic: 'no domain' },
        ),
      snapshot: () =>
        Promise.resolve({
          kind: 'ready',
          value: { revision: '1', entries: [{ tenant: domain.scope.tenant, domain }] },
        }),
    },
    accessCheck: {
      check: request =>
        Promise.resolve({ kind: 'allowed', evidence: evidence(`session/${request.operation}`) }),
    },
    cursorSigning: createFixedSessionCursorSigning(),
    combination,
  })
  const journalOptions = {
    storage,
    tenantDomainLookup,
    sessionAccessCheck,
    combination:
      options.manifest === undefined
        ? combination
        : { combinationVersion: COMBINATION, manifestDigest: options.manifest },
    ...(options.cancellation === 'installed'
      ? {
          cancellation: {
            installation: testCancellationPolicyInstallation,
            policy: createTestCancellationPolicy(),
          },
        }
      : {}),
  }
  const journals = createSessionLogJournal<string>(journalOptions)
  const view = journals.forSession(access)
  /** A new provider over the same storage: it has no copy and starts from the durable records. */
  const fresh = () => createSessionLogJournal<string>(journalOptions).forSession(access)

  const value = creation({ initial: ordinaryInput('input-1') })
  const create: SessionCommand = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('create'),
      creation: value,
    },
  }
  ok(
    await port.commit({
      access,
      command: create,
      guards: [
        initializationFixtureGuard(
          initializationFixtureFacts(create, null, adoptedInitializationFixture(create)),
        ),
      ],
    }),
  )
  const started = ok(
    await port.commit({
      access,
      command: {
        kind: 'startRun',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId('start'),
          entry: 'interactive',
          candidate: value.definition.candidate,
          instance:
            options.instance === 'slot'
              ? encodeSessionSlotRef({
                  session: access.session,
                  adoption: value.definition.candidate,
                })
              : { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [guard('evidence-bridge', 'login-entry', { session: name, operation: 'start' })],
    }),
  )
  const snapshot = ok(await port.readWork(access))
  if (snapshot.run.kind !== 'active') throw new Error('not active')
  const execution = ok(decodeAgentExecutionId(snapshot.run.execution.execution))
  const admitted = ok(await port.readInput({ ...access, input: snapshot.run.first }))
  const initial: AcceptedInput = {
    id: ok(decodeInputId(admitted.input)),
    content: admitted.message,
    // AD-14: the source basis of the initial input is the receipt of SE13 (PA-01 item 1).
    source: started.receipt.source,
    priority: 'ordinary',
  }
  const opening = checkpoint()
  const input = openInput({
    access,
    execution,
    operation: operation('open'),
    instance: instance(),
    grant: started.receipt.source,
    initial,
    checkpoint: opening,
  })
  const sessionAccess: SessionAccess<string> = access
  return {
    access,
    sessionAccess,
    port,
    storage,
    controls,
    commits,
    domain,
    combination,
    journals,
    view,
    fresh,
    rewriteReads,
    execution,
    grant: started.receipt.source,
    initial,
    openInput: input,
    checkpoint: opening,
    decided,
    close,
    tenantText,
  }
}

export type SqlScene = Awaited<ReturnType<typeof sqlScene>>

/** Session records the handover of input `id` into the scene's execution (SE35). */
export function handed(s: SqlScene, id: string, receipt: DurableEvidence) {
  return s.port.commit({
    access: s.sessionAccess,
    command: {
      kind: 'receive',
      input: {
        tenant: s.access.tenant,
        session: s.access.session,
        operation: operationId(`handed-${id}`),
        fact: {
          kind: 'input-handover',
          input: id as never,
          execution: s.execution,
          result: { kind: 'accepted', receipt },
        },
      },
    },
    guards: [],
  })
}

/** What `cordisScene` mounts, and how its Session transactions behave. */
export type CordisSceneOptions = Readonly<{
  /** Wraps the `commitLog` of the Session transactions (counting, faults). */
  commitLog?: (
    inner: NonNullable<SessionTransactionPort<string>['commitLog']>,
  ) => NonNullable<SessionTransactionPort<string>['commitLog']>
  /** Leaves `sessionTransactions` out, so a plugin that needs it stays pending. */
  transactions?: 'absent'
}>

/**
 * A real Cordis root over the scene's storage: `storage`, the trusted `tenantDomainLookup`, the
 * Session access check, the session-log Journal plugin (which sends
 * `session-adapters/agent-published` after each successful write), `session` whose `work` reads as
 * the scene's principal, and `sessionTransactions` over the scene's port. `mount` adds a plugin and
 * `dispose` stops every fiber in reverse order.
 */
export async function cordisScene(s: SqlScene, options: CordisSceneOptions = {}) {
  const ctx = new Context()
  const fibers: { dispose(): Promise<unknown> }[] = []
  const mount = async (plugin: Parameters<Context['plugin']>[0], config?: unknown) => {
    const fiber = await ctx.plugin(plugin, config as never)
    fibers.push(fiber)
    return fiber
  }
  const storage = s.storage
  class Storage extends StorageService {
    readonly registerCombination = storage.registerCombination
    readonly commit = storage.commit
    readonly query = storage.query
    readonly read = storage.read
  }
  const domain = s.domain
  class Lookup extends TenantDomainLookupService {
    readonly lookup: TenantDomainLookup['lookup'] = input =>
      Promise.resolve(
        input.tenant === domain.scope.tenant ? { kind: 'ready', domain } : { kind: 'unregistered' },
      )
  }
  class Access extends SessionAccessCheckService<unknown> {
    readonly check = (request: SessionAccessRequest<unknown>): Promise<SessionAccessDecision> =>
      Promise.resolve({ kind: 'allowed', evidence: evidence(`access/${request.operation}`) })
  }
  // The caller classes that the Session faces admit for the two reads of this stand-in
  // (session-contract SPEC「四个面与公开操作」: `readWork` coordinator and maintainer;「控制与模型选择」:
  // `readModelSelection` intake and maintainer). A declared class outside them is refused as the
  // provider refuses it; a read without a declared class (a test reading directly) is not judged.
  const admitted: Readonly<Record<'readWork' | 'readModelSelection', readonly string[]>> = {
    readWork: ['coordinator', 'maintainer'],
    readModelSelection: ['intake', 'maintainer'],
  }
  const faceFor = (caller: unknown) => {
    const gate =
      <I, T>(operation: keyof typeof admitted, read: (input: I) => Promise<T>) =>
      (input: I): Promise<T> =>
        typeof caller === 'string' && !admitted[operation].includes(caller)
          ? (Promise.resolve(fail({ kind: 'denied', action: operation })) as Promise<T>)
          : read(input)
    return {
      readWork: gate('readWork', s.port.readWork),
      readModelSelection: gate('readModelSelection', s.port.readModelSelection),
    }
  }
  class Session extends SessionService<unknown> {
    get work(): SessionFaces<unknown>['work'] {
      let intercept: unknown
      try {
        intercept = this[Service.resolveConfig]()
      } catch {
        intercept = undefined
      }
      const caller =
        typeof intercept === 'object' && intercept !== null
          ? (intercept as Readonly<Record<string, unknown>>)['caller']
          : undefined
      return faceFor(caller) as unknown as SessionFaces<unknown>['work']
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
    readonly history = {} as SessionFaces<unknown>['history']
  }
  const port = s.port
  const inner = port.commitLog
  if (inner === undefined) throw new Error('the Session storage port offers no commitLog')
  const commitLog = options.commitLog?.(inner) ?? inner
  class Transactions extends Service {
    constructor(scope: Context) {
      super(scope, sessionTransactionsKey)
    }
    readonly readWork = port.readWork
    readonly commitEntries = port.commitEntries
    readonly commitLog = commitLog
  }
  await mount(Storage)
  await mount(Lookup)
  await mount(Access)
  await mount(Session)
  if (options.transactions !== 'absent') await mount(Transactions)
  const journal = await mount(SessionLogAgentJournalProvider, s.combination)
  const face = <T>(key: string) => {
    const found: unknown = ctx.get(key)
    if (found === undefined) throw new Error(`${key} is not provided`)
    return found as T
  }
  return {
    ctx,
    mount,
    journalFiber: journal,
    journal: () => face<AgentJournal<string>>(agentJournalKey),
    async dispose() {
      for (const fiber of fibers.splice(0).reverse()) await fiber.dispose()
    },
  }
}
