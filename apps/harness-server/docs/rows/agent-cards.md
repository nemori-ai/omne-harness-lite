# Agent 卡片行

本页说明发行树里 `agent-cards` 行怎样接线。它提供 Agent 的卡片端口 `agentDecisionCards`：Agent 循环要人决定时，
一轮卡片经 HITL 保管。系统责任归[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)。
端口的契约归 [Agent 契约](../../../../packages/agent/SPEC.md#扩展与卡片)，
卡片与等待的协议归 [HITL 公共协议](../../../../packages/human-intervention/human-intervention/docs/protocol.md)。

## 接线

| 项 | 内容 |
| --- | --- |
| 提供 | `agentDecisionCards`。Agent 宿主每次调用经 `ctx.get` 现取；本行缺席时宿主答 `unavailable` |
| 注入 | `session`。以调用方类 `coordinator` 读会话快照，取调用方执行所在的 Run |
| 共用的 HITL 装配 | HITL 宿主、受众与登记主体取自按根保存的 holder，与 Tool 的 Ask 等待共用。它们由 `tool-records` 行与入口对象 `toolClock` 填入，见 [Tool 运行时组](tool-runtime.md)。三样里任何一样缺席时，各操作答 `unavailable` |

## 四个操作

实现在 [provider.ts](../../src/rows/agent-cards/provider.ts)，不读写任何东西的映射在 [cards.ts](../../src/rows/agent-cards/cards.ts)。

| 操作 | 做什么 | 结果 |
| --- | --- | --- |
| `present` | 一轮请求登记成一个 HITL 请求，每个请求一张卡。来源带会话与 Run。准备与登记的操作身份由 passage 与 round 派生，重送认回原结果 | 逐卡依据，顺序与请求一致。守卫拒绝或操作已封口为 `conflict`；回包未知为 `commit-unknown`；草稿放不进一张卡为 `invalid` |
| `lookup` | 用与 `present` 相同的输入重建同一条登记命令，按原操作身份与输入摘要认回 | 登记成立为 `presented`；HITL 已封口这次操作，或原登记以拒绝落定，为 `not-presented`；其余为 `unknown` |
| `read` | 从依据找到卡片。卡片已决定而未接手时，绑定接收者、接手决定、确认交接 | 没有决定为 `pending`；选项为 `chosen`；原话为 `remark`；跳过为 `declined`；作废为 `invalidated`。接手不成立为 `unavailable`，原等待不变 |
| `invalidate` | 以 Agent 的操作派生的身份使这一轮的等待失效，再读回每张卡 | 每张卡的答复或作废依据。给的卡片不是这一轮的全部卡片为 `conflict` |

## 来源种类与卡片内容

- passage 是某个动作的官方准入链，并且每张草稿都指向这个动作时，来源登记为 `admission`；其余登记为 `agent-extension`。
- 草稿原样转成卡片：说明作描述，说明的第一句作标题，选项的描述沿用标签。卡片身份是请求在本轮里的序号。
- `chosen` 不带选项的值。选项的效果是出卡方的数据，Agent 以它保存的草稿为准。

## 现状

本发行的官方准入不会答「要人决定」，所以这一行在真实路径上还走不到。用例对着 HITL 应用与宿主的替身逐格核对
（[provider.spec.ts](../../tests/rows/agent-cards/provider.spec.ts)、[cards.spec.ts](../../tests/rows/agent-cards/cards.spec.ts)）。
HITL 真实存储一侧收 `admission` 与 `agent-extension` 两种来源，由 human-intervention-local 的用例覆盖。
答复到达后没有唤醒 Agent 的入口，Agent 按定时重读发现答复。
