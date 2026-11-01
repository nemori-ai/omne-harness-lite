// The full assembly of the Model host on real Cordis 4.0.4, for the 53 provider obligations of
// `@omne-harness/model-contract/conformance`: the runtime plugin of this member (host, runtime
// facade and result push), the send stage plugin of this member, the real Model runtime of
// `@omne-harness/model`, and the durable ModelCommands of `@omne-harness/model-storage-sql`
// (`createSqlModelCommands`) with its send coordinator over one shared core.
//
// Stand-ins, each named:
// - The SQL storage is the node:sqlite test provider of model-storage-sql's own tests, copied here:
//   one in-memory database per transaction domain, receipts by full identity, rollback on a
//   stopping reply. It runs the real participant, migration and read handlers of that member. It
//   does not model Workers, durability, queues or limits. The participant module is not on the
//   public surface of model-storage-sql yet, so it is imported from that member's source.
// - The transport is the scripted transport of `@omne-harness/model-contract/testing` behind a
//   per-call channel: the facts of a call come from the hooks of the suite, never from a network.
// - The network of the send stage is a closable object that opens nothing.
// - Fault injection sits on the SQL storage port (`failNextWrite`, `blockCleanup`) and on the
//   instance directory the runtime reads (`disconnectObservers`, `failDirectory`).
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
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
import {
  createModelRuntime,
  type ModelConfiguration,
  type ModelRuntimeProvider,
  type SendCoordinator,
} from '@omne-harness/model'
import type {
  CommandAction,
  ModelCommandsAuthority,
  ModelCommandsEvidence,
  ModelSendSource,
} from '@omne-harness/model/commands'
import type {
  ConformanceAction,
  ConformanceHooks,
  ConformanceSubject,
} from '@omne-harness/model-contract/conformance'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type DurableEvidence,
  type FixedModelRequest,
  type ModelCallId,
  type ModelFailure,
  type ModelHandle,
  type ModelInstanceId,
  type ModelOperationId,
  type ModelRuntime,
  type ResultPart,
} from '@omne-harness/model-contract'
import {
  decodeCredentialId,
  type CredentialPort,
  type ModelCommands,
  type ModelConsumerOwnerDeclaration,
  type ModelDriveInput,
  type ModelDriver,
  type ModelInstanceHost,
  type ModelRetryPolicy,
  type ModelSendBoundary,
  type ModelTransport,
  type Publication,
  type TransportFact,
} from '@omne-harness/model-contract/provider'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'
import {
  ModelClockService,
  ModelCommandsService,
  ModelCredentialService,
  ModelHostAuthorityService,
} from '@omne-harness/model-cordis-contract/cordis'
import {
  COMMAND_RESERVE_BYTES,
  callHandler,
  createSqlModelCommands,
  modelMigration,
  pendingHandler,
  type SqlModelCommandsOptions,
} from '@omne-harness/model-storage-sql'
// The participant module of the model records. It is the default export of that member's
// `src/commit.ts` and not yet exported from its root; see the file comment.
import participant from '../../../model-storage-sql/src/commit.ts'
import { assembleOver, type AssemblyFactories } from '../../src/assembly.ts'
import {
  createMemoryResultPushLedger,
  createModelRuntimeLocalPlugin,
  type ResultPushLimits,
} from '../../src/cordis.ts'
import { sendStagePluginOver } from '../../src/plugins/send-stage.ts'
import type { PiSendResources } from '../../src/send-resources.ts'
import { FAMILIES, TRANSPORT_LIMITS } from './local-host.ts'
import { factorySupplier } from './profiles.ts'

// --- Values ------------------------------------------------------------------------------------

type Principal = Readonly<{ subject: string }>

export function unbox<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`durable assembly: ${JSON.stringify(outcome.failure)}`)
}

function identity(suffix: string): TenantId {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('durable assembly: tenant')
  return tenant(organization.value, account.value)
}

function textOf(scope: TenantId): string {
  const text = tenantCodec.encode(scope)
  if (!text.ok) throw new Error('durable assembly: tenant text')
  return text.value
}

const suffixOf = (call: ModelCallId): string => call.slice('mcall_'.length)
const op = (name: string): ModelOperationId => unbox(decodeModelOperationId(`mop_${name}`))
const instanceOf = (call: ModelCallId): ModelInstanceId =>
  unbox(decodeModelInstanceId(`minst_${suffixOf(call)}`))
export const callOf = (name: string): ModelCallId => unbox(decodeModelCallId(`mcall_${name}`))

const TENANT = identity('5')
const OTHER_TENANT = identity('6')
const PRINCIPAL: Principal = Object.freeze({ subject: 'trusted' })
const ADOPTION: Adoption = { owner: 'test-owner', name: 'test', revision: '1', digest: '0'.repeat(64) }
const OWNER: ModelConsumerOwnerDeclaration = {
  consumerOwner: 'consumer',
  work: { kind: 'exempt' },
  evidence: ADOPTION,
}
const CONSUMER = { owner: 'consumer', work: 'work', position: 'position', purpose: 'test' }
const CAPACITY = { bytes: '100000', blocks: '100', attachmentBytes: '100000' }
const REQUEST: FixedModelRequest = {
  profile: ADOPTION,
  suppliers: [
    { adoption: ADOPTION, recipient: 'test.invalid', model: 'test', credential: { kind: 'factory' } },
  ],
  fallback: false,
  retryPolicy: ADOPTION,
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
  ],
  representation: ADOPTION,
  parameterAdoptions: [],
  source: ADOPTION,
}
const SUPPLIER = REQUEST.suppliers[0]
if (SUPPLIER === undefined) throw new Error('durable assembly: request without a supplier')

const HOST_SETTINGS = { concurrencyLimit: 8, wakeCapacity: 64, scanBatchSize: 10, scanIntervalMs: 0 }
const STAGE_SETTINGS = { maxRetainedAttempts: 64 }
const PUSH_LIMITS: ResultPushLimits = {
  maxConcurrentCalls: 4,
  maxRedeliveries: 2,
  maxCleanupSteps: 8,
  maxPendingAccountsPerTenant: 4,
  maxPendingAccounts: 8,
}
const CONFIGURATION: ModelConfiguration = {
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 1024,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 128,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}
/** The paging of the durable commands is fixed at construction: two parts a page. */
const CORE_LIMITS = {
  scanPageCalls: 2,
  resultPageParts: 2,
  resultPageTargetBytes: 1024,
  readIdleMs: 1000,
  capacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
}
const MAX_CALL_BYTES = 1 << 20
const DOMAIN = 'shared'
const DIGEST = 'a'.repeat(64)
const WAIT_MS = 4000

const proof = (record: string, owner = 'host'): DurableEvidence => ({
  owner,
  record,
  revision: '1',
  digest: '1'.repeat(64),
})

const sha256 = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')

const unavailable = (dependency: string, diagnostic: string): { failure: ModelFailure } => ({
  failure: { kind: 'unavailable', dependency, diagnostic },
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function until(check: () => boolean, label: string, waitMs = WAIT_MS): Promise<void> {
  const end = Date.now() + waitMs
  while (Date.now() < end) {
    if (check()) return
    await sleep(2)
  }
  throw new Error(`durable assembly: timed out waiting for ${label}`)
}

/** Gives the macrotask queue a few turns, so a committed receipt reaches the observation. */
async function quiet(): Promise<void> {
  for (let n = 0; n < 5; n += 1) await sleep(5)
}

// --- The node:sqlite test provider (copied from model-storage-sql tests/fixture.ts) ------------

type SqlStorage = SqlModelCommandsOptions<unknown>['storage']
type TenantDomainLookup = SqlModelCommandsOptions<unknown>['domains']
type CommitRequest = Parameters<SqlStorage['commit']>[0]
type CommitResult = Awaited<ReturnType<SqlStorage['commit']>>
type Receipt = Extract<CommitResult, { kind: 'committed' | 'rolled_back' }>
type SqlIdentity = CommitRequest['identity']
type MigrationPort = Parameters<typeof modelMigration.up>[0]
type QueryRows = ReturnType<MigrationPort['execute']>
type SqlValue = Parameters<MigrationPort['execute']>[1][number]

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

type Domain = { readonly db: DatabaseSync; readonly receipts: Map<string, Receipt> }
const HANDLERS = new Map([callHandler, pendingHandler].map(item => [item.handler, item]))
const keyOf = (identity: SqlIdentity) =>
  JSON.stringify([identity.scope, identity.operation, identity.operationKey])

function executeCommit(domain: Domain, request: CommitRequest): Receipt {
  const command = request.commands[0]
  if (command === undefined) throw new Error('no command')
  const head = {
    identity: request.identity,
    inputDigest: sha256({ identity: request.identity, commands: request.commands }),
    combinationVersion: request.combinationVersion,
    manifestDigest: request.manifestDigest,
  }
  domain.db.exec('BEGIN IMMEDIATE')
  const port = {
    execute: (sql: string, params: readonly SqlValue[]) => rowsOf(domain.db, sql, params),
    requireFact: () => null,
    provideFact: () => undefined,
  }
  let reply
  try {
    reply = participant.execute(structuredClone(command.facts), port)
  } catch (error) {
    reply = { kind: 'failed' as const, diagnostic: String(error) }
  }
  const entry = { participant: command.participant, protocol: participant.protocol }
  if (reply.kind === 'participated') {
    domain.db.exec('COMMIT')
    return { kind: 'committed', ...head, responses: [{ ...entry, reply }] }
  }
  domain.db.exec('ROLLBACK')
  const stopping =
    reply.kind === 'failed'
      ? {
          kind: 'failed' as const,
          category: 'participant_reported' as const,
          diagnostic: reply.diagnostic,
        }
      : reply
  return { kind: 'rolled_back', ...head, responses: [{ ...entry, reply: stopping }] }
}

const NOT_COMMITTED_PROOFS = {
  writerGenerationExcluded: true,
  oldTransactionTerminated: true,
  databaseRecoveryFinished: true,
  authoritativeReadSucceeded: true,
  operationNotQueued: true,
} as const

function sqliteStorage(): SqlStorage {
  const domains = new Map<string, Domain>()
  const domainOf = (name: string): Domain => {
    const found = domains.get(name)
    if (found !== undefined) return found
    const db = new DatabaseSync(':memory:')
    modelMigration.up({ execute: (sql, params) => rowsOf(db, sql, params) })
    const domain = { db, receipts: new Map<string, Receipt>() }
    domains.set(name, domain)
    return domain
  }
  return {
    registerCombination: input => Promise.resolve({ kind: 'registered', registration: input }),
    commit(request): Promise<CommitResult> {
      const domain = domainOf(request.identity.transactionDomain)
      const key = keyOf(request.identity)
      const existing = domain.receipts.get(key)
      if (existing !== undefined)
        return Promise.resolve(
          existing.inputDigest ===
            sha256({ identity: request.identity, commands: request.commands })
            ? existing
            : { kind: 'identity_conflict', identity: request.identity, existing },
        )
      const receipt = executeCommit(domain, request)
      domain.receipts.set(key, receipt)
      return Promise.resolve(receipt)
    },
    query(identity) {
      const found = domainOf(identity.transactionDomain).receipts.get(keyOf(identity))
      return Promise.resolve(
        found ?? { kind: 'not_committed', identity, proofs: NOT_COMMITTED_PROOFS },
      )
    },
    read(request) {
      const handler = HANDLERS.get(request.handler)
      const db = domainOf(request.domain.transactionDomain).db
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
}

function lookup(registered: readonly string[], domain: string): TenantDomainLookup {
  return {
    lookup: ({ tenant: text }) =>
      Promise.resolve(
        registered.includes(text)
          ? {
              kind: 'ready',
              domain: { scope: { kind: 'tenant', tenant: text }, transactionDomain: domain },
            }
          : { kind: 'unregistered' },
      ),
  }
}

// --- Fault injection on the storage port -------------------------------------------------------

/**
 * How the next matching commit of the storage is answered. `applied` commits and loses the reply,
 * `dropped` commits nothing and loses the reply, `refused` is rejected before the storage accepts.
 */
type StorageFault = Readonly<{
  matches(request: CommitRequest): boolean
  effect: 'applied' | 'dropped' | 'refused'
}>

function factsOf(request: CommitRequest): Record<string, unknown> {
  const facts: unknown = request.commands[0]?.facts
  return typeof facts === 'object' && facts !== null ? { ...facts } : {}
}

function bindingMethodOf(request: CommitRequest): string | undefined {
  const binding: unknown = factsOf(request)['binding']
  if (typeof binding !== 'object' || binding === null) return undefined
  const method: unknown = Reflect.get(binding, 'method')
  return typeof method === 'string' ? method : undefined
}

function faultyStorage(inner: SqlStorage) {
  let fault: StorageFault | undefined
  const injected: { request: string; effect: StorageFault['effect'] }[] = []
  const storage: SqlStorage = {
    registerCombination: input => inner.registerCombination(input),
    async commit(request) {
      const selected = fault
      if (selected === undefined || !selected.matches(request)) return inner.commit(request)
      fault = undefined
      injected.push({ request: request.identity.operation, effect: selected.effect })
      const { identity } = request
      if (selected.effect === 'refused')
        return { kind: 'rejected_before_accept', identity, reason: 'queue_full', diagnostic: null }
      if (selected.effect === 'applied') await inner.commit(request)
      return { kind: 'unknown', identity, diagnostic: null }
    },
    query: identity => inner.query(identity),
    read: request => inner.read(request),
  }
  return {
    storage,
    injected,
    arm(next: StorageFault) {
      fault = next
    },
  }
}

// --- The commands core options -----------------------------------------------------------------

/** The actions the suite revokes, as the actions of the commands core. */
const ACTIONS: Record<ConformanceAction, CommandAction> = {
  inspect: 'facts',
  dispatches: 'account',
  cancel: 'control',
  connect: 'observe',
  observe: 'observe',
  read: 'content',
  acknowledge: 'handoff',
}

/** Consumer-owned completion records: the evidence that the handoff adapter accepts. */
function completionRecords() {
  type Completed = Readonly<{
    tenant: string
    call: ModelCallId
    result: string
    consumer: unknown
    proof: DurableEvidence
  }>
  const records = new Map<string, Completed>()
  return {
    finish(input: Omit<Completed, 'proof'> & Readonly<{ label: string }>): DurableEvidence {
      const record = sha256({
        tenant: input.tenant,
        call: input.call,
        result: input.result,
        consumer: input.consumer,
        label: input.label,
      })
      const proof: DurableEvidence = { owner: CONSUMER.owner, record, revision: '1', digest: record }
      records.set(record, { ...input, proof })
      return { ...proof }
    },
    verify: ((input: Parameters<ModelCommandsEvidence['handoff']>[0]) => {
      if (input.evidence.kind !== 'processed')
        return { failure: { kind: 'handoff-invalid', reason: 'processed-only' } }
      const source = input.evidence.completion
      const record = records.get(source.record)
      return record !== undefined &&
        record.tenant === textOf(input.tenant) &&
        record.call === input.call &&
        record.result === input.result &&
        sha256(record.consumer) === sha256(input.consumer) &&
        sha256(record.proof) === sha256(source)
        ? { ok: { ...record.proof } }
        : { failure: { kind: 'handoff-invalid', reason: 'completion-record' } }
    }) satisfies ModelCommandsEvidence['handoff'],
  }
}

function coreOptions(denied: Set<CommandAction>, completions: ReturnType<typeof completionRecords>) {
  const authority: ModelCommandsAuthority<unknown> = {
    authorize: ({ access, action }) =>
      access.principal === PRINCIPAL &&
      tenantEquals(TENANT, access.tenant) &&
      !denied.has(action)
        ? { ok: { owner: 'identity', subject: PRINCIPAL.subject, revision: '1' } }
        : { failure: { kind: 'denied', action } },
    execution: () => ({ ok: { owner: 'host', subject: 'channel', revision: '1' } }),
  }
  const untrusted = (field: string) =>
    ({ failure: { kind: 'invalid', field, reason: 'untrusted' } }) as const
  const evidence: ModelCommandsEvidence = {
    adoption: ADOPTION,
    continuity: i =>
      i.source.owner === 'host' && i.source.record === i.call
        ? { ok: structuredClone(i.source) }
        : untrusted('continuity'),
    materialization: i => ({ ok: proof(`${i.call}/${i.dispatch}`, 'materializer') }),
    lateFact: i =>
      i.source.owner === 'supplier' && i.source.record === `${i.call}/${i.dispatch}`
        ? { ok: i.source }
        : untrusted('source'),
    retry: i =>
      i.source.owner === 'retry' && i.source.record === i.position.operation
        ? { ok: i.source }
        : untrusted('source'),
    handoff: completions.verify,
    receive: i => ({
      ok: { window: i.window, batchDigest: i.batchDigest, paused: true, noPrefetch: true },
    }),
  }
  const source: ModelSendSource<unknown> = {
    profile: REQUEST.profile,
    supplier: SUPPLIER.adoption,
    recipient: SUPPLIER.recipient,
    model: SUPPLIER.model,
    credential: {
      kind: 'factory',
      official: true,
      queryId: unbox(decodeCredentialId('durable-assembly-query')),
    },
    current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
  }
  return {
    core: {
      owners: [OWNER],
      authority,
      evidence: [evidence],
      clock: { now: () => new Date().toISOString() },
      limits: CORE_LIMITS,
    },
    source,
  }
}

// --- The backends of the commands --------------------------------------------------------------

/** The commands the plugins inject, and what the evidence file says they are. */
type Backend = Readonly<{
  kind: 'durable-sql' | 'memory'
  /** How the evidence names the implementation. */
  description: string
  sqlProvider: string
  commands: ModelCommands<unknown>
  coordinator: SendCoordinator<unknown>
  faults: ReturnType<typeof faultyStorage> | null
}>

function durableBackend(
  denied: Set<CommandAction>,
  completions: ReturnType<typeof completionRecords>,
): Backend {
  const { core, source } = coreOptions(denied, completions)
  const faults = faultyStorage(sqliteStorage())
  const { commands, coordinator } = createSqlModelCommands<unknown>({
    ...core,
    storage: faults.storage,
    domains: lookup([textOf(TENANT), textOf(OTHER_TENANT)], DOMAIN),
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
    maxCallBytes: MAX_CALL_BYTES,
    maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
    send: { mirrorBytes: 1 << 24, sources: [source] },
  })
  if (coordinator === null) throw new Error('durable assembly: the SQL commands gave no coordinator')
  return {
    kind: 'durable-sql',
    description: '@omne-harness/model-storage-sql createSqlModelCommands (durable, SQL storage)',
    sqlProvider: 'node:sqlite test provider (tests/support/durable-assembly.ts), in-memory database',
    commands,
    coordinator,
    faults,
  }
}

// --- The Cordis services the plugins inject ---------------------------------------------------

class Authority extends ModelHostAuthorityService<unknown> {
  readonly resolve = async (target: { tenant: TenantId; call: ModelCallId }) => ({
    ok: {
      principal: PRINCIPAL,
      tenant: target.tenant,
      call: target.call,
      instance: instanceOf(target.call),
      operation: op(`claim-${suffixOf(target.call)}`),
      continuity: proof(target.call),
    } satisfies ModelDriveInput<unknown>,
  })
}

class Clock extends ModelClockService {
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

/** The factory credential: a synthetic value, never a real key. */
class Credential extends ModelCredentialService {
  readonly present: CredentialPort['present'] = () => ({ kind: 'unavailable' })
  readonly resolve: CredentialPort['resolve'] = () => ({
    kind: 'value',
    scope: 'factory',
    value: 'synthetic-credential',
  })
}

function commandsServiceOver(commands: ModelCommands<unknown>) {
  return class Commands extends ModelCommandsService<unknown> {
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

// --- The per-call upstream channel -------------------------------------------------------------

type Channel = {
  ready: ReturnType<typeof deferred<void>>
  starts: number
  push(facts: readonly TransportFact[]): void
  iterable: AsyncIterable<TransportFact>
}

function channels() {
  const made = new Map<ModelCallId, Channel>()
  let disposing = false
  function channel(call: ModelCallId): Channel {
    let value = made.get(call)
    if (value !== undefined) return value
    let waiter = deferred<void>()
    let done = false
    const queue: TransportFact[] = []
    const created: Channel = {
      ready: deferred<void>(),
      starts: 0,
      push(facts) {
        queue.push(...structuredClone(facts))
        waiter.resolve()
      },
      iterable: {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              while (!done && queue.length === 0) await waiter.promise
              const fact = queue.shift()
              if (queue.length === 0) waiter = deferred<void>()
              if (fact?.kind === 'ended') done = true
              return fact ? { done: false as const, value: fact } : { done: true as const, value: undefined }
            },
            async return() {
              done = true
              waiter.resolve()
              return { done: true as const, value: undefined }
            },
          }
        },
      },
    }
    if (disposing) {
      created.ready.resolve()
      created.push([{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }])
    }
    value = created
    made.set(call, value)
    return value
  }
  return {
    channel,
    dispose() {
      disposing = true
      for (const stream of made.values()) {
        stream.ready.resolve()
        stream.push([{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }])
      }
    },
  }
}

/** The send resources of the stage: a scripted transport whose facts come from the channel. */
function channelSendResources(channel: (call: ModelCallId) => Channel): PiSendResources<unknown> {
  return {
    async acquire(demand) {
      const stream = channel(demand.call)
      await stream.ready.promise
      const script = createScriptedTransport({
        receipt: {
          supplier: demand.supplier.adoption,
          representation: demand.request.representation,
          payloadDigest: DIGEST,
        },
        facts: [],
        ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
        rejection: null,
      })
      return {
        ok: {
          transport: script.transport,
          startWithCredential() {
            stream.starts += 1
            return stream.iterable
          },
          release: async () => {},
        },
      }
    },
    close: async () => {},
  }
}

/** Upstream facts for the parts of a result. The real sender, receiver and driver own every write. */
function resultFacts(parts: readonly ResultPart[]): TransportFact[] {
  return parts.flatMap((part, position): TransportFact[] => {
    const index = String(position)
    if (part.kind === 'partial')
      return [
        { kind: 'block-open', index, mode: 'replace', content: part.content },
        { kind: 'block-replace', index, value: part.value },
        ...part.trims.map(trim => ({ kind: 'trim' as const, index, ...trim })),
      ]
    const block = part.block
    if (block.kind === 'image' || block.kind === 'file')
      return [{ kind: 'block-seal', index, block }]
    const content =
      block.kind === 'tool_call'
        ? 'tool-arguments'
        : block.kind === 'text'
          ? 'text'
          : block.kind === 'thinking'
            ? 'thinking'
            : 'voice'
    const value =
      block.kind === 'tool_call'
        ? JSON.stringify(block.arguments)
        : 'text' in block
          ? block.text
          : 'inline' in block
            ? block.inline
            : ''
    return [
      { kind: 'block-open', index, mode: 'replace', content },
      { kind: 'block-replace', index, value },
      ...part.trims.map(trim => ({ kind: 'trim' as const, index, ...trim })),
      { kind: 'block-seal', index, block },
    ]
  })
}

// --- The instrumented instance host ------------------------------------------------------------

/**
 * The host of the plugin as the runtime sees it, with what only the assembly can tell: when a call
 * is placed (its route is published) and the faults of the directory. The first schedule of a call
 * returns after the call is placed or its drive ended, so an admission that returns has a route.
 */
function instrumentedHost(host: ModelInstanceHost<unknown>, drives: Drives) {
  const publications = new Map<ModelCallId, Publication>()
  const placed = new Map<ModelCallId, ReturnType<typeof deferred<void>>>()
  const cut = new Set<ModelCallId>()
  let directoryDown = false
  const placing = (call: ModelCallId) => {
    let value = placed.get(call)
    if (value === undefined) {
      value = deferred<void>()
      placed.set(call, value)
    }
    return value
  }
  const instances: ModelInstanceHost<unknown> = {
    async schedule(input) {
      const first = !placed.has(input.call)
      const settled = placing(input.call)
      const result = await host.schedule(input)
      if ('failure' in result || !first) return result
      await Promise.race([settled.promise, drives.ended(input.call), sleep(WAIT_MS)])
      return result
    },
    async publish(execution, handle: ModelHandle<unknown>) {
      const result = await host.publish(execution, handle)
      if ('ok' in result) {
        publications.set(execution.call, result.ok)
        placing(execution.call).resolve()
      }
      return result
    },
    withdraw: publication => host.withdraw(publication),
    directory: {
      async connect(access) {
        if (directoryDown) return unavailable('model-instance-directory', 'offline')
        if (cut.has(access.call)) return unavailable('model-instance-directory', 'route-cut')
        return host.directory.connect(access)
      },
    },
  }
  return {
    instances,
    publications,
    cut,
    failDirectory() {
      directoryDown = true
    },
  }
}

/** The drives of the bound driver, by call: their outcomes and their ends. */
type Drives = ReturnType<typeof driveLog>

function driveLog() {
  const results = new Map<ModelCallId, Awaited<ReturnType<ModelDriver<unknown>['drive']>>>()
  const ends = new Map<ModelCallId, ReturnType<typeof deferred<void>>>()
  const running: Promise<unknown>[] = []
  const endOf = (call: ModelCallId) => {
    let value = ends.get(call)
    if (value === undefined) {
      value = deferred<void>()
      ends.set(call, value)
    }
    return value
  }
  return {
    results,
    ended: (call: ModelCallId) => endOf(call).promise,
    wrap(driver: ModelDriver<unknown>): ModelDriver<unknown> {
      return {
        drive: (input, signal) => {
          const outcome = driver.drive(input, signal).then(value => {
            results.set(input.call, value)
            endOf(input.call).resolve()
            return value
          })
          running.push(outcome.catch(() => undefined))
          return outcome
        },
      }
    },
    settle: () => Promise.all(running),
  }
}

// --- The subject -------------------------------------------------------------------------------

const RETRY: ModelRetryPolicy<unknown> = {
  inspect: async () => unavailable('model-retry-policy', 'no-plan'),
  decide: async () => unavailable('model-retry-policy', 'no-plan'),
}

export type AssemblyFacts = Readonly<{
  modelCommands: string
  commandsKind: Backend['kind']
  sqlProvider: string
  cordis: string
  plugins: readonly string[]
  transport: string
  network: string
}>

function cordisVersion(): string {
  const text = readFileSync(
    new URL('../../node_modules/@deepseek-ai/cordis/package.json', import.meta.url),
    'utf8',
  )
  const parsed: unknown = JSON.parse(text)
  const version = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'version') : null
  return typeof version === 'string' ? version : 'unknown'
}

const PLUGIN_NAMES = [
  'ModelRuntimeLocalPlugin (createModelRuntimeLocalPlugin: host, runtime facade, result push)',
  'ModelSendStagePlugin (sendStagePluginOver assembleOver: modelSendBoundary)',
  'ModelCommandsService test class over the backend commands',
  'ModelHostAuthorityService test class',
  'ModelClockService test class',
  'ModelCredentialService test class (synthetic factory value)',
]

export function assemblyFacts(backend: Pick<Backend, 'kind' | 'description' | 'sqlProvider'>): AssemblyFacts {
  return {
    modelCommands: backend.description,
    commandsKind: backend.kind,
    sqlProvider: backend.sqlProvider,
    cordis: cordisVersion(),
    plugins: PLUGIN_NAMES,
    transport: '@omne-harness/model-contract/testing createScriptedTransport behind a per-call channel',
    network: 'closable stand-in that opens nothing',
  }
}

/** The facts of the assembly that the subject factory builds. Read by the spec for the evidence. */
export function describeAssembly(): AssemblyFacts {
  return assemblyFacts({
    kind: 'durable-sql',
    description: '@omne-harness/model-storage-sql createSqlModelCommands (durable, SQL storage)',
    sqlProvider: 'node:sqlite test provider (tests/support/durable-assembly.ts), in-memory database',
  })
}

export type DurableSubject = ConformanceSubject<unknown> &
  Readonly<{ facts: AssemblyFacts; injected: readonly { request: string; effect: string }[] }>

/**
 * One full assembly on a fresh Cordis root. The suite calls it once per check and disposes it after.
 */
export async function durableSubject(
  record: (event: unknown) => void = () => {},
): Promise<DurableSubject> {
  const denied = new Set<CommandAction>()
  const completions = completionRecords()
  const backend = durableBackend(denied, completions)
  const upstream = channels()
  const drives = driveLog()
  const preserved = new Map<ModelCallId, number>()

  // The commands the services serve: the backend's, with the preserves counted per call.
  const commands: ModelCommands<unknown> = {
    ...backend.commands,
    preserve: async input => {
      const result = await backend.commands.preserve(input)
      if ('ok' in result) preserved.set(input.call, (preserved.get(input.call) ?? 0) + input.facts.length)
      return result
    },
  }

  const root = new Context()
  root.logger.exporter({ colors: 0, levels: { default: 2 }, export: () => {} })
  const network = { close: async () => {} }
  const factories: AssemblyFactories<unknown, typeof network> = {
    createNetwork: () => network,
    createSendResources: () => channelSendResources(upstream.channel),
  }
  const Stage = sendStagePluginOver({
    options: {
      coordinator: backend.coordinator,
      families: FAMILIES,
      network: { maxConnections: 2, idleConnectionTimeoutMs: 1_000 },
      routes: {
        'test.invalid': { url: 'https://test.invalid/v1/chat/completions', endMarker: '[DONE]' },
      },
      transportLimits: TRANSPORT_LIMITS,
      preparation: { maxCitedCalls: 8, supplierOf: factorySupplier<unknown>() },
    },
    assemble: config => assembleOver({ config, factories }),
  })
  const send: ModelSendBoundary<unknown> = {
    send: (demand, signal) => root.modelSendBoundary.send(demand, signal),
  }
  let hostControl: ReturnType<typeof instrumentedHost> | undefined
  let provider: ModelRuntimeProvider<unknown> | undefined
  let dependencies: Parameters<typeof createModelRuntime<unknown>>[0] | undefined
  const Plugin = createModelRuntimeLocalPlugin({
    provider: given => {
      hostControl = instrumentedHost(given.host, drives)
      dependencies = {
        commands: given.commands,
        send,
        retry: RETRY,
        instances: hostControl.instances,
        clock: given.clock,
      }
      provider = createModelRuntime(dependencies, CONFIGURATION)
      return {
        driver: drives.wrap(provider.driver),
        runtime: provider.runtime,
        quiesce: () => provider!.quiesce(),
      }
    },
    qualifyObservation: async access => coreAuthorize(denied, access),
    results: { ledger: createMemoryResultPushLedger(), limits: PUSH_LIMITS },
  })

  const fibers: Fiber[] = []
  fibers.push(root.plugin(Authority), root.plugin(Clock), root.plugin(Credential))
  fibers.push(root.plugin(commandsServiceOver(commands)))
  for (const fiber of fibers) await fiber
  const stage = root.plugin(Stage, STAGE_SETTINGS)
  await stage
  const host = root.plugin(Plugin, HOST_SETTINGS)
  await host
  if (hostControl === undefined || provider === undefined || dependencies === undefined)
    throw new Error('durable assembly: the plugin did not build the provider')
  const control = hostControl
  const built = provider
  const deps = dependencies
  const runtime: ModelRuntime<unknown> = root.modelRuntime

  const access = (call: ModelCallId) => ({ principal: PRINCIPAL, tenant: TENANT, call })
  const recovery = async (call: ModelCallId) => unbox(await commands.loadRecovery(access(call)))
  const startedCount = async (call: ModelCallId) =>
    unbox(await commands.dispatches(access(call))).filter(item => item.send === 'started').length

  const advanceCleanup: NonNullable<ConformanceHooks<unknown>['advanceCleanup']> = async input => {
    const current = await recovery(input.call)
    if (!current.execution) throw new Error('durable assembly: missing cleanup execution')
    const result = unbox(
      await commands.advanceCleanup({ ...current.execution, operation: op(`cleanup-${randomUUID()}`) }),
    )
    record({ hook: 'advanceCleanup', input, result })
  }

  // The transport under test, counted: an independent scripted transport with the same request.
  const scripted = createScriptedTransport({
    receipt: {
      supplier: SUPPLIER.adoption,
      representation: REQUEST.representation,
      payloadDigest: DIGEST,
    },
    facts: [],
    ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
    rejection: null,
  })
  let sends = 0
  const countedTransport: ModelTransport = {
    async prepare(request, supplier, dispatch) {
      const prepared = await scripted.transport.prepare(request, supplier, dispatch)
      if ('failure' in prepared) return prepared
      return {
        ok: {
          close: () => prepared.ok.close(),
          async materialize(signal) {
            const materialized = await prepared.ok.materialize(signal)
            if ('failure' in materialized) return materialized
            return {
              ok: {
                ...materialized.ok,
                start(signal) {
                  const stream = materialized.ok.start(signal)
                  sends += 1
                  return stream
                },
              },
            }
          },
        },
      }
    },
  }

  const tenantText = textOf(TENANT)
  const hooks: ConformanceHooks<unknown> = {
    failNextWrite: async input => {
      const faults = backend.faults
      if (faults === null) return
      const target = textOf(input.tenant)
      faults.arm({
        effect: input.effect,
        matches: request =>
          request.identity.scope.kind === 'tenant' &&
          request.identity.scope.tenant === target &&
          request.identity.operation === input.operation,
      })
      record({ hook: 'failNextWrite', input })
    },
    startRun: async input => {
      const stream = upstream.channel(input.call)
      stream.ready.resolve()
      await until(
        () => stream.starts >= 1 || drives.results.has(input.call),
        `the start of ${input.call}`,
      )
      if (drives.results.has(input.call) && stream.starts === 0)
        throw new Error(
          `durable assembly: the drive of ${input.call} ended before the send started: ${JSON.stringify(drives.results.get(input.call))}`,
        )
      // The provider records the dispatch as started after the stream starts.
      let started = 0
      const end = Date.now() + WAIT_MS
      while (Date.now() < end) {
        started = await startedCount(input.call)
        if (started > 0) break
        await sleep(2)
      }
      if (started === 0) throw new Error(`durable assembly: ${input.call} shows no started send`)
      record({ hook: 'startRun', input })
    },
    showFacts: async input => {
      const before = preserved.get(input.call) ?? 0
      upstream.channel(input.call).push(input.facts)
      await until(
        () => (preserved.get(input.call) ?? 0) >= before + input.facts.length || drives.results.has(input.call),
        `the preservation of ${input.facts.length} facts of ${input.call}`,
      )
      await quiet()
      record({ hook: 'showFacts', input: { call: input.call, facts: input.facts.length } })
    },
    settleCall: async input => {
      const current = await recovery(input.call)
      if (current.state.phase === 'settled') return
      const termination =
        input.termination.kind === 'interrupted'
          ? ({ kind: 'interrupted', stop: 'confirmed' } as const)
          : input.termination
      upstream.channel(input.call).push([...resultFacts(input.parts), { kind: 'ended', termination }])
      await until(() => drives.results.has(input.call), `the end of the drive of ${input.call}`)
      const outcome = drives.results.get(input.call)
      if (outcome !== undefined && 'failure' in outcome)
        throw new Error(`durable assembly: the driver refused the settlement: ${JSON.stringify(outcome.failure)}`)
      record({ hook: 'settleCall', input: { call: input.call, termination: input.termination } })
    },
    provideEvidence: async input => {
      const current = await recovery(input.call)
      if (current.state.phase !== 'settled') throw new Error('durable assembly: completion before settlement')
      const evidence = completions.finish({
        tenant: tenantText,
        call: input.call,
        result: current.state.settlement.version,
        consumer: current.state.consumer,
        label: input.label,
      })
      record({ hook: 'provideEvidence', input, evidence })
      return evidence
    },
    advanceCleanup,
    blockCleanup: async input => {
      const faults = backend.faults
      if (faults === null) throw new Error('durable assembly: no storage faults for this backend')
      faults.arm({
        effect: 'refused',
        matches: request =>
          request.identity.scope.kind === 'tenant' &&
          request.identity.scope.tenant === tenantText &&
          factsOf(request)['call'] === input.call &&
          bindingMethodOf(request) === 'advanceCleanup',
      })
      const current = await recovery(input.call)
      if (!current.execution) throw new Error('durable assembly: missing cleanup execution')
      const result = await commands.advanceCleanup({
        ...current.execution,
        operation: op(`blocked-cleanup-${randomUUID()}`),
      })
      if ('ok' in result) throw new Error('durable assembly: the cleanup was not blocked by the storage')
      record({ hook: 'blockCleanup', input, result })
    },
    withdrawInstance: async input => {
      const publication = control.publications.get(input.call)
      if (publication === undefined) throw new Error('durable assembly: missing publication')
      unbox(await deps.instances.withdraw(publication))
    },
    replaceInstance: async input => {
      const successor = createModelRuntime(deps, CONFIGURATION)
      const result = await successor.driver.drive(
        {
          principal: PRINCIPAL,
          tenant: TENANT,
          call: input.call,
          operation: op(`replacement-${suffixOf(input.call)}`),
          instance: input.instance,
          continuity: proof(input.call),
        },
        new AbortController().signal,
      )
      record({ hook: 'replaceInstance', input, result })
    },
    disconnectObservers: async input => {
      control.cut.add(input.call)
    },
    revokeAccess: async input => {
      if (input.action === 'all') for (const action of Object.values(ACTIONS)) denied.add(action)
      else denied.add(ACTIONS[input.action])
      record({ hook: 'revokeAccess', input: { call: input.call, action: input.action }, denied: [...denied] })
    },
    failDirectory: async () => {
      control.failDirectory()
    },
  }

  return {
    provider: {
      runtime,
      recover: input => built.recover(input),
      quiesce: () => built.quiesce(),
    },
    principal: PRINCIPAL,
    tenant: TENANT,
    otherTenant: OTHER_TENANT,
    request: REQUEST,
    consumer: CONSUMER,
    capacity: CAPACITY,
    transport: { transport: countedTransport, sends: () => sends, request: REQUEST, supplier: SUPPLIER },
    hooks,
    facts: assemblyFacts(backend),
    injected: backend.faults?.injected ?? [],
    async dispose() {
      upstream.dispose()
      await Promise.race([drives.settle(), sleep(WAIT_MS)])
      await host.dispose()
      await stage.dispose()
      for (const fiber of fibers.reverse()) await fiber.dispose()
    },
  }
}

/** The observer's right to the call, from the one authority of the commands core. */
function coreAuthorize(
  denied: Set<CommandAction>,
  access: Readonly<{ principal: unknown; tenant: TenantId; call: ModelCallId }>,
): { ok: undefined } | { failure: ModelFailure } {
  const allowed =
    access.principal === PRINCIPAL && tenantEquals(TENANT, access.tenant) && !denied.has('observe')
  return allowed ? { ok: undefined } : { failure: { kind: 'denied', action: 'observe' } }
}
