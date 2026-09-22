// capability.account-identity v1 §八的规范场景与证据义务，按契约编号列 it.todo；第二程实现时逐条换成真实场景。
import { describe, it } from 'vitest'

describe('capability.account-identity v1 · 规范场景', () => {
  it.todo(
    'S-31 三种登录失败反馈完全一致：不存在／凭据错／未激活 ⇒ 逐字相同的 identifier-or-credential-rejected',
  )
  it.todo('S-32 退出的持久性：撤销后重启提供者，校验仍拒绝')
  it.todo('S-33 退出的作用范围：撤销只及被指定的那一个登录状态')
  it.todo(
    'S-34 同标识两路对比：未激活认回 vs 已激活占用 vs 不合规凭据撞已激活标识 ⇒ credential-rejected',
  )
  it.todo('S-40 有效登录状态列得全：调用方自己那条必在内，已撤销的不在')
  it.todo('S-41 未激活记录到期释放标识：清除后同标识可重新产生')
  it.todo(
    'S-42 伪造的依据两侧都被拒：激活依据与清除依据各自 warrant-invalid / purge-warrant-invalid',
  )
  it.todo('S-43 依据产出之后记录才过期：激活与落盘过期在同一行、同一锁下只有两种终态')
})

describe('capability.account-identity v1 · 静态检查', () => {
  it.todo('S-35 账号记录无跨账号关联字段（tools/ts-checks 规则）')
  it.todo(
    'S-36 失败集合闭合：八个方法的失败字面量集合 = 契约集合（tests/types.spec-d.ts 已守类型层）',
  )
})
