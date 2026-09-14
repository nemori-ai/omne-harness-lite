---
kind: decision
id: D-010
status: accepted
scope: 第一批 P1 共享诊断设施、依赖选择及存储和准入的观测注入
date: 2026-09-14
sources:
  - ../proposals/core-capabilities/implementation/observability.md
  - ../research/harness-observability.md
acceptance: ../proposals/core-capabilities/implementation/observability.md#接受与验证
supersedes: []
---

# D-010：共享诊断设施与真实边界的观测责任

目录创建、八文件额度解释和关闭失败重试的实现前提，已由
[D-011](D-011-diagnostics-directory-ownership.md)限定取代；本决定其余选择继续有效。
当前提供者正文归 [diagnostics/design.md](../../packages/observation/diagnostics/design.md)，
原施工稿保留消费者交接、验收与历史来源。

采用一个自有 `packages/observation/diagnostics` 包，统一结构化日志、标准 trace
上下文、内容裁剪、有界本地输出及其生命周期。它承载实际保护责任，records 和
work-data 不反向依赖它；jsonl、admission 及后续业务 owner 消费受限记录面，
应用装配持有配置、状态和关闭管理面。生产、研发、debug 共享语义，细节由配置控制。

首批选择 Pino 10.3.1、SonicBoom 4.2.1、OTel API 1.9.1、Trace SDK 与 ALS 2.11.0。
沿标准 span/context 与成熟输出流构建最小适配，不自建遥测协议、通用队列或
exporter 框架。DSH 已有机制及 pi/OpenCode 的可借鉴部分、未直接采用的边界归
[研究](../research/harness-observability.md)。当前 API 与容量归
[diagnostics 设计](../../packages/observation/diagnostics/design.md)；O01–O12 的原
验收范围与接受依据保留在[历史选择](../proposals/core-capabilities/implementation/observability.md#接受与验证)。

诊断输出在外层短门之外启动；低流量输出不等待后续日志或关闭。within 保持
调用者的原返回和错误，不接管其 Promise 生命周期。诊断关闭只证明自身资源
收口，旧引用受实例状态约束。普通诊断故障及丢弃可见，不能覆盖原业务结果。
关键审计仍随所属耐久提交或可核实 outbox 保存，不能由 logger/span 替代。

本选择落实用户关于共享生产/研发/debug log 和 trace 的要求及
[SYS-OBSERVABILITY.C1–C7](../requirements/system/observability-and-logging.md)，
消费既有[核心要求基线](../proposals/core-capabilities/requirements.md)。已核对
集成 `9cd78a0` 与工作包起点 `570000a` 的 requirements 正文无变化。
主调度在用户授权的自驱设计/研发范围内接受 P1 施工选择；依据是 `99fc7a3` 的
独立复核闭合与 HUB 对 12+7 项机制探针的实际重跑，不表示产品实现已通过。

不改变 D-005～D-009 或 OB/CD/CC/DR v1。P2 Cordis 桥仍需满足原生缓存、归因和
卸载的独立验证门，不能借此接受有缺陷的 disposer 或秘密缓存。P3 受治理的
查询/导出、完整保留与采集仍按 OB 实施；collector、仪表盘及整批 A28 尚未交付。
