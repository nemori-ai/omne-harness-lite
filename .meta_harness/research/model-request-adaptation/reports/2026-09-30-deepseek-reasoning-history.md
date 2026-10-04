# DeepSeek／DeepInfra 推理历史与旧执行范围复核：2026-09-30

本轮只重读已有原件与固定源码；没有新模型请求或费用。调查对象是 OpenRouter 固定 `deepinfra/fp8` 路由的 `deepseek/deepseek-v4-pro-0813` 和 `deepseek/deepseek-v4.1-flash`。下列运行原件在 HUB 忽略目录 `tmp/model-request-runtime/`，哈希识别本次读取的字节；该目录不是入库归档。旧执行源码及定义修订与 2026-09-30 当前绑定不同，因此只证明各自实际执行过的范围。

## 真实回包中的可见推理与回放字段

2026-09-28 的六次真实 public 请求总结果为 `deepseek-current-77d00f32-94d0-4d91-9041-2d516e6cb2ad/result.json`，SHA256 `d905f8a54295e3cc2d71f79535869e3b15de5b49e3f9973f334f1a90f45f5580`，记录源码 `d77f9677c9339c6b2d97665cd92707b95840b4a4`，`pass=true`。首轮响应原件分别为 `deepseek-v4-pro-0813-1-outcome.json`，SHA256 `cba85c2ea1b1d1c144e56bad1d95716bd337fe40220e937fa70c824656a79b55`，及 `deepseek-v4.1-flash-1-outcome.json`，SHA256 `e52ec3e1f897fc094f3c3b12d216f19f6528e0f63e57818502993094c97fc231`。两者均有 thinking block、工具调用块及以下同形结构；`opaque.reasoning_details[0].text` 与同一 block 的可见 `text` 逐字相等：

| 模型 | `thinking.text` 与 `reasoning_details[0].text` | `reasoning_details[0]` 的其余字段 | 当轮上游用量 | 当轮旧绑定 |
| --- | --- | --- | --- | --- |
| Pro | `I need to look up the code for record "ORCHID".` | `type="reasoning.text"`, `format="unknown"`, `index=0` | input 7723、output 62、reasoning 13 | `pi-ai:deepseek/mp4-1`、definition 2 |
| Flash | `We need answer only returned code. Need call lookup_code with name` | 同上 | input 7738、output 59、reasoning 17 | `pi-ai:deepseek/mp4-2`、definition 1 |

续轮真实上游用量可从同组 `result.json` 复核：Pro 第 2／3 轮各有 `cache_read_tokens=7680`；Flash 第 2 轮为 7680，第 3 轮为 7808。这里的 `reasoning.text` 是可见文字；`format="unknown"` 是原样字符串，**不**证明所有未知格式或任意 opaque 数据都可解释为文字。`reasoning.encrypted` 等非文字形态不受这两份样本支持。历史请求成功不证明目前计量实现可以接受同一历史：当前 `assistant-projection.ts` 原样回放 details，而 `input-meters/deepseek-boundary.ts` 的 full supplemental 与 marginal boundary 都在出现 `reasoning_details` 时返回不可用；这个判断是对 2026-09-30 工作树源码的静态读数，并非在当前绑定重发该历史的结果。

## 既有来源各自覆盖的形态

- [DeepSeek 原生 Thinking Mode 指南](https://api-docs.deepseek.com/guides/thinking_mode/) 的本地 2026-09-27 原文 SHA256 `53e52ffa8ae08bfe5af3fb1e1c250e24dd062c160a1b60deb75654f6d38da9be`，位置为 HUB `tmp/model-request-runtime/facts-native-other-2026-09-27/sources/deepseek-thinking.txt`。其 OpenAI 格式使用 `reasoning_content`；带 `tools` 时声明前轮该字段应回传并拼入上下文，无 `tools` 时声明即使回传也被忽略。它没有给出 OpenRouter 的 `reasoning_details` 到原生字段的等值保证。
- 已固定的 [DeepSeek Flash encoder 说明](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/dba1be0a40aa45a94ad051997016db3960a90277/encoding/README.md) 本地原文 SHA256 `a2f0fc3baea318c9cfbceca68cbfe50d37cf7da6605ace887f33148bcff7e3ae`，位于 HUB `tmp/model-request-runtime/meter-research-archive-20260928/open/deepseek-ai--DeepSeek-V4.1-Flash/encoding/README.md`。其参考编码输入有文字 `reasoning_content`，没有说明 OpenRouter 的结构化 details 或 DeepInfra 私有投影。
- pi `0.86.1` 固定源码 `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`，[本 topic 的源码快照](../evidence/2026-09-29-openai-closeout/sources/pi/packages/ai/src/api/openai-completions.ts) SHA256 `b06508ab22b6595d85d636db0737ac7c48adbf9d8d5ff61ba2bac94c9599ac51`：接受 `reasoning.text` 的字符串文字，合并流式 fragments 并保存详情供回放；此路径没有为 DeepInfra 计数的等值证明。
- `omne-next` 固定检出 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5` 的 `omne_openrouter/chat_models.py` SHA256 `95a087dd2ec8b8d1f81933e35992281a394783502cb7abb3182642c8112ef19c`：流式处理读取可见 `detail.text`，序列化时保留结构化 `reasoning_details`。本轮在该文件内没有找到预发 DeepInfra 输入 token 估算或此格式的等值映射；这是所读文件的缺项，不是整个项目不存在的证明。

## 其他旧运行的可复用范围

Flash 真实图像两轮结果 `deepseek-image-cf373c2a-3966-4087-a489-3b1fee73a9ca/result.json` SHA256 `d89ddf05559b70be9946872882c2bc2fd45882aa6bdad1549a0550c75c718b06`，记录源码 `f3d7281c55cdf7b8ebc599c4e2780ba356842fe6`、`pass=true`、两轮 `DeepInfra` 上游 usage，支持当时路由接受图像和历史回放；不覆盖当前定义或计量。Flash 真实 Cordis noRun 工具服务两轮 `deepseek-service-tools-flash-258520ea-6d76-4b6d-8788-463a131b52ea/summary.json` SHA256 `27adafa92a9da8629936202622bce22a4fe733f9379824e60396c5866096615a`，记录源码 `09130037d11f520910d1f3ca5fe609f747b60d6a`、`pass=true`；覆盖工具声明、外部提供工具结果、持久化和关停，不是工具真实执行或当前绑定的完整服务认证。Pro 服务付费原日志 `vendor-completion-root/deepseek-tools-pro-paid.log` SHA256 `324bec17bb0ae2fcacb93a6b9f4b9953e37447fcb214fe2f5f4084ae438d6c84` 明记 `pass=false`、`calls=1`、实际费用未知后停止；不能算作 Pro 服务成功或零费用。

以上真实用量只说明旧请求的已报告结果。`reasoning_details` 的可见文字在现有 DeepSeek 参考计量中如何投影、是否计入以及 metadata 的附加成本，仍没有本路由的等值或误差上界证据；需要区分文字、重复的可见 block 与真正不透明内容，不能用 JSON 序列化长度或密文长度代替 token。重新核验触发条件为所选路由、实际回包形态、原生指南／encoder、pi／omne-next 版本或本项目回放及计量路径变化。
