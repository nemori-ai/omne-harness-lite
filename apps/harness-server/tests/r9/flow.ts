import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startModelGateway, type ModelGateway } from '../fixtures/model-gateway.ts'
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
const UNKNOWN_SESSION = 'f'.repeat(64)
const RUN_END_TIMEOUT_MS = 60_000
const RUN_END_POLL_MS = 500

export type Check = Readonly<{
  item: number
  name: string
  ok: boolean
  detail: string
}>

export type Step = Readonly<{
  label: string
  command: readonly string[]
  exitCode: number | null
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

function withRunEntries(layer: unknown): unknown {
  const { ops } = layer as { ops: Readonly<{ kind: string; id: string; config?: object }>[] }
  return {
    ops: ops.map(op =>
      op.id === 'server-entry'
        ? {
            ...op,
            config: {
              ...op.config,
              historyKinds: ['message.user', 'message.assistant', 'run.started', 'run.terminal'],
            },
          }
        : op,
    ),
  }
}

function pendingRows(records: readonly Rec[]): string[] {
  return records
    .filter(record => record.kind === 'row-state' && record['state'] !== 'ACTIVE')
    .map(record => `${String(record['id'])}:${String(record['state'])}`)
}

export async function runR9Flow(): Promise<FlowRecord> {
  const scratch = newScratch()
  const startedAt = new Date().toISOString()
  const steps: Step[] = []
  const http: HttpReply[] = []
  const runs: RunRecord[] = []
  const outputs: string[] = []
  const checks: Check[] = []
  let server: ServerHandle | undefined
  let gateway: ModelGateway | undefined
  try {
    const port = await freePort()
    gateway = await startModelGateway()
    const modelGateway = gateway
    const operatorPath = join(scratch.base, 'operator.json')
    writeOperator(
      operatorPath,
      withRunEntries(
        operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: modelGateway.url }),
      ),
    )
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
        extraCaPath: modelGateway.certPath,
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

    server = await start('first start')
    const first = runs[0]
    checks.push(
      check(
        1,
        'the real tree is accepting with 54 real and 2 s0-double rows',
        first?.startup?.['accepting'] === true &&
          first.startup['outcome'] === 'ready' &&
          JSON.stringify(first.startup['implementations']) ===
            JSON.stringify({ real: 57, 'contract-double': 0, 's0-double': 2 }) &&
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
      '--tenant',
      bobTenant,
    ])
    const bobOnUnknown = await cli('bob sends to an unknown session with his own tenant', 'bob', [
      'send-input',
      '--session',
      UNKNOWN_SESSION,
      '--text',
      'x',
      '--tenant',
      bobTenant,
    ])
    const refusals = [bobOnRealWithAlice, bobOnUnknownWithAlice, bobOnReal, bobOnUnknown]
    const isDenied = (run: CliRun): boolean =>
      run.status === 3 && run.result?.['outcome'] === 'denied'
    const isUnregistered = (run: CliRun): boolean =>
      run.status === 4 && run.result?.['outcome'] === 'basis-unavailable'
    checks.push(
      check(
        3,
        'the other tenant is refused on the session: denied under the owner tenant, denied or unavailable under its own unregistered tenant',
        isDenied(bobOnRealWithAlice) &&
          isDenied(bobOnUnknownWithAlice) &&
          [bobOnReal, bobOnUnknown].every(run => isDenied(run) || isUnregistered(run)),
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
        'the other tenant reading the history is refused, and the answer does not tell a real session from an unknown one',
        Object.values(reads).every(reply => !reply.body.includes(INPUT_TEXT)) &&
          [reads.ownerTenantReal, reads.ownerTenantUnknown].every(reply =>
            reply.body.includes('"outcome":"denied"'),
          ) &&
          [reads.ownTenantReal, reads.ownTenantUnknown].every(
            reply =>
              reply.body.includes('"outcome":"denied"') ||
              reply.body.includes('"outcome":"basis-unavailable"'),
          ) &&
          sameBytes(reads.ownerTenantReal, reads.ownerTenantUnknown) &&
          sameBytes(reads.ownTenantReal, reads.ownTenantUnknown),
        Object.entries(reads)
          .map(([label, reply]) => `${label}: ${String(reply.status)} ${reply.body.slice(0, 160)}`)
          .join(' | '),
      ),
    )

    const ended = await waitForRunEnd(port, aliceTenant, session, aliceProof)
    outputs.push(ended.body)
    checks.push(
      check(
        4,
        'the Run that the input started ends before the first stop (run.terminal in the history)',
        ended.ok,
        `no run.terminal after ${String(RUN_END_TIMEOUT_MS)} ms: status ${String(ended.status)}`,
      ),
      check(
        4,
        'the Model call of that Run went to the local gateway, not to a real supplier',
        modelGateway.requests() > 0,
        `the local gateway saw ${String(modelGateway.requests())} requests`,
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
    checks.push(check(0, 'the flow ran to its end', false, String(error)))
    return { startedAt, runs, steps, http, checks }
  } finally {
    await server?.kill()
    await gateway?.close()
    scratch.remove()
  }
}

async function waitForRunEnd(
  port: number,
  tenant: string,
  session: string,
  loginProof: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const deadline = Date.now() + RUN_END_TIMEOUT_MS
  for (;;) {
    const reply = await post(port, SESSION_PATH, readHistory(tenant, session, loginProof))
    if (reply.status === 200 && reply.body.includes('"run.terminal"')) return { ok: true, ...reply }
    if (Date.now() >= deadline) return { ok: false, ...reply }
    await new Promise(resolve => setTimeout(resolve, RUN_END_POLL_MS))
  }
}

export const failed = (checks: readonly Check[]): Check[] => checks.filter(entry => !entry.ok)
