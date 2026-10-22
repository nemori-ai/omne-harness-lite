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
- `records/<name>/<revision>/`：每条记录一组回放夹具，共 4 组。目录名用 `encodeURIComponent` 编码，例如 `anthropic%2Fclaude-opus-5.5/1`。`checkChatCompletionsFixtures` 以记录表为唯一清单核对它们。
- `cases/<用例>/<name>/<revision>/`：其余封存用例，每个用例一个根目录，只含一条记录的夹具。`fixtures.spec.ts` 用只含该记录的家族逐个核对。

每组夹具有三个文件，格式归 [pi-ai-transport SPEC“家族测试助手”](../../../pi-ai-transport/SPEC.md)：

- `request.json`：`{ "request": <FixedModelRequest 的纯 JSON>, "body": <期望请求体> }`。请求的 `declarations` 是记录官方声明展开后的值；
- `stream.sse`：原始 SSE 正文，以 `[DONE]` 结束；
- `facts.json`：期望的 `TransportFact` 序列，含最后的 `ended`。

### 来源与生成

用例表在 [`../support/legacy-cases.ts`](../support/legacy-cases.ts)。每个用例写明来源测试的文件、行号与测试名，期望请求体与期望事实都在表中手写。`pnpm run fixtures` 把表写成本目录的文件。`fixtures.spec.ts` 先核对文件与表逐字相等，再用真实绑定编码与解码。期望事实不由引擎生成。

来源是封存件 `packages.0.0.1.legacy/model/pi-ai-transport/tests/` 的内联 SSE 用例。封存件没有保存原始 SSE 字节，`tests/fixtures/anthropic` 也不含 SSE 帧。

### 对照表

下表的路径相对本目录。“差异”列引用下一节的编号。下表中 `CURRENT` 指 `anthropic-family-current.spec.ts`，`LATE` 指 `anthropic-stream-late-signature.spec.ts`。

| 用例 | 夹具 | 来源 | 差异 |
| --- | --- | --- | --- |
| 三轮第 1 轮，带工具：迟到签名的思考与工具调用 | `records/anthropic%2Fclaude-opus-5.5/1` | `CURRENT:468-503`，请求 `:106-150`，回复 `:171-233` | 1、2、3、4 |
| 三轮第 2 轮：第 1 轮的签名组带回，回复为加密推理 | `records/anthropic%2Fclaude-opus-5/1` | `CURRENT:468-503`，历史 `:253-306`，回放检查 `:416-430` | 1、2、3、4 |
| 观察到的无 id 文本片段与单独到达的签名，收场帧重复一次并带 usage | `records/anthropic%2Fclaude-sonnet-5/1` | `LATE:272-390` 的用例“the observed id-less text then signature-only fragments”（`:325-349`），第一轮请求 `:429-434` | 1、2、3、4、6 |
| 三轮第 3 轮，带工具：两轮的组都带回，回复为两个签名块 | `records/anthropic%2Fclaude-fable-5.1/1` | `CURRENT:468-503`，工具结果 `:308-332`，回放检查 `:416-430` | 1、2、3、4 |
| 带 id 的片段与迟到签名 | `cases/ls-same-id-late-signature` | `LATE:70-76` | 1、2、3 |
| 带 id 的片段重复同一签名 | `cases/ls-same-id-repeat-signature` | `LATE:78-84` | 1、2、3 |
| 两轮用例中带 id 的迟到签名组的第一轮 | `cases/ls-reconstructed-late-signed-group` | `LATE:272-390` 的用例“one reconstructed late-signed group”（`:292-323`） | 1、2、3 |
| 无 id 片段重复同一签名 | `cases/ls-idless-repeat-signature` | `LATE:99-106` | 1、2、3 |
| 无 id 片段先 `null` 签名后签名 | `cases/ls-idless-null-then-signed` | `LATE:195-202` | 1、2、3 |
| 观察到的三个片段 | `cases/ls-observed-three-fragments` | `LATE:133-150` | 1、2、3 |
| 签名之后的未签名片段 | `cases/ls-unsigned-after-signature` | `LATE:152-158` | 1、2、3、5 |
| 另一 index 上的签名 | `cases/ls-signature-other-index` | `LATE:160-163` | 1、2、3、5 |
| 第二个不同的签名 | `cases/ls-second-signature-distinct` | `LATE:172-178` | 1、2、3、5 |
| 两个不同的签名块 | `cases/ls-distinct-signed-details` | `LATE:272-390` 的用例“two truly distinct signed details”（`:351`） | 1、2、3 |
| 同 id 的两个加密项 | `cases/ls-encrypted-discrete` | `LATE:259-270` 的加密部分 | 1、2、3、7 |
| 未签名的组 | `cases/fc-unsigned-group` | `CURRENT:746-753` 的第一次回复 | 1、2、3、5 |
| 签名项与 `[REDACTED]` 加密项 | `cases/fc-redacted-encrypted` | `CURRENT:755-765` 的第一次回复 | 1、2、3、5 |
| 拒绝作为普通文本 | `cases/fc-refusal-as-text` | `CURRENT:804-818` 的第一次回复 | 1、3 |
| 缓存读写与输入余量 | `cases/usage-cache-read-and-write` | `usage-anthropic-public.spec.ts:28-139` 的第一次响应 | 1、3 |
| 余量为负的 usage | `cases/usage-negative-remainder` | `https.spec.ts:819-869`（`accounts.ts:17-36`） | 1、3 |

`LATE` 中下列用例不在本目录：不同 id、index、format、扩展成员、签名或类型的片段（`:86-97`），两个片段都没有 index（`:108-113`），没有文本也没有非空签名的片段（`:165-170`），相邻的无 id 未签名片段（`:180-193`），无 id 片段的签名无效（`:204-213`），同 id 的签名在 `null` 与缺失之间延续（`:215-229`），同 id 的签名项之后的未签名项（`:231-235`），签名为数、空串或对象（`:237-247`），以及 id 或 text 的类型无效（`:249-257`）。这些用例检查片段拼接的规则。拼接归引擎，pi-ai-transport 的解码测试（`chat-completions-decode.spec.ts` 的“reasoning detail identity”）逐条覆盖它们。非字符串的 `id` 是一个例外：引擎以 `reasoning-detail-shape` 拒绝该帧，封存件把这样的片段保留为不同的项。

`CURRENT` 中下列用例也不在本目录：经 Cordis 租约的三轮（`:505-579`）检查服务登记与撤除；配置的缓存 TTL（`:634-675`）检查旧档案配置；图片补丁估算（`:718-744`）迁入 `meter.spec.ts`；语音与视频输入（`:820-871`）由投影在发送前拒绝。

### 有意不同

1. **服务方成员。** 引擎要求第一帧有 `model` 与 `provider`（D4）。封存件的推理帧与内容帧没有这两个成员，夹具在第一帧加上 `model`（记录的路由名）与 `provider: "Anthropic"`。封存件的 usage 帧已有这两个成员，夹具保留它们。
2. **推理状态的形状。** 封存件把推理项放在思考块的 `opaque` 中，并带路由名。现行形状是推理续接状态部件：一次响应的整组推理是一个部件，载荷是各项排序键 JSON 组成的数组，部件与思考块配对。组中有任何一项不能回放时，不产生部件（规则 `anthropic-signed-group/1`）。没有可见推理时不开思考块。
3. **账目。** 已收场的响应在 `ended` 之前有一个 `account` 事实，值是账目报告，格式归 [pi-ai-transport SPEC“账目”](../../../pi-ai-transport/SPEC.md#账目)。与封存件的不同如下：
   - `input` 是 prompt 减去缓存读与缓存写。余量为负时 `input` 为未知，并在 `account` 之后给出一个 `usage-inconsistent` 诊断事实。封存件把它记为 `model_transport.usage_inconsistent` 诊断事件。
   - 账目带 `reasoning` 项。没有 `reasoning_tokens` 时它为未知。
   - 已收场但没有 usage 的响应也有账目，各项为未知。
   - 费用的单位是 `openrouter-credit`，词法照原样。
4. **请求体的写法。** 现行记录用 `parts`：系统指令、提醒、user、assistant 与工具结果的内容都写成部件数组。提醒的角色是 `user`。图片写记录的 `detail: "auto"`，封存件只写 `url`。缓存标记 `{ "type": "ephemeral", "ttl": "1h" }` 在最后一条消息的最后一个非空文本部件上。封存测试只断言了请求体的部分成员，本目录的期望请求体按现行规格写出。
5. **拒绝的时机与位置。** 封存件在下一次请求的计划阶段拒绝未签名的组、`[REDACTED]` 加密项与别的路由的组，不发出请求。现行解码器对这样的组不产生部件。下一次请求中，本家族消息的思考没有部件可带时，编解码器不写出这个思考，请求照常发出，见 [pi-ai-anthropic SPEC“规则”](../../SPEC.md#规则)。别的路由的组按回放声明略去，并给出 `replay-omitted` 诊断。这两种请求见 [cross-family-replay.spec.ts](../cross-family-replay.spec.ts)。
6. **重复的收场帧。** 封存件的流只有一个收场帧，usage 在它之前的一帧。`records/anthropic%2Fclaude-sonnet-5/1` 按经代理观察到的网关形状写出流：收场帧先到一次，再带 usage 重复一次。值是合成值，观察样本不进仓库。
7. **没有内容的收场。** 封存件把只有加密推理的 `stop` 当作完成，并封存推理组。推理续接状态部件不是内容，契约只在至少一个有效块合法封口后映射 finish，见 [pi-ai-transport SPEC“映射”](../../../pi-ai-transport/SPEC.md#映射)。所以 `cases/ls-encrypted-discrete` 以 `upstream-protocol`（`finish-without-content`）失败，不封推理组，在 `ended` 之前给出账目。同 id 的加密项保持分开，这一点由 pi-ai-transport 的解码测试（“reasoning detail identity”）核对。
