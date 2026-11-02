// 入口对象清单（DP1-C11）。每个入口对象一个文件 `src/entry/<对象>.ts`，这里只汇总。
// 本文件由线负责人单写（L1-06）：新增入口对象时加一条导入与一项清单元素。
// 名字取定义包的键常量；受信与否由受信表（`src/s0/aa-rows.json`）决定，模块不自报。
// 两个系统主体模块经受信名 `principalIssuer` 的服务签发，必须排在 `principalIssuer` 之后。
import type { EntryObjectModule } from '../types.ts'
import { agentClock } from './agent-clock.ts'
import { agentHostPrincipal } from './agent-host-principal.ts'
import { cursorSigning } from './cursor-signing.ts'
import { identityClock } from './identity-clock.ts'
import {
  modelConverterAuthority,
  modelHostAuthority,
  modelPublicationAuthority,
} from './model-authorities.ts'
import { modelClock } from './model-clock.ts'
import { principalIssuer, principalVerifier, sessionPrincipals } from './principals.ts'
import { requestContextTrust } from './request-context-trust.ts'
import { runtimeContextTrust } from './runtime-context-trust.ts'
import { sessionClock } from './session-clock.ts'
import { sessionCustodySource, sessionProductionSource } from './session-evidence-sources.ts'
import { sessionWorkPrincipals } from './session-work-principals.ts'
import { storageHost } from './storage-host.ts'
import { toolResidencyPrincipal } from './tool-residency-principal.ts'

export const entryObjects: readonly EntryObjectModule[] = [
  principalVerifier,
  principalIssuer,
  agentHostPrincipal,
  toolResidencyPrincipal,
  sessionPrincipals,
  sessionWorkPrincipals,
  requestContextTrust,
  runtimeContextTrust,
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
