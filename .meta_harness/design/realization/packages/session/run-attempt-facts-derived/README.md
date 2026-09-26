# run-attempt-facts-derived

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.run-attempt-facts · v2`（[契约](../../../../spec/capabilities/run-attempt-facts/v2/contract.md)，状态 `accepted`，已接受、已冻结）的**全部条款**（S-5～S-12，一个读），作为它第十一节说的「本版的最小提供者」（[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1）
- 源码位置：`packages/session/run-attempt-facts-derived`——**尚未建包**。第一层 `session` 已由产品负责人接受（[D-064 ⑱](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md)）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是从会话日志条目折叠两件事实的纯函数与作答的纯函数，以及不依赖 Cordis 的闭包 `createRunAttemptFacts`（候选名，给它任一有 `readSince` 的会话日志即可用）；**Cordis 服务面** `runAttemptFacts` 是闭包的一种消费者（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber，必需 inject `sessionLog`，不 inject `storage`、不 inject `clock`**；**不另存表**（[D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-37 ④）：「已被取代」与「这次尝试在日志里」从 `sessionLog.readSince` 交回的条目壳算出。
  「已终结」要认得出运行终结记录，而那条记录的形状没有定（契约 [G-3](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#十已知缺口)）：**产品装配里不给认法，凡读得到这次尝试的调用一律 `unavailable`**；验收装配把「代 loop 写终结的那一方」所用的认法作为配置交进来（[关键选择二](design.md#关键选择)）。
  **只兑现窄口，不扩展契约**：只答两件事实，不答终态是哪一种、原因，也不写任何记录。
  它**取代**据点装配[验收装配](../../../apps/cli/design.md#验收装配)里「尝试与运行的事实」那个替身；**真承接者**是会话日志与 loop 那一程（契约 G-1，据点装配缺口 C-16）。产品据点清单本版不装它（据点装配[关键选择 5](../../../apps/cli/design.md#关键选择)）

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：本节点声称兑现的条款逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)。**尚未建包、没有一行源码**。
  **有前提**：「已终结」只在给了认法的装配里答得出（本版只有验收装配，缺口 AFD-1）；与执行宿主落账之间**没有共同存储对象**，漏标 `late` 的窗口本节点闭合不了（契约 G-2，缺口 AFD-2）；答案的正确性依赖会话日志提供者的读（[`session-log-jsonl`](../session-log-jsonl/README.md)，同批节点，尚未建包）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约本版不建形式工件（契约 S-13），没有可绑的 formal task；本节点没有源码、没有测试
- 实际验证：**尚无**

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 两件事实怎样从日志算、「已终结」从哪来、为什么缓存是精确的 | [实现设计](design.md) |
| 对会话日志提供者要什么 | [实现设计：要求](design.md#对会话日志提供者的要求) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
