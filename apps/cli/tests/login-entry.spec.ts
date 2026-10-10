import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { startAssemblyWork } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { GovernanceTransportService } from '@omne-harness-lite/governance-center-entry-https-json/cordis'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import { createClientAssembly } from '../src/assembly.ts'
import { openCliCatalog } from '../src/catalog-open.ts'
import { runLoginEntry, type LoginEntryInput } from '../src/login-entry.ts'
import { readSessionEntryPreparation } from '../src/session-entry-preparation.ts'
import { runDefaultSessionEntry, type DefaultSessionOptions } from '../src/session-default-entry.ts'
import { createSessionModelDirectory } from '../src/session-model-directory.ts'
import { prepareSessionModel } from '../src/session-model-setup.ts'
import { openRuntimeDatabase, sessionTenantMigrations } from '../src/session-runtime-files.ts'
import { modelProfileDirectoryMigrations } from '@omne-harness-lite/model-profile-directory-local/migrations'
import { replicaMigrations } from '@omne-harness-lite/credential-custodian-local/migrations'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import {
  parseTenantId,
  parseAccountId,
  parseLoginStateId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { usingSelectedTenant } from '../src/selected-tenant-work.ts'
import type { GovernanceChoices, GovernanceDialog } from '../src/governance-input.ts'
import { tenantPaths } from '../src/state-layout.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startLocalSessionHost } from '../src/session-host-server.ts'
import { checkSession } from '@omne-harness-lite/session-log'

const cleanup: (() => Promise<void>)[] = []
const centerId = 'a'.repeat(32),
  account = 'owner',
  handle = 'issued-handle'
const tenant = { organization: 'personal', account }
const secret = ' private credential\n',
  presentation = 'do-not-print-issued-bearer'
const loginOperation = 'capability.account-identity/v3#S-15'
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0).reverse()) await close()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-login-entry-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const home = join(root, '.omne'),
    credentialFile = join(root, 'credential')
  await writeFile(credentialFile, secret, { mode: 0o600 })
  const owned = await openCliCatalog(home, {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 65536,
  })
  cleanup.push(() => owned.close())
  await owned.catalog.registerCenter({
    name: 'work',
    center: { centerId, endpoint: 'https://center.invalid/', trust: { mode: 'ca' } },
  })
  let changedCenter = false,
    unknown = false,
    rejected = false
  const exchange = vi.fn(async (_options: unknown, body: unknown): Promise<GovernanceOutcome> => {
    const request = body as { operation: string; payload: Record<string, unknown> }
    if (request.operation === loginOperation && unknown)
      return { kind: 'unavailable', reason: 'connection', sendAttempted: true }
    if (request.operation === loginOperation && rejected)
      return { kind: 'reply', reply: { failure: 'credentialMismatch' }, sendAttempted: true }
    const result =
      request.operation === loginOperation
        ? { loginState: presentation, loginStateHandle: handle }
        : request.operation === 'composition.account-registration/v2#S-8'
          ? 'registered'
          : request.operation.endsWith('#S-36')
            ? tenant
            : { standing: 'effective', role: 'member' }
    return { kind: 'reply', reply: { result }, sendAttempted: true }
  })
  class Transport extends GovernanceTransportService {
    readPublicHealth: GovernanceTransportService['readPublicHealth'] = async () => ({
      kind: 'health',
      reply: { reachable: true, centerId: changedCenter ? 'b'.repeat(32) : centerId, version: '3' },
    })
    exchangeGovernance = exchange
  }
  const factory = (options: Parameters<typeof createClientAssembly>[0]) =>
    createClientAssembly(options, {
      transport: {
        name: 'login-test-transport',
        assemblyLifecycle: 1,
        inject: ['assemblyLifetime'],
        apply(ctx: Context) {
          startAssemblyWork(
            ctx,
            async () => {
              new Transport(ctx)
            },
            async () => {},
          )
        },
      },
    })
  const input: LoginEntryInput = {
    home,
    action: 'login',
    centerName: null,
    loginIdentifier: 'me',
    credentialFile,
    operationId: 'original-login-entry',
  }
  return {
    input,
    owned,
    factory,
    exchange,
    changedCenter: () => {
      changedCenter = true
    },
    unknown: () => {
      unknown = true
    },
    rejected: () => {
      rejected = true
    },
  }
}
it.each(['existing', 'new', 'unknown', 'unconfigured', 'invalid-message'] as const)(
  'runs the compiled formal machine entry with %s Session creation state through actual selected catalog and tenant auth',
  async mode => {
    const f = await fixture()
    const logged = await runLoginEntry(
      f.input,
      f.owned.catalog,
      new AbortController().signal,
      f.factory,
    )
    expect(logged.outcome).toHaveProperty('kind', 'logged-in')
    const messageFile = join(f.input.home, 'process-message.json')
    await writeFile(
      messageFile,
      JSON.stringify({
        id: 'process-input',
        type: 'user',
        createdAt: '2026-10-08T00:00:00Z',
        blocks: [
          {
            id: 'process-input-text',
            kind: 'text',
            text: 'formal question',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
    )
    if (mode === 'invalid-message') await writeFile(messageFile, '{"type":"assistant"}')
    const source = {
      tenant,
      session: 'process-session',
      journalGeneration: 'controlled-process-journal',
      tail: 8,
    }
    const createdIdentity = checkSession(source.session)
    if (!('ok' in createdIdentity)) throw new Error('invalid process Session fixture')
    let receipt: import('@omne-harness-lite/session-runtime').Receipt | undefined
    const commands: string[] = []
    const host = await startLocalSessionHost({
      home: f.input.home,
      binding: checkedTenantBinding({ formatVersion: 1, centerId, tenant }),
      policy: {
        maxRequestBytes: 65536,
        maxResponseBytes: 65536,
        maxConnections: 8,
        maxInFlight: 4,
        requestTimeoutMs: 2000,
        headersTimeoutMs: 1000,
        idleTimeoutMs: 1000,
        checkIntervalMs: 100,
        maxFailureRecords: 8,
        maxHeaderBytes: 8192,
      },
      diagnostic: error => {
        throw error
      },
      endpoint: {
        execute: async request => {
          commands.push(request.command)
          if (request.command === 'readCreationDefaults')
            return mode === 'unconfigured'
              ? { kind: 'creationNotReady' }
              : {
                  kind: 'creationDefaults',
                  defaults: {
                    definition: { category: 'agent_definition', name: 'configured-process-root' },
                    executionType: 'interactive',
                    mode: 'never',
                    collaboration: 'co-work',
                  },
                }
          if (request.command === 'createSession') {
            const operation = {
              tenant: request.binding.tenant,
              principal: account,
              session: null,
              operation: 'createSession' as const,
              operationKey: request.input.operationKey,
            }
            expect(request.input).toMatchObject({
              definition: { name: 'configured-process-root' },
              executionType: 'interactive',
              mode: 'never',
              collaboration: 'co-work',
            })
            return mode === 'unknown'
              ? { kind: 'unknownCommit', operation }
              : {
                  kind: 'created',
                  session: createdIdentity.ok,
                  receipt: {
                    operation,
                    position: 1,
                    source: {
                      ...source,
                      tenant: request.binding.tenant,
                      session: createdIdentity.ok,
                      tail: 1,
                    },
                  },
                }
          }
          if (request.command === 'submitInput') {
            expect(request.binding.tenant).toEqual(tenant)
            expect(request.binding.centerId).toBe(centerId)
            expect(request.message.id).toBe('process-input')
            receipt = {
              operation: {
                tenant: request.binding.tenant,
                principal: account,
                session: request.session,
                operation: 'submitInput',
                operationKey: request.operationKey,
              },
              position: 2,
              source: {
                ...source,
                tenant: request.binding.tenant,
                session: request.session,
                tail: 2,
              },
            }
            return { kind: 'accepted', receipt }
          }
          if (!receipt) throw new Error('read before acceptance')
          if (request.command === 'readSubmission')
            return {
              kind: 'submission',
              receipt,
              source: { ...receipt.source, tail: 8 },
              inputPosition: 1,
              messageId: 'process-input',
              run: { id: 'process-run', state: 'completed' },
            }
          if (request.command === 'readMessages')
            return {
              kind: 'messages',
              source: { ...receipt.source, tail: 8 },
              messages: [
                {
                  position: 7,
                  run: 'process-run',
                  id: 'process-reply',
                  type: 'assistant',
                  createdAt: '2026-10-08T00:00:00Z',
                  blocks: [{ id: 'reply-text', kind: 'text', text: 'controlled reply' }],
                },
              ],
            }
          throw new Error('unexpected process request')
        },
      },
    })
    cleanup.push(() => host.close())
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../dist/main.js', import.meta.url)),
        '--home',
        f.input.home,
        ...(mode === 'existing' ? ['--session', 'process-session'] : []),
        '--message-file',
        messageFile,
        '--json',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], signal: AbortSignal.timeout(10000) },
    )
    let stdout = '',
      stderr = ''
    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    const exit = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    if (mode === 'invalid-message') {
      expect({ exit, stderr, stdout, commands }).toEqual({
        exit: 2,
        stderr: 'omne: invalid-json\n',
        stdout: '',
        commands: [],
      })
      return
    }
    expect({ exit, stderr }).toEqual({
      exit: mode === 'unknown' ? 4 : mode === 'unconfigured' ? 3 : 0,
      stderr: '',
    })
    const output = JSON.parse(stdout)
    if (mode === 'unknown' || mode === 'unconfigured') {
      expect(output).toMatchObject({
        format: 'omne-cli/1',
        action: 'message',
        outcome: {
          kind: 'session-creation',
          status: mode === 'unknown' ? 'unconfirmed' : 'blocked',
        },
        diagnostics: [],
      })
      expect(commands).toEqual(
        mode === 'unknown' ? ['readCreationDefaults', 'createSession'] : ['readCreationDefaults'],
      )
      if (mode === 'unknown') {
        expect(output.outcome.operation).toEqual({
          tenant,
          principal: account,
          session: null,
          operation: 'createSession',
          operationKey: output.outcome.request.input.operationKey,
        })
        expect(output.outcome.request.input.definition.name).toBe('configured-process-root')
      } else expect(output.outcome.request).toBeNull()
      expect(stdout).not.toContain(presentation)
      expect(stdout).not.toContain(secret.trim())
      return
    }
    expect(output).toMatchObject({
      format: 'omne-cli/1',
      action: 'message',
      outcome: {
        kind: 'session-message',
        status: 'completed',
        receipt,
        messages: [{ run: 'process-run', blocks: [{ text: 'controlled reply' }] }],
      },
      diagnostics: [],
    })
    expect(commands).toEqual([
      ...(mode === 'new' ? ['readCreationDefaults', 'createSession'] : []),
      'submitInput',
      'readSubmission',
      'readMessages',
    ])
    expect(stdout).not.toContain(presentation)
    expect(stdout).not.toContain(secret.trim())
  },
)
it('installs the original issued login in actual tenant state and selects it without a Session', async () => {
  const f = await fixture()
  const result = await runLoginEntry(
    f.input,
    f.owned.catalog,
    new AbortController().signal,
    f.factory,
  )
  expect(result).toMatchObject({
    outcome: {
      kind: 'logged-in',
      binding: { centerId, tenant },
      auth: { login: { kind: 'installed' } },
      selection: 'selected',
    },
    diagnostics: [],
  })
  expect(JSON.stringify(result)).not.toContain(presentation)
  expect(JSON.stringify(result)).not.toContain(secret)
  expect((await f.owned.catalog.readSelection()).selected).toEqual({
    formatVersion: 1,
    centerId,
    tenant,
  })
  const paths = tenantPaths(
    f.input.home,
    checkedTenantBinding({ formatVersion: 1, centerId, tenant }),
  )
  const state = await openClientLocalState(
    { directory: paths.auth },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  try {
    expect(await state.read()).toMatchObject({
      kind: 'read',
      snapshot: { value: { login: { accountId: account, handle, presentation } } },
    })
  } finally {
    await state.close()
  }
  const sends = f.exchange.mock.calls.filter(
    ([, body]) => (body as { operation: string }).operation === loginOperation,
  )
  expect(sends).toHaveLength(1)
  expect(sends[0]?.[1]).toMatchObject({ payload: { credential: secret } })
  await expect(readFile(join(paths.sessions, 'session.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
})
it('registers once and returns its real result without issuing a login or selecting a tenant', async () => {
  const f = await fixture()
  expect(
    await runLoginEntry(
      { ...f.input, action: 'register' },
      f.owned.catalog,
      new AbortController().signal,
      f.factory,
    ),
  ).toMatchObject({
    outcome: {
      kind: 'governance-result',
      report: {
        operation: 'composition.account-registration/v2#S-8',
        remote: { status: 'success', reply: { reply: { result: 'registered' } } },
      },
    },
  })
  expect(f.exchange.mock.calls).toHaveLength(1)
  expect((await f.owned.catalog.readSelection()).selected).toBeNull()
})
it('does not read credentials or send them when the saved center changes', async () => {
  const f = await fixture()
  f.changedCenter()
  await rm(f.input.credentialFile)
  expect(
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory),
  ).toMatchObject({ outcome: { kind: 'blocked', reason: 'center-mismatch' } })
  expect(f.exchange).not.toHaveBeenCalled()
})
it('does not guess a center when more than one is eligible', async () => {
  const f = await fixture()
  await f.owned.catalog.registerCenter({
    name: 'other',
    center: { centerId: 'b'.repeat(32), endpoint: 'https://other.invalid/', trust: { mode: 'ca' } },
  })
  expect(
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory),
  ).toMatchObject({ outcome: { kind: 'blocked', reason: 'center-required' } })
  expect(f.exchange).not.toHaveBeenCalled()
})
it('does not silently retry an unknown login or publish a local selection', async () => {
  const f = await fixture()
  f.unknown()
  expect(
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory),
  ).toMatchObject({
    outcome: { kind: 'governance-result', report: { remote: { status: 'unknown' } } },
  })
  expect(f.exchange.mock.calls).toHaveLength(1)
  expect((await f.owned.catalog.readSelection()).selected).toBeNull()
})
it('preserves the remote login when a competing local tenant selection wins', async () => {
  const f = await fixture()
  vi.spyOn(f.owned.catalog, 'selectTenant').mockResolvedValue('conflict')
  expect(
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory),
  ).toMatchObject({
    outcome: { kind: 'logged-in', selection: 'conflict', auth: { login: { kind: 'installed' } } },
  })
  expect(
    f.exchange.mock.calls.filter(
      ([, body]) => (body as { operation: string }).operation === loginOperation,
    ),
  ).toHaveLength(1)
})
it('stops before construction or credential access when already cancelled', async () => {
  const f = await fixture(),
    controller = new AbortController(),
    factory = vi.fn(f.factory)
  controller.abort()
  expect(await runLoginEntry(f.input, f.owned.catalog, controller.signal, factory)).toMatchObject({
    outcome: { kind: 'blocked', reason: 'input-cancelled' },
  })
  expect(factory).not.toHaveBeenCalled()
})

it('asks to add a center for an empty catalog without opening governance or creating a Session', async () => {
  const f = await fixture()
  const fresh = await openCliCatalog(join(f.input.home, 'fresh'), {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 65536,
  })
  cleanup.push(() => fresh.close())
  const factory = vi.fn(f.factory)
  expect(
    await readSessionEntryPreparation({
      home: f.input.home,
      catalog: fresh.catalog,
      signal: new AbortController().signal,
      preparedFactory: factory,
    }),
  ).toEqual({ outcome: { kind: 'center-required' }, diagnostics: [] })
  expect(factory).not.toHaveBeenCalled()
  expect(f.exchange).not.toHaveBeenCalled()
})

it('offers configured centers without signing in or choosing an account implicitly', async () => {
  const f = await fixture()
  expect(
    await readSessionEntryPreparation({
      home: f.input.home,
      catalog: f.owned.catalog,
      signal: new AbortController().signal,
      preparedFactory: f.factory,
    }),
  ).toEqual({
    outcome: {
      kind: 'login-required',
      reason: 'not-selected',
      centers: await f.owned.catalog.listCenters(),
    },
    diagnostics: [],
  })
  expect(f.exchange).not.toHaveBeenCalled()
})

it('reads the real selected login and membership before declaring default preparation ready', async () => {
  const f = await fixture()
  await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory)
  const before = await f.owned.catalog.readSelection()
  f.exchange.mockClear()
  const result = await readSessionEntryPreparation({
    home: f.input.home,
    catalog: f.owned.catalog,
    signal: new AbortController().signal,
    preparedFactory: f.factory,
  })
  expect(result).toEqual({
    outcome: {
      kind: 'ready',
      binding: before.selected,
      identity: { centerId, accountId: account, loginStateHandle: handle, tenant, role: 'member' },
    },
    diagnostics: [],
  })
  expect(
    f.exchange.mock.calls.map(([, body]) => (body as { operation: string }).operation),
  ).toEqual([
    'capability.organization-governance/v2#S-36',
    'capability.organization-governance/v2#S-26',
  ])
  expect(await f.owned.catalog.readSelection()).toEqual(before)
  expect(JSON.stringify(result)).not.toContain(presentation)
  await expect(
    readFile(join(tenantPaths(f.input.home, before.selected!).sessions, 'session.json')),
  ).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each(['unavailable', 'rejected', 'foreign-tenant', 'ineffective'] as const)(
  'keeps default preparation %s distinct without sending a credential or creating work',
  async mode => {
    const f = await fixture()
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory)
    const before = await f.owned.catalog.readSelection()
    f.exchange.mockClear()
    f.exchange.mockImplementation(async (_options, body): Promise<GovernanceOutcome> => {
      const request = body as { operation: string }
      if (mode === 'unavailable')
        return { kind: 'unavailable', reason: 'connection', sendAttempted: false }
      if (mode === 'rejected')
        return { kind: 'entry-answer', answer: 'login-state-rejected', sendAttempted: true }
      const result = request.operation.endsWith('#S-36')
        ? { ...tenant, ...(mode === 'foreign-tenant' ? { organization: 'other' } : {}) }
        : mode === 'ineffective'
          ? { standing: 'ineffective' }
          : { standing: 'effective', role: 'member' }
      return { kind: 'reply', reply: { result }, sendAttempted: true }
    })
    const result = await readSessionEntryPreparation({
      home: f.input.home,
      catalog: f.owned.catalog,
      signal: new AbortController().signal,
      preparedFactory: f.factory,
    })
    if (mode === 'rejected')
      expect(result.outcome).toMatchObject({ kind: 'login-required', reason: 'login-rejected' })
    else
      expect(result.outcome).toEqual({
        kind: 'blocked',
        reason:
          mode === 'unavailable'
            ? 'identity-unavailable'
            : mode === 'foreign-tenant'
              ? 'identity-mismatch'
              : 'membership-ineffective',
      })
    expect(result.diagnostics).toEqual([])
    expect(await f.owned.catalog.readSelection()).toEqual(before)
    expect(
      f.exchange.mock.calls.some(
        ([, body]) => (body as { operation: string }).operation === loginOperation,
      ),
    ).toBe(false)
  },
)

it('cancels default preparation before any read or governance work', async () => {
  const f = await fixture()
  const signal = AbortSignal.abort()
  expect(
    await readSessionEntryPreparation({
      home: f.input.home,
      catalog: f.owned.catalog,
      signal,
      preparedFactory: f.factory,
    }),
  ).toEqual({ outcome: { kind: 'blocked', reason: 'input-cancelled' }, diagnostics: [] })
  expect(f.exchange).not.toHaveBeenCalled()
})

it('continues into the same default entry after one explicit login without a second command', async () => {
  const f = await fixture()
  const dialog: GovernanceDialog = {
    identity: vi.fn(),
    text: vi.fn(async title => (title === 'Login identifier' ? 'me' : f.input.credentialFile)),
    choose: vi.fn(async () => 0),
    show: vi.fn(async () => true),
  }
  const choices: GovernanceChoices = {
    centers: () => f.owned.catalog.listCenters(),
    tenants: async () => [],
    invitations: async () => [],
  }
  const enter = vi.fn(async () => ({
    outcome: { kind: 'not-ready' as const, reason: 'capability-not-installed' as const },
    diagnostics: [],
  }))
  const execute = vi.fn<DefaultSessionOptions['execute']>(async command => {
    expect(command.action).toBe('login')
    if (
      typeof command.values['login-identifier'] !== 'string' ||
      typeof command.values['credential-file'] !== 'string' ||
      typeof command.values.center !== 'string'
    )
      throw new Error('missing completed login fields')
    return runLoginEntry(
      {
        ...f.input,
        loginIdentifier: command.values['login-identifier'],
        credentialFile: command.values['credential-file'],
        centerName: command.values.center,
      },
      f.owned.catalog,
      new AbortController().signal,
      f.factory,
    )
  })
  await runDefaultSessionEntry({
    home: f.input.home,
    catalog: f.owned.catalog,
    signal: new AbortController().signal,
    dialog,
    choices,
    preparedFactory: f.factory,
    execute,
    enter,
  })
  expect(execute).toHaveBeenCalledTimes(1)
  expect(enter).toHaveBeenCalledExactlyOnceWith({
    kind: 'ready',
    binding: { formatVersion: 1, centerId, tenant },
    identity: { centerId, accountId: account, loginStateHandle: handle, tenant, role: 'member' },
  })
  expect(
    f.exchange.mock.calls.filter(
      ([, body]) => (body as { operation: string }).operation === loginOperation,
    ),
  ).toHaveLength(1)
})

it('does not turn cancellation or an unknown login into an automatic second credential submission', async () => {
  const f = await fixture()
  const choose = vi.fn<GovernanceDialog['choose']>().mockResolvedValueOnce(undefined)
  const dialog: GovernanceDialog = {
    identity: vi.fn(),
    text: vi.fn(async () => f.input.credentialFile),
    choose,
    show: vi.fn(async () => true),
  }
  const choices: GovernanceChoices = {
    centers: () => f.owned.catalog.listCenters(),
    tenants: async () => [],
    invitations: async () => [],
  }
  const execute = vi.fn(async () => ({
    outcome: { kind: 'blocked' as const, reason: 'unknown' },
    diagnostics: [],
  }))
  const enter = vi.fn(async () => ({
    outcome: { kind: 'not-ready' as const, reason: 'capability-not-installed' as const },
    diagnostics: [],
  }))
  const options = {
    home: f.input.home,
    catalog: f.owned.catalog,
    signal: new AbortController().signal,
    dialog,
    choices,
    preparedFactory: f.factory,
    execute,
    enter,
  }
  expect(await runDefaultSessionEntry(options)).toEqual({
    outcome: { kind: 'blocked', reason: 'input-cancelled' },
    diagnostics: [],
  })
  expect(execute).not.toHaveBeenCalled()
  choose.mockResolvedValue(0)
  expect(await runDefaultSessionEntry(options)).toEqual({
    outcome: { kind: 'blocked', reason: 'unknown' },
    diagnostics: [],
  })
  expect(execute).toHaveBeenCalledTimes(1)
  expect(enter).not.toHaveBeenCalled()
})

it.each(['stored', 'rejected', 'unconfirmed', 'draining'] as const)(
  'publishes an explicitly supplied model credential with %s outcome through actual owners',
  async mode => {
    const f = await fixture()
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory)
    const storage = await openStorage({
      dialect: 'sqlite',
      file: join(f.input.home, 'model.sqlite'),
      synchronous: 'full',
    })
    cleanup.push(() => storage.close())
    for (const migration of [...modelProfileDirectoryMigrations, ...replicaMigrations])
      await storage.write(tx => migration.migration.up(tx.db))
    const keyFile = join(f.input.home, 'model-replica.key')
    await writeFile(keyFile, new Uint8Array(32).fill(7), { mode: 0o600 })
    if (!isGovernanceCenterId(centerId)) throw new Error('invalid center fixture')
    const source = {
      centerId,
      accountId: unwrap(parseAccountId(account)),
      loginStateHandle: unwrap(parseLoginStateId(handle)),
    }
    const clock = { now: async () => unwrap(instantFromEpochMs(1791417600000)) }
    const fixedTenant = unwrap(parseTenantId(tenant))
    const outcome = await usingSelectedTenant(
      f.input.home,
      f.owned.catalog,
      new AbortController().signal,
      async ports => {
        const options = {
          governance: ports.client,
          source,
          tenant: fixedTenant,
          keyFile,
          diagnostics: { record() {} },
          onDiagnosticFailure() {},
          replicaDiagnostics: { record() {}, sinkFailure() {} },
        }
        const owner = createSessionModelDirectory(storage, clock, options)
        cleanup.push(() => owner.close())
        const read = await owner.ready
        expect(await read.credentials.value(fixedTenant, 'official')).toEqual({
          failure: 'credentialUnavailable',
        })
        const body = new TextEncoder().encode('explicit-model-secret')
        const original = f.exchange.getMockImplementation()
        if (!original) throw new Error('missing original transport')
        const entered = Promise.withResolvers<void>(),
          release = Promise.withResolvers<void>()
        if (mode === 'rejected' || mode === 'unconfirmed')
          f.exchange.mockImplementation(async (...args) => {
            if (mode === 'unconfirmed')
              return { kind: 'unavailable', reason: 'connection', sendAttempted: false }
            if ((args[1] as { operation: string }).operation.endsWith('#S-26'))
              return {
                kind: 'reply',
                reply: { result: { standing: 'ineffective' } },
                sendAttempted: true,
              }
            return original(...args)
          })
        if (mode === 'draining')
          f.exchange.mockImplementation(async (...args) => {
            entered.resolve()
            await release.promise
            return original(...args)
          })
        const publication = owner.publishCredential({
          credentialRef: 'original-model-credential',
          body,
        })
        if (mode === 'draining') {
          await entered.promise
          let closed = false
          const closing = owner.close().then(() => {
            closed = true
          })
          await new Promise<void>(resolve => setImmediate(resolve))
          expect(closed).toBe(false)
          release.resolve()
          await closing
        }
        const result = await publication
        f.exchange.mockImplementation(original)
        if (mode === 'rejected' || mode === 'unconfirmed') {
          expect(result).toMatchObject({
            kind: mode,
            credentialRef: 'original-model-credential',
            stage: 'binding',
          })
          expect(await read.credentials.value(fixedTenant, 'official')).toEqual({
            failure: 'credentialUnavailable',
          })
          return result
        }
        expect(result).toEqual({ kind: 'stored', credentialRef: 'original-model-credential' })
        expect(new TextDecoder().decode(body)).toBe('explicit-model-secret')
        expect(JSON.stringify(result)).not.toContain('explicit-model-secret')
        await owner.close()
        const stoppedCalls = f.exchange.mock.calls.length
        expect(await owner.publishCredential({ credentialRef: 'stopped-write', body })).toEqual({
          kind: 'rejected',
          credentialRef: 'stopped-write',
          stage: 'admission',
          reason: 'closed',
        })
        expect(f.exchange.mock.calls.length).toBe(stoppedCalls)
        const reopened = createSessionModelDirectory(storage, clock, options)
        try {
          const current = await (await reopened.ready).credentials.value(fixedTenant, 'official')
          expect(current).toMatchObject({ scope: { layer: 'tenant', tenant: fixedTenant } })
          if ('failure' in current) throw new Error('model credential not restored')
          expect(new TextDecoder().decode(current.value)).toBe('explicit-model-secret')
          current.value.fill(0)
        } finally {
          await reopened.close()
        }
        return result
      },
      f.factory,
    )
    expect(outcome.diagnostics).toEqual([])
  },
)

it.each(['file', 'missing', 'cancel'] as const)(
  'prepares first model configuration from actual directory and %s input',
  async mode => {
    const f = await fixture()
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory)
    const path = join(f.input.home, 'explicit-model-key')
    await writeFile(path, 'original-openrouter-secret', { mode: 0o600 })
    const dialog: GovernanceDialog = {
      text: vi.fn(async () => path),
      choose: vi.fn(async title =>
        title === 'Select model' ? (mode === 'cancel' ? undefined : 0) : mode === 'file' ? 0 : 1,
      ),
      show: vi.fn(async () => true),
      identity: vi.fn(),
    }
    const result = await usingSelectedTenant(
      f.input.home,
      f.owned.catalog,
      new AbortController().signal,
      async ports => {
        if (!isGovernanceCenterId(centerId)) throw new Error('invalid center')
        const options = {
          home: f.input.home,
          binding: ports.selection.selected,
          source: {
            centerId,
            accountId: unwrap(parseAccountId(account)),
            loginStateHandle: unwrap(parseLoginStateId(handle)),
          },
          governance: ports.client,
          dialog,
          signal: new AbortController().signal,
          originalId: () => 'first-model-credential',
          maxCredentialBytes: 65536,
          maxChoices: 256,
        }
        const first = await prepareSessionModel(options)
        if (mode === 'cancel') {
          expect(first).toEqual({ kind: 'blocked', reason: 'input-cancelled' })
          expect(dialog.text).not.toHaveBeenCalled()
          return first
        }
        expect(first).toMatchObject({ kind: 'configured', credentialPresent: mode === 'file' })
        if (first.kind !== 'configured') throw new Error('model setup failed')
        expect(first.routeName).not.toBe('')
        const runtime = await openRuntimeDatabase(
          tenantPaths(f.input.home, ports.selection.selected).runtime,
          sessionTenantMigrations,
        )
        await runtime.close()
        const key = await readFile(first.keyFile)
        expect(key.length).toBe(32)
        if (mode === 'file') {
          vi.mocked(dialog.text).mockClear()
          const repeated = await prepareSessionModel(options)
          expect(repeated).toEqual(first)
          expect(dialog.text).not.toHaveBeenCalled()
          expect(await readFile(first.keyFile)).toEqual(key)
        }
        expect(
          JSON.stringify({
            first,
            calls: vi.mocked(dialog.show).mock.calls,
            choices: vi.mocked(dialog.choose).mock.calls,
          }),
        ).not.toContain('original-openrouter-secret')
        const database = await readFile(tenantPaths(f.input.home, ports.selection.selected).runtime)
        expect(database.includes(Buffer.from('original-openrouter-secret'))).toBe(false)
        return first
      },
      f.factory,
    )
    expect(result.diagnostics).toEqual([])
  },
)

it.each(['unsafe-key', 'unsafe-input'] as const)(
  'rejects %s during first model setup without replacing existing material',
  async mode => {
    const f = await fixture()
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory)
    const result = await usingSelectedTenant(
      f.input.home,
      f.owned.catalog,
      new AbortController().signal,
      async ports => {
        const paths = tenantPaths(f.input.home, ports.selection.selected)
        const keyFile = join(paths.credentials, 'model-replica.key')
        const inputFile = join(f.input.home, 'model-input')
        await writeFile(inputFile, 'private-api-input', { mode: 0o600 })
        if (mode === 'unsafe-key') {
          await mkdir(paths.credentials, { recursive: true, mode: 0o700 })
          await writeFile(keyFile, 'incomplete-original-key', { mode: 0o600 })
        } else await chmod(inputFile, 0o644)
        if (!isGovernanceCenterId(centerId)) throw new Error('invalid center')
        const operation = prepareSessionModel({
          home: f.input.home,
          binding: ports.selection.selected,
          source: {
            centerId,
            accountId: unwrap(parseAccountId(account)),
            loginStateHandle: unwrap(parseLoginStateId(handle)),
          },
          governance: ports.client,
          dialog: {
            choose: async () => 0,
            text: async () => inputFile,
            show: async () => true,
            identity() {},
          },
          signal: new AbortController().signal,
          originalId: () => 'protected-model-key',
          maxCredentialBytes: 65536,
          maxChoices: 256,
        })
        await expect(operation).rejects.toMatchObject(
          mode === 'unsafe-key' ? { reason: 'unsafe-path' } : { code: 'secret-permissions' },
        )
        if (mode === 'unsafe-key')
          expect(await readFile(keyFile, 'utf8')).toBe('incomplete-original-key')
        expect(await readFile(inputFile, 'utf8')).toBe('private-api-input')
        return 'verified'
      },
      f.factory,
    )
    expect(result).toEqual({ outcome: 'verified', diagnostics: [] })
  },
)
