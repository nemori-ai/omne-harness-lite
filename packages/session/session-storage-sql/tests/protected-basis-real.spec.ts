// @module-tag slow
// Real SQLite Workers commit a permission assignment under the combination of a protected basis
// source. The basis producer is a named fixture; the Session writer and the commit path are the
// production modules.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { PermissionDefinition } from '@omne-harness/permissions'
import {
  commandDigest,
  mutationAccessRequest,
  type SessionAccessRequest,
  type SessionCommand,
  type SessionFailure,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import type { SessionProtectedBasisSource, SessionProtectedCommit } from '../src/index.ts'
import { SESSION_COMMIT_BASIS, sessionCommitDigest } from '../src/participants.ts'
import {
  identityOf,
  openRealApp,
  queryKindOf,
  TENANT_A,
  type RealApp,
} from './fixtures/real-provider.ts'

const PRODUCER = 'fixture.protected-basis'
const POLICY = evidence('permission-write-fixture')
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

function producer(): SqlMaterialCatalog['participants'][number] {
  const file = new URL('./fixtures/protected-basis.mjs', import.meta.url)
  return {
    participant: PRODUCER,
    protocol: '1',
    moduleUrl: file.href,
    codeDigest: createHash('sha256')
      .update(readFileSync(fileURLToPath(file)))
      .digest('hex'),
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    requiresFacts: [],
    providesFacts: [SESSION_COMMIT_BASIS],
  }
}

type Change = Extract<SessionCommand, { kind: 'change' }>
type Source = SessionProtectedBasisSource<string>
const unavailable: SessionFailure = {
  kind: 'unavailable',
  owner: 'fixture',
  diagnostic: 'no basis',
}

function qualificationOf(command: Change) {
  const declaration = command.input.declaration
  if (declaration.kind !== 'permission-assignment') throw new Error('not an assignment')
  return {
    tenant: command.input.tenant,
    session: command.input.session,
    operation: command.input.operation,
    commandDigest: commandDigest(command),
    permissionRevision: declaration.expectedRevision,
    principalRef: 'tester',
    policy: POLICY,
  }
}

/** The access policy of the fixture: an assignment gets the write qualification of its command. */
function qualifying(qualify: () => boolean) {
  return (request: SessionAccessRequest<string>) => {
    const allowed = { kind: 'allowed' as const, evidence: evidence(`access/${request.operation}`) }
    if (request.operation !== 'change') return allowed
    const command = request.target.command
    if (command.input.declaration.kind !== 'permission-assignment' || !qualify()) return allowed
    return { ...allowed, writeQualification: qualificationOf(command) }
  }
}

const apps: RealApp[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
})

async function world(configured = true) {
  const state = { qualified: true, asked: [] as SessionProtectedCommit<string>[] }
  let source: Source = () => Promise.resolve(fail(unavailable))
  const app = await openRealApp({
    extraParticipants: [producer()],
    policy: qualifying(() => state.qualified),
    ...(configured
      ? {
          protectedBasis: (commit: SessionProtectedCommit<string>) => {
            state.asked.push(commit)
            return source(commit)
          },
        }
      : {}),
  })
  apps.push(app)
  expect(await app.create(TENANT_A)).toHaveProperty('ok')
  const combination = await app.register('c-protected', ['execution-record', 'session', PRODUCER])
  const access = app.access(TENANT_A)
  const assignment = (name: string, pick: 'allow' | 'deny', expectedRevision = '0'): Change => ({
    kind: 'change',
    input: {
      tenant: TENANT_A,
      session: access.session,
      operation: operationId(name),
      declaration: {
        kind: 'permission-assignment',
        capabilityId: definition.capabilityId,
        enforcementKey: definition.enforcementKey,
        definition: definition.reference,
        rule: { pick, allowedSet: null },
        expectedRevision,
        authorization: POLICY,
      },
    },
  })
  /** The plan of the fixture: one producer command that states the basis of this commit. */
  const plan =
    (holds: boolean): Source =>
    commit =>
      Promise.resolve(
        succeed({
          combination,
          commands: [
            {
              participant: PRODUCER,
              facts: {
                holds,
                basis: {
                  kind: 'permission-change',
                  commandsDigest: sessionCommitDigest([commit.session]),
                  permissionChange: {
                    operation: commit.qualification.operation,
                    commandDigest: commit.qualification.commandDigest,
                    revision: commit.qualification.permissionRevision,
                    definition,
                    authority: commit.qualification.policy,
                  },
                },
              },
            },
          ],
        }),
      )
  const commit = (command: Change) => app.port.commit({ access, command, guards: [] })
  const kindOf = async (name: string, attempt: number) =>
    queryKindOf(
      await app.storage.query(
        identityOf(TENANT_A, app.domainOf(TENANT_A), operationId(name), attempt),
      ),
    )
  /** From now on the storage cannot place any operation: every `query` answers unknown. */
  const loseSight = () => {
    app.storage.query = identity =>
      Promise.resolve({ kind: 'unknown', identity, diagnostic: 'queued' })
  }
  return {
    app,
    state,
    access,
    assignment,
    plan,
    commit,
    kindOf,
    loseSight,
    use: (next: Source) => {
      source = next
    },
  }
}

it('commits a permission assignment on the basis of the protected source and recalls a redelivery', async () => {
  const w = await world()
  w.use(w.plan(true))
  const command = w.assignment('assign', 'allow')
  expect(await w.commit(command)).toMatchObject({ ok: { recovered: false } })
  expect(await w.app.port.readWork(w.access)).toMatchObject({
    ok: {
      permissions: { revision: '1', assignments: [{ rule: { pick: 'allow', allowedSet: null } }] },
    },
  })
  expect(w.state.asked).toHaveLength(1)
  expect(w.state.asked[0]).toMatchObject({
    access: w.access,
    command,
    qualification: { operation: command.input.operation, policy: POLICY },
    session: { participant: 'session' },
  })
  const commits = w.app.opCount()
  // The operation is committed. The redelivery gets the original result and asks no source.
  w.use(() => Promise.resolve(fail(unavailable)))
  expect(await w.commit(command)).toMatchObject({ ok: { recovered: true } })
  expect(w.state.asked).toHaveLength(1)
  expect(w.app.opCount()).toBe(commits)
  expect(await w.commit(w.assignment('assign', 'deny', '1'))).toMatchObject({
    failure: { kind: 'conflict' },
  })
}, 30_000)

it('answers the failure of the source, keeps nothing, and decides the same operation again', async () => {
  const w = await world()
  const command = w.assignment('later', 'allow')
  const commits = w.app.opCount()
  expect(await w.commit(command)).toEqual({ failure: unavailable })
  expect(w.app.opCount()).toBe(commits)
  expect(await w.kindOf('later', 1)).toBe('not_committed')
  w.use(w.plan(true))
  expect(await w.commit(command)).toMatchObject({ ok: { recovered: false } })
  expect(await w.kindOf('later', 1)).toBe('committed')
}, 30_000)

it('recalls a delivery that committed while the source could not form the basis', async () => {
  const w = await world()
  const command = w.assignment('raced', 'allow')
  w.use(async () => {
    // Another delivery of the same operation commits before this source answers.
    w.use(w.plan(true))
    expect(await w.commit(command)).toMatchObject({ ok: { recovered: false } })
    return fail(unavailable)
  })
  expect(await w.commit(command)).toMatchObject({ ok: { recovered: true } })
  expect(await w.app.port.readWork(w.access)).toMatchObject({
    ok: { permissions: { revision: '1' } },
  })
}, 30_000)

it('uses up one generation when the producer stops the transaction, then commits the operation', async () => {
  const w = await world()
  const command = w.assignment('stopped', 'allow')
  w.use(w.plan(false))
  expect(await w.commit(command)).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(await w.kindOf('stopped', 1)).toBe('rolled_back')
  expect(await w.app.port.readWork(w.access)).toMatchObject({
    ok: { permissions: { revision: '0', assignments: [] } },
  })
  w.use(w.plan(true))
  expect(await w.commit(command)).toMatchObject({ ok: { recovered: false } })
  expect(await w.kindOf('stopped', 2)).toBe('committed')
}, 30_000)

it('denies an assignment that access did not qualify and does not ask the source', async () => {
  const w = await world()
  w.use(w.plan(true))
  w.state.qualified = false
  const commits = w.app.opCount()
  expect(await w.commit(w.assignment('unqualified', 'allow'))).toEqual({
    failure: { kind: 'denied', action: 'change' },
  })
  expect(w.state.asked).toEqual([])
  expect(w.app.opCount()).toBe(commits)
}, 30_000)

it.each(['session', 'session-ordinary-basis'])(
  'refuses a plan that carries a %s command',
  async participant => {
    const w = await world()
    const good = w.plan(true)
    w.use(async commit => {
      const planned = await good(commit)
      if (!('ok' in planned)) throw new Error('fixture plan')
      return succeed({
        ...planned.ok,
        commands: [...planned.ok.commands, { participant, facts: commit.session.facts }],
      })
    })
    const commits = w.app.opCount()
    expect(await w.commit(w.assignment('smuggled', 'allow'))).toEqual({
      failure: {
        kind: 'invalid',
        field: 'basis',
        reason: 'a protected basis carries no Session command and no ordinary basis',
      },
    })
    expect(w.app.opCount()).toBe(commits)
  },
  30_000,
)

it('answers unavailable when the source throws', async () => {
  const w = await world()
  w.use(() => Promise.reject(new Error('source down')))
  expect(await w.commit(w.assignment('thrown', 'allow'))).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'the protected basis source threw: source down' },
  })
  expect(await w.kindOf('thrown', 1)).toBe('not_committed')
}, 30_000)

it('answers commit-unknown when the storage cannot place the operation, and asks no source', async () => {
  const w = await world()
  w.use(w.plan(true))
  const command = w.assignment('unplaced', 'allow')
  const commits = w.app.opCount()
  w.loseSight()
  expect(await w.commit(command)).toEqual({
    failure: { kind: 'commit-unknown', operation: command.input.operation },
  })
  expect(w.state.asked).toEqual([])
  expect(w.app.opCount()).toBe(commits)
}, 30_000)

it('answers commit-unknown, not the failure of the source, when the second look is unknown', async () => {
  const w = await world()
  const command = w.assignment('unplaced-later', 'allow')
  w.use(() => {
    w.loseSight()
    return Promise.resolve(fail(unavailable))
  })
  expect(await w.commit(command)).toEqual({
    failure: { kind: 'commit-unknown', operation: command.input.operation },
  })
}, 30_000)

it('commits a change that is no permission assignment on the ordinary basis and asks no source', async () => {
  const w = await world()
  w.use(w.plan(true))
  const command: Change = {
    kind: 'change',
    input: {
      tenant: TENANT_A,
      session: w.access.session,
      operation: operationId('select-model'),
      declaration: { kind: 'model', name: 'route-a', basis: evidence('route-a') },
    },
  }
  expect(await w.commit(command)).toMatchObject({ ok: { recovered: false } })
  expect(w.state.asked).toEqual([])
}, 30_000)

it('refuses a permission assignment in the ordinary producer when no source is configured', async () => {
  const w = await world(false)
  const answer = await w.commit(w.assignment('no-source', 'allow'))
  expect(answer).toHaveProperty('failure')
  // The commit reached the storage under the ordinary combination and was rolled back there.
  expect(await w.kindOf('no-source', 1)).toBe('rolled_back')
  expect(await w.app.port.readWork(w.access)).toMatchObject({
    ok: { permissions: { revision: '0', assignments: [] } },
  })
}, 30_000)

it('carries the write qualification of a delegated binding to the source, and denies without it', async () => {
  const w = await world()
  w.use(w.plan(true))
  const command = w.assignment('delegated', 'allow')
  const bound = {
    request: mutationAccessRequest(w.access, command),
    evidence: evidence('access/delegated'),
  }
  const bare = w.app.pair.delegated.bind(bound)
  expect(await bare.commit({ access: w.access, command, guards: [] })).toEqual({
    failure: { kind: 'denied', action: 'change' },
  })
  expect(w.state.asked).toEqual([])
  const qualified = w.app.pair.delegated.bind({
    ...bound,
    writeQualification: qualificationOf(command),
  })
  expect(await qualified.commit({ access: w.access, command, guards: [] })).toMatchObject({
    ok: { recovered: false },
  })
  expect(w.state.asked).toHaveLength(1)
  expect(w.state.asked[0]!.qualification).toEqual(qualificationOf(command))
}, 30_000)
