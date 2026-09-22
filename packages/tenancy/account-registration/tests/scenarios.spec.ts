// composition.account-registration v1 §八的规范场景，按契约编号列 it.todo；第二程实现时逐条换成真实场景。
import { describe, it } from 'vitest'

describe('composition.account-registration v1 · 规范场景', () => {
  it.todo('S-27 中途失败后用同一标识重来：停在①②③任一位置后重来都能接着完成，且只有一个个人组织')
  it.todo('S-28 在任意位置中断没有第三种形态：终态只在「未激活」与「已激活且有个人组织」之间')
  it.todo(
    'S-29 参与方缺席时不放行：三个服务面任一缺席 ⇒ fiber PENDING；运行期 unavailable ⇒ interrupted',
  )
  it.todo(
    'S-30 编排者被卸载在途尝试等同崩溃：换代后在途调用停在当前位置返回 interrupted，不清理不补偿',
  )
  it.todo(
    'S-31 两个同标识并发注册：恰一个 registered、另一个 identifier-taken，只有一个账号与一个个人组织',
  )
})
