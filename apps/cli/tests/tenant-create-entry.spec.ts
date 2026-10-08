// @module-tag slow
// Real Cordis assembly, private SQLite and HTTPS transport. The peer controls responses.
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer, type Server } from 'node:https'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { createClientAssembly } from '../src/assembly.ts'
import type { ClientAssemblyOptions, PreparedClientAssembly } from '../src/client-assembly.ts'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { prepareTenantDirectory, tenantPaths } from '../src/state-layout.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import { openCliCatalog } from '../src/catalog-open.ts'
import { runTenantCreateEntry } from '../src/tenant-create-entry.ts'
import { parseEntryCommand } from '../src/entry-command.ts'
import type { EntryReport } from '../src/entry-application.ts'
import { tenantReference } from '../src/tenant-reference.ts'
import { createGovernanceChoices } from '../src/governance-choices.ts'
import { executeEntry } from '../src/entry-execution.ts'
import { FakeTerminal, tick } from './support/tui.ts'

const centerId = 'a'.repeat(32),
  account = 'owner',
  handle = 'original-handle'
const personal = { organization: 'personal', account },
  created = { organization: 'team-created', account }
const secret = 'never-print-original-presentation'
const binding = checkedTenantBinding({ formatVersion: 1, centerId, tenant: personal })
const createOperation = 'capability.organization-governance/v2#S-21'
const sends: { operation: string; payload?: Record<string, unknown> }[] = []
const cleanup: (() => Promise<void>)[] = []
let parent: string, server: Server, endpoint: string, certificate: string
let unknown = false,
  rejected = false,
  hold = false
let wrongCandidate = false
let creationSeen = Promise.withResolvers<void>()
beforeAll(async () => {
  parent = await mkdtemp(join(tmpdir(), 'omne-tenant-entry-tls-'))
  const key = join(parent, 'key.pem'),
    cert = join(parent, 'cert.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  )
  certificate = await readFile(cert, 'utf8')
  server = createServer(
    { key: await readFile(key, 'utf8'), cert: certificate, minVersion: 'TLSv1.3' },
    (request, response) => {
      let text = ''
      request.setEncoding('utf8')
      request.on('data', chunk => {
        text += String(chunk)
      })
      request.on('end', () => {
        const body = JSON.parse(text) as { operation: string; payload?: Record<string, unknown> }
        sends.push({
          operation: body.operation,
          ...(body.payload === undefined ? {} : { payload: body.payload }),
        })
        if (body.operation === createOperation) {
          creationSeen.resolve()
          if (hold) return
        }
        if (unknown && body.operation === createOperation) {
          request.socket.destroy()
          return
        }
        let answer: unknown
        switch (body.operation) {
          case 'composition.governance-center-entry/v1#S-18':
            answer = { reachable: true, centerId, version: '3' }
            break
          case 'capability.account-identity/v3#S-15':
            answer = {
              result: {
                loginState: 'new-private-presentation',
                loginStateHandle: 'new-login-handle',
              },
            }
            break
          case 'composition.account-registration/v2#S-8':
            answer = { result: 'registered' }
            break
          case 'capability.account-identity/v3#S-37':
            answer = {
              result: [
                {
                  loginStateHandle: handle,
                  issuedAt: '2026-10-08T12:00:00.000Z',
                  lastActivityAt: '2026-10-08T12:00:00.000Z',
                  absoluteExpiresAt: '2026-10-08T20:00:00.000Z',
                  idleExpiresAt: '2026-10-08T13:00:00.000Z',
                },
              ],
            }
            break
          case 'capability.account-identity/v3#S-16':
          case 'capability.account-identity/v3#S-50':
          case 'capability.organization-governance/v2#S-37':
            answer = { result: 'ok' }
            break
          case 'capability.organization-governance/v2#S-25':
            answer = { result: created }
            break
          case 'capability.organization-governance/v2#S-27':
            answer = {
              result: [personal, wrongCandidate ? { ...created, account: 'other' } : created],
            }
            break
          case 'capability.organization-governance/v2#S-57':
            answer = {
              result: [
                {
                  invitation: 'invitation',
                  issuerOrganization: created.organization,
                  invitedAccount: account,
                  role: 'member',
                  offerTiming: {
                    issuedAt: '2026-10-08T12:00:00Z',
                    expiresAt: '2026-10-08T20:00:00Z',
                  },
                  offerState: 'pending',
                },
              ],
            }
            break
          case 'capability.organization-governance/v2#S-36':
            answer = rejected ? 'login-state-rejected' : { result: personal }
            break
          case createOperation:
            answer = { result: created.organization }
            break
          case 'capability.organization-governance/v2#S-22':
            answer = {
              result: {
                organization: body.payload?.organization,
                organizationKind:
                  body.payload?.organization === personal.organization ? 'personal' : 'team',
                name: body.payload?.organization === personal.organization ? '个人组织' : '研发组',
              },
            }
            break
          case 'capability.organization-governance/v2#S-26':
            answer = { result: { standing: 'effective', role: 'superAdministrator' } }
            break
          default:
            answer = 'invalid-input'
        }
        const encoded = JSON.stringify(answer)
        response.writeHead(200, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(encoded),
          connection: 'close',
        })
        response.end(encoded)
      })
    },
  )
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing address')
  endpoint = `https://127.0.0.1:${address.port}/`
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0).reverse()) await close()
  sends.length = 0
  unknown = false
  rejected = false
  hold = false
  wrongCandidate = false
  creationSeen = Promise.withResolvers<void>()
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
  await rm(parent, { recursive: true, force: true })
})
async function fixture(selected = true, sourceAccount = account) {
  const root = await mkdtemp(join(parent, 'case-')),
    home = join(root, '.omne')
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const owned = await openCliCatalog(home, {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 65536,
  })
  cleanup.push(() => owned.close())
  const paths = await prepareTenantDirectory(home, binding)
  const source = await openClientLocalState(
    { directory: paths.auth },
    {
      storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
    },
  )
  try {
    const initial = await source.read()
    if (initial.kind !== 'read') throw new Error('source unavailable')
    expect(
      (
        await source.compareAndReplace(
          initial.snapshot.token,
          {
            center: {
              centerId,
              endpoint,
              trust: { mode: 'ca', certificateAuthorities: certificate },
            },
            login: { handle, accountId: sourceAccount, presentation: secret },
            cache: [],
          },
          'original-login',
        )
      ).kind,
    ).toBe('installed')
  } finally {
    await source.close()
  }
  if (selected)
    expect(
      await owned.catalog.selectTenant(
        await owned.catalog.readSelection(),
        binding,
        'select-personal',
      ),
    ).toBe('selected')
  const command = parseEntryCommand(['tenant', 'create', '--name', '研发组', '--json'], false)
  if (command.kind !== 'governance' || typeof command.values.name !== 'string')
    throw new Error('invalid parsed fixture')
  return {
    home,
    catalog: owned.catalog,
    paths,
    input: { home, name: command.values.name, creationKey: 'original-creation' },
  }
}
const signal = () => new AbortController().signal
async function processCommand(home: string, args: readonly string[]) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../dist/main.js', import.meta.url)), '--home', home, ...args, '--json'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stdout = '',
    stderr = ''
  child.stdout.setEncoding('utf8').on('data', chunk => {
    stdout += String(chunk)
  })
  child.stderr.setEncoding('utf8').on('data', chunk => {
    stderr += String(chunk)
  })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  return { code, stdout, stderr }
}
it('consumes parsed tenant create using production assembly, HTTPS and SQLite and preserves the selected tenant', async () => {
  const f = await fixture(),
    before = await f.catalog.readSelection()
  expect(await runTenantCreateEntry(f.input, f.catalog, signal())).toMatchObject({
    outcome: {
      kind: 'created',
      result: { tenant: created },
      auth: { login: { kind: 'installed' } },
    },
    diagnostics: [],
  })
  expect(await f.catalog.readSelection()).toEqual(before)
  expect(sends.filter(row => row.operation === createOperation)).toHaveLength(1)
  expect(await runTenantCreateEntry(f.input, f.catalog, signal())).toMatchObject({
    outcome: { kind: 'created', auth: { login: { kind: 'already-installed' } } },
    diagnostics: [],
  })
  expect(sends.filter(row => row.operation === createOperation)).toHaveLength(1)
  const target = tenantPaths(f.home, checkedTenantBinding({ ...binding, tenant: created }))
  const source = await openClientLocalState(
    { directory: target.auth },
    {
      storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
    },
  )
  try {
    const read = await source.read()
    expect(read).toMatchObject({
      kind: 'read',
      snapshot: { value: { login: { presentation: secret, handle } } },
    })
  } finally {
    await source.close()
  }
})
it('does not open a client or send when no tenant is selected', async () => {
  const f = await fixture(false)
  expect(await runTenantCreateEntry(f.input, f.catalog, signal())).toEqual({
    outcome: { kind: 'blocked', reason: 'not-selected' },
    diagnostics: [],
  })
  expect(sends).toEqual([])
})
it('does not recreate a selected namespace whose auth file is missing', async () => {
  const f = await fixture()
  await rm(f.paths.clientState)
  expect(await runTenantCreateEntry(f.input, f.catalog, signal())).toEqual({
    outcome: { kind: 'blocked', reason: 'unavailable' },
    diagnostics: [],
  })
  await expect(readFile(f.paths.clientState)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(sends).toEqual([])
})
it('refuses a login for a different account at the selected physical address', async () => {
  const f = await fixture(true, 'another-account')
  expect(await runTenantCreateEntry(f.input, f.catalog, signal())).toMatchObject({
    outcome: { kind: 'blocked', reason: 'identity-mismatch' },
    diagnostics: [],
  })
  expect(sends.filter(row => row.operation === createOperation)).toHaveLength(0)
})
it('retains a remotely unknown original request without sending a second creation', async () => {
  const f = await fixture()
  unknown = true
  const first = await runTenantCreateEntry(f.input, f.catalog, signal())
  expect(first).toMatchObject({
    outcome: { kind: 'unresolved', result: { report: { remote: { status: 'unknown' } } } },
    diagnostics: [],
  })
  expect(JSON.stringify(first)).not.toContain(secret)
  const second = await runTenantCreateEntry(f.input, f.catalog, signal())
  expect(second).toMatchObject({ outcome: { kind: 'unresolved' }, diagnostics: [] })
  expect(sends.filter(row => row.operation === createOperation)).toHaveLength(1)
})
it('preserves a real login rejection and does not create an organization', async () => {
  const f = await fixture()
  rejected = true
  expect(await runTenantCreateEntry(f.input, f.catalog, signal())).toMatchObject({
    outcome: { kind: 'blocked', reason: 'login-rejected' },
    diagnostics: [],
  })
  expect(sends.filter(row => row.operation === createOperation)).toHaveLength(0)
})
it('does no client work for an already cancelled invocation', async () => {
  const f = await fixture(),
    controller = new AbortController()
  controller.abort()
  expect(await runTenantCreateEntry(f.input, f.catalog, controller.signal)).toEqual({
    outcome: { kind: 'blocked', reason: 'input-cancelled' },
    diagnostics: [],
  })
  expect(sends).toEqual([])
})

it('keeps the sent creation unknown when cancelled in flight and does not resend it', async () => {
  const f = await fixture(),
    controller = new AbortController()
  hold = true
  const work = runTenantCreateEntry(f.input, f.catalog, controller.signal)
  await creationSeen.promise
  controller.abort()
  expect(await work).toMatchObject({
    outcome: {
      kind: 'unresolved',
      result: { report: { remote: { status: 'unknown', sendAttempted: true } } },
    },
    diagnostics: [],
  })
  hold = false
  expect(await runTenantCreateEntry(f.input, f.catalog, signal())).toMatchObject({
    outcome: { kind: 'unresolved' },
  })
  expect(sends.filter(row => row.operation === createOperation)).toHaveLength(1)
})

it('does not replace a corrupted selected SQLite file with a fresh login store', async () => {
  const f = await fixture(),
    corrupt = 'not a SQLite database'
  await writeFile(f.paths.clientState, corrupt)
  expect(await runTenantCreateEntry(f.input, f.catalog, signal())).toMatchObject({
    outcome: { kind: 'blocked', reason: 'invalid-record' },
  })
  expect(await readFile(f.paths.clientState, 'utf8')).toBe(corrupt)
  expect(sends).toEqual([])
})

function closeFailureFactory() {
  const error = new Error('original-close-failure')
  let actual: PreparedClientAssembly | undefined
  const factory = (options: ClientAssemblyOptions): PreparedClientAssembly => {
    actual = createClientAssembly(options)
    return {
      ...actual,
      clientStopped: actual.clientStopped.then(() => {
        throw error
      }),
    }
  }
  cleanup.push(async () => {
    if (actual === undefined) return
    // Test teardown uses the actual success proof, never the injected failed observation.
    actual.requestStop()
    await actual.clientStopped
    actual.releasePresentation()
    await actual.closed
  })
  return {
    error,
    factory,
    pending: async () => {
      let closed = false
      void actual?.closed.then(() => {
        closed = true
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      return !closed
    },
  }
}
it('preserves a created remote tenant when close proof fails and does not release its CLS gate', async () => {
  const f = await fixture(),
    fault = closeFailureFactory()
  expect(await runTenantCreateEntry(f.input, f.catalog, signal(), fault.factory)).toMatchObject({
    outcome: { kind: 'created', result: { tenant: created } },
    diagnostics: ['client-close-failed'],
  })
  expect(await fault.pending()).toBe(true)
  expect(sends.filter(row => row.operation === createOperation)).toHaveLength(1)
})
it('retains both an original work defect and a failed close observation', async () => {
  const f = await fixture(),
    fault = closeFailureFactory(),
    work = new Error('original-work-defect')
  vi.spyOn(f.catalog, 'executeCreation').mockRejectedValue(work)
  const result = await runTenantCreateEntry(f.input, f.catalog, signal(), fault.factory).catch(
    error => error,
  )
  expect(result).toBeInstanceOf(AggregateError)
  expect(result.errors).toEqual([work, fault.error])
  expect(await fault.pending()).toBe(true)
  expect(sends.filter(row => row.operation === createOperation)).toHaveLength(0)
})

it('executes the installed process entry with the formal command and persists its original request', async () => {
  const f = await fixture()
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../dist/main.js', import.meta.url)),
      '--home',
      f.home,
      'tenant',
      'create',
      '--name',
      '研发组',
      '--json',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stdout = '',
    stderr = ''
  child.stdout.setEncoding('utf8').on('data', chunk => {
    stdout += String(chunk)
  })
  child.stderr.setEncoding('utf8').on('data', chunk => {
    stderr += String(chunk)
  })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  expect(code, stderr).toBe(0)
  expect(stderr).toBe('')
  expect(stdout).not.toContain(secret)
  const report = JSON.parse(stdout) as EntryReport
  expect(report).toMatchObject({
    format: 'omne-cli/1',
    action: 'tenant.create',
    outcome: { kind: 'created', result: { tenant: created } },
    diagnostics: [],
  })
  if (report.outcome.kind !== 'created') throw new Error('not created')
  expect(await f.catalog.readCreation(report.outcome.request)).toMatchObject({
    status: 'settled',
    result: { kind: 'created' },
  })
  expect(sends.filter(row => row.operation === createOperation)).toHaveLength(1)
  expect(await f.catalog.readSelection()).toMatchObject({ selected: binding })
})

it.each(['login', 'register'] as const)(
  'executes formal %s through production HTTPS and keeps secrets out of the result',
  async action => {
    const f = await fixture(false)
    await f.catalog.registerCenter({
      name: 'work',
      center: { centerId, endpoint, trust: { mode: 'ca', certificateAuthorities: certificate } },
    })
    const credentialFile = join(f.home, 'credential')
    const credential = ' protected full credential\n'
    await writeFile(credentialFile, credential, { mode: 0o600 })
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../dist/main.js', import.meta.url)),
        '--home',
        f.home,
        action,
        '--center',
        'work',
        '--login-identifier',
        'owner',
        '--credential-file',
        credentialFile,
        '--json',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = '',
      stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.setEncoding('utf8').on('data', chunk => {
      stderr += String(chunk)
    })
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    expect(code, stderr).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).not.toContain(credential)
    expect(stdout).not.toContain('new-private-presentation')
    expect(JSON.parse(stdout)).toMatchObject({
      format: 'omne-cli/1',
      action,
      outcome: { kind: action === 'login' ? 'logged-in' : 'governance-result' },
      diagnostics: [],
    })
    const operation =
      action === 'login'
        ? 'capability.account-identity/v3#S-15'
        : 'composition.account-registration/v2#S-8'
    const operations = sends.filter(row => row.operation === operation)
    expect(operations).toHaveLength(1)
    expect(operations[0]?.payload).toMatchObject({ credential })
    expect((await f.catalog.readSelection()).selected).toEqual(action === 'login' ? binding : null)
  },
)

it.each(['add', 'switch'] as const)(
  'executes tenant %s with actual auth and persists only its declared local effects',
  async action => {
    const f = await fixture(),
      target = checkedTenantBinding({ ...binding, tenant: created })
    const args =
      action === 'add'
        ? ['tenant', 'add', '--invitation', 'actual-invitation']
        : ['tenant', 'switch', tenantReference(target)]
    const result = await processCommand(f.home, args)
    expect(result.code, result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(secret)
    expect(JSON.parse(result.stdout)).toMatchObject({
      action: `tenant.${action}`,
      outcome: {
        kind: 'tenant-prepared',
        binding: target,
        selection: action === 'add' ? 'unchanged' : 'selected',
      },
      diagnostics: [],
    })
    expect((await f.catalog.readSelection()).selected).toEqual(action === 'add' ? binding : target)
    expect(
      sends.filter(
        row =>
          row.operation === `capability.organization-governance/v2#S-${action === 'add' ? 25 : 37}`,
      ),
    ).toHaveLength(1)
  },
)

it.each(['logout', 'list', 'revoke', 'credential'] as const)(
  'executes account %s through a fixed selected use with safe output',
  async action => {
    const f = await fixture()
    const oldFile = join(f.home, 'old-credential'),
      newFile = join(f.home, 'new-credential')
    await writeFile(oldFile, 'old-secret\n', { mode: 0o600 })
    await writeFile(newFile, 'new-secret\n', { mode: 0o600 })
    const args =
      action === 'logout'
        ? ['logout']
        : action === 'list'
          ? ['logins', 'list']
          : action === 'revoke'
            ? ['logins', 'revoke', '--handle', 'different-login']
            : [
                'credential',
                'change',
                '--current-credential-file',
                oldFile,
                '--new-credential-file',
                newFile,
              ]
    const result = await processCommand(f.home, args)
    expect(result.code, result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    for (const value of [secret, 'old-secret', 'new-secret'])
      expect(result.stdout).not.toContain(value)
    expect(JSON.parse(result.stdout)).toMatchObject({
      outcome: { kind: 'governance-result', report: { remote: { status: 'success' } } },
      diagnostics: [],
    })
    if (action === 'credential') {
      expect(
        sends.find(row => row.operation === 'capability.account-identity/v3#S-50')?.payload,
      ).toMatchObject({ currentCredential: 'old-secret\n', newCredential: 'new-secret\n' })
    }
    if (action === 'logout' || action === 'credential') {
      const state = await openClientLocalState(
        { directory: f.paths.auth },
        {
          storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
        },
      )
      try {
        const read = await state.read()
        expect(read).toMatchObject({ snapshot: { value: { cache: [] } } })
        if (read.kind === 'read') expect(read.snapshot.value?.login).toBeUndefined()
      } finally {
        await state.close()
      }
    }
  },
)

it('loads actual tenant candidates with names, roles and complete fixed identities', async () => {
  const f = await fixture()
  const choices = createGovernanceChoices(f.home, f.catalog, signal(), { maxChoices: 8 })
  const candidates = await choices.tenants()
  expect(candidates).toHaveLength(2)
  expect(candidates[1]).toMatchObject({
    binding: { ...binding, tenant: created },
    reference: tenantReference(checkedTenantBinding({ ...binding, tenant: created })),
    label: expect.stringContaining('研发组'),
  })
  expect(candidates[1]?.label).toContain('superAdministrator')
  expect(candidates[0]?.label).toContain('Current local selection')
  expect(JSON.stringify(candidates)).not.toContain(secret)
  expect((await f.catalog.readSelection()).selected).toEqual(binding)
  expect(sends.some(row => row.operation === 'capability.organization-governance/v2#S-37')).toBe(
    false,
  )
})
it('loads actual received invitation candidates and their issuer and expiry', async () => {
  const f = await fixture()
  const candidates = await createGovernanceChoices(f.home, f.catalog, signal(), {
    maxChoices: 8,
  }).invitations()
  expect(candidates).toEqual([
    { id: 'invitation', label: expect.stringContaining('2026-10-08T20:00:00Z') },
  ])
  expect(candidates[0]?.label).toContain(created.organization)
  expect(sends.some(row => row.operation === 'capability.organization-governance/v2#S-25')).toBe(
    false,
  )
})
it('does not expose cross-account tenant candidates or silently truncate a capacity overflow', async () => {
  const f = await fixture()
  wrongCandidate = true
  await expect(
    createGovernanceChoices(f.home, f.catalog, signal(), { maxChoices: 8 }).tenants(),
  ).rejects.toThrow('input-unavailable')
  wrongCandidate = false
  await expect(
    createGovernanceChoices(f.home, f.catalog, signal(), { maxChoices: 1 }).tenants(),
  ).rejects.toThrow('input-too-large')
})
it('does not treat rejected or cancelled candidate readings as a successful empty list', async () => {
  const f = await fixture()
  rejected = true
  await expect(
    createGovernanceChoices(f.home, f.catalog, signal(), { maxChoices: 8 }).tenants(),
  ).rejects.toThrow('input-unavailable')
  const controller = new AbortController()
  controller.abort()
  await expect(
    createGovernanceChoices(f.home, f.catalog, controller.signal, { maxChoices: 8 }).invitations(),
  ).rejects.toThrow('input-unavailable')
})

function interactiveOptions(home: string, terminal: FakeTerminal) {
  return {
    home: { osHome: parent, explicitHome: home },
    signal: signal(),
    catalogPolicy: { maxCenters: 8, maxCreations: 32, maxRecordBytes: 1024 * 1024 },
    originalId: () => 'interactive-operation',
    confirmCenter: async () => false,
    interactive: { terminal: async () => terminal, choicePolicy: { maxChoices: 8 } },
  }
}
it('formal interactive entry fills missing organization input and confirms before the single actual create', async () => {
  const f = await fixture(),
    terminal = new FakeTerminal()
  let entered = false,
    confirmed = false
  terminal.onFrame = bytes => {
    if (bytes.includes('Organization name') && !entered) {
      entered = true
      terminal.paste('研发组')
      void tick().then(() => terminal.key('\r'))
    } else if (bytes.includes('Confirm action') && !confirmed) {
      confirmed = true
      expect(sends.some(s => s.operation === createOperation)).toBe(false)
      terminal.key('\r')
    }
  }
  const command = parseEntryCommand(['tenant', 'create'], true)
  if (command.kind !== 'governance') throw new Error('invalid fixture')
  expect(await executeEntry(command, interactiveOptions(f.home, terminal))).toMatchObject({
    outcome: { kind: 'created', result: { tenant: created } },
    diagnostics: [],
  })
  expect(entered && confirmed).toBe(true)
  expect(sends.filter(s => s.operation === createOperation)).toHaveLength(1)
  expect(terminal.restored).toBe(true)
})
it('formal interactive entry cancels missing input without sending a governance action', async () => {
  const f = await fixture(),
    terminal = new FakeTerminal()
  terminal.onFrame = () => terminal.key('\x03')
  const command = parseEntryCommand(['tenant', 'create'], true)
  if (command.kind !== 'governance') throw new Error('invalid fixture')
  expect(await executeEntry(command, interactiveOptions(f.home, terminal))).toMatchObject({
    outcome: { kind: 'blocked', reason: 'input-cancelled' },
    diagnostics: [],
  })
  expect(sends).toEqual([])
  expect(terminal.restored).toBe(true)
})
it('formal interactive center confirmation shows actual health identity and trust fingerprint before saving', async () => {
  const f = await fixture(),
    terminal = new FakeTerminal()
  let confirmed = false
  terminal.onFrame = bytes => {
    if (!bytes.includes('Confirm center') || confirmed) return
    confirmed = true
    expect(bytes).toContain(centerId)
    expect(bytes).toContain('CA SHA-256:')
    expect(bytes).not.toContain('BEGIN CERTIFICATE')
    terminal.key('\r')
  }
  const certPath = join(parent, 'cert.pem')
  const command = parseEntryCommand(
    ['center', 'add', endpoint, '--name', 'new-center', '--ca-file', certPath],
    true,
  )
  if (command.kind !== 'governance') throw new Error('invalid fixture')
  expect(await executeEntry(command, interactiveOptions(f.home, terminal))).toMatchObject({
    outcome: { kind: 'saved', profile: { center: { centerId } } },
    diagnostics: [],
  })
  expect(confirmed).toBe(true)
  expect((await f.catalog.listCenters()).some(c => c.name === 'new-center')).toBe(true)
  expect(terminal.restored).toBe(true)
})
it('formal JSON entry does not acquire a terminal even in a terminal-capable application', async () => {
  const f = await fixture(),
    terminal = new FakeTerminal()
  const options = interactiveOptions(f.home, terminal),
    open = vi.fn(options.interactive.terminal)
  const command = parseEntryCommand(['tenant', 'create', '--name', '研发组', '--json'], true)
  if (command.kind !== 'governance') throw new Error('invalid fixture')
  expect(
    await executeEntry(command, {
      ...options,
      interactive: { ...options.interactive, terminal: open },
    }),
  ).toMatchObject({ outcome: { kind: 'created' } })
  expect(open).not.toHaveBeenCalled()
  expect(terminal.frames).toEqual([])
})
it('formal interactive entry keeps the original CLS alive through terminal restoration and releases it afterward', async () => {
  const f = await fixture(),
    terminal = new FakeTerminal()
  let source: Awaited<ReturnType<PreparedClientAssembly['borrowState']>> | undefined
  const factory = (options: ClientAssemblyOptions) => {
    const assembly = createClientAssembly(options)
    void assembly.borrowState().then(value => {
      source = value
    })
    return assembly
  }
  terminal.onFrame = bytes => {
    if (bytes.includes('Confirm action')) terminal.key('\r')
  }
  const restored = vi.spyOn(terminal, 'restore').mockImplementation(async () => {
    expect(source).toBeDefined()
    expect(await source!.read()).toMatchObject({ kind: 'read' })
    terminal.restored = true
  })
  const command = parseEntryCommand(['tenant', 'create', '--name', '研发组'], true)
  if (command.kind !== 'governance') throw new Error('invalid fixture')
  expect(
    await executeEntry(command, {
      ...interactiveOptions(f.home, terminal),
      preparedFactory: factory,
    }),
  ).toMatchObject({
    outcome: { kind: 'created' },
    diagnostics: [],
  })
  expect(restored).toHaveBeenCalledOnce()
  expect(terminal.restored).toBe(true)
  await expect(source!.read()).rejects.toThrow('closed')
})
it.each(['add', 'switch'])(
  'formal interactive tenant %s uses actual candidates and revalidates at execution',
  async action => {
    const f = await fixture(),
      terminal = new FakeTerminal()
    let picked = false,
      confirmed = false
    terminal.onFrame = bytes => {
      if (bytes.includes(action === 'add' ? 'Select invitation' : 'Select tenant') && !picked) {
        picked = true
        expect(sends.some(s => s.operation.endsWith(action === 'add' ? '#S-25' : '#S-37'))).toBe(
          false,
        )
        terminal.paste(action === 'add' ? '1' : '2')
        void tick().then(() => terminal.key('\r'))
      } else if (bytes.includes('Confirm action') && !confirmed) {
        confirmed = true
        terminal.key('\r')
      }
    }
    const command = parseEntryCommand(['tenant', action], true)
    if (command.kind !== 'governance') throw new Error('invalid fixture')
    expect(await executeEntry(command, interactiveOptions(f.home, terminal))).toMatchObject({
      outcome: { kind: 'tenant-prepared', binding: { tenant: created } },
      diagnostics: [],
    })
    expect(picked && confirmed).toBe(true)
    expect(
      sends.filter(s => s.operation.endsWith(action === 'add' ? '#S-25' : '#S-37')),
    ).toHaveLength(1)
    expect(terminal.restored).toBe(true)
  },
)
it('formal interactive entry keeps terminal and CLS gates when original client close proof fails', async () => {
  const f = await fixture(),
    terminal = new FakeTerminal(),
    fault = closeFailureFactory()
  terminal.onFrame = bytes => {
    if (bytes.includes('Confirm action')) terminal.key('\r')
  }
  const command = parseEntryCommand(['tenant', 'create', '--name', '研发组'], true)
  if (command.kind !== 'governance') throw new Error('invalid fixture')
  const result = await executeEntry(command, {
    ...interactiveOptions(f.home, terminal),
    preparedFactory: fault.factory,
  })
  expect(result).toMatchObject({ outcome: { kind: 'created' } })
  expect(result.diagnostics).toContain('client-close-failed')
  expect(terminal.restored).toBe(false)
  expect(await fault.pending()).toBe(true)
})
it('formal interactive entry preserves original creation and releases CLS after a failed restoration attempt', async () => {
  const f = await fixture(),
    terminal = new FakeTerminal()
  let source: Awaited<ReturnType<PreparedClientAssembly['borrowState']>> | undefined
  const factory = (options: ClientAssemblyOptions) => {
    const assembly = createClientAssembly(options)
    void assembly.borrowState().then(value => {
      source = value
    })
    return assembly
  }
  terminal.onFrame = bytes => {
    if (bytes.includes('Confirm action')) terminal.key('\r')
  }
  vi.spyOn(terminal, 'restore').mockImplementation(async () => {
    expect(await source!.read()).toMatchObject({ kind: 'read' })
    throw new Error('original restoration failure')
  })
  const command = parseEntryCommand(['tenant', 'create', '--name', '研发组'], true)
  if (command.kind !== 'governance') throw new Error('invalid fixture')
  expect(
    await executeEntry(command, {
      ...interactiveOptions(f.home, terminal),
      preparedFactory: factory,
    }),
  ).toMatchObject({
    outcome: { kind: 'created' },
    diagnostics: ['input-restore-failed'],
  })
  await expect(source!.read()).rejects.toThrow('closed')
  expect(sends.filter(s => s.operation === createOperation)).toHaveLength(1)
})
it.each(['login', 'register'] as const)(
  'formal interactive %s uses a saved center and only a credential file path',
  async action => {
    const f = await fixture(false),
      terminal = new FakeTerminal()
    await f.catalog.registerCenter({
      name: 'work',
      center: { centerId, endpoint, trust: { mode: 'ca', certificateAuthorities: certificate } },
    })
    const credentialFile = join(f.home, 'interactive-credential'),
      credential = ' whole credential\n'
    await writeFile(credentialFile, credential, { mode: 0o600 })
    const steps = [
      ['Select center', '1'],
      ['Login identifier', 'owner'],
      ['Credential file path', credentialFile],
      ['Confirm action', null],
    ] as const
    let stage = 0
    terminal.onFrame = bytes => {
      const step = steps[stage]
      if (!step || !bytes.includes(step[0])) return
      ++stage
      if (step[1] === null) {
        terminal.key('\r')
        return
      }
      terminal.paste(step[1])
      void tick().then(() => terminal.key('\r'))
    }
    const command = parseEntryCommand([action], true)
    if (command.kind !== 'governance') throw new Error('invalid fixture')
    const result = await executeEntry(command, interactiveOptions(f.home, terminal))
    expect(result).toMatchObject(
      action === 'login'
        ? { outcome: { kind: 'logged-in', selection: 'selected' }, diagnostics: [] }
        : {
            outcome: { kind: 'governance-result', report: { remote: { status: 'success' } } },
            diagnostics: [],
          },
    )
    expect(stage).toBe(steps.length)
    expect(terminal.frames.join('')).not.toContain(credential)
    expect(JSON.stringify(result)).not.toContain('new-private-presentation')
    expect(terminal.restored).toBe(true)
    expect(sends.filter(s => s.operation.endsWith('#S-15'))).toHaveLength(
      action === 'login' ? 1 : 0,
    )
    expect(await f.catalog.readSelection()).toMatchObject({
      selected: action === 'login' ? binding : null,
    })
  },
)
