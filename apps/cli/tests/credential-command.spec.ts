// `omne credential set|show|unset` (SPEC「模型凭据命令」): the request each subcommand sends, the
// output and exit code of each result, the usage errors, and a secret that never reaches standard
// output, standard error or the state directory. The secret is a sentinel value, and every
// case scans every output for it.
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { commandUnrecognized } from './support/expected.ts'
import { builtBin, createSandbox, runCliAsync, type Sandbox } from './support/cli-process.ts'
import {
  defaultAnswer,
  issuedProof,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess, type InProcessOptions } from './support/in-process.ts'

const SENTINEL = 'sk-or-v1-cli-sentinel-5e1b'
const AT = '2026-11-04T08:00:00Z'

let root: string
let state: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-cred-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

/** A service that answers the three credential operations by `answer`, the rest by default. */
async function serve(answer: (seen: Seen) => Answer | undefined = () => undefined) {
  const service = await startFakeService(seen => answer(seen) ?? credentialDefault(seen))
  services.push(service)
  return service
}

function credentialDefault(seen: Seen): Answer {
  switch (seen.wire['operation']) {
    case 'bind-model-credential':
      return { outcome: 'succeeded', body: { configuredAt: AT } }
    case 'unbind-model-credential':
      return { outcome: 'succeeded', body: {} }
    case 'describe-model-credential':
      return {
        outcome: 'succeeded',
        body: { state: 'usable', tenantId: tenantText, configuredAt: AT },
      }
    default:
      return defaultAnswer(seen)
  }
}

function cli(argv: readonly string[], options: InProcessOptions = {}) {
  return runInProcess(argv, {
    omneHome: state,
    homeDirectory: join(root, 'home'),
    credential: { kind: 'credential', value: SENTINEL },
    ...options,
  })
}

async function login(service: FakeService) {
  const result = await runInProcess(
    ['login', '--login-identifier', 'alice', '--server', service.origin],
    {
      omneHome: state,
      homeDirectory: join(root, 'home'),
    },
  )
  expect(result.code).toBe(0)
}

/** Every byte the command left where a user or another process could read it. */
function visible(result: { stdout: string; stderr: string }): string {
  const files = readdirSync(state).map(name => readFileSync(join(state, name), 'utf8'))
  return [result.stdout, result.stderr, ...files].join('\n')
}

const wireOf = (service: FakeService, operation: string) =>
  service.seen.find(seen => seen.wire['operation'] === operation)?.wire

describe('credential set', () => {
  it('reads the secret, binds it for the acting tenant and prints no secret', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['credential', 'set'])
    expect(result.code).toBe(0)
    expect(result.credentialReads).toBe(1)
    const wire = wireOf(service, 'bind-model-credential')
    expect(wire).toMatchObject({
      loginProof: issuedProof,
      actingTenant: tenantText,
      body: { secret: SENTINEL },
    })
    expect(JSON.parse(result.stdout)).toMatchObject({
      result: 'response',
      outcome: 'succeeded',
      body: { configuredAt: AT },
      request: { tenant: tenantText },
    })
    expect(visible(result)).not.toContain(SENTINEL)
  })

  it('takes no secret from the command line', async () => {
    const service = await serve()
    await login(service)
    for (const args of [
      ['credential', 'set', '--secret', SENTINEL],
      ['credential', 'set', SENTINEL],
      ['credential', 'set', '--credential', SENTINEL],
    ]) {
      const result = await cli(args)
      expect(result.code).toBe(2)
      expect(result.stderr).toBe(commandUnrecognized('credential set'))
      expect(result.credentialReads).toBe(0)
      expect(result.stdout + result.stderr).not.toContain(SENTINEL)
    }
    expect(wireOf(service, 'bind-model-credential')).toBeUndefined()
  })

  it('an empty secret is a usage error and sends nothing', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['credential', 'set'], {
      credential: { kind: 'credential', value: '' },
    })
    expect(result.code).toBe(2)
    expect(result.stderr).toBe('omne: empty credential\n')
    expect(wireOf(service, 'bind-model-credential')).toBeUndefined()
  })

  it('without a login it reads no secret', async () => {
    const result = await cli(['credential', 'set'])
    expect(result.code).toBe(1)
    expect(result.credentialReads).toBe(0)
  })

  it.each([
    ['denied', 3],
    ['basis-unavailable', 4],
    ['unknown', 5],
    ['stage-not-provided', 3],
  ] as const)('a %s answer exits %i and prints no secret', async (outcome, code) => {
    const service = await serve(seen =>
      seen.wire['operation'] === 'bind-model-credential' ? { outcome, body: {} } : undefined,
    )
    await login(service)
    const result = await cli(['credential', 'set'])
    expect(result.code).toBe(code)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome })
    expect(visible(result)).not.toContain(SENTINEL)
  })
})

describe('credential show', () => {
  it('prints a summary a person reads: presence, owner and time', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['credential', 'show'])
    expect(result.code).toBe(0)
    expect(result.credentialReads).toBe(0)
    expect(result.stdout).toBe(
      `Model credential: set\nTenant: ${tenantText}\nConfigured at: ${AT}\n`,
    )
    expect(wireOf(service, 'describe-model-credential')).toMatchObject({
      actingTenant: tenantText,
      body: {},
    })
  })

  it('names an unbound and an unreadable credential', async () => {
    const answers: Answer[] = [
      { outcome: 'succeeded', body: { state: 'unbound' } },
      { outcome: 'succeeded', body: { state: 'unreadable', tenantId: tenantText } },
      { outcome: 'denied', body: {} },
    ]
    const expected = [
      'Model credential: not set\n',
      `Model credential: set, but it cannot be read\nTenant: ${tenantText}\nConfigured at: not recorded\n`,
      'Result: denied\n',
    ]
    for (const [index, answer] of answers.entries()) {
      const service = await serve(seen =>
        seen.wire['operation'] === 'describe-model-credential' ? answer : undefined,
      )
      await login(service)
      const result = await cli(['credential', 'show'])
      expect(result.stdout).toBe(expected[index])
      expect(result.code).toBe(index === 2 ? 3 : 0)
    }
  })

  it('--json prints the result object of the other commands', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['credential', 'show', '--json'])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      result: 'response',
      outcome: 'succeeded',
      body: { state: 'usable', tenantId: tenantText, configuredAt: AT },
    })
    expect((await cli(['credential', 'show', '--json', '--json'])).code).toBe(2)
    expect((await cli(['credential', 'set', '--json'])).code).toBe(2)
  })
})

describe('credential unset', () => {
  it.each([
    ['succeeded', 0],
    ['no-change', 0],
    ['denied', 3],
  ] as const)('answers %s with exit %i', async (outcome, code) => {
    const service = await serve(seen =>
      seen.wire['operation'] === 'unbind-model-credential' ? { outcome, body: {} } : undefined,
    )
    await login(service)
    const result = await cli(['credential', 'unset'])
    expect(result.code).toBe(code)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome })
    expect(wireOf(service, 'unbind-model-credential')).toMatchObject({ body: {} })
    expect(result.credentialReads).toBe(0)
  })
})

it('a missing or unknown subcommand is a usage error', async () => {
  for (const args of [['credential'], ['credential', 'rotate'], ['credential', '--json']]) {
    const result = await cli(args)
    expect(result.code).toBe(2)
    expect(result.stderr).toBe(commandUnrecognized('credential'))
  }
})

describe('the built bin', () => {
  let sandbox: Sandbox
  beforeAll(() => {
    sandbox = createSandbox()
  })
  afterAll(() => sandbox.remove())

  it('reads the secret from a pipe and writes it nowhere', async () => {
    expect(builtBin).toContain('dist')
    const service = await serve()
    const home = join(sandbox.root, 'omne-home')
    const logged = await runCliAsync(sandbox, ['login', '--login-identifier', 'alice'], {
      omneHome: home,
      omneServer: service.origin,
      stdin: 'pw-not-the-secret\n',
    })
    expect(logged.status).toBe(0)
    const result = await runCliAsync(sandbox, ['credential', 'set'], {
      omneHome: home,
      omneServer: service.origin,
      stdin: `${SENTINEL}\n`,
    })
    expect(result.status).toBe(0)
    expect(wireOf(service, 'bind-model-credential')).toMatchObject({ body: { secret: SENTINEL } })
    const files = readdirSync(home).map(name => readFileSync(join(home, name), 'utf8'))
    expect([result.stdout, result.stderr, ...files].join('\n')).not.toContain(SENTINEL)
  })
})
