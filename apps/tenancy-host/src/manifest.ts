// 装载清单与顺序（design「装载清单与顺序」「选择与动作链」）：一个根 Context、八条 fiber，顺序 = 依赖序，
// 运维面与入口层在最后、运维面在前（撤除时入口层先撤，它发的 `stopped` 运维面还在听）。每一项都指回 design 选择表的一行。
import { join } from 'node:path'
import { hostSnapshotChecks } from './snapshot-checks.ts'
import type { Plugin } from '@deepseek-ai/cordis'
import { accountIdentityPlugin } from '@omne-harness-lite/account-identity'
import { registrationPlugin } from '@omne-harness-lite/account-registration'
import { clockPlugin } from '@omne-harness-lite/clock'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification'
import {
  type GovernanceCenterEntryConfig,
  type GovernanceCenterOpsConfig,
  governanceCenterEntryPlugin,
  governanceCenterOpsPlugin,
} from '@omne-harness-lite/governance-center-entry'
import { organizationGovernancePlugin } from '@omne-harness-lite/organization-governance'
import type { PreflightCheck } from '@omne-harness-lite/storage'
import {
  type StorageSqlConfig,
  type UpgradeGuard,
  storageSqlPlugin,
} from '@omne-harness-lite/storage-sql'
import type { MigrationProvider } from 'kysely/migration'
import type { HostConfig } from './config.ts'
import { HOST_VERSION } from './version.ts'

/** 八条 fiber 的名字（= 各插件的 `name`），按装载次序。 */
export const HOST_PLUGIN_NAMES = [
  'storage-sql',
  'clock',
  'credential-verification',
  'account-identity',
  'organization-governance',
  'account-registration',
  'governance-center-ops',
  'governance-center-entry',
] as const

export type HostPluginName = (typeof HOST_PLUGIN_NAMES)[number]

export interface ManifestEntry {
  readonly name: HostPluginName
  readonly plugin: Plugin
  readonly config: unknown
}

/** 停机排空上界（入口层 `drainTimeoutMs`）：有界网络排空，不代表维护工作结束。 */
export const DRAIN_TIMEOUT_MS = 10_000
/** 停止诊断阈值：只记录still-stopping，随后继续等待真实撤除。 */
export const DISPOSE_TIMEOUT_MS = 30_000
/** 兑现 `openSignal` 之后等 `serving` 的余量：上界 = `clockReadyTimeoutMs` + 它（盖住入口层开闸时那一次再读钟）。 */
export const SERVING_GRACE_MS = 1_000

/** 装配运行时对象：只能由 `boot()` 在装载时构造，不来自环境变量。 */
export interface ManifestRuntime {
  readonly migrations: MigrationProvider
  readonly checks: readonly PreflightCheck[]
  readonly guard: UpgradeGuard
  readonly openSignal: PromiseLike<unknown>
  readonly maintenance: {
    readonly backupDirectory: string
    readonly sourceBuildId: string | null
    readonly migrationNames: readonly string[]
    readonly storageClosed: (status: 'clean' | 'error') => void
    readonly controllerClosed: (status: 'clean' | 'error') => void
  }
}

/**
 * 由已解析的 config 与运行时对象构造清单。密钥只进三个 config：AR←activation 私钥、OG←purge 私钥、AI←两把公钥；
 * TLS 材料只进入口层；运维面的 config 里没有任何 PEM、没有任何服务句柄。存储与时钟各恰一份。
 */
export function buildManifest(
  config: HostConfig,
  runtime: ManifestRuntime,
): readonly ManifestEntry[] {
  if (config.storage.dialect !== 'sqlite')
    throw new Error(
      'tenancy-host: bounded governance currently requires SQLite; PostgreSQL composition is not supported',
    )
  const storage: StorageSqlConfig = {
    dialect: 'sqlite',
    file: config.storage.file,
    synchronous: 'full',
    migrations: runtime.migrations,
    upgrade: { checks: [...runtime.checks], guard: runtime.guard },
    maintenance: {
      workDirectory: join(runtime.maintenance.backupDirectory, '.quarantine'),
      onClosed: runtime.maintenance.storageClosed,
    },
  }
  const ops: GovernanceCenterOpsConfig = {
    socketDirectory: config.opsSocketDirectory,
    // 配对自检通过才走到这里：四份都有来源即「在」，都合形状且两对都配对即「完整」
    deploymentKey: { present: true, complete: true },
    deploymentParameters: { ...config.parameters },
    maintenance: {
      backupDirectory: runtime.maintenance.backupDirectory,
      sourceBuildId: runtime.maintenance.sourceBuildId,
      migrationNames: runtime.maintenance.migrationNames,
      snapshotChecks: hostSnapshotChecks,
      onClosed: runtime.maintenance.controllerClosed,
    },
  }
  const entry: GovernanceCenterEntryConfig = {
    listen: config.entry.listen,
    tls: config.entry.tls,
    version: HOST_VERSION,
    drainTimeoutMs: DRAIN_TIMEOUT_MS,
    clockReadyTimeoutMs: config.clockReadyTimeoutMs,
    openSignal: runtime.openSignal,
  }
  return [
    { name: 'storage-sql', plugin: storageSqlPlugin, config: storage },
    { name: 'clock', plugin: clockPlugin, config: {} },
    // scrypt 参数取 credential-verification 的缺省（OWASP 最低建议）；本版没有来源变量
    { name: 'credential-verification', plugin: credentialsPlugin, config: {} },
    {
      name: 'account-identity',
      plugin: accountIdentityPlugin,
      config: {
        // 缺席也显式写出键、值为 undefined：AI 的 Config 在键不存在时报「expected nonoptional」而拒启动（已报主线），
        // 键在、值为 undefined 才是契约 S-27 的「取不到 ⇒ credential-rejected」
        credentialPolicy: config.credentialPolicy,
        unactivatedRetention: config.parameters.unactivatedRetention,
        activationVerificationKeyPem: config.keys.activationVerificationKeyPem,
        purgeVerificationKeyPem: config.keys.purgeVerificationKeyPem,
      },
    },
    {
      name: 'organization-governance',
      plugin: organizationGovernancePlugin,
      config: {
        invitationTtlDefault: config.parameters.invitationTtlDefault,
        affiliationRequestTtlDefault: config.parameters.affiliationRequestTtlDefault,
        teamCreationKeyRetention: config.teamCreationKeyRetention,
        purgeSigningKeyPem: config.keys.purgeSigningKeyPem,
      },
    },
    {
      name: 'account-registration',
      plugin: registrationPlugin,
      config: { activationSigningKeyPem: config.keys.activationSigningKeyPem },
    },
    { name: 'governance-center-ops', plugin: governanceCenterOpsPlugin, config: ops },
    { name: 'governance-center-entry', plugin: governanceCenterEntryPlugin, config: entry },
  ]
}
