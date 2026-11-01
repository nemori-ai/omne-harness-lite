// @module-tag slow
// 慢：每个用例在本进程装真实 SQLite 存储，并为每条命令起一个 `omne` 子进程。
// R9 贯通的进程内一层：发行树（真实行与契约替身行，运维者层给路径和端口）在本进程里运行，`omne` CLI 经回环端口
// 连它。会话替身换成带观察者的那一份，所以能看到到达会话面的主体。进程外看不到替身内部，这一层补上进程级贯通
// （`flow.ts`）看不到的证据：输入带着装配入口签发、并被访问检查核验通过的代租户主体到达。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as cordis from '../../src/cordis.ts'
import {
  createSessionProviderRow,
  type SessionProviderArrival,
} from '../../src/rows/session-provider/index.ts'
import { runServe, type S0Record, type ServeResult } from '../../src/run.ts'
import { connectable, until } from '../rows/server-entry/support.ts'
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
  type CliRun,
} from './support.ts'

const CREDENTIAL_A = 'alice-pw-ARRIVAL-1b7e'
const CREDENTIAL_B = 'bob-pw-ARRIVAL-5d02'
const UNKNOWN_SESSION = 'f'.repeat(64)

type Who = 'alice' | 'bob'
type Tools = Readonly<{
  cli: (who: Who, args: readonly string[], credential?: string) => Promise<CliRun>
  arrivals: SessionProviderArrival[]
  homes: Record<Who, string>
  stateRoot: string
}>

const release: unknown = JSON.parse(
  readFileSync(new URL('../../config/serve.distribution.json', import.meta.url), 'utf8'),
)

/**
 * Runs the release tree in this process with the observing double and gives `scenario` the CLI and
 * the arrivals. The tree is stopped in order afterwards. Returns what the scenario returned and the
 * whole run (result, records and stderr). `runServe` is called directly, not through `serveOnce`,
 * because the scenario needs the state root: the cursor signing key file lives there.
 */
type Run = Readonly<{
  result: ServeResult
  records: readonly S0Record[]
  stderr: readonly string[]
  of: (kind: string) => S0Record[]
}>

async function withTree<T>(
  scenario: (tools: Tools) => Promise<T>,
): Promise<{ value: T; run: Run }> {
  const dir = newScratch('r9-arrival-')
  const port = await freePort()
  const arrivals: SessionProviderArrival[] = []
  const homes = { alice: join(dir.base, 'home-alice'), bob: join(dir.base, 'home-bob') }
  const controller = new AbortController()
  const records: S0Record[] = []
  const stderr: string[] = []
  const finished: Promise<Run> = runServe({
    distribution: release,
    operator: operatorLayer({ storageRoot: dir.storageRoot, port }),
    plugins: {
      ...cordis,
      sessionProviderRow: createSessionProviderRow({ observe: arrival => arrivals.push(arrival) }),
    },
    stateRoot: dir.stateRoot,
    stop: controller.signal,
    readinessTimeoutMs: 15_000,
    shutdownDeadlineMs: 5000,
    write: record => records.push(record),
    stderr: line => stderr.push(line),
  }).then(result => ({
    result,
    records,
    stderr,
    of: kind => records.filter(record => record.kind === kind),
  }))
  let ended = false
  void finished.then(
    () => (ended = true),
    () => (ended = true),
  )
  try {
    await until(
      async () => {
        if (ended) throw new Error('the tree ended before the entry listened')
        return connectable('127.0.0.1', port)
      },
      `port ${String(port)} to listen`,
      20_000,
    )
    const value = await scenario({
      arrivals,
      homes,
      stateRoot: dir.stateRoot,
      cli: (who, args, credential) =>
        runOmne({
          args: [...args],
          home: homes[who],
          server: `http://127.0.0.1:${String(port)}`,
          cwd: dir.base,
          ...(credential === undefined ? {} : { credential }),
        }),
    })
    controller.abort('test: stop')
    return { value, run: await finished }
  } finally {
    controller.abort('test: stop')
    await finished.catch(() => undefined)
    dir.remove()
  }
}

async function registerAndLogin(tools: Tools, who: Who, credential: string): Promise<CliRun[]> {
  const registered = await tools.cli(who, ['register', '--login-identifier', who], credential)
  const login = await tools.cli(who, ['login', '--login-identifier', who], credential)
  return [registered, login]
}

describe('R9 release tree, in process: the principal that reaches the Session face', () => {
  it('an input sent through the CLI arrives as the acting-for-tenant principal that server-entry signed and the access check let through', async () => {
    const { value, run } = await withTree(async tools => {
      const outputs: string[] = []
      const logins = await registerAndLogin(tools, 'alice', CREDENTIAL_A)
      const created = await tools.cli('alice', ['create-session', '--definition', 'assistant'])
      const session = String(bodyOf(created)['session'])
      const sent = await tools.cli('alice', [
        'send-input',
        '--session',
        session,
        '--text',
        'arrival check',
      ])
      for (const step of [...logins, created, sent]) {
        expect(step.status).toBe(0)
        outputs.push(step.stdout, step.stderr)
      }
      const proofFile = readFileSync(join(tools.homes.alice, 'login.json'), 'utf8')
      return {
        arrivals: [...tools.arrivals],
        outputs: outputs.join('\n'),
        proofFile,
        secrets: {
          credential: [CREDENTIAL_A],
          proof: [savedLoginProof(tools.homes.alice)],
          key: cursorKeySpellings(tools.stateRoot),
        },
      }
    })

    expect(run.result.exitCode).toBe(0)
    expect(run.of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
    expect(run.of('startup-result')[0]).toMatchObject({
      accepting: true,
      implementations: { real: 7, 'contract-double': 1, 's0-double': 41 },
    })
    // The face saw the create and the input, each as the principal that the entry's own system
    // component acts with for the tenant. `access: allowed` is the access check, which asks the
    // principal verifier first: a principal that the verifier does not trust is not let through.
    expect(value.arrivals).toEqual([
      {
        method: 'management.create',
        principalKind: 'acting-for-tenant',
        actorComponent: 'server-entry',
        access: 'allowed',
        outcome: 'ok',
      },
      {
        method: 'work.accept',
        principalKind: 'acting-for-tenant',
        actorComponent: 'server-entry',
        access: 'allowed',
        outcome: 'ok',
      },
    ])

    // No credential, proof or key in the CLI output, the run records, stderr or the arrivals.
    const everything = JSON.stringify({
      outputs: value.outputs,
      records: run.records,
      stderr: run.stderr,
      arrivals: value.arrivals,
    })
    expect(leaked(everything, value.secrets)).toEqual([])
    // Positive control: the same search finds each kind where it is.
    expect(leaked(value.proofFile, value.secrets)).toEqual(['proof'])
    expect(leaked(`password ${CREDENTIAL_A}`, value.secrets)).toEqual(['credential'])
    expect(leaked(value.secrets.key.join(' '), value.secrets)).toEqual(['key'])
  })

  it('another tenant reaches the face and is denied, whether the session is real or unknown', async () => {
    const { value } = await withTree(async tools => {
      await registerAndLogin(tools, 'alice', CREDENTIAL_A)
      await registerAndLogin(tools, 'bob', CREDENTIAL_B)
      const created = await tools.cli('alice', ['create-session', '--definition', 'assistant'])
      const session = String(bodyOf(created)['session'])
      const aliceTenant = savedTenant(tools.homes.alice)
      const mark = tools.arrivals.length
      const send = (session: string, tenant?: string) =>
        tools.cli('bob', [
          'send-input',
          '--session',
          session,
          '--text',
          'x',
          ...(tenant === undefined ? [] : ['--tenant', tenant]),
        ])
      const runs = {
        ownerTenantReal: await send(session, aliceTenant),
        ownerTenantUnknown: await send(UNKNOWN_SESSION, aliceTenant),
        ownTenantReal: await send(session),
        ownTenantUnknown: await send(UNKNOWN_SESSION),
      }
      return { runs, arrivals: tools.arrivals.slice(mark) }
    })

    for (const step of Object.values(value.runs)) {
      expect(step.status).toBe(3)
      expect(step.result).toMatchObject({ outcome: 'denied' })
    }
    const answered = (name: keyof typeof value.runs) => value.runs[name].result?.['body']
    expect(answered('ownerTenantReal')).toEqual(answered('ownerTenantUnknown'))
    expect(answered('ownTenantReal')).toEqual(answered('ownTenantUnknown'))
    // With the owner's tenant text, the other principal is refused before the Session face, so
    // nothing arrives. With his own tenant text, the access check lets him through and the double
    // answers the same `denied` for the real session as for the unknown one.
    const arrived = {
      method: 'work.accept',
      principalKind: 'acting-for-tenant',
      actorComponent: 'server-entry',
      access: 'allowed',
      outcome: 'denied',
    }
    expect(value.arrivals).toEqual([arrived, arrived])
  })
})
