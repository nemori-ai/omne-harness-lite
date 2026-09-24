# 拓展点协议的数据半边

**Agent Loop 上挂拓展件的那一套，交换的东西长什么样**——十一个位置与两个维度、干预力三档、
一件拓展件的声明、运行时交给它的输入、它交回的结论（封闭八种）、结论落日志的记录。

它与 runner 分开，因为两者的失效事件不同：**形状与合法组合**变了，所有拓展件作者、兼容层、状态转移表都要跟着改；
**瀑布怎么走、回放怎么跑**变了，只动 runner。操作那一半是 `capability.loop-extension-runner`。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.loop-extension, 1)`
- **状态**：`candidate`，2026-09-23 起草、同日按主线裁定原地修订一次，2026-09-24 整批对齐再原地改一次（[变化的影响](verification.md#变化的影响)）；**未接受、未冻结**，不得据此发布或声称消费者已采用
- **catalog 映射**：已登记为 `candidate`（`acceptance` 为 null）。`family=data`、`topic=loop-extension`、
  `contract_path=spec/data/loop-extension/v1/contract.md`，`resources` 另含同目录的 `loop-extension.schema.json` 与 `examples.md`；
  `dependencies` 列八项——两项已接受（`data.identity-values`、`data.offer-expiry`），六项是候选
  （`data.content-blocks`、`data.messages`、`data.model-profile`、`data.call-accounts`、`data.tool-definition`、`data.asset-model`），
  消费 clauses 按[契约头部的依赖表](v1/contract.md)登为条款号（2026-09-24 整批对齐由 `$defs` 名换成条款号）；`data.call-accounts` 那一项另含运行与执行尝试的标识 `RunId`、`AttemptId`（[验证入口「变化的影响」](verification.md#变化的影响)）
- **提供者/装配映射**：**尚无**。它是纯数据契约，提供者会是 core 下的一个纯模块（形状、Schema 校验、两张合法组合表的判定）；节点未立

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。拓展件作者（装配进来的与外部命令）、runner、状态转移表、系统自带五件、资产领域都读同一套位置、结论与记录；写两遍必然分叉 |
| 稳定身份 | `data.loop-extension`，版本 1 |
| 适用范围 | 一个部署之内、一个会话的日志上；跨进程后由协议重新兑现的那几条在[契约第十节](v1/contract.md#十装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有状态转移、没有提交点。有行为的是 runner |
| 精确依赖 | 七项，见[契约抬头](v1/contract.md)；五项是同批候选 |
| 谁在等它 | `capability.loop-extension-runner`、`capability.hooks-import`、`capability.tool-admission`、`capability.model-request-runtime`、`data.model-response` 与 `data.arrival-events`（`$ref` `FailureCause`）、PF-002 资产领域 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/loop-extension.schema.json) |
| 一个声明、一条结论长什么样，什么会被拒 | [v1 正反实例](v1/examples.md)，含四个完整走查 |
| 某个位置能交回哪几种结论 | [档 × 结论](v1/contract.md#s-20-档与结论的合法组合)、[位置 × 结论](v1/contract.md#s-21-位置与结论的合法组合) |
| 我在写拓展件，要额外守什么 | [S-35 跨过一次等待只能带已落日志的东西](v1/contract.md#s-35-跨过一次等待只能带已落日志的东西) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#十四已知缺口)：开着的是 G-1～G-7、G-13、G-15～G-17；G-8～G-12、G-14 已按主线裁定关闭（待产品负责人确认） |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`loop-extension.schema.json`、`examples.md`。

**本包不建 `formal/`**：两张合法组合表是有限结构，已在 Schema 里逐格写死、在 examples 末节逐格对照，
Alloy 只会重述它们；行为性质（回放一致、先落后算、同一次经过只跑一轮）的模型归 runner 能力。
理由全文在[契约第十六节](v1/contract.md#十六版本差异与规范工件)；已触发的义务在[验证入口](verification.md)，状态「未开始」。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。
