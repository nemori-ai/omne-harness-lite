// 完整体检十项（入口契约 S-26；入口节点 design「完整体检十项从哪来」；https-json/1 S-21 的成员次序）。
// 每次读都现探、现读，不以上一次的结果顶替；不含任何治理事实与秘密的值。
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { type Storage, StorageDefect, narrow } from '@omne-harness-lite/storage'
import type { ServingNotice } from '@omne-harness-lite/governance-center-entry'
import { formatInstant } from './wire.ts'

/** 五项部署参数（S-26），各是正整数毫秒；两项 PF-003 的本版没有消费者（G-4），照样要值、照样可见。 */
export interface DeploymentParameters {
  readonly unactivatedRetention: number
  readonly invitationTtlDefault: number
  readonly affiliationRequestTtlDefault: number
  readonly copyNoticeTtlDefault: number
  readonly sharingInvitationTtlDefault: number
}

/** 现探数据所在的上界：超时即 `false`，那次读继续跑完、结果丢弃。 */
export const STORAGE_PROBE_TIMEOUT_MS = 2_000

interface ProbeTable {
  readonly governance_center: { readonly slot: string }
}

/** 部署密钥启动时载入的结果：装配在密钥载入与配对自检通过后给两个字面 `true`（缺了或不完整中心本来起不来）。 */
export interface DeploymentKeyLoad {
  readonly present: true
  readonly complete: true
}

export interface HealthSources {
  readonly storage: Storage
  readonly clock: Clock
  readonly deploymentKey: DeploymentKeyLoad
  readonly deploymentParameters: DeploymentParameters
  /** 读不到时的诊断出口：缺陷另记一条 error 记录，不计入 `defectCount`（那只数入口层 S-14 的缺陷）。 */
  readonly reportProbeDefect: (errorName: string) => void
}

/** `storageReachable`：一次只读事务读 `governance_center`，与超时竞速。 */
export async function probeStorage(sources: HealthSources): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), STORAGE_PROBE_TIMEOUT_MS)
  })
  const read = sources.storage
    .read(async tx => {
      await narrow<ProbeTable>(tx).selectFrom('governance_center').select('slot').limit(1).execute()
      return true
    })
    .catch((error: unknown) => {
      if (error instanceof StorageDefect) sources.reportProbeDefect(error.name)
      return false
    })
  try {
    return await Promise.race([read, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** `clockSane`：现读钟；读不到（含运行中回拨，时钟的提供者答 `'unavailable'`）或抛出 ⇒ `false`。 */
export function clockSane(clock: Clock): boolean {
  try {
    return clock.now() !== 'unavailable'
  } catch {
    return false
  }
}

/** 体按 `FullHealthReply` 的书写次序写出（https-json/1 S-12、S-21）。 */
export async function fullHealthBody(
  sources: HealthSources,
  notice: ServingNotice,
  defectCount: number,
): Promise<string> {
  const storageReachable = await probeStorage(sources)
  const parameters = sources.deploymentParameters
  return JSON.stringify({
    reachable: true,
    centerId: notice.centerId,
    version: notice.version,
    startedAt: formatInstant(notice.startedAt),
    storageReachable,
    deploymentKeyPresent: sources.deploymentKey.present,
    deploymentKeyComplete: sources.deploymentKey.complete,
    clockSane: clockSane(sources.clock),
    defectCount,
    deploymentParameters: {
      unactivatedRetention: parameters.unactivatedRetention,
      invitationTtlDefault: parameters.invitationTtlDefault,
      affiliationRequestTtlDefault: parameters.affiliationRequestTtlDefault,
      copyNoticeTtlDefault: parameters.copyNoticeTtlDefault,
      sharingInvitationTtlDefault: parameters.sharingInvitationTtlDefault,
    },
  })
}
