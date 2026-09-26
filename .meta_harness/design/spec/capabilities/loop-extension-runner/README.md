# 拓展点协议的操作半边

**在 agent loop 的一个位置上，把挂在那儿的[拓展件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)按次序逐件求值**：
每一件读到前面各件已落的结论，只许改这一位置上还没落盘的那一样；每一件恰留一条结论在会话日志里；
由这些结论合成出这一次经过的效果——照常、否决、停止、问人、再发一次。等人回来之后，从落盘的结论接着走，**不重跑已下过结论的件、不出第二张卡**。

数据那一半（位置、干预力、结论、记录的形状）归 [`data.loop-extension` v2](../../data/loop-extension/v2/contract.md)；
本契约是它的**操作**那一半。Claude Code / Codex hooks 怎样导入成拓展件、兼容件怎样跑来源产品（Claude Code／Codex）的 hook，归 [`capability.hooks-import` v2](../hooks-import/README.md)——
**兼容件对本契约与任何一件原生件没有区别**。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.loop-extension-runner, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`；`family=capabilities`、`topic=loop-extension-runner`、
  `contract_path=spec/capabilities/loop-extension-runner/v2/contract.md`；`resources` 含契约与 `examples.md`；
  依赖十五项：六项数据契约（`data.loop-extension`、`data.messages`、`data.content-blocks`、`data.call-accounts`、`data.model-response`、`data.identity-values`，均为 v1），clauses 取自[契约 S-4](v2/contract.md#s-4-依赖方向与被消费的面)；
  另九项能力契约（`capability.tool-admission`、`capability.model-request-runtime`、`capability.asset-evaluation`、`capability.asset-registry`、`capability.modality-projection`，与 2026-09-25 修订波登记的四份窄口接口契约 `capability.session-log`、`capability.session-tenancy`、`capability.execution-environments`、`capability.assembly-manifest`），消费面见 S-4 末表（`capability.asset-registry` 与 `capability.asset-evaluation` 的 `S-42` 是 2026-09-25 修复波 1b 补登：组装放行输入）；`capability.tool-execution-runtime` 只是定义性引用、不登（会成环）
- **formal-tasks 映射**：无——回放的行为模型**已触发、尚未建**，要检查的七条义务与前提见[契约 S-35](v2/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合)（[G-14](v2/contract.md#十三已知缺口)）
- **提供者/装配映射**：[packages/agent-loop/loop-extension-runner](../../../realization/packages/agent-loop/loop-extension-runner/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。一次经过是什么、链是哪几件按什么次序、逐件求值与先落后算、不可用与报错两分、不可用处置与报错策略的执行、两类合法性判断、效果合成、系统自带件由指定挂件顶上的效果、只跑一轮、注入有界、一批一次会合、回放、各种效果交给谁 |
| 为什么是 capability 而不是 data | 两个操作各有前置、提交点、失败集合与缺席默认；回放是一套跨执行尝试的恢复规则 |
| 为什么不并进数据半边 | 数据半边的失效事件是「形状或合法组合变了」；本契约的失效事件是「求值次序、合成规则或恢复规则变了」。形状被几个能力共用（兼容层导入、系统自带件、状态转移表），规则只归这里 |
| 为什么不并进 agent loop | loop 拥有状态点与终态；一个位置上多件怎样合成出一个效果，对十一个位置同一套、对系统自带件与外来件同一套，换 loop 的实现不应重写它 |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → 数据半边、消息、块、账的归属标识、响应体、身份值；agent loop、系统自带件、兼容件读本契约 |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 一次经过怎么指认、链从哪来、系统自带件怎么挂 | [契约 S-5～S-7](v2/contract.md#s-5-一次经过) |
| 一个位置上多件的结论怎么合成出一个效果 | [契约 S-15](v2/contract.md#s-15-效果怎么合成) |
| 一件拓展件不可用时按什么处置：租户件按声明、系统自带件由指定挂件顶上 | [契约 S-12](v2/contract.md#s-12-不可用与报错runner-怎么分)、[S-17](v2/contract.md#s-17-系统自带件不可用时一律关门) |
| 一批动作怎样一次调齐、放行判断一轮一次 | [契约 S-29](v2/contract.md#s-29-一批动作每个动作一次经过) |
| 等人回来之后怎样接着走、为什么不出第二张卡 | [契约 S-28](v2/contract.md#s-28-回放) |
| 两个操作的前置、提交点、失败集合与缺席默认 | [契约第四节](v2/contract.md#四操作) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-32](v2/contract.md#s-32-装配给的保证-vs-协议须给的保证) |
| 走通的路径与关键收场 | [examples](v2/examples.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十三节](v2/contract.md#十三已知缺口) |

## 版本包

`v2/` 含 `contract.md` 与 `examples.md`。**不建 Schema**：本契约交换与记下的形状全部属 `data.loop-extension` v2 与 `data.messages` v2；
`DispatchResult` 与五种效果的线上形状归把这些操作送过进程边界的那份 composition。**本版还没有 `formal/`**：回放要建行为模型（D-060 S15-c），`Runner.tla` **已触发、尚未闭合**，要检查的性质与前提在[契约 S-35](v2/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合)，证据状态在[验证入口](verification.md)（[G-14](v2/contract.md#十三已知缺口)）。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `capability.loop-extension-runner` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。
