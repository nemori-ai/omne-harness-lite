---
kind: research
id: R-session-run-and-pending-input-sources
scope: PF-013 Session/Run 生命周期控制、忙时输入、interrupt_then_run 与待执行队列管理的来源核对
---

# Session、Run 与排队输入控制的来源核对

PF-013 正文（legacy source: `../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md`） · 研究索引（legacy source: `README.md`）

2026-09-12 用户新增 Session 与 Run/Turn 生命周期、运行中追加消息、
`interrupt_then_run`、队列调序和原位编辑要求。本轮静态读取本机 `omne-next`，
固定提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；以下十份引用文件与该
提交的 Git blob 逐字节核对。未运行源系统或验证其交付现状，`current` 和
`committed-future` 是来源的承诺范围，不是本项目的完成声明。

## 来源与映射

| 来源 | 来源状态与核对范围 | PF-013 对应 |
|---|---|---|
| [Session 创建、目录与生命周期][session] | Accepted · current，2026-08-03；Outcome、Required behavior、AC-1～8 | C1：稳定身份/归属、目录、命名置顶、归档恢复、逻辑删除；活动 Run 阻止归档或删除，私人目录管理 owner-only |
| [获授权 Session/Run 控制][control] | Accepted · current，2026-08-04，含 09-09 修订；三控制、目标与传播、AC-1～8 | C2/C4/C10：精确运行、中断/继续/取消、可辨结果、明确管理员资格；自己发起的后台工具不属于脱离后代的排除项 |
| [紧急强停及外部效果不确定性][force] | Accepted · current，2026-08-04；Statement、AC-1～7 | C3：撤销旧执行权、拒绝迟到提交、尽力物理终止与资源清理，不冒充外部效果回滚 |
| [忙时到达行为选择][arrival] | Accepted · current，2026-08-04；09-07 合批/独立队列修订、Required behavior、AC-1～9 | C5/C6：默认 queue、用户默认与逐条覆盖；精确目标的整体打断意图、竞态、重试，不再有独立 urgent turn |
| [耐久有界待处理输入][pending] | Accepted · current，2026-08-04；09-07 合批、产品管理、独立队列及简化修订，09-10 交付顺序说明；Required behavior、AC-1～15 | C3/C7/C8/C9：有界受理、保留身份的连续文本合批、调序/原位编辑/移除、命令动作、hold/继续/撤回、恢复与关闭 |
| [多门面状态同步][facades] | Accepted · current，2026-08-04；09-07 队列管理修订、standing baseline、AC-1～11 | C10：同一 Run/输入/控制事实、运行中及时看见队列管理结果、断线恢复、权限重查；不采用源 08-13 pinned-node 装配选择 |
| [单次工具执行中断][tool] | Accepted · current，2026-09-08；Statement、AC-3/6/7，含 09-09 说明 | C4：Run 中断停止全部未结算的自有工具；打断后继续采用不同处置，中断调用不被系统恢复/重试 |
| [ADR-119 工具离场修订][detach-commands] | Accepted 设计；Amendment 2026-09-08 中的 09-09 三命令映射表 | 只用于 C4 的中文产品意图与 `interrupt_then_run` 名称对应：可转则转、不可转或失败则中断、已后台者继续；不采用 CAS、WorkOrder、WaitFact 或结果消息编码 |
| [耐久暂停/恢复候选][pause] | Candidate · not accepted，2026-08-04；整份短 intake | 记录未决范围：不从普通 resume 或队列 hold 推定完整耐久暂停语义 |
| [用户主动重试候选][retry] | Candidate · not accepted，2026-08-04；整份短 intake | 记录未决范围：不从旧控制符号推定已批准的新 attempt、副作用对账和恢复动作 |

用户直接要求及可明确映射的产品行为按
SYS-CONTINUITY（legacy source: `../requirements/system/omne-next-continuity.md`）登记。快捷键能力
已有 PF-009（legacy source: `../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md`）
和来源核对（legacy source: `user-input-and-command-sources.md`），本轮引用其入口边界，不重写键位
设置要求。PF-013 的直接聊天范围不把 sub-agent Session 自动提升为普通用户
会话或开放任意编辑其输入。

## 来源差异与采用边界

- **Session 管理、Run 控制与 pending 输入分开。** 目录的归档/恢复/删除不
  隐式终止活动 Run；取消 Run 保留会话和历史；移除待执行项不等于物理删除
  原始数据。用户目录管理的 owner-only 与具有明确资格的同租户管理员可施加
  某种运行控制是不同权限，不互相授予。
- **一次消息与一次执行不要求一一对应。** 09-07 修订用当前顺序中的连续
  文本合批替代早期 ordinary/urgent 双路及“一消息一执行/回复”。消息身份和
  内容边界仍保留，合批不是语义摘要或原文覆盖，取批后不追溯加入后来输入。
  原设计材料中的旧独立 urgent 表述不覆盖这些明确修订。
- **人工调序决定实际顺序。** 09-07 独立队列修订撤回固定捕获文本、跨项
  成功依赖和系统推断关联。命令提供默认安排及自身队列动作，用户确认的顺序
  不被旧默认永久锁住。09-10 说明将命令安排的实现随命令框架交付，产品承诺
  仍保留；这不是本项目的交付排期，也不能按当前无命令实现删掉该范围。
- **“追加”没有正在调用中的热注入保证。** 源 arrival 的旧名 `insert` 不
  表示第三种产品行为。普通文本采用 queue 或 interrupt_then_run；已有 HITL
  请求的准确答复另有路由。用户默认/逐条覆盖已有依据，来源不确认持久的
  per-session arrival 默认覆盖；本轮不额外选择该机制。
- **普通 Run 中断与打断后处理的工具处置不同。** 09-09 明确：普通 Run
  中断/取消覆盖其自己的未完成工具，包括已离场工具；排除连坐的是被委派
  出去的独立后代。`interrupt_then_run` 对可转后台者保留工作，不可转或切换
  失败者中断，已在后台者继续。PF-003 早期来源（legacy source: `tool-execution-sources.md`）
  尚未确认的整轮联动，本轮按 PF-013.C4 补齐；独立“手动转后台失败时怎么办”
  和具体工具结果编码仍由 PF-003 后续细化，不能将本次复合命令的分支扩大为
  所有单次工具控制的默认行为。
- **继续不是复活被明确取消的工作。** 普通 resume 需要匹配的 interrupted/
  awaiting 及因果目标；被明确中断的工具执行不由框架续跑或重试。Run cancel
  或 force-stop 也压过普通故障恢复。是否发起新的工具调用由后续 Agent 决定，
  不代表用户控制请求被系统撤销。
- **hold 与通用 durable pause 不同。** whole-Session 紧急停止后的队列 hold、
  用户继续及撤回已有 pending requirement；保存正在执行的工作、释放资源并
  保证通用 pause/resume 的完整语义仍是候选。`retry` 同为未接受 intake；
  `interrupt response` 在三命令表中明确留作未来未裁定动作，不据旧代码补成
  已确认功能，也不以这些未知阻止登记本轮已明确范围。
- **恢复状态不采用源部署或存储。** 多端共享已确认的状态、内容和顺序属于
  产品要求；opaque cursor、队列失效通知/周期读取、固定节点 Coordinator、
  单写者实现与 State/Runtime 分工属于原设计。执行“只有一个当前活动 Run”
  和重试不重复效果可以登记，不据此选择本项目的数据库、锁或传输协议。

本轮的可观察场景是需求描述，未作为实际通过的测试。尚未核查强停时延、平台
终止能力、队列竞态、外部副作用或跨端恢复的实现证据；精确规格及取舍仍需后续
proposals → decisions → spec 流程。

[session]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-owner-user-chat-session-creation-directory-and-lifecycle-management.md
[control]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-authorized-session-run-control-and-truthful-outcome.md
[force]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-emergency-force-stop-fencing-and-uncertain-effects.md
[arrival]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/owner-user-chat-turn-arrival-behavior-selection.md
[pending]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-owner-user-chat-session-durable-bounded-pending-turn-lifecycle.md
[facades]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/owner-user-chat-session-multi-facade-standing-state-synchronization.md
[tool]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-owner-initiated-tool-execution-interruption.md
[detach-commands]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-119-background-work-order-and-tool-detachment.md
[pause]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/durable-session-run-pause-and-resume-candidate.md
[retry]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/user-triggered-run-retry-candidate.md
