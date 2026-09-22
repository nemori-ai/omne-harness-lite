# 同类 agent harness 的持久化与身份基础设施选型

这项调查回答的是：**同行的 agent harness 各用什么存结构化状态与会话转录、用不用查询层、用不用队列**；
以及一个 TS/Node 24 单机 harness 要「同一份代码只改配置在 sqlite 与 PostgreSQL 之间切换」时，
哪些查询层与驱动**做得到、做不到、要付什么代价**。
第二部分（身份基础设施：服务端会话令牌核验、密钥作为部署配置、签名凭证格式）在同一 topic 里，
因为消费者相同（租户领域的装配设计）且失效事件相同（同行换方案、库换版本）。

当前观察支持：五家 CLI 无一用查询构建器、TS 同行用内置 `node:sqlite`、Drizzle 按方言分裂类型而 Kysely 不分裂。
**不支持**：任何「该选什么」的结论——那归 [D-026](../../design/record/decisions/infrastructure-persistence-choices/README.md)。

- 调查对象与基线：opencode `dev`（2026-09-22 抓取）、Codex CLI 0.154.0 与 `codex-rs` main、LangGraph checkpoint 包 3.1.x、pi-coding-agent 0.87.0、Claude Code 2.1.280、Cursor agent 2026.08.04、Kimi Code（2026-07-30 SEA）、DeepSeek Harness 0.1.5-rc.2、Goose main、Mastra 文档、Kysely 0.29.6、Drizzle 1.0.0-rc.2、`kysely-node-native-sqlite` 1.1.0；身份部分见 [research.md 第二部分](research.md#第二部分身份基础设施)
- 消费者：[D-026](../../design/record/decisions/infrastructure-persistence-choices/README.md)（已消费）；`packages/core/storage`、`packages/infra/storage-sql`、`packages/infra/clock`、`apps/tenancy-host` 四个 realization 节点；`packages/core/identity-values` 节点的交接凭证签名方案
- 最近核对：2026-09-22 / 上列版本（首轮）

## 准入核对

两轮取证：网络一轮读各仓库源码与文档原文（URL 逐条记在 [evidence.md](evidence.md)）；
本机一轮对五家 CLI 的可取证副本做带边界特征串检索并直接检查状态目录里的文件魔数（路径与探针词逐条记在 evidence.md）。
局限：Codex、Claude Code、Kimi 三家只能对打包产物做字符串检索，**未命中不等于没有**；
sqlite 库以只读 immutable 模式打开，`journal_mode` 读数不代表真实模式。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么 | [研究正文](research.md) |
| 来源、观察是否可复核 | [证据记录](evidence.md) |
