# 2026-09-18 · legacy 的 system reminder 机制

**这是原始材料，不是结论，更不是依据。**
本 topic 的每一条都能在 [decisions.md](../decisions.md) 找到裁决出处或独立推理链。

来源：`omne-next/omne_harness/libs/omne_harness_agentic/.../context/`，2026-09-18 读。

## 一、那边的做法：封套，不是消息类型

`system_reminder.py` 的模块说明写得很清楚：

> **The runtime *dynamic-injection* member of the shared envelope family** …
> Every system-authored message injected into a live turn … **rides this envelope
> with `role=Human`**, so the model can always tell an injected observation from
> something the user actually said.

三件事：

| | legacy 的做法 |
|---|---|
| 它是什么 | **一个 XML 封套**（`<system_reminder>`），不是一种消息类型 |
| 怎么承载 | **`role=Human`**——就是一条用户消息 |
| 为什么要它 | **让模型分得出「注入的观察」与「用户真的说的话」** |

**第三条是目的，前两条是手段。**本 topic 认同那个目的，**换了手段**——
理由见 [decisions](../decisions.md)。

## 二、有个兄弟：`system_notice`

同一个 family 的另一个封套，用于**冷启动重建**（cold-start reconstruction）。
它的属性字段里有 `notice_type` / `tool_call_id` / `role`——
因为重建历史时要表示「这个位置原本是一条什么」。

**我们不需要这一个。**[PF-012 定了「喂给 agent 的是记录原样，零追加零注入」](../../PF-012-agent-loop-and-run/design.md#63-喂给-agent-的是日志原样)——
恢复就是把记录读出来，**没有「重建」这个动作，也就没有要重建的东西**。

> **那边需要 notice，是因为它要重建；我们把记录当唯一真相，就不必重建。**

## 三、两条值得借鉴的细节

### 3.1 封套的转义由框架拥有，生产者伪造不了

原文：

> the framework owns attribute escaping, body escaping (`&` / `<` / `>` become
> character entities) and 2-space indentation. **Producer-supplied content therefore
> cannot forge or break the envelope**, and the two envelopes share one sanitization
> implementation point rather than each hand-rolling their own.

**这不是实现细节，是安全语义。**一个工具的返回里如果能带上闭合标签，
它就能**冒充系统说话**——而 agent 没有任何办法分辨。

### 3.2 presence-only 标记：同一个事实不要有两种写法

那边的 `stale` 与 `partial` 都是「有则有、无则无」，不渲染否定形式。原文注释：

> a fresh envelope omits the attribute rather than rendering its negation:
> **an absent attribute and `stale="false"` would be two spellings of one fact,
> and the model would have to learn both.**

**「同一个事实两种写法」是要 agent 付学费的**——而那笔学费每一轮都要交一次。

## 记录边界

- 本篇是 **PM 的提炼摘要**，不是任何人的裁决。
- **legacy 的做法不构成本 topic 的依据**，只作起点与印证。
- 读取时间 2026-09-18；legacy 仓库持续演进，**引用请核对当时的来源**。
