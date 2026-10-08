// @module-tag slow
// Real Cordis assembly, private SQLite and HTTPS transport. The peer controls responses.
import { execFileSync } from 'node:child_process'
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
          case 'capability.organization-governance/v2#S-36':
            answer = rejected ? 'login-state-rejected' : { result: personal }
            break
          case createOperation:
            answer = { result: created.organization }
            break
          case 'capability.organization-governance/v2#S-22':
            answer = {
              result: {
                organization: created.organization,
                organizationKind: 'team',
                name: '研发组',
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
