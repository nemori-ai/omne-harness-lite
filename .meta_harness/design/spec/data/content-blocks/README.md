# 内容块

**一条消息装的那串块里，每一块是什么、带什么、怎么指认、哪些组合非法。**
七类块、两个标注、块的模态怎么判、工具调用与工具结果、执行收场与占位原因、派生表示与 transcript、
指向存储里一份字节的引用——以及一个值不合形状时，拒绝值叫什么。

它是 core 三层（[D-035](../../../record/decisions/message-and-stream-baseline/README.md)）里**被其余全部引用的那份共用数据契约**：
消息、到达事件、流装配、工具运行时、模型请求运行时与上下文组装都引用它的 `$defs` 名与成员名，**不各自复述一份**。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.content-blocks, 1)`
- **状态**：`candidate`——未接受、未冻结，不得据此发布或声称消费者已采用
- **catalog 映射**：已登记为 `candidate`（`acceptance` 为 `null`）。`family=data`、`topic=content-blocks`、
  `contract_path=spec/data/content-blocks/v1/contract.md`，`resources` 另含 `v1/content-blocks.schema.json` 与 `v1/examples.md`；
  依赖一项：`omne-harness-lite-design-2026-09-15 · data.identity-values · v1`，消费 clauses `S-31`、`S-34`。**登记在 [registry](../../../registry/README.md)，本行只作索引**
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。块被六类消费者共享，写两遍必然分叉；[D-035](../../../record/decisions/message-and-stream-baseline/decision.md) 定了数据契约自研、三层落 core、先于两个运行时的契约定型 |
| 稳定身份 | `data.content-blocks`，版本 1 |
| 适用范围 | 一个部署之内，块出现在哪里都一样；跨进程后要由协议重新兑现的，逐行列在[契约第四节](v1/contract.md#四装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有提交点、没有状态转移、没有自己的授权前提。块怎样到达、怎样落盘、怎样被组装，归各自的契约 |
| 精确依赖 | `data.identity-values` v1 的 `#S-31`（不透明标识的交换表示，按散文自写形状、不跨契约 `$ref`）与 `#S-34`（地址不是身份）；**不依赖 `data.offer-expiry`**——块上本版没有时间点；**不反向依赖任何引用它的契约**（能力标识名、命令名的词法只指路，见契约 G-5）。**定义性引用，不登 catalog 依赖**：[S-8](v1/contract.md#s-8-文本块与来源标记) 的两个来路 `slash_command_expansion`、`slash_command_record` 的所指由 `data.slash-command` v1 的 S-21、S-25 给出，而那份契约依赖本契约——登记会让依赖图成环；那两条改了所指，本契约同轮复核（[验证入口](verification.md#对齐义务)） |
| 谁在等它 | 全批其余契约几乎都引用它（消息、到达事件、流装配、账、模型响应、工具定义、模型档案、资产模型与各类正文、两个运行时、模态投影）；PF-010 组装尚无契约。完整清单见[契约的消费者表](v1/contract.md#消费者)——**那里是唯一的一份**；精确的消费 clauses 以 catalog 为准 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/content-blocks.schema.json) |
| 一个块长什么样、什么会被拒、拒绝值叫什么 | [v1 正反实例](v1/examples.md) |
| 一个值有好几处不对，报哪个拒绝值 | [S-26 表示层拒绝值](v1/contract.md#s-26-表示层拒绝值)与[实例第 12 节](v1/examples.md#12-几处违例同时出现时取哪个拒绝值) |
| 我是写块的一方，哪些事我不能替别人补 | [S-27](v1/contract.md#s-27-表示层拒绝不是判定也不修补)与[缺席怎么收](v1/contract.md#七缺席怎么收) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#八已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`content-blocks.schema.json`、`examples.md`——
**实例是规范工件，不是说明材料**：条款的边界有一半靠「什么被拒、拒绝值叫什么」说清楚。

**本包不建 `formal/`。**本契约没有状态转移；它的结构约束 Schema 本身就能判，建模型只会得到一份与 Schema 同义的平行工件。
[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务是 Schema 正反实例校验、接收边界校验、规范场景与静态检查，在[验证入口](verification.md)登记，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。
