// @module-tag slow
// Real SQLite Workers exercise the declared transaction combination.
import { afterEach, expect, it } from 'vitest'
import { sessionCommitCommands } from '../src/participants.ts'
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

it('requires a Session-owned commit basis even for a raw ordinary query', async () => {
  const app = await openRealApp()
  apps.push(app)
  expect(await app.create(TENANT_A)).toHaveProperty('ok')
  const answer = await app.storage.commit({
    identity: identityOf(TENANT_A, app.domainOf(TENANT_A), 'raw-without-basis'),
    ...app.combination,
    commands: [
      {
        participant: 'session',
        facts: {
          intent: 'query',
          tenant: textOf(TENANT_A),
          session: 'session-1',
          operation: 'sop_create-session-1',
        },
      },
    ],
  })
  expect(answer).toMatchObject({
    kind: 'rejected_before_accept',
    reason: 'participant_dependency_missing',
  })
}, 30_000)

it.each([
  ['command', { operation: 'another-operation' }],
  ['guard', { guards: [{ participant: 'login', record: 'another-guard' }] }],
  ['evidence', { evidence: { owner: 'other', record: 'other', revision: '1' } }],
  ['budget', { intakeLimits: { pendingInputs: 1 } }],
] as const)(
  'rejects a %s changed after its ordinary basis was formed',
  async (_, change) => {
    const app = await openRealApp()
    apps.push(app)
    expect(await app.create(TENANT_A)).toHaveProperty('ok')
    const original = {
      participant: 'session',
      facts: {
        intent: 'query',
        tenant: textOf(TENANT_A),
        session: 'session-1',
        operation: 'sop_create-session-1',
      },
    }
    const commands = sessionCommitCommands([original]).map(command =>
      command.participant === 'session'
        ? { ...command, facts: { ...command.facts, ...change } }
        : command,
    )
    const answer = await app.storage.commit({
      identity: identityOf(TENANT_A, app.domainOf(TENANT_A), `mismatch-${_}`),
      ...app.combination,
      commands,
    })
    expect(answer.kind).toBe('rolled_back')
    if (answer.kind !== 'rolled_back') throw new Error(`unexpected ${answer.kind}`)
    expect(answer.responses.find(entry => entry.participant === 'session')?.reply).toEqual({
      kind: 'unsupported',
      basis: { reason: 'Session commit basis mismatch' },
    })
  },
  30_000,
)

it.each([
  ['permission-assignment', 'change'],
  ['unknown-declaration', 'change'],
  ['unknown-command', 'unknown-command'],
])(
  'does not qualify a %s through the ordinary producer',
  async (kind, commandKind) => {
    const app = await openRealApp()
    apps.push(app)
    expect(await app.create(TENANT_A)).toHaveProperty('ok')
    const before = await app.port.readWork(app.access(TENANT_A))
    const answer = await app.storage.commit({
      identity: identityOf(TENANT_A, app.domainOf(TENANT_A), `ordinary-${kind}`),
      ...app.combination,
      commands: sessionCommitCommands([
        {
          participant: 'session',
          facts: {
            intent: 'command',
            guards: [],
            command: {
              kind: commandKind,
              input: {
                tenant: textOf(TENANT_A),
                session: 'session-1',
                operation: `sop_${kind}`,
                declaration: { kind },
              },
            },
          },
        },
      ]),
    })
    expect(answer.kind).toBe('rolled_back')
    if (answer.kind !== 'rolled_back') throw new Error(`unexpected ${answer.kind}`)
    expect(answer.responses).toMatchObject([
      {
        participant: 'session-ordinary-basis',
        reply: { kind: 'unsupported', basis: { reason: 'not an ordinary Session command' } },
      },
    ])
    expect(answer.responses.some(entry => entry.participant === 'session')).toBe(false)
    expect(await app.port.readWork(app.access(TENANT_A))).toEqual(before)
  },
  30_000,
)
