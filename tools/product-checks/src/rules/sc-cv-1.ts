import type { Rule, SourceFile, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { CREDENTIAL_VERIFICATION, tenancyPackageOf } from '../layout.ts'
import { codeMatches, lineAt, viewsOf } from '@omne-harness/repo-toolchain/core/source-text'

export const scCv1: Rule = {
  id: 'sc-cv-1',
  source:
    'capability.account-identity v1 S-8 · credential-verification 节点 SC-CV-1（W1-B：品牌断言不算违反）',
  description:
    'tenancy/* 除 credential-verification 外不对 CredentialMaterial 值做成员访问、正则解析或 JSON.parse',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (tenancyPackageOf(file.path) === undefined) continue
      if (file.path.startsWith(CREDENTIAL_VERIFICATION)) continue
      out.push(...checkFile(this.id, file))
    }
    return out
  },
}

function checkFile(rule: string, file: SourceFile): Violation[] {
  const views = viewsOf(file)
  const names = new Set<string>()
  for (const m of views.code.matchAll(
    /([\w$]+)\s*\??\s*:\s*(?:[\w$<>|\s]*\|\s*)?CredentialMaterial\b/g,
  )) {
    if (m[1] !== undefined) names.add(m[1])
  }
  const bare = names.size === 0 ? '' : `(?<![\\w$.])(?:${[...names].join('|')})|`
  const expr = `(?:${bare}(?<![\\w$])(?:material|credential_material)|as\\s+CredentialMaterial\\s*\\))`
  const access = new RegExp(`(?:${expr})(?![\\w$])\\s*!?\\s*(\\?\\.|\\.|\\[)`)
  const arg = `\\(\\s*(?:[\\w$]+\\s*[?!]?\\.\\s*)*(?:${expr})(?![\\w$])`
  const parse = new RegExp(`\\.\\s*(?:exec|test)\\s*${arg}|\\bJSON\\s*\\.\\s*parse\\s*${arg}`)
  const out: Violation[] = []
  for (const m of codeMatches(views, access)) {
    out.push({
      rule,
      path: file.path,
      line: lineAt(file.text, m.index),
      message: `访问了凭据材料的内部（${m[0].trim()}…）；CredentialMaterial 只存不读，格式归凭据方案的 owner`,
    })
  }
  for (const m of codeMatches(views, parse)) {
    out.push({
      rule,
      path: file.path,
      line: lineAt(file.text, m.index),
      message: `解析了凭据材料（${m[0].trim()}…）；CredentialMaterial 只存不读`,
    })
  }
  return out
}
