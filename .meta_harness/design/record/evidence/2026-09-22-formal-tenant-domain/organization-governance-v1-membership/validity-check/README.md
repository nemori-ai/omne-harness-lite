# 有效性核对：`Serialized = FALSE` 下必须出反例

**这一次执行不是一个形式任务，它的结果是一个反例，而且反例正是预期。**
放在这里而不是另起一个任务目录，是因为它与同级目录那次执行**只有配置一处不同**，
且**两者必须成对报告**：只报正配置无反例，读者无从判断那条不变量是不是平凡的。

## 为什么它不登记为 formal task

[`registry/formal-tasks.json`](../../../../../registry/README.md) 里的任务由
`check_design.py --formal run` 实际执行，**退出码非零即判失败**
（`design_validation.py` 的 `_formal`：`if completed.returncode: raise Invalid(...)`）。
本次执行的退出码是 **12**（TLC 发现不变量违反）。
把一条「期望失败」的检查登记进那份清单，与清单的语义相反——
[契约 formal 入口对另一处同形情况写过同一句话](../../../../../spec/compositions/account-registration/v1/formal/README.md#有效性核对)。

因此它作为证据保存、被两份 `verification.md` 引用，但**不进 `formal-tasks.json`**。

## 这次跑了什么

- **模型**：[`input/Membership.tla`](input/Membership.tla)，与同级任务目录**逐字节相同**
  （两处 [`SHA256SUMS`](input/SHA256SUMS) 的 `Membership.tla` 摘要一致）。
- **配置**：[`input/Membership_NoSerialization.cfg`](input/Membership_NoSerialization.cfg)，
  `Actors = {a1, a2}`、**`Serialized = FALSE`**、`CHECK_DEADLOCK FALSE`。
- **结果**：`Invariant AtLeastOneSuperAdministrator is violated.`，**退出码 12**。
  149 states generated、78 distinct、18 states left on queue、depth 6——
  **状态空间没有被穷尽**：TLC 在找到第一个反例时就停了，队列里还剩 18 个状态。
  原文在 [`output/tlc-Membership_NoSerialization.log`](output/tlc-Membership_NoSerialization.log)。
- **反例轨迹**：五个状态。两位有效超管各自 `Stage` 一次「移除对方」（各自的前置在各自看来都成立），
  随后各自 `Apply`，`effective` 从 `{a1, a2}` 走到 `{a1}` 再走到 `{}`。
  TLC 生成的轨迹探索规格在
  [`output/Membership_TTrace_1790075224.tla`](output/Membership_TTrace_1790075224.tla)
  与同名 `.bin`。

## 这次执行支持什么结论，不支持什么

**支持**：在这个模型、这个规模上，
[S-17 的序列化](../../../../../spec/capabilities/organization-governance/v1/contract.md#s-17-同一组织的成员写入序列化)
**不是平凡的**——去掉它，`AtLeastOneSuperAdministrator` 在 6 步之内就被违反。
同级目录那次「无反例」因此不是「没人动得了它」。

**不支持**：这条反例不说明任何实现有这个缺陷，也不说明序列化在真实存储上被兑现了。
「存储兑现序列化」是[模型的前提，由提供者承担](../../../../../spec/capabilities/organization-governance/v1/formal/README.md#tla-与-tlc)。

## 反例与产品正文的对应

[formal 入口要求](../../../../../spec/capabilities/organization-governance/v1/formal/README.md#tla-与-tlc)
反例轨迹须与 [PF-001 flows §3.3](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)
描述的局面对得上：两位超管各自动作、各自看都合法、合起来把超管清空。
上面那五个状态**逐条对得上**，因此不是抽象错了。
**这一步是人读轨迹做的判断，不是工具输出的一部分。**

返回[本次运行](../../README.md)。
