import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSessionOwners } from '@omne-harness/cli'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  commandMissing,
  commandUnrecognized,
  emptyCredential,
  loginStateInvalid,
  notLoggedIn,
  resultUncertain,
  serverRefused,
} from './support/expected.ts'
import {
  closedPort,
  credentialText,
  issuedProof,
  otherTenantText,
  ownLoginId,
  sessionId,
  defaultAnswer,
  NOT_OFFERED,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess, type InProcessOptions } from './support/in-process.ts'

let root: string
let state: string
const services: FakeService[] = []

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-cmd-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

async function serve(answer?: (seen: Seen) => Answer): Promise<FakeService> {
  const service = answer === undefined ? await startFakeService() : await startFakeService(answer)
  services.push(service)
  return service
}

function cli(argv: readonly string[], options: InProcessOptions = {}) {
  return runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home'), ...options })
}

async function login(service: FakeService, identifier = 'alice') {
  return cli(['login', '--login-identifier', identifier, '--server', service.origin])
}

async function loginOwningSession(service: FakeService) {
  const result = await login(service)
  const written = writeSessionOwners(state, new Map([[sessionId, tenantText]]))
  expect(written.kind).toBe('written')
  return result
}

const loginFile = () => join(state, 'login.json')
const parsed = (text: string) => JSON.parse(text) as Record<string, unknown>

describe('register', () => {
  it('registers through the identity protocol and prints the response', async () => {
    const service = await serve()
    const result = await cli([
      'register',
      '--login-identifier',
      'alice',
      '--server',
      service.origin,
    ])
    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    expect(parsed(result.stdout)).toEqual({
      result: 'response',
      outcome: 'succeeded',
      body: {
        accountId: 'acc_00000000000000000000000000',
        organizationId: 'org_00000000000000000000000000',
        tenantId: tenantText,
      },
      request: { messageId: 'id-1' },
    })
    expect(result.stdout.endsWith('}\n')).toBe(true)
    const [seen] = service.seen
    expect(seen?.path).toBe('/api/identity/v1/register-and-activate')
    expect(seen?.messageId).toBe('id-1')
    expect(seen?.body).toEqual({ loginIdentifier: 'alice', credential: credentialText })
    expect(seen?.headers['authorization']).toBeUndefined()
    expect(seen?.headers['omne-acting-tenant']).toBeUndefined()
  })

  it('does not read or create the state directory', async () => {
    const service = await serve()
    await cli(['register', '--login-identifier', 'alice', '--server', service.origin])
    expect(existsSync(state)).toBe(false)
  })

  it('treats --home as a usage error and sends nothing', async () => {
    const service = await serve()
    const result = await cli([
      'register',
      '--home',
      join(root, 'named'),
      '--login-identifier',
      'alice',
      '--server',
      service.origin,
    ])
    expect(result).toMatchObject({ code: 2, stdout: '', stderr: commandUnrecognized('register') })
    expect(service.seen).toHaveLength(0)
    expect(existsSync(join(root, 'named'))).toBe(false)
    expect(result.credentialReads).toBe(0)
  })

  it('exits 3 and prints the response when the account cannot log in', async () => {
    const service = await serve(() => ({ outcome: 'not-loginable', body: {} }))
    const result = await cli([
      'register',
      '--login-identifier',
      'alice',
      '--server',
      service.origin,
    ])
    expect(result.code).toBe(3)
    expect(parsed(result.stdout)).toMatchObject({ result: 'response', outcome: 'not-loginable' })
    expect(result.stderr).toBe('')
  })
})

describe('login', () => {
  it('creates the state directory, saves the proof, and keeps the proof out of every output', async () => {
    const service = await serve()
    const result = await login(service)
    expect(result.code).toBe(0)
    expect(parsed(result.stdout)).toEqual({
      result: 'response',
      outcome: 'succeeded',
      body: {
        loginIdentifier: 'alice',
        issuedAt: '2026-11-01T12:00:00Z',
        tenantId: tenantText,
        loginId: ownLoginId,
      },
      request: { messageId: 'id-1' },
    })
    expect(JSON.parse(readFileSync(loginFile(), 'utf8'))).toEqual({
      version: 1,
      server: service.origin,
      loginIdentifier: 'alice',
      issuedAt: '2026-11-01T12:00:00Z',
      tenantId: tenantText,
      loginProof: issuedProof,
      loginId: ownLoginId,
    })
    expect(readFileSync(loginFile(), 'utf8')).toContain(issuedProof)
    expect(service.seen[0]?.path).toBe('/api/identity/v1/issue-login')
    expect(service.seen[0]?.headers['authorization']).toBeUndefined()
    expect(JSON.stringify(service.seen[0]?.body)).toContain(credentialText)
    for (const text of [result.stdout, result.stderr]) {
      expect(text).not.toContain(issuedProof)
      expect(text).not.toContain(credentialText)
    }
  })

  it('creates a missing --home directory with its parents', async () => {
    const service = await serve()
    const named = join(root, 'a', 'b', 'state')
    const result = await runInProcess(
      ['login', '--login-identifier', 'alice', '--home', named, '--server', service.origin],
      { homeDirectory: join(root, 'home') },
    )
    expect(result.code).toBe(0)
    expect(existsSync(join(named, 'login.json'))).toBe(true)
  })

  it('exits 2 for an empty credential and creates no directory', async () => {
    const service = await serve()
    const result = await cli(['login', '--login-identifier', 'alice', '--server', service.origin], {
      credential: { kind: 'credential', value: '' },
    })
    expect(result).toMatchObject({ code: 2, stdout: '', stderr: emptyCredential })
    expect(existsSync(state)).toBe(false)
    expect(service.seen).toHaveLength(0)
  })

  it('exits 1 with the reader message when the credential cannot be read', async () => {
    const service = await serve()
    const message = 'omne: cannot read the credential without echo\n'
    const result = await cli(['login', '--login-identifier', 'alice', '--server', service.origin], {
      credential: { kind: 'failure', message },
    })
    expect(result).toMatchObject({ code: 1, stdout: '', stderr: message })
    expect(service.seen).toHaveLength(0)
  })

  it('exits 1 without sending the credential when the state directory cannot be created', async () => {
    const service = await serve()
    writeFileSync(state, 'a regular file')
    const result = await login(service)
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(`omne: state directory ${state} is not a directory\n`)
    expect(service.seen).toHaveLength(0)
  })

  it('leaves the empty directory and writes no file when the login is refused', async () => {
    const service = await serve(() => ({ outcome: 'uniform-auth-failure', body: {} }))
    const result = await login(service)
    expect(result.code).toBe(3)
    expect(parsed(result.stdout)).toMatchObject({
      result: 'response',
      outcome: 'uniform-auth-failure',
    })
    expect(existsSync(state)).toBe(true)
    expect(existsSync(loginFile())).toBe(false)
  })

  it('prints the result without the proof and exits 1 when the login file cannot be written', async () => {
    const service = await serve()
    mkdirSync(loginFile(), { recursive: true })
    const result = await login(service)
    expect(result.code).toBe(1)
    expect(parsed(result.stdout)).toMatchObject({
      result: 'response',
      outcome: 'succeeded',
      body: { loginIdentifier: 'alice' },
    })
    expect(result.stdout).not.toContain(issuedProof)
    expect(result.stderr).toMatch(/^omne login: cannot write login state .*login\.json: [A-Z]+\n$/)
    expect(result.stderr).not.toContain(issuedProof)
  })

  it('replaces the login file of an earlier login', async () => {
    const service = await serve()
    await login(service, 'alice')
    await login(service, 'bob')
    expect(parsed(readFileSync(loginFile(), 'utf8'))).toMatchObject({ loginIdentifier: 'bob' })
  })
})

describe('session commands', () => {
  type Row = Readonly<{
    name: string
    args: readonly string[]
    invalidBody: Record<string, unknown>
  }>
  const row = (name: string, args: readonly string[], invalidBody = {}): Row => ({
    name,
    args,
    invalidBody,
  })
  const commands: readonly Row[] = [
    row('create-session', ['--definition', 'default']),
    row('send-input', ['--session', sessionId, '--text', 'hello']),
    row('interrupt-input', ['--session', sessionId, '--text', 'hello']),
    row('cancel-run', ['--session', sessionId, '--run', 'run-7']),
    row('stop-call', ['--session', sessionId, '--producer-kind', 'model', '--call', 'call-3']),
    row('select-model', ['--session', sessionId, '--model', 'anthropic/claude-sonnet-5'], {
      reason: 'unknown-name',
    }),
  ]

  describe.each(commands)('$name', ({ name, args, invalidBody }) => {
    it('exits 1 and creates no directory when nobody has logged in', async () => {
      const service = await serve()
      const result = await cli([name, ...args, '--server', service.origin])
      expect(result).toMatchObject({ code: 1, stdout: '', stderr: notLoggedIn })
      expect(existsSync(state)).toBe(false)
      expect(service.seen).toHaveLength(0)
    })

    it('exits 1 when the login file has an unexpected shape', async () => {
      const service = await serve()
      mkdirSync(state)
      writeFileSync(loginFile(), JSON.stringify({ version: 1, loginProof: 'x' }), { mode: 0o600 })
      const result = await cli([name, ...args, '--server', service.origin])
      expect(result).toMatchObject({ code: 1, stdout: '', stderr: loginStateInvalid })
      expect(service.seen).toHaveLength(0)
    })

    it('sends the login proof in the Authorization header, prints the response, and keeps the proof out of the output', async () => {
      const service = await serve()
      await loginOwningSession(service)
      const result = await cli([name, ...args])
      expect(result.code).toBe(0)
      const printed = parsed(result.stdout)
      expect(printed).toMatchObject({ result: 'response', outcome: 'succeeded' })
      const sent = service.seen.at(-1)
      expect(sent?.path).toBe(`/api/session/v1/${name}`)
      expect(sent?.headers['authorization']).toBe(`Bearer ${issuedProof}`)
      expect(JSON.stringify(sent?.body)).not.toContain(issuedProof)
      for (const text of [result.stdout, result.stderr]) expect(text).not.toContain(issuedProof)
    })

    it('sends the acting tenant header only for an operation that acts as a tenant', async () => {
      const service = await serve()
      await loginOwningSession(service)
      await cli([name, ...args])
      const header = service.seen.at(-1)?.headers['omne-acting-tenant']
      expect(header).toBe(name === 'create-session' ? tenantText : undefined)
    })

    it('exits 4 with result unavailable when the service is not running, as nothing was sent', async () => {
      const service = await serve()
      await loginOwningSession(service)
      const port = await closedPort()
      const result = await cli([name, ...args, '--server', `http://127.0.0.1:${port}`])
      expect(result.code).toBe(4)
      expect(result.stderr).toBe('')
      const printed = parsed(result.stdout)
      expect(printed['result']).toBe('unavailable')
      expect(printed).not.toHaveProperty('outcome')
      expect(printed).not.toHaveProperty('body')
      expect(printed['request']).toHaveProperty('messageId')
    })

    it('exits 4 with result unavailable when the server does not have the operation: nothing ran', async () => {
      const service = await serve(seen =>
        seen.operation === 'issue-login'
          ? { outcome: 'succeeded', body: loginBody(seen) }
          : NOT_OFFERED,
      )
      await loginOwningSession(service)
      const result = await cli([name, ...args])
      expect(result.code).toBe(4)
      const printed = parsed(result.stdout)
      expect(printed['result']).toBe('unavailable')
      expect(printed).not.toHaveProperty('outcome')
      expect(printed['request']).toHaveProperty('messageId')
    })

    it('exits 5 with result uncertain when the answer cannot be trusted', async () => {
      const service = await serve(seen =>
        seen.operation === 'issue-login'
          ? { outcome: 'succeeded', body: loginBody(seen) }
          : { outcome: 'not-a-known-outcome', body: {} },
      )
      await loginOwningSession(service)
      const result = await cli([name, ...args])
      expect(result.code).toBe(5)
      expect(result.stderr).toBe(resultUncertain(name))
      const printed = parsed(result.stdout)
      expect(printed['result']).toBe('uncertain')
      expect(printed).not.toHaveProperty('outcome')
      expect(printed['request']).toHaveProperty('messageId')
    })

    it.each([
      ['denied', 3],
      ['conflict', 3],
      ['invalid', 3],
      ['basis-unavailable', 4],
    ])('exits %s -> %i from the outcome and not from the status code', async (outcome, code) => {
      // An outcome answers the body its operation declares; most declare an empty one.
      const body = outcome === 'invalid' ? invalidBody : {}
      const service = await serve(seen =>
        seen.operation === 'issue-login'
          ? { outcome: 'succeeded', body: loginBody(seen) }
          : { outcome, body },
      )
      await loginOwningSession(service)
      const result = await cli([name, ...args])
      expect(result.code).toBe(code)
      expect(parsed(result.stdout)).toMatchObject({ result: 'response', outcome, body })
      expect(result.stderr).toBe('')
    })

    it('exits 5 and notes the uncertainty when the outcome is unknown', async () => {
      const service = await serve(seen =>
        seen.operation === 'issue-login'
          ? { outcome: 'succeeded', body: loginBody(seen) }
          : { outcome: 'unknown', body: {} },
      )
      await loginOwningSession(service)
      const result = await cli([name, ...args])
      expect(result.code).toBe(5)
      expect(result.stderr).toBe(resultUncertain(name))
      expect(parsed(result.stdout)).toMatchObject({ result: 'response', outcome: 'unknown' })
    })

    it('exits 2 for a missing value, a repeated option, an unknown option, and a stray word', async () => {
      const service = await serve()
      await loginOwningSession(service)
      const before = service.seen.length
      const [first] = args
      const stray = [
        [...args, first ?? ''],
        [...args, '--bogus', 'x'],
        [...args, 'stray'],
        [...args, '--server'],
        [...args, `--server=${service.origin}`],
      ]
      for (const argv of stray) {
        const result = await cli([name, ...argv])
        expect(result).toMatchObject({ code: 2, stdout: '', stderr: commandUnrecognized(name) })
      }
      expect(service.seen).toHaveLength(before)
    })

    it('exits 2 when the server address is not a loopback http address', async () => {
      const service = await serve()
      await loginOwningSession(service)
      const result = await cli([name, ...args, '--server', 'http://example.com:8787'])
      expect(result).toMatchObject({ code: 2, stdout: '', stderr: serverRefused })
    })

    it('exits 1 when standard output cannot be written', async () => {
      const service = await serve()
      await loginOwningSession(service)
      const result = await cli([name, ...args], { failStdout: true })
      expect(result.code).toBe(1)
      expect(result.stderr).toContain(`omne ${name}:`)
    })
  })

  function loginBody(seen: Seen): unknown {
    return {
      loginIdentifier: (seen.body as Record<string, unknown>)['loginIdentifier'],
      issuedAt: '2026-11-01T12:00:00Z',
      tenantId: tenantText,
      loginProof: issuedProof,
      loginId: ownLoginId,
    }
  }

  it('create-session sends the login tenant as the acting tenant and echoes its ids', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const result = await cli(['create-session', '--definition', 'default', '--purpose', 'demo'])
    const request = parsed(result.stdout)['request'] as Record<string, string>
    expect(request['tenant']).toBe(tenantText)
    expect(new Set([request['messageId'], request['createCallId']]).size).toBe(2)
    const sent = service.seen.at(-1)
    expect(sent?.messageId).toBe(request['messageId'])
    expect(sent?.headers['omne-acting-tenant']).toBe(tenantText)
    expect(sent?.body).toEqual({
      createCallId: request['createCallId'],
      definition: 'default',
      purpose: 'demo',
    })
  })

  it('create-session keeps a caller-supplied call id so a retry repeats the same intent', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const result = await cli([
      'create-session',
      '--definition',
      'default',
      '--create-call-id',
      'call-9',
    ])
    expect(parsed(result.stdout)).toMatchObject({ request: { createCallId: 'call-9' } })
    expect(service.seen.at(-1)?.body).toMatchObject({ createCallId: 'call-9', purpose: '' })
  })

  it('send-input wraps the text as one user message and may start with a dash', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const result = await cli(['send-input', '--session', sessionId, '--text', '-5 apples'])
    const request = parsed(result.stdout)['request'] as Record<string, string>
    expect(request['tenant']).toBe(tenantText)
    expect(new Set([request['messageId'], request['acceptId'], request['inputId']]).size).toBe(3)
    const body = service.seen.at(-1)?.body as {
      tenant: string
      session: string
      acceptId: string
      inputId: string
      message: { role: string; blocks: { text: string }[] }
    }
    expect(body).toMatchObject({
      tenant: tenantText,
      session: sessionId,
      acceptId: request['acceptId'],
      inputId: request['inputId'],
    })
    expect(body.message.role).toBe('user')
    expect(body.message.blocks.map(block => block.text)).toEqual(['-5 apples'])
  })

  it('send-input reads the list when the words have a slash, sends what they name, and writes it on the receipt', async () => {
    const catalog = {
      entries: [
        { full: 'skill:review', space: 'skill', name: 'review', kind: 'reference', title: '评审' },
      ],
      missing: [],
    }
    const service = await serve(seen =>
      seen.operation === 'read-catalog'
        ? { outcome: 'succeeded', body: catalog }
        : defaultAnswer(seen),
    )
    await loginOwningSession(service)
    const named = await cli(['send-input', '--session', sessionId, '--text', '用 /review 看'])
    expect(service.seen.at(-2)?.path).toBe('/api/slash-command/v1/read-catalog')
    expect(service.seen.at(-1)?.body).toMatchObject({
      seen: { command: null, references: ['skill:review'] },
    })
    expect((parsed(named.stdout)['request'] as Record<string, string>)['seen']).toBe(
      '{"command":null,"references":["skill:review"]}',
    )
    const before = service.seen.length
    const plain = await cli(['send-input', '--session', sessionId, '--text', '没有斜杠'])
    expect(service.seen.length).toBe(before + 1)
    expect(service.seen.at(-1)?.body).toMatchObject({ seen: { command: null, references: [] } })
    expect((parsed(plain.stdout)['request'] as Record<string, string>)['seen']).toBe(
      '{"command":null,"references":[]}',
    )
  })

  it('send-input sends no view when the list cannot be read, and says so on the receipt', async () => {
    const service = await serve(seen =>
      seen.operation === 'read-catalog' ? { outcome: 'denied', body: {} } : defaultAnswer(seen),
    )
    await loginOwningSession(service)
    const result = await cli(['send-input', '--session', sessionId, '--text', '/nope'])
    expect(service.seen.at(-1)?.body).not.toHaveProperty('seen')
    expect((parsed(result.stdout)['request'] as Record<string, string>)['seen']).toBe('unknown')
  })

  it('interrupt-input sends the same body as send-input to the urgent operation (C27)', async () => {
    const service = await serve()
    await loginOwningSession(service)
    await cli(['interrupt-input', '--session', sessionId, '--text', 'read this first'])
    const seen = service.seen.at(-1)
    expect(seen?.path).toBe('/api/session/v1/interrupt-input')
    const body = seen?.body as { session: string; message: { blocks: { text: string }[] } }
    expect(body.session).toBe(sessionId)
    expect(body.message.blocks.map(block => block.text)).toEqual(['read this first'])
  })

  it('send-input sends the same message for the same input id', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const argv = [
      'send-input',
      '--session',
      sessionId,
      '--text',
      'again',
      '--accept-id',
      'a',
      '--input-id',
      'i',
    ]
    await cli(argv)
    await cli(argv)
    const [one, two] = service.seen
      .slice(-2)
      .map(seen => (seen.body as { message: unknown }).message)
    expect(one).toEqual(two)
  })

  it('cancel-run sends the run and defaults the urgency to graceful', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const result = await cli(['cancel-run', '--session', sessionId, '--run', 'run-7'])
    const request = parsed(result.stdout)['request'] as Record<string, string>
    expect(request['tenant']).toBe(tenantText)
    expect(request['controlId']).not.toBe(request['messageId'])
    expect(service.seen.at(-1)?.body).toEqual({
      tenant: tenantText,
      session: sessionId,
      controlId: request['controlId'],
      run: 'run-7',
      urgency: 'graceful',
    })
  })

  it('cancel-run accepts force and refuses any other urgency', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const forced = await cli([
      'cancel-run',
      '--session',
      sessionId,
      '--run',
      'r',
      '--urgency',
      'force',
    ])
    expect(forced.code).toBe(0)
    expect(service.seen.at(-1)?.body).toMatchObject({ urgency: 'force' })
    const bad = await cli(['cancel-run', '--session', sessionId, '--run', 'r', '--urgency', 'now'])
    expect(bad).toMatchObject({ code: 2, stderr: commandUnrecognized('cancel-run') })
  })

  it.each(['archive-session', 'unarchive-session'] as const)(
    '%s sends the session and a control id of its own (C28)',
    async name => {
      const service = await serve()
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId])
      const request = parsed(result.stdout)['request'] as Record<string, string>
      expect(service.seen.at(-1)?.path).toBe(`/api/session/v1/${name}`)
      expect(service.seen.at(-1)?.body).toEqual({
        tenant: tenantText,
        session: sessionId,
        controlId: request['controlId'],
      })
      await cli([name, '--session', sessionId, '--control-id', 'again'])
      expect(service.seen.at(-1)?.body).toMatchObject({ controlId: 'again' })
    },
  )

  it('read-permission-mode sends the session; change-permission-mode the mode and the revision read', async () => {
    const service = await serve()
    await loginOwningSession(service)
    await cli(['read-permission-mode', '--session', sessionId])
    expect(service.seen.at(-1)?.path).toBe('/api/session/v1/read-permission-mode')
    expect(service.seen.at(-1)?.body).toEqual({ tenant: tenantText, session: sessionId })
    await cli([
      'change-permission-mode',
      '--session',
      sessionId,
      '--mode',
      'auto_permission',
      '--expected-revision',
      '3',
    ])
    expect(service.seen.at(-1)?.path).toBe('/api/session/v1/change-permission-mode')
    expect(service.seen.at(-1)?.body).toEqual({
      tenant: tenantText,
      session: sessionId,
      mode: 'auto_permission',
      expectedRevision: '3',
    })
  })

  it('the three reads of a session send the session, the page and the input the sender named', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const first = await cli(['read-pending', '--session', sessionId])
    expect(first.stderr).toBe('')
    expect(service.seen.at(-1)?.path).toBe('/api/session/v1/read-pending')
    expect(service.seen.at(-1)?.body).toEqual({
      tenant: tenantText,
      session: sessionId,
      after: null,
      limit: 50,
    })
    await cli(['read-pending', '--session', sessionId, '--after', '17', '--limit', '3'])
    expect(service.seen.at(-1)?.body).toEqual({
      tenant: tenantText,
      session: sessionId,
      after: '17',
      limit: 3,
    })
    await cli(['read-waiting-calls', '--session', sessionId])
    expect(service.seen.at(-1)?.path).toBe('/api/session/v1/read-waiting-calls')
    expect(service.seen.at(-1)?.body).toEqual({ tenant: tenantText, session: sessionId })
    await cli(['read-input-fate', '--session', sessionId, '--input-id', 'input-1'])
    expect(service.seen.at(-1)?.path).toBe('/api/session/v1/read-input-fate')
    expect(service.seen.at(-1)?.body).toEqual({
      tenant: tenantText,
      session: sessionId,
      inputId: 'input-1',
    })
  })

  it('list-commands reads the list of one session over slash-command/1', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const listed = await cli(['list-commands', '--session', sessionId])
    expect(listed.stderr).toBe('')
    expect(service.seen.at(-1)?.path).toBe('/api/slash-command/v1/read-catalog')
    expect(service.seen.at(-1)?.body).toEqual({ tenant: tenantText, session: sessionId })
  })

  it('the reads refuse a limit that is not a page limit and a fate without its input, and send nothing', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const before = service.seen.length
    for (const args of [
      ['read-pending', '--session', sessionId, '--limit', '0'],
      ['read-pending', '--session', sessionId, '--limit', 'many'],
      ['read-pending', '--session', sessionId, '--after', 'x'],
      ['read-input-fate', '--session', sessionId],
    ]) {
      const bad = await cli(args)
      expect(bad.code, args.join(' ')).toBe(2)
    }
    expect(service.seen).toHaveLength(before)
  })

  it('change-permission-mode refuses a mode outside the three and sends nothing', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const before = service.seen.length
    const bad = await cli([
      'change-permission-mode',
      '--session',
      sessionId,
      '--mode',
      'ask',
      '--expected-revision',
      '0',
    ])
    expect(bad).toMatchObject({ code: 2, stderr: commandUnrecognized('change-permission-mode') })
    expect(service.seen).toHaveLength(before)
  })

  it('create-session sends the model it is given, and none when it is given none (C24)', async () => {
    const service = await serve()
    await loginOwningSession(service)
    await cli(['create-session', '--definition', 'coding'])
    expect(service.seen.at(-1)?.body).not.toHaveProperty('model')
    await cli(['create-session', '--definition', 'coding', '--model', 'openai/gpt-6-sol'])
    expect(service.seen.at(-1)?.body).toMatchObject({
      definition: 'coding',
      model: 'openai/gpt-6-sol',
    })
    const before = service.seen.length
    expect(await cli(['create-session', '--definition', 'coding', '--model', ''])).toMatchObject({
      code: 2,
    })
    expect(service.seen).toHaveLength(before)
  })

  it.each(['send-input', 'interrupt-input'] as const)(
    '%s with a model selects it first, under a control identity the accept identity gives (C24)',
    async name => {
      const service = await serve()
      await loginOwningSession(service)
      const route = 'anthropic/claude-sonnet-5'
      const args = [name, '--session', sessionId, '--text', 'hello', '--model', route]
      const result = await cli([...args, '--accept-id', 'accept-7'])
      const [selected, sent] = service.seen.slice(-2)
      expect(selected?.operation).toBe('select-model')
      expect(selected?.body).toMatchObject({
        session: sessionId,
        model: route,
        controlId: 'model:accept-7',
      })
      expect(sent?.operation).toBe(name)
      expect(sent?.body).toMatchObject({ session: sessionId, acceptId: 'accept-7' })
      expect(sent?.body).not.toHaveProperty('model')
      expect(result).toMatchObject({ code: 0, stderr: '' })
      expect(parsed(result.stdout)).toMatchObject({ outcome: 'succeeded' })
    },
  )

  it('send-input does not send to a model that was not selected, and says which call stopped it (C24)', async () => {
    const service = await serve(seen =>
      seen.operation === 'issue-login'
        ? { outcome: 'succeeded', body: loginBody(seen) }
        : seen.operation === 'select-model'
          ? { outcome: 'invalid', body: { reason: 'unknown-name' } }
          : { outcome: 'succeeded', body: { recovered: false } },
    )
    await loginOwningSession(service)
    const before = service.seen.length
    const result = await cli(['send-input', '--session', sessionId, '--text', 'hi', '--model', 'x'])
    expect(service.seen.slice(before).map(seen => seen.operation)).toEqual(['select-model'])
    expect(parsed(result.stdout)).toMatchObject({
      outcome: 'invalid',
      body: { reason: 'unknown-name' },
    })
    expect(result.stderr).toBe(
      'omne send-input: the model was not selected; the input was not sent\n',
    )
    expect(result.code).not.toBe(0)
  })

  it('send-input without a model selects nothing', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const before = service.seen.length
    await cli(['send-input', '--session', sessionId, '--text', 'hi'])
    expect(service.seen.slice(before).map(seen => seen.operation)).toEqual(['send-input'])
  })

  it('read-model-selection reads the model one session stands at (C24)', async () => {
    const service = await serve(seen =>
      seen.operation === 'issue-login'
        ? { outcome: 'succeeded', body: loginBody(seen) }
        : { outcome: 'succeeded', body: { model: 'openai/gpt-6-sol', revision: '9' } },
    )
    await loginOwningSession(service)
    const result = await cli(['read-model-selection', '--session', sessionId])
    expect(service.seen.at(-1)?.path).toBe('/api/session/v1/read-model-selection')
    expect(service.seen.at(-1)?.body).toEqual({ tenant: tenantText, session: sessionId })
    expect(parsed(result.stdout)).toMatchObject({
      outcome: 'succeeded',
      body: { model: 'openai/gpt-6-sol', revision: '9' },
    })
    expect(await cli(['read-model-selection'])).toMatchObject({ code: 2 })
  })

  it('read-workspace-selection reads the workspace one session stands at and its directory', async () => {
    const body = {
      workspace: null,
      state: 'default',
      directory: '/srv/default',
      reason: null,
      revision: '4',
    }
    const service = await serve(seen =>
      seen.operation === 'issue-login'
        ? { outcome: 'succeeded', body: loginBody(seen) }
        : { outcome: 'succeeded', body },
    )
    await loginOwningSession(service)
    const result = await cli(['read-workspace-selection', '--session', sessionId])
    expect(service.seen.at(-1)?.path).toBe('/api/session/v1/read-workspace-selection')
    expect(service.seen.at(-1)?.body).toEqual({ tenant: tenantText, session: sessionId })
    expect(parsed(result.stdout)).toMatchObject({
      outcome: 'succeeded',
      body,
      request: { messageId: expect.any(String), tenant: tenantText },
    })
    expect(await cli(['read-workspace-selection'])).toMatchObject({ code: 2 })
    // A session this state directory never created needs its tenant named.
    const elsewhere = 'f'.repeat(64)
    expect(await cli(['read-workspace-selection', '--session', elsewhere])).toMatchObject({
      code: 2,
    })
    await cli(['read-workspace-selection', '--session', elsewhere, '--tenant', tenantText])
    expect(service.seen.at(-1)?.body).toEqual({ tenant: tenantText, session: elsewhere })
  })

  it('list-models asks Model for the models of the login tenant, or of the tenant given (C24)', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const result = await cli(['list-models'])
    expect(service.seen.at(-1)?.path).toBe('/api/model/v1/list-models')
    expect(service.seen.at(-1)?.body).toEqual({ tenant: tenantText })
    expect(result.code).toBe(0)
    expect(parsed(result.stdout)).toMatchObject({
      result: 'response',
      outcome: 'succeeded',
      request: { tenant: tenantText },
    })
    const before = service.seen.length
    expect(await cli(['list-models', '--tenant', 'not a tenant'])).toMatchObject({
      code: 2,
      stderr: commandUnrecognized('list-models'),
    })
    expect(await cli(['list-models', '--session', sessionId])).toMatchObject({ code: 2 })
    expect(service.seen).toHaveLength(before)
  })

  it('list-archived-sessions reads the login tenant and sends only the filters given (C29)', async () => {
    const service = await serve()
    await loginOwningSession(service)
    await cli(['list-archived-sessions'])
    expect(service.seen.at(-1)?.path).toBe('/api/session/v1/list-archived-sessions')
    expect(service.seen.at(-1)?.body).toEqual({
      tenant: tenantText,
      cursor: null,
      from: null,
      to: null,
      by: null,
      titleContains: null,
    })
    await cli([
      'list-archived-sessions',
      '--since',
      '2026-11-01T00:00:00Z',
      '--before',
      '2026-11-02T00:00:00.5Z',
      '--by',
      'auto',
      '--title',
      'build',
      '--limit',
      '5',
      '--cursor',
      'c-1',
    ])
    expect(service.seen.at(-1)?.body).toEqual({
      tenant: tenantText,
      cursor: 'c-1',
      limit: 5,
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-02T00:00:00.5Z',
      by: 'auto',
      titleContains: 'build',
    })
  })

  it('list-sessions reads the sessions that are not archived, and both lists send the relation filters given (C15)', async () => {
    const service = await serve()
    await loginOwningSession(service)
    await cli(['list-sessions'])
    expect(service.seen.at(-1)?.path).toBe('/api/session/v1/list-sessions')
    expect(service.seen.at(-1)?.body).toEqual({ tenant: tenantText, cursor: null })
    const filters = [
      '--relation',
      'child',
      '--parent',
      sessionId,
      '--attendance',
      'unattended',
      '--definition',
      'coding',
    ]
    await cli(['list-sessions', ...filters, '--limit', '5', '--cursor', 'c-1'])
    const sent = {
      relation: 'child',
      parent: sessionId,
      attendance: 'unattended',
      definition: 'coding',
    }
    expect(service.seen.at(-1)?.body).toEqual({
      tenant: tenantText,
      cursor: 'c-1',
      limit: 5,
      ...sent,
    })
    await cli(['list-archived-sessions', ...filters, '--by', 'parent'])
    expect(service.seen.at(-1)?.body).toEqual({
      tenant: tenantText,
      cursor: null,
      from: null,
      to: null,
      by: 'parent',
      titleContains: null,
      ...sent,
    })
  })

  it.each([
    ['list-sessions', '--relation', 'sibling'],
    ['list-sessions', '--attendance', 'nobody'],
    ['list-sessions', '--limit', '0'],
    ['list-sessions', '--by', 'person'],
    ['list-archived-sessions', '--relation', 'sibling'],
    ['list-archived-sessions', '--attendance', 'nobody'],
  ])('%s refuses %s %s as a usage error and sends nothing', async (command, option, value) => {
    const service = await serve()
    await loginOwningSession(service)
    const before = service.seen.length
    const bad = await cli([command, option, value])
    expect(bad).toMatchObject({ code: 2, stderr: commandUnrecognized(command) })
    expect(service.seen.length).toBe(before)
  })

  it.each([
    ['--since', 'yesterday'],
    ['--by', 'robot'],
    ['--limit', '0'],
  ])(
    'list-archived-sessions refuses %s %s as a usage error and sends nothing',
    async (option, value) => {
      const service = await serve()
      await loginOwningSession(service)
      const before = service.seen.length
      const bad = await cli(['list-archived-sessions', option, value])
      expect(bad).toMatchObject({ code: 2, stderr: commandUnrecognized('list-archived-sessions') })
      expect(service.seen.length).toBe(before)
    },
  )

  it('stop-call sends the producer, and a tool target reaches the service', async () => {
    const service = await serve(seen =>
      seen.operation === 'issue-login'
        ? { outcome: 'succeeded', body: loginBody(seen) }
        : { outcome: 'unsupported', body: {} },
    )
    await loginOwningSession(service)
    const result = await cli([
      'stop-call',
      '--session',
      sessionId,
      '--producer-kind',
      'tool',
      '--call',
      'call-3',
      '--control-id',
      'ctl',
    ])
    expect(service.seen.at(-1)?.body).toMatchObject({
      controlId: 'ctl',
      producer: { kind: 'tool', call: 'call-3' },
    })
    expect(result.code).toBe(3)
    expect(parsed(result.stdout)).toMatchObject({
      outcome: 'unsupported',
      request: { controlId: 'ctl' },
    })
  })

  it('select-model sends the route under a control identity, and a retry reuses the one given', async () => {
    const service = await serve(seen =>
      seen.operation === 'issue-login'
        ? { outcome: 'succeeded', body: loginBody(seen) }
        : { outcome: 'unknown', body: {} },
    )
    await loginOwningSession(service)
    const route = 'openai/gpt-6.1-sol'
    const first = await cli(['select-model', '--session', sessionId, '--model', route])
    const sent = service.seen.at(-1)
    expect(sent?.operation).toBe('select-model')
    expect(sent?.body).toMatchObject({ session: sessionId, model: route })
    const sentBody = sent?.body as Record<string, unknown> | undefined
    const controlId = sentBody?.['controlId']
    expect(typeof controlId).toBe('string')
    expect(parsed(first.stdout)).toMatchObject({ outcome: 'unknown', request: { controlId } })
    await cli([
      'select-model',
      '--session',
      sessionId,
      '--model',
      route,
      '--control-id',
      String(controlId),
    ])
    expect(service.seen.at(-1)?.body).toMatchObject({ controlId, model: route })
  })

  it('refuses select-model without a route', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const result = await cli(['select-model', '--session', sessionId, '--model', ''])
    expect(result).toMatchObject({ code: 2, stderr: commandUnrecognized('select-model') })
  })

  it('refuses a producer kind that is neither model nor tool', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const result = await cli([
      'stop-call',
      '--session',
      sessionId,
      '--producer-kind',
      'agent',
      '--call',
      'c',
    ])
    expect(result).toMatchObject({ code: 2, stderr: commandUnrecognized('stop-call') })
  })

  it('names the first missing required option', async () => {
    const service = await serve()
    await loginOwningSession(service)
    expect(await cli(['cancel-run', '--session', sessionId])).toMatchObject({
      code: 2,
      stderr: commandMissing('cancel-run', '--run'),
    })
    expect(await cli(['create-session'])).toMatchObject({
      code: 2,
      stderr: commandMissing('create-session', '--definition'),
    })
  })

  it('--tenant replaces the login tenant, and a bad tenant text is a usage error', async () => {
    const service = await serve()
    await loginOwningSession(service)
    const sent = await cli([
      'cancel-run',
      '--session',
      sessionId,
      '--run',
      'r',
      '--tenant',
      otherTenantText,
    ])
    expect(parsed(sent.stdout)).toMatchObject({ request: { tenant: otherTenantText } })
    expect(service.seen.at(-1)?.body).toMatchObject({ tenant: otherTenantText })
    const bad = await cli([
      'cancel-run',
      '--session',
      sessionId,
      '--run',
      'r',
      '--tenant',
      'nobody',
    ])
    expect(bad).toMatchObject({ code: 2, stderr: commandUnrecognized('cancel-run') })
  })

  it('takes the server from --server, then OMNE_SERVER, then the login file', async () => {
    const first = await serve()
    const second = await serve()
    const third = await serve()
    await loginOwningSession(first)
    const args = ['cancel-run', '--session', sessionId, '--run', 'r']
    await cli(args)
    await cli(args, { omneServer: second.origin })
    await cli([...args, '--server', third.origin], { omneServer: second.origin })
    const sessionCalls = (service: FakeService) =>
      service.seen.filter(seen => seen.path === '/api/session/v1/cancel-run').length
    expect([sessionCalls(first), sessionCalls(second), sessionCalls(third)]).toEqual([1, 1, 1])
  })
})

describe('server address for register and login', () => {
  it('refuses a non-loopback address before it reads the credential', async () => {
    const result = await cli([
      'register',
      '--login-identifier',
      'a',
      '--server',
      'https://example.com',
    ])
    expect(result).toMatchObject({
      code: 2,
      stdout: '',
      stderr: serverRefused,
      credentialReads: 0,
    })
  })

  it('prefers --server over OMNE_SERVER', async () => {
    const wanted = await serve()
    const other = await serve()
    await cli(['register', '--login-identifier', 'a', '--server', wanted.origin], {
      omneServer: other.origin,
    })
    expect([wanted.seen.length, other.seen.length]).toEqual([1, 0])
  })

  it('uses OMNE_SERVER when --server is absent', async () => {
    const other = await serve()
    await cli(['register', '--login-identifier', 'a'], { omneServer: other.origin })
    expect(other.seen).toHaveLength(1)
  })

  it('exits 4 when nothing listens at the address, as nothing was sent', async () => {
    const port = await closedPort()
    const result = await cli([
      'register',
      '--login-identifier',
      'a',
      '--server',
      `http://127.0.0.1:${port}`,
    ])
    expect(result.code).toBe(4)
    expect(result.stderr).toBe('')
    expect(parsed(result.stdout)).toEqual({ result: 'unavailable', request: { messageId: 'id-1' } })
  })

  it('accepts a localhost address and refuses an https or a userinfo address', async () => {
    const service = await serve()
    const port = new URL(service.origin).port
    const named = await cli([
      'register',
      '--login-identifier',
      'a',
      '--server',
      `http://localhost:${port}`,
    ])
    expect(named.code).toBe(0)
    for (const address of [`https://127.0.0.1:${port}`, `http://user@127.0.0.1:${port}`]) {
      const result = await cli(['register', '--login-identifier', 'a', '--server', address])
      expect(result).toMatchObject({
        code: 2,
        stdout: '',
        stderr: serverRefused,
        credentialReads: 0,
      })
    }
  })

  it.each(['register', 'login'])('%s names the missing login identifier', async name => {
    expect(await cli([name])).toMatchObject({
      code: 2,
      stderr: commandMissing(name, '--login-identifier'),
      credentialReads: 0,
    })
  })
})
