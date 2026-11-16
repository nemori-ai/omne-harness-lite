// 次序有约束：签发系统主体的模块排在 `principalIssuer` 之后；`toolReleaseRegistrant` 排在
// `toolContributionAuthority` 之前（两者共用一份按运行读取的发行快照）。
import type { EntryObjectModule } from '../types.ts'
import { agentClock } from './agent-clock.ts'
import { agentHostPrincipal } from './agent-host-principal.ts'
import { cursorSigning } from './cursor-signing.ts'
import { executionAuthorities, scopedRuntimeContextTrust } from './execution-wiring.ts'
import { identityClock } from './identity-clock.ts'
import { governanceInstallationPrincipals } from './governance-installation-principals.ts'
import { governanceDirectoryPrincipals } from './governance-directory-principals.ts'
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
import { sessionModesPrincipals } from './session-modes-principals.ts'
import { sessionWorkPrincipals } from './session-work-principals.ts'
import { storageHost } from './storage-host.ts'
import { toolContributionAuthority, toolReleaseRegistrant } from './tool-release.ts'
import { toolResidencyPrincipal } from './tool-residency-principal.ts'
import { tenantDomainScannerPrincipal } from './tenant-domain-scanner.ts'
import { toolClock, toolPublicationAuthority } from './tool-runtime-objects.ts'

export const entryObjects: readonly EntryObjectModule[] = [
  principalVerifier,
  principalIssuer,
  governanceDirectoryPrincipals,
  governanceInstallationPrincipals,
  agentHostPrincipal,
  toolResidencyPrincipal,
  tenantDomainScannerPrincipal,
  toolReleaseRegistrant,
  toolContributionAuthority,
  toolClock,
  toolPublicationAuthority,
  sessionPrincipals,
  sessionWorkPrincipals,
  sessionModesPrincipals,
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
