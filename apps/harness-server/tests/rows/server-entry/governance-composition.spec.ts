// @module-tag slow
// Identity governance through the release wiring (K9): the real `identity` row (identity-sql on a
// real sqlite-provider) and the real `server-entry` row, with the release entry objects and the
// release trusted table. The Session faces and the definition mapping are the contract doubles of
// `support.ts`; a business request here is `create-session`, which needs a recognized login first.
//
// The scenario walks the governance flow over HTTP and records each step. The negative controls run
// the same scenario with two broken `identity` rows and show which steps turn red:
// - split records: the governance port comes from another set of records than `identityOperations`;
// - no wiring: the `identity` row provides no governance port, so `server-entry` reads none.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  identityClockKey,
  identityGovernanceKey,
  identityOperationsKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import {
  adjustableInvitationTerms,
  adjustableLoginTerms,
  inProcessIdentity,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { IdentitySqlPlugin } from '@omne-harness/identity-sql/cordis'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { stubPlugin } from '../../../src/cordis.ts'
import { entryObjects } from '../../../src/entry/index.ts'
import { defineRow } from '../../../src/row.ts'
import { identityRow } from '../../../src/rows/identity/index.ts'
import { serverEntryRow } from '../../../src/rows/server-entry/index.ts'
import { serveOnce, type ServeRun } from '../../fixtures/serve/harness.ts'
import { fixtureSqliteStorage } from '../identity/fixtures.ts'
import {
  DEFINITION,
  GOVERNANCE_PATH,
  SESSION_PATH,
  connectable,
  freePort,
  mappingsDoubleRow,
  newRecorder,
  post,
  sessionDoubleRow,
  sessionMessage,
  until,
  visibilityWithSessionDouble,
  type Reply,
} from './support.ts'

/** The release initial values of the identity row (`config/serve.distribution.json`). */
const IDENTITY_CONFIG = {
  maxLifetime: 'PT2592000S',
  idlePeriod: 'PT604800S',
  invitationDefaultDuration: 'PT604800S',
  invitationMaxDuration: 'PT2592000S',
}

// --- the tree ----------------------------------------------------------------------------------

type Tree = Readonly<{ port: number; stop(): Promise<ServeRun> }>

async function startTree(identity: Plugin): Promise<Tree> {
  const port = await freePort()
  const controller = new AbortController()
  const finished = serveOnce({
    distribution: {
      rows: [
        { id: 'storage', plugin: 'fixtureSqliteStorage', config: {} },
        { id: 'identity', plugin: 'identityUnderTest', config: IDENTITY_CONFIG },
        { id: 'session-provider', plugin: 'sessionDouble', config: {} },
        { id: 'agent-adoptions', plugin: 'mappingsDouble', config: {} },
        { id: 'server-entry', plugin: 'serverEntryRow', config: { listenPort: port } },
      ],
    },
    plugins: {
      stubPlugin,
      fixtureSqliteStorage,
      identityUnderTest: identity,
      sessionDouble: sessionDoubleRow(newRecorder()),
      mappingsDouble: mappingsDoubleRow,
      serverEntryRow,
    },
    entryObjects,
    visibility: visibilityWithSessionDouble(),
    stopAfterStartup: false,
    stop: controller.signal,
    readinessTimeoutMs: 60_000,
    shutdownDeadlineMs: 30_000,
  })
  let ended = false
  void finished.then(
    () => (ended = true),
    () => (ended = true),
  )
  await until(
    async () => {
      if (ended) throw new Error(`the tree ended before the entry listened`)
      return connectable('127.0.0.1', port)
    },
    `port ${port} to listen`,
    60_000,
  )
  return {
    port,
    stop: () => {
      controller.abort('test: stop')
      return finished
    },
  }
}

// --- the two broken identity rows of the negative controls --------------------------------------

/**
 * The identity-sql plugin mounted with its governance port hidden behind a private label, so the
 * row's own `identityGovernance` is free. `provide` gives the port the row exposes, or none.
 */
function identityRowWith(
  name: string,
  provide: ((ctx: Context) => void) | null,
): ReturnType<typeof defineRow> {
  const plugin: Plugin.Object = {
    name,
    inject: [storageKey, identityClockKey],
    async apply(ctx: Context, config: unknown) {
      await ctx
        .isolate(identityGovernanceKey, Symbol(`${name}:hidden`))
        .plugin(IdentitySqlPlugin, config as never)
      provide?.(ctx)
    },
  }
  return defineRow({
    row: 'identity',
    implementation: 'contract-double',
    manifest: {
      provides: [identityOperationsKey, tenantStandingKey, identityGovernanceKey],
      injects: [storageKey, identityClockKey],
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'none' },
    plugin,
  })
}

function duration(text: string) {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text} did not parse`)
  return parsed.value
}

/** Governance over the reference double's own records: it never saw the logins identity-sql issued. */
const splitRecordsRow = identityRowWith('identity-split-records', ctx => {
  const start = parseInstant('2026-11-04T00:00:00Z')
  if (!start.ok) throw new Error('fixture instant did not parse')
  const other = inProcessIdentity({
    clock: manualIdentityClock(start.value).clock,
    terms: adjustableLoginTerms({
      maxLifetime: duration(IDENTITY_CONFIG.maxLifetime),
      idlePeriod: duration(IDENTITY_CONFIG.idlePeriod),
    }).source,
    invitationTerms: adjustableInvitationTerms({
      defaultDuration: duration(IDENTITY_CONFIG.invitationDefaultDuration),
      maxDuration: duration(IDENTITY_CONFIG.invitationMaxDuration),
    }).source,
  })
  ctx.provide(identityGovernanceKey, other.governance)
})

/** No governance port in the tree: `server-entry` finds none on every call. */
const noGovernanceRow = identityRowWith('identity-no-governance', null)

// --- the wire ----------------------------------------------------------------------------------

type Who = Readonly<{
  identifier: string
  credential: string
  loginProof: string
  loginId: string
  /** The acting tenant this test sends: the login's current selection as the test knows it. */
  tenantText: string
}>

function governed(who: Who, operation: string, body: unknown, acting: string | null): string {
  return JSON.stringify({
    protocolVersion: 'governance-public/1',
    messageId: 'm-1',
    operation,
    body,
    loginProof: who.loginProof,
    ...(acting === null ? {} : { actingTenant: acting }),
  })
}

type Answer = Readonly<{ status: number; outcome: string; body: Record<string, unknown> }>

function answerOf(reply: Reply): Answer {
  const json = (reply.json ?? {}) as { outcome?: string; body?: Record<string, unknown> }
  return {
    status: reply.status,
    outcome: json.outcome ?? `(status ${reply.status})`,
    body: json.body ?? {},
  }
}

async function issueLogin(port: number, identifier: string, credential: string): Promise<Who> {
  const issued = answerOf(
    await post(
      port,
      GOVERNANCE_PATH,
      JSON.stringify({
        protocolVersion: 'governance-public/1',
        messageId: 'm-1',
        operation: 'issue-login',
        body: { loginIdentifier: identifier, credential },
      }),
    ),
  )
  if (issued.outcome !== 'succeeded') throw new Error(`issue-login: ${issued.outcome}`)
  return {
    identifier,
    credential,
    loginProof: issued.body['loginProof'] as string,
    loginId: issued.body['loginId'] as string,
    tenantText: issued.body['tenantId'] as string,
  }
}

async function registerAndLogin(port: number, identifier: string): Promise<Who> {
  const credential = `pw-${identifier}-secret`
  const registered = await post(
    port,
    GOVERNANCE_PATH,
    JSON.stringify({
      protocolVersion: 'governance-public/1',
      messageId: 'm-1',
      operation: 'register-and-activate',
      body: { loginIdentifier: identifier, credential },
    }),
  )
  if (registered.status !== 200) throw new Error(`register: ${registered.status}`)
  return issueLogin(port, identifier, credential)
}

// --- the scenario ------------------------------------------------------------------------------

type Steps = Record<string, string>

/**
 * The flow of the delivery: register and log in; create a team organization; invite, accept;
 * switch the tenant; a business request; revoke the login; the revoked login is refused and
 * another login still works; the last super-admin cannot leave. Returns the outcome of each step.
 * A step that depends on an earlier result that did not come records `skipped`.
 */
async function scenario(port: number): Promise<Steps> {
  const steps: Steps = {}
  const step = async (name: string, reply: Promise<Reply>): Promise<Answer> => {
    const answer = answerOf(await reply)
    steps[name] = answer.outcome
    return answer
  }
  const govern = (who: Who, operation: string, body: unknown, acting: string | null) =>
    post(port, GOVERNANCE_PATH, governed(who, operation, body, acting))
  // A business request: `create-session` for the acting tenant, answered by the Session double.
  const business = (who: Who, createCallId: string) =>
    post(
      port,
      SESSION_PATH,
      sessionMessage(
        'create-session',
        { createCallId, definition: DEFINITION, purpose: 'test' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
      ),
    )

  const alice = await registerAndLogin(port, 'alice')
  const bob = await registerAndLogin(port, 'bob')
  steps['register-and-login'] = 'succeeded'

  const created = await step(
    'create-organization',
    govern(
      alice,
      'create-organization',
      { createCallId: 'c-1', name: 'Team', governanceModelId: 'default-team' },
      alice.tenantText,
    ),
  )
  const team = created.body['organizationId'] as string | undefined
  const aliceTeam = created.body['tenantId'] as string | undefined
  if (team === undefined || aliceTeam === undefined) return steps

  await step(
    'switch-current-tenant',
    govern(alice, 'switch-current-tenant', { tenantId: aliceTeam }, alice.tenantText),
  )
  const aliceT: Who = { ...alice, tenantText: aliceTeam }
  await step('business-after-switch', business(aliceT, 'create-after-switch'))
  await step('business-old-tenant-after-switch', business(alice, 'create-old-tenant'))

  const invited = await step(
    'issue-member-invitation',
    govern(aliceT, 'issue-member-invitation', { invitedLoginIdentifier: 'bob' }, aliceTeam),
  )
  const invitation = invited.body['invitationId'] as string | undefined
  if (invitation === undefined) return steps
  await step(
    'accept-member-invitation',
    govern(
      bob,
      'accept-member-invitation',
      { invitationId: invitation, expectedState: 'open' },
      bob.tenantText,
    ),
  )
  const memberships = await step(
    'query-own-memberships',
    govern(bob, 'query-own-memberships', {}, null),
  )
  const rows = (memberships.body['memberships'] ?? []) as Record<string, unknown>[]
  const bobTeam = rows.find(row => row['organizationId'] === team)?.['tenantId'] as
    | string
    | undefined
  steps['bob-is-member'] =
    rows.find(row => row['organizationId'] === team)?.['role'] === 'member' ? 'member' : 'absent'
  if (bobTeam !== undefined) {
    await step(
      'bob-switch-current-tenant',
      govern(bob, 'switch-current-tenant', { tenantId: bobTeam }, bob.tenantText),
    )
    await step('bob-business-in-team', business({ ...bob, tenantText: bobTeam }, 'create-bob'))
  }

  await step('last-super-admin-leaves', govern(aliceT, 'leave-organization', {}, aliceTeam))

  const alice2 = await issueLogin(port, alice.identifier, alice.credential)
  await step('revoke-login', govern(aliceT, 'revoke-login', { targetLoginId: alice.loginId }, null))
  await step('business-after-revoke', business(aliceT, 'create-after-revoke'))
  await step('governance-after-revoke', govern(aliceT, 'query-current-tenant', {}, null))
  await step('other-login-business', business(alice2, 'create-other-login'))
  await step('other-login-governance', govern(alice2, 'query-current-tenant', {}, null))
  return steps
}

/** What the release wiring answers at each step. */
const EXPECTED: Steps = {
  'register-and-login': 'succeeded',
  'create-organization': 'succeeded',
  'switch-current-tenant': 'succeeded',
  'business-after-switch': 'succeeded',
  // The acting tenant is no longer the selection: the business request is refused.
  'business-old-tenant-after-switch': 'denied',
  'issue-member-invitation': 'succeeded',
  'accept-member-invitation': 'succeeded',
  'query-own-memberships': 'succeeded',
  'bob-is-member': 'member',
  'bob-switch-current-tenant': 'succeeded',
  'bob-business-in-team': 'succeeded',
  // Bob is a member, Alice the only super-admin: she cannot leave.
  'last-super-admin-leaves': 'denied',
  'revoke-login': 'succeeded',
  // The revocation written through the governance port is what login recognition reads.
  'business-after-revoke': 'denied',
  'governance-after-revoke': 'denied',
  // The second login of the same account was not revoked; its selection is the personal tenant.
  'other-login-business': 'succeeded',
  'other-login-governance': 'succeeded',
}

async function run(identity: Plugin): Promise<Readonly<{ steps: Steps; exitCode: number }>> {
  const tree = await startTree(identity)
  try {
    const steps = await scenario(tree.port)
    const ran = await tree.stop()
    return { steps, exitCode: ran.result.exitCode }
  } catch (error) {
    await tree.stop().catch(() => undefined)
    throw error
  }
}

describe('identity governance through the release wiring', () => {
  it(
    'registers, creates a team, invites, switches, revokes: one record set behind both identity ports',
    { timeout: 180_000 },
    async () => {
      const { steps, exitCode } = await run(identityRow)
      expect(steps).toEqual(EXPECTED)
      expect(exitCode).toBe(0)
    },
  )

  it(
    'negative control, split records: governance over other records than login recognition turns the flow red',
    { timeout: 180_000 },
    async () => {
      const { steps } = await run(splitRecordsRow)
      // The other records never saw Alice's login: the first governance step is already refused.
      expect(steps['create-organization']).toBe('denied')
      expect(steps).not.toEqual(EXPECTED)
    },
  )

  it(
    'negative control, no wiring: without a governance port every governed step answers basis-unavailable',
    { timeout: 180_000 },
    async () => {
      const { steps } = await run(noGovernanceRow)
      expect(steps['create-organization']).toBe('basis-unavailable')
      expect(steps).not.toEqual(EXPECTED)
    },
  )
})
