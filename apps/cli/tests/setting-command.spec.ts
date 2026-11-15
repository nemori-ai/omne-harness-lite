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
import { createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { commandUnrecognized } from './support/expected.ts'
import { builtBin, createSandbox, runCliAsync, type Sandbox } from './support/cli-process.ts'
import {
  closedPort,
  defaultAnswer,
  issuedProof,
  ordinaryView,
  secretView,
  settingRevision,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess, type InProcessOptions } from './support/in-process.ts'

const SENTINEL = 'exa-cli-sentinel-9d2c-never-printed'
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

function visible(result: { stdout: string; stderr: string }): string {
  const files = readdirSync(state).map(name => readFileSync(join(state, name), 'utf8'))
  return [result.stdout, result.stderr, ...files].join('\n')
}

const seenOf = (service: FakeService, operation: string) =>
  service.seen.filter(seen => seen.operation === operation).at(-1)

const countOf = (service: FakeService, operation: string) =>
  service.seen.filter(seen => seen.operation === operation).length

const answerFor =
  (operation: string, answer: Answer) =>
  (seen: Seen): Answer | undefined =>
    seen.operation === operation ? answer : undefined

const bodies: Readonly<Record<string, unknown>> = {
  succeeded: { revision: '9' },
  'not-writable': { reason: 'locked' },
}
const bodyOf = (outcome: string): unknown => bodies[outcome] ?? {}

describe('setting set', () => {
  it('reads the secret, sets it for the acting tenant and prints no secret', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['setting', 'set', 'tool:Web', ITEM])
    expect(result.code).toBe(0)
    expect(result.credentialReads).toBe(1)
    const sent = seenOf(service, 'set-setting')
    expect(sent?.path).toBe('/api/assets/v1/set-setting')
    expect(sent?.headers['authorization']).toBe(`Bearer ${issuedProof}`)
    expect(sent?.headers['omne-acting-tenant']).toBeUndefined()
    expect(sent?.body).toEqual({
      tenant: tenantText,
      asset: WEB,
      item: ITEM,
      operation: expect.any(String),
      expectedRevision: settingRevision,
      value: { kind: 'secret', secret: SENTINEL },
    })
    const printed = JSON.parse(result.stdout)
    expect(printed).toEqual({
      result: 'response',
      outcome: 'succeeded',
      body: { revision: String(Number(settingRevision) + 1) },
      request: { messageId: sent?.messageId, tenant: tenantText },
    })
    expect(result.stderr).toBe('')
    expect(visible(result)).not.toContain(SENTINEL)
  })

  it('reads the item first and writes with the revision it read', async () => {
    const service = await serve(
      answerFor('describe-setting', {
        outcome: 'succeeded',
        body: { item: { ...secretView, revision: '41' } },
      }),
    )
    await login(service)
    const result = await cli(['setting', 'set', 'tool:Web', ITEM])
    expect(result.code).toBe(0)
    const operations = service.seen.map(seen => seen.operation)
    expect(operations.slice(-2)).toEqual(['describe-setting', 'set-setting'])
    expect(seenOf(service, 'describe-setting')?.body).toEqual({
      tenant: tenantText,
      asset: WEB,
      item: ITEM,
    })
    expect(seenOf(service, 'set-setting')?.body).toMatchObject({ expectedRevision: '41' })
  })

  it('reports a revision conflict as it is and does not write again', async () => {
    const service = await serve(answerFor('set-setting', { outcome: 'conflict', body: {} }))
    await login(service)
    const result = await cli(['setting', 'set', 'tool:Web', ITEM])
    expect(result.code).toBe(3)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'response', outcome: 'conflict' })
    expect(countOf(service, 'set-setting')).toBe(1)
    expect(countOf(service, 'describe-setting')).toBe(1)
  })

  it('does not write when the item cannot be read, and reports why', async () => {
    const service = await serve(answerFor('describe-setting', { outcome: 'not-visible', body: {} }))
    await login(service)
    const result = await cli(['setting', 'set', 'tool:Web', ITEM])
    expect(result.code).toBe(3)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'response', outcome: 'not-visible' })
    expect(countOf(service, 'set-setting')).toBe(0)
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
    expect(seenOf(service, 'set-setting')).toBeUndefined()
  })

  it('an empty secret is a usage error and sends nothing', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['setting', 'set', 'Web', ITEM], {
      credential: { kind: 'credential', value: '' },
    })
    expect(result.code).toBe(2)
    expect(result.stderr).toBe('omne: empty secret\n')
    expect(seenOf(service, 'set-setting')).toBeUndefined()
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
    ['invalid', 3],
    ['not-writable', 3],
    ['no-change', 0],
    ['basis-unavailable', 4],
    ['unknown', 5],
  ] as const)('a %s answer exits %i and prints no secret', async (outcome, code) => {
    const service = await serve(answerFor('set-setting', { outcome, body: bodyOf(outcome) }))
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
        createTransport: (origin, credentials) =>
          createHttpProtocolTransport({ origin, credentials }),
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
    expect(seenOf(service, 'set-setting')?.body).toMatchObject({
      value: { kind: 'secret', secret: SENTINEL },
    })
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
      const body = seenOf(service, operation)?.body as Record<string, unknown>
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
    expect(seenOf(service, 'describe-setting')).toBeUndefined()
  })
})

describe('setting show', () => {
  it('prints the two layers of the item as two lines', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['setting', 'show', 'Web', ITEM])
    expect(result.code).toBe(0)
    expect(result.credentialReads).toBe(0)
    const sent = seenOf(service, 'describe-setting')
    expect(sent?.path).toBe('/api/assets/v1/describe-setting')
    expect(sent?.body).toEqual({ tenant: tenantText, asset: { name: 'Web' }, item: ITEM })
    expect(result.stdout).toBe('Your key: set\nDeployment default: not set\n')
  })

  it.each([
    ['unset', 'available', 'Your key: not set\nDeployment default: set\n'],
    [
      'revoked',
      'unreadable',
      'Your key: set, but revoked\nDeployment default: set, but it cannot be read\n',
    ],
  ] as const)('words each layer by its state', async (own, official, lines) => {
    const service = await serve(
      answerFor('describe-setting', {
        outcome: 'succeeded',
        body: { item: { ...secretView, own, official } },
      }),
    )
    await login(service)
    const result = await cli(['setting', 'show', 'Web', ITEM])
    expect(result.stdout).toBe(lines)
  })

  it('says so for an item that is not a secret', async () => {
    const service = await serve(
      answerFor('describe-setting', {
        outcome: 'succeeded',
        body: { item: ordinaryView },
      }),
    )
    await login(service)
    const result = await cli(['setting', 'show', 'Web', ITEM])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('Not a secret setting (ordinary). Add --json to read it.\n')
  })

  it('prints the result object with --json', async () => {
    const service = await serve()
    await login(service)
    const result = await cli(['setting', 'show', 'Web', ITEM, '--json'])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      result: 'response',
      outcome: 'succeeded',
      body: { item: secretView },
      request: { messageId: expect.any(String), tenant: tenantText },
    })
  })

  it('names a non-success outcome and exits by it', async () => {
    const service = await serve(answerFor('describe-setting', { outcome: 'not-visible', body: {} }))
    await login(service)
    const result = await cli(['setting', 'show', 'Web', ITEM])
    expect(result.code).toBe(3)
    expect(result.stdout).toBe('Result: not-visible\n')
    expect(result.stderr).toBe('')
  })

  it('prints an unavailable result and exits 4 when the service is not running', async () => {
    const service = await serve()
    await login(service)
    const port = await closedPort()
    const result = await cli([
      'setting',
      'show',
      'Web',
      ITEM,
      '--server',
      `http://127.0.0.1:${port}`,
    ])
    expect(result.code).toBe(4)
    expect(result.stdout).toBe('Result: unavailable\n')
    expect(result.stderr).toBe('')
  })

  it('prints an uncertain result and exits 5 when the answer cannot be trusted', async () => {
    const service = await serve(answerFor('describe-setting', { outcome: 'unknown', body: {} }))
    await login(service)
    const result = await cli(['setting', 'show', 'Web', ITEM])
    expect(result.code).toBe(5)
    expect(result.stdout).toBe('Result: uncertain\n')
    expect(result.stderr).toBe('omne setting show: result uncertain\n')
  })
})

describe('setting unset', () => {
  it.each([
    ['succeeded', 0],
    ['no-change', 0],
    ['denied', 3],
    ['conflict', 3],
    ['unknown', 5],
  ] as const)('answers %s with exit %i', async (outcome, code) => {
    const body = bodyOf(outcome)
    const service = await serve(answerFor('clear-setting', { outcome, body }))
    await login(service)
    const result = await cli(['setting', 'unset', 'Web', ITEM])
    expect(result.code).toBe(code)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome, body })
    const sent = seenOf(service, 'clear-setting')
    expect(sent?.path).toBe('/api/assets/v1/clear-setting')
    expect(sent?.body).toEqual({
      tenant: tenantText,
      asset: { name: 'Web' },
      item: ITEM,
      operation: expect.any(String),
      expectedRevision: settingRevision,
    })
    expect(countOf(service, 'clear-setting')).toBe(1)
    expect(result.credentialReads).toBe(0)
  })

  it('writes with the revision it read', async () => {
    const service = await serve(
      answerFor('describe-setting', {
        outcome: 'succeeded',
        body: { item: { ...secretView, revision: '17' } },
      }),
    )
    await login(service)
    await cli(['setting', 'unset', 'Web', ITEM])
    expect(seenOf(service, 'clear-setting')?.body).toMatchObject({ expectedRevision: '17' })
  })
})

describe('setting list', () => {
  it('prints the items, with and without an asset', async () => {
    const service = await serve()
    await login(service)
    const all = await cli(['setting', 'list'])
    expect(all.code).toBe(0)
    const first = seenOf(service, 'list-settings')
    expect(first?.path).toBe('/api/assets/v1/list-settings')
    expect(first?.body).toEqual({ tenant: tenantText, after: null, limit: 100 })
    const printed = JSON.parse(all.stdout)
    expect(printed).toMatchObject({ result: 'response', outcome: 'succeeded' })
    expect(printed.body.items).toContainEqual(
      expect.objectContaining({ asset: WEB, item: ITEM, kind: 'secret' }),
    )
    expect(printed.body.completeness).toBe('complete')
    const one = await cli(['setting', 'list', 'tool:Web'])
    expect(one.code).toBe(0)
    expect(seenOf(service, 'list-settings')?.body).toMatchObject({ asset: WEB })
  })

  const page = (items: unknown[], next: string | null, completeness = 'complete') => ({
    outcome: 'succeeded',
    body: { items, next, completeness },
  })

  it('reads every page, carrying the cursor of the page before', async () => {
    const pages = [
      page([{ ...secretView, item: 'one' }], 'c1'),
      page([{ ...secretView, item: 'two' }], 'c2', 'partial'),
      page([{ ...secretView, item: 'three' }], null),
    ]
    const service = await serve(seen => {
      if (seen.operation !== 'list-settings') return undefined
      return pages[service.seen.filter(item => item.operation === 'list-settings').length - 1]
    })
    await login(service)
    const result = await cli(['setting', 'list'])
    expect(result.code).toBe(0)
    const sent = service.seen.filter(seen => seen.operation === 'list-settings')
    expect(sent.map(seen => seen.body['after'])).toEqual([null, 'c1', 'c2'])
    expect(new Set(sent.map(seen => seen.messageId)).size).toBe(3)
    const printed = JSON.parse(result.stdout)
    expect(printed.body.items.map((item: { item: string }) => item.item)).toEqual([
      'one',
      'two',
      'three',
    ])
    expect(printed.body.completeness).toBe('partial')
    expect(printed.request).toEqual({ messageId: sent[0]?.messageId, tenant: tenantText })
  })

  it('stops at a page that is not a success and reports its outcome', async () => {
    const service = await serve(seen => {
      if (seen.operation !== 'list-settings') return undefined
      const count = service.seen.filter(item => item.operation === 'list-settings').length
      return count === 1 ? page([secretView], 'c1') : { outcome: 'conflict', body: {} }
    })
    await login(service)
    const result = await cli(['setting', 'list'])
    expect(result.code).toBe(3)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'conflict', body: {} })
    expect(countOf(service, 'list-settings')).toBe(2)
  })

  it('exits 1 when a page does not advance the cursor', async () => {
    const service = await serve(answerFor('list-settings', page([secretView], 'same')))
    await login(service)
    const result = await cli(['setting', 'list'])
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('omne setting list: a page did not advance the cursor\n')
    expect(countOf(service, 'list-settings')).toBe(2)
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
    expect(seenOf(service, 'describe-setting')?.body).toMatchObject({
      asset: { name: 'Web' },
      item: ITEM,
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
    expect(seenOf(service, 'set-setting')?.body).toMatchObject({
      value: { kind: 'secret', secret: SENTINEL },
    })
    const files = readdirSync(home).map(name => readFileSync(join(home, name), 'utf8'))
    expect([result.stdout, result.stderr, ...files].join('\n')).not.toContain(SENTINEL)
  })
})
