// The send coordinator of this member over the SQL storage: the shared commands core runs on the
// mirrored storage, the coordinator answers its synchronous fence from the process mirror. The
// storage below is a test provider on node:sqlite (one in-memory database per transaction domain,
// receipts by full identity); it does not model Workers, durability or queues.
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type DurableEvidence,
  type FixedModelRequest,
  type MaterializationReceipt,
  type ModelCallId,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import {
  decodeCredentialId,
  type ExecutionRef,
  type ModelCommands,
  type ModelConsumerOwnerDeclaration,
  type SendDemand,
} from '@omne-harness/model-contract/provider'
import type { SendCoordinator, SendStart } from '@omne-harness/model'
import {
  createModelCommandsCore,
  modelCommands,
  hasRecoveryWork,
  type ModelCommandStorage,
  type ModelCommandsCoreOptions,
  type ModelSendSource,
} from '@omne-harness/model/commands'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import type { Outcome } from '@omne-harness/operation-result'
import {
  inputDigestV2,
  type CommitRequestV2,
  type CommitResultV2,
  type ReceiptV2,
  type SqlIdentity,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import participant from '../src/commit.ts'
import {
  COMMAND_RESERVE_BYTES,
  callHandler,
  createSqlModelStorage,
  modelMigration,
  pendingHandler,
} from '../src/index.ts'
import { createSendMirror } from '../src/coordinator.ts'

// --- Test provider -------------------------------------------------------------------------

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

type Domain = { readonly db: DatabaseSync; readonly receipts: Map<string, ReceiptV2> }
const HANDLERS = new Map([callHandler, pendingHandler].map(item => [item.handler, item]))

/** A node:sqlite provider with two faults: a lost commit reply, and a held read reply. */
function sqliteStorage() {
  const domains = new Map<string, Domain>()
  const hooks: { loseNextReply: boolean; holdNextRead: Promise<void> | null } = {
    loseNextReply: false,
    holdNextRead: null,
  }
  const domainOf = (name: string): Domain => {
    const found = domains.get(name)
    if (found !== undefined) return found
    const db = new DatabaseSync(':memory:')
    modelMigration.up({ execute: (sql, params) => rowsOf(db, sql, params) })
    const domain = { db, receipts: new Map<string, ReceiptV2>() }
    domains.set(name, domain)
    return domain
  }
  const execute = (domain: Domain, request: CommitRequestV2): ReceiptV2 => {
    const command = request.commands[0]
    if (command === undefined) throw new Error('no command')
    const head = {
      identity: request.identity,
      inputDigest: inputDigestV2(request),
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
  const keyOf = (identity: SqlIdentity) => `${identity.operation}|${identity.operationKey}`
  const storage: SqlStorage = {
    registerCombination: input => Promise.resolve({ kind: 'registered', registration: input }),
    async commit(request): Promise<CommitResultV2> {
      const domain = domainOf(request.identity.transactionDomain)
      const key = keyOf(request.identity)
      const existing = domain.receipts.get(key)
      if (existing !== undefined)
        return existing.inputDigest === inputDigestV2(request)
          ? existing
          : { kind: 'identity_conflict', identity: request.identity, existing }
      const receipt = execute(domain, request)
      domain.receipts.set(key, receipt)
      if (hooks.loseNextReply) {
        hooks.loseNextReply = false
        return { kind: 'unknown', identity: request.identity, diagnostic: null }
      }
      return receipt
    },
    query(identity) {
      const found = domainOf(identity.transactionDomain).receipts.get(keyOf(identity))
      return Promise.resolve(
        found ?? {
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
      )
    },
    async read(request) {
      const handler = HANDLERS.get(request.handler)
      const db = domainOf(request.domain.transactionDomain).db
      // The read runs now; a held reply reaches the caller later, after other writes.
      const outcome = handler?.read(request.input, {
        execute: (sql, params) => rowsOf(db, sql, params),
      })
      const gate = hooks.holdNextRead
      hooks.holdNextRead = null
      if (gate !== null) await gate
      return outcome?.kind === 'read'
        ? { kind: 'read', requestKey: request.requestKey, output: outcome.output }
        : {
            kind: 'unavailable',
            requestKey: request.requestKey,
            reason: 'read_failed',
            diagnostic: outcome?.kind === 'failed' ? outcome.diagnostic : 'no handler',
          }
    },
  }
  return { storage, hooks }
}

// --- Values --------------------------------------------------------------------------------

const unbox = <T>(outcome: Outcome<T, unknown>): T => {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`fixture failure: ${JSON.stringify(outcome.failure)}`)
}
function tenantOf(letter: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${letter.repeat(26)}`, account: `acc_${letter.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant does not parse')
  return parsed.value
}
const textOf = (tenant: TenantId): string => {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture tenant does not encode')
  return text.value
}
const TENANT = tenantOf('a')
const callId = (name: string): ModelCallId => unbox(decodeModelCallId(`mcall_${name}`))
const op = (name: string): ModelOperationId => unbox(decodeModelOperationId(`mop_${name}`))
const instanceId = unbox(decodeModelInstanceId('minst_one'))
const dispatchId = unbox(decodeDispatchId('mdisp_one'))
const factoryId = unbox(decodeCredentialId('official-query'))
const adoption: Adoption = { owner: 'test-owner', name: 'test', revision: '1', digest: '0'.repeat(64) }
const owner: ModelConsumerOwnerDeclaration = {
  consumerOwner: 'consumer',
  work: { kind: 'exempt' },
  evidence: adoption,
}
const request: FixedModelRequest = {
  profile: adoption,
  suppliers: [
    { adoption, recipient: 'test.invalid', model: 'test', credential: { kind: 'factory' } },
  ],
  fallback: false,
  retryPolicy: adoption,
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
  ],
  representation: adoption,
  parameterAdoptions: [],
  source: adoption,
}
const receipt: MaterializationReceipt = {
  supplier: adoption,
  representation: adoption,
  payloadDigest: 'a'.repeat(64),
}
const proof = (record: string, by = 'host'): DurableEvidence => ({
  owner: by,
  record,
  revision: '1',
  digest: '1'.repeat(64),
})
const principal = Object.freeze({ subject: 'trusted' })
type Principal = typeof principal

const coreOptions: ModelCommandsCoreOptions<Principal> = {
  owners: [owner],
  authority: {
    authorize: ({ access, action }) =>
      access.principal === principal && tenantEquals(TENANT, access.tenant)
        ? { ok: { owner: 'identity', subject: principal.subject, revision: '1' } }
        : { failure: { kind: 'denied', action } },
    execution: () => ({ ok: { owner: 'host', subject: 'channel', revision: '1' } }),
  },
  evidence: [
    {
      adoption,
      continuity: i =>
        i.source.owner === 'host' && i.source.record === i.call
          ? { ok: structuredClone(i.source) }
          : { failure: { kind: 'invalid', field: 'continuity', reason: 'untrusted' } },
      materialization: i => ({ ok: proof(`${i.call}/${i.dispatch}`, 'materializer') }),
      lateFact: () => ({ failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } }),
      retry: () => ({ failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } }),
      handoff: () => ({ failure: { kind: 'handoff-invalid', reason: 'fixture-proof' } }),
      receive: () => ({
        failure: { kind: 'unavailable', dependency: 'receive-record', diagnostic: 'none' },
      }),
    },
  ],
  clock: { now: () => '2026-11-01T00:00:00.000Z' },
  limits: {
    scanPageCalls: 2,
    resultPageParts: 1,
    resultPageTargetBytes: 1024,
    readIdleMs: 1000,
    capacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
  },
}
const source: ModelSendSource<Principal> = {
  profile: adoption,
  supplier: adoption,
  recipient: 'test.invalid',
  model: 'test',
  credential: { kind: 'factory', official: true, queryId: factoryId },
  current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
}
const lookup: TenantDomainLookup = {
  lookup: ({ tenant }) =>
    Promise.resolve({
      kind: 'ready',
      domain: { scope: { kind: 'tenant', tenant }, transactionDomain: `domain-${tenant}` },
    }),
}

type Subject = Readonly<{
  commands: ModelCommands<Principal>
  coordinator: SendCoordinator<Principal>
}>

/** The SQL assembly: one SQL storage, its mirror, one core over the mirror, the coordinator. */
function sqlAssembly(
  provider: ReturnType<typeof sqliteStorage> = sqliteStorage(),
  mirrorBytes = 1 << 20,
): Subject & Readonly<{ provider: ReturnType<typeof sqliteStorage> }> {
  const storage = createSqlModelStorage({
    storage: provider.storage,
    domains: lookup,
    combination: { combinationVersion: 'v1', manifestDigest: 'a'.repeat(64) },
    limits: {
      tenantCapacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
      maxCallBytes: 1 << 20,
      maxCommandBytes: (1 << 20) + COMMAND_RESERVE_BYTES,
    },
    isPending: call => hasRecoveryWork(call as never),
  })
  // The S1 storage still types its port with its own copy of the core types (C-WIRE-SQL drops it).
  const mirror = createSendMirror(storage as unknown as ModelCommandStorage, { mirrorBytes })
  const core = createModelCommandsCore(coreOptions, mirror.storage)
  return { commands: modelCommands(core), coordinator: mirror.coordinator(core, [source]), provider }
}

const admitOf = (call: ModelCallId) => ({
  principal,
  tenant: TENANT,
  call,
  operation: op(`admit-${call}`),
  request,
  consumer: { owner: 'consumer', work: 'work', position: 'position', purpose: 'test' },
  capacity: { bytes: '100000', blocks: '100', attachmentBytes: '100000' },
})

type Stage = 'admitted' | 'prepared' | 'materialized' | 'window'
/** Drives one call through the commands up to `stage`; returns its send demand. */
async function drive(
  subject: Subject,
  call: ModelCallId,
  stage: Stage,
): Promise<Readonly<{ demand: SendDemand<Principal>; execution: ExecutionRef | null }>> {
  const { commands } = subject
  const admit = admitOf(call)
  unbox(await commands.admit(admit))
  const access = { principal, tenant: TENANT, call }
  let execution: ExecutionRef | null = null
  if (stage !== 'admitted') {
    execution = unbox(
      await commands.claim({
        ...access,
        instance: instanceId,
        operation: op(`claim-${call}`),
        continuity: proof(call),
      }),
    )
    const expected = unbox(await commands.loadRecovery(access)).state.revision
    let revision = unbox(
      await commands.prepareDispatch({
        ...execution,
        operation: op(`prepare-${call}`),
        expected,
        dispatch: dispatchId,
        supplier: request.suppliers[0],
        policyDecision: null,
      }),
    )
    if (stage !== 'prepared') {
      revision = unbox(
        await commands.recordMaterialization({
          ...execution,
          operation: op(`material-${call}`),
          expected: revision,
          dispatch: dispatchId,
          receipt,
        }),
      ).revision
      if (stage === 'window')
        unbox(
          await commands.openReceiveWindow({
            ...execution,
            operation: op(`window-${call}`),
            expected: revision,
            dispatch: dispatchId,
            window: WINDOW,
          }),
        )
    }
  }
  const recovery = unbox(await commands.loadRecovery(access))
  const demand: SendDemand<Principal> = {
    principal,
    tenant: TENANT,
    call,
    execution: execution ?? {
      tenant: TENANT,
      call,
      instance: instanceId,
      generation: '0',
    },
    dispatch: dispatchId,
    request,
    supplier: request.suppliers[0],
    consumer: recovery.state.consumer,
    initiator: recovery.initiator,
  }
  return { demand, execution }
}
const WINDOW = 'receive_one'
const STARTED: SendStart = { kind: 'started', facts: (async function* () {})() }
const qualificationUnavailable = {
  kind: 'refused',
  failure: { kind: 'unavailable', dependency: 'model-send', diagnostic: 'qualification-unavailable' },
}

// --- Cases ---------------------------------------------------------------------------------

describe('the synchronous fence', () => {
  it('runs start inside withinCurrent and returns its result in the same turn', async () => {
    const subject = sqlAssembly()
    const { demand } = await drive(subject, callId('fence'), 'window')
    const order: string[] = []
    const result = subject.coordinator.withinCurrent(demand, receipt, WINDOW, selection => {
      order.push(`start:${selection.scope}`)
      return STARTED
    })
    order.push('returned')
    expect(order).toEqual(['start:factory', 'returned'])
    expect(result).toBe(STARTED)
  })

  it('refuses a fence entered from inside start', async () => {
    const subject = sqlAssembly()
    const { demand } = await drive(subject, callId('reentry'), 'window')
    let inner: unknown
    subject.coordinator.withinCurrent(demand, receipt, WINDOW, () => {
      try {
        subject.coordinator.check(demand, 'prepare')
        inner = 'entered'
      } catch (error) {
        inner = error
      }
      return STARTED
    })
    expect(inner).toBeInstanceOf(TypeError)
  })
})

describe('the pin of a materialized dispatch', () => {
  it('keeps the mirror of a call from recordMaterialization to withinCurrent', async () => {
    // One byte of budget: every newly mirrored call evicts every call that is not pinned.
    const subject = sqlAssembly(sqliteStorage(), 1)
    const { demand } = await drive(subject, callId('pinned'), 'window')
    await drive(subject, callId('other'), 'prepared')
    let starts = 0
    const result = subject.coordinator.withinCurrent(demand, receipt, WINDOW, () => {
      starts += 1
      return STARTED
    })
    expect(result).toBe(STARTED)
    expect(starts).toBe(1)
  })
})

export { qualificationUnavailable, textOf }
