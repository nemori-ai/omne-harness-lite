// Real SQLite Workers and original execution records. Agent fact bodies are fixtures;
// the real Agent Journal mapping is checked by the application's qualification test.
import { afterEach, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { evidence, operationId, ordinaryInput } from '@omne-harness/session-contract/testing'
import {
  SESSION_LOG_PARTICIPANTS,
  executionRecordFacts,
  sessionCommandFacts,
  sessionCommitCommands,
} from '../src/participants.ts'
import { executionCurrentGuardFacts, SESSION_EXECUTION_GUARD } from '../src/execution-current.ts'
import {
  identityOf,
  jointWrite,
  openRealApp,
  TENANT_A,
  TENANT_B,
  textOf,
  type RealApp,
} from './fixtures/real-provider.ts'

const apps: RealApp[] = []
afterEach(async () => {
  for (const app of apps.splice(0).reverse()) await app.dispose()
})
const participants = [...SESSION_LOG_PARTICIPANTS, 'session-execution-guard']
const current = {
  tenant: textOf(TENANT_A),
  session: 'session-1',
  execution: 'exe_1',
  revision: '1',
}

function publication(revision: string, expected: string | null, published: string) {
  return executionRecordFacts(
    jointWrite({
      revision,
      expected,
      published,
      operation: `publish-${revision}`,
      digest: `fixture:${revision}`,
      boundaries: [
        {
          execution: 'exe_1',
          revision,
          receipt: evidence(`execution-${revision}`),
          emittedThrough: '0',
          ended: null,
        },
      ],
    }),
  )
}
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
async function open() {
  const app = await openRealApp({ participants })
  apps.push(app)
  expect(await app.create(TENANT_A)).toHaveProperty('ok')
  expect(await commit(app, 'publish-first', [publication('1', null, '0')])).toHaveProperty(
    'kind',
    'committed',
  )
  return app
}

it('checks the original execution without publication and keeps the owner check after reopening', async () => {
  const app = await open()
  const before = await app.port.readWork(app.access(TENANT_A))
  const database = new DatabaseSync(app.domainFile(app.domainOf(TENANT_A)), { readOnly: true })
  try {
    const plans = database
      .prepare(
        'EXPLAIN QUERY PLAN SELECT revision FROM er_execution WHERE tenant = ? AND execution = ? AND session = ? LIMIT 1',
      )
      .all(current.tenant, current.execution, current.session)
    const detail = plans.map(row => String(row['detail'])).join('\n')
    expect(detail).toContain('SEARCH er_execution')
    expect(detail).toContain('tenant=? AND execution=?')
    expect(detail).not.toContain('SCAN')
  } finally {
    database.close()
  }
  const checked = await commit(app, 'read-current', [executionCurrentGuardFacts(current)])
  expect(checked).toMatchObject({
    kind: 'committed',
    responses: expect.arrayContaining([
      {
        participant: SESSION_EXECUTION_GUARD,
        protocol: '1',
        reply: { kind: 'participated', response: current },
      },
    ]),
  })
  expect(await app.port.readWork(app.access(TENANT_A))).toEqual(before)
  await app.close()
  const reopened = await openRealApp({ root: app.root, participants })
  apps.push(reopened)
  expect(
    await commit(reopened, 'current-after-reopen', [executionCurrentGuardFacts(current)]),
  ).toHaveProperty('kind', 'committed')
  expect(await reopened.port.readWork(reopened.access(TENANT_A))).toEqual(before)
}, 30_000)

it('rolls back a coupled input on stale or wrong-owner evidence, including an execution change in the same commit', async () => {
  const app = await open()
  const originalReceipt = await commit(app, 'original-check', [executionCurrentGuardFacts(current)])
  expect(originalReceipt).toHaveProperty('kind', 'committed')
  const before = await app.port.readWork(app.access(TENANT_A))
  for (const [index, request] of [
    { ...current, revision: '0' },
    { ...current, session: 'another' },
    { ...current, tenant: textOf(TENANT_B) },
    { ...current, execution: 'missing' },
  ].entries()) {
    const result = await commit(app, `wrong-${index}`, [
      acceptance(app, `wrong-${index}`),
      executionCurrentGuardFacts(request),
    ])
    expect(result).toHaveProperty('kind', 'rolled_back')
    expect(await app.port.readWork(app.access(TENANT_A))).toEqual(before)
  }
  const inBatch = await commit(app, 'changed-in-batch', [
    publication('2', '1', '1'),
    acceptance(app, 'changed-in-batch'),
    executionCurrentGuardFacts(current),
  ])
  expect(inBatch).toHaveProperty('kind', 'rolled_back')
  expect(await app.port.readWork(app.access(TENANT_A))).toEqual(before)
  expect(await commit(app, 'still-original', [executionCurrentGuardFacts(current)])).toHaveProperty(
    'kind',
    'committed',
  )
  expect(await commit(app, 'advance', [publication('2', '1', '1')])).toHaveProperty(
    'kind',
    'committed',
  )
  const advanced = await app.port.readWork(app.access(TENANT_A))
  expect(await commit(app, 'original-check', [executionCurrentGuardFacts(current)])).toEqual(
    originalReceipt,
  )
  expect(
    await commit(app, 'stale', [acceptance(app, 'stale'), executionCurrentGuardFacts(current)]),
  ).toHaveProperty('kind', 'rolled_back')
  expect(await app.port.readWork(app.access(TENANT_A))).toEqual(advanced)
  expect(
    await commit(app, 'fresh', [
      acceptance(app, 'fresh'),
      executionCurrentGuardFacts({ ...current, revision: '2' }),
    ]),
  ).toHaveProperty('kind', 'committed')
  expect(await commit(app, 'read-current', [executionCurrentGuardFacts(current)])).toHaveProperty(
    'kind',
    'rolled_back',
  )
}, 30_000)
