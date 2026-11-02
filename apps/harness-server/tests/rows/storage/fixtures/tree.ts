// 本闭包测试的装载夹具：以 `startTree` 装真实的 `storage` 行、`session-storage` 行、两个真实入口对象，以及
// `sessionAccessCheck` 的契约替身行（包装 `session-contract/testing` 的政策替身）。能看到根、受信名下的服务与在册句柄。
// 不导入 vitest：慢层的子进程脚本也用它。
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SessionAccessCheck, SessionCommand } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionId,
  testingTenant,
  type ScriptedSessionAccessCheck,
} from '@omne-harness/session-contract/testing'
import {
  SessionAccessCheckService,
  sessionAccessCheckKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { cursorSigning } from '../../../../src/entry/cursor-signing.ts'
import { storageHost } from '../../../../src/entry/storage-host.ts'
import { LifecycleRegistry, S0AssemblyLifecycleService } from '../../../../src/lifecycle.ts'
import {
  disposeTree,
  startTree,
  type EntryObject,
  type RowSpec,
  type StartResult,
} from '../../../../src/loader.ts'
import { serveProfile } from '../../../../src/profile.ts'
import { defineRow, rowDeclarationOf } from '../../../../src/row.ts'
import { sessionStorageRow } from '../../../../src/rows/session-storage/index.ts'
import { storageRow } from '../../../../src/rows/storage/index.ts'
import { monotonicClock, runShutdown, type ShutdownReport } from '../../../../src/shutdown.ts'
import { createTrust } from '../../../../src/trust.ts'
import type {
  EntryEnv,
  EntryObjectModule,
  LifecyclePhase,
  RowId,
  RowState,
  ServiceName,
  TreeRow,
} from '../../../../src/types.ts'

export const TENANT_A: TenantId = testingTenant(
  'org_app1st0rage000000000000000',
  'acc_app1st0rage000000000000000',
)
export const TENANT_B: TenantId = testingTenant(
  'org_app1st0r0ther0000000000000',
  'acc_app1st0r0ther0000000000000',
)

export function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('not a minted tenant')
  return encoded.value
}

/** sqlite-provider 规格 §12.1 的候选初值；关闭期限按测试缩短。 */
export function providerConfig(
  storageRoot: string,
  overrides: Partial<SqliteStorageConfig> = {},
): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes: 1048576,
    maxRequestBytes: 4194304,
    globalInFlightWriteBytes: 67108864,
    maxJsonDepth: 64,
    maxJsonMembers: 65536,
    maxResponseBytes: 65536,
    maxOperationResponseBytes: 1048576,
    globalWriteResponseBytes: 33554432,
    maxDiagnosticBytes: 4096,
    maxWorkers: 16,
    reservedWriterSlots: 4,
    maxReadWorkersPerDomain: 2,
    readQueuePerDomain: 32,
    readQueueGlobal: 256,
    readQueueTimeoutMs: 1000,
    maxReadInputBytes: 262144,
    maxReadResultBytes: 4194304,
    globalReadResultBytes: 33554432,
    readObservationMs: 2000,
    readerIdleMs: 30000,
    queryQueuePerDomain: 16,
    queryQueueGlobal: 64,
    controlQueuePerDomain: 8,
    controlQueueGlobal: 32,
    writesPerControlTurn: 4,
    groupMaxOperations: 8,
    groupCollectMs: 1,
    groupMaxInputBytes: 4194304,
    groupMaxResponseReservationBytes: 8388608,
    groupMaxExecutionSliceMs: 5,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 67108864,
    checkpointIntervalMs: 1000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closeDeadlineMs: 3000,
    ...overrides,
  }
}

export type AccessPolicy = Parameters<typeof createPolicySessionAccessCheck<string>>[0]

/** 放行一切的政策；测试按需换成拒绝某操作或某租户的政策。 */
export const allowAll: AccessPolicy = request => ({
  kind: 'allowed',
  evidence: evidence(`access/${request.operation}`),
})

/**
 * `sessionAccessCheck` 的契约替身行：行 id `authorization`，只提供这一个键。替身来自
 * `session-contract/testing`，没有业务持久性。
 */
export function accessPolicyRow(policy: AccessPolicy): Readonly<{
  plugin: Plugin.Object
  check: ScriptedSessionAccessCheck<string>
}> {
  const check = createPolicySessionAccessCheck<string>(policy)
  class PolicyAccessCheck extends SessionAccessCheckService<string> {
    readonly check: SessionAccessCheck<string>['check'] = request => check.check(request)
  }
  const plugin = defineRow({
    row: 'authorization',
    implementation: 'contract-double',
    manifest: { provides: [sessionAccessCheckKey], injects: [], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'policy-access-check',
      apply(ctx: Context) {
        new PolicyAccessCheck(ctx)
      },
    },
  })
  return { plugin, check }
}

export function treeRow(id: string, plugin: string, config: unknown = {}): TreeRow {
  return { id: id as RowId, plugin, config, source: 'distribution' }
}

/** 真实导出的 RowSpec，按 `runServe` 的办法从声明读回。 */
export function declared(plugin: Plugin, config: unknown = {}): RowSpec {
  const declaration = rowDeclarationOf(plugin)
  if (declaration === undefined) throw new Error('not a declared row')
  const via = declaration.lifecycle.kind === 'entry-object' ? declaration.lifecycle.via : null
  return {
    row: treeRow(declaration.row, 'declared', config),
    manifest: declaration.manifest,
    plugin,
    implementation: declaration.implementation,
    declared: { row: declaration.row, via },
  }
}

export type SessionStorageRowConfigInput = Readonly<{
  combinationVersion: string
  directoryFile: string
  domainRule: 'organization-account/1'
}>

export type TreeOptions = Readonly<{
  stateRoot: string
  storageRoot: string
  directoryFile: string
  policy?: AccessPolicy
  combinationVersion?: string
  closeDeadlineMs?: number
  /** 替换预期登记阶段（用来触发 `phase-mismatch`）。 */
  expected?: ReadonlyMap<RowId, LifecyclePhase>
  entryObjects?: readonly EntryObjectModule[]
  /** 不装 `session-storage` 行。 */
  withoutSessionStorage?: boolean
}>

export type LoadedTree = Readonly<{
  root: Context
  result: StartResult
  registry: LifecycleRegistry
  expected: ReadonlyMap<RowId, LifecyclePhase>
  check: ScriptedSessionAccessCheck<string>
  /** 根上的公开服务。 */
  service<T>(name: ServiceName): T
  /** 受信名下的服务（入口自己按名读取）。 */
  trusted<T>(name: ServiceName): T
  state(id: string): RowState
  shutdown(deadlineMs?: number): Promise<ShutdownReport>
  dispose(): Promise<void>
}>

export async function loadStorageTree(options: TreeOptions): Promise<LoadedTree> {
  const profile = serveProfile()
  const policyRow = accessPolicyRow(options.policy ?? allowAll)
  const sessionStorageConfig: SessionStorageRowConfigInput = {
    combinationVersion: options.combinationVersion ?? 'session-composite/1',
    directoryFile: options.directoryFile,
    domainRule: 'organization-account/1',
  }
  const specs: RowSpec[] = [
    declared(
      storageRow,
      providerConfig(options.storageRoot, {
        closeDeadlineMs: options.closeDeadlineMs ?? 3000,
      }),
    ),
    declared(policyRow.plugin),
    ...(options.withoutSessionStorage ? [] : [declared(sessionStorageRow, sessionStorageConfig)]),
  ]
  const root = new Context()
  const trust = createTrust(
    [...new Set([...profile.visibility.values()].flat())].map(name => ({
      id: name,
      names: [name],
    })),
    profile.visibility,
  )
  const expected = new Map<RowId, LifecyclePhase>()
  for (const spec of specs) {
    if (spec.manifest.phase !== null) expected.set(spec.row.id, spec.manifest.phase)
  }
  const effective = options.expected ?? expected
  const registry = new LifecycleRegistry({
    expected: effective,
    clock: monotonicClock,
    requestStop: () => {},
  })
  await root.plugin(S0AssemblyLifecycleService, registry)
  const made = new Map<symbol, unknown>()
  const env: EntryEnv = {
    stateRoot: options.stateRoot,
    readTrusted: name => trust.contextForName(root, name),
    once: <T>(key: symbol, create: () => T): T => {
      if (!made.has(key)) made.set(key, create())
      return made.get(key) as T
    },
  }
  const modules = options.entryObjects ?? [storageHost, cursorSigning]
  const entryObjects: EntryObject[] = modules.map(module => ({
    name: module.name,
    implementation: module.implementation,
    registersFor: module.registersFor ?? [],
    install: scope => module.install(scope, env),
  }))
  const result = await startTree({
    root,
    trust,
    rows: specs,
    entryObjects,
    readinessTimeoutMs: 10_000,
    barrier: () => {},
  })
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    if (result.kind === 'started') await disposeTree(root, result.rows)
    else await root.fiber.dispose()
  }
  return {
    root,
    result,
    registry,
    expected: effective,
    check: policyRow.check,
    service: <T>(name: ServiceName): T => root.get(name) as T,
    trusted: <T>(name: ServiceName): T => trust.contextForName(root, name).get(name) as T,
    state: id => {
      if (result.kind !== 'started') throw new Error(`tree not started: ${result.kind}`)
      const found = result.report.rows.find(row => row.id === id)
      if (found === undefined) throw new Error(`no row ${id}`)
      return found
    },
    shutdown: (deadlineMs = 5000) =>
      runShutdown(registry, effective, deadlineMs, monotonicClock, { disposeRoot: dispose }),
    dispose,
  }
}

export type CreateCommand = Extract<SessionCommand, { kind: 'create' }>

export function createCommand(tenant: TenantId, session: string): CreateCommand {
  return {
    kind: 'create',
    input: {
      tenant,
      session: sessionId(session),
      operation: operationId(`create-${session}`),
      creation: creation(),
    },
  }
}

export function createGuards(command: CreateCommand) {
  return [
    initializationFixtureGuard(
      initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
    ),
  ]
}

export const access = (tenant: TenantId, session: string) => ({
  principal: 'tester',
  tenant,
  session: sessionId(session),
})
