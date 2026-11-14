// @module-tag slow
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as cordis from '../../src/cordis.ts'
import {
  createSessionProviderRow,
  type SessionProviderArrival,
} from '../../src/rows/session-provider/index.ts'
import { runServe, type S0Record, type ServeResult } from '../../src/run.ts'
import { startModelGateway } from '../fixtures/model-gateway.ts'
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
  const gateway = await startModelGateway()
  gateway.trustInProcess()
  const finished: Promise<Run> = runServe({
    distribution: release,
    operator: operatorLayer({ storageRoot: dir.storageRoot, port, modelRoute: gateway.url }),
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
    await gateway.close()
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
      implementations: { real: 56, 'contract-double': 1, 's0-double': 2 },
    })
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

    const everything = JSON.stringify({
      outputs: value.outputs,
      records: run.records,
      stderr: run.stderr,
      arrivals: value.arrivals,
    })
    expect(leaked(everything, value.secrets)).toEqual([])
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
      const bobTenant = savedTenant(tools.homes.bob)
      const mark = tools.arrivals.length
      const send = (session: string, tenant: string) =>
        tools.cli('bob', ['send-input', '--session', session, '--text', 'x', '--tenant', tenant])
      const runs = {
        ownerTenantReal: await send(session, aliceTenant),
        ownerTenantUnknown: await send(UNKNOWN_SESSION, aliceTenant),
        ownTenantReal: await send(session, bobTenant),
        ownTenantUnknown: await send(UNKNOWN_SESSION, bobTenant),
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
