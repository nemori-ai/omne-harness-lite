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
    JSON.stringify({
      organization: `org_${letter.repeat(26)}`,
      account: `acc_${letter.repeat(26)}`,
    }),
  )
  if (!parsed.ok) throw new Error('fixture tenant does not parse')
  return parsed.value
}
const TENANT = tenantOf('a')
const OTHER_TENANT = tenantOf('b')
const callId = (name: string): ModelCallId => unbox(decodeModelCallId(`mcall_${name}`))
const op = (name: string): ModelOperationId => unbox(decodeModelOperationId(`mop_${name}`))
const instanceId = unbox(decodeModelInstanceId('minst_one'))
const dispatchId = unbox(decodeDispatchId('mdisp_one'))
const factoryId = unbox(decodeCredentialId('official-query'))
const adoption: Adoption = {
  owner: 'test-owner',
  name: 'test',
  revision: '1',
  digest: '0'.repeat(64),
}
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
const principal: Readonly<{ subject: string }> = Object.freeze({ subject: 'trusted' })
type Principal = typeof principal
/** A principal that the authority admits in `OTHER_TENANT` only. */
const otherPrincipal: Principal = Object.freeze({ subject: 'other-tenant' })
/** A principal that the authority admits in no tenant. */
const stranger: Principal = Object.freeze({ subject: 'stranger' })
/** The tenant in which the authority admits each principal. */
const GRANTS = new Map<Principal, TenantId>([
  [principal, TENANT],
  [otherPrincipal, OTHER_TENANT],
])

const coreOptions: ModelCommandsCoreOptions<Principal> = {
  owners: [owner],
  authority: {
    authorize: ({ access, action }) => {
      const granted = GRANTS.get(access.principal)
      return granted !== undefined && tenantEquals(granted, access.tenant)
        ? { ok: { owner: 'identity', subject: access.principal.subject, revision: '1' } }
        : { failure: { kind: 'denied', action } }
    },
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
type Provider = ReturnType<typeof sqliteStorage>

const storageOf = (provider: Provider) =>
  createSqlModelStorage({
    storage: provider.storage,
    domains: lookup,
    combination: { combinationVersion: 'v1', manifestDigest: 'a'.repeat(64) },
    limits: {
      tenantCapacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
      maxCallBytes: 1 << 20,
      maxCommandBytes: (1 << 20) + COMMAND_RESERVE_BYTES,
    },
    isPending: call => hasRecoveryWork(call),
  })

/** The SQL assembly: one SQL storage, its mirror, one core over the mirror, the coordinator. */
function sqlAssembly(
  settings: Readonly<{ provider?: Provider; mirrorBytes?: number; maxClaims?: number }> = {},
): Subject & Readonly<{ provider: Provider }> {
  const provider = settings.provider ?? sqliteStorage()
  const mirror = createSendMirror(storageOf(provider), {
    mirrorBytes: settings.mirrorBytes ?? 1 << 20,
    ...(settings.maxClaims === undefined ? {} : { maxClaims: settings.maxClaims }),
  })
  const core = createModelCommandsCore(coreOptions, mirror.storage)
  return {
    commands: modelCommands(core),
    coordinator: mirror.coordinator(core, [source]),
    provider,
  }
}

/** The memory assembly of `@omne-harness/model/testing`, with the same options and source. */
function memoryAssembly(): Subject {
  const memory = createTestModelDependencies<Principal>({
    ...coreOptions,
    start: '2026-11-01T00:00:00.000Z',
    maxWaiters: 1,
    maxQueued: 1,
    sends: [],
    sending: {
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'unavailable' }),
      },
      sources: [source],
      maxRetainedAttempts: 1,
    },
  })
  return { commands: memory.dependencies.commands, coordinator: memory.controls.send.coordinator }
}

const WINDOW = 'receive_one'
type Actor = Readonly<{ principal: Principal; tenant: TenantId }>
const OWNER: Actor = { principal, tenant: TENANT }
const access = (call: ModelCallId, actor: Actor = OWNER) => ({ ...actor, call })

type Stage = 'admitted' | 'prepared' | 'materialized' | 'window'
type Driven = Readonly<{
  demand: SendDemand<Principal>
  /** The `recordMaterialization` input, once the call reached that stage. */
  materialization: Parameters<ModelCommands<Principal>['recordMaterialization']>[0] | null
}>

/** Drives one call through the commands up to `stage`; returns its send demand. */
async function drive(
  subject: Subject,
  call: ModelCallId,
  stage: Stage,
  actor: Actor = OWNER,
): Promise<Driven> {
  const { commands } = subject
  unbox(
    await commands.admit({
      ...access(call, actor),
      operation: op(`admit-${call}`),
      request,
      consumer: { owner: 'consumer', work: 'work', position: 'position', purpose: 'test' },
      capacity: { bytes: '100000', blocks: '100', attachmentBytes: '100000' },
    }),
  )
  let execution: ExecutionRef = {
    tenant: actor.tenant,
    call,
    instance: instanceId,
    generation: '0',
  }
  let materialization: Driven['materialization'] = null
  if (stage !== 'admitted') {
    execution = unbox(
      await commands.claim({
        ...access(call, actor),
        instance: instanceId,
        operation: op(`claim-${call}`),
        continuity: proof(call),
      }),
    )
    const expected = unbox(await commands.loadRecovery(access(call, actor))).state.revision
    const revision = unbox(
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
      materialization = {
        ...execution,
        operation: op(`material-${call}`),
        expected: revision,
        dispatch: dispatchId,
        receipt,
      }
      const recorded = unbox(await commands.recordMaterialization(materialization))
      if (stage === 'window')
        unbox(
          await commands.openReceiveWindow({
            ...execution,
            operation: op(`window-${call}`),
            expected: recorded.revision,
            dispatch: dispatchId,
            window: WINDOW,
          }),
        )
    }
  }
  const recovery = unbox(await commands.loadRecovery(access(call, actor)))
  const demand: SendDemand<Principal> = {
    ...access(call, actor),
    execution,
    dispatch: dispatchId,
    request,
    supplier: request.suppliers[0],
    consumer: recovery.state.consumer,
    initiator: recovery.initiator,
  }
  return { demand, materialization }
}

const started = (): SendStart => ({ kind: 'started', facts: (async function* () {})() })
const COLD = {
  failure: {
    kind: 'unavailable',
    dependency: 'model-send',
    diagnostic: 'qualification-unavailable',
  },
}
/** A fence that counts its starts. */
function fenceOf(subject: Subject, demand: SendDemand<Principal>) {
  let starts = 0
  return {
    starts: () => starts,
    enter: (start: () => SendStart = started, at = receipt, window = WINDOW) =>
      subject.coordinator.withinCurrent(demand, at, window, () => {
        starts += 1
        return start()
      }),
  }
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve))

// --- Cases ---------------------------------------------------------------------------------

describe('the synchronous fence', () => {
  it('runs start inside withinCurrent and returns its result in the same turn', async () => {
    const subject = sqlAssembly()
    const { demand } = await drive(subject, callId('fence'), 'window')
    const order: string[] = []
    const result = subject.coordinator.withinCurrent(demand, receipt, WINDOW, selection => {
      order.push(`start:${selection.scope}:${selection.id}`)
      return started()
    })
    order.push('returned')
    expect(order).toEqual([`start:factory:${factoryId}`, 'returned'])
    expect(result.kind).toBe('started')
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
      return started()
    })
    expect(inner).toBeInstanceOf(TypeError)
  })

  it('starts a dispatch once, also when start throws', async () => {
    const subject = sqlAssembly()
    const { demand } = await drive(subject, callId('once'), 'window')
    const fence = fenceOf(subject, demand)
    expect(
      fence.enter(() => {
        throw new Error('transport start')
      }),
    ).toEqual({ kind: 'unknown', diagnostic: 'transport-start-unknown' })
    expect(fence.enter()).toEqual({ kind: 'unknown', diagnostic: 'dispatch-already-claimed' })
    expect(fence.starts()).toBe(1)
  })

  it('accepts only a core that runs on the storage of its mirror', () => {
    const storage = storageOf(sqliteStorage())
    const mirror = createSendMirror(storage, { mirrorBytes: 1 })
    const bare = createModelCommandsCore(coreOptions, storage)
    expect(() => mirror.coordinator(bare, [source])).toThrow(TypeError)
  })
})

describe('the pin of a materialized dispatch', () => {
  it('keeps the mirror of a call from recordMaterialization to withinCurrent, then lets it go', async () => {
    // One byte of budget: every newly mirrored call evicts every call that is not pinned.
    const subject = sqlAssembly({ mirrorBytes: 1 })
    const { demand } = await drive(subject, callId('pinned'), 'window')
    await drive(subject, callId('other'), 'prepared')
    const fence = fenceOf(subject, demand)
    expect(fence.enter().kind).toBe('started')
    expect(fence.starts()).toBe(1)
    // The claim ends the pin: the next mirrored call evicts this one.
    await drive(subject, callId('third'), 'admitted')
    expect(subject.coordinator.check(demand, 'access')).toEqual(COLD)
  })
})

describe('a cold mirror', () => {
  it('refuses the fence; recordMaterialization with the same operation reads the call back', async () => {
    const provider = sqliteStorage()
    const { demand, materialization } = await drive(
      sqlAssembly({ provider }),
      callId('cold'),
      'window',
    )
    if (materialization === null) throw new Error('fixture materialization')
    // A new instance over the same rows: the process state of the first one is gone.
    const fresh = sqlAssembly({ provider })
    const fence = fenceOf(fresh, demand)
    expect(fresh.coordinator.check(demand, 'access')).toEqual(COLD)
    expect(fence.enter()).toEqual({ kind: 'refused', ...COLD })
    expect(fence.starts()).toBe(0)
    unbox(await fresh.commands.recordMaterialization(materialization))
    expect(fence.enter().kind).toBe('started')
    expect(fence.starts()).toBe(1)
  })

  it('forgets a call whose write has an unknown outcome', async () => {
    const subject = sqlAssembly()
    const { demand } = await drive(subject, callId('lost'), 'prepared')
    expect(subject.coordinator.check(demand, 'prepare')).toEqual({ ok: undefined })
    const recovery = unbox(await subject.commands.loadRecovery(access(callId('lost'))))
    subject.provider.hooks.loseNextReply = true
    expect(
      await subject.commands.recordMaterialization({
        ...demand.execution,
        operation: op('material-lost'),
        expected: recovery.state.revision,
        dispatch: dispatchId,
        receipt,
      }),
    ).toEqual({ failure: { kind: 'commit-unknown', operation: op('material-lost') } })
    expect(subject.coordinator.check(demand, 'prepare')).toEqual(COLD)
  })

  it('does not go back to a read that a later commit overtook', async () => {
    const subject = sqlAssembly()
    const { demand } = await drive(subject, callId('stale'), 'prepared')
    let release = () => {}
    subject.provider.hooks.holdNextRead = new Promise<void>(resolve => {
      release = resolve
    })
    const reading = subject.commands.loadRecovery(access(callId('stale')))
    await turn()
    unbox(await subject.commands.control({ ...access(callId('stale')), operation: op('cancel') }))
    release()
    unbox(await reading)
    expect(subject.coordinator.check(demand, 'prepare')).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'send-no-longer-valid' },
    })
  })
})

/** `demand` as sent by `actor` for `call`, with the execution of the same tenant and call. */
const demandAs = (
  demand: SendDemand<Principal>,
  actor: Partial<Actor>,
  call: ModelCallId = demand.call,
): SendDemand<Principal> => {
  const tenant = actor.tenant ?? demand.tenant
  return {
    ...demand,
    principal: actor.principal ?? demand.principal,
    tenant,
    call,
    execution: { ...demand.execution, tenant, call },
  }
}

describe('qualification before the mirror', () => {
  it('denies an unauthorized principal alike for a hot, a cold and a missing call', async () => {
    const provider = sqliteStorage()
    const cold = await drive(sqlAssembly({ provider }), callId('cold'), 'window')
    // A new instance over the same rows: `cold` is stored but not mirrored, `hot` is mirrored.
    const subject = sqlAssembly({ provider })
    const hot = await drive(subject, callId('hot'), 'window')
    const demands = {
      hot: hot.demand,
      cold: cold.demand,
      missing: demandAs(hot.demand, {}, callId('missing')),
    }
    const denied = { failure: { kind: 'denied', action: 'send' } }
    for (const [name, demand] of Object.entries(demands)) {
      const fence = fenceOf(subject, demandAs(demand, { principal: stranger }))
      expect([
        name,
        subject.coordinator.check(demandAs(demand, { principal: stranger }), 'access'),
      ]).toEqual([name, denied])
      expect([name, fence.enter()]).toEqual([name, { kind: 'refused', ...denied }])
      expect([name, fence.starts()]).toEqual([name, 0])
    }
    // The authorized principal: the hot call is judged, a call outside the mirror is cold.
    expect(subject.coordinator.check(demands.hot, 'access')).toEqual({ ok: undefined })
    expect(subject.coordinator.check(demands.cold, 'access')).toEqual(COLD)
    expect(subject.coordinator.check(demands.missing, 'access')).toEqual(COLD)
  })
})

describe('tenants', () => {
  it('keeps the mirror and the claims of a tenant from a namesake call of another tenant', async () => {
    const subject = sqlAssembly()
    const shared = callId('shared')
    const mine = await drive(subject, shared, 'window')
    const theirs = demandAs(mine.demand, { principal: otherPrincipal, tenant: OTHER_TENANT })
    // The other tenant does not see the mirrored call of this tenant, nor start its dispatch.
    const intruder = fenceOf(subject, theirs)
    expect(subject.coordinator.check(theirs, 'access')).toEqual(COLD)
    expect(intruder.enter()).toEqual({ kind: 'refused', ...COLD })
    expect(intruder.starts()).toBe(0)
    expect(fenceOf(subject, mine.demand).enter().kind).toBe('started')
    // The namesake call of the other tenant has its own mirror entry and its own claim.
    const own = await drive(subject, shared, 'window', {
      principal: otherPrincipal,
      tenant: OTHER_TENANT,
    })
    expect(subject.coordinator.check(own.demand, 'access')).toEqual({ ok: undefined })
    const fence = fenceOf(subject, own.demand)
    expect(fence.enter().kind).toBe('started')
    expect(fence.starts()).toBe(1)
  })
})

describe('claims', () => {
  it('drops a claim once the send record is mirrored, so the bound frees', async () => {
    const subject = sqlAssembly({ maxClaims: 1 })
    const first = await drive(subject, callId('first'), 'window')
    const second = await drive(subject, callId('second'), 'window')
    expect(fenceOf(subject, first.demand).enter().kind).toBe('started')
    expect(fenceOf(subject, second.demand).enter()).toEqual({
      kind: 'refused',
      failure: { kind: 'unavailable', dependency: 'model-send', diagnostic: 'send-claim-capacity' },
    })
    const { revision } = unbox(await subject.commands.loadRecovery(access(callId('first')))).state
    unbox(
      await subject.commands.recordSend({
        ...first.demand.execution,
        operation: op('send-first'),
        expected: revision,
        dispatch: dispatchId,
        state: 'started',
      }),
    )
    expect(fenceOf(subject, second.demand).enter().kind).toBe('started')
  })
})

describe('parity with the memory coordinator', () => {
  /** One script of fence calls; each answer reduced to its comparable part. */
  async function script(subject: Subject): Promise<unknown[]> {
    const answers: unknown[] = []
    const answer = (result: SendStart | Outcome<void, unknown>) =>
      answers.push('kind' in result && result.kind === 'started' ? 'started' : result)
    const admitted = await drive(subject, callId('admitted'), 'admitted')
    answer(subject.coordinator.check(admitted.demand, 'access'))
    const prepared = await drive(subject, callId('prepared'), 'prepared')
    answer(subject.coordinator.check(prepared.demand, 'access'))
    answer(subject.coordinator.check(prepared.demand, 'prepare'))
    answer(fenceOf(subject, prepared.demand).enter())
    const open = await drive(subject, callId('open'), 'window')
    const fence = fenceOf(subject, open.demand)
    answer(fence.enter(started, { ...receipt, payloadDigest: 'b'.repeat(64) }))
    answer(fence.enter(started, receipt, 'receive_other'))
    answer(subject.coordinator.check({ ...open.demand, principal: stranger }, 'access'))
    answer(fence.enter())
    answer(fence.enter())
    unbox(await subject.commands.control({ ...access(callId('prepared')), operation: op('stop') }))
    answer(subject.coordinator.check(prepared.demand, 'prepare'))
    return answers
  }

  it('answers each fence call as the memory coordinator does', async () => {
    const memory = await script(memoryAssembly())
    const sql = await script(sqlAssembly())
    expect(sql).toEqual(memory)
    expect(sql).toContain('started')
  })

  it('differs on a call the process does not hold: cold, not not-found', async () => {
    const { demand } = await drive(sqlAssembly(), callId('missing'), 'admitted')
    expect(memoryAssembly().coordinator.check(demand, 'access')).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
    })
    expect(sqlAssembly().coordinator.check(demand, 'access')).toEqual(COLD)
  })
})
