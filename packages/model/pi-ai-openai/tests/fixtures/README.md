# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试数据文件与说明。

## 边界

固定输入不能代替规格；数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

本目录有三类固定输入：

- `adoptions.json`：每条记录一行 `{name, revision, digest}`。`pnpm run fingerprints` 只追加新记录的行；已有行的摘要会变时，脚本拒绝写入。`adoptions.spec.ts` 双向核对。
- `records/<name>/<revision>/`：每条记录一组回放夹具，共 12 组。目录名用 `encodeURIComponent` 编码，例如 `openai%2Fgpt-6-astra/1`。`checkChatCompletionsFixtures` 以记录表为唯一清单核对它们。
- `cases/<用例>/<name>/<revision>/`：其余封存用例，每个用例一个根目录，只含一条记录的夹具。`fixtures.spec.ts` 用只含该记录的家族逐个核对。

每组夹具有三个文件，格式归 [pi-ai-transport SPEC“家族测试助手”](../../../pi-ai-transport/SPEC.md)：

- `request.json`：`{ "request": <FixedModelRequest 的纯 JSON>, "body": <期望请求体> }`。请求的 `declarations` 是记录官方声明展开后的值；
- `stream.sse`：原始 SSE 正文，以 `[DONE]` 结束（断流用例除外）；
- `facts.json`：期望的 `TransportFact` 序列，含最后的 `ended`。

### 来源与生成

用例表在 [`../support/legacy-cases.ts`](../support/legacy-cases.ts)。每个用例写明来源测试的文件、行号与测试名，期望请求体与期望事实都在表中手写。`pnpm run fixtures` 把表写成本目录的文件。`fixtures.spec.ts` 先核对文件与表逐字相等，再用真实绑定编码与解码。期望事实不由引擎生成。

来源是封存件 `packages.0.0.1.legacy/model/pi-ai-transport/tests/` 的内联 SSE 用例。封存的 `tests/fixtures/openai` 不含 SSE 帧。

### 对照表

下表的路径相对本目录。“差异”列引用下一节的编号。

| 用例 | 夹具 | 来源 | 差异 |
| --- | --- | --- | --- |
| 加密推理回放，三个型号 | `records/openai%2Fgpt-5.6-{sol,terra,luna}/1` | `openai-encrypted-replay.spec.ts:49-171`，流 `:55-72`，第二轮请求 `:88-104`、`:145-158` | 1、4、7、8 |
| 同帧顺序与 Unicode | `records/openai%2Fgpt-6-astra/1` | `refusal-stream.spec.ts:161-193` RF-V1/V2 | 1、4、8 |
| 思考、拒绝与工具的开块顺序 | `records/openai%2Fgpt-6-astra-pro/1` | `refusal-stream.spec.ts:194-231` RF-V2 | 1、2、4、8 |
| 同上，封存输入不带调用 id | `cases/rf-v2-tool-without-id` | `refusal-stream.spec.ts:194-231` RF-V2 | 1、2 |
| 尾帧用量，`stop` | `records/openai%2Fgpt-6-sol/1` | `refusal-stream.spec.ts:232-252` RF-V4 | 1、4、8 |
| 尾帧用量，`tool_calls` | `records/openai%2Fgpt-6-sol-pro/1` | 同上 | 1、4、8 |
| 尾帧用量，`length` | `records/openai%2Fgpt-6-luna/1` | 同上 | 1、3、4、8 |
| `content_filter` | `records/openai%2Fgpt-6-luna-pro/1` | `refusal-stream.spec.ts:253-286` RF-V5 | 1、4、5、8 |
| 纯空白拒绝 | `records/openai%2Fgpt-5.6-sol-pro/1` | `refusal-stream.spec.ts:62-67` RF-V1 | 1、4、8 |
| 拒绝之后的带内错误 | `records/openai%2Fgpt-5.6-terra-pro/1` | `refusal-stream.spec.ts:68-84` RF-V5 | 1、4、5、8 |
| 拒绝前后的用量帧 | `records/openai%2Fgpt-5.6-luna-pro/1` | `refusal-stream.spec.ts:303-320` RF-V6 | 1、4、8 |
| 拒绝缺失、`null`、空串 | `cases/rf-v1-{missing,null,empty}-refusal` | `refusal-stream.spec.ts:124-135` RF-V1 | 1、4 |
| 七种非法拒绝值 | `cases/rf-v1-invalid-refusal-*` | `refusal-stream.spec.ts:136-160` RF-V1 | 1、4、5 |
| `error` 收场 | `cases/rf-v5-error-finish` | `refusal-stream.spec.ts:253-286` RF-V5 | 1、4、5 |
| 断流（EOF） | `cases/rf-v5-eof` | 同上 | 1、5 |
| 坏 JSON | `cases/rf-v5-bad-json` | 同上 | 1、5 |
| 重复键 | `cases/rf-v5-duplicate-key` | 同上 | 1、5 |
| `finish_reason` 改变 | `cases/rf-v5-changed-finish` | 同上 | 1、5、6 |
| 收场后的拒绝 | `cases/rf-v5-late-refusal` | 同上 | 1、5、6 |
| 没有收场的结束标记 | `cases/rf-v5-done-without-finish` | 同上 | 1、5 |
| 同帧错误优先 | `cases/rf-v5-v8-same-frame-error` | `refusal-stream.spec.ts:287-302` RF-V5/V8 | 4、5 |
| 回复文本 `503` | `cases/rf-v8-reply-text-503` | `refusal-stream.spec.ts:321-325` RF-V8 | 1、4 |

`refusal-stream.spec.ts` 中下列用例不在本目录：RF-V7 取消与空闲超时（`:85-123`）、RF-V9 导出的读流入口（`:326-358`）、RF-V7 直接读流的取消（`:359-393`）与超大事件（`:394-400`）。它们检查连接、取消、计时与 SSE 事件上限，这些归共享传输，不属于家族的解码。

### 有意不同

1. **服务方成员。** 引擎要求第一帧有 `model` 与 `provider`（D4）。封存帧没有这两个成员，夹具在第一帧加上 `model`（记录的路由名）与 `provider: "OpenAI"`。
2. **调用 id。** 契约的调用部件需要 `callId`。封存 RF-V2 的工具帧没有 `id`，封存件仍然完成。记录夹具给该调用加 `id: "call_lookup"`，结果与封存件相同；`cases/rf-v2-tool-without-id` 保留封存输入，结果是 `upstream-protocol`（`tool-call-without-id`）。
3. **`length` 封块。** 封存件在 `length` 收场时不关闭任何块。引擎封文本、思考与推理，只让工具参数块保持开着（D4“修正”）。
4. **账目。** 已收场的响应在 `ended` 之前有一个 `account` 事实，值是账目报告，格式归 [pi-ai-transport SPEC“账目”](../../../pi-ai-transport/SPEC.md#账目)。与封存件的不同如下：
   - 解码器在结束之前失败时（带内错误、协议错误）没有账目。失败的结果不带事实。封存件在这些用例中仍给出一个 account 事件。
   - Pro 型号的 `input` 为未知（规则 `unknown-scope/1`）。封存件给出 100。
   - 多帧带 usage 时，账目取最后一份。封存件把不一致的 usage 记为校准不可用。
   - 已收场但没有 usage 的响应也有账目，各项为未知。
   - 费用的单位是 `openrouter-credit`，词法照原样。
5. **失败的形状。** 封存件的失败是 `interrupted_mid_reply` 加本地错误文字。契约事实是带 `cause` 与诊断的 `ended`：带内错误按状态码映射（503 为 `upstream-unavailable`）；`content_filter` 与 `error` 收场为 `input-rejected`，诊断为 `finish-reason-<值>`；断流与没有收场的结束标记为 `stream-lost`；坏帧、重复键、非法拒绝值、改变的收场与收场后的内容为 `upstream-protocol`。
6. **收场时封块。** 封存件只在流结束时关闭块，所以在收场后才出错的流里没有关闭事件。引擎在收场帧封块，之后的协议错误不撤回已封的块。
7. **加密推理的形状。** 封存件把推理项放在一个空文本的思考块的 `opaque` 中，并带路由名。现行形状是推理续接状态部件：每个 `openai-responses-v1` 格式的加密项一个部件，载荷是该项的排序键 JSON；没有可见推理时不开思考块。
8. **请求体的写法。** 封存件把 system 与 developer 内容写成文本部件数组，图片不写 `detail`。现行记录用 `compact`：只有一个文本部件时写字符串；系统指令与提醒的角色都是 `developer`；图片写记录的 `detail: "auto"`。封存测试只断言了请求体中带有密文（第二轮），本目录的期望请求体按现行规格写出。
