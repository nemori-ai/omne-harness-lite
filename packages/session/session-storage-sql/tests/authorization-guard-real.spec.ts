// @module-tag slow
import type {
  AuthorizationExpression,
  DurableEvidence,
  SessionCommand,
} from '@omne-harness/session-contract'
import { afterEach, expect, it } from 'vitest'
import {
  evidence,
  operationId,
  ordinaryInput,
  testingIntakeGuards,
} from '@omne-harness/session-contract/testing'
import {
  SESSION_LOG_PARTICIPANTS,
  sessionAuthorizationGuardFacts,
  sessionCommandFacts,
  sessionCommitCommands,
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

const consumer = (position: string) => ({
  owner: '@omne-harness/agent',
  work: 'run_1/execution',
  position,
})
const onceAt = (
  position: string,
  direction: AuthorizationExpression['direction'] = 'grant',
): AuthorizationExpression => ({
  scope: { kind: 'once', consumer: consumer(position), target: 'Shell#1', argumentsDigest: 'd' },
  direction,
  source: evidence(`decision/${position}/${direction}`),
})
const forGate = (
  capabilityId: string,
  direction: AuthorizationExpression['direction'] = 'grant',
  basis = 'rev-1',
): AuthorizationExpression => ({
  scope: { kind: 'session', capabilityId, enforcementKey: 'tool.run', basis },
  direction,
  source: evidence(`decision/${capabilityId}/${direction}/${basis}`),
})

async function open() {
  const app = await openRealApp({
    participants: [...SESSION_LOG_PARTICIPANTS, 'session-authorization-guard'],
  })
  apps.push(app)
  expect(await app.create(TENANT_A)).toHaveProperty('ok')
  return app
}

async function express(app: RealApp, expression: AuthorizationExpression, name: string) {
  const committed = await app.port.commit({
    access: app.access(TENANT_A),
    guards: [],
    command: {
      kind: 'change',
      input: {
        tenant: TENANT_A,
        session: app.access(TENANT_A).session,
        operation: operationId(name),
        declaration: {
          kind: 'authorization-expression',
          expression,
          authorization: evidence('authorization-expression-policy'),
        },
      },
    },
  })
  expect(committed, JSON.stringify(committed)).toHaveProperty('ok')
}

type Grant =
  | Readonly<{ kind: 'once'; position: string; source: DurableEvidence }>
  | Readonly<{ kind: 'session'; capabilityId: string; source: DurableEvidence }>

function acceptOn(app: RealApp, grant: Grant, name: string) {
  const accept: SessionCommand = {
    kind: 'accept',
    input: {
      tenant: TENANT_A,
      session: app.access(TENANT_A).session,
      operation: operationId(name),
      value: ordinaryInput(name),
    },
  }
  const held =
    grant.kind === 'once'
      ? { kind: 'once' as const, consumer: consumer(grant.position), source: grant.source }
      : {
          kind: 'session' as const,
          capabilityId: grant.capabilityId,
          enforcementKey: 'tool.run',
          source: grant.source,
        }
  return app.storage.commit({
    identity: identityOf(TENANT_A, app.domainOf(TENANT_A), name),
    ...app.combination,
    commands: [
      ...sessionCommitCommands([sessionCommandFacts(accept, testingIntakeGuards(accept))]),
      sessionAuthorizationGuardFacts({
        tenant: textOf(TENANT_A),
        session: 'session-1',
        grant: held,
      }),
    ],
  })
}

const refused = {
  kind: 'rolled_back',
  responses: expect.arrayContaining([
    {
      participant: 'session-authorization-guard',
      protocol: '1',
      reply: { kind: 'conflict', basis: { reason: 'session-authorization-changed' } },
    },
  ]),
}
const accepted = { kind: 'committed' }

it('refuses the acceptance once the session authorization it rests on is revoked, and leaves the Session as it was', async () => {
  const app = await open()
  const granted = forGate('Shell')
  await express(app, granted, 'grant-shell')
  const grant = { kind: 'session', capabilityId: 'Shell', source: granted.source } as const
  await express(app, forGate('Shell', 'revoke'), 'revoke-shell')
  const before = await app.port.readWork(app.access(TENANT_A))
  expect(await acceptOn(app, grant, 'after-revoke')).toMatchObject(refused)
  expect(await app.port.readWork(app.access(TENANT_A))).toEqual(before)
}, 30_000)

it('refuses the acceptance once the gate is authorized again by another answer', async () => {
  const app = await open()
  const granted = forGate('Shell')
  await express(app, granted, 'grant-shell')
  await express(app, forGate('Shell', 'grant', 'rev-2'), 'grant-shell-again')
  const grant = { kind: 'session', capabilityId: 'Shell', source: granted.source } as const
  expect(await acceptOn(app, grant, 'after-regrant')).toMatchObject(refused)
}, 30_000)

it('refuses the acceptance once the once authorization it rests on leaves the current state', async () => {
  const app = await open()
  const granted = onceAt('step-1/tool/0')
  await express(app, granted, 'grant-once')
  await express(app, onceAt('step-1/tool/0', 'revoke'), 'revoke-once')
  const grant = { kind: 'once', position: 'step-1/tool/0', source: granted.source } as const
  expect(await acceptOn(app, grant, 'after-exit')).toMatchObject(refused)
}, 30_000)

it('accepts while the authorization holds, whatever else the session authorizes meanwhile', async () => {
  const app = await open()
  const shell = forGate('Shell')
  const step = onceAt('step-1/tool/0')
  await express(app, shell, 'grant-shell')
  await express(app, step, 'grant-once')
  await express(app, forGate('Files'), 'grant-files')
  await express(app, onceAt('step-1/tool/1'), 'grant-other-once')
  await express(app, forGate('Web', 'revoke'), 'revoke-web')
  const onShell = { kind: 'session', capabilityId: 'Shell', source: shell.source } as const
  const onStep = { kind: 'once', position: 'step-1/tool/0', source: step.source } as const
  expect(await acceptOn(app, onShell, 'on-shell')).toMatchObject(accepted)
  expect(await acceptOn(app, onStep, 'on-step')).toMatchObject(accepted)
}, 30_000)
