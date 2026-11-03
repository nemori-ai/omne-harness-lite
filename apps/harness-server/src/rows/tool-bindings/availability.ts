// 发行内置作者的可用性事实（简报 B3-T2a 第 5 项，L-TOOL 事实清单 §1）。每项只取已核来源：
// - 主体与租户：经 `principalVerifier` 核验的 Session 工作主体，租户与调用一致；做不到答 unavailable。
// - 定义：官方层，名字、规范化摘要都与受信快照的条目相等；不在快照里答 qualification denied。
// - 消费者：只认发行清单确认的文本消费者材料，三项证据全等；陌生材料或缺来源答 unavailable。
// - dependencies：environment 声明的 facility 逐项报告。A 段没有落点与设施的可用性来源，如实报 `false`。
// - input/output/attachments：按固定定义与确认的文本消费者能力判断。
import type { Context } from '@deepseek-ai/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolConsumerProfile, ToolDefinition } from '@omne-harness/tool-contract'
import type { LocalToolAvailabilitySource } from '@omne-harness/tool-host-local'
import { releaseOf } from '../../entry/tool-release.ts'
import type { ToolReleaseManifest } from '../../entry/tool-release-manifest.ts'
import { classify } from '../authorization/principals.ts'

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-availability', diagnostic })

const denied = succeed({
  qualification: 'denied' as const,
  dependencies: [],
  inputCompatible: false,
  outputCompatible: false,
  attachmentsReadable: false,
})

/** environment 声明的 facility 列表；不是 `{ facilities: string[] }` 形状时为 undefined。 */
function declaredFacilities(definition: ToolDefinition): readonly string[] | undefined {
  const environment = definition.declarations.environment
  if (environment === null) return []
  const value = environment.value
  if (value.kind !== 'object') return undefined
  const facilities = value.entries.find(entry => entry.key === 'facilities')?.value
  if (facilities?.kind !== 'array') return undefined
  const names: string[] = []
  for (const item of facilities.items) {
    if (item.kind !== 'string') return undefined
    names.push(item.value)
  }
  return names
}

/** 消费者材料与发行确认的文本消费者全等（三项证据逐字段，conversion 为 null）。 */
function confirmedTextConsumer(
  consumer: ToolConsumerProfile,
  confirmed: ToolReleaseManifest['consumer'],
): boolean {
  return (
    canonicalDigest({
      capabilities: consumer.capabilities,
      conversion: consumer.conversion,
      attachmentAccess: consumer.attachmentAccess,
    }) ===
    canonicalDigest({
      capabilities: confirmed.capabilities,
      conversion: confirmed.conversion,
      attachmentAccess: confirmed.attachmentAccess,
    })
  )
}

export function createReleaseAvailability(ctx: Context): LocalToolAvailabilitySource<unknown> {
  const source: LocalToolAvailabilitySource<unknown> = {
    async judge({ principal, tenant, definition, layer, consumer }) {
      try {
        const release = releaseOf(ctx)
        if (release.kind !== 'trusted') return unavailable('release snapshot unavailable')
        const verifier: PrincipalVerifier | undefined = ctx.get(principalVerifierKey)
        if (verifier === undefined) return unavailable('principal verifier absent')
        const verified = await verifier.verify(principal)
        if (verified.kind !== 'verified') return unavailable('principal is not verified')
        const who = classify(verified.principal)
        if (
          who?.column !== 'work' ||
          !tenantCodec.encode(tenant).ok ||
          !tenantEquals(who.principal.tenant, tenant)
        )
          return unavailable('not a session work principal of this tenant')
        const digest = canonicalDigest(definition)
        const entry = release.manifest.entries.find(
          candidate =>
            layer.kind === 'official' &&
            candidate.asset.name === definition.name &&
            candidate.definition === digest,
        )
        if (entry === undefined) return denied
        const confirmed = release.manifest.consumer
        if (!confirmedTextConsumer(consumer, confirmed))
          return unavailable('consumer material is not a confirmed text consumer')
        const facilities = declaredFacilities(definition)
        if (facilities === undefined) return unavailable('environment declaration is unreadable')
        const { declarations } = definition
        const consumerReads = new Set<string>(confirmed.input)
        const consumerWrites = new Set<string>(confirmed.output)
        return succeed({
          qualification: 'allowed' as const,
          // No placement or facility availability source exists before segment B.
          dependencies: facilities.map(name => ({ name: `facility:${name}`, available: false })),
          inputCompatible: declarations.inputModalities.every(m => consumerWrites.has(m)),
          outputCompatible: declarations.outputModalities.every(m => consumerReads.has(m)),
          attachmentsReadable: declarations.attachments.length === 0,
        })
      } catch {
        return unavailable('availability judgement failed')
      }
    },
  }
  return Object.freeze(source)
}
