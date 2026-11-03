import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { productionCatalog, renderHelp } from '@omne-harness/cli'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandMissing, commandUnrecognized, notLoggedIn } from './support/expected.ts'
import {
  accountId,
  closedPort,
  defaultAnswer,
  issuedProof,
  organizationId,
  otherLoginId,
  otherTenantText,
  ownLoginId,
  sessionId,
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
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-gov-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

/** A service that issues logins with a `loginId`, and answers `answer` for every other operation. */
async function serve(answer?: (seen: Seen) => Answer | undefined): Promise<FakeService> {
  const service = await startFakeService(seen => {
    const base = defaultAnswer(seen)
    if (seen.wire['operation'] === 'issue-login')
      return { ...base, body: { ...(base.body as object), loginId: ownLoginId } }
    return answer?.(seen) ?? base
  })
  services.push(service)
  return service
}

/** A service that answers one outcome, with an empty body, to the given operation. */
function answering(operation: string, outcome: string): (seen: Seen) => Answer | undefined {
  return seen => (seen.wire['operation'] === operation ? { outcome, body: {} } : undefined)
}

function cli(argv: readonly string[], options: InProcessOptions = {}) {
  return runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home'), ...options })
}

async function login(service: FakeService) {
  const result = await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
  expect(result.code).toBe(0)
}

const loginFile = () => join(state, 'login.json')
const readLogin = () => JSON.parse(readFileSync(loginFile(), 'utf8')) as Record<string, unknown>
const parsed = (text: string) => JSON.parse(text) as Record<string, unknown>

interface Case {
  readonly name: string
  readonly args: readonly string[]
  /** True when the operation carries the acting tenant. */
  readonly acting: boolean
  readonly body: Record<string, unknown>
  readonly echo?: Record<string, string>
}

const noOptions: readonly string[] = []

const cases: readonly Case[] = [
  {
    name: 'create-organization',
    args: ['--name', 'Acme', '--governance-model-id', 'gm-1', '--create-call-id', 'call-1'],
    acting: true,
    body: { createCallId: 'call-1', name: 'Acme', governanceModelId: 'gm-1' },
    echo: { createCallId: 'call-1' },
  },
  {
    name: 'query-create-organization',
    args: ['--target-create-call-id', 'call-1', '--name', 'Acme', '--governance-model-id', 'gm-1'],
    acting: false,
    body: { targetCreateCallId: 'call-1', name: 'Acme', governanceModelId: 'gm-1' },
  },
  {
    name: 'issue-member-invitation',
    args: ['--invited-login-identifier', 'bob', '--duration', 'P7D'],
    acting: true,
    body: { invitedLoginIdentifier: 'bob', duration: 'P7D' },
  },
  {
    name: 'accept-member-invitation',
    args: ['--invitation-id', 'inv-1'],
    acting: true,
    body: { invitationId: 'inv-1', expectedState: 'open' },
  },
  {
    name: 'reject-member-invitation',
    args: ['--invitation-id', 'inv-1'],
    acting: true,
    body: { invitationId: 'inv-1', expectedState: 'open' },
  },
  {
    name: 'withdraw-member-invitation',
    args: ['--invitation-id', 'inv-1'],
    acting: true,
    body: { invitationId: 'inv-1', expectedState: 'open' },
  },
  {
    name: 'query-invitation',
    args: ['--invitation-id', 'inv-1'],
    acting: true,
    body: { invitationId: 'inv-1' },
  },
  { name: 'query-received-invitations', args: noOptions, acting: false, body: {} },
  { name: 'query-issued-invitations', args: noOptions, acting: true, body: {} },
  { name: 'query-own-memberships', args: noOptions, acting: false, body: {} },
  {
    name: 'query-organization-members',
    args: ['--organization-id', organizationId, '--include-removed', 'true'],
    acting: true,
    body: { organizationId, includeRemoved: true },
  },
  { name: 'leave-organization', args: noOptions, acting: true, body: {} },
  {
    name: 'remove-member',
    args: [
      '--organization-id',
      organizationId,
      '--account-id',
      accountId,
      '--expected-role',
      'member',
    ],
    acting: true,
    body: { organizationId, accountId, expectedRole: 'member' },
  },
  {
    name: 'change-member-role',
    args: [
      '--organization-id',
      organizationId,
      '--account-id',
      accountId,
      '--expected-role',
      'member',
      '--target-role',
      'admin',
    ],
    acting: true,
    body: { organizationId, accountId, expectedRole: 'member', targetRole: 'admin' },
  },
  {
    name: 'switch-current-tenant',
    args: ['--tenant-id', otherTenantText],
    acting: true,
    body: { tenantId: otherTenantText },
  },
  { name: 'query-current-tenant', args: noOptions, acting: false, body: {} },
  {
    name: 'revoke-login',
    args: noOptions,
    acting: false,
    body: { targetLoginId: ownLoginId },
    echo: { targetLoginId: ownLoginId },
  },
  { name: 'query-own-valid-logins', args: noOptions, acting: false, body: {} },
]

describe('the governance commands', () => {
  it('are the 18 operations of the spec, each named for its operation', () => {
    expect(cases.map(item => item.name)).toHaveLength(18)
    expect(new Set(cases.map(item => item.name)).size).toBe(18)
    const registered = productionCatalog.commands.map(command => command.name)
    for (const item of cases) expect(registered).toContain(item.name)
  })

  it('are listed by --help, which is rendered from the command catalog', () => {
    const help = renderHelp(productionCatalog)
    for (const item of cases) expect(help).toContain(`  omne ${item.name}`)
  })

  describe.each(cases)('$name', item => {
    it('sends the operation to the governance location with the login proof and prints the result', async () => {
      const service = await serve()
      await login(service)
      const result = await cli([item.name, ...item.args])
      expect(result.code).toBe(0)
      expect(result.stderr).toBe('')
      const printed = parsed(result.stdout)
      expect(printed).toMatchObject({ result: 'response', outcome: 'succeeded' })
      const request = printed['request'] as Record<string, string>
      expect(request).toMatchObject({ ...item.echo })
      if (item.acting) expect(request['tenant']).toBe(tenantText)
      else expect(request).not.toHaveProperty('tenant')

      const sent = service.seen.at(-1)
      expect(sent?.path).toBe('/governance-public/1')
      expect(sent?.wire).toMatchObject({
        operation: item.name,
        messageId: request['messageId'],
        loginProof: issuedProof,
        body: item.body,
      })
      if (item.acting) expect(sent?.wire['actingTenant']).toBe(tenantText)
      else expect(sent?.wire).not.toHaveProperty('actingTenant')
      expect(JSON.stringify(sent?.headers)).not.toContain(issuedProof)
      for (const text of [result.stdout, result.stderr]) expect(text).not.toContain(issuedProof)
    })

    it('exits 1 and sends nothing when nobody has logged in', async () => {
      const service = await serve()
      const result = await cli([item.name, ...item.args, '--server', service.origin])
      expect(result).toMatchObject({ code: 1, stdout: '', stderr: notLoggedIn })
      expect(service.seen).toHaveLength(0)
    })

    it('exits 3 and prints the response when the deployment does not provide the operation', async () => {
      const service = await serve(seen =>
        seen.wire['operation'] === item.name
          ? { outcome: 'stage-not-provided', body: {} }
          : undefined,
      )
      await login(service)
      const before = existsSync(loginFile()) ? readFileSync(loginFile(), 'utf8') : ''
      const result = await cli([item.name, ...item.args])
      expect(result.code).toBe(3)
      expect(result.stderr).toBe('')
      expect(parsed(result.stdout)).toMatchObject({
        result: 'response',
        outcome: 'stage-not-provided',
        body: {},
      })
      expect(readFileSync(loginFile(), 'utf8')).toBe(before)
    })

    it('exits 5 with result uncertain when the service is not running', async () => {
      const service = await serve()
      await login(service)
      const port = await closedPort()
      const result = await cli([item.name, ...item.args, '--server', `http://127.0.0.1:${port}`])
      expect(result.code).toBe(5)
      expect(parsed(result.stdout)).toMatchObject({ result: 'uncertain' })
      expect(result.stderr).toBe(`omne ${item.name}: result uncertain\n`)
    })
  })
})

describe('governance usage errors', () => {
  it('names the first missing required option and sends nothing', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['remove-member', '--organization-id', organizationId])
    expect(result).toMatchObject({
      code: 2,
      stdout: '',
      stderr: commandMissing('remove-member', '--account-id'),
    })
    expect(service.seen.filter(seen => seen.wire['operation'] === 'remove-member')).toHaveLength(0)
  })

  it.each([
    ['an option the command does not accept', ['query-own-memberships', '--name', 'x']],
    ['a repeated option', ['query-invitation', '--invitation-id', 'a', '--invitation-id', 'b']],
    [
      'an organization id that is not one',
      ['query-organization-members', '--organization-id', 'nope'],
    ],
    [
      'an account id that is not one',
      [
        'remove-member',
        '--organization-id',
        organizationId,
        '--account-id',
        organizationId,
        '--expected-role',
        'member',
      ],
    ],
    [
      'an include-removed value that is not true or false',
      [
        'query-organization-members',
        '--organization-id',
        organizationId,
        '--include-removed',
        'yes',
      ],
    ],
    ['a tenant text that is not one', ['switch-current-tenant', '--tenant-id', 'plain']],
    ['a target login that is not a login id', ['revoke-login', '--target-login', organizationId]],
  ] as const)('exits 2 for %s, before it reads the login', async (_what, argv) => {
    const service = await serve()
    const result = await cli([...argv, '--server', service.origin])
    expect(result).toMatchObject({ code: 2, stdout: '', stderr: commandUnrecognized(argv[0]) })
    expect(service.seen).toHaveLength(0)
  })
  it('exits 2 and sends nothing for an empty value that the contract refuses', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['accept-member-invitation', '--invitation-id', ''])
    expect(result).toMatchObject({
      code: 2,
      stdout: '',
      stderr: commandUnrecognized('accept-member-invitation'),
    })
    const sent = service.seen.filter(seen => seen.wire['operation'] === 'accept-member-invitation')
    expect(sent).toHaveLength(0)
  })
})

describe('login', () => {
  it('saves the loginId of the response next to the proof and prints it', async () => {
    const service = await serve()
    const result = await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
    expect(result.code).toBe(0)
    expect(readLogin()).toEqual({
      version: 1,
      server: service.origin,
      loginIdentifier: 'alice',
      issuedAt: '2026-11-01T12:00:00Z',
      tenantId: tenantText,
      loginProof: issuedProof,
      loginId: ownLoginId,
    })
    expect(parsed(result.stdout)['body']).toMatchObject({ loginId: ownLoginId })
    expect(result.stdout).not.toContain(issuedProof)
  })

  it('writes no loginId when the server sent none, and a later revoke-login needs --target-login', async () => {
    const service = await startFakeService()
    services.push(service)
    await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
    expect(readLogin()).not.toHaveProperty('loginId')
    const result = await cli(['revoke-login'])
    expect(result.code).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(
      'omne revoke-login: the login id of this login is unknown\nRun omne login again, or add --target-login <id>.\n',
    )
    expect(service.seen.filter(seen => seen.wire['operation'] === 'revoke-login')).toHaveLength(0)
    expect(existsSync(loginFile())).toBe(true)
  })
})

describe('switch-current-tenant', () => {
  const switched = ['switch-current-tenant', '--tenant-id', otherTenantText] as const

  it('switch-updates-login-state: a success writes the new tenant into the login file', async () => {
    const service = await serve()
    await login(service)
    const before = readLogin()
    const result = await cli(switched)
    expect(result.code).toBe(0)
    expect(parsed(result.stdout)).toMatchObject({
      outcome: 'succeeded',
      body: { tenantId: otherTenantText },
    })
    expect(readLogin()).toEqual({ ...before, tenantId: otherTenantText })
    expect(readdirSync(state)).toEqual(['login.json'])
  })

  it('makes the next command act for the new tenant', async () => {
    const service = await serve()
    await login(service)
    await cli(switched)
    await cli(['leave-organization'])
    expect(service.seen.at(-1)?.wire['actingTenant']).toBe(otherTenantText)
  })

  it.each(['no-change', 'denied', 'basis-unavailable'] as const)(
    'leaves the login file as it was for %s',
    async outcome => {
      const service = await serve(answering('switch-current-tenant', outcome))
      await login(service)
      const before = readFileSync(loginFile(), 'utf8')
      const result = await cli(switched)
      expect(parsed(result.stdout)).toMatchObject({ outcome })
      expect(result.stderr).toBe('')
      expect(result.code).toBe(outcome === 'no-change' ? 0 : outcome === 'denied' ? 3 : 4)
      expect(readFileSync(loginFile(), 'utf8')).toBe(before)
      expect(readdirSync(state)).toEqual(['login.json'])
    },
  )

  it('keeps the owner records of sessions that exist: a switch does not move them', async () => {
    const service = await serve()
    await login(service)
    await cli(['create-session', '--definition', 'default'])
    const owners = () => readFileSync(join(state, 'sessions.json'), 'utf8')
    const recorded = owners()
    expect(JSON.parse(recorded)).toEqual({ version: 1, sessions: { [sessionId]: tenantText } })

    await cli(switched)
    expect(owners()).toBe(recorded)
    await cli(['send-input', '--session', sessionId, '--text', 'hello'])
    expect(service.seen.at(-1)?.wire).toMatchObject({
      operation: 'send-input',
      body: { tenant: tenantText },
    })

    // A session that is created after the switch belongs to the new tenant.
    await cli(['create-session', '--definition', 'default'])
    expect(service.seen.at(-1)?.wire['actingTenant']).toBe(otherTenantText)
  })

  it('exits 1 after it printed the result when the login file cannot be replaced', async () => {
    const service = await serve(seen => {
      if (seen.wire['operation'] !== 'switch-current-tenant') return undefined
      // The answer arrives after the command read the file. A directory in its place makes the rename fail.
      rmSync(loginFile())
      mkdirSync(loginFile())
      writeFileSync(join(loginFile(), 'sentinel'), 'kept')
      return { outcome: 'succeeded', body: { tenantId: otherTenantText } }
    })
    await login(service)
    const result = await cli(switched)
    expect(result.code).toBe(1)
    expect(parsed(result.stdout)).toMatchObject({ outcome: 'succeeded' })
    expect(result.stderr).toContain('omne switch-current-tenant: cannot write login state')
    expect(readFileSync(join(loginFile(), 'sentinel'), 'utf8')).toBe('kept')
  })
})

describe('revoke-login', () => {
  it('logout-removes-login-state: ending this login deletes the login file', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['revoke-login'])
    expect(result.code).toBe(0)
    expect(parsed(result.stdout)).toMatchObject({ outcome: 'succeeded' })
    expect(service.seen.at(-1)?.wire['body']).toEqual({ targetLoginId: ownLoginId })
    expect(existsSync(loginFile())).toBe(false)
    expect(existsSync(state)).toBe(true)
  })

  it('then refuses a command that needs a login', async () => {
    const service = await serve()
    await login(service)
    await cli(['revoke-login'])
    const result = await cli(['query-current-tenant', '--server', service.origin])
    expect(result).toMatchObject({ code: 1, stdout: '', stderr: notLoggedIn })
  })

  it('deletes the file when the login was already ended (no-change)', async () => {
    const service = await serve(answering('revoke-login', 'no-change'))
    await login(service)
    const result = await cli(['revoke-login'])
    expect(result.code).toBe(0)
    expect(existsSync(loginFile())).toBe(false)
  })

  it('deletes the file when --target-login names this login', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['revoke-login', '--target-login', ownLoginId])
    expect(result.code).toBe(0)
    expect(existsSync(loginFile())).toBe(false)
  })

  it('keeps the file when it ends another login', async () => {
    const service = await serve()
    await login(service)
    const before = readFileSync(loginFile(), 'utf8')
    const result = await cli(['revoke-login', '--target-login', otherLoginId])
    expect(result.code).toBe(0)
    expect(service.seen.at(-1)?.wire['body']).toEqual({ targetLoginId: otherLoginId })
    expect(readFileSync(loginFile(), 'utf8')).toBe(before)
  })

  it.each(['denied', 'not-visible', 'basis-unavailable'] as const)(
    'keeps the file for %s, because the login may still be valid',
    async outcome => {
      const service = await serve(answering('revoke-login', outcome))
      await login(service)
      const before = readFileSync(loginFile(), 'utf8')
      const result = await cli(['revoke-login'])
      expect(parsed(result.stdout)).toMatchObject({ outcome })
      expect(result.code).toBe(outcome === 'basis-unavailable' ? 4 : 3)
      expect(readFileSync(loginFile(), 'utf8')).toBe(before)
    },
  )

  it('keeps the file when the result is uncertain', async () => {
    const service = await serve()
    await login(service)
    const before = readFileSync(loginFile(), 'utf8')
    const port = await closedPort()
    const result = await cli(['revoke-login', '--server', `http://127.0.0.1:${port}`])
    expect(result.code).toBe(5)
    expect(readFileSync(loginFile(), 'utf8')).toBe(before)
  })

  it('leaves the owner records alone', async () => {
    const service = await serve()
    await login(service)
    await cli(['create-session', '--definition', 'default'])
    const recorded = readFileSync(join(state, 'sessions.json'), 'utf8')
    await cli(['revoke-login'])
    expect(readFileSync(join(state, 'sessions.json'), 'utf8')).toBe(recorded)
  })
})
