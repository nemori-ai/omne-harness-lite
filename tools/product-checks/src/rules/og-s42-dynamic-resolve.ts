import { hostPolicyReferences } from '../host-policy-declaration.ts'
import { isTestPath, type Rule, type Violation } from '@omne-harness/repo-toolchain/core/rule'
import {
  ACCOUNT_REGISTRATION,
  ORGANIZATION_GOVERNANCE,
  ORGANIZATION_GOVERNANCE_DEFINITION,
} from '../layout.ts'
import {
  codeMatches,
  lineAt,
  matchClose,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

const PURGE_KEY = `(?:['"\`](?:organizationPurge|organization-purge)['"\`]|\\bORGANIZATION_PURGE_SERVICE\\b)`

/**
 * OG S-42 第 4 行「S-53 只由清除链调用」（AI S-30 同类纪律；OG 节点 verification S-42 行）：
 * `organization-purge` 服务只在 account-registration 解析——`ctx.get(…)`、`resolveOptional(ctx, …)`、
 * `inject: [...]`／`inject: {...}` 与 `ctx.inject([...], …)` 里出现这个服务名（字面量或 `ORGANIZATION_PURGE_SERVICE` 常量）
 * 都算解析；定义它的 organization-governance 自己也不许解析（它只 provide）。
 * T4 宿主只允许私有 required 表比较声明中的服务键；AST 逐处核对，不能解析服务或传出表。
 * 另：`ORGANIZATION_PURGE_SERVICE` 常量在上述有限声明位置及 AR／OG 之外出现即报出——经常量解析时字面量规则看不到服务名。
 */
export const ogS42DynamicResolve: Rule = {
  id: 'og-s42-dynamic-resolve',
  source:
    'capability.organization-governance v1 S-42 第 4 行 · capability.account-identity v1 S-30 · organization-governance 节点 verification S-42 行',
  description:
    'organization-purge 只在 account-registration 里经 ctx.get／resolveOptional／inject 解析；公共服务键可作有限声明比较；运行解析只允许 AR',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (isTestPath(file.path) || file.path.startsWith(ACCOUNT_REGISTRATION)) continue
      const observations = hostPolicyReferences(file)
      const views = viewsOf(file)
      const push = (index: number, message: string) =>
        out.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
      const direct = new RegExp(
        `\\.\\s*get\\s*(?:<[^>(]*>)?\\s*\\(\\s*${PURGE_KEY}|\\bresolveOptional\\s*(?:<[^>(]*>)?\\s*\\(\\s*[\\w$.]+\\s*,\\s*${PURGE_KEY}`,
      )
      for (const m of codeMatches(views, direct)) {
        push(m.index, '解析了 organization-purge 服务；只有注册组合的清除链能解析它')
      }
      for (const m of codeMatches(views, /\binject\s*(?::|=|\()\s*[[{]/)) {
        const open = m.index + m[0].length - 1
        const close = matchClose(views.skeleton, open)
        if (close === -1) continue
        if (new RegExp(PURGE_KEY).test(views.code.slice(open, close))) {
          push(m.index, 'inject 声明里有 organization-purge；只有注册组合能依赖它')
        }
      }
      if (
        !file.path.startsWith(ORGANIZATION_GOVERNANCE) &&
        file.path !== `${ORGANIZATION_GOVERNANCE_DEFINITION}src/cordis.ts`
      ) {
        for (const m of codeMatches(views, /\bORGANIZATION_PURGE_SERVICE\b/)) {
          if (observations.has(m.index)) continue
          push(
            m.index,
            '引用了 ORGANIZATION_PURGE_SERVICE；这个服务名只有注册组合（与定义它的包）用得着',
          )
        }
      }
    }
    return out
  },
}
