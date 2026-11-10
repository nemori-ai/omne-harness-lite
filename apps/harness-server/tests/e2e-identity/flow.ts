// K10 E2E-ID: the tenant-identity story over real processes. It starts `dist/bin.js serve` on the release
// distribution and drives it through the `omne` CLI (AC-9 of the identity spec, steps 1 to 13). The one
// exception is `read-history`: the CLI has no command for it, so step 10 posts it to the session face with
// the login proof of the caller. Each step records its command, outcome and exit code next to the expected
// ones, so the spec and the driver (`drive.ts`, which writes the evidence file) share one judgment.
// Model calls go to the local gateway (R2-D258); the flow reads only what the admission answers.
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startModelGateway, type ModelGateway } from '../fixtures/model-gateway.ts'
import {
  distributionPath,
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  savedLoginProof,
  savedTenant,
  startServer,
  writeOperator,
  type CliRun,
  type Rec,
  type ServerHandle,
} from '../r9/support.ts'

export const SESSION_PATH = '/session-public/1'
const PASSWORDS = {
  alice: 'alice-pw-MARKER-1a2b',
  bob: 'bob-pw-MARKER-3c4d',
  carol: 'carol-pw-MARKER-5e6f',
} as const
const TEAM_NAME = 'k10-team'
const DEFAULT_TEAM_MODEL = 'default-team'
/** The idle period of the second run (step 13), in seconds. */
const SHORT_IDLE_SECONDS = 12
/**
 * The access refresh granularity of the second run, in seconds. The identity row requires it to be
 * shorter than the idle period; below the 2.5 s between business requests, each request refreshes.
 */
const SHORT_REFRESH_GRANULARITY_SECONDS = 1
/** Exit codes of the CLI by outcome (CLI tutorial 6.6: 0 for succeeded, 3 for denied). */
const EXIT = { succeeded: 0, denied: 3 } as const

type Outcome = keyof typeof EXIT

export type Expected = Readonly<{ outcome: Outcome; exitCode: number }>

export type Probe = Readonly<{ name: string; expected: string; actual: string; ok: boolean }>

export type StepRecord = Readonly<{
  /** The step of the identity spec E2E list (0 for the setup before step 1). */
  step: number
  label: string
  command: readonly string[]
  expected: Expected
  exitCode: number | null
  outcome: string | undefined
  /** Extra comparisons of the answer body or of the state that the step changes. */
  probes: readonly Probe[]
  ok: boolean
  note?: string
}>

export type GovernanceRead = Readonly<{
  command: readonly string[]
  exitCode: number | null
  outcome: string | undefined
  msAfterLastBusiness: number
}>

export type FlowRecord = Readonly<{
  startedAt: string
  runs: readonly Readonly<{
    label: string
    port: number
    startup: Rec | undefined
    exitCode: number | null
    shutdown: Rec | undefined
    identityIdlePeriod: string
  }>[]
  steps: readonly StepRecord[]
  /** Step 13 (b): the governance reads that follow the last business request. */
  governanceReads: readonly GovernanceRead[]
  checks: readonly Probe[]
  aborted: string | undefined
}>

const probe = (name: string, expected: unknown, actual: unknown): Probe => {
  const e = typeof expected === 'string' ? expected : JSON.stringify(expected)
  const a = typeof actual === 'string' ? actual : JSON.stringify(actual)
  return { name, expected: e, actual: a, ok: e === a }
}

export const failedSteps = (record: FlowRecord): StepRecord[] =>
  record.steps.filter(step => !step.ok)
export const failedChecks = (record: FlowRecord): Probe[] => record.checks.filter(c => !c.ok)

const RUN_END_TIMEOUT_MS = 60_000

const count = (text: string, needle: string): number => text.split(needle).length - 1

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const bodyOf = (run: CliRun): Record<string, unknown> => {
  const body = run.result?.['body']
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
}
const listOf = (run: CliRun, key: string): Record<string, unknown>[] => {
  const list = bodyOf(run)[key]
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : []
}
const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const outcomeOf = (run: CliRun): string | undefined => {
  const outcome = run.result?.['outcome']
  return typeof outcome === 'string' ? outcome : undefined
}

type ReleaseRows = { rows: { id: string; config: Record<string, unknown> }[] }
function releaseIdentityConfig(): Record<string, unknown> {
  const release = JSON.parse(readFileSync(distributionPath, 'utf8')) as ReleaseRows
  const row = release.rows.find(entry => entry.id === 'identity')
  if (row === undefined) throw new Error('the release has no identity row')
  return row.config
}

/** Runs the whole story. A judgment that fails is a failed step; a step that cannot go on aborts the rest. */
export async function runIdentityFlow(): Promise<FlowRecord> {
  const scratch = newScratch('k10-id-')
  const startedAt = new Date().toISOString()
  const steps: StepRecord[] = []
  const checks: Probe[] = []
  const governanceReads: GovernanceRead[] = []
  const runs: Array<FlowRecord['runs'][number]> = []
  const outputs: string[] = []
  let gateway: ModelGateway | undefined
  let server: ServerHandle | undefined
  let aborted: string | undefined
  try {
    const port = await freePort()
    gateway = await startModelGateway()
    const gatewayUrl = gateway.url
    const extraCaPath = gateway.certPath
    const url = `http://127.0.0.1:${String(port)}`
    const homes = {
      alice: join(scratch.base, 'home-alice'),
      bob: join(scratch.base, 'home-bob'),
      carol: join(scratch.base, 'home-carol'),
    }

    /** The operator layer of the release tree; the second run replaces the identity row with a short idle period. */
    const writeLayer = (name: string, idleSeconds: number | undefined): string => {
      const base = operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: gatewayUrl })
      // The history that `server-entry` serves also lists the Run entries, so the flow can see a Run end.
      const ops = (base as { ops: { id: string; config?: object }[] }).ops.map(op =>
        op.id === 'server-entry'
          ? {
              ...op,
              config: {
                ...op.config,
                historyKinds: ['message.user', 'message.assistant', 'run.started', 'run.terminal'],
              },
            }
          : op,
      )
      const path = join(scratch.base, name)
      const replaceIdentity = {
        kind: 'replace',
        id: 'identity',
        config: {
          ...releaseIdentityConfig(),
          idlePeriod: `PT${String(idleSeconds)}S`,
          accessRefreshGranularity: `PT${String(SHORT_REFRESH_GRANULARITY_SECONDS)}S`,
        },
      }
      writeOperator(path, { ops: idleSeconds === undefined ? ops : [...ops, replaceIdentity] })
      return path
    }
    const start = async (label: string, idleSeconds: number | undefined): Promise<ServerHandle> => {
      const handle = await startServer({
        stateRoot: scratch.stateRoot,
        operatorPath: writeLayer(`operator-${String(runs.length + 1)}.json`, idleSeconds),
        port,
        extraCaPath,
      })
      runs.push({
        label,
        port,
        startup: handle.records().find(record => record.kind === 'startup-result'),
        exitCode: null,
        shutdown: undefined,
        identityIdlePeriod:
          idleSeconds === undefined
            ? str(releaseIdentityConfig()['idlePeriod'])
            : `PT${String(idleSeconds)}S`,
      })
      return handle
    }
    const stop = async (handle: ServerHandle): Promise<void> => {
      const outcome = await handle.stop()
      const index = runs.length - 1
      const run = runs[index]
      if (run !== undefined)
        runs[index] = {
          ...run,
          exitCode: outcome.code,
          shutdown: outcome.records.find(record => record.kind === 'shutdown-result'),
        }
      outputs.push(outcome.stdout, outcome.stderr)
    }

    /** One CLI step with its expectation. Returns the run so later steps can read ids from it. */
    const cli = async (
      step: number,
      label: string,
      home: string,
      args: readonly string[],
      expected: Expected,
      options: { credential?: string; probes?: (run: CliRun) => Probe[] } = {},
    ): Promise<CliRun> => {
      const run = await runOmne({
        args,
        home,
        server: url,
        cwd: scratch.base,
        ...(options.credential === undefined ? {} : { credential: options.credential }),
      })
      outputs.push(run.stdout, run.stderr)
      const outcome = outcomeOf(run)
      const probes = options.probes?.(run) ?? []
      steps.push({
        step,
        label,
        command: run.command,
        expected,
        exitCode: run.status,
        outcome,
        probes,
        ok:
          outcome === expected.outcome &&
          run.status === expected.exitCode &&
          probes.every(entry => entry.ok),
      })
      return run
    }
    const ok: Expected = { outcome: 'succeeded', exitCode: EXIT.succeeded }
    const denied: Expected = { outcome: 'denied', exitCode: EXIT.denied }
    const lastStep = (): StepRecord => {
      const entry = steps[steps.length - 1]
      if (entry === undefined) throw new Error('no step yet')
      return entry
    }
    /** A step the story cannot go on without: when it did not match, the flow stops there. */
    const must = (): void => {
      const entry = lastStep()
      if (!entry.ok) throw new Error(`step ${String(entry.step)} (${entry.label}) did not match`)
    }

    server = await start('first start (release idle period)', undefined)
    const startup = runs[0]?.startup
    checks.push(
      probe(
        'run 1 startup: accepting, outcome ready',
        { accepting: true, outcome: 'ready' },
        { accepting: startup?.['accepting'], outcome: startup?.['outcome'] },
      ),
    )

    // --- setup: A and B register and log in.
    await cli(0, 'A registers', homes.alice, ['register', '--login-identifier', 'alice'], ok, {
      credential: PASSWORDS.alice,
    })
    must()
    await cli(0, 'A logs in', homes.alice, ['login', '--login-identifier', 'alice'], ok, {
      credential: PASSWORDS.alice,
    })
    must()
    const registerB = await cli(
      0,
      'B registers',
      homes.bob,
      ['register', '--login-identifier', 'bob'],
      ok,
      { credential: PASSWORDS.bob },
    )
    must()
    await cli(0, 'B logs in', homes.bob, ['login', '--login-identifier', 'bob'], ok, {
      credential: PASSWORDS.bob,
    })
    must()
    const accountB = str(bodyOf(registerB)['accountId'])

    // 1. A creates the team T and gets her tenant tA in it.
    const created = await cli(
      1,
      'A create-organization',
      homes.alice,
      ['create-organization', '--name', TEAM_NAME, '--governance-model-id', DEFAULT_TEAM_MODEL],
      ok,
      {
        probes: run => [
          probe(
            'body has organizationId and tenantId',
            true,
            str(bodyOf(run)['organizationId']) !== '' && str(bodyOf(run)['tenantId']) !== '',
          ),
        ],
      },
    )
    must()
    const team = str(bodyOf(created)['organizationId'])
    const tA = str(bodyOf(created)['tenantId'])

    // 2. A switches to tA.
    await cli(
      2,
      'A switch-current-tenant tA',
      homes.alice,
      ['switch-current-tenant', '--tenant-id', tA],
      ok,
      {
        probes: run => [
          probe('answer names tA', tA, str(bodyOf(run)['tenantId'])),
          probe('login.json of A now holds tA', tA, savedTenant(homes.alice)),
        ],
      },
    )
    must()

    // 3. A invites B.
    await cli(
      3,
      'A issue-member-invitation B',
      homes.alice,
      ['issue-member-invitation', '--invited-login-identifier', 'bob'],
      ok,
      { probes: run => [probe('invitation is open', 'open', str(bodyOf(run)['state']))] },
    )
    must()

    // 4. B reads the invitation, accepts it, and finds tB among the memberships.
    const received = await cli(
      4,
      'B query-received-invitations',
      homes.bob,
      ['query-received-invitations'],
      ok,
      {
        probes: run => [
          probe(
            'one open invitation, to the team',
            [{ state: 'open', organizationId: team }],
            listOf(run, 'invitations').map(i => ({
              state: i['state'],
              organizationId: i['organizationId'],
            })),
          ),
        ],
      },
    )
    must()
    const firstInvitation = str(listOf(received, 'invitations')[0]?.['invitationId'])
    await cli(
      4,
      'B accept-member-invitation',
      homes.bob,
      ['accept-member-invitation', '--invitation-id', firstInvitation],
      ok,
      { probes: run => [probe('invitation is accepted', 'accepted', str(bodyOf(run)['state']))] },
    )
    must()
    let tB = ''
    await cli(4, 'B query-own-memberships', homes.bob, ['query-own-memberships'], ok, {
      probes: run => {
        const entry = listOf(run, 'memberships').find(m => m['organizationId'] === team)
        tB = str(entry?.['tenantId'])
        return [
          probe('B is a member of the team', 'member', str(entry?.['role'])),
          probe(
            'tB is a tenant of B in the team',
            true,
            tB !== '' && tB.includes(accountB) && tB.includes(team),
          ),
        ]
      },
    })
    must()

    // Waits until every Run that the accepted inputs started has ended (R2-D257): an ordered stop with a
    // Run in flight ends "incomplete" and exits 5. The history is read with the login proof of B.
    const proofB = savedLoginProof(homes.bob)
    const waitRunsEnded = async (inputs: number, label: string): Promise<void> => {
      const waitUntil = Date.now() + RUN_END_TIMEOUT_MS
      let steady = 0
      let ended = false
      let last = ''
      while (Date.now() < waitUntil && !ended) {
        const reply = await fetch(`${url}${SESSION_PATH}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            protocolVersion: 'session-public/1',
            messageId: 'k10-wait-runs',
            operation: 'read-history',
            body: {
              tenant: tB,
              session: sessionId,
              cursor: null,
              direction: 'forward',
              pageBytes: '65536',
            },
            loginProof: proofB,
          }),
        })
        last = await reply.text()
        outputs.push(last)
        const started = count(last, '"run.started"')
        const settled =
          count(last, '"message.user"') === inputs &&
          started >= 1 &&
          started === count(last, '"run.terminal"')
        steady = settled ? steady + 1 : 0
        ended = steady >= 2
        if (!ended) await sleep(500)
      }
      checks.push(
        probe(
          label,
          { users: inputs, started: 'equal to terminal' },
          ended
            ? { users: inputs, started: 'equal to terminal' }
            : {
                users: count(last, '"message.user"'),
                started: count(last, '"run.started"'),
                terminal: count(last, '"run.terminal"'),
              },
        ),
      )
    }

    // 5. B switches to tB, creates a session, and sends an input.
    await cli(
      5,
      'B switch-current-tenant tB',
      homes.bob,
      ['switch-current-tenant', '--tenant-id', tB],
      ok,
      {
        probes: () => [probe('login.json of B holds tB', tB, savedTenant(homes.bob))],
      },
    )
    must()
    const session = await cli(
      5,
      'B create-session',
      homes.bob,
      ['create-session', '--definition', 'assistant'],
      ok,
    )
    must()
    const sessionId = str(bodyOf(session)['session'])
    await cli(
      5,
      'B send-input',
      homes.bob,
      ['send-input', '--session', sessionId, '--text', 'k10 input 1'],
      ok,
    )
    must()
    // The Run of the first input ends before B is removed: a Run still in flight at the removal did not end in
    // two earlier trial runs (see the report of K10), and the stop after it was incomplete (exit 5).
    await waitRunsEnded(1, 'the Run of the first input ended before the removal of B')

    // 6. A sees B as member, then removes B.
    await cli(
      6,
      'A query-organization-members',
      homes.alice,
      ['query-organization-members', '--organization-id', team],
      ok,
      {
        probes: run => [
          probe(
            'B is member',
            'member',
            str(listOf(run, 'members').find(m => m['accountId'] === accountB)?.['role']),
          ),
        ],
      },
    )
    must()
    await cli(
      6,
      'A remove-member B',
      homes.alice,
      [
        'remove-member',
        '--organization-id',
        team,
        '--account-id',
        accountB,
        '--expected-role',
        'member',
      ],
      ok,
    )
    must()

    // 7. B is out: the session and a new session answer denied; the current tenant stays tB.
    await cli(
      7,
      'B send-input to the step-5 session',
      homes.bob,
      ['send-input', '--session', sessionId, '--text', 'k10 input 2'],
      denied,
    )
    await cli(
      7,
      'B create-session',
      homes.bob,
      ['create-session', '--definition', 'assistant'],
      denied,
    )
    await cli(7, 'B query-current-tenant', homes.bob, ['query-current-tenant'], ok, {
      probes: run => [probe('current tenant is still tB', tB, str(bodyOf(run)['tenantId']))],
    })

    // 8. A invites B again, B accepts: member role and the same tenant tB.
    await cli(
      8,
      'A issue-member-invitation B (again)',
      homes.alice,
      ['issue-member-invitation', '--invited-login-identifier', 'bob'],
      ok,
    )
    must()
    const received2 = await cli(
      8,
      'B query-received-invitations',
      homes.bob,
      ['query-received-invitations'],
      ok,
      {
        probes: run => [
          probe(
            'one open invitation',
            1,
            listOf(run, 'invitations').filter(i => i['state'] === 'open').length,
          ),
        ],
      },
    )
    must()
    const secondInvitation = str(
      listOf(received2, 'invitations').find(i => i['state'] === 'open')?.['invitationId'],
    )
    await cli(
      8,
      'B accept-member-invitation',
      homes.bob,
      ['accept-member-invitation', '--invitation-id', secondInvitation],
      ok,
      {
        probes: run => [
          probe(
            'a different invitation than the first, accepted',
            true,
            secondInvitation !== firstInvitation && str(bodyOf(run)['state']) === 'accepted',
          ),
        ],
      },
    )
    must()
    await cli(8, 'B query-own-memberships', homes.bob, ['query-own-memberships'], ok, {
      probes: run => {
        const entry = listOf(run, 'memberships').find(m => m['organizationId'] === team)
        return [
          probe('role is member', 'member', str(entry?.['role'])),
          probe('tenantId is still tB', tB, str(entry?.['tenantId'])),
          probe('current tenant of the login is still tB', tB, savedTenant(homes.bob)),
        ]
      },
    })

    // 9. The step-5 session works again for B (same tenant).
    await cli(
      9,
      'B send-input to the step-5 session',
      homes.bob,
      ['send-input', '--session', sessionId, '--text', 'k10 input 3'],
      ok,
    )
    await waitRunsEnded(2, 'the Runs of both accepted inputs ended before the stop')

    // 10. A cannot reach B's session with tB: send-input through the CLI, read-history on the session face.
    await cli(
      10,
      'A send-input to the session of B with tB',
      homes.alice,
      ['send-input', '--session', sessionId, '--text', 'k10 intruder', '--tenant', tB],
      denied,
    )
    const proofA = savedLoginProof(homes.alice)
    const history = await fetch(`${url}${SESSION_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocolVersion: 'session-public/1',
        messageId: 'k10-read-history',
        operation: 'read-history',
        body: {
          tenant: tB,
          session: sessionId,
          cursor: null,
          direction: 'forward',
          pageBytes: '65536',
        },
        loginProof: proofA,
      }),
    })
    const historyText = await history.text()
    outputs.push(historyText)
    let historyOutcome: unknown
    try {
      historyOutcome = (JSON.parse(historyText) as { outcome?: unknown }).outcome
    } catch {
      historyOutcome = undefined
    }
    steps.push({
      step: 10,
      label:
        'A read-history of the session of B with tB (HTTP post to the session face: the CLI has no read-history command)',
      command: [
        'POST',
        SESSION_PATH,
        'operation=read-history',
        'tenant=tB',
        'session=<session of B>',
      ],
      expected: denied,
      exitCode: null,
      outcome: typeof historyOutcome === 'string' ? historyOutcome : undefined,
      probes: [
        probe('the answer holds no history text', false, historyText.includes('k10 input')),
        probe('HTTP status of the answer', 'recorded', `${String(history.status)}`),
      ].map(entry => (entry.name === 'HTTP status of the answer' ? { ...entry, ok: true } : entry)),
      ok: historyOutcome === 'denied' && !historyText.includes('k10 input'),
    })

    // 11. A makes B super-admin and leaves; B, the last super-admin, cannot leave.
    await cli(
      11,
      'A change-member-role B super-admin',
      homes.alice,
      [
        'change-member-role',
        '--organization-id',
        team,
        '--account-id',
        accountB,
        '--expected-role',
        'member',
        '--target-role',
        'super-admin',
      ],
      ok,
    )
    must()
    await cli(11, 'A leave-organization', homes.alice, ['leave-organization'], ok)
    must()
    await cli(
      11,
      'B leave-organization (last super-admin)',
      homes.bob,
      ['leave-organization'],
      denied,
    )

    // 12. B logs out. A copy of the home keeps the old proof, to see that the server refuses it.
    const staleBob = join(scratch.base, 'home-bob-stale')
    cpSync(homes.bob, staleBob, { recursive: true })
    await cli(12, 'B revoke-login (own login)', homes.bob, ['revoke-login'], ok, {
      probes: () => [
        probe('login.json of B is deleted', false, existsSync(join(homes.bob, 'login.json'))),
      ],
    })
    must()
    await cli(
      12,
      'B create-session with the revoked login (copy of the home before logout)',
      staleBob,
      ['create-session', '--definition', 'assistant'],
      denied,
    )
    await cli(
      12,
      'B send-input with the revoked login (copy of the home before logout)',
      staleBob,
      ['send-input', '--session', sessionId, '--text', 'k10 after logout'],
      denied,
    )

    await stop(server)
    server = undefined
    checks.push(probe('run 1 stopped in order (exit 0)', 0, runs[0]?.exitCode))

    // 13. Restart with a short idle period; C logs in.
    server = await start(
      `second start (idle period PT${String(SHORT_IDLE_SECONDS)}S)`,
      SHORT_IDLE_SECONDS,
    )
    const startup2 = runs[1]?.startup
    checks.push(
      probe(
        'run 2 startup: accepting, outcome ready',
        { accepting: true, outcome: 'ready' },
        { accepting: startup2?.['accepting'], outcome: startup2?.['outcome'] },
      ),
    )
    await cli(13, 'C registers', homes.carol, ['register', '--login-identifier', 'carol'], ok, {
      credential: PASSWORDS.carol,
    })
    must()
    await cli(13, 'C logs in', homes.carol, ['login', '--login-identifier', 'carol'], ok, {
      credential: PASSWORDS.carol,
    })
    must()
    const loginAt = Date.now()
    const carolSession = await cli(
      13,
      'C create-session (a successful business access)',
      homes.carol,
      ['create-session', '--definition', 'assistant'],
      ok,
    )
    must()
    const carolSessionId = str(bodyOf(carolSession)['session'])
    // (a) Successful business requests keep the login alive past the first idle deadline.
    let businessAt = Date.now()
    let round = 0
    const businessStepsFrom = steps.length
    while (Date.now() - loginAt < SHORT_IDLE_SECONDS * 1000 + 5000) {
      await sleep(2500)
      round += 1
      await cli(
        13,
        `C send-input #${String(round)} (${String(Math.round((Date.now() - loginAt) / 1000))} s after login)`,
        homes.carol,
        ['send-input', '--session', carolSessionId, '--text', `k10 busy ${String(round)}`],
        ok,
      )
      if (lastStep().ok) businessAt = Date.now()
    }
    checks.push(
      probe(
        'the login passed its first idle deadline and every business request succeeded',
        true,
        Date.now() - loginAt > SHORT_IDLE_SECONDS * 1000 &&
          steps.slice(businessStepsFrom).every(entry => entry.ok),
      ),
    )
    // (b) Governance reads alone do not refresh: they succeed until the deadline, then answer denied.
    const giveUpAt = businessAt + SHORT_IDLE_SECONDS * 1000 + 15_000
    for (;;) {
      await sleep(2000)
      const run = await runOmne({
        args: ['query-current-tenant'],
        home: homes.carol,
        server: url,
        cwd: scratch.base,
      })
      outputs.push(run.stdout, run.stderr)
      const outcome = outcomeOf(run)
      governanceReads.push({
        command: run.command,
        exitCode: run.status,
        outcome,
        msAfterLastBusiness: Date.now() - businessAt,
      })
      if (outcome === 'denied' || Date.now() > giveUpAt) break
    }
    const firstDenied = governanceReads.find(entry => entry.outcome === 'denied')
    const before = governanceReads.filter(
      entry =>
        firstDenied === undefined || entry.msAfterLastBusiness < firstDenied.msAfterLastBusiness,
    )
    checks.push(
      probe(
        'governance reads alone end in denied (exit 3)',
        { outcome: 'denied', exitCode: 3 },
        {
          outcome: firstDenied?.outcome,
          exitCode: firstDenied?.exitCode,
        },
      ),
      probe(
        'every governance read before the first denied succeeded',
        true,
        before.length > 0 && before.every(entry => entry.outcome === 'succeeded'),
      ),
      probe(
        'the first denied came at least (idle period - 1.5 s) after the last business request',
        true,
        firstDenied !== undefined &&
          firstDenied.msAfterLastBusiness >= SHORT_IDLE_SECONDS * 1000 - 1500,
      ),
    )
    await cli(
      13,
      'C send-input after the idle deadline (not revived)',
      homes.carol,
      ['send-input', '--session', carolSessionId, '--text', 'k10 late'],
      denied,
    )

    await stop(server)
    server = undefined
    checks.push(probe('run 2 stopped in order (exit 0)', 0, runs[1]?.exitCode))

    // No captured output holds a login proof or a password.
    const text = outputs.join('\n')
    checks.push(
      probe(
        'no captured output holds a login proof or a password',
        0,
        [proofA, ...Object.values(PASSWORDS)].filter(secret => text.includes(secret)).length,
      ),
    )
  } catch (error) {
    aborted = error instanceof Error ? error.message : String(error)
  } finally {
    if (server !== undefined) await server.kill().catch(() => undefined)
    if (gateway !== undefined) await gateway.close().catch(() => undefined)
    scratch.remove()
  }
  return { startedAt, runs, steps, governanceReads, checks, aborted }
}
