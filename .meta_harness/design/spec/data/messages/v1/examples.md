# 规范实例：合法与非法

属于 `data.messages` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`messages.schema.json`](messages.schema.json) 的定义项在这里各有一组正反实例，
非法的一律注明**拒绝值**与**被哪一条挡住**。

**怎么读这些表**：每节开头的「校验对象」给出该节全部实例要拿去求值的 `$defs`。
每张表第一列是实例（JSON 内联代码）；第二列是 **Schema 这一关**的预期（`通过`／`拒绝`）；
第三列是按 [S-39](contract.md#s-39-表示层拒绝值) 定出的**拒绝值**（合法的写 `—`）；第四列是依据条款。
**这个格式也是机检格式**——逐节按「校验对象」把第一列喂给 Draft 2020-12 校验器、拿第二列比对，不另抄一份清单。
**第三列不参与 Schema 机检**：Schema 只说通过与否，拒绝值的名字与优先级是契约的规则。

**四条读法上的边界：**

- **`通过` 只说形状合规。**单条消息里 Schema 管不到的几条（工具消息与后台收场提醒里的 `callId`／`outcome` 相等、名单不点自己、块标识唯一）
  与全部日志层的判定（[S-29](contract.md#s-29-合法名单的判定)、[S-32](contract.md#s-32-会话日志里的配对与唯一)）见[第 10 节](#10-schema-挡不住但同样非法的)。
- **示例里的标识串与名字只是占位**，词法未定（[G-1](contract.md#九已知缺口)；拓展件名字的词法归能力标识名的家）；不要从 `m_`、`call_`、`rsp_`、`admission-decision` 这样的写法推出任何规则。
- **除[第 12 节](#12-几处违例同时出现时取哪个拒绝值)外，每个非法实例只违反一条规则**；第 12 节专门演示优先级。
- 块的形状整份取自 `data.content-blocks` v1；**块本身的正反实例在它的 [examples](../../content-blocks/v1/examples.md)**，这里只演示块落进消息之后的规则。

下文反复出现的几个片段，在实例里一律原样写全：
标注两位都真 `{"toHuman": true, "toModel": true}`，只给模型 `{"toHuman": false, "toModel": true}`，只给人 `{"toHuman": true, "toModel": false}`，两边都不给 `{"toHuman": false, "toModel": false}`；
时刻一律 `"2026-09-23T08:00:00Z"`，另有说明的除外。

## 1. MessageId

**校验对象**：`$defs/MessageId`。`ResponseId`、`ModelCallId`、`CardId`、`SessionRef`、`AgentRef`、`ScheduleRef`、`RuntimeContextBlockId` 与它同形，结论逐行相同。

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `"m_01"` | 通过 | — | [S-3](contract.md#s-3-messageid) |
| `"msg 7f3c"` | 通过 | — | [S-3](contract.md#s-3-messageid)：中间的空白不受限，按 `data.identity-values/v1#S-31` 只禁首尾 |
| `""` | 拒绝 | `malformed` | [S-3](contract.md#s-3-messageid)：非空 |
| `" m_01"` | 拒绝 | `malformed` | [S-3](contract.md#s-3-messageid)：禁止首尾空白 |
| `"m_01\n"` | 拒绝 | `malformed` | [S-3](contract.md#s-3-messageid)：**`$` 的回归用例**——pattern 以 `(?![\s\S])` 收尾 |
| `"﻿m_01"` | 拒绝 | `malformed` | [S-3](contract.md#s-3-messageid)：U+FEFF 在那个显式空白集合里——**`\s` 的回归用例** |
| `42` | 拒绝 | `malformed` | [S-3](contract.md#s-3-messageid)：是字符串，不是数 |

## 2. SystemMessage

**校验对象**：`$defs/Message`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "m_sys", "type": "system", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "你是这个仓库的代码评审助手。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-7](contract.md#s-7-systemmessage)、[S-5](contract.md#s-5-给谁看在块上)：常态只给模型 |
| `{"id": "m_sys", "type": "system", "blocks": [{"id": "b1", "kind": "thinking", "visibility": {"toHuman": false, "toModel": true}, "text": "……"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块)：思考只在模型的回复里 |
| `{"id": "m_sys", "type": "system", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "# 代码评审", "origin": {"kind": "skill_body", "skill": "code-review"}}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块)：来路标记只在用户消息的顶层文本块上 |
| `{"id": "m_sys", "type": "system", "blocks": [{"id": "b1", "kind": "image", "visibility": {"toHuman": false, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_logo", "mediaType": "image/png"}}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块)、[S-7](contract.md#s-7-systemmessage)：系统提示词本版只含文本（PF-010 rev 6） |
| `{"id": "m_sys", "type": "system", "visibility": {"toHuman": false, "toModel": true}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-给谁看在块上)、[S-2](contract.md#s-2-消息底座)：**消息不带「给谁看」**——那在块上 |
| `{"id": "m_sys", "type": "system", "blocks": []}` | 拒绝 | `malformed` | [S-2](contract.md#s-2-消息底座)：`createdAt` 必填 |
| `{"id": "m_sys", "type": "system", "blocks": [], "createdAt": "2026-09-23"}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-createdat-不是次序)：是时间点，不是日期 |

## 3. UserMessage

**校验对象**：`$defs/Message`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "m_u1", "type": "user", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "看看这张图哪里不对"}, {"id": "b2", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"inline": "iVBORw0KGgo="}}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-8](contract.md#s-8-usermessage) |
| `{"id": "m_u2", "type": "user", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "# 代码评审\n逐个文件读……", "origin": {"kind": "skill_body", "command": "review", "skill": "code-review"}}, {"id": "b2", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "--dry-run src/", "origin": {"kind": "slash_command_args", "command": "review"}}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-8](contract.md#s-8-usermessage)、[S-6](contract.md#s-6-每种消息能装哪几类块)：斜杠命令展开之后落成用户消息，带来源标记 |
| `{"id": "m_u3", "type": "user", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块)：工具结果只在工具消息与后台收场提醒里 |
| `{"id": "m_u4", "type": "user", "blocks": [{"id": "b1", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_01", "tool": "rm", "arguments": {}}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块)：调用只由模型在它的回复里发起 |
| `{"id": "m_u5", "type": "developer", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `type_unknown` | [S-1](contract.md#s-1-七种消息)：七种之外，**不当作用户消息兜底**（[S-41](contract.md#s-41-七种之外即拒)） |
| `{"id": "m_u6", "type": "User", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `type_unknown` | [S-38](contract.md#s-38-判别式与枚举闭合)：区分大小写 |
| `{"id": "m_u7", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-1](contract.md#s-1-七种消息)：`type` 缺席不是「不在集合里的取值」，是缺必填成员 |
| `{"id": "m_u8", "type": "user", "blocks": [{"id": "b1", "kind": "text", "text": "hi"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `visibility_missing` | [S-2](contract.md#s-2-消息底座)：块层的拒绝值原名落进来；**不丢掉那一块留下其余的** |
| `{"id": "m_u9", "type": "user", "blocks": [], "createdAt": "2026-09-23T08:00:00Z", "tenant": "org_7fd2c1"}` | 拒绝 | `malformed` | [S-33](contract.md#s-33-消息不携带租户身份)：租户在条目上，不在消息上 |

## 4. AssistantMessage

**校验对象**：`$defs/Message`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "m_a1", "type": "assistant", "response": "rsp_01", "ending": "complete", "blocks": [{"id": "b1", "kind": "thinking", "visibility": {"toHuman": false, "toModel": true}, "text": "先读 README"}, {"id": "b2", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "我先看一下 README。"}, {"id": "b3", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_01", "tool": "read_file", "arguments": {"path": "README.md"}}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-9](contract.md#s-9-assistantmessage一次回复只有一份)、[S-10](contract.md#s-10-assistantmessage-怎么收的尾) |
| `{"id": "m_a2", "type": "assistant", "response": "rsp_02", "ending": "interrupted_by_user", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "好的，我来改第三"}, {"id": "b2", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": false}, "complete": false, "callId": "call_02", "tool": "write_file", "rawArguments": "{\"path\": \"src/a.t"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-10](contract.md#s-10-assistantmessage-怎么收的尾)：一条完整的消息，装着一个没长完的块 |
| `{"id": "m_a3", "type": "assistant", "response": "rsp_03", "ending": "truncated_at_limit", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "第一章……第二章……"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-10](contract.md#s-10-assistantmessage-怎么收的尾) |
| `{"id": "m_a4", "type": "assistant", "response": "rsp_04", "ending": "complete", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-10](contract.md#s-10-assistantmessage-怎么收的尾)：正常收尾的空回复是模型真给的，照记 |
| `{"id": "m_a5", "type": "assistant", "response": "rsp_05", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-assistantmessage-怎么收的尾)：`ending` 缺席，**从不当作 `complete`** |
| `{"id": "m_a6", "type": "assistant", "response": "rsp_06", "ending": "error", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "我来"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-assistantmessage-怎么收的尾)：**出错断的不成为消息**，没有这个取值 |
| `{"id": "m_a7", "type": "assistant", "response": "rsp_07", "ending": "complete", "blocks": [{"id": "b1", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": false}, "complete": false, "rawArguments": "{\"pa"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-assistantmessage-怎么收的尾)：正常收尾却有没长完的调用 |
| `{"id": "m_a8", "type": "assistant", "response": "rsp_08", "ending": "interrupted_by_user", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-assistantmessage-怎么收的尾)：什么都还没出来的那一种**不伪造一条空的** |
| `{"id": "m_a9", "type": "assistant", "ending": "complete", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-assistantmessage一次回复只有一份)：`response` 必填 |
| `{"id": "m_aa", "type": "assistant", "response": "rsp_0a", "ending": "complete", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块) |

## 5. ToolMessage

**校验对象**：`$defs/Message`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "m_t1", "type": "tool", "callId": "call_01", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": [{"id": "b2", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "# README ……"}]}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-11](contract.md#s-11-toolmessage) |
| `{"id": "m_t2", "type": "tool", "callId": "call_04", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_04", "outcome": "backgrounded", "reason": {"code": "backgrounded_auto", "text": "前台跑超过 60 秒，已转后台"}, "blocks": [{"id": "b2", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "已转后台，跑完会通知"}]}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-11](contract.md#s-11-toolmessage)：转后台的占位 |
| `{"id": "m_t3", "type": "tool", "callId": "call_06", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_06", "outcome": "failed", "reason": {"code": "abnormal_interruption", "text": "工具执行异常中断"}, "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-11](contract.md#s-11-toolmessage)：恢复对账追补的占位 |
| `{"id": "m_t4", "type": "tool", "callId": "call_11", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_11", "outcome": "completed", "blocks": [{"id": "b2", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "前 200 行……（共 18203 行，已卸载）"}], "offloaded": {"storage": "attachments", "key": "obj_off_1", "mediaType": "text/plain", "bytes": 912345}}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-11](contract.md#s-11-toolmessage)：卸载后的带摘要占位 |
| `{"id": "m_t5", "type": "tool", "callId": "call_01", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": []}, {"id": "b2", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `tool_message_block_count` | [S-11](contract.md#s-11-toolmessage)：一次调用一条、一条一块；**不被截成一块后接受**（[S-42](contract.md#s-42-工具消息恰一块)） |
| `{"id": "m_t6", "type": "tool", "callId": "call_01", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `tool_message_block_count` | [S-11](contract.md#s-11-toolmessage) |
| `{"id": "m_t7", "type": "tool", "callId": "call_01", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "ok"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `tool_message_block_count` | [S-11](contract.md#s-11-toolmessage)：那一块不是工具结果块——收场没有地方写 |
| `{"id": "m_t8", "type": "tool", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-toolmessage)：`callId` 必填，**不从块上补** |
| `{"id": "m_t9", "type": "tool", "callId": "call_01", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-toolmessage)：**按 `kind` 数块数是对的**；那一块缺 `outcome`，照块层的规则是 `malformed`，从不当作完成 |

## 6. ToolInternalMessage

**校验对象**：`$defs/Message`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "m_i1", "type": "tool_internal", "callId": "call_04", "ending": "complete", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": false}, "text": "clone 完成"}, {"id": "b2", "kind": "text", "visibility": {"toHuman": true, "toModel": false}, "text": "构建 100%"}, {"id": "b3", "kind": "image", "visibility": {"toHuman": true, "toModel": false}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_shot", "mediaType": "image/png"}}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-13](contract.md#s-13-toolinternalmessage)：一次执行一条，块可以很多 |
| `{"id": "m_i2", "type": "tool_internal", "callId": "call_04", "ending": "lost", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": false}, "text": "clone 完成"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-14](contract.md#s-14-toolinternalmessage-怎么收的尾)：产生者没了，已封口的块照样留 |
| `{"id": "m_i3", "type": "tool_internal", "callId": "call_05", "ending": "interrupted", "blocks": [{"id": "b1", "kind": "image", "visibility": {"toHuman": true, "toModel": false}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_shot", "mediaType": "image/png"}, "renderings": [{"producedBy": "system", "blocks": [{"id": "b1r", "kind": "text", "visibility": {"toHuman": false, "toModel": true}, "text": "一张构建面板截图"}]}], "transcript": "一张构建面板截图"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-13](contract.md#s-13-toolinternalmessage)：**只查顶层**——派生表示里的块标着给模型，但它的容器不给，按合取取用无从进模型那一侧 |
| `{"id": "m_i4", "type": "tool_internal", "callId": "call_04", "ending": "complete", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": false}, "text": "clone 完成"}, {"id": "b2", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "构建 100%"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `tool_internal_block_visible_to_model` | [S-13](contract.md#s-13-toolinternalmessage)：**不被改成 `false` 后接受**（[S-43](contract.md#s-43-工具帧不给模型)） |
| `{"id": "m_i5", "type": "tool_internal", "callId": "call_04", "ending": "complete", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-toolinternalmessage)：没发帧就没有这条消息，不落一条空的 |
| `{"id": "m_i6", "type": "tool_internal", "callId": "call_04", "ending": "failed", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": false}, "text": "……"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-toolinternalmessage-怎么收的尾)：`ending` 不是执行收场 |
| `{"id": "m_i7", "type": "tool_internal", "callId": "call_04", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": false}, "text": "……"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-toolinternalmessage-怎么收的尾)：`ending` 必填 |
| `{"id": "m_i8", "type": "tool_internal", "callId": "call_04", "ending": "complete", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": false}, "callId": "call_04", "outcome": "completed", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块)、[S-13](contract.md#s-13-toolinternalmessage)：**过程不冒充结论** |

## 7. SystemReminderMessage：每一种来源一个正例

**校验对象**：`$defs/Message`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "m_r1", "type": "system_reminder", "nature": "event", "source": {"kind": "background_execution_finished", "callId": "call_04", "outcome": "completed"}, "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_04", "outcome": "completed", "blocks": [{"id": "b2", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "构建成功，产物在 dist/"}]}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-19](contract.md#s-19-后台执行的两种收场提醒)：结果就是那一个工具结果块 |
| `{"id": "m_r2", "type": "system_reminder", "nature": "event", "source": {"kind": "background_execution_interrupted", "callId": "call_05"}, "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_05", "outcome": "failed", "reason": {"code": "abnormal_interruption", "text": "后台工具执行异常中断"}, "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-19](contract.md#s-19-后台执行的两种收场提醒)：对账代落，收场是失败 |
| `{"id": "m_r3", "type": "system_reminder", "nature": "event", "source": {"kind": "attempt_started", "attempt": 2, "reason": "resumed_after_interruption", "at": "2026-09-23T08:05:00Z"}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "这是第 2 次尝试，从一次中断接上来；之前发出的动作可能已经做过一次。"}], "createdAt": "2026-09-23T08:05:00Z"}` | 通过 | — | [S-20](contract.md#s-20-尝试开始) |
| `{"id": "m_r4", "type": "system_reminder", "nature": "event", "source": {"kind": "interrupted", "what": "model_call", "by": "user", "hadContent": true, "about": {"kind": "model", "call": "mc_01", "dispatch": 1}}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "刚才用户叫停了你的回复。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-21](contract.md#s-21-中断之后必补一条)：指一次模型调用的第 1 次发出 |
| `{"id": "m_r5", "type": "system_reminder", "nature": "event", "source": {"kind": "attempt_started", "attempt": 1, "reason": "first", "at": "2026-09-23T08:00:00Z"}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "这是这次运行的第 1 次尝试。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-20](contract.md#s-20-尝试开始)：第一次尝试是 `first` |
| `{"id": "m_r5b", "type": "system_reminder", "nature": "event", "source": {"kind": "attempt_started", "attempt": 3, "reason": "resumed_after_wait", "at": "2026-09-23T09:00:00Z"}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "你等的答复回来了，这是第 3 次尝试。"}], "createdAt": "2026-09-23T09:00:00Z"}` | 通过 | — | [S-20](contract.md#s-20-尝试开始)：等到的东西回来了 |
| `{"id": "m_r6", "type": "system_reminder", "nature": "event", "source": {"kind": "interrupted", "what": "run", "by": "system", "hadContent": false}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "上一次运行被取消了。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-21](contract.md#s-21-中断之后必补一条)：`run` 不带 `about` |
| `{"id": "m_r7", "type": "system_reminder", "nature": "event", "source": {"kind": "system_wait_answered", "cardId": "card_01", "extension": "admission-decision", "answers": [{"optionId": "this_session", "at": "2026-09-23T08:07:00Z"}]}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "你要执行的 git push 已获准：本会话内有效。"}], "createdAt": "2026-09-23T08:07:00Z"}` | 通过 | — | [S-22](contract.md#s-22-系统发起的等待答复回来) |
| `{"id": "m_r8", "type": "system_reminder", "nature": "event", "source": {"kind": "loop_guard", "level": "level_1", "finding": "同一个文件以相同参数连续读了 5 次"}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "你似乎在原地打转：README 已经读过 5 次。换个办法，或者告诉用户卡在哪里。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-23](contract.md#s-23-循环守卫的干预) |
| `{"id": "m_r9", "type": "system_reminder", "nature": "event", "source": {"kind": "peer_session_note", "fromSession": "ses_child_1", "fromAgent": "agt_reviewer"}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "子 agent 回报：三处问题已列在 review.md。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-24](contract.md#s-24-别的会话捎话与到点了) |
| `{"id": "m_ra", "type": "system_reminder", "nature": "event", "source": {"kind": "scheduled_trigger", "schedule": "sch_daily", "dueAt": "2026-09-24T01:00:00Z"}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "每日巡检到点了。"}], "createdAt": "2026-09-24T01:00:02Z"}` | 通过 | — | [S-24](contract.md#s-24-别的会话捎话与到点了) |
| `{"id": "m_rb", "type": "system_reminder", "nature": "state", "source": {"kind": "runtime_context_changed", "block": "org_view", "previous": {"org": "org_a"}, "current": {"org": "org_b"}}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "当前组织从 org_a 变成了 org_b。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-17](contract.md#s-17-说状态的带前值与现值)、[S-25](contract.md#s-25-runtime-context-的变更与全量) |
| `{"id": "m_rc", "type": "system_reminder", "nature": "state", "source": {"kind": "runtime_context_changed", "block": "exec_env", "previous": null, "current": {"host": "sandbox-3"}}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "你现在落在 sandbox-3 上。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-17](contract.md#s-17-说状态的带前值与现值)：`null` 读作「从未感知过」 |
| `{"id": "m_rd", "type": "system_reminder", "nature": "state", "source": {"kind": "runtime_context_snapshot", "blocks": {"org_view": {"org": "org_b"}, "todo_items": []}, "reason": "after_compaction"}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "当前组织 org_b；待办为空。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-25](contract.md#s-25-runtime-context-的变更与全量)：全量那一份不带前值；值 `[]` 不是 `null` |
| `{"id": "m_re", "type": "system_reminder", "nature": "event", "source": {"kind": "extension", "extension": "deploy-watch", "payload": {"env": "prod"}}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "生产环境刚完成一次发布。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-26](contract.md#s-26-拓展件追加的提醒) |
| `{"id": "m_rf", "type": "system_reminder", "nature": "state", "source": {"kind": "extension", "extension": "quota-meter"}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "本月额度从 40% 用到了 85%。"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-26](contract.md#s-26-拓展件追加的提醒)：说状态由那一件声明；前值写在正文里 |

## 8. SystemReminderMessage：反例

**校验对象**：`$defs/Message`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "m_n1", "type": "system_reminder", "nature": "event", "source": {"kind": "runtime_context_changed", "block": "org_view", "previous": {"org": "org_a"}, "current": {"org": "org_b"}}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `reminder_nature_mismatch` | [S-16](contract.md#s-16-性质与来源定死对应)：**不按来源改性质**（[S-44](contract.md#s-44-提醒的性质与来源)） |
| `{"id": "m_n2", "type": "system_reminder", "nature": "state", "source": {"kind": "loop_guard", "level": "level_2", "finding": "……"}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `reminder_nature_mismatch` | [S-16](contract.md#s-16-性质与来源定死对应) |
| `{"id": "m_n3", "type": "system_reminder", "nature": "state", "source": {"kind": "runtime_context_changed", "block": "org_view", "current": {"org": "org_b"}}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `reminder_state_without_previous` | [S-17](contract.md#s-17-说状态的带前值与现值)：**不补成 `null`** |
| `{"id": "m_n4", "type": "system_reminder", "nature": "state", "source": {"kind": "runtime_context_changed", "block": "org_view", "previous": {"org": "org_a"}, "current": null}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-17](contract.md#s-17-说状态的带前值与现值)：现值不为 `null` |
| `{"id": "m_n5", "type": "system_reminder", "nature": "event", "source": {"kind": "tool_progress", "callId": "call_04"}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-来源闭合拓展件走兜底)：未知来源，**不当作 `extension`** |
| `{"id": "m_n6", "type": "system_reminder", "source": {"kind": "scheduled_trigger", "schedule": "sch_daily", "dueAt": "2026-09-24T01:00:00Z"}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-systemremindermessage正文给模型读来源给系统认)：`nature` 必填，**不从来源推** |
| `{"id": "m_n7", "type": "system_reminder", "nature": "event", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "后台执行 call_04 已结束"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-systemremindermessage正文给模型读来源给系统认)：`source` 必填，**不从正文推** |
| `{"id": "m_n8", "type": "system_reminder", "nature": "event", "source": {"kind": "background_execution_finished", "callId": "call_04", "outcome": "completed"}, "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "构建成功"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-后台执行的两种收场提醒)：结果必须是那一个工具结果块，不是一段话 |
| `{"id": "m_n9", "type": "system_reminder", "nature": "event", "source": {"kind": "background_execution_finished", "callId": "call_04", "outcome": "unavailable"}, "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_04", "outcome": "unavailable", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-后台执行的两种收场提醒)：后台那段执行的收场只在四种里出 |
| `{"id": "m_na", "type": "system_reminder", "nature": "event", "source": {"kind": "background_execution_interrupted", "callId": "call_05"}, "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_05", "outcome": "interrupted", "reason": {"code": "session_archived", "text": "会话被归档"}, "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-后台执行的两种收场提醒)：异常中断落在**失败**，不是被中断 |
| `{"id": "m_nb", "type": "system_reminder", "nature": "event", "source": {"kind": "loop_guard", "level": "level_1", "finding": "……"}, "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_04", "outcome": "completed", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块)：工具结果只在后台执行的两种收场提醒里 |
| `{"id": "m_nc", "type": "system_reminder", "nature": "event", "source": {"kind": "attempt_started", "attempt": 1, "reason": "recovered_after_outage", "at": "2026-09-23T08:00:00Z"}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-尝试开始)：取值闭合，账本原有的 `recovered_after_outage` 已作废 |
| `{"id": "m_nd", "type": "system_reminder", "nature": "event", "source": {"kind": "attempt_started", "attempt": 0, "reason": "resumed_after_interruption", "at": "2026-09-23T08:00:00Z"}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-尝试开始)：序号 ≥ 1 |
| `{"id": "m_ne", "type": "system_reminder", "nature": "event", "source": {"kind": "interrupted", "what": "tool_execution", "by": "user", "hadContent": false}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-中断之后必补一条)：工具执行被中断不另补这条，占位承载它 |
| `{"id": "m_ne2", "type": "system_reminder", "nature": "event", "source": {"kind": "interrupted", "what": "model_call", "by": "user", "hadContent": false, "about": {"kind": "tool", "callId": "call_07"}}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-中断之后必补一条)：`about` 只有模型调用那一支 |
| `{"id": "m_nf", "type": "system_reminder", "nature": "event", "source": {"kind": "interrupted", "what": "run", "by": "user", "hadContent": false, "about": {"kind": "model", "call": "mc_01", "dispatch": 1}}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-中断之后必补一条)：`run` 不带 `about` |
| `{"id": "m_ng", "type": "system_reminder", "nature": "event", "source": {"kind": "interrupted", "what": "model_call", "by": "user"}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-中断之后必补一条)：`hadContent` 必填，**不当作 `false`** |
| `{"id": "m_nh", "type": "system_reminder", "nature": "event", "source": {"kind": "system_wait_answered", "cardId": "card_01", "extension": "admission-decision", "answers": []}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-22](contract.md#s-22-系统发起的等待答复回来)：答复回来至少一项 |
| `{"id": "m_ni", "type": "system_reminder", "nature": "event", "source": {"kind": "loop_guard", "level": "L1", "finding": "……"}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-23](contract.md#s-23-循环守卫的干预)：token 是 `level_1`，旧写法 `L1` 不认 |
| `{"id": "m_nj", "type": "system_reminder", "nature": "state", "source": {"kind": "runtime_context_snapshot", "blocks": {}, "reason": "session_start"}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-25](contract.md#s-25-runtime-context-的变更与全量)：全量那一份至少一项 |
| `{"id": "m_nk", "type": "system_reminder", "nature": "event", "source": {"kind": "extension", "extension": ""}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-26](contract.md#s-26-拓展件追加的提醒)：拓展件要带上它是哪一件 |
| `{"id": "m_nl", "type": "system_reminder", "nature": "event", "source": {"kind": "extension", "extension": "deploy-watch"}, "blocks": [{"id": "b1", "kind": "thinking", "visibility": {"toHuman": false, "toModel": true}, "text": "……"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块) |

## 9. CompactionMessage

**校验对象**：`$defs/Message`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "m_c1", "type": "compaction", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "前面：用户要求审 README，已读完并提出三处修改。"}], "silenced": [{"messageId": "m_u1", "blockId": "b2"}, {"messageId": "m_t1", "blockId": "b2"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-27](contract.md#s-27-compactionmessage-与它的名单)：第二项点的是工具结果里嵌着的块 |
| `{"id": "m_c2", "type": "compaction", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "前面：……"}], "silenced": [], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-27](contract.md#s-27-compactionmessage-与它的名单)：只概括、不点名 |
| `{"id": "m_c3", "type": "compaction", "blocks": [], "silenced": [{"messageId": "m_t4", "blockId": "b1"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | — | [S-27](contract.md#s-27-compactionmessage-与它的名单)：只点名、不概括 |
| `{"id": "m_c4", "type": "compaction", "blocks": [], "silenced": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-27](contract.md#s-27-compactionmessage-与它的名单)：一次什么都没做的压缩 |
| `{"id": "m_c5", "type": "compaction", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "前面：……"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-27](contract.md#s-27-compactionmessage-与它的名单)：名单缺席**不当作空** |
| `{"id": "m_c6", "type": "compaction", "blocks": [], "silenced": [{"messageId": "m_u1", "blockId": "b2"}, {"messageId": "m_u1", "blockId": "b2"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-27](contract.md#s-27-compactionmessage-与它的名单)：同一项不重复 |
| `{"id": "m_c7", "type": "compaction", "blocks": [], "silenced": [{"messageId": "m_u1"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-27](contract.md#s-27-compactionmessage-与它的名单)：点的是块，不是一整条消息、也不是一条截断线 |
| `{"id": "m_c8", "type": "compaction", "blocks": [], "silenced": [{"messageId": "m_u1", "blockId": "b2", "toHuman": false}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-27](contract.md#s-27-compactionmessage-与它的名单)：名单只覆盖模型那一侧，**不带「给人看」** |
| `{"id": "m_c9", "type": "compaction", "blocks": [{"id": "b1", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_09", "tool": "read_file", "arguments": {}}], "silenced": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-每种消息能装哪几类块) |

## 10. Schema 挡不住，但同样非法的

**校验对象**：`$defs/Message`（第一张表）。这些实例**形状全部合规**——Schema 一列写的就是 `通过`；
非法在于 Schema 表达不了的约束。**只跑 Schema 的实现会把它们全部放行。**

### 10.1 单条消息里的跨成员约束

**接收边界只看这一条消息就判得出。**

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "m_x1", "type": "tool", "callId": "call_01", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_02", "outcome": "completed", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | `tool_message_block_count` | [S-11](contract.md#s-11-toolmessage)：两个 `callId` 不同（[S-42](contract.md#s-42-工具消息恰一块) 反例二） |
| `{"id": "m_x2", "type": "system_reminder", "nature": "event", "source": {"kind": "background_execution_finished", "callId": "call_04", "outcome": "completed"}, "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_04", "outcome": "failed", "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | `malformed` | [S-19](contract.md#s-19-后台执行的两种收场提醒)：`source.outcome` 与块上的不同——**不按其中一方改另一方** |
| `{"id": "m_x3", "type": "system_reminder", "nature": "event", "source": {"kind": "background_execution_interrupted", "callId": "call_05"}, "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_06", "outcome": "failed", "reason": {"code": "abnormal_interruption", "text": "后台工具执行异常中断"}, "blocks": []}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | `malformed` | [S-19](contract.md#s-19-后台执行的两种收场提醒)：`callId` 对不上 |
| `{"id": "m_x4", "type": "compaction", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "前面：……"}], "silenced": [{"messageId": "m_x4", "blockId": "b1"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | `compaction_self_reference` | [S-29](contract.md#s-29-合法名单的判定) ① |
| `{"id": "m_x5", "type": "user", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "甲"}, {"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "乙"}], "createdAt": "2026-09-23T08:00:00Z"}` | 通过 | `block_id_duplicate` | [S-2](contract.md#s-2-消息底座)：一条消息里块标识重复——名单点 `(m_x5, b1)` 会指到两块 |

### 10.2 会话日志层的判定

**要看得见这条消息之前的日志才判得出**；下表不是 Schema 实例，是情形。第一、二、四行有拒绝值，其余是**判定为不合法**，它们在操作失败集合里的名字归各自的能力契约（[S-29](contract.md#s-29-合法名单的判定)）。

| 情形 | 违反 | 结论 |
|---|---|---|
| 日志 `[m1, m2, c]`，`c` 的名单点 `(m9, b1)`，而 `m9` 此时不在日志里（之后才出现，或根本不会出现） | [S-29](contract.md#s-29-合法名单的判定) ② | `compaction_forward_reference` |
| 同上，但 `c` 点的是 `(c, b1)` | [S-29](contract.md#s-29-合法名单的判定) ① | `compaction_self_reference`（第一段就判出，不进第二段） |
| `c` 点 `(m1, b7)`，`m1` 在前面，但 `m1` 里（任意层）没有 `b7` | [S-29](contract.md#s-29-合法名单的判定) ③ | 名单不合法：点了不存在的块 |
| `c` 点 `(m_sys, b1)`，`m_sys` 是某一次组装出来的 `SystemMessage` 的 `id` | [S-29](contract.md#s-29-合法名单的判定) ② | `compaction_forward_reference`：`SystemMessage` 不落日志（[S-7](contract.md#s-7-systemmessage)），`m_sys` 不是 `c` 之前日志里的一条消息——原来的 ④ 由此删去 |
| 把一条形状合法的 `SystemMessage` 追加进日志 | [S-32](contract.md#s-32-会话日志里的配对与唯一) ⑦ | 日志不一致：拒绝这次追加——系统提示词每次组装现算，不落日志 |
| 日志 `[…, t(call_04, backgrounded), …, c]`，中间**没有** `call_04` 的后台收场提醒；`c` 点 `t` 里的 `b1`，**或 `b1` 里嵌着的 `b2`** | [S-29](contract.md#s-29-合法名单的判定) ⑤、[S-30](contract.md#s-30-悬着的占位) | 名单不合法：点了悬着的占位 |
| 日志 `[…, t(call_04, backgrounded), …, r(background_execution_finished, call_04), …, c]`，`c` 点 `t` 里的 `b1` | — | **合法**：它已经不悬着（[S-46](contract.md#s-46-名单的合法性) 正例） |
| 日志 `[m1, m2, m3, m4, c]`，最近一次模型请求在 `m3` 之后、`m4` 之前组装；`c` 点 `(m4, b8)` | [S-29](contract.md#s-29-合法名单的判定) ⑥ | 名单不合法：压了模型还没看过的东西 |
| 日志里还没有过任何模型请求，`c` 的名单不空 | [S-29](contract.md#s-29-合法名单的判定) ⑥ | 名单不合法 |
| 两条 `ToolMessage` 都是 `call_01` | [S-32](contract.md#s-32-会话日志里的配对与唯一) ② | 日志不一致：拒绝第二次追加；**消费者不挑一条信** |
| 一条 `ToolMessage` 的 `callId` 在前面只对得上一个 `complete: false` 的调用块，或根本对不上 | [S-32](contract.md#s-32-会话日志里的配对与唯一) ② | 日志不一致 |
| `r(background_execution_finished, call_04)` 排在 `call_04` 的转后台占位之前，或那次调用根本没有转后台占位 | [S-32](contract.md#s-32-会话日志里的配对与唯一) ④ | 日志不一致——它应当是一条工具消息（[S-12](contract.md#s-12-真实结果落哪种消息只看有没有占位)） |
| `call_04` 有一条 `background_execution_finished`、又有一条 `background_execution_interrupted` | [S-32](contract.md#s-32-会话日志里的配对与唯一) ④ | 日志不一致：一段后台执行只结束一次 |
| 两条 `AssistantMessage` 的 `response` 都是 `rsp_01` | [S-32](contract.md#s-32-会话日志里的配对与唯一) ⑤ | 日志不一致 |
| 组装按 `createdAt` 排序，把一条后写进日志、时钟却靠前的消息排到了前面 | [S-4](contract.md#s-4-createdat-不是次序) | 违约：次序只按日志 |
| 恢复对账从某条用户消息的正文里读到「后台执行 call_04 已结束」，就不再追补 | [S-15](contract.md#s-15-systemremindermessage正文给模型读来源给系统认) | 违约：系统只读 `source` |
| 翻译方把 `m_r1` 里的工具结果译成对 `call_04` 的第二个「工具结果」 | [S-35](contract.md#s-35-我们自己那两种必须在发出前译掉) | 违约：那次调用已由占位答过 |

## 11. 规范场景：五条消息，此刻哪些块模型可读

**这是 [S-28](contract.md#s-28-此刻模型可读是算出来的) 派生规则的规范场景**（[S-47](contract.md#s-47-此刻模型可读)）。五条消息按日志先后排列；两次模型请求不是消息，只标出它们组装时日志到了哪里。
每条消息都能拿 `$defs/Message` 校验，**五条全部 `通过`**。

| # | 消息 |
|---|---|
| m1 | `{"id": "m1", "type": "user", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "这张图的配色有问题吗？"}, {"id": "b2", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_chart", "mediaType": "image/png"}}], "createdAt": "2026-09-23T08:00:00Z"}` |
| — | **模型请求 R1**，组装时日志里只有 m1 |
| m2 | `{"id": "m2", "type": "assistant", "response": "rsp_1", "ending": "complete", "blocks": [{"id": "b3", "kind": "thinking", "visibility": {"toHuman": true, "toModel": false}, "text": "先取一下配色规范"}, {"id": "b4", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "complete": true, "callId": "call_1", "tool": "read_file", "arguments": {"path": "docs/palette.md"}}], "createdAt": "2026-09-23T08:00:05Z"}` |
| m3 | `{"id": "m3", "type": "tool", "callId": "call_1", "blocks": [{"id": "b5", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_1", "outcome": "completed", "blocks": [{"id": "b6", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "主色 #1F6FEB，辅色 #F0883E"}, {"id": "b7", "kind": "image", "visibility": {"toHuman": true, "toModel": true}, "mediaType": "image/png", "data": {"storage": "attachments", "key": "obj_swatch", "mediaType": "image/png"}}]}], "createdAt": "2026-09-23T08:00:06Z"}` |
| — | **模型请求 R2**，组装时日志里是 m1、m2、m3 |
| m4 | `{"id": "m4", "type": "assistant", "response": "rsp_2", "ending": "complete", "blocks": [{"id": "b8", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "图里的橙色偏离了辅色规范。"}], "createdAt": "2026-09-23T08:00:12Z"}` |
| m5 | `{"id": "m5", "type": "compaction", "blocks": [{"id": "b9", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "用户问一张图的配色；已对照规范（主色 #1F6FEB、辅色 #F0883E），指出橙色偏离。"}], "silenced": [{"messageId": "m1", "blockId": "b2"}, {"messageId": "m3", "blockId": "b7"}], "createdAt": "2026-09-23T08:10:00Z"}` |

**m5 的名单合法吗**（[S-29](contract.md#s-29-合法名单的判定)，`P` = m1～m4）：
① 不点 m5 自己 ✓；② m1、m3 都在 `P` 里 ✓；③ `b2` 是 m1 的顶层块，`b7` 嵌在 m3 的 `b5` 里 ✓；（④ 已删去）
⑤ `P` 里没有转后台的工具消息，没有悬着的占位 ✓；⑥ m5 之前最近一次模型请求是 R2，它组装时 m1、m3 已在日志里 ✓——**合法**。

**逐块手算**（`path` 从块本身往外列到顶层；「可读」按 [S-28](contract.md#s-28-此刻模型可读是算出来的)）：

| 块 | 所在消息 | `path` | `path` 上的 `toModel` | 被谁点名 | 到 m4 为止可读？ | 到 m5 为止可读？ |
|---|---|---|---|---|---|---|
| b1 | m1 | b1 | 真 | — | **是** | **是** |
| b2 | m1 | b2 | 真 | m5 | **是** | **否**——被点名 |
| b3 | m2 | b3 | **假** | — | 否——标着不给模型 | 否 |
| b4 | m2 | b4 | 真 | — | **是** | **是** |
| b5 | m3 | b5 | 真 | — | **是** | **是** |
| b6 | m3 | b6 → b5 | 真、真 | — | **是** | **是**——同一个容器里的 b7 被点名不影响它 |
| b7 | m3 | b7 → b5 | 真、真 | m5（点的是 b7 自己） | **是** | **否**——被点名 |
| b8 | m4 | b8 | 真 | — | **是** | **是** |
| b9 | m5 | b9 | 真 | — | 不在前缀里 | **是** |

**结论**：到 m4 为止，模型可读的是 `{b1, b2, b4, b5, b6, b7, b8}`；到 m5 为止是 `{b1, b4, b5, b6, b8, b9}`。
在 m5 之后再追加任何消息，`b2`、`b3`、`b7` 都不会再回到可读——**单调不回退**；任何一块的标注都没有变。

**三个变体，用来核对实现没有写错**：

- m5 的名单改点 `(m4, b8)`：**不合法**（⑥：m4 在 R2 之后才来，模型还没看过它）。
- m5 的名单改点 `(m3, b5)`：**合法**，`b5`、`b6`、`b7` 一起不可读——但 `b4` 那个调用仍可读、它的结果没了；**这一对之后怎样保持成对，是组装的事**（[CS-3](contract.md#cs-3-上下文组装取块)）。
- 一个实现按「从最后一条压缩记录往后取」组装：到 m5 为止它只给 `b9`，**丢了仍然可读的 `b1`、`b4`、`b5`、`b6`、`b8`**，而没有任何地方报错（[PF-010 §6.15](../../../../product/PF-010-context-management-and-assembly/design.md#615-组装边界要看哪些块还模型可读不是最后一条摘要在哪)）。

## 12. 几处违例同时出现时取哪个拒绝值

**校验对象**：`$defs/Message`。本节每个实例**故意同时违反两条**，演示 [S-39](contract.md#s-39-表示层拒绝值) 的优先级。

| 实例 | Schema | 拒绝值 | 同时违反了什么 |
|---|---|---|---|
| `{"id": "p1", "type": "notification", "blocks": []}` | 拒绝 | `type_unknown` | `type` 不在集合里 ＋ 缺 `createdAt`（`malformed`）⇒ 前者优先 |
| `{"id": "p2", "type": "tool", "callId": "call_01", "blocks": [{"id": "b1", "kind": "tool_result", "visibility": {"toHuman": true, "toModel": true}, "callId": "call_01", "outcome": "completed", "blocks": []}, {"id": "b2", "kind": "text", "text": "ok"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `visibility_missing` | 块层缺标注 ＋ 工具消息两块（`tool_message_block_count`）⇒ 块层优先 |
| `{"id": "p3", "type": "tool", "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `tool_message_block_count` | 没有块 ＋ 缺 `callId`（`malformed`）⇒ 前者优先 |
| `{"id": "p4", "type": "tool_internal", "callId": "call_04", "blocks": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "……"}], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `tool_internal_block_visible_to_model` | 块标着给模型 ＋ 缺 `ending`（`malformed`）⇒ 前者优先 |
| `{"id": "p5", "type": "system_reminder", "nature": "event", "source": {"kind": "runtime_context_changed", "block": "org_view", "current": {"org": "org_b"}}, "blocks": [], "createdAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `reminder_nature_mismatch` | 性质对不上 ＋ 缺前值（`reminder_state_without_previous`）⇒ 前者优先 |
| `{"id": "p6", "type": "compaction", "blocks": [], "silenced": [{"messageId": "p6", "blockId": "b1"}], "createdAt": "2026-09-23T08:00:00Z", "reason": "window"}` | 拒绝 | `compaction_self_reference` | 点了自己 ＋ 多出成员 `reason`（`malformed`）⇒ 前者优先；**第一段有违例，不进第二段** |

## 13. 起草者逐条自核

**本节记录每一节的行数与核了什么。**起草时逐行手核；整批对齐（2026-09-23）与第一轮评审修复（2026-09-24）时用 Draft 2020-12 校验器机核了「Schema」一列，结果登在[验证入口](../verification.md#结果与反例)。下表的数字是 2026-09-24 的实际行数。

| 节 | 通过 | 拒绝 | 核了什么 |
|---|---|---|---|
| 1 MessageId | 2 | 5 | 首尾空白两条回归用例（尾随换行、前导 U+FEFF）与 `data.identity-values` v1 第 1 节同形 |
| 2 SystemMessage | 1 | 6 | 每个拒绝实例只动一处；消息上多一个 `visibility` 被 `unevaluatedProperties` 挡住；图块被「本版只含文本」挡住 |
| 3 UserMessage | 2 | 7 | 图块的 base64 `iVBORw0KGgo=` 12 字符以 `=` 收尾，是完整的三个四字组；`m_u7` 缺 `type` 定为 `malformed` 而非 `type_unknown`；`m_u8` 的拒绝值来自块层 |
| 4 AssistantMessage | 4 | 6 | `m_a2` 的半截调用标注为两个 `false`，`ending` 不是 `complete` 所以允许；`m_a4` 的空数组在 `complete` 下没有下限 |
| 5 ToolMessage | 4 | 5 | 每个通过实例的 `reason` 与收场对上 `data.content-blocks/v1#S-18`；`m_t7` 一块但 `kind` 不对，按 `kind` 数定为 `tool_message_block_count`；`m_t9` 块数对、块缺 `outcome` |
| 6 ToolInternalMessage | 3 | 5 | `m_i3` 的派生块只给模型，顶层块不给——只查顶层 |
| 7 提醒正例 | 16 | 0 | 十一种来源各至少一例；每例 `nature` 与定死的对应一致；两条后台收场提醒里恰好一个工具结果块、`callId`／`outcome` 与 `source` 相同 |
| 8 提醒反例 | 0 | 22 | `m_n5` 未知来源定为 `malformed`；`m_n8` 被「恰好一个工具结果块」挡住；`m_nc` 起草时是 G-8 那一格（对齐波改为作废的旧 token） |
| 9 CompactionMessage | 3 | 6 | 「不能都空」对 `m_c2`（名单空、摘要在）与 `m_c3`（摘要空、名单在）都不触发，只对 `m_c4` 触发 |
| 10.1 跨成员 | 5 | 0 | Schema 全通过；拒绝值来自契约 |
| 11 场景 | 5 | 0 | 五条消息各自通过；逐块手算两个前缀 |
| 12 优先级 | 0 | 6 | 每行写明同时违反的两条，拒绝值按 [S-39](contract.md#s-39-表示层拒绝值) 第一段的次序取 |
| 14 五种运行时记录 | 11 | 16 | 「已出门」的每个反例都带齐绑定、只动一处；传输适配的两份清单各一条空数组反例、一条跨成员违约（Schema 通过）；`released` 的两支（`cause` 缺席、`credential_unavailable`）各一例；第二行的跨记录违约 Schema 管不到 |

**合计 140 行实例：预期通过 56、拒绝 84**（其中第 11 节 5 行按 `$defs/Message` 各校一次）。第 10.2 节不在其内（它是情形，不是实例）。

## 14. 模型请求运行时的五种记录（不是消息）

**校验对象**：`$defs/ModelInvocationRecord`。这五种记录**不是消息**（[S-49](contract.md#s-49-模型请求运行时写的五种记录不是消息)）；不合形状一律 `malformed`。

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-x", "response": "rsp_01", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"temperature": 0.2}, "selectedBy": "session", "credentialScope": {"layer": "factory"}}` | 通过 | — | [S-49](contract.md#s-49-模型请求运行时写的五种记录不是消息)：已出门，带着这次调用的绑定；官方档案走了出厂格那一把 |
| `{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 2, "provider": "provider-y", "response": "rsp_02", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"temperature": 0.2}, "selectedBy": {"extension": "cheap-first-router"}, "credentialScope": {"layer": "tenant", "tenant": {"organization": "org_7fd2c1", "account": "acc_91ab40"}}}` | 通过 | — | [S-49](contract.md#s-49-模型请求运行时写的五种记录不是消息)：同一次调用的第二次发出；`selectedBy` 是拓展件那一支，凭据在租户格——Schema 不管「同一调用各次发出的绑定逐字相同」，**这一行与上一行的 `selectedBy` 不同，写入方违约**（跨记录，见 S-49） |
| `{"kind": "model_call_dispatched", "call": "mc_07", "dispatch": 1, "provider": "provider-x", "response": "rsp_07", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"reasoningEffort": "max", "maxOutputTokens": 8192, "extra": {"top_k": 40}}, "selectedBy": "session", "credentialScope": {"layer": "factory"}, "parameterAdjustments": [{"name": "reasoningEffort", "requested": "max", "sent": "high"}], "droppedParameters": ["top_k"]}` | 通过 | — | [S-49](contract.md#s-49-模型请求运行时写的五种记录不是消息)：传输适配在出门之前定下改一项、丢一项，记在这一条上；实际发出的那一组是 `{reasoningEffort: high, maxOutputTokens: 8192}`，与同一次发出的响应体 `route` 三项逐项相同（主线裁定，见 D-040 §六 L4） |
| `{"kind": "model_call_dispatched", "call": "mc_07", "dispatch": 1, "provider": "provider-x", "response": "rsp_07", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"reasoningEffort": "max", "maxOutputTokens": 8192, "extra": {"top_k": 40}}, "selectedBy": "session", "credentialScope": {"layer": "factory"}, "parameterAdjustments": [{"name": "reasoningEffort", "requested": "high", "sent": "medium"}]}` | 通过 | — | [S-49](contract.md#s-49-模型请求运行时写的五种记录不是消息)：`requested` 不等于 `parameters` 里那一项的值——Schema 管不到（跨成员），**写入方违约** |
| `{"kind": "model_call_opened", "call": "mc_01", "dispatch": 1, "firstTokenAt": "2026-09-23T08:00:01Z"}` | 通过 | — | 已开口 |
| `{"kind": "model_call_interrupt_intent", "call": "mc_01", "initiator": "run_cancelled"}` | 通过 | — | 中断意图 |
| `{"kind": "model_call_ended", "call": "mc_02", "ending": "undispatched", "cause": "credential_unavailable"}` | 通过 | — | [S-50](contract.md#s-50-调用终结的三支)：出门前检查不过 |
| `{"kind": "model_call_ended", "call": "mc_03", "ending": "released"}` | 通过 | — | [S-50](contract.md#s-50-调用终结的三支)：最近一次发出以故障收场、loop 放手；成因在那份响应体上 |
| `{"kind": "model_call_ended", "call": "mc_06", "ending": "released", "cause": "credential_unavailable"}` | 通过 | — | [S-50](contract.md#s-50-调用终结的三支)：此前发出过，续接或再发之前凭据取不到——**不写 `undispatched`** |
| `{"kind": "model_call_ended", "call": "mc_04", "ending": "interrupted", "initiator": "user"}` | 通过 | — | [S-50](contract.md#s-50-调用终结的三支)：两次发出之间被中断 |
| `{"kind": "model_selection_changed", "routeName": "vendor-a/chat-large", "at": "2026-09-23T08:00:00Z"}` | 通过 | — | 模型切换落下的那条记录；`routeName` 取 `data.model-profile` 的 `RouteName`（切到的是名字） |
| `{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-x", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"temperature": 0.2}, "selectedBy": "session", "credentialScope": {"layer": "factory"}}` | 拒绝 | `malformed` | 已出门必带 `response`：它在这一刻定下 |
| `{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 0, "provider": "provider-x", "response": "rsp_01", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"temperature": 0.2}, "selectedBy": "session", "credentialScope": {"layer": "factory"}}` | 拒绝 | `malformed` | 发出序号 ≥ 1 |
| `{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-x", "response": "rsp_01", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"temperature": 0.2}, "selectedBy": "session", "credentialScope": {"layer": "factory"}, "attempt": 2}` | 拒绝 | `malformed` | 尝试在条目上，不在记录里（[S-33](contract.md#s-33-消息不携带租户身份)） |
| `{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-x", "response": "rsp_01", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "parameters": {"temperature": 0.2}, "selectedBy": "session", "credentialScope": {"layer": "factory"}}` | 拒绝 | `malformed` | [S-49](contract.md#s-49-模型请求运行时写的五种记录不是消息)：绑定必带——缺了档案快照，续接时只能去内存里找 |
| `{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-x", "response": "rsp_01", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"temperature": 0.2}, "selectedBy": "session", "credentialScope": {"layer": "organization", "organization": "org_7fd2c1"}}` | 拒绝 | `malformed` | [S-49](contract.md#s-49-模型请求运行时写的五种记录不是消息)：模型凭据只在租户层与出厂格，没有组织那一格（与 `data.model-response/v1#S-9` 同形） |
| `{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-x", "response": "rsp_01", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"temperature": 0.2}, "selectedBy": "user", "credentialScope": {"layer": "factory"}}` | 拒绝 | `malformed` | [S-38](contract.md#s-38-判别式与枚举闭合)：`selectedBy` 闭合（与 `data.model-response/v1#S-10` 同形） |
| `{"kind": "model_call_dispatched", "call": "mc_07", "dispatch": 1, "provider": "provider-x", "response": "rsp_07", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"reasoningEffort": "max", "maxOutputTokens": 8192, "extra": {"top_k": 40}}, "selectedBy": "session", "credentialScope": {"layer": "factory"}, "parameterAdjustments": []}` | 拒绝 | `malformed` | [S-49](contract.md#s-49-模型请求运行时写的五种记录不是消息)：「一项值也没改」只有缺席一种写法 |
| `{"kind": "model_call_dispatched", "call": "mc_07", "dispatch": 1, "provider": "provider-x", "response": "rsp_07", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "profileSnapshot": {"providers": ["provider-x", "provider-y"], "allowFallback": true, "inputModalities": ["text", "image"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "parameters": {"reasoningEffort": "max", "maxOutputTokens": 8192, "extra": {"top_k": 40}}, "selectedBy": "session", "credentialScope": {"layer": "factory"}, "droppedParameters": []}` | 拒绝 | `malformed` | [S-49](contract.md#s-49-模型请求运行时写的五种记录不是消息)：「一项也没丢」只有缺席一种写法 |
| `{"kind": "model_call_interrupt_intent", "call": "mc_01", "initiator": "runtime_lost"}` | 拒绝 | `malformed` | 中断意图没有 `runtime_lost` |
| `{"kind": "model_call_ended", "call": "mc_02", "ending": "undispatched"}` | 拒绝 | `malformed` | [S-50](contract.md#s-50-调用终结的三支)：出门前那一支必带 `cause` |
| `{"kind": "model_call_ended", "call": "mc_02", "ending": "undispatched", "cause": "request_rejected"}` | 拒绝 | `malformed` | 出门前的成因只有四个 |
| `{"kind": "model_call_ended", "call": "mc_03", "ending": "released", "cause": "withdrawn"}` | 拒绝 | `malformed` | [S-50](contract.md#s-50-调用终结的三支)：放手那一支的 `cause` 只有 `credential_unavailable`——档案在打开调用时已绑定，续接不重核 |
| `{"kind": "model_call_ended", "call": "mc_04", "ending": "interrupted"}` | 拒绝 | `malformed` | 被中断那一支必带 `initiator` |
| `{"kind": "model_call_ended", "call": "mc_05", "ending": "complete"}` | 拒绝 | `malformed` | 经响应体进入终态的调用没有这条记录 |
| `{"kind": "model_selection_changed", "profile": {"origin": "official", "routeName": "vendor-a/chat-large"}, "at": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed` | 切到的是一个路由名，不是某一行的引用（成员名也不是 `profile`） |
| `{"kind": "model_call_retried", "call": "mc_01"}` | 拒绝 | `malformed` | 五种闭合 |
