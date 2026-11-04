// Tool B 段的进程内组合：真实 Cordis 根上装 Tool 运行时五行、tool-bindings、tool-host（预装发行作者）、执行环境
// 四行（宿主提供者真件），真实 SQLite 存储与会话存储组合（tool 参加者在同一登记里），真实入口对象（核验器、
// 签发者、会话工作主体、发行来源权威与登记者、toolClock、toolPublicationAuthority、执行环境授权）。
// 具名替身：identity 行（租户存续）、authorization 行（会话访问裁定放行一切，只为建会话登记租户）、
// tool-residency 行（空的常驻引用）、可信作用域绑定的来源（本用例的作用域绑定到本租户；生产来源是
// session-ad03 的作用域查找，这里不建 Context 作用域）。会话归属读口有两种：第一条用例用一个只认本用例会话的
// 归属替身（入口的 `createSessionWorkPrincipals` 读它）；第二条用例用发行的 `session-storage` 行提供的
// `sessionPrincipalBindings`（session-storage-sql 的 `createSessionPrincipalBindings`）和发行的入口对象
// `sessionWorkPrincipals`，证明发行读口签得出会话工作主体，调用真正执行。
// 请求由生产的 Tool 请求供给者构造（`createReleaseToolRequests`），会话快照读口给出那个作用域。
// 用例：Shell.execute 一次、Files.write 加 Files.read 各一次，读回原结果；外租户的同一调用被拒。
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { TenantStandingSourceService, tenantStandingKey } from '@omne-harness/identity/cordis'
import type { TenantStandingReading } from '@omne-harness/identity'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import { decodeScopeRef, type ScopeBindingSource } from '@omne-harness/runtime-context-contract'
import type {
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
  toolResidencyReaderKey,
  toolRuntimeKey,
  type ToolRuntimeService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { executionScopeBindingKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import * as cordis from '../../../src/cordis.ts'
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
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import type { EntryObjectModule } from '../../../src/types.ts'
import { toolRowsOperatorConfig } from '../../r9/support.ts'
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
  for (const base of bases.splice(0)) rmSync(base, { recursive: true, force: true })
})

const MEMBER: TenantStandingReading = Object.freeze({
  kind: 'member',
  role: { model: { model: 'default-team', revision: '1' }, role: 'member' },
  qualifications: [],
  evidence: { record: 'standing:fixture', revision: '1' },
})

/** Stands for the `identity` row: both fixture tenants are members. */
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

/** Stands for the `tool-residency` row: no session holds a resident reference. */
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

/** The scope source of this test: the one scope belongs to tenant A. */
const scopeBindings: ScopeBindingSource = {
  lookup: async scope =>
    scope.ref === SCOPE_REF.ref ? { kind: 'bound', tenant: TENANT_A } : { kind: 'unbound' },
}

/** The execution authority entry objects with the test scope source in place of AD-03's lookup. */
const executionAuthorities: readonly EntryObjectModule[] = createExecutionAuthorityModules({
  readBindings: () => scopeBindings,
}).map(module => ({ ...module, implementation: 'contract-double' as const }))

/** Stands for the session ownership read: only this test's session of tenant A is bound. */
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

/** The real session work principals of the entry over the ownership stand-in. */
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

/** A session work principal of each tenant, issued by the entry's own narrow work issuer. */
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
      { id: 'storage', plugin: 'storageRow', config: providerConfig(storageRoot) },
      { id: 'identity', plugin: 'identityStandIn' },
      { id: 'authorization', plugin: 'policyAccess' },
      {
        id: 'session-storage',
        plugin: 'sessionStorageRow',
        config: {
          combinationVersion: 'session-composite/4',
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

/**
 * Polls `read` until `done` holds. At the deadline it throws with what it waited for and the last
 * value it read, so a slow cold start reads as a timeout of a named wait, not as a later assertion.
 */
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

/** The production request source with the session snapshot that names the test scope. */
function requestSource(ctx: Context) {
  const snapshot = {
    contextScopes: [{ generation: '1', scope: SCOPE_REF.ref, operation: 'op', ended: null }],
  } as unknown as WorkSnapshot
  return createReleaseToolRequests({
    // The production read: the trusted verifier that the entry object `toolClock` hands over.
    verifier: () => toolRuntimeHolder(ctx).verifier(),
    catalog: () => ctx.get(toolCatalogKey),
    readWork: async () => succeed(snapshot),
    scopeBinding: () => ctx.get(executionScopeBindingKey),
    release: () => releaseOf(ctx),
  })
}

let positions = 0
async function requestFor(ctx: Context, principal: unknown, name: string, args: string) {
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
  const prepared = await source.prepare({
    ...input,
    definition: described.ok,
    admission: { owner: 'test', record: `admission-${positions}`, revision: '1', digest: 'd' },
  })
  if ('failure' in prepared) throw new Error(`prepare: ${JSON.stringify(prepared.failure)}`)
  return prepared.ok
}

/** Invokes, waits for the settled call, and reads the whole original result as text. */
async function call(runtime: Runtime, principal: unknown, request: ToolInvokeRequest) {
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

/** Registers tenant A, installs the result receiver and waits until the catalog lists the authors. */
async function ready(ctx: Context, saved: ToolDelivery<ToolMessageContentBlock>[]) {
  // The session create registers tenant A's domain with the combination that holds `tool`.
  const command = createCommand(TENANT_A, SESSION)
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
      const key = canonicalDigest(input.delivery.key)
      return succeed({
        key: input.delivery.key,
        evidence: { owner: '@omne-harness/agent', record: key, revision: '1', digest: key },
      })
    },
  }
  runtime.registerResultReceiver('@omne-harness/agent', receiver)
  const principal = ctx.get(WORK_A)
  // The release authors were preloaded by the tool-host row; wait until the catalog lists them.
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

/** Shell once, Files write and read once, then the same Shell call by tenant B's work principal. */
async function shellAndFiles(work: EntryObjectModule): Promise<Ran> {
  const { storageRoot } = workspace()
  const { rows, tools } = rowsOf(storageRoot)
  const policy = accessPolicyRow(allowAll)
  const saved: ToolDelivery<ToolMessageContentBlock>[] = []
  const { value, run } = await withLiveRows(
    {
      rows,
      plugins: {
        ...cordis,
        identityStandIn,
        residencyStandIn,
        policyAccess: policy.plugin,
      },
      entryObjects: entryObjects(work),
      probe: [toolRuntimeKey, toolCatalogKey, sessionTransactionsKey, WORK_A, WORK_B],
    },
    async ctx => {
      const { runtime, principal } = await ready(ctx, saved)
      // Files takes absolute paths inside the files root.
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
      // Delivery to the original consumer runs on its own worker after the call settles.
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
  expect(value.shell.text).toContain('tool-b-shell')
  expect(value.write.text).toMatch(/^done request=/u)
  expect(value.read.text).toContain('tool-b-files')
  expect(readFileSync(join(ran.filesRoot, 'tool-b.txt'), 'utf8')).toBe('tool-b-files')
  expect(value.foreign).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
  expect(ran.saved.length).toBeGreaterThanOrEqual(3)
  expect(ran.exitCode).toBe(0)
}

describe('Tool segment B: the release rows in one process composition', () => {
  it(
    'runs Shell once and Files twice through the production request source; another tenant is refused',
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
      const policy = accessPolicyRow(allowAll)
      const saved: ToolDelivery<ToolMessageContentBlock>[] = []
      const calls = 6
      const { value } = await withLiveRows(
        {
          rows,
          plugins: { ...cordis, identityStandIn, residencyStandIn, policyAccess: policy.plugin },
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

  // The files root here is the short-name spelling that `realpathSync` keeps for the temp directory, as
  // in the reported `setup --workspace` (R2-D374). The calls name the workspace in its long spelling.
  it.runIf(process.platform === 'win32')(
    'Windows: a workspace configured by its 8.3 short name runs Shell and Files with its long name; outside stays refused (R2-D374)',
    { timeout: 180_000 },
    async context => {
      const { storageRoot } = workspace()
      const { rows, tools } = rowsOf(storageRoot)
      const longRoot = realpathSync.native(tools.filesRoot)
      if (longRoot.toLowerCase() === tools.filesRoot.toLowerCase())
        context.skip('the temp directory has no 8.3 short spelling on this host')
      const child = join(longRoot, 'tank-battle')
      mkdirSync(child)
      const outside = join(dirname(longRoot), 'outside')
      mkdirSync(outside)
      const policy = accessPolicyRow(allowAll)
      const saved: ToolDelivery<ToolMessageContentBlock>[] = []
      const { value } = await withLiveRows(
        {
          rows,
          plugins: { ...cordis, identityStandIn, residencyStandIn, policyAccess: policy.plugin },
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
          return { inside, refused, write }
        },
      )
      expect(value.inside.state.terminal).toMatchObject({ kind: 'completed' })
      expect(value.inside.text).toContain('alias-inside')
      expect(value.inside.text).not.toContain('notAuthorized')
      expect(value.refused.text).toContain('notAuthorized')
      expect(value.refused.text).not.toMatch(/^alias-outside/mu)
      expect(value.write.text).toMatch(/^done request=/u)
      expect(readFileSync(join(child, 'alias.txt'), 'utf8')).toBe('alias-files')
    },
  )

  it(
    'with the release session ownership read and the release work principals, Shell and Files run; another tenant is refused',
    { timeout: 180_000 },
    async () => {
      expectRan(await shellAndFiles(sessionWorkPrincipals))
    },
  )
})
