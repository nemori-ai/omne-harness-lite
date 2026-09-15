---
kind: research
id: R-agent-initiated-hitl-sources
scope: PF-005 主动提问、授权请求、耐久等待、用户答复与接续的 omne-next 来源核对
---

# Agent 主动 HITL 的来源核对

[PF-005 正文](../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md) · [研究索引](README.md)

2026-09-12 用户提出主动提问与请求授权要求，并指向 `omne-next/omne_harness`
的 agent 发起 HITL 流程。本次核对干净检出的提交
`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；下列文件均与该提交的 Git blob
逐字节核对，链接固定版本。用户确认与继承映射归 PF-005，此页记录来源事实。

## 来源与确认范围

| 来源 | 源接受范围 / 本次核对章节 | PF-005 对应 |
|---|---|---|
| [Agent 发起人类请求、耐久等待与因果接续][human] | Accepted · current，2026-08-04；Statement、等待/答复规则、AC-1～11 与 2026-08-28、08-31、09-01、09-08 有效补充 | C1～C9：两类请求、授权区分、先登记再呈现、长期等待、owner 答复、单次接续、待办池和可答性 |
| [一次性批准的预承诺与动作引用][citation] | Accepted · committed-future，2026-08-28；Statement、AC-1～3 及未批准扩展边界 | C10：owner 可在历史核查、超范围重新请求；权威批准引用与缺失不推断两句自 2026-09-15 起不纳入（[PF-005 变更记录](../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md#变更记录)） |
| [受治理能力发现与调用][official] | Accepted · current；OHC-2/3 中专用 consent、可授予 scope、实时授权与拒绝边界 | C3：主动申请能力授权，不把普通 HITL 答案冒充权限授予 |
| [设备能力使用授权][device] | Accepted · current，2026-07-30，含后续范围澄清；Statement 与 Effective-state semantics | C3 的设备示例：agent 可申请，设备 owner 裁决，目标从发起会话权威派生，模式与范围分别表达 |
| [Agent 通知的耐久事实与授权送达][notification] | Accepted · current，2026-08-04；Statement、AC-3/5/6 中 actionable request 的通知投影 | C4、C8：同一请求的通知不另造答案/等待事实；送达失败不关闭等待，完整敏感内容须经认证 |
| [暂行副作用的非阻塞定夺][tentative] | Accepted · committed-future，2026-08-27，含 08-28 池呈现修订；本轮只核对与阻塞请求的边界 | 相邻来源：同一池中另有暂行态定夺 kind，其资格、撤销与回传另有要求，本页不展开为 PF-005 的额外条款 |

首行核心要求的有效产品条款及修订用于本轮已授权的 HITL 映射，不能只摘开头
而丢掉后续确认。C10 按 [SYS-CONTINUITY](../requirements/system/omne-next-continuity.md)
的已承诺功能继承方向登记，保留其 future 身份；其中权威批准引用与缺失不推断两句
2026-09-15 由用户裁定暂不继承，未来需要时另作能力登记。其它来源只在表中所列适用范围
补充映射，未把这些相邻能力全文一并确认为本项正文。

## 必须随正文读取的修订

| 日期 | 有效变化 | 防止误读 |
|---|---|---|
| 2026-08-28 | 原 pending-action directory 正名为统一决策待办池；请求自包含，可定位回会话/发起工作/耐久消息，池内可直接作答 | 池是跨会话呈现与作答面，各 kind 保留自身事实；通知中心的已读不产生决定 |
| 2026-08-31 | 释放执行资源允许有界热宽限；human wait 被纳入统一耐久等待的特化 | 宽限到期只回收实例，不超时裁决请求；冷恢复不依赖原协程仍存活 |
| 2026-09-01 | 每条待办显示与请求 standing 正交的当前可答性；可答、设备不可达、尚未落位、暂时无法解析可辨 | 可见不保证此刻可答；可答性投影不替代真实提交结果，也不改变耐久请求状态 |
| 2026-09-08 | 同一 logical Run 的人类 blocking request 不设数量上限，各自定位、结算并按该条等待接续 | 文件开头“至多一个”已被取代；不能用 Run 单指针、关闭一条清空全部或等待全答完的模型解释 |

源 AC-11 的表格中“现在作答会被受理”必须连同其后说明读取：位点状态可能在
读与提交之间变化，可答性判词本身不是受理承诺。PF-005.C9 保留当前可答性与
真实提交结果的区分。四个旧 wire 值、Gateway 与 Runtime 的分工仅解释来源，
本项目仍需定义自己的语言无关契约与装配。

同日用户进一步明确系统 HITL 与统一决策池后，C8/C9 的共享池正文迁由
[PF-008](../requirements/product/user/PF-008-unified-decision-pool.md) 拥有；旧身份
保留引用。本表仍记录原始映射，主动请求的内容元素继续归 PF-005.C1/C2，通用池
要求按新正文维护。补充来源归[用户治理与决策池核对](user-governance-and-decision-pool-sources.md)。

## 相邻范围与解释边界

- **主动请求与授权门拦截。** 用户本轮指向 agent 主动 HITL；能力使用权限由
  专用授权流程产生。主动请求、授权门自动拦截和持续权限是相连的不同语义，
  不能因为都展示确认界面就复用一个无作用域的“同意”。
- **一次性批准与未来执行证据。** 核心要求已经限制一次性批准的范围，后续
  [动作引用要求][citation] 进一步承诺系统记录与越界重批。它没有选择自然语言
  与动作匹配的算法，也未把 agent 自述的可撤销性升级为实际撤销保证。
- **暂行定夺。** [相邻要求][tentative] 要求先具备显式登记、领域暂行承载及
  全函数撤销，才能非阻塞执行并等 owner 定夺；它的呈现窗口到期同样不是答案。
  本轮主动问题/批准不会因此普遍取得“先做后批”资格。
  用户随后确认的 [PF-007](../requirements/product/user/PF-007-system-initiated-hitl.md)
  登记系统 HITL 与该未来路径；本页的主动请求边界不限制它的独立确认范围。
  [PF-004.C8](../requirements/product/agent/PF-004-subagent-delegation-and-supervision.md#定时派发与授权)
  已登记的定时派发草稿与 owner 激活继续有效；本项没有撤回那些专项条款。
- **通知与人类决定。** [通知来源][notification] 可以把 owner 带回认证后的请求
  入口；通知只是一条请求的送达投影，不承诺人眼恰好看到一次，更不能把已送达、
  已读、超时或设备不可用解释为用户批准。
- **模型与交付。** 旧工具名、字段、WaitFact、进程 checkpoint、Gateway 读模型、
  endpoint 和 UI 都保留来源设计身份。源接受状态不是本项目设计接受、实现或
  验证证据；文件后部的局部实现/测试记录也不能证明完整产品旅程已交付。

## 本次核对范围

已读取核心要求全部产品正文与四份有效修订，核对批准引用要求全文，以及表中
四份相邻来源的相关章节。未运行原系统或重验其实现声称。本项目检查只覆盖文档
结构、身份、引用等维护约束，不证明授权、耐久性或接续性质已经实现。

[human]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-initiated-human-input-request-durable-wait-and-causal-continuation.md
[citation]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-approval-pre-commitment-and-admitted-action-citation.md
[official]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/governed-official-harness-capability-discovery-and-invocation.md
[device]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-owner-consented-device-capability-use.md
[notification]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md
[tentative]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-tentative-effect-confirmation-and-owner-review-pool.md
