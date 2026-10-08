import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations-local'
import type {
  ActionReport,
  GovernanceClientOperations,
  GovernanceUse,
} from '@omne-harness-lite/governance-client-operations'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  parseAccountId,
  parseLoginStateId,
  parseTenantId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import {
  createLocalAdmission,
  admissionMigrations,
  admissionUseMigrations,
  type AdmissionSource,
  type AdmissionTarget,
} from '@omne-harness-lite/session-runtime-local'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import { createSessionAdmissionProbe } from '../src/session-admission-probe.ts'

const current = 'capability.organization-governance/v2#S-36',
  membership = 'capability.organization-governance/v2#S-26'
const centerId = 'a'.repeat(32),
  otherCenterId = 'b'.repeat(32)
if (!isGovernanceCenterId(centerId) || !isGovernanceCenterId(otherCenterId))
  throw new Error('bad fixture center')
const source: AdmissionSource = {
  centerId,
  accountId: unwrap(parseAccountId('owner')),
  loginStateHandle: unwrap(parseLoginStateId('login-1')),
}
const tenant = unwrap(parseTenantId({ organization: 'team-a', account: 'owner' }))
const target: AdmissionTarget = {
  tenant,
  session: null,
  purpose: 'createSession',
  operationKey: 'create-1',
  inputPosition: null,
}
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

function report(operation: string, result: unknown): ActionReport {
  const data = { operation, reply: { result } }
  return {
    format: 'governance-client/1',
    actionId: 'probe-action',
    action: 'invoke',
    operation,
    origin: source,
    admission: { status: 'admitted' },
    remote: { status: 'success', stage: 'operation', sendAttempted: true, reply: data },
    local: { status: 'installed' },
    view: { source: 'online', data },
    use: 'active',
  }
}
function controlled(
  reports = [
    report(current, tenant),
    report(membership, { standing: 'effective', role: 'member' }),
  ],
) {
  const run = vi.fn<GovernanceUse['run']>()
  for (const value of reports) run.mockResolvedValueOnce(value)
  const close = vi.fn(async () => {})
  const use: GovernanceUse = { run, close, runPrepared: vi.fn() }
  const openUse = vi.fn<GovernanceClientOperations['openUse']>(async () => ({
    kind: 'use',
    use,
    origin: source,
  }))
  const client: GovernanceClientOperations = {
    openUse,
    runAction: vi.fn(),
    runPrepared: vi.fn(),
    close: vi.fn(),
  }
  return {
    client,
    use,
    run,
    close,
    openUse,
    probe: createSessionAdmissionProbe(client, source, tenant),
  }
}
it('uses fresh online login and membership observations for a new Session and closes only its own use', async () => {
  const f = controlled()
  expect(await f.probe.verify(source, target)).toEqual({ kind: 'memberValid', role: 'member' })
  expect(f.run.mock.calls).toEqual([
    [{ action: 'invoke', operation: current, payload: {}, readMode: 'refresh' }],
    [{ action: 'invoke', operation: membership, payload: { tenant }, readMode: 'refresh' }],
  ])
  expect(f.close).toHaveBeenCalledTimes(1)
  expect(f.client.close).not.toHaveBeenCalled()
  expect(f.client.runAction).not.toHaveBeenCalled()
})
it('checks only login for a new Run without reinterpreting the existing Session owner', async () => {
  const f = controlled([report(current, { ...tenant, organization: 'other-selected-team' })])
  expect(
    await f.probe.verify(source, {
      ...target,
      purpose: 'startRun',
      session: 'session-a',
      inputPosition: '1',
    }),
  ).toEqual({ kind: 'valid' })
  expect(f.run).toHaveBeenCalledTimes(1)
})
it.each(['center', 'account', 'handle', 'tenant'] as const)(
  'rejects a %s binding mismatch before opening a client use',
  async field => {
    const f = controlled()
    const candidate =
      field === 'center'
        ? { ...source, centerId: otherCenterId }
        : field === 'account'
          ? { ...source, accountId: unwrap(parseAccountId('other')) }
          : field === 'handle'
            ? { ...source, loginStateHandle: unwrap(parseLoginStateId('other')) }
            : source
    const requested =
      field === 'tenant'
        ? { ...target, tenant: unwrap(parseTenantId({ ...tenant, organization: 'other' })) }
        : target
    expect(await f.probe.verify(candidate, requested)).toEqual({ kind: 'unavailable' })
    expect(f.openUse).not.toHaveBeenCalled()
  },
)
it('refuses an opened use belonging to a different login without governance IO', async () => {
  const f = controlled()
  f.openUse.mockResolvedValueOnce({
    kind: 'use',
    use: f.use,
    origin: { ...source, loginStateHandle: 'other' },
  })
  expect(await f.probe.verify(source, target)).toEqual({ kind: 'unavailable' })
  expect(f.run).not.toHaveBeenCalled()
  expect(f.close).toHaveBeenCalledTimes(1)
})
it('keeps member rejection distinct from login rejection', async () => {
  const f = controlled([report(current, tenant), report(membership, { standing: 'ineffective' })])
  expect(await f.probe.verify(source, target)).toEqual({ kind: 'memberRejected' })
})
it('records only an explicit original login rejection as rejected', async () => {
  const value = report(current, tenant)
  const f = controlled([
    {
      ...value,
      remote: {
        status: 'rejected',
        stage: 'identity',
        sendAttempted: true,
        answer: 'login-state-rejected',
      },
      view: { source: 'none' },
    },
  ])
  expect(await f.probe.verify(source, target)).toEqual({ kind: 'rejected' })
  expect(f.run).toHaveBeenCalledTimes(1)
  expect(f.close).toHaveBeenCalledTimes(1)
})
it('does not approve creation in a different current tenant or reinterpret it as a member rejection', async () => {
  const f = controlled([
    report(current, { ...tenant, organization: 'other' }),
    report(membership, { standing: 'effective', role: 'member' }),
  ])
  expect(await f.probe.verify(source, target)).toEqual({ kind: 'unavailable' })
})
it('returns unavailable when the actual client cannot open a use', async () => {
  const f = controlled()
  f.openUse.mockResolvedValueOnce({ kind: 'blocked', reason: 'identity-unavailable' })
  expect(await f.probe.verify(source, target)).toEqual({ kind: 'unavailable' })
  expect(f.run).not.toHaveBeenCalled()
  expect(f.close).not.toHaveBeenCalled()
})
it('does not return a valid observation before the original use close really finishes', async () => {
  const f = controlled()
  let finish!: () => void,
    entered!: () => void,
    settled = false
  const started = new Promise<void>(resolve => {
    entered = resolve
  })
  const closed = new Promise<void>(resolve => {
    finish = resolve
  })
  f.close.mockImplementation(async () => {
    entered()
    await closed
  })
  const pending = f.probe.verify(source, target).then(result => {
    settled = true
    return result
  })
  await started
  expect(settled).toBe(false)
  finish()
  expect(await pending).toEqual({ kind: 'memberValid', role: 'member' })
})
it.each(['copy', 'unknown', 'unavailable'] as const)(
  'does not approve a %s observation',
  async kind => {
    const value = report(current, tenant)
    const changed: ActionReport =
      kind === 'copy'
        ? { ...value, view: { ...value.view, source: 'copy' } }
        : { ...value, remote: { ...value.remote, status: kind }, view: { source: 'none' } }
    const f = controlled([changed])
    expect(await f.probe.verify(source, target)).toEqual({ kind: 'unavailable' })
    expect(f.close).toHaveBeenCalledTimes(1)
  },
)
it('preserves both original work and use-close failures instead of granting approval', async () => {
  const f = controlled(),
    work = new Error('original read failed'),
    close = new Error('original close failed')
  f.run.mockReset().mockRejectedValueOnce(work)
  f.close.mockRejectedValueOnce(close)
  await expect(f.probe.verify(source, target)).rejects.toMatchObject({ errors: [work, close] })
})

async function actual() {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'omne-session-probe-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const state = await openClientLocalState(
    { directory: join(root, 'auth') },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  cleanup.push(() => state.close())
  const snapshot = await state.read()
  if (snapshot.kind !== 'read') throw new Error('fixture state unavailable')
  const installed = await state.compareAndReplace(
    snapshot.snapshot.token,
    {
      center: { centerId, endpoint: 'https://center.invalid/', trust: { mode: 'ca' } },
      login: {
        presentation: 'protected-fixture-login',
        handle: source.loginStateHandle,
        accountId: source.accountId,
      },
      cache: [],
    },
    randomUUID(),
  )
  if (installed.kind !== 'installed') throw new Error('fixture login not installed')
  const mode = { loginRejected: false, memberEffective: true }
  const exchange = vi.fn(async (_options: unknown, input: unknown): Promise<GovernanceOutcome> => {
    if (mode.loginRejected)
      return { kind: 'entry-answer', answer: 'login-state-rejected', sendAttempted: true }
    const operation = (input as { operation: string }).operation
    return {
      kind: 'reply',
      sendAttempted: true,
      reply: {
        result:
          operation === current
            ? tenant
            : mode.memberEffective
              ? { standing: 'effective', role: 'member' }
              : { standing: 'ineffective' },
      },
    }
  })
  const client = createGovernanceClient({
    state,
    transport: {
      readPublicHealth: async () => ({
        kind: 'health',
        reply: { reachable: true, centerId, version: 'fixture' },
      }),
      exchangeGovernance: exchange,
    },
  })
  cleanup.push(() => client.close())
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(root, 'root.sqlite'),
    synchronous: 'full',
  })
  cleanup.push(() => storage.close())
  const tenantStorage = await openStorage({
    dialect: 'sqlite',
    file: join(root, 'tenant.sqlite'),
    synchronous: 'full',
  })
  cleanup.push(() => tenantStorage.close())
  for (const fragment of admissionMigrations)
    await storage.write(tx => fragment.migration.up(tx.db))
  for (const fragment of admissionUseMigrations)
    await tenantStorage.write(tx => fragment.migration.up(tx.db))
  return { client, mode, exchange, storage, tenantStorage }
}
async function admission(f: Awaited<ReturnType<typeof actual>>, client = f.client) {
  const owner = await createLocalAdmission(
    f.storage,
    createSessionAdmissionProbe(client, source, tenant),
    { maxLogins: 8, maxTickets: 16, maxRecordBytes: 4096 },
  )
  cleanup.push(() => owner.close().catch(() => undefined))
  return owner
}
it('connects actual CG and CLS observations to durable G28 and keeps a later login denial as the root barrier', async () => {
  const f = await actual(),
    owner = await admission(f)
  const created = await owner.reserve(source, target)
  expect((await owner.query(created.ticket)).state).toBe('ready')
  expect(
    await owner.consume(created.ticket, f.tenantStorage, async () => 'original-create'),
  ).toEqual({ kind: 'consumed', receipt: 'original-create' })
  f.exchange.mockClear()
  const runTarget: AdmissionTarget = {
    ...target,
    purpose: 'startRun',
    session: 'session-a',
    operationKey: 'run-1',
    inputPosition: '1',
  }
  const run = await owner.reserve(source, runTarget)
  expect((await owner.query(run.ticket)).state).toBe('ready')
  expect(
    f.exchange.mock.calls.map(([, value]) => (value as { operation: string }).operation),
  ).toEqual([current])
  await owner.consume(run.ticket, f.tenantStorage, async () => 'original-run')
  f.mode.loginRejected = true
  const denied = await owner.reserve(source, { ...runTarget, operationKey: 'run-2' })
  const next = await owner.reserve(source, { ...runTarget, operationKey: 'run-3' })
  expect((await owner.query(denied.ticket)).state).toBe('rejected')
  const calls = f.exchange.mock.calls.length
  expect((await owner.query(next.ticket)).state).toBe('rejected')
  await expect(owner.reserve(source, { ...runTarget, operationKey: 'run-4' })).rejects.toThrow(
    'denied',
  )
  expect(f.exchange).toHaveBeenCalledTimes(calls)
  await owner.close()
  const reopened = await admission(f)
  expect((await reopened.read(denied.ticket)).state).toBe('rejected')
  expect((await reopened.query(next.ticket)).state).toBe('rejected')
  expect(f.exchange).toHaveBeenCalledTimes(calls)
})
it('persists actual member rejection without poisoning the login and allows a later effective observation', async () => {
  const f = await actual(),
    owner = await admission(f)
  f.mode.memberEffective = false
  const denied = await owner.reserve(source, target)
  expect((await owner.query(denied.ticket)).state).toBe('memberRejected')
  expect(
    await f.storage.read(tx => tx.db.selectFrom('sr_admission_login').select('state').execute()),
  ).toEqual([{ state: 'allowed' }])
  f.mode.memberEffective = true
  const next = await owner.reserve(source, { ...target, operationKey: 'create-2' })
  expect((await owner.query(next.ticket)).state).toBe('ready')
})
it('retains original querying after actual use-close failure and sends no retry or later query', async () => {
  const f = await actual()
  const client: GovernanceClientOperations = {
    ...f.client,
    openUse: async () => {
      const opened = await f.client.openUse()
      if (opened.kind !== 'use') return opened
      return {
        ...opened,
        use: {
          run: opened.use.run.bind(opened.use),
          runPrepared: opened.use.runPrepared.bind(opened.use),
          close: async () => {
            await opened.use.close()
            throw new Error('actual close proof failed')
          },
        },
      }
    },
  }
  const owner = await admission(f, client),
    first = await owner.reserve(source, target)
  await expect(owner.query(first.ticket)).rejects.toThrow('actual close proof failed')
  expect((await owner.read(first.ticket)).state).toBe('querying')
  const calls = f.exchange.mock.calls.length
  expect((await owner.query(first.ticket)).state).toBe('querying')
  const next = await owner.reserve(source, { ...target, operationKey: 'create-2' })
  expect((await owner.query(next.ticket)).state).toBe('waiting')
  expect(f.exchange).toHaveBeenCalledTimes(calls)
})
