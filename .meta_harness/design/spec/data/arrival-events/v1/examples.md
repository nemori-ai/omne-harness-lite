# 规范实例：合法与非法

属于 `data.arrival-events` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`arrival-events.schema.json`](arrival-events.schema.json) 的定义项在这里各有一组正反实例，非法的一律注明**拒绝值**与**被哪一条挡住**。

**怎么读这些表**：每节开头的「校验对象」给出该节全部实例要拿去求值的 `$defs`。
每张表第一列是实例（JSON 内联代码）；第二列是 **Schema 这一关**的预期（`通过`／`拒绝`）；
第三列是按 [S-28](contract.md#s-28-表示层拒绝值) 定出的**拒绝值**（合法的写 `—`）；第四列是依据条款。
**这个格式也是机检格式**——逐节按「校验对象」把第一列喂给 Draft 2020-12 校验器、拿第二列比对。**第三列不参与 Schema 机检**。

**四条读法上的边界：**

- **`通过` 只说单个信封的形状合规。**序列规则（索引唯一与单调、填只落在开着的块上、账至多一次、收尾之后无事件）
  与要借开块才判得出的约束，都不在 Schema 的能力范围内——见[第 10 节](#10-schema-通过但仍然非法的)。
- **引到 `ModelCallId`（第 1、9、12 节的模型侧目标）与 `FailureCause`（第 8 节带 `error` 的两行）的实例，此刻机检不了**：
  那两个 `$ref` 要等对齐波（[G-1](contract.md#九已知缺口)、[G-2](contract.md#九已知缺口)）。它们的「Schema」一列写的是那两处解析之后的预期。
- **示例里的标识串只是占位**，词法未定；不要从 `mc_`、`call_`、`b_`、`obj_` 这样的前缀推出任何规则。`FailureCause` 的取值照草案写成 `upstream_unavailable`，**以 `data.loop-extension` v1 定稿为准**。
- **除[第 11 节](#11-几处违例同时出现时取哪个拒绝值)外，每个非法实例只违反一条规则**。

下文反复出现的片段一律原样写全：两位都真 `{"toHuman": true, "toModel": true}`，只给人 `{"toHuman": true, "toModel": false}`。

## 1. ArrivalTarget

**校验对象**：`$defs/ArrivalTarget`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"kind": "model_call", "callId": "mc_1", "dispatch": 1}` | 通过 | — | [S-5](contract.md#s-5-信封与目标)：一次模型调用的第一次发出 |
| `{"kind": "model_call", "callId": "mc_1", "dispatch": 2}` | 通过 | — | [S-5](contract.md#s-5-信封与目标)：**同一次调用的第二次发出，是另一条流**——与上一行不相等 |
| `{"kind": "tool_execution", "callId": "call_1"}` | 通过 | — | [S-5](contract.md#s-5-信封与目标) |
| `{"kind": "model_call", "callId": "mc_1"}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-信封与目标)：缺 `dispatch`。**不补成 1** |
| `{"kind": "model_call", "callId": "mc_1", "dispatch": 0}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-信封与目标)：从 1 数起 |
| `{"kind": "tool_execution", "callId": "call_1", "dispatch": 1}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-信封与目标)：工具执行一次一条流，没有「第几次发出」 |
| `{"kind": "session", "callId": "s_1"}` | 拒绝 | `malformed` | [S-27](contract.md#s-27-判别式与枚举闭合)：`target.kind` 闭合 |
| `{"kind": "tool_execution", "callId": ""}` | 拒绝 | `malformed` | `data.content-blocks/v1#S-14`：`CallId` 非空 |

## 2. OpenEvent

**校验对象**：`$defs/OpenEvent`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}` | 通过 | — | [S-8](contract.md#s-8-开块) |
| `{"t": "open", "index": 5, "kind": "image", "fill": "replace", "id": "b_6", "visibility": {"toHuman": true, "toModel": true}, "head": {"mediaType": "image/png"}}` | 通过 | — | [S-7](contract.md#s-7-块索引)：索引可以跳号；[S-12](contract.md#s-12-填整体替换)：图能开成整体替换 |
| `{"t": "open", "index": 1, "kind": "tool_call", "fill": "append", "id": "b_2", "visibility": {"toHuman": true, "toModel": true}, "head": {"callId": "call_7", "tool": "read_file"}}` | 通过 | — | [S-9](contract.md#s-9-块头)：调用块必带 `callId` 与 `tool` |
| `{"t": "open", "index": 2, "kind": "voice", "fill": "append", "id": "b_3", "visibility": {"toHuman": true, "toModel": true}, "head": {"mediaType": "audio/pcm;rate=24000"}}` | 通过 | — | [S-9](contract.md#s-9-块头)：语音必带 `mediaType` |
| `{"t": "open", "index": 0, "kind": "text", "fill": "replace", "id": "b_1", "visibility": {"toHuman": true, "toModel": false}}` | 通过 | — | [S-12](contract.md#s-12-填整体替换)：一块刷新的文本面板 |
| `{"t": "open", "index": 0, "kind": "image", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}` | 拒绝 | `fill_kind_not_appendable` | [S-8](contract.md#s-8-开块)：半张图没有意义。**不被改成 `replace` 后接受** |
| `{"t": "open", "index": 0, "kind": "tool_result", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}` | 拒绝 | `fill_kind_not_appendable` | [S-8](contract.md#s-8-开块) |
| `{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_1", "visibility": {"toHuman": true}}` | 拒绝 | `visibility_missing` | [S-8](contract.md#s-8-开块)：缺一位。**不补成 `false`，也不补成 `true`** |
| `{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_1"}` | 拒绝 | `visibility_missing` | [S-8](contract.md#s-8-开块)：没表过态 |
| `{"t": "open", "index": 0, "kind": "text", "fill": "append", "visibility": {"toHuman": true, "toModel": true}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-开块)：缺 `id` |
| `{"t": "open", "index": 0, "kind": "voice", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-块头)：语音没带 `mediaType`，永远等不到封口时落不成语音块 |
| `{"t": "open", "index": 0, "kind": "tool_call", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "head": {"callId": "call_7"}}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-块头)：缺 `tool` |
| `{"t": "open", "index": 0, "kind": "tool_call", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "head": {"callId": "call_7", "tool": "read_file", "mediaType": "application/json"}}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-块头)：调用块不带 `mediaType` |
| `{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "head": {"tool": "read_file"}}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-块头)：`tool` 只有调用块能带 |
| `{"t": "open", "index": -1, "kind": "text", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}` | 拒绝 | `malformed` | [S-7](contract.md#s-7-块索引)：非负 |
| `{"t": "open", "index": 0, "kind": "video", "fill": "replace", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-开块)：`BlockKind` 闭合；视频装在文件块里 |
| `{"t": "open", "index": 0, "kind": "text", "fill": "stream", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}` | 拒绝 | `malformed` | [S-27](contract.md#s-27-判别式与枚举闭合)：`FillMode` 闭合 |

## 3. BlockHead 与 PresentationHint

**校验对象**：第一、四、五行 `$defs/BlockHead`；其余 `$defs/PresentationHint`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"mediaType": "image/png"}` | 通过 | — | [S-9](contract.md#s-9-块头) |
| `{"hint": "log"}` | 通过 | **`presentation_invalid`** | [S-10](contract.md#s-10-呈现提示)：**形状合法，但本版取值集是空的**——见[第 10 节](#10-schema-通过但仍然非法的) |
| `{"hint": ""}` | 拒绝 | `presentation_invalid` | [S-10](contract.md#s-10-呈现提示)：不合形状也是这个值，**不是 `malformed`** |
| `{"mediaType": "Image/PNG"}` | 拒绝 | `malformed` | `data.content-blocks/v1#S-7`：只许小写 |
| `{"color": "red"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-块头)：块头恰四个可选成员 |
| `{"hint": "log", "theme": "dark"}` | 拒绝 | `presentation_invalid` | [S-10](contract.md#s-10-呈现提示)：多出成员 |

## 4. FillEvent

**校验对象**：`$defs/FillEvent`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"t": "fill", "index": 0, "payload": "Hello"}` | 通过 | — | [S-11](contract.md#s-11-填追加片段) |
| `{"t": "fill", "index": 1, "payload": "{\"path\": \"src/"}` | 通过 | — | [S-11](contract.md#s-11-填追加片段)：调用参数的一段原文，**不是合法 JSON 也照收、不解析** |
| `{"t": "fill", "index": 2, "payload": "UklGRg=="}` | 通过 | — | [S-11](contract.md#s-11-填追加片段)：一段语音字节（在模型回复的流上） |
| `{"t": "fill", "index": 5, "payload": {"kind": "image", "id": "b_6", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_1", "mediaType": "image/png"}}}` | 通过 | — | [S-12](contract.md#s-12-填整体替换)：刷新一整张图 |
| `{"t": "fill", "index": 0, "payload": {"kind": "text", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "text": "x"}}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-填整体替换)：文本的整个新内容是文本，不是一整块 |
| `{"t": "fill", "index": 0, "payload": {"kind": "tool_call", "complete": true, "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_7", "tool": "read_file", "arguments": {}}}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-封口)：解析过的调用块从不在流上出现 |
| `{"t": "fill", "index": 5, "payload": {"kind": "image", "id": "b_6", "visibility": {"toHuman": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_1", "mediaType": "image/png"}}}` | 拒绝 | `visibility_missing` | [S-28](contract.md#s-28-表示层拒绝值)：嵌着的块不合 `data.content-blocks` v1，**取那份契约的名字** |
| `{"t": "fill", "index": 0}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-填追加片段) |
| `{"t": "fill", "index": 0, "payload": 42}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-填追加片段) |

## 5. CloseEvent

**校验对象**：`$defs/CloseEvent`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"t": "close", "index": 1}` | 通过 | — | [S-13](contract.md#s-13-封口)：工具调用块的封口不带块。**对别的类，这一行要看开块才知道缺了块**（第 10 节） |
| `{"t": "close", "index": 0, "block": {"kind": "text", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "text": "Hello world"}}` | 通过 | — | [S-13](contract.md#s-13-封口) |
| `{"t": "close", "index": 1, "block": {"kind": "tool_call", "complete": true, "id": "b_2", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_7", "tool": "read_file", "arguments": {"path": "a"}}}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-封口)：交出解析过的调用块，就是生产者解析过了 |
| `{"t": "close", "index": 1, "block": {"kind": "tool_call", "complete": false, "id": "b_2", "visibility": {"toHuman": false, "toModel": false}, "rawArguments": "{\"pa"}}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-封口)：**半截的调用不被封口**——封口就是在说「收齐了」 |
| `{"t": "close", "index": 0, "block": {"kind": "sticker", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}}` | 拒绝 | `kind_unknown` | [S-28](contract.md#s-28-表示层拒绝值)：嵌着的块取 `data.content-blocks/v1#S-26` 的名字 |

## 6. TrimEvent

**校验对象**：`$defs/TrimEvent`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"t": "trim", "index": 0, "reason": "rate_merged", "merged": 3}` | 通过 | — | [S-14](contract.md#s-14-砍)：四个片段合成一个送达，记 3 |
| `{"t": "trim", "index": 0, "reason": "frame_too_long", "omittedBytes": 2048}` | 通过 | — | [S-14](contract.md#s-14-砍) |
| `{"t": "trim", "index": 2, "reason": "quota_exhausted", "omittedBytes": 512}` | 通过 | — | [S-14](contract.md#s-14-砍) |
| `{"t": "trim", "reason": "rejected", "omittedBytes": 0}` | 通过 | — | [S-14](contract.md#s-14-砍)：落不到某一块上 |
| `{"t": "trim", "index": 0, "reason": "rate_merged"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-砍)：合并要说合了几个 |
| `{"t": "trim", "index": 0, "reason": "rate_merged", "merged": 0}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-砍)：一次合并至少少送一个 |
| `{"t": "trim", "index": 0, "reason": "rate_merged", "merged": 2, "omittedBytes": 10}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-砍)：合并不丢内容 |
| `{"t": "trim", "index": 0, "reason": "frame_too_long", "omittedBytes": 0}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-砍)：截短至少截掉一个字节 |
| `{"t": "trim", "index": 0, "reason": "quota_exhausted", "merged": 1, "omittedBytes": 4}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-砍) |
| `{"t": "trim", "index": 0, "reason": "throttled", "merged": 1}` | 拒绝 | `trim_reason_unknown` | [S-14](contract.md#s-14-砍)：`TrimReason` 四值闭合 |

## 7. AccountEvent

**校验对象**：`$defs/AccountEvent`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"t": "account", "usage": {"input_tokens": 1520, "output_tokens": 311, "cache_read_tokens": 12288, "cache_write_tokens": 0, "reasoning_tokens": 128, "source": "upstream"}, "cost": {"cost_usd": 0.004187, "source": "upstream_usage"}}` | 通过 | — | [S-15](contract.md#s-15-记账) |
| `{"t": "account", "usage": {"input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none"}, "cost": {"cost_usd": "unknown", "source": "none"}}` | 通过 | — | [S-15](contract.md#s-15-记账)：上游什么也没报——**写 `"unknown"`，不写缺席** |
| `{"t": "account", "cost": {"cost_usd": "unknown", "source": "none"}}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-记账)：不以缺席表达「不知道」 |
| `{"t": "account", "usage": {"input_tokens": 1, "output_tokens": 1, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}, "cost": {"cost_usd": 0.001, "source": "upstream_usage"}, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-记账)：记账就是 `{ usage, cost }`；砍的汇总由消费一侧从 `trim` 事件数出来 |
| `{"t": "account", "usage": {"input_tokens": -1, "output_tokens": 1, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}, "cost": {"cost_usd": 0.001, "source": "upstream_usage"}}` | 拒绝 | `negative_amount` | [S-28](contract.md#s-28-表示层拒绝值)：嵌着的账取 `data.call-accounts/v1#S-27` 的名字 |
| `{"t": "account", "usage": {"input_tokens": 1, "output_tokens": 1, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "none"}, "cost": {"cost_usd": 0.001, "source": "upstream_usage"}}` | 拒绝 | `unknown_with_source` | 同上 |

## 8. FinishEvent

**校验对象**：`$defs/FinishEvent`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"t": "finish", "reason": "end"}` | 通过 | — | [S-16](contract.md#s-16-收尾) |
| `{"t": "finish", "reason": "max_tokens"}` | 通过 | — | [S-16](contract.md#s-16-收尾)：模型侧；工具侧见第 9 节 |
| `{"t": "finish", "reason": "lost"}` | 通过 | — | [S-16](contract.md#s-16-收尾)：说不出为什么断，**不补成因** |
| `{"t": "finish", "reason": "lost", "error": {"cause": "upstream_unavailable", "statusCode": 502}}` | 通过（待 G-2） | — | [S-16](contract.md#s-16-收尾)：状态码原样 |
| `{"t": "finish", "reason": "interrupted", "error": {"cause": "upstream_unavailable"}}` | 拒绝（待 G-2） | `malformed` | [S-16](contract.md#s-16-收尾)：用户叫停不是故障，不带成因 |
| `{"t": "finish", "reason": "stop"}` | 拒绝 | `finish_reason_unknown` | [S-16](contract.md#s-16-收尾)：上游的 stop 由适配层译成 `end`，不原样进来 |
| `{"t": "finish"}` | 拒绝 | `malformed` | [S-16](contract.md#s-16-收尾) |

## 9. ArrivalEnvelope：跟着目标走的几条

**校验对象**：`$defs/ArrivalEnvelope`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"target": {"kind": "model_call", "callId": "mc_1", "dispatch": 1}, "event": {"t": "finish", "reason": "max_tokens"}}` | 通过 | — | [S-16](contract.md#s-16-收尾) |
| `{"target": {"kind": "tool_execution", "callId": "call_1"}, "event": {"t": "open", "index": 0, "kind": "text", "fill": "replace", "id": "b_1", "visibility": {"toHuman": true, "toModel": false}}}` | 通过 | — | [S-23](contract.md#s-23-执行帧的另外四条)：一块进度面板 |
| `{"target": {"kind": "tool_execution", "callId": "call_1"}, "event": {"t": "finish", "reason": "lost"}}` | 通过 | — | [S-23](contract.md#s-23-执行帧的另外四条)：帧流断了，**不影响那次执行的收场** |
| `{"target": {"kind": "tool_execution", "callId": "call_1"}, "event": {"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}}` | 拒绝 | `malformed` | [S-23](contract.md#s-23-执行帧的另外四条)：帧不给模型看，**不被改成 `false` 后接受** |
| `{"target": {"kind": "tool_execution", "callId": "call_1"}, "event": {"t": "account", "usage": {"input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none"}, "cost": {"cost_usd": "unknown", "source": "none"}}}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-记账)：工具侧没有记账这一步——四个 `"unknown"` 会把「没有这回事」说成「有但数不出」 |
| `{"target": {"kind": "tool_execution", "callId": "call_1"}, "event": {"t": "finish", "reason": "max_tokens"}}` | 拒绝 | `malformed` | [S-16](contract.md#s-16-收尾) |
| `{"target": {"kind": "tool_execution", "callId": "call_1"}, "event": {"t": "close", "index": 0, "block": {"kind": "text", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "text": "done"}}}` | 拒绝 | `malformed` | [S-23](contract.md#s-23-执行帧的另外四条) |
| `{"target": {"kind": "tool_execution", "callId": "call_1"}, "event": {"t": "retract", "index": 0}}` | 拒绝 | `event_unknown` | [S-6](contract.md#s-6-六种事件)：本版没有「改写已封口的块」 |
| `{"event": {"t": "finish", "reason": "end"}}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-信封与目标)：说不出属于谁 |

## 10. Schema 通过，但仍然非法的

**这一节的实例都过得了 Schema**；拒绝它们的是契约条款——要么要借开块，要么要遍历到里层。
「谁判」一列：**本契约**的拒绝值由任何接收边界判；**消费一侧**的名字归 `capability.stream-assembly`（[S-24](contract.md#s-24-违反语法由消费一方判定并命名)）。

| 情形（流上此前已有的事件 → 这一个） | 拒绝值 | 谁判 | 依据 |
|---|---|---|---|
| 块头 `{"presentation": {"hint": "log"}}` | `presentation_invalid` | 本契约 | [S-10](contract.md#s-10-呈现提示)：取值集为空（G-3）。**不当作缺席、不改照 `mediaType` 画** |
| 目标 `tool_execution`；`{"t": "close", "index": 0, "block": {"kind": "image", "id": "b_1", "visibility": {"toHuman": true, "toModel": false}, "mediaType": "image/png", "data": {"inline": "iVBORw0KGgo="}}}` | `frame_media_inline` | 本契约 | [S-23](contract.md#s-23-执行帧的另外四条)：帧里媒体只许引用。**不改成引用后接受** |
| 目标 `tool_execution`；封口一个工具结果块，它的 `blocks` 里嵌着一张内联的图 | `frame_media_inline` | 本契约 | [S-23](contract.md#s-23-执行帧的另外四条)：**任意一层**都算 |
| 目标 `tool_execution`，`open(2, voice, append, head.mediaType = "audio/wav")` → `{"t": "fill", "index": 2, "payload": "UklGRg=="}` | `frame_media_inline` | 本契约 | [S-23](contract.md#s-23-执行帧的另外四条)：帧流上的语音只能开了就封、带引用 |
| `open(0, text, replace)` → `fill` 的整块是一张图 | `replace_payload_shape` | 本契约 | [S-12](contract.md#s-12-填整体替换)：文本面板的新内容是文本 |
| `open(5, image, replace, id = "b_6")` → `fill` 的整块 `id` 是 `"b_9"` | `replace_payload_shape` | 本契约 | [S-12](contract.md#s-12-填整体替换)：取代只发生在这一块里 |
| `open(3, voice, replace, head.mediaType = "audio/wav")`（模型侧）→ `{"t": "fill", "index": 3, "payload": "not base64!"}` | `replace_payload_shape` | 本契约 | [S-12](contract.md#s-12-填整体替换) |
| `open(0, text, append)` → `{"t": "fill", "index": 0, "payload": ""}` | `payload_kind_mismatch` | 消费一侧 | [S-11](contract.md#s-11-填追加片段)：片段非空 |
| `open(0, text, append)` → `{"t": "close", "index": 0}` | `payload_kind_mismatch` | 消费一侧 | [S-13](contract.md#s-13-封口)：文本块的封口必带块 |
| `open(0, text, append, id = "b_1")` → 封口块的 `id` 是 `"b_2"` | `payload_kind_mismatch` | 消费一侧 | [S-13](contract.md#s-13-封口)：封口块与开块说的是同一块 |
| `{"t": "open", "index": 0, "kind": "voice", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "head": {"mediaType": "image/png"}}` | `head_modality_mismatch` | 消费一侧 | [S-9](contract.md#s-9-块头) |
| `open(1, …)` → `{"t": "open", "index": 1, …}` | `index_reused` | 消费一侧 | [S-7](contract.md#s-7-块索引)：一个索引终身只开一次 |
| `open(4, …)` → `{"t": "open", "index": 2, …}` | `index_not_monotonic` | 消费一侧 | [S-7](contract.md#s-7-块索引) |
| `open(0, …)` → `close(0)` → `{"t": "fill", "index": 0, "payload": "late"}` | `block_already_closed` | 消费一侧 | [S-18](contract.md#s-18-块的一生) |
| `account` → `account` | `account_duplicate` | 消费一侧 | [S-15](contract.md#s-15-记账) |
| `finish(end)` → 任何事件 | `event_after_finish` | 消费一侧 | [S-17](contract.md#s-17-一条流的形状) |
| 两次开块用了同一个 `id`（索引不同） | 流上**本版不拒**；消息落日志时整条被拒（`data.content-blocks/v1#S-3` 的 `malformed`） | 消息落日志的边界 | [S-8](contract.md#s-8-开块)、[G-6](contract.md#九已知缺口) |

## 11. 几处违例同时出现时取哪个拒绝值

| 实例（校验对象） | 同时违反 | 拒绝值 |
|---|---|---|
| `{"t": "retract"}`（`ArrivalEvent`） | `t` 未知；缺 `index` | `event_unknown` |
| `{"t": "trim", "reason": "throttled", "extra": 1}`（`TrimEvent`） | 原因未知；多出成员 | `trim_reason_unknown` |
| `{"t": "open", "index": 0, "kind": "image", "fill": "append", "id": "b_1", "visibility": {"toHuman": true}}`（`OpenEvent`） | 标注缺一位；以追加开图 | `visibility_missing`——嵌着的值排在前面 |
| `{"t": "open", "index": 0, "kind": "image", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "head": {"presentation": {"hint": ""}}}`（`OpenEvent`） | 呈现提示非法；以追加开图 | `presentation_invalid` |
| 目标 `tool_execution`，封口一张内联的图、且它 `toModel` 为真（`ArrivalEnvelope`） | 帧里内联媒体；帧块给模型看 | `frame_media_inline` |
| 目标 `tool_execution`，`{"t": "account", "usage": {"input_tokens": -1, "output_tokens": 1, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}, "cost": {"cost_usd": 0.001, "source": "upstream_usage"}}`（`ArrivalEnvelope`） | 嵌着的账有负数；工具侧记账 | `negative_amount`——嵌着的值排在 `malformed` 前面 |

## 12. 一条合法的流

同一次模型调用的第一次发出（目标 `{"kind": "model_call", "callId": "mc_1", "dispatch": 1}`），逐个事件都过得了 Schema，整串合 [S-17](contract.md#s-17-一条流的形状)、[S-18](contract.md#s-18-块的一生)：

| # | 事件 | 说明 |
|---|---|---|
| 1 | `{"t": "open", "index": 0, "kind": "thinking", "fill": "append", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}}` | |
| 2 | `{"t": "fill", "index": 0, "payload": "先看文件"}` | **第一个内容步骤**（[S-21](contract.md#s-21-第一个内容步骤)） |
| 3 | `{"t": "open", "index": 1, "kind": "tool_call", "fill": "append", "id": "b_2", "visibility": {"toHuman": true, "toModel": true}, "head": {"callId": "call_7", "tool": "read_file"}}` | 两块同时开着 |
| 4 | `{"t": "fill", "index": 1, "payload": "{\"path\": "}` | 参数原文，不解析 |
| 5 | `{"t": "close", "index": 0, "block": {"kind": "thinking", "id": "b_1", "visibility": {"toHuman": true, "toModel": true}, "text": "先看文件"}}` | 封口块等于归约（[S-20](contract.md#s-20-封口块等于归约)） |
| 6 | `{"t": "fill", "index": 1, "payload": "\"a.md\"}"}` | |
| 7 | `{"t": "close", "index": 1}` | 调用块的封口不带块；参数原文 = `{"path": "a.md"}` |
| 8 | `{"t": "account", "usage": {"input_tokens": 900, "output_tokens": 40, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}, "cost": {"cost_usd": 0.0012, "source": "upstream_usage"}}` | 至多一次、在收尾之前 |
| 9 | `{"t": "finish", "reason": "end"}` | 最后一个 |

装出来的是什么、参数怎样解析、首个内容的时刻，归 `capability.stream-assembly`——那份契约的实例里有这条流与更复杂的一条的手算结果。

## 13. 起草者自核

起草时逐行手核了第 1～9 节与第 11 节的「Schema」一列（**手核不是证据**）；
第 1、9、12 节的模型侧目标与第 8 节带 `error` 的行依赖两处尚未解析的 `$ref`，**在对齐波之前连机检都跑不了**。
**没有跑过任何校验器**；实际状态见[验证入口](../verification.md)。
