// 入口对象清单（DP1-C11）。每个入口对象一个文件 `src/entry/<对象>.ts`，这里只汇总。
// 本文件由线负责人单写（L1-06）：新增入口对象时加一条导入与一项清单元素。
// 名字取定义包的键常量；受信与否由受信表（`src/s0/aa-rows.json`）决定，模块不自报。
// `scopedRuntimeContextTrust` 与 `executionAuthorities` 共用一份按运行懒建的 Scope 来源（见 execution-wiring.ts）。
// 三个系统主体模块经受信名 `principalIssuer` 的服务签发，必须排在 `principalIssuer` 之后。
// `toolReleaseRegistrant` 与 `toolContributionAuthority` 共用一份按运行读取的发行快照，登记者排在权威之前。
// `toolClock` 与 Tool 运行时组的 bundle 共用同一个时钟实例（按运行的根共享）；`toolPublicationAuthority` 读同一份调用见证。
import type { EntryObjectModule } from '../types.ts'
import { agentClock } from './agent-clock.ts'
import { agentHostPrincipal } from './agent-host-principal.ts'
import { cursorSigning } from './cursor-signing.ts'
import { executionAuthorities, scopedRuntimeContextTrust } from './execution-wiring.ts'
import { identityClock } from './identity-clock.ts'
import {
  modelConverterAuthority,
  modelHostAuthority,
  modelPublicationAuthority,
} from './model-authorities.ts'
import { modelClock } from './model-clock.ts'
import { principalIssuer, principalVerifier, sessionPrincipals } from './principals.ts'
import { requestContextTrust } from './request-context-trust.ts'
import { sessionClock } from './session-clock.ts'
import { sessionCustodySource, sessionProductionSource } from './session-evidence-sources.ts'
import { sessionWorkPrincipals } from './session-work-principals.ts'
import { storageHost } from './storage-host.ts'
import { toolContributionAuthority, toolReleaseRegistrant } from './tool-release.ts'
import { toolResidencyPrincipal } from './tool-residency-principal.ts'
import { tenantDomainScannerPrincipal } from './tenant-domain-scanner.ts'
import { toolMaterialMaintainerPrincipal } from './tool-material-maintainer.ts'
import { toolClock, toolPublicationAuthority } from './tool-runtime-objects.ts'

export const entryObjects: readonly EntryObjectModule[] = [
  principalVerifier,
  principalIssuer,
  agentHostPrincipal,
  toolResidencyPrincipal,
  tenantDomainScannerPrincipal,
  toolMaterialMaintainerPrincipal,
  toolReleaseRegistrant,
  toolContributionAuthority,
  toolClock,
  toolPublicationAuthority,
  sessionPrincipals,
  sessionWorkPrincipals,
  requestContextTrust,
  scopedRuntimeContextTrust,
  ...executionAuthorities,
  sessionClock,
  sessionProductionSource,
  sessionCustodySource,
  agentClock,
  identityClock,
  modelClock,
  modelPublicationAuthority,
  modelConverterAuthority,
  modelHostAuthority,
  storageHost,
  cursorSigning,
]
