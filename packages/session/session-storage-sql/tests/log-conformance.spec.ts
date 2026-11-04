// The commitLog conformance suite of session-contract (LC-01 to LC-10), run on the real participant
// and read handlers over the node:sqlite test provider and over the real sqlite-provider. The Agent
// side of the fixture (`observe`) publishes the original event through the `execution-record`
// participant, so the commit reads it back from the same-root index in its own write transaction.
import { afterEach, describe, it } from 'vitest'
import { readAccessRequest } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionLogConformance,
  type SessionLogFixture,
} from '@omne-harness/session-contract/testing'
import type { SessionLogObservation, SessionTransactionPort } from '@omne-harness/session-contract'
import { app, textOf, TENANT_A, TENANT_B } from './fixtures/app.ts'
import {
  agentPublisher,
  openRealApp,
  type AgentPublisher,
  type RealApp,
} from './fixtures/real-provider.ts'

type CommitLogPort = SessionLogFixture<string>['port']

function commitLogPort(port: SessionTransactionPort<string>): CommitLogPort {
  if (port.commitLog === undefined) throw new Error('the SQL port offers no commitLog')
  return port as CommitLogPort
}

/** States one original event of the observation to the Agent records of its session. */
const observeWith =
  (agent: AgentPublisher) =>
  async (observation: SessionLogObservation): Promise<void> => {
    if (observation.sequence === null) throw new Error('the log fixture observes numbered events')
    await agent.publish({
      tenant: observation.tenant,
      session: observation.session,
      execution: observation.execution,
      sequence: observation.sequence,
      revision: observation.revision,
      source: observation.source,
      head: observation.executionEvidence ?? observation.source,
      kinds: observation.consequences.map(item => item.kind),
      ended: observation.consequences.some(item => item.kind === 'ended'),
    })
  }

const guards: NonNullable<SessionLogFixture<string>['initializationGuards']> = command =>
  Promise.resolve([
    initializationFixtureGuard(
      initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
    ),
  ])

async function sqliteFixture(): Promise<SessionLogFixture<string>> {
  const a = await app()
  const agent = agentPublisher({
    storage: a.provider.storage,
    combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
    domainOf: tenant => {
      const entry = a.directory.entries.find(item => item.tenant === textOf(tenant))
      if (entry === undefined) throw new Error('unknown tenant')
      return entry.domain.transactionDomain
    },
  })
  return {
    port: commitLogPort(a.port),
    access: a.access(TENANT_A),
    otherAccess: a.access(TENANT_B),
    creation: creation(),
    operation: name => operationId(name),
    initializationGuards: guards,
    askedAccessChecks: () => a.accessCheck.controls.asked().length,
    observe: observeWith(agent),
    delegatedView: () =>
      a.pair.delegated.bind({
        request: readAccessRequest(a.access(TENANT_A), 'readWork'),
        evidence: evidence('access/face/readWork'),
      }),
  }
}

describe('session-contract commitLog conformance on the SQL storage (node:sqlite)', () => {
  for (const test of sessionLogConformance<string>())
    it(`${test.clause}: ${test.name}`, async () => {
      await test.run(await sqliteFixture())
    })
})

const apps: RealApp[] = []
afterEach(async () => {
  for (const real of apps.splice(0)) await real.dispose()
})

async function realFixture(): Promise<SessionLogFixture<string>> {
  const real = await openRealApp()
  apps.push(real)
  const agent = agentPublisher({
    storage: real.storage,
    combination: real.combination,
    domainOf: tenant => real.domainOf(tenant),
  })
  return {
    port: commitLogPort(real.port),
    access: real.access(TENANT_A),
    otherAccess: real.access(TENANT_B),
    creation: creation(),
    operation: name => operationId(name),
    initializationGuards: guards,
    askedAccessChecks: () => real.accessCheck.controls.asked().length,
    observe: observeWith(agent),
    delegatedView: () =>
      real.pair.delegated.bind({
        request: readAccessRequest(real.access(TENANT_A), 'readWork'),
        evidence: evidence('access/face/readWork'),
      }),
  }
}

describe('session-contract commitLog conformance on the real sqlite-provider', () => {
  // Why slow: real write and read Workers over real files in a temporary directory.
  for (const test of sessionLogConformance<string>())
    it(`${test.clause}: ${test.name}`, { tags: ['slow'] }, async () => {
      await test.run(await realFixture())
    })
})
