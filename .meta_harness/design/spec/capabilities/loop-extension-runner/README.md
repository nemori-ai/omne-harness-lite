# 拓展点协议的操作半边

**在 agent loop 的一个位置上，把挂在那儿的[拓展件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)按次序逐件求值**：
每一件读到前面各件已落的结论，只许改这一位置上还没落盘的那一样；每一件恰留一条结论在会话日志里；
由这些结论合成出这一次经过的效果——照常、否决、停止、问人、再发一次。等人回来之后，从落盘的结论接着走，**不重跑已下过结论的件、不出第二张卡**。

数据那一半（位置、干预力、结论、记录的形状）归 [`data.loop-extension` v1](../../data/loop-extension/v1/contract.md)；
本契约是它的**操作**那一半。Claude Code / Codex hooks 怎样导入成拓展件、兼容件怎样跑宿主 hook，归 [`capability.hooks-import` v1](../hooks-import/README.md)——
**兼容件对本契约与任何一件原生件没有区别**。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.loop-extension-runner, 1)`
- **状态**：`candidate`（2026-09-23 起草），**未经独立评审、未接受、未冻结**
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=loop-extension-runner`、
  `contract_path=spec/capabilities/loop-extension-runner/v1/contract.md`；`resources` 含契约与 `examples.md`；
  依赖六项（`data.loop-extension`、`data.messages`、`data.content-blocks`、`data.call-accounts`、`data.model-response`、`data.identity-values`，均为 v1），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)。
  **另四项依赖尚未登记**：`capability.tool-admission`、`capability.model-request-runtime`、`capability.asset-evaluation`、`capability.modality-projection` 与本契约并行起草，
  本分支的 catalog 里还没有它们的坐标（检查器拒绝未知坐标）——**合流对齐时补登**，消费面见 S-4 末表
- **formal-tasks 映射**：无——本版不建形式工件，理由与张力见[契约 S-35](v1/contract.md#s-35-本版不选用形式工件)
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。一次经过是什么、链是哪几件按什么次序、逐件求值与先落后算、不可用与报错两分、报错策略的执行、两类合法性判断、效果合成、系统自带件不可用时关门、只跑一轮、注入有界、回放、各种效果交给谁 |
| 为什么是 capability 而不是 data | 两个操作各有前置、提交点、失败集合与缺席默认；回放是一套跨执行尝试的恢复规则 |
| 为什么不并进数据半边 | 数据半边的失效事件是「形状或合法组合变了」；本契约的失效事件是「求值次序、合成规则或恢复规则变了」。形状被几个能力共用（兼容层导入、系统自带件、状态转移表），规则只归这里 |
| 为什么不并进 agent loop | loop 拥有状态点与终态；一个位置上多件怎样合成出一个效果，对十一个位置同一套、对系统自带件与外来件同一套，换 loop 的实现不应重写它 |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → 数据半边、消息、块、账的归属标识、响应体、身份值；agent loop、系统自带件、兼容件读本契约 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 一次经过怎么指认、链从哪来、系统自带件怎么挂 | [契约 S-5～S-7](v1/contract.md#s-5-一次经过) |
| 一个位置上多件的结论怎么合成出一个效果 | [契约 S-15](v1/contract.md#s-15-效果怎么合成) |
| 系统自带件不可用时为什么不「跳过」 | [契约 S-17](v1/contract.md#s-17-系统自带件不可用时一律关门) |
| 等人回来之后怎样接着走、为什么不出第二张卡 | [契约 S-28](v1/contract.md#s-28-回放) |
| 两个操作的前置、提交点、失败集合与缺席默认 | [契约第四节](v1/contract.md#四操作) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-32](v1/contract.md#s-32-装配给的保证-vs-协议须给的保证) |
| 走通的路径与关键收场 | [examples](v1/examples.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十三节](v1/contract.md#十三已知缺口) |

## 版本包

`v1/` 含 `contract.md` 与 `examples.md`。**不建 Schema**：本契约交换与记下的形状全部属 `data.loop-extension` v1 与 `data.messages` v1；
`DispatchResult` 与五种效果的线上形状归把这些操作送过进程边界的那份 composition。**不建 `formal/`**：施工简报裁定不触发，与数据半边的交接有张力，已登缺口（[G-14](v1/contract.md#十三已知缺口)）。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
