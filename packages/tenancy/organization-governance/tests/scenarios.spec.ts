// capability.organization-governance v1 §十「规范场景」，按契约编号列 it.todo；第二程实现时逐条换成真实场景。
import { describe, it } from 'vitest'

describe('capability.organization-governance v1 · 规范场景', () => {
  it.todo(
    'S-46 邀约的三种收场：接受／撤回／过期各一遍，②③与再接受一次的拒绝值逐字相同（offerNoLongerValid），无第二份效果',
  )
  it.todo('S-47 过期之后接受被拒，且没有中间状态')
  it.todo('S-48 并发移除对方只有先成的一方成立（真并发，两个独立连接）')
  it.todo('S-49 解除之后再加入，回来的是同一个租户（跨契约，与 account-identity 联跑）')
  it.todo('S-50 切换只影响此后新建的东西（跨契约）')
  it.todo('S-51 个人组织里没有这个动作：四条结构性禁止各自的具名失败值')
  it.todo('S-52 成员资格不可用时明确失败：unavailable，不是 ineffective、不是 notAuthorized')
  it.todo(
    'S-54 清除只对未激活账号成立：已激活 ⇒ accountIsActivated；未过期 ⇒ accountNotExpired；两路幂等都返回依据',
  )
})
