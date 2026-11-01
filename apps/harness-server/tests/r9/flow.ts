// R9 line-internal flow over real processes. It starts `dist/bin.js serve` on the release distribution
// (the wave-1 real rows in the order of DP1-C18, the operator layer for the paths and the port), drives it
// with the `omne` CLI, and returns what it saw plus a list of named checks. The slow spec asserts the
// checks, and `drive.ts` (the `run-r9.sh` driver) writes them as a machine-readable record.
// The checks hold the judgments, so the spec and the driver cannot drift apart.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bodyOf,
  cursorKeySpellings,
  freePort,
  leaked,
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
  type ServerOutcome,
} from './support.ts'

export const SESSION_PATH = '/session-public/1'
export const GOVERNANCE_PATH = '/governance-public/1'
const CREDENTIALS = { alice: 'alice-pw-MARKER-7f3a', bob: 'bob-pw-MARKER-91c2' } as const
const INPUT_TEXT = 'hello from the r9 flow MARKER-input'
/** A session id of the real shape that nobody created. */
const UNKNOWN_SESSION = 'f'.repeat(64)

export type Check = Readonly<{
  /** Acceptance item of the R9 closure (APP-12). 0 is the flow itself. */
  item: number
  name: string
  ok: boolean
  detail: string
}>

export type Step = Readonly<{
  label: string
  command: readonly string[]
  exitCode: number | null
  /** The parsed result of the CLI: `result`, `outcome`, `body`, `request`. */
  result: Record<string, unknown> | undefined
  stderr: string
}>

type HttpReplyBody = Readonly<{ status: number; body: string }>
type HttpReply = HttpReplyBody & Readonly<{ label: string }>

export type FlowRecord = Readonly<{
  startedAt: string
  runs: readonly RunRecord[]
  steps: readonly Step[]
  http: readonly HttpReply[]
  checks: readonly Check[]
}>

type RunRecord = Readonly<{
  label: string
  port: number
  startup: Rec | undefined
  pending: readonly string[]
  exitCode: number | null
  shutdown: Rec | undefined
  stderr: string
}>

const check = (item: number, name: string, ok: boolean, detail: string): Check => ({
  item,
  name,
  ok,
  detail: ok ? 'ok' : detail,
})

const shortJson = (value: unknown): string => JSON.stringify(value).slice(0, 300)

/** The part of a CLI result that two requests of the same shape must share: outcome and body. */
const answerOf = (run: CliRun): string =>
  JSON.stringify({ outcome: run.result?.['outcome'], body: run.result?.['body'] })

async function post(
  port: number,
  path: string,
  body: unknown,
): Promise<{ status: number; body: string }> {
  const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.text() }
}

const readHistory = (tenant: string, session: string, loginProof: string) => ({
  protocolVersion: 'session-public/1',
  messageId: 'r9-read-history',
  operation: 'read-history',
  body: { tenant, session, cursor: null, direction: 'forward', pageBytes: '65536' },
  loginProof,
})

function pendingRows(records: readonly Rec[]): string[] {
  return records
    .filter(record => record.kind === 'row-state' && record['state'] !== 'ACTIVE')
    .map(record => `${String(record['id'])}:${String(record['state'])}`)
}

/** Runs the whole flow. A failed judgment, or a step that cannot go on, is a failed check, not a throw. */
export async function runR9Flow(): Promise<FlowRecord> {
  const scratch = newScratch()
  const startedAt = new Date().toISOString()
  const steps: Step[] = []
  const http: HttpReply[] = []
  const runs: RunRecord[] = []
  const outputs: string[] = []
  const checks: Check[] = []
  let server: ServerHandle | undefined
  try {
    const port = await freePort()
    const operatorPath = join(scratch.base, 'operator.json')
    writeOperator(operatorPath, operatorLayer({ storageRoot: scratch.storageRoot, port }))
    const homes = {
      alice: join(scratch.base, 'home-alice'),
      bob: join(scratch.base, 'home-bob'),
    }
    const url = `http://127.0.0.1:${String(port)}`
    const cli = async (
      label: string,
      who: keyof typeof homes,
      args: readonly string[],
      credential?: string,
      home: string = homes[who],
    ): Promise<CliRun> => {
      const run = await runOmne({
        args,
        home,
        server: url,
        cwd: scratch.base,
        ...(credential === undefined ? {} : { credential }),
      })
      steps.push({
        label,
        command: run.command,
        exitCode: run.status,
        result: run.result,
        stderr: run.stderr,
      })
      outputs.push(run.stdout, run.stderr)
      return run
    }
    const start = async (label: string): Promise<ServerHandle> => {
      const handle = await startServer({
        stateRoot: scratch.stateRoot,
        operatorPath,
        port,
      })
      const records = handle.records()
      runs.push({
        label,
        port,
        startup: records.find(record => record.kind === 'startup-result'),
        pending: pendingRows(records),
        exitCode: null,
        shutdown: undefined,
        stderr: '',
      })
      return handle
    }
    const stop = async (handle: ServerHandle): Promise<ServerOutcome> => {
      const outcome = await handle.stop()
      const last = runs.length - 1
      const run = runs[last]
      if (run !== undefined)
        runs[last] = {
          ...run,
          exitCode: outcome.code,
          shutdown: outcome.records.find(record => record.kind === 'shutdown-result'),
          stderr: outcome.stderr,
        }
      outputs.push(outcome.stdout, outcome.stderr)
      return outcome
    }

    // --- run 1: the real tree accepts, a login reaches the Session face, another tenant is refused.
    server = await start('first start')
    const first = runs[0]
    checks.push(
      check(
        1,
        'the real tree is accepting with 7 real, 1 contract-double and 41 s0-double rows',
        first?.startup?.['accepting'] === true &&
          first.startup['outcome'] === 'ready' &&
          JSON.stringify(first.startup['implementations']) ===
            JSON.stringify({ real: 7, 'contract-double': 1, 's0-double': 41 }) &&
          first.pending.length === 0,
        `startup ${shortJson(first?.startup)}, not ACTIVE: ${(first?.pending ?? []).join(', ')}`,
      ),
    )

    const registerAlice = await cli(
      'register alice',
      'alice',
      ['register', '--login-identifier', 'alice'],
      CREDENTIALS.alice,
    )
    const loginAlice = await cli(
      'login alice',
      'alice',
      ['login', '--login-identifier', 'alice'],
      CREDENTIALS.alice,
    )
    const registerBob = await cli(
      'register bob',
      'bob',
      ['register', '--login-identifier', 'bob'],
      CREDENTIALS.bob,
    )
    const loginBob = await cli(
      'login bob',
      'bob',
      ['login', '--login-identifier', 'bob'],
      CREDENTIALS.bob,
    )
    const created = await cli('alice creates a session', 'alice', [
      'create-session',
      '--definition',
      'assistant',
    ])
    const session = created.status === 0 ? String(bodyOf(created)['session']) : ''
    const sent = await cli('alice sends an input', 'alice', [
      'send-input',
      '--session',
      session,
      '--text',
      INPUT_TEXT,
    ])
    const flowOk = [registerAlice, loginAlice, registerBob, loginBob, created, sent]
    checks.push(
      check(
        2,
        'register, login, create-session and send-input exit 0 with outcome succeeded',
        flowOk.every(run => run.status === 0 && run.result?.['outcome'] === 'succeeded'),
        flowOk.map(run => `${run.command.slice(1, 2).join('')}=${String(run.status)}`).join(' '),
      ),
    )
    if (flowOk.some(run => run.status !== 0)) throw new Error('the flow stopped before the checks')

    const aliceProof = savedLoginProof(homes.alice)
    const bobProof = savedLoginProof(homes.bob)
    const aliceTenant = savedTenant(homes.alice)
    const bobTenant = savedTenant(homes.bob)

    // The input is in the history that the Session double keeps: it arrived and was accepted.
    const history = await post(port, SESSION_PATH, readHistory(aliceTenant, session, aliceProof))
    http.push({ label: 'alice reads her history', ...history })
    outputs.push(history.body)
    checks.push(
      check(
        2,
        'the sent input is read back from the session history with its original text',
        history.status === 200 && history.body.includes(INPUT_TEXT),
        `status ${String(history.status)}`,
      ),
    )

    // Another tenant: with the owner's tenant text, and with its own tenant text, on the real
    // session and on a session nobody created.
    const bobOnRealWithAlice = await cli('bob sends to the session with the owner tenant', 'bob', [
      'send-input',
      '--session',
      session,
      '--text',
      'x',
      '--tenant',
      aliceTenant,
    ])
    const bobOnUnknownWithAlice = await cli(
      'bob sends to an unknown session with the owner tenant',
      'bob',
      ['send-input', '--session', UNKNOWN_SESSION, '--text', 'x', '--tenant', aliceTenant],
    )
    const bobOnReal = await cli('bob sends to the session with his own tenant', 'bob', [
      'send-input',
      '--session',
      session,
      '--text',
      'x',
    ])
    const bobOnUnknown = await cli('bob sends to an unknown session with his own tenant', 'bob', [
      'send-input',
      '--session',
      UNKNOWN_SESSION,
      '--text',
      'x',
    ])
    const refusals = [bobOnRealWithAlice, bobOnUnknownWithAlice, bobOnReal, bobOnUnknown]
    checks.push(
      check(
        3,
        'the other tenant is denied on the session, with exit 3 and outcome denied',
        refusals.every(run => run.status === 3 && run.result?.['outcome'] === 'denied'),
        refusals.map(run => `${String(run.status)}/${String(run.result?.['outcome'])}`).join(' '),
      ),
      check(
        3,
        'the denial of the real session equals the denial of an unknown session, byte for byte',
        answerOf(bobOnRealWithAlice) === answerOf(bobOnUnknownWithAlice) &&
          answerOf(bobOnReal) === answerOf(bobOnUnknown),
        `${answerOf(bobOnRealWithAlice)} | ${answerOf(bobOnUnknownWithAlice)} | ${answerOf(bobOnReal)} | ${answerOf(bobOnUnknown)}`,
      ),
    )
    // Reading the history: the same four pairs, raw bodies, same message id.
    const reads = {
      ownerTenantReal: await post(port, SESSION_PATH, readHistory(aliceTenant, session, bobProof)),
      ownerTenantUnknown: await post(
        port,
        SESSION_PATH,
        readHistory(aliceTenant, UNKNOWN_SESSION, bobProof),
      ),
      ownTenantReal: await post(port, SESSION_PATH, readHistory(bobTenant, session, bobProof)),
      ownTenantUnknown: await post(
        port,
        SESSION_PATH,
        readHistory(bobTenant, UNKNOWN_SESSION, bobProof),
      ),
    }
    for (const [label, reply] of Object.entries(reads)) {
      http.push({ label: `bob reads history: ${label}`, ...reply })
      outputs.push(reply.body)
    }
    const sameBytes = (a: HttpReplyBody, b: HttpReplyBody): boolean =>
      a.status === b.status && a.body === b.body
    checks.push(
      check(
        3,
        'the other tenant reading the history is denied, and the answer does not tell a real session from an unknown one',
        Object.values(reads).every(reply => !reply.body.includes(INPUT_TEXT)) &&
          Object.values(reads).every(reply => reply.body.includes('denied')) &&
          sameBytes(reads.ownerTenantReal, reads.ownerTenantUnknown) &&
          sameBytes(reads.ownTenantReal, reads.ownTenantUnknown),
        Object.entries(reads)
          .map(([label, reply]) => `${label}: ${String(reply.status)} ${reply.body.slice(0, 160)}`)
          .join(' | '),
      ),
    )

    const firstStop = await stop(server)
    server = undefined
    checks.push(
      check(
        4,
        'the first process stops in order: exit 0 and shutdown-result settled',
        firstStop.code === 0 && runs[0]?.shutdown?.['overall'] === 'settled',
        `exit ${String(firstStop.code)}, ${shortJson(runs[0]?.shutdown)}`,
      ),
    )

    // --- run 2: same state root. The account, its login and the old proof are still there.
    const oldHome = join(scratch.base, 'home-alice-before-restart')
    mkdirSync(oldHome)
    cpSync(homes.alice, oldHome, { recursive: true })
    const tampered = join(scratch.base, 'home-alice-tampered')
    mkdirSync(tampered)
    const saved = JSON.parse(readFileSync(join(homes.alice, 'login.json'), 'utf8')) as {
      loginProof: string
    }
    writeFileSync(
      join(tampered, 'login.json'),
      JSON.stringify({
        ...saved,
        loginProof: `${saved.loginProof.slice(0, -1)}${saved.loginProof.endsWith('A') ? 'B' : 'A'}`,
      }),
      { mode: 0o600 },
    )

    server = await start('restart on the same state root')
    const second = runs[1]
    checks.push(
      check(
        4,
        'the restarted tree is accepting again',
        second?.startup?.['accepting'] === true && second.pending.length === 0,
        `startup ${shortJson(second?.startup)}, not ACTIVE: ${(second?.pending ?? []).join(', ')}`,
      ),
    )
    const relogin = await cli(
      'login alice after the restart',
      'alice',
      ['login', '--login-identifier', 'alice'],
      CREDENTIALS.alice,
    )
    const oldProofUse = await cli(
      'the proof from before the restart creates a session',
      'alice',
      ['create-session', '--definition', 'assistant'],
      undefined,
      oldHome,
    )
    const tamperedUse = await cli(
      'a proof with one changed character is not recognized',
      'alice',
      ['create-session', '--definition', 'assistant'],
      undefined,
      tampered,
    )
    checks.push(
      check(
        4,
        'after the restart the account logs in and the old login proof is still recognized',
        relogin.status === 0 &&
          relogin.result?.['outcome'] === 'succeeded' &&
          oldProofUse.status === 0 &&
          oldProofUse.result?.['outcome'] === 'succeeded',
        `login ${String(relogin.status)}, old proof ${String(oldProofUse.status)} ${oldProofUse.stdout.slice(0, 200)}`,
      ),
      check(
        4,
        'a changed proof is refused after the restart (control for the previous check)',
        tamperedUse.status !== 0 && tamperedUse.result?.['outcome'] !== 'succeeded',
        `exit ${String(tamperedUse.status)} ${tamperedUse.stdout.slice(0, 200)}`,
      ),
    )
    // The governance reply to a legitimate client does carry the proof. It is the positive control
    // for the search below, so it is kept out of `outputs`.
    const rawIssue = await post(port, GOVERNANCE_PATH, {
      protocolVersion: 'governance-public/1',
      messageId: 'r9-raw-issue',
      operation: 'issue-login',
      body: { loginIdentifier: 'alice', credential: CREDENTIALS.alice },
    })
    const rawProof = (JSON.parse(rawIssue.body) as { body: { loginProof: string } }).body.loginProof
    const secondStop = await stop(server)
    server = undefined
    checks.push(
      check(
        4,
        'the second process stops in order: exit 0 and shutdown-result settled',
        secondStop.code === 0 && runs[1]?.shutdown?.['overall'] === 'settled',
        `exit ${String(secondStop.code)}, ${shortJson(runs[1]?.shutdown)}`,
      ),
    )

    // --- no secret in anything that left a process or a reply.
    const secrets = {
      'alice credential': [CREDENTIALS.alice],
      'bob credential': [CREDENTIALS.bob],
      'alice login proofs': [aliceProof, savedLoginProof(homes.alice), rawProof],
      'bob login proof': [bobProof],
      'cursor signing key': cursorKeySpellings(scratch.stateRoot),
    }
    const seen = outputs.join('\n')
    const found = leaked(seen, secrets)
    checks.push(
      check(
        5,
        'no credential, login proof or cursor signing key in any CLI or server output, log or reply',
        found.length === 0,
        `leaked: ${found.join(', ')}`,
      ),
    )
    // Positive controls: the search sees each kind of secret where it is.
    const controls = [
      leaked(rawIssue.body, secrets).includes('alice login proofs'),
      leaked(readFileSync(join(homes.alice, 'login.json'), 'utf8'), secrets).includes(
        'alice login proofs',
      ),
      leaked(cursorKeySpellings(scratch.stateRoot).join('\n'), secrets).includes(
        'cursor signing key',
      ),
      leaked(`password=${CREDENTIALS.bob}`, secrets).includes('bob credential'),
    ]
    checks.push(
      check(
        5,
        'control: the search finds the proof in the raw reply and in the login state file, the key, and a credential',
        controls.every(Boolean),
        `control results ${controls.join(',')}`,
      ),
    )

    return { startedAt, runs, steps, http, checks }
  } catch (error) {
    // A step that cannot go on (the flow needs a session to continue) ends the story here. The
    // failure is a check, so the record still says how far it got.
    checks.push(check(0, 'the flow ran to its end', false, String(error)))
    return { startedAt, runs, steps, http, checks }
  } finally {
    await server?.kill()
    scratch.remove()
  }
}

export const failed = (checks: readonly Check[]): Check[] => checks.filter(entry => !entry.ok)
