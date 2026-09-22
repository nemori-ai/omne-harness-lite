import { isTestPath, scanLines, type Rule } from '../rule.ts'

/**
 * 装配纪律的方法级结构检查（AI S-30 第 8 行、OG S-42 第 4 行）：
 * `accounts.produce(` 与 `organization-purge` 的解析／调用点只允许出现在 account-registration；
 * 定义它们的包自身除外。
 */
export const restrictedCallSites: Rule = {
  id: 'restricted-call-sites',
  source:
    'capability.account-identity v1 S-30 · capability.organization-governance v1 S-42 · 两节点 verification',
  description: 'accounts.produce( 与 organization-purge 只有 account-registration 够得着',
  check(files) {
    const allowed = (path: string, owner: string) =>
      isTestPath(path) ||
      path.startsWith('tenancy/account-registration/') ||
      path.startsWith(`tenancy/${owner}/`)
    return [
      ...scanLines(
        this,
        files,
        /\.produce\(/,
        '调用了 accounts.produce(；只有注册组合能产生账号',
        path => allowed(path, 'account-identity'),
      ),
      ...scanLines(
        this,
        files,
        /['"]organization-purge['"]/,
        '解析了 organization-purge 服务；只有清除链能调 S-53',
        path => allowed(path, 'organization-governance'),
      ),
    ]
  },
}
