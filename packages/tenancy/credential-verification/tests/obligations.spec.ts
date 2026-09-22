// 节点 verification.md 的证据义务清单；第二程实现时逐条换成真实测试。
import { describe, it } from 'vitest'

describe('credential-verification · 证据义务（.meta_harness/design/realization/packages/tenancy/credential-verification/verification.md）', () => {
  it.todo('S-8 第 1 条：derive 的输出不含输入明文的任何子串，且同一输入两次派生不相等（盐）')
  it.todo(
    'verify 三值：正确 ⇒ match；错误 ⇒ mismatch；scheme 不认识 ⇒ mismatch；参数损坏 ⇒ unavailable',
  )
  it.todo('S-26：政策不合形状 ⇒ unavailable；不满足规则 ⇒ rejected 携理由；满足 ⇒ ok')
  it.todo('parse：缺席、空串、非字符串 ⇒ invalidInput')
  it.todo(
    '换代演练：卸载本插件、装载另一实现，account-identity 与 organization-governance 的 fiber 不重跑',
  )
})
