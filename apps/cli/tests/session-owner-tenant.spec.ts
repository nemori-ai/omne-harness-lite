import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandUnrecognized } from './support/expected.ts'
import {
  defaultAnswer,
  issuedProof,
  otherTenantText,
  sessionId,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess } from './support/in-process.ts'

const otherSessionId = 'fedcba9876543210'.repeat(4)
const ownerUnknown = (command: string) =>
  `omne ${command}: the owner tenant of this session is unknown\nAdd --tenant <tenant>.\n`

let root: string
let state: string
let service: FakeService | undefined

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-owner-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await service?.close()
  service = undefined
  rmSync(root, { recursive: true, force: true })
})

/** The login answers with the tenant of the identifier; a session is named after its acting tenant. */
function answerByTenant(seen: Seen): Answer {
  const body = (seen.wire['body'] ?? {}) as Record<string, unknown>
  switch (seen.wire['operation']) {
    case 'issue-login':
      return {
        outcome: 'succeeded',
        body: {
          loginIdentifier: body['loginIdentifier'],
          issuedAt: '2026-11-01T12:00:00Z',
          tenantId: body['loginIdentifier'] === 'alice' ? tenantText : otherTenantText,
          loginProof: issuedProof,
        },
      }
    case 'create-session':
      return {
        outcome: 'succeeded',
        body: {
          session: seen.wire['actingTenant'] === tenantText ? sessionId : otherSessionId,
          recovered: false,
        },
      }
    default:
      return defaultAnswer(seen)
  }
}

async function serve(answer: (seen: Seen) => Answer = answerByTenant): Promise<FakeService> {
  service = await startFakeService(answer)
  return service
}

function cli(argv: readonly string[]) {
  return runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home') })
}

async function login(origin: FakeService, identifier: string) {
  const result = await cli(['login', '--login-identifier', identifier, '--server', origin.origin])
  expect(result.code).toBe(0)
}

const recordsFile = () => join(state, 'sessions.json')
const bodyOfLast = (origin: FakeService) =>
  origin.seen.at(-1)?.wire['body'] as Record<string, unknown>

/** Each command that acts on an existing session, as arguments for that session. */
const existing: readonly (readonly [string, (session: string) => readonly string[]])[] = [
  ['send-input', session => ['--session', session, '--text', 'hello']],
  ['cancel-run', session => ['--session', session, '--run', 'run-7']],
  ['stop-call', session => ['--session', session, '--producer-kind', 'model', '--call', 'call-3']],
]

describe('create-session records the owner of the session', () => {
  it('writes the session id and the tenant text, and nothing else', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    const created = await cli(['create-session', '--definition', 'default'])
    expect(created.code).toBe(0)
    expect(JSON.parse(readFileSync(recordsFile(), 'utf8'))).toEqual({
      version: 1,
      sessions: { [sessionId]: tenantText },
    })
    expect(readFileSync(recordsFile(), 'utf8')).not.toContain(issuedProof)
  })

  it.skipIf(process.platform === 'win32')('creates the file with mode 0600', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    await cli(['create-session', '--definition', 'default'])
    expect(statSync(recordsFile()).mode & 0o777).toBe(0o600)
  })

  it('keeps the owners of earlier sessions when a session of another tenant is created', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    await cli(['create-session', '--definition', 'default'])
    await login(origin, 'bob')
    await cli(['create-session', '--definition', 'default'])
    expect(JSON.parse(readFileSync(recordsFile(), 'utf8')).sessions).toEqual({
      [sessionId]: tenantText,
      [otherSessionId]: otherTenantText,
    })
  })

  it.each(['denied', 'conflict', 'unknown', 'basis-unavailable'])(
    'writes nothing when the outcome is %s',
    async outcome => {
      const origin = await serve(seen =>
        seen.wire['operation'] === 'create-session' ? { outcome, body: {} } : answerByTenant(seen),
      )
      await login(origin, 'alice')
      await cli(['create-session', '--definition', 'default'])
      expect(existsSync(recordsFile())).toBe(false)
    },
  )

  it('prints the result, names the file, and exits 1 when the record cannot be written', async () => {
    const origin = await serve(seen => {
      // The service answers after the command has read the records, so this breaks the write only.
      if (seen.wire['operation'] === 'create-session') mkdirSync(recordsFile())
      return answerByTenant(seen)
    })
    await login(origin, 'alice')
    const result = await cli(['create-session', '--definition', 'default'])
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'response', outcome: 'succeeded' })
    expect(result.stderr).toMatch(
      /^omne create-session: cannot write session records .*sessions\.json: [A-Z]+\n$/,
    )
  })

  it('stops before it sends anything when the records are damaged', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    writeFileSync(recordsFile(), '{broken')
    const before = origin.seen.length
    const result = await cli(['create-session', '--definition', 'default'])
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(`omne: session records ${recordsFile()} are invalid\n`)
    expect(origin.seen).toHaveLength(before)
  })
})

describe.each(existing)('%s on an existing session', (name, argsFor) => {
  it('sends the owner tenant after the selected tenant has changed', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    await cli(['create-session', '--definition', 'default'])
    // The current selection is now the other tenant.
    await login(origin, 'bob')
    const result = await cli([name, ...argsFor(sessionId)])
    expect(result.code).toBe(0)
    expect(bodyOfLast(origin)['tenant']).toBe(tenantText)
    expect(JSON.parse(result.stdout).request.tenant).toBe(tenantText)
  })

  it('sends the owner of each session when sessions of two tenants exist', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    await cli(['create-session', '--definition', 'default'])
    await login(origin, 'bob')
    await cli(['create-session', '--definition', 'default'])
    await cli([name, ...argsFor(sessionId)])
    expect(bodyOfLast(origin)['tenant']).toBe(tenantText)
    await cli([name, ...argsFor(otherSessionId)])
    expect(bodyOfLast(origin)['tenant']).toBe(otherTenantText)
  })

  it('answers a usage error and sends nothing when the owner is unknown', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    await cli(['create-session', '--definition', 'default'])
    const before = origin.seen.length
    const result = await cli([name, ...argsFor(otherSessionId)])
    expect(result).toMatchObject({ code: 2, stdout: '', stderr: ownerUnknown(name) })
    expect(origin.seen).toHaveLength(before)
  })

  it('answers the same usage error when no session was ever created', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    const result = await cli([name, ...argsFor(sessionId)])
    expect(result).toMatchObject({ code: 2, stdout: '', stderr: ownerUnknown(name) })
    expect(origin.seen).toHaveLength(1)
    expect(existsSync(recordsFile())).toBe(false)
  })

  it('takes --tenant over the record', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    await cli(['create-session', '--definition', 'default'])
    const result = await cli([name, ...argsFor(sessionId), '--tenant', otherTenantText])
    expect(result.code).toBe(0)
    expect(bodyOfLast(origin)['tenant']).toBe(otherTenantText)
  })

  it('takes --tenant for a session that has no record', async () => {
    const origin = await serve()
    await login(origin, 'bob')
    const result = await cli([name, ...argsFor(sessionId), '--tenant', tenantText])
    expect(result.code).toBe(0)
    expect(bodyOfLast(origin)['tenant']).toBe(tenantText)
    expect(existsSync(recordsFile())).toBe(false)
  })

  it('refuses a --tenant that is not a tenant text, even when a record exists', async () => {
    const origin = await serve()
    await login(origin, 'alice')
    await cli(['create-session', '--definition', 'default'])
    const before = origin.seen.length
    const result = await cli([name, ...argsFor(sessionId), '--tenant', 'nobody'])
    expect(result).toMatchObject({ code: 2, stderr: commandUnrecognized(name) })
    expect(origin.seen).toHaveLength(before)
  })

  describe('with records that cannot be used', () => {
    const damaged: readonly (readonly [string, () => void, string])[] = [
      ['not JSON', () => writeFileSync(recordsFile(), '{broken'), 'are invalid'],
      [
        'an unknown version',
        () => writeFileSync(recordsFile(), JSON.stringify({ version: 2, sessions: {} })),
        'are invalid',
      ],
      [
        'an extra key',
        () =>
          writeFileSync(recordsFile(), JSON.stringify({ version: 1, sessions: {}, extra: true })),
        'are invalid',
      ],
      [
        'a tenant that is not a tenant text',
        () =>
          writeFileSync(
            recordsFile(),
            JSON.stringify({ version: 1, sessions: { [sessionId]: 'nobody' } }),
          ),
        'are invalid',
      ],
      ['a directory in place of the file', () => mkdirSync(recordsFile()), 'cannot read'],
    ]

    it.each(damaged)('exits 1 and sends nothing for %s', async (_label, damage, wording) => {
      const origin = await serve()
      await login(origin, 'alice')
      await cli(['create-session', '--definition', 'default'])
      rmSync(recordsFile(), { recursive: true, force: true })
      damage()
      const before = origin.seen.length
      const result = await cli([name, ...argsFor(sessionId)])
      expect(result.code).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain(recordsFile())
      expect(result.stderr).toContain(wording)
      expect(origin.seen).toHaveLength(before)
    })

    it('does not read the records when --tenant is given', async () => {
      const origin = await serve()
      await login(origin, 'alice')
      writeFileSync(recordsFile(), '{broken')
      const result = await cli([name, ...argsFor(sessionId), '--tenant', tenantText])
      expect(result.code).toBe(0)
      expect(bodyOfLast(origin)['tenant']).toBe(tenantText)
    })
  })
})
