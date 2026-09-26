# 到达事件

**一条消息分次到达时，生产的一方交出的那串事件长什么样**：信封说它属于哪条流，六种事件——开块、填、封口、砍、记账、收尾——
各自带什么，一条流里能以什么次序出现，以及一个事件不合形状时的拒绝值叫什么。

**一份语法，两个生产者**：模型的回复（长成 `AssistantMessage`）与工具的执行帧（长成 `ToolInternalMessage`）走同一套；
它是 core 三层（[D-035](../../../record/decisions/message-and-stream-baseline/README.md)）里的第二层——
语法借 `StreamChunk` 的骨架并条款化。**按它把一条流装配起来的是 `capability.stream-assembly`**，那是本语法唯一的消费方式；
装配状态由宿主（模型请求运行时、工具执行运行时）持有，包成哪种消息也归宿主。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.arrival-events, 1)`
- **状态**：`candidate`——未接受、未冻结，不得据此发布或声称消费者已采用；候选期内原地改过多次（整批对齐、两轮评审修复），逐次见[验证入口「变化的影响」](verification.md#变化的影响)
- **catalog 映射**：已登记为 `candidate`（`acceptance` 为 `null`）。`family=data`、`topic=arrival-events`、
  `contract_path=spec/data/arrival-events/v1/contract.md`，`resources` 另含 `v1/arrival-events.schema.json` 与 `v1/examples.md`；
  依赖四项：`data.content-blocks` v1、`data.call-accounts` v1（含 `ModelCallId`，S-37）、`data.loop-extension` v1（`FailureCause`，S-17）与 `data.identity-values` v1（S-33），消费 clauses 见[契约头部](v1/contract.md)。
  **登记在 [registry](../../../registry/README.md)，本行只作索引**
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。语法被装配器、传输适配、发帧原语与会话出站流共享，写两遍必然分叉；[D-035](../../../record/decisions/message-and-stream-baseline/decision.md) 定了「语法借骨架并条款化」且三层落 core、先于两个运行时的契约 |
| 稳定身份 | `data.arrival-events`，版本 1 |
| 适用范围 | 一个部署之内的一条条到达流；跨进程后要由协议重新兑现的，逐行列在[契约 S-25](v1/contract.md#s-25-装配给与协议给) |
| 为什么是 data 而不是 capability | 它定义值与值序列的合法性，**没有操作、没有自己的状态、不做判定**；持有在途状态、收尾交出消息的是 `capability.stream-assembly` |
| 精确依赖 | `data.content-blocks` v1（块）、`data.call-accounts` v1（账与砍的原因、模型调用的标识）、`data.loop-extension` v1（成因 `FailureCause`，S-17）、`data.identity-values` v1（S-33 表示层校验与判定分开的口径）。`data.messages` v1 的 S-14、S-10 只以坐标指路（帧流与回复流结局的对应表），不登依赖 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换表示 | [v1 Schema](v1/arrival-events.schema.json) |
| 一个事件长什么样、什么会被拒、拒绝值叫什么 | [v1 正反实例](v1/examples.md) |
| 一条流里能以什么次序出现 | [契约第四节](v1/contract.md#四语法一条流里的次序) |
| 工具帧比模型回复多出哪几条 | [S-23](v1/contract.md#s-23-执行帧的另外四条) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#九已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`arrival-events.schema.json`、`examples.md`。

**本包不建 `formal/`。**序列的行为——多块并开、交错、收尾、放弃、「一次装配 == 一次性到达」——恰是装配的行为，
它的行为模型在 `capability.stream-assembly` v1 的 `formal/Assembly.tla`；**本契约不另造一份平行的状态机**，单个信封的结构约束 Schema 本身判得了。
本契约触发的义务在[验证入口](verification.md)登记，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。
