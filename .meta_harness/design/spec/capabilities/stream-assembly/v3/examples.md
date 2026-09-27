# 规范实例：到达装配、结算与失败值

本文件是 `capability.stream-assembly` v3 的规范工件，不是说明材料。每节给一串**交给 `accept` 的事件**（已经过发出一侧的节流）、
逐步的位置，以及**手算的**快照或结算结果。事件的形状照 `data.arrival-events` v2，块的形状照 `data.content-blocks` v3，账照 `data.call-accounts` v2。

**读法**：

- 「位置」是接受这个事件**之后**的位置（[S-5](contract.md#s-5-位置)）；被拒的事件不占位置，写「—」。
- 结果里的 JSON 是**含义的记法**：本能力不发布 Schema，线上形状归组合契约；块、账的 JSON 各是那两份 data 契约的合法值。
- 为了省篇幅，标注写成 `H1M0` 表示 `{"toHuman": true, "toModel": false}`，`H1M1`、`H0M0` 类推；它们在真实值里都是完整的对象。
- 这些结果**只由起草者手算**，未经任何实现或模型运行（[验证入口](../verification.md) V-2）。

## 1. 目录

| 节 | 演示什么 | 条款 |
|---|---|---|
| [2](#2-并开两块一次砍一次整体替换) | 帧流：两块同时开着、一次合并、一次整体替换整交；快照；结算；一次性形式 | S-7、S-9、S-13、S-14、S-16、S-27 |
| [3](#3-同一段流被中断) | 第 2 节的流在封口前被中断：开着的块按已到的样子落 | S-9 |
| [4](#4-一次完整的模型回复) | `data.arrival-events` v2 examples 第 12 节那条流：解析一次、账 | S-10、S-13 |
| [5](#5-失败值逐个) | 每个失败值、几处违例时取哪个 | S-23～S-25 |
| [6](#6-用户叫停与放弃) | 模型侧叫停：半截调用、缺账记全未知；放弃 | S-9、S-13、S-22 |
| [7](#7-解析不了与被砍过) | 解析不了只标记；被砍过内容的调用落成半截；先截短后拒收只计一次；严格解析（重复键、大整数） | S-10、S-11、S-12、S-14 |
| [8](#8-首个内容排除空载荷) | 空串的填不算开口；相等不含首个内容 | S-16、S-27 |
| [10](#10-工具名字符集与长度都先于参数解析) | 字符集坏名、129字符坏名与128字符/普通合法名的解析边界 | S-10、S-11 |

## 2. 并开两块、一次砍、一次整体替换

**目标**：`{"kind": "tool_execution", "callId": "call_9"}`（一个构建工具，先往外吐日志，同时开一块截图面板）。

**工具实际交出的帧**有九个：开日志块、日志「a」、开面板、日志「b」、日志「c」、面板第一张图、面板第二张图、封日志块、封面板。
发出一侧的节流把相邻的日志「b」「c」合成一个填，并说了一个 `rate_merged`（[S-15](contract.md#s-15-节流在到达装配之前投递一侧的节流不进账)）。**交给 `accept` 的是下面十个事件**：

| # | 事件 | 位置 | 说明 |
|---|---|---|---|
| 1 | `{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_log", "visibility": H1M0}` | 1 | 日志块，追加 |
| 2 | `{"t": "fill", "index": 0, "payload": "compiling a\n"}` | 2 | **第一个内容步骤** ⇒ `firstContentAt = 2`（[S-16](contract.md#s-16-首个内容的位置)） |
| 3 | `{"t": "open", "index": 2, "kind": "image", "fill": "replace", "id": "b_shot", "visibility": H1M0, "head": {"mediaType": "image/png"}}` | 3 | **两块同时开着**；索引跳过 1 是合法的 |
| 4 | `{"t": "fill", "index": 0, "payload": "compiling b\ncompiling c\n"}` | 4 | 两段合成的一个填 |
| 5 | `{"t": "trim", "index": 0, "reason": "rate_merged", "merged": 1}` | 5 | 两个合一，记 `2 − 1 = 1` |
| 6 | `{"t": "fill", "index": 2, "payload": {"kind": "image", "id": "b_shot", "visibility": H1M0, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_1", "mediaType": "image/png"}}}` | 6 | 整交一整张图（帧里只许引用） |
| 7 | `{"t": "fill", "index": 2, "payload": {"kind": "image", "id": "b_shot", "visibility": H1M0, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_2", "mediaType": "image/png"}}}` | 7 | **整体替换**：此刻面板是 `obj_2` |
| 8 | `{"t": "close", "index": 0, "block": {"kind": "text", "id": "b_log", "visibility": H1M0, "text": "compiling a\ncompiling b\ncompiling c\n"}}` | 8 | 封口块等于归约（生产者义务） |
| 9 | `{"t": "close", "index": 2, "block": {"kind": "image", "id": "b_shot", "visibility": H1M0, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_2", "mediaType": "image/png"}}}` | 9 | **封口次序不改变块次序** |
| 10 | `{"t": "finish", "reason": "end"}` | 10 | 工具侧没有 `account` |

**第 7 个事件之后的快照**（[S-7](contract.md#s-7-快照交出什么)）：

```json
{
  "blocks": [
    { "index": 0, "closed": false,
      "opened": { "kind": "text", "fill": "append", "id": "b_log", "visibility": "H1M0" },
      "content": "compiling a\ncompiling b\ncompiling c\n" },
    { "index": 2, "closed": false,
      "opened": { "kind": "image", "fill": "replace", "id": "b_shot", "visibility": "H1M0", "head": { "mediaType": "image/png" } },
      "content": { "kind": "image", "id": "b_shot", "visibility": "H1M0", "mediaType": "image/png",
                   "data": { "storage": "attachments", "key": "obj_2", "mediaType": "image/png" } } }
  ],
  "position": 7,
  "firstContentAt": 2
}
```

**开着的追加块已到的三行在快照里**；面板是最后一次填的那张。观察者拿到它，从第 8 个被接受的事件接着收。

**`closeOut` 的结果**：

```json
{
  "blocks": [
    { "kind": "text", "id": "b_log", "visibility": "H1M0", "text": "compiling a\ncompiling b\ncompiling c\n" },
    { "kind": "image", "id": "b_shot", "visibility": "H1M0", "mediaType": "image/png",
      "data": { "storage": "attachments", "key": "obj_2", "mediaType": "image/png" } }
  ],
  "account": {
    "frames": {
      "emitted": 9,
      "trims": { "merged": 1, "cut": 0, "omittedBytes": 0,
                 "byReason": { "rate_merged": 1, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0 } }
    }
  },
  "ending": { "reason": "end", "firstContentAt": 2 }
}
```

**手算**：

- **块**：两块都封了口，各取封口块（[S-9](contract.md#s-9-一块怎样落) 第一行）；次序是开块次序 0、2。
- **汇总**（[S-14](contract.md#s-14-砍的汇总)）：`merged = 1`；`byReason.rate_merged = merged = 1`；没有截短、限额、拒收，`cut = 0`、`omittedBytes = 0`。
  `data.call-accounts/v2#S-15` 三式：`1 = 1`；`0 + 0 = 0`；`cut = 0 ∧ frame_too_long = 0 ⇒ omittedBytes = 0` ✓。
- **`emitted`**（[S-13](contract.md#s-13-账)）：接受的 `open`、`fill`、`close` 是事件 1、2、3、4、6、7、8、9，共 **8** 个；加 `merged = 1`、`cut = 0`，得 **9**——正是工具实际交出的九帧。
  `merged + cut + frame_too_long = 1 ≤ 9` ✓。
- **结局**：`reason` 照收尾；第一个内容步骤是位置 2 的那个填。

**一次性形式**（[S-27](contract.md#s-27-一次到达装配等于一次性到达)）：

| # | 事件 |
|---|---|
| 1 | 同上第 1 个（开日志块） |
| 2 | `{"t": "fill", "index": 0, "payload": "compiling a\ncompiling b\ncompiling c\n"}`——日志块全部填的归约 |
| 3 | 同上第 8 个（封日志块） |
| 4 | 同上第 3 个（开面板） |
| 5 | 同上第 7 个的填——面板的归约是最后一次填 |
| 6 | 同上第 9 个（封面板） |
| 7 | `{"t": "finish", "reason": "end"}` |

它也被逐个接受（索引 0、2 递增），`closeOut` 交出的 `blocks` 与上面**逐字相同**，`ending.reason` 相同。
不同的是 `account.frames`（`emitted = 6`、汇总全零）——**它们不在相等里**：一次性到达没有被合并过。

## 3. 同一段流被中断

第 2 节的前七个事件照旧，然后执行一侧的运行时交来 `{"t": "finish", "reason": "interrupted"}`（位置 8）。两块**都没封口**。

```json
{
  "blocks": [
    { "kind": "text", "id": "b_log", "visibility": "H1M0", "text": "compiling a\ncompiling b\ncompiling c\n" },
    { "kind": "image", "id": "b_shot", "visibility": "H1M0", "mediaType": "image/png",
      "data": { "storage": "attachments", "key": "obj_2", "mediaType": "image/png" } }
  ],
  "account": { "frames": { "emitted": 7, "trims": { "merged": 1, "cut": 0, "omittedBytes": 0,
               "byReason": { "rate_merged": 1, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0 } } } },
  "ending": { "reason": "interrupted", "firstContentAt": 2 }
}
```

- 开着的追加块落成已到的三行，开着的整体替换块落成最后那张图（[S-9](contract.md#s-9-一块怎样落)）——**块与第 2 节相同**，因为封口块本来就等于归约。
- `emitted = 6 + 1 + 0 = 7`：接受的 `open`、`fill` 是 1、2、3、4、6、7；工具交出的前七帧。
- 包成 `ToolInternalMessage`、结局写「被中断」是宿主的事；**那次执行怎么收场另走 `ToolMessage`**。

## 4. 一次完整的模型回复

`data.arrival-events` v2 [examples 第 12 节](../../../data/arrival-events/v2/examples.md#12-一条合法的流)的那九个事件，目标 `{"kind": "model_call", "callId": "mc_1", "dispatch": 1}`，逐个被接受，位置 1～9。

- 位置 2（`"先看文件"`）是第一个内容步骤。
- 位置 7 是工具调用块的封口：参数原文是位置 4 与位置 6 两片的相接 `{"path": "a.md"}`，**在这一下解析一次**（[S-10](contract.md#s-10-工具调用在封口那一下解析且只解析这一次)），成功。

```json
{
  "blocks": [
    { "kind": "thinking", "id": "b_1", "visibility": "H1M1", "text": "先看文件" },
    { "kind": "tool_call", "complete": true, "id": "b_2", "visibility": "H1M1",
      "callId": "call_7", "tool": "read_file", "arguments": { "path": "a.md" } }
  ],
  "account": {
    "usage": { "input_tokens": 900, "output_tokens": 40, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream" },
    "cost": { "cost_usd": 0.0012, "source": "upstream_usage" },
    "trims": { "merged": 0, "cut": 0, "omittedBytes": 0,
               "byReason": { "rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0 } }
  },
  "ending": { "reason": "end", "firstContentAt": 2 }
}
```

- 思考块取封口块；调用块的 `callId`、`tool` 取块头，`id`、`visibility` 取开块，`arguments` 是解析得到的值。
- 位置 5 之后取快照，调用块是 `{ "index": 1, "closed": false, …, "content": "{\"path\": " }`——**原文，不解析**。
- 模型侧的 `trims` 由宿主写进这次发出的响应体（`data.model-response/v3#S-19` 第 5 条）；这条流一次也没砍，那边缺席。

## 5. 失败值逐个

每行给**交进去的状态**（以它接受过的事件描述）与**交进去的事件或操作**；结果是恰一个失败值，**交进去的状态不变**（[S-26](contract.md#s-26-被拒不改状态后果归宿主)）。
目标未注明的都是 `{"kind": "model_call", "callId": "mc_1", "dispatch": 1}`。

| # | 状态已接受 | 交进去 | 失败值 | 依据 |
|---|---|---|---|---|
| 1 | 第 4 节全部九个 | `accept`：`{"t": "fill", "index": 0, "payload": "再补一句"}` | `event_after_finish` | [S-23](contract.md#s-23-本能力自己的失败值) |
| 2 | 同上 | `abandon`，不带 `reason` | `event_after_finish` | [S-22](contract.md#s-22-abandon放弃) |
| 3 | 同上 | `accept`：`{"t": "trim", "reason": "rejected", "omittedBytes": 4}` | `event_after_finish`——**收尾之后连砍也说不了**（[S-26](contract.md#s-26-被拒不改状态后果归宿主)） | [S-23](contract.md#s-23-本能力自己的失败值) |
| 4 | 开 0、封 0（文本） | `accept`：`{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_9", "visibility": H1M1}` | `index_reused`——封口之后也不再开 | [S-23](contract.md#s-23-本能力自己的失败值) |
| 5 | 开 3（文本，开着） | `accept`：开 1（文本） | `index_not_monotonic` | [S-23](contract.md#s-23-本能力自己的失败值) |
| 6 | 无 | `accept`：`{"t": "open", "index": 0, "kind": "voice", "fill": "append", "id": "b_1", "visibility": H1M1, "head": {"mediaType": "image/png"}}` | `head_modality_mismatch` | [S-24](contract.md#s-24-表示层拒绝值原名引用)：表示层拒绝值，原名取自 `data.arrival-events/v2#S-28` |
| 7 | 开 0（文本） | `accept`：`{"t": "fill", "index": 5, "payload": "x"}` | `block_not_open` | [S-23](contract.md#s-23-本能力自己的失败值) |
| 8 | 开 0（文本） | `accept`：`{"t": "trim", "index": 5, "reason": "rate_merged", "merged": 1}` | `block_not_open` | [S-23](contract.md#s-23-本能力自己的失败值) |
| 9 | 开 0、封 0（文本） | `accept`：`{"t": "fill", "index": 0, "payload": "x"}` | `block_already_closed` | [S-23](contract.md#s-23-本能力自己的失败值) |
| 10 | 开 0（文本，追加） | `accept`：`{"t": "fill", "index": 0, "payload": ""}` | `payload_kind_mismatch`——追加片段不得为空 | [S-23](contract.md#s-23-本能力自己的失败值) |
| 11 | 开 0（文本，追加） | `accept`：往 0 填一整张图（形状同第 2 节第 6 个事件的载荷，`id` 为 `b_1`） | `payload_kind_mismatch`——追加的块不收整块 | [S-23](contract.md#s-23-本能力自己的失败值) |
| 12 | 开 0（文本，`id` 为 `b_1`） | `accept`：`{"t": "close", "index": 0, "block": {"kind": "text", "id": "b_x", "visibility": H1M1, "text": ""}}` | `payload_kind_mismatch`——封口块与开块不是同一块 | [S-23](contract.md#s-23-本能力自己的失败值) |
| 13 | 开 0（文本） | `accept`：`{"t": "close", "index": 0}` | `payload_kind_mismatch`——工具调用以外的封口必须带块 | [S-23](contract.md#s-23-本能力自己的失败值) |
| 14 | 开 0（工具调用） | `accept`：`{"t": "close", "index": 0, "block": {"kind": "text", "id": "b_1", "visibility": H1M1, "text": "x"}}` | `payload_kind_mismatch`——工具调用的封口不带块 | [S-23](contract.md#s-23-本能力自己的失败值) |
| 15 | 已接受一次 `account` | `accept`：第 4 节第 8 个事件 | `account_duplicate` | [S-23](contract.md#s-23-本能力自己的失败值) |
| 16 | 开 0（文本），未收尾 | `closeOut` | `stream_not_finished` | [S-21](contract.md#s-21-closeout收尾结算) |
| 17 | 开 2（图，整体替换） | `accept`：`{"t": "fill", "index": 2, "payload": "not an image"}` | `replace_payload_shape`（`data.arrival-events` 的名字） | [S-24](contract.md#s-24-表示层拒绝值原名引用) |
| 18 | 目标 `{"kind": "tool_execution", "callId": "call_9"}`；开 0（语音，追加，块头 `audio/wav`） | `accept`：`{"t": "fill", "index": 0, "payload": "UklGRg=="}` | `frame_media_inline`——帧流上往语音块填字节 | [S-24](contract.md#s-24-表示层拒绝值原名引用) |
| 19 | 目标同上；无 | `accept`：第 4 节第 8 个事件（`account`） | `malformed`——工具侧没有记账这一步 | [S-24](contract.md#s-24-表示层拒绝值原名引用) |
| 20 | 目标同上；未收尾 | `abandon`，`reason` 为 `{"cause": …}` | `malformed`——帧流断了不带成因 | [S-22](contract.md#s-22-abandon放弃) |
| 21 | — | `start`：`{"kind": "model_call", "callId": "mc_1"}` | `malformed`——缺 `dispatch`，不补成 1 | [S-18](contract.md#s-18-start开一份状态) |
| 22 | 无 | `accept`：`{"t": "open", "index": 0, "kind": "image", "fill": "append", "id": "b_1", "visibility": H1M1}` | `fill_kind_not_appendable`（`data.arrival-events` 的名字） | [S-24](contract.md#s-24-表示层拒绝值原名引用) |
| 28 | 目标 `{"kind": "tool_execution", "callId": "call_9"}`；开 0（文本，开着） | `accept`：`{"t": "finish", "reason": "lost", "error": {"cause": "upstream_unavailable"}}` | `malformed`——帧流断了不是一次模型调用的故障，收尾不带成因（编号接在第 27 行之后，只追加） | [S-24](contract.md#s-24-表示层拒绝值原名引用) |

**几处违例同时出现时**（[S-25](contract.md#s-25-判定次序)）：

| # | 状态已接受 | 交进去 | 失败值 | 为什么是它 |
|---|---|---|---|---|
| 23 | 第 4 节全部九个 | `accept`：`{"t": "fill", "index": -1, "payload": "x"}` | `malformed` | 表示层在 `event_after_finish` 之前 |
| 24 | 开 2（图，整体替换）、封 2 | `accept`：`{"t": "fill", "index": 2, "payload": "not an image"}` | `block_already_closed` | 那块已封口，`replace_payload_shape` **无从判起**，不参与；往下判 |
| 25 | 开 0（文本）、封 0 | `accept`：`{"t": "open", "index": 0, "kind": "voice", "fill": "append", "id": "b_2", "visibility": H1M1, "head": {"mediaType": "image/png"}}` | `head_modality_mismatch` | 表示层在索引复用之前（S-25；data.arrival-events/v2 S-28） |
| 26 | 开 3（文本） | `accept`：开 1、块头模态不符 | `head_modality_mismatch` | 表示层在索引不递增之前；第 4、5 行分别验证索引规则 |
| 27 | 第 4 节全部九个 | `accept`：`{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_9", "visibility": H1M1}` | `event_after_finish` | 收尾之后，先说「收尾了」，不再判索引 |

## 6. 用户叫停与放弃

目标 `{"kind": "model_call", "callId": "mc_2", "dispatch": 1}`：

| # | 事件 | 位置 | 说明 |
|---|---|---|---|
| 1 | `{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_1", "visibility": H1M1}` | 1 | |
| 2 | `{"t": "fill", "index": 0, "payload": "我先列一下目录"}` | 2 | 第一个内容步骤 |
| 3 | `{"t": "open", "index": 1, "kind": "tool_call", "fill": "append", "id": "b_2", "visibility": H1M1, "head": {"callId": "call_3", "tool": "list_dir"}}` | 3 | |
| 4 | `{"t": "fill", "index": 1, "payload": "{\"path\": \"sr"}` | 4 | 参数只到一半 |
| 5 | `{"t": "finish", "reason": "interrupted"}` | 5 | 用户叫停；**没有 `account`** |

```json
{
  "blocks": [
    { "kind": "text", "id": "b_1", "visibility": "H1M1", "text": "我先列一下目录" },
    { "kind": "tool_call", "complete": false, "id": "b_2", "visibility": "H0M0",
      "callId": "call_3", "tool": "list_dir", "rawArguments": "{\"path\": \"sr" }
  ],
  "account": {
    "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
    "cost": { "cost_usd": "unknown", "source": "none" },
    "trims": { "merged": 0, "cut": 0, "omittedBytes": 0,
               "byReason": { "rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0 } }
  },
  "ending": { "reason": "interrupted", "firstContentAt": 2 }
}
```

- 文本块开着，落成已到的那句；调用块开着，**落成半截的、两位皆假**——不取开块时的 `H1M1`（[S-9](contract.md#s-9-一块怎样落)）。
- 没有 `account` 那一步 ⇒ 全未知的那一份，**不是零**（[S-13](contract.md#s-13-账)）。
- 宿主据 `reason = interrupted` 与 `firstContentAt` 在，走 PF-009 §5.6「用户叫停、已有内容」那一行。

**放弃**：同样的前四个事件，然后上游连接关闭、没有收尾，宿主调 `abandon`、不带 `reason`。
结果的 `blocks`、`account` 与上面相同，`ending` 是 `{ "reason": "lost", "firstContentAt": 2 }`，**没有 `error`——说不出成因，不是没有故障**。
宿主据此把两块按 `data.model-response` 的 `delivered` 落，**不成为消息**。
对只接受了前两个事件、同样没收尾的状态调 `closeOut`：`stream_not_finished`（第 5 节第 16 行）。

## 7. 解析不了与被砍过

**7a 收齐了却解析不了**（[S-11](contract.md#s-11-参数收齐却解析不了只标记)）：

| # | 事件 | 位置 |
|---|---|---|
| 1 | `{"t": "open", "index": 0, "kind": "tool_call", "fill": "append", "id": "b_1", "visibility": H1M1, "head": {"callId": "call_4", "tool": "read_file"}}` | 1 |
| 2 | `{"t": "fill", "index": 0, "payload": "{\"path\": \"a.md\""}` | 2 |
| 3 | `{"t": "close", "index": 0}` | 3 |
| 4 | `{"t": "finish", "reason": "end"}` | 4 |

位置 3 的封口**被接受**；参数原文 `{"path": "a.md"`（少一个 `}`）解析失败 ⇒ 这一块是 `data.content-blocks/v3#S-12` 里**解析不了的那一种**，不是解析成功的那一种，也不是半截的：

```json
{ "id": "b_1", "kind": "tool_call", "visibility": { "toHuman": true, "toModel": true }, "complete": true, "callId": "call_4", "tool": "read_file", "rawArguments": "{\"path\": \"a.md\"", "unparseable": true }
```

本能力到此为止：**不执行它、以一条 `outcome = failed` 的结果回给模型**，归工具执行运行时（`capability.tool-execution-runtime/v2#S-23`，场景 `#S-64`）。

**7b 开着时被砍过内容**（[S-12](contract.md#s-12-被砍过内容的调用落成半截)）：

| # | 交进去 | 位置 | 说明 |
|---|---|---|---|
| 1 | `{"t": "open", "index": 0, "kind": "tool_call", "fill": "append", "id": "b_1", "visibility": H1M1, "head": {"callId": "call_5", "tool": "read_file"}}` | 1 | |
| 2 | `{"t": "fill", "index": 0, "payload": "{\"path\": "}` | 2 | |
| — | `{"t": "fill", "index": -1, "payload": "\"a.md\"}"}` | — | **被拒** `malformed`：读不出属于哪一块 |
| 3 | `{"t": "trim", "reason": "rejected", "omittedBytes": 7}` | 3 | 宿主替被拒的那个说出来；**没有索引**（`"a.md"}` 按 UTF-8 是 7 字节） |
| 4 | `{"t": "fill", "index": 0, "payload": "\"a.md\"}"}` | 4 | 同样的内容又来了一次 |
| 5 | `{"t": "close", "index": 0}` | 5 | |
| 6 | `{"t": "finish", "reason": "end"}` | 6 | |

参数原文是 `{"path": "a.md"}`——**恰好合法**。但这块开着的时候接受过一个改变内容的、没有索引的砍 ⇒ **不解析，落成半截的调用**：

```json
{ "kind": "tool_call", "complete": false, "id": "b_1", "visibility": "H0M0",
  "callId": "call_5", "tool": "read_file", "rawArguments": "{\"path\": \"a.md\"}" }
```

汇总：`cut = 1`、`byReason.rejected = 1`、`omittedBytes = 7`，其余为 `0`。**判不出那一段属于哪一块，不等于它不属于这一块。**
另一支：把第 3 个事件换成 `{"t": "trim", "index": 0, "reason": "rate_merged", "merged": 1}`——合并不改内容，封口时照常解析，落成完整的调用。

**7c 先截短、后拒收只计一次**（[S-14](contract.md#s-14-砍的汇总)，场景 [S-39](contract.md#s-39-先截短后拒收只计一次)）：

目标 `{"kind": "tool_execution", "callId": "call_8"}`。工具交出七帧：开日志块 0、填一行、封口；开尾部块 1、填一段过长的、封口；**再往已封口的块 0 填一行**（工具的缺陷）。
发出一侧截短了两个过长的填，各在被截短的那个填之前说一个 `frame_too_long`。

| # | 交进去 | 位置 | 说明 |
|---|---|---|---|
| 1 | `{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_log", "visibility": H1M0}` | 1 | |
| 2 | `{"t": "fill", "index": 0, "payload": "build ok\n"}` | 2 | 第一个内容步骤 |
| 3 | `{"t": "close", "index": 0, "block": {"kind": "text", "id": "b_log", "visibility": H1M0, "text": "build ok\n"}}` | 3 | |
| 4 | `{"t": "open", "index": 1, "kind": "text", "fill": "append", "id": "b_tail", "visibility": H1M0}` | 4 | |
| 5 | `{"t": "trim", "index": 1, "reason": "frame_too_long", "omittedBytes": 512}` | 5 | 紧挨在它截短的那个填之前 |
| 6 | `{"t": "fill", "index": 1, "payload": "tail …\n"}` | 6 | 截短后的填，**被接受** |
| 7 | `{"t": "close", "index": 1, "block": {"kind": "text", "id": "b_tail", "visibility": H1M0, "text": "tail …\n"}}` | 7 | |
| 8 | `{"t": "trim", "index": 0, "reason": "frame_too_long", "omittedBytes": 2048}` | 8 | 带索引的 `trim` 只判 `block_not_open`，块 0 开过，照收 |
| — | `{"t": "fill", "index": 0, "payload": "late line\n"}` | — | 截短后的填，**被拒** `block_already_closed` |
| 9 | `{"t": "trim", "index": 0, "reason": "rejected", "omittedBytes": 10}` | 9 | 宿主紧接着替被拒的那一帧说出来（`late line\n` 按 UTF-8 是 10 字节） |
| 10 | `{"t": "finish", "reason": "end"}` | 10 | |

**配对**：第 5 个 `trim` 之后被接受的下一个事件是第 6 个（一个填）——**不配对**，照计进 `frame_too_long`；
第 8 个 `trim` 之后被接受的下一个事件是第 9 个（`rejected`）——**配对**，它说的那一帧只按拒收计。

```json
{ "frames": { "emitted": 7,
              "trims": { "merged": 0, "cut": 1, "omittedBytes": 2570,
                         "byReason": { "rate_merged": 0, "frame_too_long": 1, "quota_exhausted": 0, "rejected": 1 } } } }
```

- `emitted = 6 + 0 + 1 = 7`：接受的 `open`、`fill`、`close` 是 1、2、3、4、6、7，加 `cut = 1`——正是工具交出的七帧。
- `omittedBytes = 512 + 2048 + 10`：**配对的也计字节**，截掉的与被拒的都没送到。
- `data.call-accounts/v2#S-15` 三式：`0 = 0`；`1 = 0 + 1`；第三式前件不成立 ✓。`merged + cut + frame_too_long = 0 + 1 + 1 = 2 ≤ 7` ✓。
- **不去重会怎样**：`frame_too_long` 成了 `2`，第七帧被说成既截短又拒收。只看这一条流不等式仍成立；换一条**只有那一帧**的流就不成立了——
  工具只交出一个过长的、往没开过的块 0 的填：发出一侧说 `{"t": "trim", "reason": "frame_too_long", "omittedBytes": 100}`（位置 1，没有索引）、那个填被拒（`block_not_open`）、宿主紧接着说 `{"t": "trim", "reason": "rejected", "omittedBytes": 20}`（位置 2）、收尾（位置 3）。
  去重后 `emitted = 0 + 0 + 1 = 1`、`frame_too_long = 0`，`0 + 1 + 0 = 1 ≤ 1` ✓；不去重是 `0 + 1 + 1 = 2 > 1`——只发了一帧的执行被说成砍了两帧。

**7d 严格解析：重复键与大整数**（[S-10](contract.md#s-10-工具调用在封口那一下解析且只解析这一次) 第 3 条，[D-060 §八 M36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：

两条流都是「开一个工具调用块、一个填、封口、收尾」，只差那个填的载荷。

| 参数原文 | 封口 | 这一块 | 说明 |
|---|---|---|---|
| `{"path": "a.md", "path": "b.md"}` | 被接受 | **解析不了的那一种**：`complete: true`、`rawArguments` 为原文、`unparseable: true`、没有 `arguments` | 同一对象里重复的键 ⇒ 失败；不取 `a.md`，也不取 `b.md` |
| `{"id": 9007199254740993}` | 被接受 | 完整的调用块，`arguments.id` **恰是** `9007199254740993` | 超出 2^53 的整数不经有损的数值表示；交出 `9007199254740992` 就是违反 |

两行的封口都**被接受**：重复的键不是表示层的违例，**不是** `malformed`——事件本身形状正确，失败的是参数原文的解析，落在块里（`unparseable`），与 [7a](#7-解析不了与被砍过) 同一条路。

## 8. 首个内容排除空载荷

目标 `{"kind": "tool_execution", "callId": "call_6"}`，一块进度面板：

| # | 事件 | 位置 | 是不是内容步骤 |
|---|---|---|---|
| 1 | `{"t": "open", "index": 0, "kind": "text", "fill": "replace", "id": "b_p", "visibility": H1M0}` | 1 | 否：开块不算 |
| 2 | `{"t": "fill", "index": 0, "payload": ""}` | 2 | **否**：整体替换的空串什么也没交出 |
| 3 | `{"t": "fill", "index": 0, "payload": "3/10"}` | 3 | **是** ⇒ `firstContentAt = 3` |
| 4 | `{"t": "fill", "index": 0, "payload": ""}` | 4 | 否（首个内容已定，不再变） |
| 5 | `{"t": "finish", "reason": "interrupted"}` | 5 | |

结算：`blocks` 是一块 `{"kind": "text", "id": "b_p", "visibility": H1M0, "text": ""}`——开着、收到过填的整体替换块取最后一次填，**空串也照落**（一块面板被清空了）；
`frames.emitted = 4`（接受的 `open`、`fill` 四个）；`ending` 是 `{ "reason": "interrupted", "firstContentAt": 3 }`。

**它的一次性形式**只有开块、一个载荷为 `""` 的填（归约是最后一次）、收尾：结算出的 `blocks` 与上面**相同**，**`firstContentAt` 却缺席**——
那块内容在分次到达时确实到过用户眼前，一次性到达时没有。这正是 [S-27](contract.md#s-27-一次到达装配等于一次性到达) 把首个内容排除在相等之外的理由。

## 9. 起草者自核

- 第 2、3、6、7、8 节的每个事件都按 `data.arrival-events` v2 的 Schema 与 [S-28](contract.md#s-28-宿主要兑现的前提) 手核过：帧流上的图都是引用、`toModel` 都是 `false`、工具侧没有 `account`；第 7c 节两处「紧挨」按 S-28 第 4 条排。
- 第 5 节每行只有一处违例，或者（第 23～27 行）写明了按次序取哪一个。
- **手核不是证据**：这些结果尚未被任何实现、一致性用例或模型运行复现（[验证入口](../verification.md)）。

## 10. 工具名字符集与长度都先于参数解析

依 [S-10](contract.md#s-10-工具调用在封口那一下解析且只解析这一次) 第 2、3 条和 [S-11](contract.md#s-11-参数收齐却解析不了只标记)，四条独立的模型回复流均接受以下事件。`tool` 分别取下面四组完整值，未发生 trim。

| 位置 | 事件 |
|---|---|
| 1 | `{"t":"open","index":0,"kind":"tool_call","fill":"append","id":"b_name","visibility":H1M1,"head":{"callId":"call_name","tool":tool}}` |
| 2 | `{"t":"fill","index":0,"payload":"{}"}` |
| 3 | `{"t":"close","index":0}` |
| 4 | `{"t":"finish","reason":"end"}` |

`open` 的块头允许收到的非空名字，四组事件形状均合法。各次 `close` 被接受，位置 3 起快照和收尾取得下列同一块；它们不再解析参数。参数原文在四组中都是合法的 `{}`，所以前两组不解析的原因完全是名字约束。

### 字符集坏名

封口那一下参数解析次数：**0**。预期块（`data.content-blocks/v3`）：

```json
{
  "id": "b_name",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_name",
  "tool": "bad:name",
  "rawArguments": "{}",
  "unparseable": true
}
```

### 129字符超长名字

封口那一下参数解析次数：**0**。预期块（`data.content-blocks/v3`）：

```json
{
  "id": "b_name",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_name",
  "tool": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "rawArguments": "{}",
  "unparseable": true
}
```

### 128字符边界名字

封口那一下参数解析次数：**1**。预期块（`data.content-blocks/v3`）：

```json
{
  "id": "b_name",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_name",
  "tool": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "arguments": {}
}
```

### 普通合法名字

封口那一下参数解析次数：**1**。预期块（`data.content-blocks/v3`）：

```json
{
  "id": "b_name",
  "kind": "tool_call",
  "visibility": {
    "toHuman": true,
    "toModel": true
  },
  "complete": true,
  "callId": "call_name",
  "tool": "read_file",
  "arguments": {}
}
```

前两组完整未解析块原样保留名字和参数原文，不进入逆转写或执行；把它们改成 `arguments: {}` 的正常分支将被 CB3 拒绝。后两组恰解析一次，名字不变。这里给出的是规范预期；本轮 Schema 检查只核事件和结果的表示以及名字边界，未运行装配提供者，也未验证真实解析次数。
