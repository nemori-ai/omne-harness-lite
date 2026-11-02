// @module-tag slow
// Every case spawns the built bin and talks to a real HTTP server on 127.0.0.1.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSandbox, runCliAsync, type Sandbox } from './support/cli-process.ts'
import { emptyCredential, resultUncertain, unrecognizedArguments } from './support/expected.ts'
import {
  closedPort,
  credentialText,
  issuedProof,
  sessionId,
  startFakeService,
  type FakeService,
} from './support/fake-service.ts'

let sandbox: Sandbox
let service: FakeService
let state: string
beforeEach(async () => {
  sandbox = createSandbox()
  state = join(sandbox.root, 'state')
  service = await startFakeService()
})
afterEach(async () => {
  await service.close()
  sandbox.remove()
})

const stdin = `${credentialText}\n`

describe('omne commands as a process', () => {
  it('logs in with a credential from a pipe, saves the proof, and prints no secret', async () => {
    const result = await runCliAsync(
      sandbox,
      ['login', '--login-identifier', 'alice', '--server', service.origin],
      { omneHome: state, stdin },
    )
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      result: 'response',
      outcome: 'succeeded',
      request: { messageId: expect.any(String) },
    })
    expect(readFileSync(join(state, 'login.json'), 'utf8')).toContain(issuedProof)
    expect(JSON.stringify(service.seen[0]?.wire)).toContain(credentialText)
    expect(result.stdout + result.stderr).not.toContain(issuedProof)
    expect(result.stdout + result.stderr).not.toContain(credentialText)
  })

  it('carries a session command after a login, with the proof in the body', async () => {
    const options = { omneHome: state, omneServer: service.origin }
    await runCliAsync(sandbox, ['login', '--login-identifier', 'alice'], { ...options, stdin })
    const result = await runCliAsync(
      sandbox,
      ['cancel-run', '--session', sessionId, '--run', 'run-7'],
      options,
    )
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const sent = service.seen.at(-1)
    expect(sent?.wire).toMatchObject({
      operation: 'cancel-run',
      loginProof: issuedProof,
      body: { run: 'run-7', urgency: 'graceful' },
    })
  })

  it('creates the default state directory under HOME only for login', async () => {
    const created = join(sandbox.home, '.omne')
    const refused = await runCliAsync(sandbox, ['register', '--login-identifier', 'a'], {
      omneServer: service.origin,
      stdin,
    })
    expect(refused.status).toBe(0)
    expect(readdirSync(sandbox.home)).toEqual([])
    await runCliAsync(sandbox, ['login', '--login-identifier', 'a'], {
      omneServer: service.origin,
      stdin,
    })
    expect(statSync(join(created, 'login.json')).isFile()).toBe(true)
  })

  it('exits 2 for register with --home and creates no directory', async () => {
    const named = join(sandbox.root, 'named')
    const result = await runCliAsync(
      sandbox,
      ['register', '--login-identifier', 'a', '--home', named],
      { omneServer: service.origin, stdin },
    )
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(
      'omne register: unrecognized arguments\nRun omne --help for usage.\n',
    )
    expect(existsSync(named)).toBe(false)
    expect(service.seen).toHaveLength(0)
  })

  it('exits 2 and creates no directory when the piped credential is empty', async () => {
    const result = await runCliAsync(sandbox, ['login', '--login-identifier', 'a'], {
      omneHome: state,
      omneServer: service.origin,
      stdin: '\n',
    })
    expect(result).toEqual({ status: 2, stdout: '', stderr: emptyCredential })
    expect(existsSync(state)).toBe(false)
  })

  it('exits 5 with result uncertain when the service is not running', async () => {
    const port = await closedPort()
    const result = await runCliAsync(sandbox, ['register', '--login-identifier', 'a'], {
      omneServer: `http://127.0.0.1:${port}`,
      stdin,
    })
    expect(result.status).toBe(5)
    expect(result.stderr).toBe(resultUncertain('register'))
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'uncertain' })
  })

  it('exits 2 for a name no command has', async () => {
    const result = await runCliAsync(sandbox, ['read-history'])
    expect(result).toEqual({ status: 2, stdout: '', stderr: unrecognizedArguments })
  })
})
