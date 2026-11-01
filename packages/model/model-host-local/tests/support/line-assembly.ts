// Test support of the line-through case: one process, one real Cordis 4.0.4 root Context, and the
// five members of the line assembled on it. Real parts: the vault plugin (`LocalCredentialPlugin`
// with a placeholder), the official profiles plugin, the request preparation plugin, the send stage
// plugin over the real pi transport and the OpenAI family, the runtime plugin with its result push,
// and the durable ModelCommands of `@omne-harness/model-storage-sql` (`createSqlModelCommands` with
// `send`, so the commands and the send coordinator share one core). Stand-ins, each named:
// - The SQL provider is `node:sqlite` on one database file (below), not `@omne-harness/sqlite-provider`.
//   The real provider loads its materials by module file and digest, and model-storage-sql has no
//   `modelStorageMaterials()` yet (its SPEC lists this gap): its two read handlers have no module
//   file. The file provider here runs the member's real participant, migration and read handlers;
//   it does not model Workers, queues, limits or crash durability, so a pass proves none of those.
// - The result receiver is the scripted receiver of the spec, standing for `createLocalModelReceiver`
//   of agent-host-local (joined in integration A).
// - The retry policy answers "no plan": retries are outside this wave.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  tenantEquals,
  type TenantId,
} from '@omne-harness/legal-identity'
import { createModelRuntime, type ModelConfiguration } from '@omne-harness/model'
import type { ModelCommandsCoreOptions, ModelSendSource } from '@omne-harness/model/commands'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type ModalityRequirement,
  type ModelCallId,
  type ModelDelivery,
  type ModelFailure,
  type ModelProfile,
  type ModelResultReceiver,
  type ModelSavedReceipt,
  type ResultPart,
} from '@omne-harness/model-contract'
import {
  decodeCredentialId,
  type ModelCommands,
  type ModelDriveInput,
  type ModelRetryPolicy,
} from '@omne-harness/model-contract/provider'
import {
  ModelClockService,
  ModelCommandsService,
  ModelHostAuthorityService,
  modelRuntimeKey,
} from '@omne-harness/model-cordis-contract/cordis'
import {
  COMMAND_RESERVE_BYTES,
  callHandler,
  createSqlModelCommands,
  modelMigration,
  pendingHandler,
  type SqlModelCommandsOptions,
} from '@omne-harness/model-storage-sql'
import { GATEWAY_END_MARKER } from '@omne-harness/pi-ai-transport/testing'
import {
  LocalCredentialPlugin,
  ModelProfilesLocalPlugin,
  createMemoryResultPushLedger,
  createModelRequestPreparationPlugin,
  createModelRuntimeLocalPlugin,
  createModelSendStagePlugin,
  type ResultPushLimits,
} from '../../src/cordis.ts'
import { FAMILIES, PLACEHOLDER, ROUTE_PATH, TRANSPORT_LIMITS, decoded } from './local-host.ts'
import { factorySupplier } from './profiles.ts'

// --- Values -------------------------------------------------------------------------------------

type Principal = Readonly<{ subject: string }>
type Storage = SqlModelCommandsOptions<Principal>['storage']
type CommitRequest = Parameters<Storage['commit']>[0]
type CommitResult = Awaited<ReturnType<Storage['commit']>>
type Receipt = Extract<CommitResult, { kind: 'committed' | 'rolled_back' }>
type SqlIdentity = CommitRequest['identity']
type ReadPort = Parameters<typeof modelMigration.up>[0]
type QueryRows = ReturnType<ReadPort['execute']>
type SqlValue = Parameters<ReadPort['execute']>[1][number]

export const CONSUMER = 'line-e2e-consumer'
export const HOST_OWNER = 'line-e2e-host'
export const ADOPTION: Adoption = {
  owner: 'model-host-local-tests',
  name: 'line-e2e',
  revision: '1',
  digest: '0'.repeat(64),
}
/** The route of the profile and of the recording: the OpenAI record with a synthetic tool reply. */
export const ROUTE = 'openai/gpt-5.6-sol'
export const REQUIRED: ModalityRequirement = {
  modalities: ['text'],
  source: { owner: HOST_OWNER, record: 'required', revision: '1', digest: '1'.repeat(64) },
}
/** The capacity of one call; the tenant share holds a few such calls at once. */
export const CAPACITY = { bytes: '200000', blocks: '20', attachmentBytes: '0' }
const TENANT_SHARE = { bytes: '1000000', blocks: '100', attachmentBytes: '0' }
const MAX_CALL_BYTES = 1 << 20
// Every fact is saved before the next one is read, so the content before a cancel is confirmed.
const CONFIGURATION: ModelConfiguration = {
  outputBatchBytes: 1,
  outputBatchDelayMs: 0,
  observerBufferBytes: 4096,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 4096,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}
const HOST_SETTINGS = {
  concurrencyLimit: 4,
  wakeCapacity: 16,
  scanBatchSize: 10,
  scanIntervalMs: 0,
}
const PUSH_LIMITS: ResultPushLimits = {
  maxConcurrentCalls: 4,
  maxRedeliveries: 2,
  maxCleanupSteps: 8,
  maxPendingAccountsPerTenant: 4,
  maxPendingAccounts: 8,
}
const DOMAIN = 'line'

export const PRINCIPAL: Principal = Object.freeze({ subject: 'line-e2e' })
export const TENANT: TenantId = (() => {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenant(organization.value, account.value)
})()
export const ACCESS = { principal: PRINCIPAL, tenant: TENANT }
export const callOf = (name: string): ModelCallId => decoded(decodeModelCallId(`mcall_${name}`))
export const op = (name: string) => decoded(decodeModelOperationId(`mop_${name}`))
const instanceOf = (name: string) => decoded(decodeModelInstanceId(`minst_${name}`))
const nameOf = (call: ModelCallId) => call.slice('mcall_'.length)

export function tenantText(scope: TenantId): string {
  const text = tenantCodec.encode(scope)
  if (!text.ok) throw new Error('fixture tenant does not encode')
  return text.value
}

// --- The node:sqlite file provider ----------------------------------------------------------

/** The participant module of model-storage-sql: `execute` of the `model` participant. */
type Participant = Readonly<{
  execute(facts: unknown, port: unknown): unknown
}>

function isParticipant(value: unknown): value is Participant {
  return (
    typeof value === 'object' &&
    value !== null &&
    'execute' in value &&
    typeof value.execute === 'function'
  )
}

/**
 * Loads the participant of model-storage-sql the way a provider loads a material: by the module
 * file of the member's build. The member exports the migration and the read handlers from its root
 * and the participant only as the default export of its commit module (its SPEC lists the missing
 * `modelStorageMaterials()`), so this is the one path to it from outside the member.
 */
async function loadParticipant(): Promise<Participant> {
  const url = new URL(
    '../../node_modules/@omne-harness/model-storage-sql/dist/commit.js',
    import.meta.url,
  )
  const loaded: unknown = await import(url.href)
  const module: unknown = Reflect.get(Object(loaded), 'default')
  if (!isParticipant(module)) throw new Error('model-storage-sql: commit.js has no participant')
  return module
}

function rowsOf(db: DatabaseSync, sql: string, params: readonly SqlValue[]): QueryRows {
  const statement = db.prepare(sql)
  statement.setReadBigInts(true)
  const bound = params.map(value => (typeof value === 'boolean' ? Number(value) : value))
  if (/^\s*(SELECT|WITH)/i.test(sql)) {
    const rows = statement.all(...bound)
    const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
    return {
      columns,
      rows: rows.map(row => columns.map(name => (row[name] ?? null) as never)),
      changes: 0n,
      lastInsertRowid: null,
    }
  }
  const result = statement.run(...bound)
  return { columns: [], rows: [], changes: BigInt(result.changes), lastInsertRowid: null }
}

const HANDLERS = new Map([callHandler, pendingHandler].map(item => [item.handler, item]))
const keyOf = (identity: SqlIdentity) =>
  JSON.stringify([identity.scope, identity.operation, identity.operationKey])
const digestOf = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
const NOT_COMMITTED_PROOFS = {
  writerGenerationExcluded: true,
  oldTransactionTerminated: true,
  databaseRecoveryFinished: true,
  authoritativeReadSucceeded: true,
  operationNotQueued: true,
} as const

/** Opens the file, runs the Model migration when its tables are missing, and keeps receipts in a table. */
function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  const port: ReadPort = { execute: (sql, params) => rowsOf(db, sql, params) }
  if (modelMigration.verify(port).kind !== 'verified') modelMigration.up(port)
  db.exec('CREATE TABLE IF NOT EXISTS e2e_receipt (key TEXT PRIMARY KEY, receipt TEXT NOT NULL)')
  return db
}

export type FileStorage = Readonly<{
  storage: Storage
  file: string
  /** Closes the connection and opens a new one on the same file. The storage keeps working. */
  reopen(): void
  close(): void
}>

/**
 * `SqlStorage` over one `node:sqlite` file for one transaction domain. Every commit runs the real
 * participant in one transaction; the receipt is stored in the same file, so a repeated identity
 * is recognised after `reopen`. `read` runs the member's read handlers on the same connection.
 */
export async function openFileStorage(file: string): Promise<FileStorage> {
  const participant = await loadParticipant()
  let db = openDatabase(file)
  const receiptOf = (key: string): Receipt | undefined => {
    const [row] = rowsOf(db, 'SELECT receipt FROM e2e_receipt WHERE key = ?', [key]).rows
    const text = row?.[0]
    return typeof text === 'string' ? (JSON.parse(text) as Receipt) : undefined
  }
  const saveReceipt = (key: string, receipt: Receipt) =>
    rowsOf(db, 'INSERT INTO e2e_receipt (key, receipt) VALUES (?, ?)', [
      key,
      JSON.stringify(receipt),
    ])
  function executeCommit(request: CommitRequest): Receipt {
    const command = request.commands[0]
    if (command === undefined) throw new Error('no command')
    const head = {
      identity: request.identity,
      inputDigest: digestOf(request.commands),
      combinationVersion: request.combinationVersion,
      manifestDigest: request.manifestDigest,
    }
    const key = keyOf(request.identity)
    db.exec('BEGIN IMMEDIATE')
    const port = {
      execute: (sql: string, params: readonly SqlValue[]) => rowsOf(db, sql, params),
      requireFact: () => null,
      provideFact: () => undefined,
    }
    let reply: unknown
    try {
      reply = participant.execute(structuredClone(command.facts), port)
    } catch (error) {
      reply = { kind: 'failed', diagnostic: String(error) }
    }
    const kind: unknown = Reflect.get(Object(reply), 'kind')
    const entry = { participant: command.participant, protocol: '1' }
    if (kind === 'participated') {
      const receipt = { kind: 'committed', ...head, responses: [{ ...entry, reply }] } as Receipt
      saveReceipt(key, receipt)
      db.exec('COMMIT')
      return receipt
    }
    db.exec('ROLLBACK')
    const stopping =
      kind === 'failed'
        ? {
            kind: 'failed',
            category: 'participant_reported',
            diagnostic: Reflect.get(Object(reply), 'diagnostic'),
          }
        : reply
    const receipt = {
      kind: 'rolled_back',
      ...head,
      responses: [{ ...entry, reply: stopping }],
    } as Receipt
    saveReceipt(key, receipt)
    return receipt
  }
  const storage: Storage = {
    registerCombination: input => Promise.resolve({ kind: 'registered', registration: input }),
    commit(request) {
      const key = keyOf(request.identity)
      const existing = receiptOf(key)
      if (existing !== undefined)
        return Promise.resolve(
          existing.inputDigest === digestOf(request.commands)
            ? existing
            : { kind: 'identity_conflict', identity: request.identity, existing },
        )
      return Promise.resolve(executeCommit(request))
    },
    query(identity) {
      const found = receiptOf(keyOf(identity))
      return Promise.resolve(
        found ?? { kind: 'not_committed', identity, proofs: NOT_COMMITTED_PROOFS },
      )
    },
    read(request) {
      const handler = HANDLERS.get(request.handler)
      const outcome = handler?.read(request.input, {
        execute: (sql, params) => rowsOf(db, sql, params),
      })
      return Promise.resolve(
        outcome?.kind === 'read'
          ? { kind: 'read', requestKey: request.requestKey, output: outcome.output }
          : {
              kind: 'unavailable',
              requestKey: request.requestKey,
              reason: 'read_failed',
              diagnostic: outcome?.kind === 'failed' ? outcome.diagnostic : 'no handler',
            },
      )
    },
  }
  return {
    storage,
    file,
    reopen() {
      db.close()
      db = openDatabase(file)
    },
    close() {
      db.close()
    },
  }
}

// --- The durable commands --------------------------------------------------------------------

function unavailable(): { failure: ModelFailure } {
  return { failure: { kind: 'unavailable', dependency: HOST_OWNER, diagnostic: 'not-supplied' } }
}

/** The options of the shared core: the authority of this tenant, the evidence the line trusts. */
function coreOptions(): ModelCommandsCoreOptions<Principal> {
  return {
    owners: [{ consumerOwner: CONSUMER, work: { kind: 'exempt' }, evidence: ADOPTION }],
    authority: {
      authorize: ({ access, action }) =>
        access.principal === PRINCIPAL && tenantEquals(access.tenant, TENANT)
          ? { ok: { owner: 'line-e2e-identity', subject: PRINCIPAL.subject, revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: given =>
        tenantEquals(given.tenant, TENANT)
          ? { ok: { owner: HOST_OWNER, subject: 'local-channel', revision: '1' } }
          : { failure: { kind: 'denied', action: 'execution-channel' } },
    },
    evidence: [
      {
        adoption: ADOPTION,
        continuity: given =>
          given.source.owner === HOST_OWNER && given.source.record === given.call
            ? { ok: structuredClone(given.source) }
            : unavailable(),
        materialization: given => ({
          ok: {
            owner: HOST_OWNER,
            record: `${given.call}/${given.dispatch}`,
            revision: '1',
            digest: '1'.repeat(64),
          },
        }),
        receive: given => ({
          ok: {
            window: given.window,
            batchDigest: given.batchDigest,
            paused: true,
            noPrefetch: true,
          },
        }),
        lateFact: unavailable,
        retry: unavailable,
        // The custody evidence is the receiver's own, for this call's key only.
        handoff: given =>
          given.evidence.kind === 'retained' &&
          given.evidence.custody.owner === CONSUMER &&
          given.evidence.custody.record.startsWith('saved/') &&
          given.evidence.custody.record.includes(given.call)
            ? { ok: given.evidence.custody }
            : { failure: { kind: 'handoff-invalid', reason: 'evidence' } },
      },
    ],
    clock: { now: () => new Date().toISOString() },
    limits: {
      scanPageCalls: 8,
      resultPageParts: 16,
      resultPageTargetBytes: 4096,
      readIdleMs: 1000,
      capacity: TENANT_SHARE,
    },
  }
}

const domains: SqlModelCommandsOptions<Principal>['domains'] = {
  lookup: ({ tenant: text }) =>
    Promise.resolve(
      text === tenantText(TENANT)
        ? {
            kind: 'ready',
            domain: { scope: { kind: 'tenant', tenant: text }, transactionDomain: DOMAIN },
          }
        : { kind: 'unregistered' },
    ),
}

/** The send sources of the profile: one factory credential per supplier, always authorized. */
function sourcesOf(profile: ModelProfile): readonly ModelSendSource<Principal>[] {
  return profile.definition.suppliers.map(supplier => ({
    profile: profile.adoption,
    supplier: supplier.adoption,
    recipient: supplier.recipient,
    model: supplier.model,
    credential: {
      kind: 'factory',
      official: true,
      queryId: decoded(decodeCredentialId('line-e2e-query')),
    },
    current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
  }))
}

/** The durable commands over `storage`, with the coordinator when a profile gives the sources. */
export function durableCommands(storage: Storage, profile?: ModelProfile) {
  return createSqlModelCommands<Principal>({
    ...coreOptions(),
    storage,
    domains,
    combination: { combinationVersion: 'v1', manifestDigest: 'a'.repeat(64) },
    maxCallBytes: MAX_CALL_BYTES,
    maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
    ...(profile === undefined
      ? {}
      : { send: { mirrorBytes: 1 << 20, sources: sourcesOf(profile) } }),
  })
}

/** Reads the whole result of a settled call through bare commands, and ends the read. */
export async function readResult(commands: ModelCommands<Principal>, call: ModelCallId) {
  const lookup = decoded(
    await commands.recall({ ...ACCESS, call, admission: op(`admit-${nameOf(call)}`) }),
  )
  if (lookup.kind !== 'found') throw new Error('the call is not found')
  const { state } = lookup
  if (state.phase !== 'settled') throw new Error('the call is not settled')
  const begun = decoded(
    await commands.acquireRead({
      ...ACCESS,
      call,
      operation: op(`reopen-read-${nameOf(call)}`),
      result: state.settlement.version,
    }),
  )
  if (begun.kind !== 'started') throw new Error('the result is not readable')
  const parts: ResultPart[] = []
  let value = begun.value
  while (value.kind === 'reading') {
    parts.push(...value.page.parts)
    if (value.page.next === null) break
    value = decoded(
      await commands.nextRead({ ...ACCESS, call, read: begun.read, after: value.page.next }),
    )
  }
  decoded(await commands.endRead({ ...ACCESS, call, read: begun.read }))
  return { state, parts }
}

export function textOf(parts: readonly ResultPart[]): string {
  return parts
    .map(part =>
      part.kind === 'partial' ? part.value : part.block.kind === 'text' ? part.block.text : '',
    )
    .join('')
}

// --- The scripted receiver --------------------------------------------------------------------

/** The receiver stand-in: saves every push under its key and answers `saved` with its own evidence. */
export function scriptedReceiver(log: string[]) {
  const pushes: ModelDelivery[] = []
  const saved = new Map<string, ModelSavedReceipt>()
  const receiver: ModelResultReceiver<unknown> = {
    async push({ delivery }) {
      pushes.push(delivery)
      const key = JSON.stringify(delivery.key)
      const known = saved.get(key)
      if (known !== undefined) return { ok: known }
      const receipt: ModelSavedReceipt = {
        key: delivery.key,
        evidence: {
          owner: delivery.consumer.owner,
          record: `saved/${key}`,
          revision: '1',
          digest: '1'.repeat(64),
        },
      }
      saved.set(key, receipt)
      log.push(`saved:${delivery.key.reference}`)
      return { ok: receipt }
    },
  }
  return { receiver, pushes }
}

// --- The Cordis tree ---------------------------------------------------------------------------

const NO_RETRY: ModelRetryPolicy<Principal> = {
  decide: async () => ({
    failure: { kind: 'unavailable', dependency: 'model-retry-policy', diagnostic: 'no-plan' },
  }),
  inspect: async () => ({
    failure: { kind: 'unavailable', dependency: 'model-retry-policy', diagnostic: 'no-plan' },
  }),
}

/** The commands as the service the plugins inject; `settle` and `handoff` are logged. */
function commandsServiceOver(commands: ModelCommands<Principal>) {
  return class LineCommands extends ModelCommandsService<unknown> {
    declare readonly admit: ModelCommands<unknown>['admit']
    declare readonly recall: ModelCommands<unknown>['recall']
    declare readonly scanPending: ModelCommands<unknown>['scanPending']
    declare readonly loadRecovery: ModelCommands<unknown>['loadRecovery']
    declare readonly claim: ModelCommands<unknown>['claim']
    declare readonly prepareDispatch: ModelCommands<unknown>['prepareDispatch']
    declare readonly recordMaterialization: ModelCommands<unknown>['recordMaterialization']
    declare readonly recordSend: ModelCommands<unknown>['recordSend']
    declare readonly openReceiveWindow: ModelCommands<unknown>['openReceiveWindow']
    declare readonly preserve: ModelCommands<unknown>['preserve']
    declare readonly recordLateFact: ModelCommands<unknown>['recordLateFact']
    declare readonly prepareRetry: ModelCommands<unknown>['prepareRetry']
    declare readonly decideRetry: ModelCommands<unknown>['decideRetry']
    declare readonly settle: ModelCommands<unknown>['settle']
    declare readonly control: ModelCommands<unknown>['control']
    declare readonly acquireRead: ModelCommands<unknown>['acquireRead']
    declare readonly nextRead: ModelCommands<unknown>['nextRead']
    declare readonly endRead: ModelCommands<unknown>['endRead']
    declare readonly handoff: ModelCommands<unknown>['handoff']
    declare readonly advanceCleanup: ModelCommands<unknown>['advanceCleanup']
    declare readonly query: ModelCommands<unknown>['query']
    declare readonly dispatches: ModelCommands<unknown>['dispatches']
    constructor(ctx: Context) {
      super(ctx)
      Object.assign(this, commands)
    }
  }
}

class LineAuthority extends ModelHostAuthorityService<unknown> {
  readonly resolve = async (target: { tenant: TenantId; call: ModelCallId }) => ({
    ok: {
      principal: PRINCIPAL,
      tenant: target.tenant,
      call: target.call,
      instance: instanceOf(nameOf(target.call)),
      operation: op(`claim-${nameOf(target.call)}`),
      continuity: { owner: HOST_OWNER, record: target.call, revision: '1', digest: '1'.repeat(64) },
    } satisfies ModelDriveInput<unknown>,
  })
}

class LineClock extends ModelClockService {
  readonly now = () => new Date().toISOString()
  readonly waitUntil = (instant: string, signal: AbortSignal) =>
    new Promise<'elapsed' | 'cancelled'>(resolve => {
      const timer = setTimeout(
        () => resolve('elapsed'),
        Math.max(0, Date.parse(instant) - Date.now()),
      )
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        resolve('cancelled')
      })
    })
}

export type LineInput = Readonly<{
  /** A private directory for the vault file. */
  directory: string
  storage: FileStorage
  /** The local HTTPS gateway: its URL and the certificate to trust. */
  gateway: Readonly<{ url: URL; ca: Buffer }>
}>

export type LineTree = Awaited<ReturnType<typeof assembleLine>>

/**
 * The whole line on one root Context, in load order: vault, profiles, then the SQL commands with
 * the coordinator built from the resolved profile's sources, the clock, the host authority, the
 * preparation plugin, the send stage, and the runtime plugin with the result push. `log` gets
 * `exchange-stopped` from the transport, `settle:<call>` and `handoff:<call>` from the commands and
 * `saved:<reference>` from the receiver, in the order they happen.
 */
export async function assembleLine(input: LineInput) {
  const log: string[] = []
  const messages: string[] = []
  const ctx = new Context()
  ctx.logger.exporter({
    colors: 0,
    levels: { default: 3 },
    export: message => {
      messages.push(message.args.map(String).join(' '))
    },
  })
  const fibers: Fiber[] = []
  const load = async (...args: Parameters<Context['plugin']>) => {
    const fiber = ctx.plugin(...args)
    fibers.push(fiber)
    await fiber
    return fiber
  }
  await load(LocalCredentialPlugin, {
    path: join(input.directory, 'line.vault.json'),
    factorySecret: PLACEHOLDER,
  })
  await load(ModelProfilesLocalPlugin, {
    retryPolicy: ADOPTION,
    compactionTriggerPercent: '80',
    updatedAt: '2026-11-02T00:00:00Z',
  })
  const resolution = decoded(
    await ctx.modelProfiles.resolve({ ...ACCESS, route: ROUTE, required: REQUIRED }),
  )
  if (resolution.kind !== 'resolved') throw new Error(`the profile ${ROUTE} did not resolve`)
  const { profile } = resolution

  const durable = durableCommands(input.storage.storage, profile)
  if (durable.coordinator === null) throw new Error('the SQL commands gave no coordinator')
  const commands: ModelCommands<Principal> = {
    ...durable.commands,
    settle: async given => {
      log.push(`settle:${given.call}`)
      return durable.commands.settle(given)
    },
    handoff: async given => {
      log.push(`handoff:${given.call}`)
      return durable.commands.handoff(given)
    },
  }
  await load(commandsServiceOver(commands))
  await load(LineClock)
  await load(LineAuthority)

  const preparation = createModelRequestPreparationPlugin({
    bindings: FAMILIES,
    supplierOf: factorySupplier<unknown>(),
  })
  await load(preparation.plugin, { maxCitedCalls: 8 })

  const Stage = createModelSendStagePlugin({
    families: FAMILIES,
    coordinator: durable.coordinator,
    network: {
      maxConnections: 4,
      idleConnectionTimeoutMs: 60_000,
      tls: { ca: input.gateway.ca },
      diagnostics: {
        maxPending: 64,
        observer: event => {
          if (event.kind === 'exchange-stopped') log.push('exchange-stopped')
        },
      },
    },
    routes: {
      openrouter: {
        url: new URL(ROUTE_PATH, input.gateway.url).href,
        endMarker: GATEWAY_END_MARKER,
      },
    },
    transportLimits: TRANSPORT_LIMITS,
    preparation: { maxCitedCalls: 8, supplierOf: factorySupplier<unknown>() },
  })
  await load(Stage, { maxRetainedAttempts: 4 })

  const ledger = createMemoryResultPushLedger()
  const Runtime = createModelRuntimeLocalPlugin({
    provider: given =>
      createModelRuntime(
        {
          commands: given.commands,
          send: { send: (demand, signal) => ctx.modelSendBoundary.send(demand, signal) },
          retry: NO_RETRY,
          instances: given.host,
          clock: given.clock,
        },
        CONFIGURATION,
      ),
    qualifyObservation: async () => ({ ok: undefined }),
    results: { ledger, limits: PUSH_LIMITS },
  })
  await load(Runtime, { ...HOST_SETTINGS })

  return {
    ctx,
    log,
    messages,
    profile,
    ledger,
    /** The durable commands of the tree, as the plugins see them. */
    commands,
    runtime: ctx.modelRuntime,
    preparation: ctx.modelRequestPreparation,
    /** A plugin that registers `receiver` under the consumer owner, the way the Agent host does. */
    register(receiver: ModelResultReceiver<unknown>) {
      return load({
        name: 'receiver-stand-in',
        inject: [modelRuntimeKey],
        apply: (inner: Context) => {
          inner.modelRuntime.registerResultReceiver(CONSUMER, receiver)
        },
      })
    },
    async stateOf(call: ModelCallId) {
      const lookup = decoded(
        await commands.recall({ ...ACCESS, call, admission: op(`admit-${nameOf(call)}`) }),
      )
      if (lookup.kind !== 'found') throw new Error('the call is not found')
      return lookup.state
    },
    dispatchesOf: async (call: ModelCallId) =>
      decoded(await commands.dispatches({ ...ACCESS, call })),
    /** Unloads every plugin in reverse load order. */
    async close() {
      for (const fiber of fibers.toReversed()) await fiber.dispose()
    },
  }
}

/** The version of the Cordis package the tree runs on, from the installed package. */
export function cordisVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(
      new URL('../../node_modules/@deepseek-ai/cordis/package.json', import.meta.url),
      'utf8',
    ),
  )
  const version: unknown = Reflect.get(Object(manifest), 'version')
  if (typeof version !== 'string') throw new Error('cordis: no version in package.json')
  return version
}
