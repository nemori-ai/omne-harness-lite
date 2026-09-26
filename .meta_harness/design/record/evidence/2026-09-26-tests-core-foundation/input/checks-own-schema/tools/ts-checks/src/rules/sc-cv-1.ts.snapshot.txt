import type { Rule, SourceFile, Violation } from '../rule.ts'
import { CREDENTIAL_VERIFICATION, tenancyPackageOf } from '../layout.ts'
import { codeMatches, lineAt, viewsOf } from '../source-text.ts'

/**
 * SC-CV-1（credential-verification 节点 verification；AI 契约 S-8「凭据材料不以可读形式保存、消费者只存不读」）：
 * `CredentialMaterial` 是不透明品牌串，内部格式归凭据方案的 owner。`tenancy/*` 除 CV 包外的源码里，
 * 材料值上不得有任何成员访问（`.split(`、`.slice(`、`.length`、`[i]`……）、不得交给正则（`.exec(`／`.test(`）
 * 或 `JSON.parse(` 解析。**品牌断言 `x as CredentialMaterial` 本身不算违反**（那是把列值认成材料，不是读它的内部）。
 *
 * 文本规则认「材料值」的写法：本文件里标注为 `CredentialMaterial` 的名字；成员链末段为 `material`
 * 或 `credential_material` 的表达式；`(… as CredentialMaterial)` 括起来的断言结果。
 */
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
  // 材料表达式：标注过的裸名 | 末段为 material／credential_material 的成员 | 括起来的品牌断言
  const bare = names.size === 0 ? '' : `(?<![\\w$.])(?:${[...names].join('|')})|`
  const expr = `(?:${bare}(?<![\\w$])(?:material|credential_material)|as\\s+CredentialMaterial\\s*\\))`
  const access = new RegExp(`(?:${expr})(?![\\w$])\\s*!?\\s*(\\?\\.|\\.|\\[)`)
  // 实参可以是成员链（`snapshot.credential_material`）：链的前几段任意，末段按 expr 认
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
