# 测到过的坑

每条都是经 OpenRouter 的真实请求量到的。测量日期写在条目里；上游会变，用之前按 [facts.md](facts.md) 重测。

## 推理块

- **较新的 Claude 型号把推理块绑在前缀上（2026-11-18）。** Fable 5.1、Fable 5.2、Opus 5.5、Sonnet 5.5、Haiku 5.5：前面的任何内容变了（删一条提醒、改一条消息、改系统提示词、工具表多一个工具），带回的推理块被丢掉，Messages 接口在 `input_transformations` 里报告 `thinking_dropped`、原因 `prefix_binding_mismatch`。Opus 5 与 Sonnet 5 没有报告。所以请求要只追加。
- **文档说会答 400，实测是悄悄丢掉（2026-11-18）。** 前缀对不上时四家上游都答 200 并报告丢弃，没有一次 400。
- **经 chat-completions 看不见丢弃（2026-11-18）。** 同样的改动经 chat-completions 发，响应里没有任何地方说推理块被丢了；签名改坏的推理块也答 200，输入 token 不变。要知道推理状态的去留，走 Messages。
- **OpenAI 的密文改坏是悄悄丢掉（2026-11-18）。** Responses 上 `encrypted_content` 被改坏答 200，输入 token 等于不带推理项时。
- **上游不同，格式名不同（2026-11-18）。** GPT-6.2 经 chat-completions 时多数请求没有 `reasoning_details`，有的一次格式名是 `azure-openai-responses-v1`。固定上游。

## 缓存

- **每轮挪动的显式断点从不命中（2026-11-18）。** Responses 上把 `prompt_cache_breakpoint` 打在最新一条消息、每轮挪位置，等于每轮改了前面的内容：三轮会话每次都全部写入、读到 0。改成自动缓存加会话级的 `prompt_cache_key`，第二轮起读到 99.6%。「同一个请求发两次，第二次命中」只说明缓存能用，不说明一个会话里能命中；要按会话那样只追加着测。
- **GPT-6.2 的系统提示词放哪决定命中率（2026-11-18）。** 放在 `instructions` 字段命中两成多；作为 `input` 里第一条 `developer` 消息命中九成五。

## 用量

- **Responses 的 `input_tokens` 含缓存读与写（2026-11-18）。** 例：`input_tokens` 3663、`cached_tokens` 3465、`cache_write_tokens` 195。账目里的输入是没经过缓存的那部分，要扣掉两项；Messages 的 `input_tokens` 原本就不含。只看字段名会算两遍。
- **有的记录有意把输入记成未知。** 用 `unknown-scope/1` 用量规则的记录，上游照常报告缓存读与写，但账目的输入是未知，真实模型矩阵量不到它的命中率。这是记录的选择，不是上游没报。

## 消息形状

- **新的 Claude 型号不接受预填（2026-11-18）。** Haiku 5.5 对末条是助手消息的请求答 400：`This model does not support assistant message prefill.`
- **Messages 上的推理档位只接受 `low` 到 `max`（2026-11-18）。** Haiku 5.5 对 `none` 与 `minimal` 答 400。

## 做法上的坑

- **缺省关着的型号在会话里选不了。** 一个型号不在发行缺省开着的集合里，新租户的列表里它带 `enabled: false`、不可选，会话选它答 `excluded`。发行树上的用例要用它，先替租户打开（`tests/support/model-switches.ts` 的 `setModelSwitches`）；真实模型矩阵开跑前已替它的租户打开全部要量的型号。
- **记录的依据文字也进指纹。** 只改了一句依据，修订号也要升，录制件与采用指纹跟着换。
