import { isTestPath, scanLines, type Rule, type SourceFile, type Violation } from '../rule.ts'
import { codeMatches, lineAt, viewsOf } from '../source-text.ts'

/** 只许定义它们的包与注册组合调用的方法（入口 verification SC-1 行的新增限定）。 */
const RESTRICTED_METHODS: readonly {
  readonly name: string
  readonly owner: string
  readonly why: string
}[] = [
  {
    name: 'createPersonal',
    owner: 'organization-governance-sql',
    why: 'OG S-20 建个人组织只由注册主链 ② 调',
  },
  { name: 'activate', owner: 'account-identity-sql', why: 'AI S-14 激活只由注册主链 ③ 调' },
  { name: 'purge', owner: 'account-identity-sql', why: 'AI S-38 清除只由清除链 ② 调' },
  {
    name: 'sweepStaleSelections',
    owner: 'organization-governance-sql',
    why: 'OG S-14 ⑤ 残留清扫的触发归装配（OG G-13），不经别的产品包',
  },
]

/**
 * 装配纪律的方法级结构检查（AI S-30 第 8 行、OG S-42 第 4 行、入口 verification SC-1）：
 * `accounts.produce(` 与 `organization-purge` 的解析／调用点只允许出现在 account-registration；
 * `createPersonal(`、`activate(`、`purge(`、`sweepStaleSelections(` 同理。定义它们的包自身除外。
 * 入口层包的路由表（节点 design「路由到服务方法」）一个也不点名这四个方法，所以入口层包里出现即违反。
 */
export const restrictedCallSites: Rule = {
  id: 'restricted-call-sites',
  source:
    'capability.account-identity v1 S-30 · capability.organization-governance v1 S-42 · governance-center-entry verification 契约 SC-1 · 各节点 verification',
  description:
    'accounts.produce(、organization-purge、createPersonal(、activate(、purge(、sweepStaleSelections( 只有 account-registration（与定义它们的包）够得着',
  check(files) {
    const allowed = (path: string, owner: string) =>
      isTestPath(path) ||
      path.startsWith('tenancy/account-registration-sequential/') ||
      path.startsWith(`tenancy/${owner}/`) ||
      (owner === 'account-identity-sql' &&
        (path === 'core/account-identity/src/types.ts' ||
          path === 'core/account-identity/src/cordis.ts')) ||
      (owner === 'organization-governance-sql' &&
        (path === 'core/organization-governance/src/types.ts' ||
          path === 'core/organization-governance/src/cordis.ts'))
    return [
      ...scanLines(
        this,
        files,
        /\.produce\(/,
        '调用了 accounts.produce(；只有注册组合能产生账号',
        path => allowed(path, 'account-identity-sql'),
      ),
      ...scanLines(
        this,
        files,
        /['"](?:organizationPurge|organization-purge)['"]/,
        '解析了 organization-purge 服务；只有清除链能调 S-53',
        path => allowed(path, 'organization-governance-sql'),
      ),
      ...restrictedMethodCalls(this.id, files, allowed),
    ]
  },
}

function restrictedMethodCalls(
  rule: string,
  files: readonly SourceFile[],
  allowed: (path: string, owner: string) => boolean,
): Violation[] {
  const out: Violation[] = []
  for (const file of files) {
    for (const method of RESTRICTED_METHODS) {
      if (allowed(file.path, method.owner)) continue
      // 注释里的字样不算；`x.m(` 与解构后的 `m(` 都算调用点
      for (const m of codeMatches(viewsOf(file), new RegExp(`\\b${method.name}\\s*\\(`))) {
        out.push({
          rule,
          path: file.path,
          line: lineAt(file.text, m.index),
          message: `调用了 ${method.name}(；${method.why}，只许 account-registration 与 ${method.owner} 出现`,
        })
      }
    }
  }
  return out
}
