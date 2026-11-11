// @module-tag slow
// 慢：起真实的 `dist/bin.js serve` 进程、真实的 SQLite 存储、本机 HTTPS 模型网关替身，为每条命令起一个 `omne` 进程。
// 先构建 harness-server 与 apps/cli。
//
// The session diagnostics projection in the application (#1140 A5, RFC-0013 A line): the two smoke
// failures the RFC starts from, read back through the real CLI from a real `serve` process.
// - E1: two concurrent sessions of one tenant. The first call holds its share of the result
//   capacity (`model-records.limits.capacity.bytes` 1000000, `agent-context.resultCapacity.bytes`
//   524288). The share is full only for now, so the second Run waits instead of ending
//   `model-refused` (#1174), and goes on once the first call settles.
// - E2: the gateway answers HTTP 504 on the streaming request (another tenant: the capacity of E1
//   is per tenant). The Run ends `no-reply` with the fault, and the dispatch row of the same call,
//   from `modelDiagnostics`, ends the same way.
// - E3: another login reads the session: `denied`, exit 3.
// - E4: the process with the telemetry row and the new injects starts in the release order and
//   ends with `shutdown-result` as the last stdout line (C4 does not regress).
// - E5: the local single-user profile gives the projection its configuration; `serve` without
//   arguments starts and `read-session-diagnostics` answers.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveLocations } from '../../../src/local/locations.ts'
import {
  localOperatorLayer,
  type LocalOperatorInput,
} from '../../../src/local/operator-defaults.ts'
import { captureShellEnvironment } from '../../../src/local/settings.ts'
import {
  bodyOf,
  distributionPath,
  freePort,
  killTree,
  newScratch,
  operatorLayer,
  runOmne,
  savedTenant,
  serverBin,
  startServer,
  writeOperator,
  type CliRun,
  type Scratch,
  type ServerHandle,
  type ServerOutcome,
} from '../../r9/support.ts'
import { readFileSync } from 'node:fs'
import {
  answer504,
  diagnosticsBodyOf,
  modelCallsOf,
  startScenarioGateway,
  structuredCauseOf,
  untilRunEnded,
  type Cli,
  type ScenarioGateway,
} from './support.ts'

const CREDENTIAL_A = 'alice-pw-DIAG-9a1c'
const CREDENTIAL_B = 'bob-pw-DIAG-2e7f'
/** The text of the input whose Model call the gateway holds open. */
const HELD_TEXT = 'HOLD-ME while the second session waits'
const RUN_END_TIMEOUT_MS = 90_000
/** How long the second Run must stay without a terminal while the first call holds the share. */
const WAIT_WINDOW_MS = 10_000

/** The entry kinds the projection reads (server-entry `PROJECTED_KINDS`), as the local profile discloses them all. */
const PROJECTED_KINDS = [
  'run.started',
  'run.attempt-started',
  'run.attempt-released',
  'run.attempt-exited',
  'control.requested',
  'control.progress',
  'run.terminal',
  'call.bound',
  'call.execution-fact',
  'message.user',
  'message.assistant',
  'message.tool',
  'message.tool_internal',
  'message.system_reminder',
  'message.compaction',
]

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

async function until(ready: () => boolean, what: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(50)
  }
}

async function registerAndLogin(cli: Cli, who: string, credential: string): Promise<void> {
  for (const step of [
    await cli(['register', '--login-identifier', who], credential),
    await cli(['login', '--login-identifier', who], credential),
  ])
    expect(step.status, step.stderr).toBe(0)
}

async function createSession(cli: Cli): Promise<string> {
  const created = await cli(['create-session', '--definition', 'assistant'])
  expect(created.status, created.stderr).toBe(0)
  return String(bodyOf(created)['session'])
}

async function sendInput(cli: Cli, session: string, text: string): Promise<void> {
  const sent = await cli(['send-input', '--session', session, '--text', text])
  expect(sent.status, sent.stderr).toBe(0)
}

describe('session diagnostics over real processes: the two smoke failures', () => {
  let scratch: Scratch
  let gateway: ScenarioGateway
  let server: ServerHandle
  let outcome: ServerOutcome | undefined
  let port: number
  const homes = { alice: '', bob: '' }
  let alice: Cli
  let bob: Cli
  const sessions = { held: '', waiting: '', upstream: '' }

  beforeAll(async () => {
    scratch = newScratch('diagnostics-flow-')
    port = await freePort()
    homes.alice = join(scratch.base, 'home-alice')
    homes.bob = join(scratch.base, 'home-bob')
    // The call of the held input stays open until `release`; every other call is answered 504.
    gateway = await startScenarioGateway(request =>
      request.body.includes(HELD_TEXT) ? { kind: 'hold' } : answer504,
    )
    const operatorPath = join(scratch.base, 'operator.json')
    writeOperator(
      operatorPath,
      operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: gateway.url }),
    )
    server = await startServer({
      stateRoot: scratch.stateRoot,
      operatorPath,
      port,
      extraCaPath: gateway.certPath,
    })
    const cliOf =
      (home: string): Cli =>
      (args, credential) =>
        runOmne({
          args: [...args],
          home,
          server: `http://127.0.0.1:${String(port)}`,
          cwd: scratch.base,
          ...(credential === undefined ? {} : { credential }),
        })
    alice = cliOf(homes.alice)
    bob = cliOf(homes.bob)
    await registerAndLogin(alice, 'alice', CREDENTIAL_A)
    await registerAndLogin(bob, 'bob', CREDENTIAL_B)
  }, 120_000)

  afterAll(async () => {
    if (outcome === undefined) await server?.kill()
    await gateway?.close()
    scratch?.remove()
  })

  it(
    'E1: the second concurrent Run of the tenant waits while the first call holds the share, and goes on once it settles',
    { timeout: 240_000 },
    async () => {
      sessions.held = await createSession(alice)
      sessions.waiting = await createSession(alice)
      await sendInput(alice, sessions.held, HELD_TEXT)
      // The first call is in flight: its share of the capacity is reserved until it settles.
      await until(() => gateway.held() >= 1, 'the first Model call to reach the gateway', 60_000)
      await sendInput(alice, sessions.waiting, 'the second input of the same tenant')

      const readRun = async () =>
        diagnosticsBodyOf(
          await alice(['read-session-diagnostics', '--session', sessions.waiting, '--json']),
        )?.runs[0]
      const startedBy = Date.now() + 60_000
      while ((await readRun()) === undefined) {
        if (Date.now() > startedBy) throw new Error('timed out waiting for the second Run')
        await sleep(500)
      }
      const waitedUntil = Date.now() + WAIT_WINDOW_MS
      while (Date.now() < waitedUntil) {
        const run = await readRun()
        expect(run?.['terminal'], JSON.stringify(run)).toBeNull()
        await sleep(1000)
      }

      // The first call settles and frees the share; the second call then reaches the gateway,
      // which answers 504 to every call but the held one.
      gateway.release(answer504)
      const { run, body } = await untilRunEnded(alice, sessions.waiting, RUN_END_TIMEOUT_MS)
      expect(structuredCauseOf(run)).toEqual({
        kind: 'no-reply',
        cause: 'upstream-unavailable',
        upstreamStatus: '504',
      })
      // Every port answered: no source of the page is `unsupported`.
      expect(body.gaps.filter(gap => gap.reason === 'unsupported')).toEqual([])

      const text = await alice(['read-session-diagnostics', '--session', sessions.waiting])
      expect(text.status, text.stderr).toBe(0)
      expect(text.stdout).not.toContain('model-refused')
    },
  )

  it(
    'E2: an upstream 504 on the stream ends the Run no-reply with the cause and the status',
    { timeout: 240_000 },
    async () => {
      // Another tenant, so that the 504 of this Run does not depend on alice's calls.
      sessions.upstream = await createSession(bob)
      await sendInput(bob, sessions.upstream, 'the upstream answers 504')

      const { run, body } = await untilRunEnded(bob, sessions.upstream, RUN_END_TIMEOUT_MS)
      expect(run['terminal']).toMatchObject({ outcome: 'failed' })
      expect(structuredCauseOf(run)).toEqual({
        kind: 'no-reply',
        cause: 'upstream-unavailable',
        upstreamStatus: '504',
      })
      expect(body.gaps.filter(gap => gap.reason === 'unsupported')).toEqual([])

      const text = await bob(['read-session-diagnostics', '--session', sessions.upstream])
      expect(text.status, text.stderr).toBe(0)
      expect(text.stdout).toContain('reason: no-reply upstream-unavailable 504')
    },
  )

  it(
    'E2b: the login reads its Model dispatch failure and explicit account state',
    { timeout: 120_000 },
    async () => {
      const { run } = await untilRunEnded(bob, sessions.upstream, RUN_END_TIMEOUT_MS)
      const [call] = modelCallsOf(run)
      expect(run['calls'], JSON.stringify(run)).toEqual({ registered: '1', projected: '1' })
      expect(typeof call?.['reference'], JSON.stringify(run)).toBe('string')
      expect(call?.['call']).toMatchObject({ kind: 'found', phase: 'settled' })
      expect(call?.['dispatches']).toEqual([
        expect.objectContaining({
          outcome: { kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: '504' },
          account: { kind: 'unknown', reason: 'not-recorded' },
        }),
      ])
      expect(call?.['coverage']).toBe('complete-through-snapshot')
      const text = await bob(['read-session-diagnostics', '--session', sessions.upstream])
      expect(text.status, text.stderr).toBe(0)
      expect(text.stdout).toContain('reason: no-reply upstream-unavailable 504')
    },
  )

  it('E3: another login reads the session: denied, exit 3', { timeout: 120_000 }, async () => {
    const read = await bob([
      'read-session-diagnostics',
      '--session',
      sessions.waiting,
      '--tenant',
      savedTenant(homes.bob),
      '--json',
    ])
    expect(read.status).toBe(3)
    expect(read.result).toMatchObject({ outcome: 'denied' })
    expect(read.stdout).not.toContain('model-refused')
  })

  it(
    'E4: with telemetry and the new injects the tree starts in the release order, and shutdown-result is the last line',
    { timeout: 120_000 },
    async () => {
      outcome = await server.stop()
      const { records, stdout } = outcome
      expect(stdout.endsWith('\n')).toBe(true)
      expect(records.at(-1)?.kind).toBe('shutdown-result')
      expect(records.filter(record => record.kind === 'shutdown-result')).toHaveLength(1)
      expect(records.find(record => record.kind === 'startup-result')).toMatchObject({
        accepting: true,
        outcome: 'ready',
      })
      const release = JSON.parse(readFileSync(distributionPath, 'utf8')) as {
        rows: { id: string }[]
      }
      expect(records.filter(record => record.kind === 'tree').map(record => record['id'])).toEqual(
        release.rows.map(row => row.id),
      )
      const states = records.filter(record => record.kind === 'row-state')
      expect(states.filter(record => record['state'] !== 'ACTIVE')).toEqual([])
      const activeIndex = (id: string) => states.findIndex(record => record['id'] === id)
      for (const provider of ['agent-journal', 'model-records', 'model-host'])
        expect(activeIndex(provider), provider).toBeLessThan(activeIndex('server-entry'))
      expect(
        records.find(record => record.kind === 'tree' && record['id'] === 'telemetry'),
      ).toMatchObject({ implementation: 'real', telemetry: { implementation: 'node' } })
      expect(records.at(-1)?.['telemetry']).toMatchObject({ kind: 'closed' })
    },
  )
})

describe('E5: the local single-user profile', () => {
  const memberDir = join(distributionPath, '..', '..')
  const distribution = JSON.parse(
    readFileSync(join(memberDir, 'config', 'serve.distribution.json'), 'utf8'),
  ) as unknown

  function input(): LocalOperatorInput {
    const located = resolveLocations({
      platform: 'linux',
      env: { OMNE_SERVER_HOME: '/h' },
      home: '/u',
    })
    if (located.kind !== 'located') throw new Error('fixture')
    return {
      distribution,
      locations: located.locations,
      settings: {
        version: 1,
        port: 8965,
        workspace: '/work',
        shell: '/bin/bash',
        shellEnvironment: captureShellEnvironment('linux', { PATH: '/usr/bin:/bin' }),
      },
      shutdownDeadlineMs: 10_000,
      platform: 'linux',
    }
  }

  it('gives server-entry the whole projected kind list with its two bounds, and model-records the tenant-self read with a retention adoption', () => {
    const layer = localOperatorLayer(input())
    const configOf = (id: string) => layer.ops.find(op => op.id === id)?.config
    const entry = configOf('server-entry') as { diagnosticsKinds?: string[] } | undefined
    expect([...(entry?.diagnosticsKinds ?? [])].sort()).toEqual([...PROJECTED_KINDS].sort())
    expect(entry).toMatchObject({ maxRuns: expect.any(Number), maxCallsPerRun: expect.any(Number) })
    expect(configOf('model-records')).toMatchObject({
      diagnostics: {
        diagnosticsRead: 'tenant-self',
        retention: {
          owner: expect.any(String),
          name: expect.any(String),
          revision: expect.any(String),
          digest: expect.any(String),
        },
      },
    })
  })

  it(
    '`serve` without arguments starts, and `read-session-diagnostics` answers a complete page with no undisclosed kind',
    { timeout: 180_000 },
    async () => {
      const scratch = newScratch('diagnostics-local-')
      const home = join(scratch.base, 'server-home')
      const cliHome = join(scratch.base, 'cli-home')
      mkdirSync(cliHome)
      const env: NodeJS.ProcessEnv = {
        PATH: process.env['PATH'] ?? '',
        HOME: scratch.base,
        USERPROFILE: scratch.base,
        OMNE_SERVER_HOME: home,
        NO_COLOR: '1',
      }
      for (const name of ['SystemRoot', 'SystemDrive', 'TEMP', 'TMP', 'LOCALAPPDATA'])
        if (process.env[name] !== undefined) env[name] = process.env[name]
      const localPort = await freePort()
      const sentinel = ['sk', 'or', 'v1', 'sentinel', randomBytes(12).toString('hex')].join('-')
      try {
        const setup = await runProcess(
          serverBin,
          ['setup', '--port', String(localPort)],
          env,
          scratch.base,
          `${sentinel}\n`,
        )
        expect(setup.code, setup.stderr).toBe(0)
        const cli: Cli = (args, credential) =>
          runOmne({
            args: [...args],
            home: cliHome,
            server: `http://127.0.0.1:${String(localPort)}`,
            cwd: scratch.base,
            ...(credential === undefined ? {} : { credential }),
          })
        let read: CliRun | undefined
        const served = await serveWithoutArguments(env, scratch.base, async () => {
          await registerAndLogin(cli, 'carol', 'carol-pw-DIAG-4b0d')
          const session = await createSession(cli)
          // No input: the local profile routes Model calls to a real supplier (R2-D258).
          read = await cli(['read-session-diagnostics', '--session', session, '--json'])
        })
        expect(served.duringError).toBeUndefined()
        expect(served.code, served.stderr).toBe(0)
        expect(read?.status, read?.stderr).toBe(0)
        const body = diagnosticsBodyOf(read!)
        expect(body).toMatchObject({ runs: [], complete: true })
        expect(body?.gaps.filter(gap => gap.reason === 'not-disclosed')).toEqual([])
        expect(served.stdout).not.toContain(sentinel)
        expect(read?.stdout).not.toContain(sentinel)
      } finally {
        scratch.remove()
      }
    },
  )
})

type Outcome = { code: number | null; stdout: string; stderr: string }

function runProcess(
  bin: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  stdin = '',
): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
  })
}

/** Starts `serve` without arguments, runs `during` once it accepts, then closes stdin. */
function serveWithoutArguments(
  env: NodeJS.ProcessEnv,
  cwd: string,
  during: () => Promise<void>,
): Promise<Outcome & { duringError?: unknown }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [serverBin, 'serve', '--stop-on-stdin-close'], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let started = false
    let duringError: unknown
    const timer = setTimeout(() => killTree(child), 120_000)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
      if (!started && stdout.includes('"kind":"startup-result"')) {
        started = true
        void during()
          .catch((error: unknown) => {
            duringError = error
          })
          .finally(() => child.stdin.end())
      }
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, ...(duringError === undefined ? {} : { duringError }) })
    })
  })
}
