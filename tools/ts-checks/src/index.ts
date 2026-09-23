import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Rule, SourceFile, Violation } from './rule.ts'
import { aiR8NoCredentialInWrite } from './rules/ai-r8-no-credential-in-write.ts'
import { credentialsParseOnly } from './rules/credentials-parse-only.ts'
import { noBailControl } from './rules/no-bail-control.ts'
import { noDialectBypass } from './rules/no-dialect-bypass.ts'
import { noNetworkListenInTenancy } from './rules/no-network-listen-in-tenancy.ts'
import { noPeerAddress } from './rules/no-peer-address.ts'
import { noPresentationInDiagnostics } from './rules/no-presentation-in-diagnostics.ts'
import { noRandomSourceInline } from './rules/no-random-source-inline.ts'
import { noTestingImport } from './rules/no-testing-import.ts'
import { noWallClock } from './rules/no-wall-clock.ts'
import { ogS42DynamicResolve } from './rules/og-s42-dynamic-resolve.ts'
import { opsEventWhitelist } from './rules/ops-event-whitelist.ts'
import { opsImportWhitelist } from './rules/ops-import-whitelist.ts'
import { presentationOnlyAuthn } from './rules/presentation-only-authn.ts'
import { restrictedCallSites } from './rules/restricted-call-sites.ts'
import { scCv1 } from './rules/sc-cv-1.ts'
import { scOe1, scOe2 } from './rules/sc-oe.ts'
import { singleTableEntry } from './rules/single-table-entry.ts'
import { terminalOutcomeClosed } from './rules/terminal-outcome-closed.ts'

export type { Rule, SourceFile, Violation } from './rule.ts'
export { isTestPath, scanLines } from './rule.ts'
export {
  aiR8NoCredentialInWrite,
  credentialsParseOnly,
  noBailControl,
  noDialectBypass,
  noNetworkListenInTenancy,
  noPeerAddress,
  noPresentationInDiagnostics,
  noRandomSourceInline,
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
]

/** 收集 `root` 下全部 `.ts` 源（跳过 node_modules 与 dist），路径相对于 root。 */
export function collectSources(root: string): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts'))
        out.push({
          path: relative(root, full).replaceAll('\\', '/'),
          text: readFileSync(full, 'utf8'),
        })
    }
  }
  walk(root)
  return out
}

export function runRules(
  files: readonly SourceFile[],
  rules: readonly Rule[] = RULES,
): Violation[] {
  return rules.flatMap(rule => rule.check(files))
}
