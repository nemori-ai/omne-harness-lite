# batch8 六叶三轮：QC-V0 独立复算（2026-09-30）

- 对象：batch8（运行提交 `f8e55130`）经 OpenRouter `alibaba` 固定路由的六个 Qwen 商业叶 `qwen3.7-flash`、`qwen3.7-max`、`qwen3.7-plus`、`qwen3.8-flash`、`qwen3.8-max-0902`、`qwen3.8-max-prime`，各一组带一个工具的三轮请求，共 18 个。
- 问题：[研究页](../2026-09-30-community-harness-commercial-reasoning.md#本仓库-batch8-的离线复算推断级)写的离线复算，换一个执行者、按页面方法独立重写后，数字能否复现；顺带做[候选页](../../../../../design/realization/packages/model/pi-ai-transport/qwen-commercial-visible-reasoning-estimate-design.md#实施与验收义务) QC-V0 列出的只读核对。
- 执行者与独立性：第二执行者。没有读研究者的计算脚本（仓库里没有），也没有调用包内 `renderQwenPrompt`；模板由 Jinja2 引擎直接渲染固定的 `chat_template.jinja`，计数用 HuggingFace `tokenizers`（Rust），与包内手写渲染器和 `@huggingface/tokenizers`（JS）是两套实现。
- 零付费、零网络、未读任何密钥。原件在 HUB 私有目录，只读；本目录只入汇总副本、脚本与复算产物。

## 输入

| 输入 | 位置（HUB 工作树 `tmp/model-request-runtime/` 下，Git 忽略） | 校验 |
| --- | --- | --- |
| 六叶三轮汇总 `summary.json` | `private/paid-out/batch8-f8e55130/qwenc-<叶>/` | 与研究页所记六个 SHA-256 前后缀一致；本目录 `summaries/` 为逐字节副本，见 [SHA256SUMS](SHA256SUMS) |
| `manifest.json`、18 份原始 SSE | 同上 | 脚本逐份核对 SSE 的 SHA-256 等于汇总里的 `rawResponse.sha256` |
| 已批准场景 `<叶>-three-turn.b8.approved.json` | `current-certification/scenarios/r6-families/qwen/` | 脚本按 `manifest.scenarioSha256` 选中唯一文件 |
| 固定模板与 tokenizer | 执行仓库 `packages/model/pi-ai-transport/resources/tokenizers/qwen-38-24t/` | `chat_template.jinja` `40ce34a5…5e4e`、`tokenizer.json` `0997f410…b9f3`，脚本不符即停 |

派发说明写的「每轮真实 wire 请求体从 `family-observed-*.json` 取」与原件不符：这些文件只有 `plannedWireSha256`，没有请求体，`liveWireSha256` 记为 `unavailable`。所以请求体由场景加前几轮 SSE 重建，再用 run 记下的三种哈希验证重建结果（见下文「wire 重建」）。

## 方法

1. **SSE**：去掉 HTTP chunked 分帧，逐帧取 `delta.reasoning`、`delta.reasoning_details`、`delta.content`、`tool_calls` 与末帧 `usage`。上游数取 `usage.prompt_tokens`，并核对它等于汇总里 `input_tokens + cache_read_tokens + cache_write_tokens`。
2. **wire 重建**：按执行仓库 `src/plan.ts`／`src/assistant-projection.ts`／`src/stream.ts` 的序列化规则，从场景与上一轮输出拼出每轮请求体（紧凑 JSON、插入序；显式缓存叶的 system 末段带 `cache_control`；只有 0902 带 `reasoning.effort`；回放的 assistant 行带合并后的一条 `reasoning_details`；工具调用 id 用运行时派生值而非上游 id），算 SHA-256 与 run 的记录比对。
3. **渲染**：Jinja2 3.1.6 的 `ImmutableSandboxedEnvironment(trim_blocks, lstrip_blocks)` 直接渲染固定模板，`add_generation_prompt=True`。逐叶开关取候选页[逐叶设定](../../../../../design/realization/packages/model/pi-ai-transport/qwen-commercial-visible-reasoning-estimate-design.md#逐叶设定)：3.8 三叶 `preserve_thinking`、`reasoning_effort` 都不定义（模板缺省：全部历史推理进 `<think>`，system 前加 xhigh 说明）；3.7 三叶 `preserve_thinking=false`、`reasoning_effort='medium'`（模板里唯一不出说明句的档，只是渲染等价，不主张 3.7 以 medium 运行）。
4. **计数**：`tokenizers` 0.23.2 读固定 `tokenizer.json`，`encode(prompt, add_special_tokens=False)` 的长度即预测值。
5. **`tojson` 两种语义都算**：模板用 `tool | tojson` 渲染工具定义。Jinja2 内置过滤器按键排序（`sort_keys=True`），包内渲染器模拟的就是这一种；HF transformers 的 chat-template 环境（vLLM 同）覆盖为插入序、`ensure_ascii=False`。阿里用哪种不知道，两列并报，记为 `jinja` 与 `hf`。
6. **负控**：每叶再用另一族的开关渲染一次（3.7 走缺省分支、3.8 走 false 分支），这个组合必须对不上；另核两种 `tojson` 的渲染只差工具那一行。

## 运行

```sh
uv run --offline --no-project --with jinja2==3.1.6 --with tokenizers==0.23.2 \
  python recompute.py \
  --private-dir <HUB>/tmp/model-request-runtime/private/paid-out/batch8-f8e55130 \
  --scenario-dir <HUB>/tmp/model-request-runtime/current-certification/scenarios/r6-families/qwen \
  --tokenizer-dir <执行仓库>/packages/model/pi-ai-transport/resources/tokenizers/qwen-38-24t \
  --out recompute-output.json
```

`--offline` 只用本机 uv 缓存里的包，不改仓库锁文件；可选 `--dump-prompts <目录>` 把 36 份渲染结果写到仓库外。实际执行环境：Python 3.12.13、jinja2 3.1.6、tokenizers 0.23.2，执行仓库检出 `f93d8e4c`；同一命令连跑两次，输出逐字节相同（SHA-256 相等）。

## 结果

完整数据见 [recompute-output.json](recompute-output.json)。残差 = 预测 − 上游；增量残差 = 本轮与上轮预测之差 − 上游之差。

| 叶 | 轮 | 上游 `prompt_tokens` | 预测 `jinja` | 残差 | 增量残差 | 预测 `hf` | 残差 | 增量残差 | 本轮 reasoning tokens | 现行 JSON 替身 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| qwen3.7-flash | 1 | 1147 | 1148 | +1 | — | 1147 | 0 | — | 381 | 999 |
| qwen3.7-flash | 2 | 1218 | 1219 | +1 | 0 | 1218 | 0 | 0 | 180 | 1559 |
| qwen3.7-flash | 3 | 1283 | 1284 | +1 | 0 | 1283 | 0 | 0 | 280 | 1892 |
| qwen3.7-max | 1 | 1147 | 1148 | +1 | — | 1147 | 0 | — | 27 | 1013 |
| qwen3.7-max | 2 | 1218 | 1219 | +1 | 0 | 1218 | 0 | 0 | 42 | 1193 |
| qwen3.7-max | 3 | 1283 | 1284 | +1 | 0 | 1283 | 0 | 0 | 59 | 1382 |
| qwen3.7-plus | 1 | 1144 | 1145 | +1 | — | 1144 | 0 | — | 27 | 1010 |
| qwen3.7-plus | 2 | 1215 | 1216 | +1 | 0 | 1215 | 0 | 0 | 288 | 1190 |
| qwen3.7-plus | 3 | 1280 | 1281 | +1 | 0 | 1280 | 0 | 0 | 189 | 1634 |
| qwen3.8-flash | 1 | 1185 | 1186 | +1 | — | 1185 | 0 | — | 22 | 999 |
| qwen3.8-flash | 2 | 1283 | 1284 | +1 | 0 | 1283 | 0 | 0 | 14 | 1172 |
| qwen3.8-flash | 3 | 1367 | 1368 | +1 | 0 | 1367 | 0 | 0 | 50 | 1331 |
| qwen3.8-max-0902 | 1 | 1188 | 1189 | +1 | — | 1188 | 0 | — | 102 | 1029 |
| qwen3.8-max-0902 | 2 | 1366 | 1367 | +1 | 0 | 1366 | 0 | 0 | 92 | 1289 |
| qwen3.8-max-0902 | 3 | 1528 | 1529 | +1 | 0 | 1528 | 0 | 0 | 113 | 1528 |
| qwen3.8-max-prime | 1 | 1186 | 1187 | +1 | — | 1186 | 0 | — | 22 | 1016 |
| qwen3.8-max-prime | 2 | 1284 | 1285 | +1 | 0 | 1284 | 0 | 0 | 29 | 1192 |
| qwen3.8-max-prime | 3 | 1383 | 1384 | +1 | 0 | 1383 | 0 | 0 | 17 | 1366 |

「现行 JSON 替身」列取自汇总的 `plannedMeasurement.predictedInput`，不是本脚本算的。

**3.8 轮间增量恒等式**（上游数）：3.7 三叶的轮间增量逐叶相同（第 2 轮 71、第 3 轮 65），3.8 三叶六个增量减去它、再减上一轮 `usage.completion_tokens_details.reasoning_tokens`，余数全为 5：

| 叶 | 轮 | 3.8 增量 | 3.7 增量 | 上一轮 reasoning | 余数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| qwen3.8-flash | 2 | 98 | 71 | 22 | 5 |
| qwen3.8-flash | 3 | 84 | 65 | 14 | 5 |
| qwen3.8-max-0902 | 2 | 178 | 71 | 102 | 5 |
| qwen3.8-max-0902 | 3 | 162 | 65 | 92 | 5 |
| qwen3.8-max-prime | 2 | 98 | 71 | 22 | 5 |
| qwen3.8-max-prime | 3 | 99 | 65 | 29 | 5 |

18 轮里，上游 `reasoning_tokens` 都等于固定 tokenizer 对 trim 后推理文字的计数，所以把「上一轮 reasoning」换成 tokenizer 计数，余数仍全为 5。

**负控**：换用另一族开关后残差为 `hf` −242～+609、`jinja` −241～+610（第 1 轮即差 ±38，正是 xhigh 说明句的量级），可见这套渲染能把两族分开，拟合不是任意开关都能得到的。两种 `tojson` 的 36 份渲染在全部 18 轮里只差工具定义那一行。

**wire 重建**：18 轮重建体的 SHA-256 全部等于 run 记录的 `plannedWireSha256`，第 1 轮还等于 manifest 的 `firstWireSha256`，第 2、3 轮 assistant 行也等于 `assistantReplaySha256`。所以渲染的输入与规划器序列化出的请求体逐字节相同。实际发出字节的哈希（`liveWireSha256`）在该次 run 里本来就不可得。

## 与研究页逐项对照

| 研究页的数字或说法 | 本次复算 | 结论 |
| --- | --- | --- |
| 18 个上游 `prompt_tokens`（表中「上游」列） | 18 个全同 | 一致 |
| 现行可见 JSON 替身预测 18 个，残差 −186～+609 | 18 个全同，范围全同 | 一致 |
| 模板规则预测 18 个、残差全为 +1 | `jinja` 列 18 个逐值相同、全为 +1；`hf` 列全为 0 | 在 Jinja2 内置 `tojson`（键排序）下一致；换成插入序则残差全为 0，见下 |
| 12 个轮间增量残差全为 0 | 两种 `tojson` 下都是 12 个 0 | 一致 |
| 3.7 各叶轮间增量 71、65，与推理长度（27 到 381）无关 | 三叶逐叶都是 71、65；reasoning tokens 27～381 | 一致 |
| 3.8 各叶增量 =「3.7 增量＋上一轮 reasoning＋5」 | 六个增量余数全为 5 | 一致 |
| 3.7-flash 第 3 轮替身 +609（+47%），含两轮共 561 个 reasoning token（381＋180） | 609／1283 = 47.5%；381＋180 = 561 | 一致 |
| 18 轮 `delta.reasoning` 拼接串与 `reasoning_details` 的 text 逐字相同 | 相同，且逐帧相同 | 一致 |
| 六份汇总的 SHA-256（前后缀） | 全部一致 | 一致 |
| 输入是「英文 ASCII 内容」 | 场景文字与 3.7 的渲染结果都是 ASCII；0902 第 2、3 轮回放的历史推理里有 `—`、`→` 两个非 ASCII 字符 | 基本一致；3.8 回放推理不全是 ASCII |

**唯一的数字差异及原因**：研究页的 +1 在本次复算里定位到了工具定义那一行的键序。按 Jinja2 内置 `tojson` 渲染（键按字母排序，包内渲染器也这么做），那一行比插入序多 1 个 token，18 个预测于是恰好都比上游多 1；按 HF transformers／vLLM 的 `tojson`（保持 wire 上 `type, function{name, description, parameters{type, properties, required, additionalProperties}}` 的顺序）渲染，18 个残差都是 0。研究页把 +1 记为「来源未知」，在 batch8 这一个形状里它可以完全由这一个渲染选择解释。这不说明阿里的私有渲染用的是插入序：零残差与插入序相容，但也可能有别的解释，本批数据分不开。单 user 形状的 −9／0 不含工具，与这一行无关，本次没有复算。

## 候选页 QC-V0 的其他核对项

- details 逐帧形状：18 轮所有 `reasoning_details` 帧恰为四键，顺序为 `type, text, format, index`，`type` 为 `reasoning.text`，`format` 为 `unknown`，`index` 为 0；没有 `id`，没有签名，也没有显式 `signature: null`；同帧并行的 `reasoning` 与 details 文字逐帧相同。
- 第 2、3 轮的规划体只带 details：重建体与 `plannedWireSha256` 逐字节相同，回放的 assistant 行只有 `reasoning_details`，没有 `reasoning` 或 `reasoning_content` 串。实际发出字节与规划体是否相同，只能由这次 run 的传输实现推断，没有 `liveWireSha256` 可以对照。
- 上游接受：18 轮 HTTP 200、`outcome: complete`，`servingProvider` 都是 Alibaba。

## 渲染时做的假设

1. `reasoning_details` 的 text 拼接后进入模板的 `reasoning_content` 槽位。OpenRouter 实际怎样转换没有文档（候选页 QG1）；3.8 的增量恒等式与此相容。
2. JSON 字符串形式的工具参数在渲染前解析成映射（vLLM 的做法；模板对 `arguments|items` 迭代，字符串无法渲染）。
3. `tojson` 的两种语义见上；两列都报，没有选定其一。
4. 3.7 的「无说明」用 `reasoning_effort='medium'` 渲染；3.8 两个变量都不定义。
5. 走 HF 的沙箱环境与 `trim_blocks`、`lstrip_blocks`；模板里的 `cache_control` 不参与渲染，只取文本段。
6. 本批覆盖的模板分支：带工具的 system 块、system 正文追加、`last_query_index` 倒序扫描（没有被 `<tool_response>` 包裹的 user）、空 content 加工具调用、单个工具结果成组、`preserve_thinking=false` 时末个 query 之前的 assistant 不渲 think 块、生成提示。

## 已知、推断、未知

**已知（本次观察）**：上表 18 行与两个 `tojson` 变体的数字；wire 重建三种哈希全部对上；details 形状；两种 `tojson` 只差工具那一行、差 1 个 token；reasoning tokens 与固定 tokenizer 计数逐轮相等。

**推断**：研究页的常数 +1 在本形状下来自工具 JSON 的键序选择；按插入序渲染时，六叶 18 个请求的上游计数与「公开模板＋固定 tokenizer＋逐叶两个开关」逐值相同。

**未知**：阿里私有渲染的键序与 `tojson` 语义；OpenRouter 对 details 的转换与 `preserve_thinking` 转发；实际发出字节。

## 未覆盖

- 只有一个场景：一个工具、每轮新 user、effort 场景值 `high`（只有 0902 实际发出）。回合内工具循环、连续多个工具结果、非空 content 加工具调用、被包裹的 user、非 ASCII 用户文字与工具参数、图片、其他 effort 档都没有样本。
- 没有复算研究页的单 user 形状（−9／0），没有与包内 `renderQwenPrompt` 逐字节比对渲染结果（只比了计数：`jinja` 列与研究页用包内渲染器得到的 18 个数逐值相同）。
- 重跑需要 HUB 私有目录与场景文件；它们在 Git 忽略目录里，本目录只存汇总副本与哈希。

## 汇总副本

`summaries/<叶>.summary.json` 是私有目录 `qwenc-<叶>/summary.json` 的逐字节副本。入库前逐键扫描过：没有凭据、密钥、cookie、授权头或令牌字段（以 `tokens` 结尾的只有用量计数；`budget.authorization` 是预算授权文件的本地路径、字节数与哈希，不是凭据），因此**没有删去任何字段**，副本与原件哈希相同。原始 SSE 带有上游响应头（含 Cloudflare 会话 cookie），不入库。
