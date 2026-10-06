// 完整体检十项（入口契约 S-26；入口节点 design「完整体检十项从哪来」；https-json/1 S-21 的成员次序）。
// 每次读都现探、现读，不以上一次的结果顶替；不含任何治理事实与秘密的值。
import type { Clock } from '@omne-harness-lite/offer-expiry'
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

/** 部署密钥启动时载入的结果：装配在密钥载入与配对自检通过后给两个字面 `true`（缺了或不完整中心本来起不来）。 */
export interface DeploymentKeyLoad {
  readonly present: true
  readonly complete: true
}

export interface HealthSources {
  readonly clock: Clock
  readonly deploymentKey: DeploymentKeyLoad
  readonly deploymentParameters: DeploymentParameters
  probe(): Promise<boolean>
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
  const storageReachable = await sources.probe()
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
