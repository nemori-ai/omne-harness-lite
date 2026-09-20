# 从根 `docs/proposals/` 取回的形式模型

2026-09-20，在准备清理承载仓库根 `docs/` 之前取回的三份模型。
根 `docs/` 的目标职责是**源码使用和维护说明**，提案与其证据不属于那里；
但清理之前得先把**别处没有**的东西拿出来。

> **取回来的只是「可能有用」，所以暂时留着。**
> **不是必须被用到的，也不代表一定就有价值。**
> 读完判断用不上就删——**不需要先证明它没用**。

## 取回了什么

| 目录 | 模型 | 编码的是 | 今天谁可能用得上 |
|---|---|---|---|
| [`inbound/`](inbound/) | `Inbound`（228 行）+ `InboundMC` + 两份配置 | 输入**怎么进来、怎么排、什么时候被取走** | **[PF-014 输入的受理与排队](../../../design/product/README.md#已排定尚未开题的编号)**——已排编号、尚未开题 |
| [`agent-runtime-baseline/`](agent-runtime-baseline/) | `AgentRegistry`（99 行）+ 配置 | 运行中的 agent **怎么登记、怎么被找到** | [PF-004 装配与存活](../../../design/product/PF-004-agent-runtime-assembly-and-liveness/README.md) |
| 同上 | `InitiatorScope`（74 行）+ 配置 | **发起者的范围**——谁以什么身份发起了这件事 | [PF-001 身份与范围](../../../design/product/PF-001-identity-scope-and-agent-constraints/README.md)、[PF-007 的派发](../../../design/product/PF-007-meta-capabilities/README.md) |

**`Inbound` 那份价值最直接**：PF-014 要回答的正是同一批问题，而本设计链里
**没有任何一个模型编码过队列这一侧**（同一天从根 `spec/` 取回的
[`QueueControl`](../../spec/capabilities/session-run/RETAINED.md) 是另一个角度——
它管取批与强停，`Inbound` 管进来与排序，两份互补）。

## 没取什么

根 `docs/proposals/` 下其余的 `.tla` 与 `.cfg`——`Cursor`、`ToolCall`、`CursorMC` 等——
**本设计链里已有同一份内容或更新的版本**，没有取。
`ToolCallMC` 那份是提案阶段的简化版（21 行），[spec 侧的完整版](../../spec/capabilities/tools/v1/formal/ToolCallMC.tla)
多了 `QuiescenceSafe` 断言，也没有取。

## 它们不是什么

- **不是接受依据。**提案证据说明「当时按这个模型算过」，**不说明结论被接受了**。
- **不是当前契约。**它们连 spec 都不是，是提案阶段的证据材料。
- **不保证跑得起来。**本次迁入没有重新运行；`.cfg` 引用的常量在原提案目录里，
  那些散文没有一起取回来。
- **原件未改。**文件内容一字未动，只换了位置。

## 原提案怎么找回

```sh
git log --oneline -- docs/proposals/session-run-agent-lifecycles
git show <sha>:docs/proposals/session-run-agent-lifecycles/README.md
```

**历史里有，不等于将来有人会去翻。**所以只有判断「可能还用得上」的模型被取到工作区，
配套的提案散文留在历史里是有意的取舍。
