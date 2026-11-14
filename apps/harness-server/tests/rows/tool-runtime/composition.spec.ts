import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { LocalInvocationQualifier } from '@omne-harness/tool-host-local'
import { TenantStandingSourceService, tenantStandingKey } from '@omne-harness/identity/cordis'
import type { TenantStandingReading } from '@omne-harness/identity'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { decodeScopeRef, type ScopeBindingSource } from '@omne-harness/runtime-context-contract'
import type {
  ResidentKey,
  SessionPrincipalBindingSource,
  SessionTransactionPort,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  SessionWorkPrincipalsService,
  sessionTransactionsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { Principal } from '@omne-harness/identity'
import type {
  ToolDelivery,
  ToolInvokeRequest,
  ToolResultReceiver,
} from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import {
  ToolResidencyReaderService,
  toolCatalogKey,
  toolCommandsKey,
  toolResidencyReaderKey,
  toolRuntimeKey,
  type ToolCommandsService,
  type ToolRuntimeService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { executionScopeBindingKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import * as cordis from '../../../src/cordis.ts'
import releaseDistribution from '../../../config/serve.distribution.json' with { type: 'json' }
import { cursorSigning } from '../../../src/entry/cursor-signing.ts'
import { createExecutionAuthorityModules } from '../../../src/entry/execution-authorities.ts'
import {
  principalIssuer,
  principalVerifier,
  sessionWorkIssuerOf,
} from '../../../src/entry/principals.ts'
import {
  createSessionWorkPrincipals,
  sessionWorkPrincipals,
} from '../../../src/entry/session-work-principals.ts'
import { storageHost } from '../../../src/entry/storage-host.ts'
import {
  toolContributionAuthority,
  toolReleaseRegistrant,
} from '../../../src/entry/tool-release.ts'
import { releaseOf } from '../../../src/entry/tool-release.ts'
import { createReleaseToolRequests } from '../../../src/entry/tool-requests.ts'
import { toolClock, toolPublicationAuthority } from '../../../src/entry/tool-runtime-objects.ts'
import { defineRow } from '../../../src/row.ts'
import { callHostDomain, createEnvironmentStateStore } from '@omne-harness/tool-host-local'
import { COMBINATION_VERSION } from '../../../src/rows/agent-journal/config.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { createToolRecordsRow } from '../../../src/rows/tool-runtime/index.ts'
import { acquireStateLock, lostContactBy } from '../../../src/state-lock.ts'
import { permissionOriginsOf } from '../../../src/rows/governance/permission-origins.ts'
import { sessionWorkOf } from '../../../src/rows/tool-runtime/session-work.ts'
import { TOOL_BODY_SCHEMA_VOCABULARY } from '../../../src/entry/tool-body-schemas.ts'
import type { EntryObjectModule } from '../../../src/types.ts'
import { toolRowsOperatorConfig } from '../../r9/support.ts'
import { compositionAuthority, compositionAuthorityWithPolicy } from './composition-authority.ts'
import { maintenancePolicy } from './maintenance-policy.ts'
import { tenantDomainScannerPrincipal } from '../../../src/entry/tenant-domain-scanner.ts'
import { readToolInvocationRef } from '@omne-harness/tool-contract/provider'
import { withLiveRows } from '../model/support.ts'
import {
  TENANT_A,
  TENANT_B,
  access,
  accessPolicyRow,
  allowAll,
  createCommand,
  createGuards,
  providerConfig,
} from '../storage/fixtures/tree.ts'

const SESSION = 'tool-b-session'
const SCOPE_REF = okScope('session-scope:tool-b-composition')
const WORK_A = 'testWorkPrincipalA'
const WORK_B = 'testWorkPrincipalB'

function okScope(ref: string) {
  const decoded = decodeScopeRef({ ref })
  if ('failure' in decoded) throw new Error('fixture scope')
  return decoded.ok
}

const bases: string[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const base of bases.splice(0)) rmSync(base, { recursive: true, force: true })
})

const MEMBER: TenantStandingReading = Object.freeze({
  kind: 'member',
  role: { model: { model: 'default-team', revision: '1' }, role: 'member' },
  qualifications: [],
  evidence: { record: 'standing:fixture', revision: '1' },
})

const identityStandIn = defineRow({
  row: 'identity',
  implementation: 'contract-double',
  manifest: { provides: [tenantStandingKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'identity-stand-in',
    apply(ctx: Context) {
      class Standing extends TenantStandingSourceService {
        readonly read = ({ tenant }: { tenant: TenantId }) =>
          Promise.resolve(
            tenantEquals(tenant, TENANT_A) || tenantEquals(tenant, TENANT_B)
              ? MEMBER
              : { kind: 'not-member' as const, evidence: { record: 'other', revision: '0' } },
          )
      }
      new Standing(ctx)
    },
  },
})

const residencyStandIn = defineRow({
  row: 'tool-residency',
  implementation: 'contract-double',
  manifest: { provides: [toolResidencyReaderKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'residency-stand-in',
    apply(ctx: Context) {
      class Residency extends ToolResidencyReaderService {
        readonly referencing = async () => succeed({ items: [], next: null })
      }
      new Residency(ctx)
    },
  },
})

const scopeBindings: ScopeBindingSource = {
  lookup: async scope =>
    scope.ref === SCOPE_REF.ref ? { kind: 'bound', tenant: TENANT_A } : { kind: 'unbound' },
}

const executionAuthorities: readonly EntryObjectModule[] = createExecutionAuthorityModules({
  readBindings: () => scopeBindings,
}).map(module => ({ ...module, implementation: 'contract-double' as const }))

const ownershipStandIn: SessionPrincipalBindingSource = {
  read: async ({ tenant, session }) =>
    tenantEquals(tenant, TENANT_A) && session === access(TENANT_A, SESSION).session
      ? succeed({
          kind: 'bound' as const,
          tenant,
          session,
          source: { owner: 'test', record: 'ownership', revision: '1', digest: 'd' },
        })
      : succeed({ kind: 'not-bound' as const }),
}

const workPrincipalsOverStandIn: EntryObjectModule = {
  name: sessionWorkPrincipalsKey,
  implementation: 'contract-double',
  install(scope, env) {
    const work = createSessionWorkPrincipals({
      issue: sessionWorkIssuerOf(env),
      readBindings: () => ownershipStandIn,
    })
    class Work extends SessionWorkPrincipalsService<Principal> {
      readonly forSession = work.forSession
    }
    new Work(scope)
  },
}

function workPrincipal(name: string, tenant: TenantId): EntryObjectModule {
  return {
    name,
    implementation: 'contract-double',
    install(scope, env) {
      const issued = sessionWorkIssuerOf(env)({ tenant, session: access(tenant, SESSION).session })
      if ('failure' in issued) throw new Error('fixture: the work principal was refused')
      scope.provide(name, issued.ok)
    },
  }
}

function workspace() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'tool-b-')))
  bases.push(base)
  const storageRoot = join(base, 'state', 'storage')
  mkdirSync(join(base, 'state'))
  return { base, storageRoot }
}

function rowsOf(storageRoot: string) {
  const tools = toolRowsOperatorConfig({ storageRoot })
  return {
    tools,
    rows: [
      { id: 'telemetry', plugin: 'telemetry', config: { implementation: 'disabled' } },
      {
        id: 'storage',
        plugin: 'storageRow',
        config: providerConfig(
          storageRoot,
          releaseDistribution.rows.find(row => row.id === 'storage')?.config as {
            maxJsonDepth: number
          },
        ),
      },
      { id: 'identity', plugin: 'identityStandIn' },
      { id: 'authorization', plugin: 'policyAccess' },
      {
        id: 'session-storage',
        plugin: 'sessionStorageRow',
        config: {
          combinationVersion: COMBINATION_VERSION,
          directoryFile: join(storageRoot, 'tenant-domains.json'),
          domainRule: 'organization-account/1',
        },
      },
      { id: 'tool-records', plugin: 'toolRecordsRow', config: tools.records },
      { id: 'tool-bindings', plugin: 'toolBindingsRow' },
      { id: 'tool-runtime', plugin: 'toolRuntimeRow' },
      { id: 'tool-executor', plugin: 'toolExecutorRow' },
      {
        id: 'tool-host',
        plugin: 'toolHostRow',
        config: { construction: tools.construction },
      },
      { id: 'tool-residency', plugin: 'residencyStandIn' },
      { id: 'tool-instances', plugin: 'toolInstancesRow' },
      { id: 'tool-environments', plugin: 'toolEnvironmentsRow' },
      { id: 'execution-environment', plugin: 'executionEnvironmentRow' },
      { id: 'execution-files', plugin: 'executionFilesRow' },
      { id: 'execution-command', plugin: 'executionCommandRow' },
      { id: 'execution-host', plugin: 'executionHost', config: tools.host },
    ],
  }
}

const entryObjects = (work: EntryObjectModule): readonly EntryObjectModule[] => [
  principalVerifier,
  principalIssuer,
  tenantDomainScannerPrincipal,
  compositionAuthority,
  toolReleaseRegistrant,
  toolContributionAuthority,
  toolClock,
  toolPublicationAuthority,
  work,
  ...executionAuthorities,
  storageHost,
  cursorSigning,
  workPrincipal(WORK_A, TENANT_A),
  workPrincipal(WORK_B, TENANT_B),
]

function json(text: string): JsonValue {
  const read = readJsonText(text, {
    maxBytes: 65536,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 64,
    maxStringLength: 16384,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('fixture: not JSON')
  return read.value
}

async function until<T>(
  what: string,
  read: () => Promise<T>,
  done: (value: T) => boolean,
  ms: number,
): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const value = await read()
    if (done(value)) return value
    if (Date.now() > end)
      throw new Error(`until: ${what} not reached in ${ms} ms; last value ${JSON.stringify(value)}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

type Runtime = ToolRuntimeService<unknown, ToolMessageContentBlock>

function requestSource(ctx: Context) {
  const snapshot = {
    contextScopes: [{ generation: '1', scope: SCOPE_REF.ref, operation: 'op', ended: null }],
  } as unknown as WorkSnapshot
  return createReleaseToolRequests({
    verifier: () => toolRuntimeHolder(ctx).verifier(),
    catalog: () => ctx.get(toolCatalogKey),
    readWork: async () => succeed(snapshot),
    scopeBinding: () => ctx.get(executionScopeBindingKey),
    release: () => releaseOf(ctx),
    interaction: async () => fail('no meta command in this test'),
    inquiry: async () => fail('no meta command in this test'),
  })
}

let positions = 0
async function requestFor(ctx: Context, principal: unknown, command: string, params: string) {
  const [name = command, selected] = command.split('.')
  const args = `{"command":${JSON.stringify(selected)},"params":${params}}`
  const source = requestSource(ctx)
  const position = `step-${++positions}/tool/0`
  const input = {
    principal,
    tenant: TENANT_A,
    execution: 'exec-tool-b',
    action: position,
    original: {
      kind: 'tool_call',
      id: `block-${positions}`,
      visibility: 'model',
      callId: `call-${positions}`,
      name,
      arguments: json(args),
    },
    effectiveArguments: args,
    consumer: {
      owner: '@omne-harness/agent',
      work: 'exec-tool-b',
      position,
      purpose: 'action',
    },
  } as unknown as Parameters<ReturnType<typeof createReleaseToolRequests>['describe']>[0]
  const described = await source.describe(input)
  if ('failure' in described) throw new Error(`describe: ${JSON.stringify(described.failure)}`)
  if (described.ok.kind === 'answered') throw new Error(`describe answered: ${described.ok.text}`)
  const prepared = await source.prepare({
    ...input,
    definition: described.ok.definition,
    admission: { owner: 'test', record: `admission-${positions}`, revision: '1', digest: 'd' },
  })
  if ('failure' in prepared) throw new Error(`prepare: ${JSON.stringify(prepared.failure)}`)
  return prepared.ok
}

let resultRead: Promise<void> = Promise.resolve()

async function call(runtime: Runtime, principal: unknown, request: ToolInvokeRequest) {
  let read: () => void = () => undefined
  resultRead = new Promise(resolve => {
    read = resolve
  })
  try {
    return await settledText(runtime, principal, request)
  } finally {
    read()
  }
}

async function settledText(runtime: Runtime, principal: unknown, request: ToolInvokeRequest) {
  const caller = { principal, tenant: TENANT_A }
  const outcome = await runtime.invoke({ ...caller, request })
  if (outcome.kind !== 'accepted') throw new Error(`invoke: ${JSON.stringify(outcome)}`)
  const found = await until(
    'the call to settle',
    () => runtime.queries.lookup({ ...caller, reference: outcome.reference }),
    read => 'ok' in read && read.ok.kind === 'found' && read.ok.state.phase === 'settled',
    60_000,
  )
  if (!('ok' in found) || found.ok.kind !== 'found' || found.ok.state.phase !== 'settled')
    throw new Error(`not settled: ${JSON.stringify(found)}`)
  let text = ''
  let after: string | null = null
  do {
    const page = await runtime.queries.readResult({
      ...caller,
      reference: outcome.reference,
      result: found.ok.state.result,
      after,
    })
    if ('failure' in page) throw new Error(`readResult: ${JSON.stringify(page.failure)}`)
    for (const block of page.ok.value.content) if (block.kind === 'text') text += block.text
    after = page.ok.next
  } while (after !== null)
  return { state: found.ok.state, text }
}

async function ready(
  ctx: Context,
  saved: ToolDelivery<ToolMessageContentBlock>[],
  residents = true,
) {
  const base = createCommand(TENANT_A, SESSION)
  const command = {
    ...base,
    input: {
      ...base.input,
      creation: {
        ...base.input.creation,
        residentAdoption: {
          residents: residents
            ? ['Files', 'Shell'].map(capability => ({
                capability,
                version: 'fixture/1',
                shape: json('{}'),
                admitted: {
                  owner: 'transport-fixture',
                  record: capability,
                  revision: '1',
                  digest: capability,
                },
              }))
            : [],
          keys: residents
            ? ['Files', 'Shell'].map(capability => ({
                capability,
                key: `transport:${capability}` as ResidentKey,
              }))
            : [],
        },
      },
    },
  }
  const created = await (ctx.get(sessionTransactionsKey) as SessionTransactionPort<string>).commit({
    access: access(TENANT_A, SESSION),
    command,
    guards: createGuards(command),
  })
  if (!('ok' in created)) throw new Error(`create: ${JSON.stringify(created)}`)
  const runtime = ctx.get(toolRuntimeKey) as Runtime
  const receiver: ToolResultReceiver<unknown, ToolMessageContentBlock> = {
    async push(input) {
      saved.push(input.delivery)
      await resultRead
      const key = canonicalDigest(input.delivery.key)
      return succeed({
        key: input.delivery.key,
        evidence: { owner: '@omne-harness/agent', record: key, revision: '1', digest: key },
      })
    },
  }
  runtime.registerResultReceiver('@omne-harness/agent', receiver)
  const principal = ctx.get(WORK_A)
  await until(
    'the catalog to list the release authors',
    () =>
      requestFor(ctx, principal, 'Files.read', '{"path":"x"}').then(
        () => true,
        () => false,
      ),
    ready => ready,
    30_000,
  )
  return { runtime, principal }
}

type Ran = Readonly<{
  value: Readonly<{
    shell: Awaited<ReturnType<typeof call>>
    write: Awaited<ReturnType<typeof call>>
    read: Awaited<ReturnType<typeof call>>
    foreign: Awaited<ReturnType<Runtime['invoke']>>
  }>
  exitCode: number | null
  filesRoot: string
  saved: readonly ToolDelivery<ToolMessageContentBlock>[]
}>

async function shellAndFiles(work: EntryObjectModule): Promise<Ran> {
  const { storageRoot } = workspace()
  const { rows, tools } = rowsOf(storageRoot)

  const saved: ToolDelivery<ToolMessageContentBlock>[] = []
  const { value, run } = await withLiveRows(
    {
      rows,
      plugins: {
        ...cordis,
        identityStandIn,
        residencyStandIn,
        policyAccess: maintenancePolicy,
      },
      entryObjects: entryObjects(work),
      probe: [toolRuntimeKey, toolCatalogKey, sessionTransactionsKey, WORK_A, WORK_B],
    },
    async ctx => {
      const { runtime, principal } = await ready(ctx, saved)
      const target = join(tools.filesRoot, 'tool-b.txt')
      const shell = await call(
        runtime,
        principal,
        await requestFor(ctx, principal, 'Shell.execute', '{"script":"echo tool-b-shell"}'),
      )
      const write = await call(
        runtime,
        principal,
        await requestFor(
          ctx,
          principal,
          'Files.write',
          JSON.stringify({ path: target, text: 'tool-b-files', mode: 'create' }),
        ),
      )
      const read = await call(
        runtime,
        principal,
        await requestFor(ctx, principal, 'Files.read', JSON.stringify({ path: target })),
      )
      const foreignRequest = await requestFor(
        ctx,
        principal,
        'Shell.execute',
        '{"script":"echo foreign"}',
      )
      const foreign = await runtime.invoke({
        principal: ctx.get(WORK_B),
        tenant: TENANT_A,
        request: foreignRequest,
      })
      await until(
        'three deliveries to the original consumer',
        async () => saved.length,
        count => count >= 3,
        30_000,
      )
      return { shell, write, read, foreign }
    },
  )
  return { value, exitCode: run.result.exitCode, filesRoot: tools.filesRoot, saved }
}

function expectRan(ran: Ran): void {
  const { value } = ran
  expect(value.shell.state.terminal).toMatchObject({ kind: 'completed' })
  if (
    process.platform === 'linux' ||
    process.platform === 'win32' ||
    process.platform === 'darwin'
  ) {
    expect(value.shell.text).toContain('tool-b-shell')
    expect(value.write.text).toMatch(/^done request=/u)
    expect(value.read.text).toContain('tool-b-files')
    expect(readFileSync(join(ran.filesRoot, 'tool-b.txt'), 'utf8')).toBe('tool-b-files')
  } else {
    for (const result of [value.shell, value.write, value.read]) {
      expect(result.state.terminal).toMatchObject({ kind: 'completed' })
      expect(result.text).toMatch(/^rejected request="[^"]+" reason=unavailable$/u)
    }
    expect(existsSync(join(ran.filesRoot, 'tool-b.txt'))).toBe(false)
  }
  expect(value.foreign).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
  expect(ran.saved.length).toBeGreaterThanOrEqual(3)
  expect(ran.exitCode).toBe(0)
}

describe('Tool segment B: the release rows in one process composition', () => {
  it('closes the body schema domain when the real Tool records row is removed', async () => {
    const { storageRoot } = workspace()
    const { rows } = rowsOf(storageRoot)

    const parse = (text: string) => {
      const read = readJsonText(text, {
        maxBytes: 1024,
        maxDepth: 8,
        maxItems: 32,
        maxMembers: 16,
        maxStringLength: 256,
        maxNumberLength: 32,
      })
      if (read.kind !== 'ok') throw new Error('JSON fixture required')
      return read
    }
    const schema = {
      identity: { id: 'amount', revision: '1', digest: 'amount-v1' },
      definition: {
        schema: parse('{"type":"number"}').value,
        vocabulary: TOOL_BODY_SCHEMA_VOCABULARY,
        descriptions: [],
      },
    }
    const read = parse('1.00')
    const { value, run } = await withLiveRows(
      {
        rows,
        plugins: { ...cordis, identityStandIn, residencyStandIn, policyAccess: maintenancePolicy },
        entryObjects: entryObjects(workPrincipalsOverStandIn),
        probe: [toolRuntimeKey],
      },
      async ctx => {
        const holder = toolRuntimeHolder(ctx)
        const schemas = holder.bodySchemas
        if (schemas == null) throw new Error('body schema provider was not mounted')
        expect(await schemas.check(schema, read)).toHaveProperty('ok')
        return { holder, schemas }
      },
    )
    expect(run.result.exitCode).toBe(0)
    expect(value.holder.bodySchemas).toBeNull()
    expect(await value.schemas.check(schema, read)).toHaveProperty('failure.kind', 'unavailable')
  })

  it(
    'the sweep removes a released call with its unread Shell body at the expiry of the body, and the native file the command wrote stays',
    { timeout: 90_000 },
    async () => {
      const { storageRoot } = workspace()
      const { rows, tools } = rowsOf(storageRoot)
      const offloading = tools.records.configuration.offloading
      offloading.maxInlineUtf8Bytes = 4096
      offloading.previewUtf8Bytes = 256
      const retentionMs = offloading.orphanGraceMs
      offloading.maxRetentionMs = retentionMs
      const sweep = {
        id: 'tool-body-sweep',
        plugin: 'toolBodySweepRow',
        config: {
          combinationVersion: tools.records.combinationVersion,
          ledgerCommitAttempts: tools.records.configuration.ledgerCommitAttempts,
          orphanGraceMs: tools.records.configuration.offloading.orphanGraceMs,
          intervalMs: 20,
          limit: 100,
        },
      }
      const saved: ToolDelivery<ToolMessageContentBlock>[] = []
      const { value, run } = await withLiveRows(
        {
          rows: [...rows, sweep],
          plugins: {
            ...cordis,
            identityStandIn,
            residencyStandIn,
            policyAccess: maintenancePolicy,
          },
          entryObjects: entryObjects(workPrincipalsOverStandIn),
          probe: [toolRuntimeKey, toolCatalogKey, sessionTransactionsKey, WORK_A],
        },
        async ctx => {
          const { runtime, principal } = await ready(ctx, saved)
          const request = await requestFor(
            ctx,
            principal,
            'Shell.execute',
            JSON.stringify({ script: `echo native > native.txt; echo ${'x'.repeat(5000)}` }),
          )
          const invoked = await runtime.invoke({ principal, tenant: TENANT_A, request })
          if (invoked.kind !== 'accepted') throw new Error(`invoke: ${JSON.stringify(invoked)}`)
          const delivered = await until(
            'result delivery',
            async () => saved.find(item => item.kind === 'result'),
            item => item !== undefined,
            30_000,
          )
          if (delivered?.kind !== 'result' || delivered.value.original.kind !== 'offloaded')
            throw new Error(`expected an offloaded body: ${JSON.stringify(delivered)}`)
          const bodyId = delivered.value.original.bodyId
          const call = readToolInvocationRef(invoked.reference).call
          const sql = toolRuntimeHolder(ctx).sql
          if (sql === null) throw new Error('SQL not installed')
          await until(
            'the call to come to rest',
            async () => {
              const answer = await sql.store.read({ kind: 'call', tenant: TENANT_A, call })
              if (answer.kind !== 'complete') throw new Error('ledger read unavailable')
              return answer.records
            },
            records =>
              records.some(
                record => record.kind === 'call' && record.call.state.delivery?.kind === 'released',
              ) &&
              records.every(
                record =>
                  record.kind !== 'task' ||
                  (record.task.kind === 'clock' && record.task.state === 'blocked'),
              ),
            30_000,
          )
          vi.useFakeTimers({
            toFake: ['Date'],
            shouldAdvanceTime: true,
            now:
              Date.now() +
              Math.max(retentionMs, offloading.orphanGraceMs) +
              offloading.clockSkewMs +
              1000,
          })
          await until(
            'the sweep to remove the call domain',
            async () => {
              const answer = await sql.store.read({ kind: 'call', tenant: TENANT_A, call })
              if (answer.kind !== 'complete') throw new Error('ledger read unavailable')
              return answer
            },
            answer => answer.revision === '0' && answer.records.length === 0,
            20_000,
          )
          for (const aggregate of [
            'start',
            'source',
            'delivery',
            'environment',
            'control',
          ] as const)
            expect(await sql.store.read(callHostDomain(TENANT_A, aggregate, call))).toMatchObject({
              kind: 'complete',
              revision: '0',
              records: [],
            })
          expect(
            await runtime.body.read({
              principal,
              tenant: TENANT_A,
              reference: invoked.reference,
              result: delivered.key.result,
              bodyId,
              after: null,
              maxBytes: 64,
            }),
          ).toEqual({ failure: { kind: 'not-found', target: 'result', reason: 'missing' } })
          return { call }
        },
      )
      expect(run.result.exitCode, JSON.stringify(run.of('shutdown-result'))).toBe(0)
      expect(value.call).toBeDefined()
      expect(existsSync(join(tools.filesRoot, 'native.txt'))).toBe(true)
      const domains = join(storageRoot, 'domains')
      const counts = readdirSync(domains)
        .filter(name => name.endsWith('.sqlite'))
        .flatMap(name => {
          const db = new DatabaseSync(join(domains, name), { readOnly: true })
          try {
            if (!db.prepare("SELECT name FROM sqlite_schema WHERE name='tl_body_chunk'").get())
              return []
            const n = (table: string) =>
              Number((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n)
            return [
              {
                chunks: n('tl_body_chunk'),
                manifests: n('tl_body_manifest'),
                due: n('tl_due'),
                callRecords: Number(
                  (
                    db
                      .prepare(
                        "SELECT count(*) AS n FROM tl_record WHERE kind = 'call' OR name LIKE '%@call-%'",
                      )
                      .get() as { n: number }
                  ).n,
                ),
              },
            ]
          } finally {
            db.close()
          }
        })
      expect(counts).toEqual([{ chunks: 0, manifests: 0, due: 0, callRecords: 0 }])
    },
  )

  it('qualifies the original source inside target admission without recursion and retires its read port', async () => {
    const { storageRoot } = workspace()
    const { rows } = rowsOf(storageRoot)
    const policy = accessPolicyRow(allowAll)
    const readings: Awaited<ReturnType<LocalInvocationQualifier<unknown>['qualify']>>[] = []
    let held: LocalInvocationQualifier<unknown> | undefined
    let original: Parameters<LocalInvocationQualifier<unknown>['qualify']>[0] | undefined
    let calls = 0
    const authority = compositionAuthorityWithPolicy((_ctx, env) => ({
      async qualify(input) {
        calls++
        if (calls > 8) return { kind: 'unavailable', diagnostic: 'recursive target admission' }
        held = env.readTrusted('toolInvocationQualification').get('toolInvocationQualification') as
          | LocalInvocationQualifier<unknown>
          | undefined
        if (held === undefined)
          return { kind: 'unavailable', diagnostic: 'original source read absent' }
        original = input
        const who = sessionWorkOf(input.principal, input.tenant)
        if (who === undefined) return { kind: 'denied', reason: 'not-session-work' }
        const result = await permissionOriginsOf(
          env.readTrusted('toolInvocationQualification'),
        ).tool.qualify({ ...input, principal: who.principal })
        readings.push(result)
        return 'ok' in result
          ? { kind: 'allowed', condition: null }
          : { kind: 'unavailable', diagnostic: 'original source rejected' }
      },
    }))
    const { run } = await withLiveRows(
      {
        rows,
        plugins: { ...cordis, identityStandIn, residencyStandIn, policyAccess: policy.plugin },
        entryObjects: entryObjects(workPrincipalsOverStandIn).map(entry =>
          entry.name === authority.name ? authority : entry,
        ),
        probe: [toolRuntimeKey, toolCatalogKey, sessionTransactionsKey, WORK_A, WORK_B],
      },
      async ctx => {
        const { runtime, principal } = await ready(ctx, [])
        const request = await requestFor(
          ctx,
          principal,
          'Shell.execute',
          '{"script":"echo source-qualified"}',
        )
        const result = await runtime.invoke({ principal, tenant: TENANT_A, request })
        expect(result.kind).toBe('accepted')
        expect(readings.length).toBeGreaterThan(0)
        expect(readings.every(reading => 'ok' in reading)).toBe(true)
        expect(calls).toBeLessThan(8)
      },
    )
    expect(run.result.exitCode).toBe(0)
    expect(held).toBeDefined()
    expect(original).toBeDefined()
    expect(await held!.qualify(original!)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('rejects a direct Agent call to an adopted but nonresident tool before any file write', async () => {
    const { storageRoot } = workspace()
    const { rows, tools } = rowsOf(storageRoot)

    await withLiveRows(
      {
        rows,
        plugins: { ...cordis, identityStandIn, residencyStandIn, policyAccess: maintenancePolicy },
        entryObjects: entryObjects(workPrincipalsOverStandIn),
        probe: [toolRuntimeKey, toolCatalogKey, sessionTransactionsKey, WORK_A, WORK_B],
      },
      async ctx => {
        const saved: ToolDelivery<ToolMessageContentBlock>[] = []
        const { runtime, principal } = await ready(ctx, saved, false)
        const target = join(tools.filesRoot, 'must-not-exist.txt')
        const request = await requestFor(
          ctx,
          principal,
          'Files.write',
          JSON.stringify({ path: target, text: 'forbidden', mode: 'create' }),
        )
        expect(await runtime.invoke({ principal, tenant: TENANT_A, request })).toMatchObject({
          kind: 'rejected',
          failure: { kind: 'denied' },
        })
        expect(() => readFileSync(target)).toThrow(expect.objectContaining({ code: 'ENOENT' }))
        expect(saved).toEqual([])
      },
    )
  })

  it(
    'settles Shell and Files according to host support through the production request source; another tenant is refused',
    { timeout: 180_000 },
    async () => {
      expectRan(await shellAndFiles(workPrincipalsOverStandIn))
    },
  )

  it(
    'the per-call tables (witness, origins, ledger views) hold calls in flight only: after N settled calls they are empty (N5)',
    { timeout: 180_000 },
    async () => {
      const { storageRoot } = workspace()
      const { rows, tools } = rowsOf(storageRoot)

      const saved: ToolDelivery<ToolMessageContentBlock>[] = []
      const calls = 6
      const { value } = await withLiveRows(
        {
          rows,
          plugins: {
            ...cordis,
            identityStandIn,
            residencyStandIn,
            policyAccess: maintenancePolicy,
          },
          entryObjects: entryObjects(workPrincipalsOverStandIn),
          probe: [toolRuntimeKey, toolCatalogKey, sessionTransactionsKey, WORK_A, WORK_B],
        },
        async ctx => {
          const { runtime, principal } = await ready(ctx, saved)
          const target = join(tools.filesRoot, 'bounded.txt')
          await call(
            runtime,
            principal,
            await requestFor(
              ctx,
              principal,
              'Files.write',
              JSON.stringify({ path: target, text: 'bounded', mode: 'create' }),
            ),
          )
          for (let index = 0; index < calls; index += 1)
            await call(
              runtime,
              principal,
              await requestFor(ctx, principal, 'Files.read', JSON.stringify({ path: target })),
            )
          await until(
            `${calls + 1} deliveries to the original consumer`,
            async () => saved.length,
            count => count >= calls + 1,
            30_000,
          )
          const residents = toolRuntimeHolder(ctx).residents
          return Object.fromEntries([...residents].map(([name, size]) => [name, size()]))
        },
      )
      expect(value).toEqual({ witnessed: 0, origins: 0, ledgerViews: 0 })
    },
  )

  it(
    'Windows: a workspace configured by its 8.3 short name runs Shell and Files with its long name; outside stays refused (R2-D374, R2-D376)',
    { timeout: 180_000 },
    async context => {
      if (process.platform !== 'win32')
        context.skip('the case uses Windows short names and junctions')
      const { storageRoot } = workspace()
      const { rows, tools } = rowsOf(storageRoot)
      const longRoot = realpathSync.native(tools.filesRoot)
      if (longRoot.toLowerCase() === tools.filesRoot.toLowerCase())
        context.skip('the temp directory has no 8.3 short spelling on this host')
      const child = join(longRoot, 'tank-battle')
      mkdirSync(child)
      const outside = join(dirname(longRoot), 'outside')
      mkdirSync(outside)
      writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE-BYTES')
      const outsideToIn = join(outside, 'to-ws')
      symlinkSync(child, outsideToIn, 'junction')

      const saved: ToolDelivery<ToolMessageContentBlock>[] = []
      const { value } = await withLiveRows(
        {
          rows,
          plugins: {
            ...cordis,
            identityStandIn,
            residencyStandIn,
            policyAccess: maintenancePolicy,
          },
          entryObjects: entryObjects(workPrincipalsOverStandIn),
          probe: [toolRuntimeKey, toolCatalogKey, sessionTransactionsKey, WORK_A, WORK_B],
        },
        async ctx => {
          const { runtime, principal } = await ready(ctx, saved)
          const shell = (cwd: string, marker: string) =>
            requestFor(
              ctx,
              principal,
              'Shell.execute',
              JSON.stringify({ script: `echo ${marker}`, cwd }),
            )
          const inside = await call(runtime, principal, await shell(child, 'alias-inside'))
          const refused = await call(runtime, principal, await shell(outside, 'alias-outside'))
          const throughLink = await call(
            runtime,
            principal,
            await requestFor(
              ctx,
              principal,
              'Shell.execute',
              JSON.stringify({ script: 'Get-Content ../secret.txt', cwd: outsideToIn }),
            ),
          )
          const write = await call(
            runtime,
            principal,
            await requestFor(
              ctx,
              principal,
              'Files.write',
              JSON.stringify({
                path: join(child, 'alias.txt'),
                text: 'alias-files',
                mode: 'create',
              }),
            ),
          )
          return { inside, refused, throughLink, write }
        },
      )
      expect(value.inside.state.terminal).toMatchObject({ kind: 'completed' })
      expect(value.inside.text).toContain('alias-inside')
      expect(value.inside.text).not.toContain('notAuthorized')
      expect(value.refused.text).toContain('notAuthorized')
      expect(value.refused.text).not.toMatch(/^alias-outside/mu)
      expect(value.throughLink.text).toContain('notAuthorized')
      expect(value.throughLink.text).not.toContain('OUTSIDE-BYTES')
      expect(value.write.text).toMatch(/^done request=/u)
      expect(readFileSync(join(child, 'alias.txt'), 'utf8')).toBe('alias-files')
    },
  )

  it.runIf(process.platform === 'linux')(
    'a Shell command whose tool host was dropped without retirement is stopped by its unit, and its call is settled as lost by the tree that holds the state lock',
    { tags: ['slow'], timeout: 180_000 },
    async () => {
      const { base, storageRoot } = workspace()
      const { rows } = rowsOf(storageRoot)
      const marker = join(base, 'lost-shell.txt')
      const lockRoot = join(base, 'lock')
      mkdirSync(lockRoot)
      const plugins = {
        ...cordis,
        identityStandIn,
        residencyStandIn,
        policyAccess: maintenancePolicy,
      }
      const live = {
        rows,
        entryObjects: entryObjects(workPrincipalsOverStandIn),
        probe: [toolRuntimeKey, toolCatalogKey, sessionTransactionsKey, toolCommandsKey, WORK_A],
      }
      const show = (unit: string) =>
        execFileSync(
          'systemctl',
          ['--user', 'show', '-p', 'LoadState', '-p', 'ActiveState', unit],
          {
            encoding: 'utf8',
          },
        )
      const delivered: ToolDelivery<ToolMessageContentBlock>[] = []
      const taken = acquireStateLock(lockRoot)
      if (taken.kind !== 'held') throw new Error('the lock of the test is in use')
      try {
        await withLiveRows({ ...live, plugins }, async first => {
          const { runtime, principal } = await ready(first, [])
          const caller = { principal, tenant: TENANT_A }
          const script = `echo start >> ${marker}; sleep 150; echo end >> ${marker}`
          const outcome = await runtime.invoke({
            ...caller,
            request: await requestFor(
              first,
              principal,
              'Shell.execute',
              JSON.stringify({ script }),
            ),
          })
          if (outcome.kind !== 'accepted') throw new Error(`invoke: ${JSON.stringify(outcome)}`)
          const { reference } = outcome
          await until(
            'the command to write its first line',
            async () => existsSync(marker) && readFileSync(marker, 'utf8'),
            text => text === 'start\n',
            60_000,
          )
          const { call } = readToolInvocationRef(reference)
          const commands = first.get(toolCommandsKey) as ToolCommandsService<
            unknown,
            ToolMessageContentBlock
          >
          const recovery = await commands.loadRecovery({ ...caller, call })
          if ('failure' in recovery) throw new Error(`recovery: ${JSON.stringify(recovery)}`)
          expect(recovery.ok.state.execution.kind).toBe('live')
          const store = toolRuntimeHolder(first).sql?.store
          const preparation = recovery.ok.preparations.at(-1)
          if (store === undefined || preparation === undefined) throw new Error('no records')
          const environment = await createEnvironmentStateStore({ store }).read({
            tenant: TENANT_A,
            call,
            operation: preparation.operation,
          })
          const owned = 'ok' in environment ? (environment.ok?.resources ?? []) : []
          expect(owned.map(fact => fact.stop)).toEqual(['active'])
          const unit = JSON.stringify(owned[0]?.resource.reference).match(
            /omne-host-[0-9a-f-]+\.scope/u,
          )?.[0]
          if (unit === undefined) throw new Error('the resource names no unit')
          expect(show(unit)).toContain('ActiveState=active')
          const taking = join(base, 'taking')
          cpSync(join(base, 'state'), join(taking, 'state'), { recursive: true })
          await withLiveRows(
            {
              ...live,
              rows: rowsOf(join(taking, 'state', 'storage')).rows,
              probe: [toolRuntimeKey, WORK_A],
              plugins: {
                ...plugins,
                toolRecordsRow: createToolRecordsRow({
                  lostContact: lostContactBy(() => taken.lock, 'instance'),
                }),
              },
            },
            async second => {
              const next = second.get(toolRuntimeKey) as Runtime
              next.registerResultReceiver('@omne-harness/agent', {
                async push(input) {
                  delivered.push(input.delivery)
                  const key = canonicalDigest(input.delivery.key)
                  return succeed({
                    key: input.delivery.key,
                    evidence: {
                      owner: '@omne-harness/agent',
                      record: key,
                      revision: '1',
                      digest: key,
                    },
                  })
                },
              })
              const found = await until(
                'the call to settle as lost',
                () =>
                  next.queries.lookup({
                    principal: second.get(WORK_A),
                    tenant: TENANT_A,
                    reference,
                  }),
                read =>
                  'ok' in read && read.ok.kind === 'found' && read.ok.state.phase === 'settled',
                60_000,
              )
              expect(found).toMatchObject({
                ok: {
                  state: {
                    terminal: { kind: 'failed', cause: 'runtime-lost' },
                    effect: { kind: 'unknown' },
                    execution: {
                      kind: 'lost',
                      evidence: { owner: '@omne-harness/harness-server', record: 'state-lock' },
                    },
                  },
                },
              })
              expect(show(unit)).toMatch(/ActiveState=inactive|LoadState=not-found/u)
              await until(
                'one delivery',
                async () => delivered.length,
                count => count >= 1,
                30_000,
              )
            },
          )
        })
      } finally {
        taken.lock.release()
      }
      expect(delivered).toHaveLength(1)
      expect(delivered[0]).toMatchObject({
        kind: 'result',
        terminal: { kind: 'failed', cause: 'runtime-lost' },
        effect: { kind: 'unknown' },
      })
      expect(readFileSync(marker, 'utf8')).toBe('start\n')
    },
  )

  it(
    'with release session ownership and work principals, Shell and Files respect host support; another tenant is refused',
    { timeout: 180_000 },
    async () => {
      expectRan(await shellAndFiles(sessionWorkPrincipals))
    },
  )
})
