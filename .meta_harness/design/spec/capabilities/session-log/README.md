# 会话日志（窄口）

## v3 精确采用（2026-09-27）

[D083](../../../record/decisions/session-log-tail-condition-adoption/decision.md)技术接受[v3完整包](v3/contract.md)，24资源已按接受清单冻结；append条件必填、尾判定与整批共同提交、未知恢复和完整前缀责任明确。三形式任务已登记，有限run1沿未变模型和原输入范围读取；没有provider绑定或真实IO验收。当前RT3等六条规范消费者仍精确SL2，新版不自动升级它们。[消费者传播](v3/consumer-impact.md)及[验证入口](verification.md)指向尚未完成项。

## v2 历史入口

**一个会话的[会话日志](../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log)里，追加一批条目、按键读、从某个位置往后读；追加时判重、判尝试栅栏。**
这是按三个运行时消费者（工具执行运行时、模型请求运行时、拓展点派发）已列出的要求定的**窄口接口**，不是整本会话日志的契约——那一份归 loop 与会话那一程。

> 本契约兑现的是词条[会话日志](../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log)的一个窄口；条目壳、判重键、读取键、日志位置无词条，定义只在契约里。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.session-log, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`；`family=capabilities`、`topic=session-log`、
  `contract_path=spec/capabilities/session-log/v2/contract.md`；`resources` 含契约、`examples.md` 与 `formal/` 下八个文件（入口 README、模型、六个配置）；
  依赖五项：`data.identity-values` v1、`data.messages` v2、`data.call-accounts` v2、`data.content-blocks` v2、`capability.session-tenancy` v2，clauses 取自[契约 S-4](v2/contract.md#s-4-依赖方向与被消费的面)
- **formal-tasks 映射**：`session-log-v2-appends`（正配置）；五个有效性与可达性配置不登记。已执行一次，结果在[验证入口](verification.md#形式工件)
- **提供者/装配映射**：[packages/session/session-log-jsonl](../../../realization/packages/session/session-log-jsonl/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。条目的全序与位置、判重、尝试栅栏、一本日志一个租户身份、提交即持久——**它们被「多个写入方对同一本日志的并发写只能在这一处排出次序」绑在一起** |
| 为什么是 capability 而不是 data | 每个操作有前置、提交点、失败集合与缺席默认；有状态（一本只增的日志）和它的判定 |
| 为什么现在立、而且这么窄 | 产品负责人 2026-09-25 同意把验收装配里的替身换成「接口契约 ＋ 最小提供者」、接口按消费者需要定窄口（[D-063 R-1](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）。三个运行时的正确性（「恰一条」「旧尝试写不进」）都落在会话日志上，**没有这一份，它们的跨 owner 交错没有共同存储对象可指** |
| 为什么不并进某个消费者 | 三个写入方共用同一本日志、同一道栅栏；归哪一方都让另外两方去读它的内部 |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → 身份值、消息、账、块、会话持有租户读面；写入方与读方消费本契约 |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么、不收什么 | [v1 契约](v2/contract.md)第一节 |
| 条目壳里有什么 | [契约 S-6](v2/contract.md#s-6-条目与它的壳) |
| 判重键怎样防「两条」 | [契约 S-8](v2/contract.md#s-8-判重键) |
| 尝试栅栏怎样判 | [契约 S-10](v2/contract.md#s-10-尝试栅栏) |
| 三个操作的九件事 | [契约第四节](v2/contract.md#四操作) |
| 回执丢了怎么办 | [契约 S-22](v2/contract.md#s-22-回执丢失与结果未知) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-21](v2/contract.md#s-21-装配给的保证-vs-协议须给的保证) |
| 消费者的每一条要求落在哪 | [契约第十二节](v2/contract.md#十二消费者核对) |
| 走通的路径与每个失败值的反例 | [examples](v2/examples.md) |
| 行为模型检查什么、前提是什么 | [formal 入口](v2/formal/README.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十节](v2/contract.md#十已知缺口) |

## 版本包

`v2/` 含 `contract.md`、`examples.md` 与 `formal/`（`SessionLog.tla`、一个正配置、五个有效性与可达性配置、入口 README）。**不建 Schema**：载荷形状归各自的 data 契约，条目壳与操作的线上形状归将来投影它的组合契约。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `capability.session-log` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

## 2026-09-27：v3 条件追加候选

新增 [v3 契约](v3/contract.md)、[规范实例](v3/examples.md)、[精确消费者传播](v3/consumer-impact.md) 与 [形式义务](v3/formal/README.md)。本版按 [D-081](../../../record/decisions/model-late-coordination-direction/decision.md) 已采用方向起草，**精确规格尚未接受**，没有新增 provider binding；v2 冻结资源及当前消费者采用保持。append 增加必填 condition 与尾比较零写结果，readByKey/readSince 保持原面；日志仍不解释业务载荷。正式 registry 的候选登记由主线整批核对，本入口不冒充 catalog 已登记。
