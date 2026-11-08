import { expect, it } from 'vitest'
import { commandDigest, type SessionCommand } from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import type { PermissionDefinition } from '@omne-harness/permissions'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import {
  sessionCommandFacts,
  sessionCommitDigest,
  sessionPermissionGuardFacts,
} from '../src/participants.ts'
import participant from '../src/worker/participant.ts'
import guard from '../src/worker/permission-current-guard.ts'
import { readPermissionCurrent } from '../src/worker/permission-current.ts'
import { app, TENANT_A, textOf } from './fixtures/app.ts'

const definition: PermissionDefinition = {
  reference: {
    origin: { kind: 'independent', providerId: 'calendar', definitionRef: 'calendar-v1' },
    itemId: 'create',
    revision: '1',
  },
  capabilityId: 'calendar',
  enforcementKey: 'create',
  title: 'Create',
  description: 'Create a schedule',
  approvalEffect: 'May create',
  supportedScopes: [{ kind: 'session', description: 'This session' }],
  assignmentLayers: ['session'],
  values: [
    { id: 'allow', title: 'Allow', description: 'May create', permitsOperation: true },
    { id: 'deny', title: 'Deny', description: 'Must not create', permitsOperation: false },
  ],
  comparison: null,
  defaultRule: { pick: 'deny', allowedSet: null },
  settings: null,
}

it('invalidates the previous read on both an original assignment and an explicit clear', async () => {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  const scope = { tenant: textOf(TENANT_A), session: 'session-1' }
  const query = { ...scope, capabilityId: 'calendar', enforcementKey: 'create' }
  const port = {
    execute: (sql: string, params: readonly SqlValue[]) => a.provider.select('dom_0', sql, params),
  }
  for (const pick of ['allow', 'deny', null] as const) {
    const prior = readPermissionCurrent(port, query)
    if (prior.kind !== 'current') throw new Error('missing current permissions')
    const command: SessionCommand = {
      kind: 'change',
      input: {
        tenant: TENANT_A,
        session: a.access(TENANT_A).session,
        operation: operationId(`guard-assignment-${pick}`),
        declaration: {
          kind: 'permission-assignment',
          capabilityId: query.capabilityId,
          enforcementKey: query.enforcementKey,
          definition: definition.reference,
          rule: pick === null ? null : { pick, allowedSet: null },
          expectedRevision: prior.revision,
          authorization: evidence('permission-write-fixture'),
        },
      },
    }
    const facts = sessionCommandFacts(command, [])
    // The qualification is a named fixture; the event writer and permission guard are production modules.
    const basis = {
      kind: 'permission-change',
      commandsDigest: sessionCommitDigest([facts]),
      coordination: evidence('guard-fixture'),
      permissionChange: {
        operation: command.input.operation,
        commandDigest: commandDigest(command),
        revision: prior.revision,
        definition,
        authority: evidence('permission-write-fixture'),
      },
    }
    port.execute('BEGIN', [])
    try {
      expect(
        participant.execute(facts.facts, {
          ...port,
          requireFact: () => basis,
          provideFact: () => undefined,
        }),
      ).toMatchObject({ kind: 'participated' })
      port.execute('COMMIT', [])
    } catch (error) {
      port.execute('ROLLBACK', [])
      throw error
    }
    const published: JsonValue[] = []
    const factPort = {
      ...port,
      requireFact: () => null,
      provideFact: (_key: unknown, value: JsonValue) => {
        published.push(value)
      },
    }
    expect(guard.execute(sessionPermissionGuardFacts(prior).facts, factPort)).toMatchObject({
      kind: 'conflict',
    })
    expect(published).toEqual([])
    const current = readPermissionCurrent(port, query)
    if (current.kind !== 'current') throw new Error('missing current permissions')
    expect(current.assignment?.rule.pick ?? null).toBe(pick)
    expect(guard.execute(sessionPermissionGuardFacts(current).facts, factPort)).toMatchObject({
      kind: 'participated',
    })
    expect(published).toEqual([current])
  }
})
