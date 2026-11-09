// `omne setting list|set|show|unset` (SPEC「设置命令」): the request each subcommand sends, the asset
// selector with and without a category, the output and exit code of each result, the usage errors,
// and a secret that never reaches standard output, standard error or the state directory. The
// secret is a sentinel value, and every case scans every output for it.
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  productionCatalog,
  readCredential,
  run,
  type CliRuntime,
  type CredentialInput,
} from '@omne-harness/cli'
import { createHttpTransport } from '@omne-harness/sdk'
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

const SENTINEL = 'exa-cli-sentinel-9d2c-never-printed'
const AT = '2026-11-09T08:00:00Z'
const WEB = { category: 'tool', name: 'Web' }
const ITEM = 'exa.apiKey'

let root: string
let state: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-setting-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

async function serve(answer: (seen: Seen) => Answer | undefined = () => undefined) {
  const service = await startFakeService(seen => answer(seen) ?? defaultAnswer(seen))
  services.push(service)
  return service
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
    { omneHome: state, homeDirectory: join(root, 'home') },
  )
  expect(result.code).toBe(0)
}

/** Every byte the command left where a user or another process could read it. */
function visible(result: { stdout: string; stderr: string }): string {
  const files = readdirSync(state).map(name => readFileSync(join(state, name), 'utf8'))
  return [result.stdout, result.stderr, ...files].join('\n')
}

const wireOf = (service: FakeService, operation: string) =>
  service.seen.filter(seen => seen.wire['operation'] === operation).at(-1)?.wire

const answerFor =
  (operation: string, answer: Answer) =>
  (seen: Seen): Answer | undefined =>
    seen.wire['operation'] === operation ? answer : undefined

describe('setting set', () => {
  it('reads the secret, sets it for the acting tenant and prints no secret', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['setting', 'set', 'tool:Web', ITEM])
    expect(result.code).toBe(0)
    expect(result.credentialReads).toBe(1)
    expect(wireOf(service, 'set-setting')).toMatchObject({
      loginProof: issuedProof,
      actingTenant: tenantText,
      body: { asset: WEB, item: ITEM, secret: SENTINEL },
    })
    const printed = JSON.parse(result.stdout)
    expect(printed).toEqual({
      result: 'response',
      outcome: 'succeeded',
      body: { configuredAt: AT },
      request: { messageId: expect.any(String), tenant: tenantText },
    })
    expect(result.stderr).toBe('')
    expect(visible(result)).not.toContain(SENTINEL)
  })

  it('takes no secret from the command line', async () => {
    const service = await serve()
    await login(service)
    for (const args of [
      ['setting', 'set', 'Web', ITEM, SENTINEL],
      ['setting', 'set', 'Web', ITEM, '--secret', SENTINEL],
      ['setting', 'set', 'Web', ITEM, `--secret=${SENTINEL}`],
    ]) {
      const result = await cli(args)
      expect(result.code, args.join(' ')).toBe(2)
      expect(result.stderr).toBe(commandUnrecognized('setting set'))
      expect(result.credentialReads).toBe(0)
      expect(result.stdout + result.stderr).not.toContain(SENTINEL)
    }
    expect(wireOf(service, 'set-setting')).toBeUndefined()
  })

  it('an empty secret is a usage error and sends nothing', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['setting', 'set', 'Web', ITEM], {
      credential: { kind: 'credential', value: '' },
    })
    expect(result.code).toBe(2)
    expect(result.stderr).toBe('omne: empty secret\n')
    expect(wireOf(service, 'set-setting')).toBeUndefined()
  })

  it('without a login it reads no secret', async () => {
    const result = await cli(['setting', 'set', 'Web', ITEM])
    expect(result.code).toBe(1)
    expect(result.credentialReads).toBe(0)
  })

  it.each([
    ['denied', 3],
    ['not-visible', 3],
    ['conflict', 3],
    ['not-writable', 3],
    ['stage-not-provided', 3],
    ['basis-unavailable', 4],
    ['unknown', 5],
  ] as const)('a %s answer exits %i and prints no secret', async (outcome, code) => {
    const service = await serve(answerFor('set-setting', { outcome, body: {} }))
    await login(service)
    const result = await cli(['setting', 'set', 'Web', ITEM])
    expect(result.code).toBe(code)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome })
    expect(visible(result)).not.toContain(SENTINEL)
  })

  it('reads the secret from a hidden prompt that echoes nothing', async () => {
    const service = await serve()
    await login(service)
    const modes: boolean[] = []
    let stdout = ''
    let stderr = ''
    const listeners = new Map<string, (chunk?: string) => void>()
    // A terminal that turns echo off when asked and types the secret once reading starts.
    const terminal: CredentialInput = {
      isTTY: true,
      setRawMode: mode => modes.push(mode),
      setEncoding: () => undefined,
      on: (event: string, listener: (chunk?: string) => void) => listeners.set(event, listener),
      off: (event: string) => listeners.delete(event),
      pause: () => undefined,
      resume: () => {
        queueMicrotask(() => listeners.get('data')?.(`${SENTINEL}\r`))
      },
      [Symbol.asyncIterator]: () => {
        throw new Error('a terminal is read by events')
      },
    } as CredentialInput
    let counter = 0
    const runtime: CliRuntime = {
      catalog: productionCatalog,
      readIdentity: () => ({ kind: 'identity', version: '0.0.0' }),
      environmentHome: state,
      homeDirectory: join(root, 'home'),
      environmentServer: undefined,
      services: {
        createTransport: (origin, location) => createHttpTransport({ origin, location }),
        readCredential: prompt => readCredential(terminal, prompt),
        newId: () => `id-${(counter += 1)}`,
      },
    }
    const code = await run(
      ['setting', 'set', 'Web', ITEM],
      {
        stdout: text => {
          stdout += text
        },
        stderr: text => {
          stderr += text
        },
      },
      runtime,
    )
    expect(code).toBe(0)
    expect(modes).toEqual([true, false])
    expect(stderr).toBe('Credential: \n')
    expect(wireOf(service, 'set-setting')).toMatchObject({ body: { secret: SENTINEL } })
    expect(stdout + stderr).not.toContain(SENTINEL)
  })
})

describe('the asset selector', () => {
  it.each([
    ['tool:Web', WEB],
    ['Web', { name: 'Web' }],
    ['tool:Web:v2', { category: 'tool', name: 'Web:v2' }],
  ])('%s is sent as %j', async (asset, expected) => {
    const service = await serve()
    await login(service)
    for (const args of [
      ['setting', 'show', asset, ITEM],
      ['setting', 'unset', asset, ITEM],
      ['setting', 'list', asset],
    ]) {
      const result = await cli(args)
      expect(result.code, args.join(' ')).toBe(0)
    }
    for (const operation of ['describe-setting', 'clear-setting', 'list-settings']) {
      const body = wireOf(service, operation)?.['body'] as Record<string, unknown>
      expect(body['asset'], operation).toEqual(expected)
      expect(Object.hasOwn(body['asset'] as object, 'category'), operation).toBe(
        'category' in expected,
      )
    }
  })

  it.each([':Web', 'tool:', ':', ''])('%j is a usage error and sends nothing', async asset => {
    const service = await serve()
    await login(service)
    const result = await cli(['setting', 'show', asset, ITEM])
    expect(result.code).toBe(2)
    expect(result.stderr).toBe(commandUnrecognized('setting show'))
    expect(wireOf(service, 'describe-setting')).toBeUndefined()
  })
})

describe('setting show', () => {
  it('prints presence and the configuration time in one JSON object', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['setting', 'show', 'Web', ITEM])
    expect(result.code).toBe(0)
    expect(result.credentialReads).toBe(0)
    expect(wireOf(service, 'describe-setting')).toMatchObject({
      actingTenant: tenantText,
      body: { asset: { name: 'Web' }, item: ITEM },
    })
    expect(JSON.parse(result.stdout)).toEqual({
      result: 'response',
      outcome: 'succeeded',
      body: { state: 'usable', tenantId: tenantText, configuredAt: AT },
      request: { messageId: expect.any(String), tenant: tenantText },
    })
  })

  it('prints an unconfigured item and a not-writable answer', async () => {
    for (const [answer, code] of [
      [{ outcome: 'succeeded', body: { state: 'unbound' } }, 0],
      [{ outcome: 'not-writable', body: {} }, 3],
    ] as const) {
      const service = await serve(answerFor('describe-setting', answer))
      await login(service)
      const result = await cli(['setting', 'show', 'Web', ITEM])
      expect(result.code).toBe(code)
      expect(JSON.parse(result.stdout)).toMatchObject(answer)
    }
  })
})

describe('setting unset', () => {
  it.each([
    ['succeeded', 0],
    ['no-change', 0],
    ['denied', 3],
    ['unknown', 5],
  ] as const)('answers %s with exit %i', async (outcome, code) => {
    const service = await serve(answerFor('clear-setting', { outcome, body: {} }))
    await login(service)
    const result = await cli(['setting', 'unset', 'Web', ITEM])
    expect(result.code).toBe(code)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome, body: {} })
    expect(wireOf(service, 'clear-setting')).toMatchObject({
      body: { asset: { name: 'Web' }, item: ITEM },
    })
    expect(result.credentialReads).toBe(0)
  })
})

describe('setting list', () => {
  it('prints the items, with and without an asset', async () => {
    const service = await serve()
    await login(service)
    const all = await cli(['setting', 'list'])
    expect(all.code).toBe(0)
    expect(wireOf(service, 'list-settings')).toMatchObject({ actingTenant: tenantText, body: {} })
    const printed = JSON.parse(all.stdout)
    expect(printed).toMatchObject({ result: 'response', outcome: 'succeeded' })
    expect(printed.body.items).toContainEqual(
      expect.objectContaining({ asset: WEB, item: ITEM, sensitivity: 'secret' }),
    )
    expect(printed.body.completeness).toBe('complete')
    const one = await cli(['setting', 'list', 'tool:Web'])
    expect(one.code).toBe(0)
    expect(wireOf(service, 'list-settings')).toMatchObject({ body: { asset: WEB } })
  })
})

describe('usage errors', () => {
  it('a missing or unknown subcommand is a usage error with exit 2', async () => {
    for (const args of [['setting'], ['setting', 'rotate'], ['setting', '--server', 'x']]) {
      const result = await cli(args)
      expect(result.code, args.join(' ')).toBe(2)
      expect(result.stderr).toBe(commandUnrecognized('setting'))
    }
  })

  it('missing and extra arguments are usage errors with exit 2 and send nothing', async () => {
    const service = await serve()
    await login(service)
    const sentBefore = service.seen.length
    for (const [args, message] of [
      [['setting', 'set'], 'omne setting set: missing <asset>\nRun omne --help for usage.\n'],
      [['setting', 'set', 'Web'], 'omne setting set: missing <item>\nRun omne --help for usage.\n'],
      [
        ['setting', 'show', 'Web'],
        'omne setting show: missing <item>\nRun omne --help for usage.\n',
      ],
      [['setting', 'unset'], 'omne setting unset: missing <asset>\nRun omne --help for usage.\n'],
      [['setting', 'show', 'Web', ITEM, 'more'], commandUnrecognized('setting show')],
      [['setting', 'unset', 'Web', ITEM, 'more'], commandUnrecognized('setting unset')],
      [['setting', 'list', 'Web', ITEM], commandUnrecognized('setting list')],
      [['setting', 'list', '--json'], commandUnrecognized('setting list')],
      [['setting', 'show', 'Web', ITEM, '--server'], commandUnrecognized('setting show')],
    ] as const) {
      const result = await cli(args)
      expect(result.code, args.join(' ')).toBe(2)
      expect(result.stderr, args.join(' ')).toBe(message)
      expect(result.credentialReads).toBe(0)
    }
    expect(service.seen.length).toBe(sentBefore)
  })

  it('options may stand between the words', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['setting', 'show', '--server', service.origin, 'Web', ITEM])
    expect(result.code).toBe(0)
    expect(wireOf(service, 'describe-setting')).toMatchObject({
      body: { asset: { name: 'Web' }, item: ITEM },
    })
  })
})

describe('the built bin', () => {
  let sandbox: Sandbox
  beforeAll(() => {
    sandbox = createSandbox()
  })
  afterAll(() => sandbox.remove())

  it('reads the secret from a pipe and writes it nowhere', { tags: ['slow'] }, async () => {
    // Slow: it spawns the built bin twice.
    expect(builtBin).toContain('dist')
    const service = await serve()
    const home = join(sandbox.root, 'omne-home')
    const logged = await runCliAsync(sandbox, ['login', '--login-identifier', 'alice'], {
      omneHome: home,
      omneServer: service.origin,
      stdin: 'pw-not-the-secret\n',
    })
    expect(logged.status).toBe(0)
    const result = await runCliAsync(sandbox, ['setting', 'set', 'Web', ITEM], {
      omneHome: home,
      omneServer: service.origin,
      stdin: `${SENTINEL}\n`,
    })
    expect(result.status).toBe(0)
    expect(wireOf(service, 'set-setting')).toMatchObject({ body: { secret: SENTINEL } })
    const files = readdirSync(home).map(name => readFileSync(join(home, name), 'utf8'))
    expect([result.stdout, result.stderr, ...files].join('\n')).not.toContain(SENTINEL)
  })
})
