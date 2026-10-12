// config 的来源与解析（design「存储 config 的来源」「密钥装配」「其余 config」「入口层与运维面的装配」）：
// 环境变量／文件 → 值。本模块只做「文本 → 值」与「有没有、二义、读得到、权限」；形状与为正归各插件 Config，
// 跨插件的配对归 keys.ts。任一不成 ⇒ `HostStartupFailure('config')`，说明点名变量、不含值。
import { open } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { LEASE_WIDTH_MS } from '@omne-harness-lite/clock-lease'
import { isOk } from '@omne-harness-lite/identity-values'
import { parseOfferTtl } from '@omne-harness-lite/offer-expiry'
import { HostStartupFailure } from './failure.ts'

/** 进程环境的只读视图（测试传自己的对象）。 */
export type HostEnv = Readonly<Record<string, string | undefined>>

export const ENV = {
  storageDialect: 'OMNE_TENANCY_STORAGE_DIALECT',
  storageFile: 'OMNE_TENANCY_STORAGE_FILE',
  storageUrl: 'OMNE_TENANCY_STORAGE_URL',
  activationSigningKey: 'OMNE_TENANCY_ACTIVATION_SIGNING_KEY_PEM',
  activationVerificationKey: 'OMNE_TENANCY_ACTIVATION_VERIFICATION_KEY_PEM',
  purgeSigningKey: 'OMNE_TENANCY_PURGE_SIGNING_KEY_PEM',
  purgeVerificationKey: 'OMNE_TENANCY_PURGE_VERIFICATION_KEY_PEM',
  unactivatedRetention: 'OMNE_TENANCY_UNACTIVATED_RETENTION',
  invitationTtlDefault: 'OMNE_TENANCY_INVITATION_TTL_DEFAULT',
  affiliationRequestTtlDefault: 'OMNE_TENANCY_AFFILIATION_REQUEST_TTL_DEFAULT',
  teamCreationKeyRetention: 'OMNE_TENANCY_TEAM_CREATION_KEY_RETENTION',
  copyNoticeTtlDefault: 'OMNE_TENANCY_COPY_NOTICE_TTL_DEFAULT',
  sharingInvitationTtlDefault: 'OMNE_TENANCY_SHARING_INVITATION_TTL_DEFAULT',
  clockReadyTimeout: 'OMNE_TENANCY_CLOCK_READY_TIMEOUT',
  clockInitialize: 'OMNE_TENANCY_CLOCK_INITIALIZE',
  credentialPolicy: 'OMNE_TENANCY_CREDENTIAL_POLICY',
  entryListen: 'OMNE_TENANCY_ENTRY_LISTEN',
  entryTlsCertChain: 'OMNE_TENANCY_ENTRY_TLS_CERT_CHAIN_PEM',
  entryTlsPrivateKey: 'OMNE_TENANCY_ENTRY_TLS_PRIVATE_KEY_PEM',
  opsSocketDirectory: 'OMNE_TENANCY_OPS_SOCKET_DIR',
  backupDirectory: 'OMNE_TENANCY_BACKUP_DIR',
} as const

/** `_FILE` 惯例：`X` 给文本本身，`X_FILE` 给文件路径，恰设其一。 */
export const FILE_SUFFIX = '_FILE'

export type StorageSource =
  | { readonly dialect: 'sqlite'; readonly file: string }
  | { readonly dialect: 'postgres'; readonly connectionString: string }

/** 四份部署密钥（PEM 文本）；只交给持钥插件与核实插件的 config，不进任何服务。 */
export interface DeploymentKeyPems {
  readonly activationSigningKeyPem: string
  readonly activationVerificationKeyPem: string
  readonly purgeSigningKeyPem: string
  readonly purgeVerificationKeyPem: string
}

/** 五项部署参数（PF-017「部署参数」），正整数毫秒；同一组值交给 AI／OG 与运维面。 */
export interface DeploymentParameterValues {
  readonly unactivatedRetention: number
  readonly invitationTtlDefault: number
  readonly affiliationRequestTtlDefault: number
  readonly copyNoticeTtlDefault: number
  readonly sharingInvitationTtlDefault: number
}

export interface HostConfig {
  readonly storage: StorageSource
  readonly initializeClock?: boolean
  readonly keys: DeploymentKeyPems
  readonly parameters: DeploymentParameterValues
  /** 不是部署参数，只给 OG。 */
  readonly teamCreationKeyRetention: number
  /** JSON 解析后的政策值；缺席即 `undefined`（契约 S-27：不是启动失败）。形状归 credential-verification。 */
  readonly credentialPolicy: unknown
  readonly clockReadyTimeoutMs: number
  readonly entry: {
    readonly listen: { readonly host: string; readonly port: number }
    readonly tls: { readonly certificateChainPem: string; readonly privateKeyPem: string }
  }
  readonly opsSocketDirectory: string
  readonly backupDirectory?: string
}

function configFailure(item: string, reason: string): HostStartupFailure {
  return new HostStartupFailure('config', `${item}: ${reason}`, { item })
}

/** 空串按未设处理（容器编排常把缺席的变量写成空值）。 */
function present(env: HostEnv, name: string): string | undefined {
  const value = env[name]
  return value === undefined || value === '' ? undefined : value
}

function required(env: HostEnv, name: string): string {
  const value = present(env, name)
  if (value === undefined) throw configFailure(name, 'missing')
  return value
}

function errorCode(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'unknown error'
}

/**
 * 一份 PEM 的来源：恰一个——两个都缺 ⇒ 缺；两个都设 ⇒ 二义；文件读不到 ⇒ 读不到；
 * `ownerOnly` 时文件对 group／other 可读 ⇒ 权限过宽（DSH 先例 `0600`）。先打开再对同一句柄 `stat`，不查一个路径读另一个文件。
 */
export async function readPemSource(
  env: HostEnv,
  variable: string,
  ownerOnly: boolean,
): Promise<string> {
  const inline = present(env, variable)
  const fileVariable = `${variable}${FILE_SUFFIX}`
  const path = present(env, fileVariable)
  if (inline === undefined && path === undefined)
    throw configFailure(variable, `missing: set ${variable} or ${fileVariable}`)
  if (inline !== undefined && path !== undefined)
    throw configFailure(variable, `ambiguous: both ${variable} and ${fileVariable} are set`)
  if (inline !== undefined) return inline
  if (path === undefined) throw configFailure(variable, 'missing')
  let handle
  try {
    handle = await open(path, 'r')
  } catch (error) {
    throw configFailure(fileVariable, `the file cannot be opened (${errorCode(error)})`)
  }
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw configFailure(fileVariable, 'not a regular file')
    if (ownerOnly && (info.mode & 0o044) !== 0)
      throw configFailure(
        fileVariable,
        'the file is readable by group or others; restrict it to its owner (0600)',
      )
    return await handle.readFile('utf8')
  } catch (error) {
    if (error instanceof HostStartupFailure) throw error
    throw configFailure(fileVariable, `the file cannot be read (${errorCode(error)})`)
  } finally {
    await handle.close()
  }
}

/** 时长：正整数毫秒（纯数字）或 ISO 8601 时长；判据是 offer-expiry 的 `parseOfferTtl`，不自造第二个解析器。 */
function duration(env: HostEnv, name: string): number {
  const text = required(env, name)
  const parsed = parseOfferTtl(/^[0-9]+$/.test(text) ? Number(text) : text)
  if (!isOk(parsed))
    throw configFailure(
      name,
      'not a positive duration (milliseconds, or an ISO 8601 duration such as P7D)',
    )
  return parsed.ok
}

function storageSource(env: HostEnv): StorageSource {
  const dialect = present(env, ENV.storageDialect) ?? 'sqlite'
  if (dialect === 'sqlite') return { dialect, file: required(env, ENV.storageFile) }
  if (dialect === 'postgres') return { dialect, connectionString: required(env, ENV.storageUrl) }
  throw configFailure(ENV.storageDialect, 'unknown dialect (expected sqlite or postgres)')
}

/** `host:port`，IPv6 写成 `[addr]:port`；不设默认端口。端口 0 由系统分配（入口层 Config 接受，只用于测试）。 */
function listenAddress(env: HostEnv): { readonly host: string; readonly port: number } {
  const text = required(env, ENV.entryListen)
  const match = /^(?:\[([^\]]+)\]|([^:[\]]+)):([0-9]{1,5})$/.exec(text)
  const host = match?.[1] ?? match?.[2]
  const port = Number(match?.[3])
  if (host === undefined || !Number.isInteger(port) || port > 65_535)
    throw configFailure(ENV.entryListen, 'not a host:port address')
  return { host, port }
}

function credentialPolicy(env: HostEnv): unknown {
  const text = present(env, ENV.credentialPolicy)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw configFailure(ENV.credentialPolicy, 'not valid JSON')
  }
}

/**
 * 等钟可读的上界必须严格大于时钟的租约宽度：崩溃后快速重启落在旧租约窗口里时钟至多这么久读不到，
 * 界不大于它，快速重启就必然启动失败（design「其余 config」）。
 */
function clockReadyTimeout(env: HostEnv): number {
  const value = duration(env, ENV.clockReadyTimeout)
  if (value <= LEASE_WIDTH_MS)
    throw configFailure(
      ENV.clockReadyTimeout,
      `must be greater than the clock lease width (${String(LEASE_WIDTH_MS)} ms)`,
    )
  return value
}

function initializeClock(env: HostEnv): boolean {
  const value = present(env, ENV.clockInitialize)
  if (value === undefined || value === '0') return false
  if (value === '1') return true
  throw configFailure(ENV.clockInitialize, 'must be 0 or 1')
}

/** 读全部 config。次序固定，第一个不成立的项即失败；不碰数据、不起 Context 之外的任何东西。 */
export async function readHostConfig(env: HostEnv): Promise<HostConfig> {
  const storage = storageSource(env)
  const keys: DeploymentKeyPems = {
    activationSigningKeyPem: await readPemSource(env, ENV.activationSigningKey, true),
    activationVerificationKeyPem: await readPemSource(env, ENV.activationVerificationKey, true),
    purgeSigningKeyPem: await readPemSource(env, ENV.purgeSigningKey, true),
    purgeVerificationKeyPem: await readPemSource(env, ENV.purgeVerificationKey, true),
  }
  const parameters: DeploymentParameterValues = {
    unactivatedRetention: duration(env, ENV.unactivatedRetention),
    invitationTtlDefault: duration(env, ENV.invitationTtlDefault),
    affiliationRequestTtlDefault: duration(env, ENV.affiliationRequestTtlDefault),
    copyNoticeTtlDefault: duration(env, ENV.copyNoticeTtlDefault),
    sharingInvitationTtlDefault: duration(env, ENV.sharingInvitationTtlDefault),
  }
  const teamCreationKeyRetention = duration(env, ENV.teamCreationKeyRetention)
  const policy = credentialPolicy(env)
  const clockReadyTimeoutMs = clockReadyTimeout(env)
  const listen = listenAddress(env)
  const certificateChainPem = await readPemSource(env, ENV.entryTlsCertChain, false)
  const privateKeyPem = await readPemSource(env, ENV.entryTlsPrivateKey, true)
  const opsSocketDirectory = required(env, ENV.opsSocketDirectory)
  const backupDirectory = env[ENV.backupDirectory]
  if (backupDirectory !== undefined && !isAbsolute(backupDirectory))
    throw configFailure(ENV.backupDirectory, 'must be an absolute path')
  return {
    storage,
    ...(initializeClock(env) ? { initializeClock: true } : {}),
    keys,
    parameters,
    teamCreationKeyRetention,
    credentialPolicy: policy,
    clockReadyTimeoutMs,
    entry: { listen, tls: { certificateChainPem, privateKeyPem } },
    opsSocketDirectory,
    ...(backupDirectory === undefined ? {} : { backupDirectory }),
  }
}
