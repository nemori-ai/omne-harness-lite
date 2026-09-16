# 候选与取舍

## 1. 通知 + projection 拉取

- **前提与边界：**耐久事实和 projection 已有可查询水位；通知只作铃，瞬态模型输出不承诺恢复。
- **兑现：**PF-013 恢复靠 `changes/snapshot`，PF-003/022 只在刷新后见到终态；实现为 committed 通知、周期 reconcile 和 projection API。
- **失败：**丢铃可补齐，断线期间没有实时草稿；频繁拉取增加延迟与读负载。来源是 DSH `session/event` 与旧 outbound 草稿，见[DSH 研究](../../research/client-message-stream/notes/dsh.md)。
- **处置：**可行且保持事实唯一权威；未单独采用，因为不能兑现已确认的实时 chunk/工具过程体验，但其 durable disposition/reconcile 是候选 3 的事实层。反向极端“只有 active snapshot”同样不合格：断线期间 terminal 离开 active 后无法恢复，failed/non-reply 无正文也无法收口。

## 2. Canonical replayable client event stream

- **前提与边界：**把客户端事件定义为独立耐久 aggregate，offset 是恢复权威；事件投影而非领域读面拥有 replay。
- **兑现：**一条 offset 同时补事实和过程，客户端实现简单；OpenCode `session.next.*` 展示可行路径，且明确 delta live-only、ended 耐久，见 [OpenCode 研究](../../research/client-message-stream/notes/opencode.md)。
- **失败：**若 E 复制 Session/M outcome 形成统一覆盖域，会出现第二历史、双授权、双 retention 及 unknown/late evidence 分叉；若只统一 transport envelope，则仍不能让 pub/commit/chunk/visibility 共用时钟。要可行必须把该流升级为领域事实源并迁移现有 owner。
- **处置：**真实可实施，但“E 第二历史”违反当前一个含义一个权威；未来若整体迁移到统一 event-sourcing 可重评，当前淘汰。

## 3. Durable fact catch-up + transient sideband

- **前提与边界：**领域事实/投影继续权威；transient 只改善实时体验，subscribe-first listener/buffer 负责 baseline→live 无漏帧交接。
- **兑现：**durable channel 用 SessionProjection `changes/snapshot` 原子恢复 history 与完整 attemptState updates/授权 state 集合；无帧时客户端周期 `changes(to=latest)` 用有界 coveredThrough 安装 hidden-only 覆盖；transient channel 用 M compact public state、coveredThrough、source cut 和 per-listener subscribe-first buffer 恢复仍 active 状态。客户端 reducer 按 attempt identity 合并两者，ended只引用 disposition；本地旧草稿缺席只作 evidence_unavailable。实现为 MessageStream service + Projection reader + M source listener/active-state reader；两通道可复用连接但不共享时钟或权威。
- **失败：**必须证明 M CAS business acceptance、耐久 closing observation 与 terminal disposition 分离、无 revision closing 的增量交付、无 guessed-identity oracle、callback有序独立入队、empty→live线性化、compact state prefix/epoch dedup、完整commit安装、unknown revision、visibility、overflow与真实resubscribe；任何一条缺失都不能靠coveredByBaseline例外补齐。当前 Cursor模型不覆盖；ActiveHandoff 只在当前有限模型的发布公平与容量配置下有进展证据，该数值不是生产 sizing 契约，仍需 provider/client 并发验收。
- **来源与处置：**组合旧 message-stream/D-015、DSH/pi/OpenCode/Codex 观察与 M 新接口；推荐但仍未接受。

三个候选的责任 owner、恢复机制和失败面实质不同；旧 outbound-stream 的当前边界已吸收到候选 1/3，
不作为第四候选或独立能力。
