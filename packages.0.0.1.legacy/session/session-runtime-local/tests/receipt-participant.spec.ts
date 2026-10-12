import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseTenantId, tenantIdEquals, unwrap } from '@omne-harness-lite/identity-values'
import {
  narrow,
  StorageDefect,
  StorageUnavailable,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import {
  checkAppendInput,
  checkSourceToken,
  type LogAuthority,
} from '@omne-harness-lite/session-log'
import {
  openSqlSessionLog,
  sessionLogMigrations,
  type SqlSessionLog,
} from '@omne-harness-lite/session-log-sql'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import {
  type CoordinationAuthority,
  type OperationRef,
  type Receipt,
} from '@omne-harness-lite/session-runtime'
import { createLocalOperationReceipts } from '../src/receipt-participant.ts'
import { operationReceiptMigrations } from '../src/receipt-migrations.ts'
import { createLocalSessionState } from '../src/state-participant.ts'
import { sessionStateMigrations } from '../src/state-migrations.ts'
import { receiptValue } from '../src/receipt-values.ts'

const roots: string[] = [],
  stores: SqlStorage[] = [],
  logs: SqlSessionLog[] = []
const tenant = unwrap(parseTenantId({ organization: 'team', account: 'owner' }))
const checkedScope = checkSourceToken({
  tenant,
  session: 'session',
  journalGeneration: 'fixture',
  tail: 0,
})
if ('failure' in checkedScope) throw new Error('invalid fixture')
const scope = { tenant, session: checkedScope.ok.session }
const authority = Object.freeze({}) as CoordinationAuthority
const logAuthority = Object.freeze({}) as LogAuthority
const operation: OperationRef = {
  tenant,
  principal: 'owner',
  operation: 'submitInput',
  operationKey: 'input-1',
  session: scope.session,
}
const policy = { maxRecords: 8, maxRecordBytes: 4096 }
afterEach(async () => {
  vi.restoreAllMocks()
  for (const log of logs.splice(0)) await log.close()
  for (const storage of stores.splice(0)) await storage.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-session-receipt-'))
  roots.push(root)
  const file = join(root, 'tenant.sqlite')
  const storage = await openStorage({ dialect: 'sqlite', file, synchronous: 'full' })
  stores.push(storage)
  for (const fragment of [
    ...sessionLogMigrations,
    ...sessionStateMigrations,
    ...operationReceiptMigrations,
  ])
    await storage.write(tx => fragment.migration.up(tx.db))
  await storage.write(async tx => {
    await tx.db.schema
      .createTable('receipt_test_permission')
      .addColumn('allowed', 'integer', c => c.notNull())
      .execute()
    await tx.db.insertInto('receipt_test_permission').values({ allowed: 1 }).execute()
  })
  let open = true
  const allowed = async (unit: StorageUnit) => {
    const row = await unit.query(tx =>
      narrow<{ receipt_test_permission: { allowed: number } }>(tx)
        .selectFrom('receipt_test_permission')
        .selectAll()
        .executeTakeFirstOrThrow(),
    )
    return row.allowed === 1
  }
  const auth = {
    authorize: async (unit: StorageUnit, candidate: CoordinationAuthority, ref: OperationRef) =>
      candidate === authority &&
      ref.principal === 'owner' &&
      tenantIdEquals(ref.tenant, tenant) &&
      (await allowed(unit))
        ? { kind: 'authorized' as const }
        : { failure: 'denied' as const },
  }
  const log = openSqlSessionLog({
    storage,
    operationLimit: 16,
    authority: {
      storage,
      authorize: async (unit, candidate, requested) =>
        candidate === logAuthority &&
        tenantIdEquals(requested.tenant, tenant) &&
        (await allowed(unit))
          ? { kind: 'authorized' as const }
          : { kind: 'denied' as const },
      authorizeEnumeration: async () => ({ kind: 'denied' }),
    },
  })
  logs.push(log)
  const options = {
    storage,
    tenant,
    policy,
    authority: auth,
    log: log.participant,
    logAuthority,
    isOpen: () => open,
  }
  const receipts = createLocalOperationReceipts(options)
  const state = createLocalSessionState({
    storage,
    tenant,
    authority: { authorize: async (unit, candidate) => auth.authorize(unit, candidate, operation) },
    policy: { maxPendingPerSession: 8, maxBatchSize: 4, maxRecordBytes: 4096 },
    isOpen: () => open,
    workSettledIn: async () => 'settled',
  })
  const append = async (unit: StorageUnit, ref = operation): Promise<Receipt> => {
    const request = checkAppendInput(
      scope.session,
      [{ tenant, readKeys: [], payload: { fixture: ref.operationKey } }],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in request) throw new Error('invalid request')
    const batch = await log.participant.appendIn(unit, logAuthority, request.ok)
    const source = await log.participant.sourceIn(unit, logAuthority, scope)
    if ('failure' in batch || 'failure' in source) throw new Error('unavailable source')
    return { operation: ref, position: batch.entries[0]!.position, source: source.source }
  }
  const write = (ref = operation, semantic = 'semantic-1') =>
    storage.atomic(async unit =>
      receipts.stageIn(unit, authority, semantic, await append(unit, ref)),
    )
  const read = (ref = operation, candidate = authority) =>
    storage.atomic(unit => receipts.readIn(unit, candidate, ref))
  return {
    file,
    storage,
    log,
    state,
    options,
    receipts,
    append,
    write,
    read,
    stop: () => {
      open = false
    },
    revoke: () =>
      storage.write(tx =>
        tx.db.updateTable('receipt_test_permission').set({ allowed: 0 }).execute(),
      ),
  }
}

it('recognizes a complete original operation without needing its assigned Session at lookup', async () => {
  const f = await fixture(),
    ref: OperationRef = { ...operation, operation: 'createSession', session: null }
  const staged = await f.write(ref)
  expect(staged).toMatchObject({
    kind: 'staged',
    receipt: { operation: ref, position: 1, source: { ...scope, tail: 1 } },
  })
  expect(await f.read(ref)).toEqual({
    kind: 'present',
    semanticDigest: 'semantic-1',
    receipt: 'receipt' in staged ? staged.receipt : undefined,
  })
  const second = await openStorage({ dialect: 'sqlite', file: f.file, synchronous: 'full' })
  stores.push(second)
  const log = openSqlSessionLog({
    storage: second,
    operationLimit: 8,
    authority: {
      storage: second,
      authorize: async () => ({ kind: 'denied' }),
      authorizeEnumeration: async () => ({ kind: 'denied' }),
    },
  })
  logs.push(log)
  const reopened = createLocalOperationReceipts({
    ...f.options,
    storage: second,
    log: log.participant,
  })
  expect(await second.atomic(unit => reopened.readIn(unit, authority, ref))).toEqual(
    await f.read(ref),
  )
})
it('preserves the original receipt snapshot on same-semantic replay after later log writes', async () => {
  const f = await fixture(),
    original = await f.write()
  const replay = await f.write()
  expect(replay).toEqual(original)
  expect(await f.log.participant.source(logAuthority, scope)).toMatchObject({ source: { tail: 2 } })
  expect(await f.read()).toMatchObject({ receipt: { source: { tail: 1 }, position: 1 } })
})
it('rejects a different semantic for the same identity and preserves the original', async () => {
  const f = await fixture()
  await f.write()
  expect(await f.write(operation, 'different')).toEqual({ failure: 'identityConflict' })
  expect(await f.read()).toMatchObject({ semanticDigest: 'semantic-1' })
})
it('keeps operation names and Session scopes separate even when key strings match', async () => {
  const f = await fixture(),
    create: OperationRef = { ...operation, operation: 'createSession', session: null }
  await f.write(create, 'create')
  await f.write(operation, 'input')
  expect(await f.read(create)).toMatchObject({ semanticDigest: 'create' })
  expect(await f.read()).toMatchObject({ semanticDigest: 'input' })
  expect(await f.read({ ...operation, session: 'other' as OperationRef['session'] })).toEqual({
    kind: 'absent',
  })
})
it('rolls back log, state, pending qualification and receipt together after a later failure', async () => {
  const f = await fixture()
  await expect(
    f.storage.atomic(async unit => {
      const receipt = await f.append(unit)
      expect(
        await f.state.participant.stageIn(unit, authority, scope, null, {
          kind: 'initialize',
          stepKey: 'create',
        }),
      ).toHaveProperty('kind', 'staged')
      expect(
        await f.state.participant.stageIn(unit, authority, scope, '0', {
          kind: 'acceptInput',
          operation,
          semanticDigest: 'semantic-1',
          position: receipt.position,
        }),
      ).toHaveProperty('kind', 'staged')
      expect(await f.receipts.stageIn(unit, authority, 'semantic-1', receipt)).toHaveProperty(
        'kind',
        'staged',
      )
      throw new Error('later participant failed')
    }),
  ).rejects.toThrow('later participant failed')
  expect(await f.read()).toEqual({ kind: 'absent' })
  await f.storage.atomic(async unit => {
    expect(await f.state.participant.headIn(unit, authority, scope)).toEqual({
      kind: 'head',
      head: null,
    })
  })
  expect(await f.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
})
it('authorizes before lookup and replay, including a stored same-semantic operation', async () => {
  const f = await fixture()
  await f.write()
  await f.revoke()
  expect(await f.read()).toEqual({ failure: 'denied' })
  expect(await f.read({ ...operation, operationKey: 'absent' })).toEqual({ failure: 'denied' })
  await f.storage.atomic(async unit =>
    expect(
      await f.receipts.stageIn(unit, authority, 'semantic-1', {
        operation,
        position: 1,
        source: { ...scope, journalGeneration: 'unused', tail: 1 },
      }),
    ).toEqual({ failure: 'denied' }),
  )
})
it('rejects copied authority, a foreign principal and foreign Tenant without disclosing presence', async () => {
  const f = await fixture()
  await f.write()
  expect(await f.read(operation, {} as CoordinationAuthority)).toEqual({ failure: 'denied' })
  expect(await f.read({ ...operation, principal: 'other' })).toEqual({ failure: 'denied' })
  expect(
    await f.read({
      ...operation,
      tenant: unwrap(parseTenantId({ organization: 'other', account: 'owner' })),
    }),
  ).toEqual({ failure: 'denied' })
})
it('rejects a receipt source different from the actual staged log coordinate', async () => {
  const f = await fixture()
  await f.storage.atomic(async unit => {
    const receipt = await f.append(unit)
    expect(
      await f.receipts.stageIn(unit, authority, 'semantic-1', {
        ...receipt,
        source: { ...receipt.source, journalGeneration: 'forged' },
      }),
    ).toEqual({ failure: 'invalidInput' })
    expect(
      await f.receipts.stageIn(unit, authority, 'semantic-1', { ...receipt, position: 2 }),
    ).toEqual({ failure: 'invalidInput' })
  })
  expect(await f.read()).toEqual({ kind: 'absent' })
})
it('fails closed after shutdown and when the actual borrowed log owner stops', async () => {
  const f = await fixture()
  await f.write()
  f.stop()
  expect(await f.read()).toEqual({ failure: 'unavailable' })
  const g = await fixture()
  const receipt = await g.storage.atomic(unit => g.append(unit))
  await g.log.close()
  await g.storage.atomic(async unit =>
    expect(await g.receipts.stageIn(unit, authority, 'semantic-1', receipt)).toEqual({
      failure: 'unavailable',
    }),
  )
})
it('rejects a foreign actual StorageUnit and poisons that unit', async () => {
  const f = await fixture(),
    foreign = await fixture()
  await expect(
    foreign.storage.atomic(unit => f.receipts.readIn(unit, authority, operation)),
  ).rejects.toBeInstanceOf(StorageDefect)
})
it('does not execute untrusted getters at either operation or receipt boundaries', async () => {
  const f = await fixture()
  let calls = 0
  const ref = {
    ...operation,
    get operationKey() {
      calls++
      return 'input-1'
    },
  }
  expect(await f.read(ref)).toEqual({ failure: 'invalidInput' })
  await f.storage.atomic(async unit => {
    const receipt = await f.append(unit)
    const untrusted = {
      ...receipt,
      get position() {
        calls++
        return 1
      },
    }
    expect(await f.receipts.stageIn(unit, authority, 'semantic-1', untrusted)).toEqual({
      failure: 'invalidInput',
    })
  })
  expect(calls).toBe(0)
})
it('refuses new records at capacity but recognizes an existing identity', async () => {
  const f = await fixture(),
    bounded = createLocalOperationReceipts({ ...f.options, policy: { ...policy, maxRecords: 1 } })
  await f.write()
  await f.storage.atomic(async unit => {
    const receipt = await f.append(unit)
    expect(await bounded.stageIn(unit, authority, 'semantic-1', receipt)).toHaveProperty(
      'kind',
      'staged',
    )
    expect(
      await bounded.stageIn(unit, authority, 'semantic-2', {
        ...receipt,
        operation: { ...operation, operationKey: 'second' },
      }),
    ).toEqual({ failure: 'unavailable' })
  })
})
it('reports corrupt persisted receipts as a storage defect instead of absent or ordinary success', async () => {
  const f = await fixture()
  await f.write()
  await f.storage.write(tx =>
    tx.db.updateTable('sr_operation_receipt').set({ receipt: '{bad' }).execute(),
  )
  await expect(f.read()).rejects.toBeInstanceOf(StorageDefect)
})
it('keeps integer validation exact beyond the JavaScript safe integer range', async () => {
  const f = await fixture(),
    checked = readJsonStrict('9007199254740993')
  if ('failed' in checked) throw new Error('bad integer')
  await f.storage.atomic(async unit => {
    const receipt = await f.append(unit)
    expect(
      await f.receipts.stageIn(unit, authority, 'semantic-1', {
        ...receipt,
        position: checked.ok as Receipt['position'],
      }),
    ).toEqual({ failure: 'invalidInput' })
  })
})
it('commits log, state, qualification and receipt in the same original unit', async () => {
  const f = await fixture()
  const staged = await f.storage.atomic(async unit => {
    const receipt = await f.append(unit)
    const initialized = await f.state.participant.stageIn(unit, authority, scope, null, {
      kind: 'initialize',
      stepKey: 'create',
    })
    if ('failure' in initialized) throw new Error('state initialization failed')
    const qualified = await f.state.participant.stageIn(
      unit,
      authority,
      scope,
      initialized.head.revision,
      { kind: 'acceptInput', operation, semanticDigest: 'semantic-1', position: receipt.position },
    )
    if ('failure' in qualified) throw new Error('qualification failed')
    return f.receipts.stageIn(unit, authority, 'semantic-1', receipt)
  })
  expect(staged).toMatchObject({ kind: 'staged' })
  expect(await f.read()).toMatchObject({
    kind: 'present',
    receipt: { position: 1, source: { tail: 1 } },
  })
  await f.storage.atomic(async unit => {
    expect(await f.state.participant.headIn(unit, authority, scope)).toMatchObject({
      head: { revision: '1', run: null },
    })
    expect(await f.state.participant.pendingIn(unit, authority, scope, 4)).toEqual({
      kind: 'inputs',
      positions: [1],
    })
  })
  expect(await f.log.readSince(scope.session, 0)).toMatchObject({ tail: 1 })
})
it('recognizes the original receipt after the actual commit return is lost', async () => {
  const f = await fixture(),
    actual = f.storage.atomic.bind(f.storage)
  let loseReturn = true
  vi.spyOn(f.storage, 'atomic').mockImplementation(async action => {
    const result = await actual(action)
    if (loseReturn) {
      loseReturn = false
      throw new StorageUnavailable('original return lost')
    }
    return result
  })
  await expect(f.write()).rejects.toBeInstanceOf(StorageUnavailable)
  expect(await f.read()).toMatchObject({
    kind: 'present',
    semanticDigest: 'semantic-1',
    receipt: { position: 1, source: { tail: 1 } },
  })
  expect(await f.log.participant.source(logAuthority, scope)).toMatchObject({ source: { tail: 1 } })
})
it('distinguishes adjacent exact integers that Number would round to the same value', () => {
  const low = readJsonStrict('9007199254740992'),
    high = readJsonStrict('9007199254740993')
  if ('failed' in low || 'failed' in high) throw new Error('invalid exact integer')
  const source = checkSourceToken({ ...scope, journalGeneration: 'exact', tail: low.ok })
  if ('failure' in source) throw new Error('invalid source')
  expect(() => receiptValue({ operation, position: high.ok, source: source.ok }, policy)).toThrow(
    'invalid local session state input',
  )
  expect(receiptValue({ operation, position: low.ok, source: source.ok }, policy).position).toEqual(
    low.ok,
  )
})
it('bounds the whole stored record including its semantic digest', async () => {
  const f = await fixture()
  await f.storage.atomic(async unit =>
    expect(
      await f.receipts.stageIn(
        unit,
        authority,
        'x'.repeat(policy.maxRecordBytes),
        await f.append(unit),
      ),
    ).toEqual({ failure: 'invalidInput' }),
  )
  expect(await f.read()).toEqual({ kind: 'absent' })
})
