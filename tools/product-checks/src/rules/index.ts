// 本仓库的产品规则：契约与节点 verification 点名的结构检查。规则引擎归 src/core/scan.ts。
import type { Rule } from '@omne-harness/repo-toolchain/core/rule'
import { aiR8NoCredentialInWrite } from './ai-r8-no-credential-in-write.ts'
import { credentialsParseOnly } from './credentials-parse-only.ts'
import { corePureImports } from './core-pure-imports.ts'
import {
  bodyProjectionInputs,
  parameterJudgeCacheOwner,
  singleToolArgumentParser,
} from './core-scoped.ts'
import {
  identityAccountReferences,
  identityDecisionInputs,
  identityScopeColumns,
} from './identity-shapes.ts'
import { noBailControl } from './no-bail-control.ts'
import { noDialectBypass } from './no-dialect-bypass.ts'
import { noNetworkListenInTenancy } from './no-network-listen-in-tenancy.ts'
import { noPeerAddress } from './no-peer-address.ts'
import { noPresentationInDiagnostics } from './no-presentation-in-diagnostics.ts'
import { noRandomSourceInline } from './no-random-source-inline.ts'
import { createNoTestingImport, noTestingImport } from './no-testing-import.ts'
import { collectTestingEntries } from '../testing-entries.ts'
import { noWallClock } from './no-wall-clock.ts'
import { ogS42DynamicResolve } from './og-s42-dynamic-resolve.ts'
import { opsEventWhitelist } from './ops-event-whitelist.ts'
import { opsImportWhitelist } from './ops-import-whitelist.ts'
import { presentationOnlyAuthn } from './presentation-only-authn.ts'
import { restrictedCallSites } from './restricted-call-sites.ts'
import { scCv1 } from './sc-cv-1.ts'
import { scOe1, scOe2 } from './sc-oe.ts'
import { singleTableEntry } from './single-table-entry.ts'
import { terminalOutcomeClosed } from './terminal-outcome-closed.ts'

export { modelCredentialBoundary } from './model-credential-boundary.ts'
export { CORE_PURE_DEPENDENCIES, PUBLIC_SUBPATHS } from './core-pure-imports.ts'
export {
  createBodyProjectionInputs,
  createParameterJudgeCacheOwner,
  createSingleToolArgumentParser,
  createModelToolNameOrigin,
  createMessageCreatedAtOrder,
  type CoreFunctionTarget,
  type BodyProjectionTarget,
  type ParameterCacheTarget,
  type ToolArgumentParserInputs,
  type ModelToolNameOriginTarget,
  CORE_BODY_PROJECTION_TARGETS,
  CORE_PARAMETER_CACHE_TARGET,
  CORE_TOOL_ARGUMENT_PARSER_INPUTS,
} from './core-scoped.ts'
export {
  createIdentityDecisionInputs,
  IDENTITY_CHECK_INPUTS,
  type IdentityCheckInputs,
  type IdentityDecisionTarget,
} from './identity-shapes.ts'
export {
  aiR8NoCredentialInWrite,
  credentialsParseOnly,
  corePureImports,
  bodyProjectionInputs,
  parameterJudgeCacheOwner,
  singleToolArgumentParser,
  identityAccountReferences,
  identityDecisionInputs,
  identityScopeColumns,
  noBailControl,
  noDialectBypass,
  noNetworkListenInTenancy,
  noPeerAddress,
  noPresentationInDiagnostics,
  noRandomSourceInline,
  createNoTestingImport,
  noTestingImport,
  noWallClock,
  ogS42DynamicResolve,
  opsEventWhitelist,
  opsImportWhitelist,
  presentationOnlyAuthn,
  restrictedCallSites,
  scCv1,
  scOe1,
  scOe2,
  singleTableEntry,
  terminalOutcomeClosed,
}

export const RULES: readonly Rule[] = [
  noWallClock,
  noBailControl,
  restrictedCallSites,
  noTestingImport,
  // 入口层包（governance-center-entry）：包不存在时这些规则无事可查
  opsImportWhitelist,
  opsEventWhitelist,
  singleTableEntry,
  noPeerAddress,
  credentialsParseOnly,
  presentationOnlyAuthn,
  noNetworkListenInTenancy,
  // 账号能力
  noPresentationInDiagnostics,
  noRandomSourceInline,
  aiR8NoCredentialInWrite,
  // offer-expiry 的消费者、凭据材料、注册组合、清除链、存储边界
  scOe1,
  scOe2,
  scCv1,
  terminalOutcomeClosed,
  ogS42DynamicResolve,
  noDialectBypass,
  corePureImports,
  identityDecisionInputs,
  identityAccountReferences,
  identityScopeColumns,
  bodyProjectionInputs,
  parameterJudgeCacheOwner,
  singleToolArgumentParser,
]

/** 某个扫描根适用的规则：与 `RULES` 同一份，只是 no-testing-import 带上该根里各包声明的 `./testing` 入口。 */
export function rulesForRoot(root: string): readonly Rule[] {
  const testingImport = createNoTestingImport(collectTestingEntries(root))
  return RULES.map(rule => (rule === noTestingImport ? testingImport : rule))
}
