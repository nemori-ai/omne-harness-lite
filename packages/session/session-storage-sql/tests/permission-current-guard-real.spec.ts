// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import { evidence, operationId, ordinaryInput } from '@omne-harness/session-contract/testing'
import {
  SESSION_LOG_PARTICIPANTS,
  decodeSessionPermissionCurrent,
  sessionCommandFacts,
  sessionCommitCommands,
  sessionPermissionGuardFacts,
  type SessionPermissionCurrent,
} from '../src/participants.ts'
import {
  identityOf,
  openRealApp,
  TENANT_A,
  textOf,
  type RealApp,
} from './fixtures/real-provider.ts'

const apps: RealApp[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
})

async function open() {
  const app = await openRealApp({
    participants: [...SESSION_LOG_PARTICIPANTS, 'session-permission-guard'],
  })
  apps.push(app)
  expect(await app.create(TENANT_A)).toHaveProperty('ok')
  return app
}

async function read(app: RealApp): Promise<SessionPermissionCurrent> {
  const result = await app.storage.read({
    domain: {
      scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
      transactionDomain: app.domainOf(TENANT_A),
    },
    requestKey: 'permission-guard-current',
    handler: 'session.permission-current',
    protocol: '1',
    input: {
      tenant: textOf(TENANT_A),
      session: 'session-1',
      capabilityId: 'calendar',
      enforcementKey: 'create',
    },
  })
  if (result.kind !== 'read') throw new Error(JSON.stringify(result))
  const current = decodeSessionPermissionCurrent(result.output)
  if (current === 'malformed' || current.kind !== 'current')
    throw new Error(JSON.stringify(current))
  return current
}

function capture(app: RealApp, current: SessionPermissionCurrent, name: string) {
  return app.storage.commit({
    identity: identityOf(TENANT_A, app.domainOf(TENANT_A), name),
    ...app.combination,
    commands: [
      ...sessionCommitCommands([
        sessionCommandFacts(
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
        ),
      ]),
      sessionPermissionGuardFacts(current),
    ],
  })
}

function changeMode(app: RealApp, name: string, value: 'never' | 'auto_permission') {
  return app.port.commit({
    access: app.access(TENANT_A),
    guards: [],
    command: {
      kind: 'change',
      input: {
        tenant: TENANT_A,
        session: app.access(TENANT_A).session,
        operation: operationId(name),
        declaration: {
          kind: 'permission-mode',
          value,
          authorization: evidence('mode-policy-fixture'),
        },
      },
    },
  })
}

it('rejects a pre-read revision after a mode change and rolls back the coupled Session input', async () => {
  const app = await open()
  const prior = await read(app)
  expect(await changeMode(app, 'deny-mode', 'never')).toHaveProperty('ok')
  const before = await app.port.readWork(app.access(TENANT_A))
  const stale = await capture(app, prior, 'stale-capture')
  expect(stale).toMatchObject({
    kind: 'rolled_back',
    responses: expect.arrayContaining([
      {
        participant: 'session-permission-guard',
        protocol: '1',
        reply: { kind: 'conflict', basis: { reason: 'session-permission-changed' } },
      },
    ]),
  })
  expect(await app.port.readWork(app.access(TENANT_A))).toEqual(before)
  const current = await read(app)
  const fresh = await capture(app, current, 'fresh-capture')
  expect(fresh, JSON.stringify(fresh)).toMatchObject({
    kind: 'committed',
    responses: expect.arrayContaining([
      {
        participant: 'session-permission-guard',
        protocol: '1',
        reply: { kind: 'participated', response: current },
      },
    ]),
  })
  expect(await app.port.readWork(app.access(TENANT_A))).not.toEqual(before)
}, 30_000)

it('keeps ordinary intake from invalidating permissions but rejects an ABA mode change', async () => {
  const app = await open()
  const prior = await read(app)
  expect(await app.accept(TENANT_A, 'session-1', 'unrelated')).toHaveProperty('ok')
  expect(await capture(app, prior, 'unchanged-permission')).toMatchObject({ kind: 'committed' })
  expect(await changeMode(app, 'never-mode', 'never')).toHaveProperty('ok')
  expect(await changeMode(app, 'auto-mode', 'auto_permission')).toHaveProperty('ok')
  expect(await capture(app, prior, 'aba-capture')).toMatchObject({ kind: 'rolled_back' })
}, 30_000)

it('does not accept a missing Session or a mismatched original source at the same revision', async () => {
  const app = await open()
  const prior = await read(app)
  const before = await app.port.readWork(app.access(TENANT_A))
  for (const [name, current] of [
    ['missing-session', { ...prior, session: 'missing' }],
    ['missing-tenant', { ...prior, tenant: 'other-tenant' }],
    ['wrong-source', { ...prior, source: { ...prior.source, record: 'other-record' } }],
  ] as const)
    expect(await capture(app, current, name)).toMatchObject({ kind: 'rolled_back' })
  expect(await app.port.readWork(app.access(TENANT_A))).toEqual(before)
}, 30_000)
