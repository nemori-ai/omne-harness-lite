// session.run-live 守卫：真实 sqlite-provider 与真实 Session 提交。守卫与一条 Session 写入放进
// 同一笔提交，守卫拒绝时整笔回滚，Session 的工作快照不变。
import { afterEach, expect, it, vi } from 'vitest'
import { operationId, ordinaryInput, sessionId } from '@omne-harness/session-contract/testing'
import {
  SESSION_LOG_PARTICIPANTS,
  SESSION_RUN_LIVE_FACT,
  SESSION_RUN_LIVE_GUARD,
  runLiveGuardFacts,
  sessionCommandFacts,
  sessionCommitCommands,
} from '../src/participants.ts'
import { sessionStorageMaterials } from '../src/materials.ts'
import guard from '../src/worker/run-live-guard.ts'
import {
  activeRun,
  cancelRun,
  identityOf,
  openRealApp,
  startRun,
  TENANT_A,
  TENANT_B,
  textOf,
  workOf,
  type RealApp,
} from './fixtures/real-provider.ts'

const apps: RealApp[] = []
afterEach(async () => {
  for (const app of apps.splice(0).reverse()) await app.dispose()
})
const participants = [...SESSION_LOG_PARTICIPANTS, SESSION_RUN_LIVE_GUARD]

function commit(
  app: RealApp,
  name: string,
  commands: Parameters<RealApp['storage']['commit']>[0]['commands'],
) {
  return app.storage.commit({
    identity: identityOf(TENANT_A, app.domainOf(TENANT_A), name),
    ...app.combination,
    commands: sessionCommitCommands(commands),
  })
}
/** 一条普通输入的受理，作为与守卫同笔提交的 Session 写入。 */
function acceptance(app: RealApp, name: string) {
  return sessionCommandFacts(
    {
      kind: 'accept',
      input: {
        tenant: TENANT_A,
        session: app.access(TENANT_A).session,
        operation: operationId(name),
        value: ordinaryInput(name),
      },
    },
    [],
  )
}
/** 会话 session-1 带一个进行中的 Run。 */
async function live() {
  const app = await openRealApp({ participants })
  apps.push(app)
  expect(await app.create(TENANT_A)).toHaveProperty('ok')
  expect(await app.accept(TENANT_A, 'session-1', 'input-1')).toHaveProperty('ok')
  expect(await startRun(app, 'start-run-1')).toHaveProperty('ok')
  const { run } = activeRun(await workOf(app))
  return { app, run, request: { tenant: textOf(TENANT_A), session: 'session-1', run } }
}
function archive(app: RealApp) {
  return app.port.commit({
    access: app.access(TENANT_A),
    command: {
      kind: 'control',
      input: {
        tenant: TENANT_A,
        session: sessionId('session-1'),
        operation: operationId('archive-1'),
        intent: { kind: 'archive' },
      },
    },
    guards: [],
  })
}

it('declares a read-only participant over the Session state rows that provides the run-live fact', () => {
  const material = sessionStorageMaterials({ readOutputLimitBytes: 1048576 }).participants.find(
    value => value.participant === SESSION_RUN_LIVE_GUARD,
  )
  expect(material).toMatchObject({
    protocol: '1',
    ownedTables: [],
    readTables: ['sl_journal', 'sl_state', 'sl_state_item'],
    requiresFacts: [],
    providesFacts: [SESSION_RUN_LIVE_FACT],
  })
  expect(SESSION_RUN_LIVE_FACT).toEqual({ key: 'session.run-live', protocol: '1' })
})

it.each([{}, { request: {} }, { request: { tenant: 't', session: 's', run: '' } }])(
  'rejects malformed input before reading or providing facts: %j',
  facts => {
    const execute = vi.fn(() => {
      throw new Error('must not query')
    })
    const provideFact = vi.fn()
    expect(guard.execute(facts, { execute, provideFact, requireFact: () => null })).toMatchObject({
      kind: 'unsupported',
    })
    expect(provideFact).not.toHaveBeenCalled()
  },
)

it('provides the exact run-live fact only after the state head shows the live Run', () => {
  const request = { tenant: 'tenant', session: 'session', run: 'run-1' }
  const head = JSON.stringify({ lifecycle: 'active', run: { kind: 'active', run: 'run-1' } })
  const execute = vi.fn(() => ({
    columns: ['snapshot', 'covered', 'tail'],
    rows: [[head, 3n, 3n]],
    changes: 0n,
    lastInsertRowid: null,
  }))
  const provideFact = vi.fn()
  expect(
    guard.execute(runLiveGuardFacts(request).facts, {
      execute,
      provideFact,
      requireFact: () => null,
    }),
  ).toEqual({ kind: 'participated', response: request })
  expect(execute).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('FROM sl_journal j'), [
    'tenant',
    'session',
  ])
  expect(provideFact).toHaveBeenCalledExactlyOnceWith(SESSION_RUN_LIVE_FACT, request)
})

it('provides the fact for the live Run and lets a coupled Session write commit', async () => {
  const { app, request } = await live()
  const checked = await commit(app, 'check-live', [runLiveGuardFacts(request)])
  expect(checked).toMatchObject({
    kind: 'committed',
    responses: expect.arrayContaining([
      {
        participant: SESSION_RUN_LIVE_GUARD,
        protocol: '1',
        reply: { kind: 'participated', response: request },
      },
    ]),
  })
  expect(
    await commit(app, 'coupled-live', [
      acceptance(app, 'coupled-live'),
      runLiveGuardFacts(request),
    ]),
  ).toHaveProperty('kind', 'committed')
}, 30_000)

it('rejects another Run, another session or tenant, and rolls back the coupled write', async () => {
  const { app, request } = await live()
  const before = await workOf(app)
  for (const [index, wrong] of [
    { ...request, run: 'run-other' },
    { ...request, session: 'session-other' },
    { ...request, tenant: textOf(TENANT_B) },
  ].entries()) {
    const name = `wrong-${index}`
    const result = await commit(app, name, [acceptance(app, name), runLiveGuardFacts(wrong)])
    expect(result).toMatchObject({
      kind: 'rolled_back',
      responses: expect.arrayContaining([
        expect.objectContaining({
          participant: SESSION_RUN_LIVE_GUARD,
          reply: { kind: 'conflict', basis: expect.any(Object) },
        }),
      ]),
    })
    expect(await workOf(app)).toEqual(before)
  }
}, 30_000)

it('rejects after the Run is cancelled and its terminal is committed', async () => {
  const { app, run, request } = await live()
  expect(await cancelRun(app, run, 'cancel-1')).toHaveProperty('ok')
  const before = await workOf(app)
  expect(before.run.kind).toBe('terminal')
  const result = await commit(app, 'after-cancel', [
    acceptance(app, 'after-cancel'),
    runLiveGuardFacts(request),
  ])
  expect(result).toMatchObject({
    kind: 'rolled_back',
    responses: expect.arrayContaining([
      expect.objectContaining({
        participant: SESSION_RUN_LIVE_GUARD,
        reply: { kind: 'conflict', basis: { reason: 'run-not-live' } },
      }),
    ]),
  })
  expect(await workOf(app)).toEqual(before)
}, 30_000)

it('rejects after the session is archived, and the whole commit rolls back', async () => {
  const { app, request } = await live()
  expect(await archive(app)).toHaveProperty('ok')
  const before = await workOf(app)
  expect(before.lifecycle).toBe('archived')
  const result = await commit(app, 'after-archive', [runLiveGuardFacts(request)])
  expect(result).toMatchObject({
    kind: 'rolled_back',
    responses: expect.arrayContaining([
      expect.objectContaining({
        participant: SESSION_RUN_LIVE_GUARD,
        reply: { kind: 'conflict', basis: { reason: 'session-archived' } },
      }),
    ]),
  })
  expect(await workOf(app)).toEqual(before)
}, 30_000)
