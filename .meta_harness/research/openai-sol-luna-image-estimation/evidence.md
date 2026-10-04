# 可复核的来源与观察

## 第一方材料

- 来源立场：厂商与路由平台自述；不等于对私有计量实现的独立证明。
- 取得方式：2026-09-29 文档工具全文抽取，保留 JSON 工具载荷，**不是原站 HTTP 字节**。归档 [images-vision-tool.json](evidence/first-party/images-vision-tool.json) 和 [reasoning-tool.json](evidence/first-party/reasoning-tool.json)，校验见 SHA256SUMS。
- 精确来源：[OpenAI images/vision](https://developers.openai.com/api/docs/guides/images-vision)、[OpenAI reasoning mode](https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode)。图片指南中的命名 patch 家族为假设来源，不能自动移植精确预处理到 Sol/Luna。
- 精确六型号与 Pro 身份来源沿已有 [GPT-6 续查证据](../model-request-adaptation/vendor-continuation/openai/evidence.md)及其中 [OpenRouter GPT-6 migration guide](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/gpt-6)；本轮不改写原文字或假装重新抓取该页。
- 已核资料未找到四叶精确图片公式，表示读数缺口，不表示不存在。上游计费原文不替代 OpenRouter 对 context scope 的精确定义。

## 六次基础型号实验

- 时间与基线：2026-09-29，源码 `cd55df171f9b3529a72677fed8422544abaadcf2`，研究 definition/implementation `image-range-pilot-2`，非正式 `mp4-15`。
- 实际执行：由主调度在真实 OpenRouter 入口发送；本包整理者只读公开脱敏原件并独立离线复算。固定 provider `openai`、禁止 fallback、require_parameters，单 user 短文本及一张合成 PNG，`reasoning.effort:low`、max_tokens512、stream true、store false。
- 原输入：每条 scenario 保留源文件 SHA、PNG SHA、公开 wire SHA、余量和限制。对应 [原候选](evidence/source/cd55df17/candidate.mjs)、[装配源码](evidence/source/cd55df17/core.mjs)、[输入生成](evidence/source/cd55df17/fixtures.mjs)及 images；按 manifest 对应源 SHA 校验后复制。源码的相对依赖要求原 worktree 结构；归档源码不直接运行付费。
- 实际观察：六次 complete，精确 upstreamModel 与 servingProvider；`from_usage` 输入三项之和及原成本由 [recompute.py](recompute.py)复算。原计算摘录在 [BASE-RANGE-RECOMPUTE.json](evidence/analysis/BASE-RANGE-RECOMPUTE.json)，其中 receipt 字段实际上指原 summary 路径；本包明确保留 summary 与 public 两原件，不把该字段名当 public 证据。
- 支持范围：有限 public 接受和同一次实际计量；没有真实 service、多轮工具、JPEG/WebP/GIF 或全 effort 认证。样本覆盖不等于普遍误差上界。

## 两次 Pro 实验

- 时间与精确源：2026-09-29，完整 commit 见下表与 manifest，研究 binding `image-range-pilot-2`。
- 前提与输入：同样固定路由，64×64 + 256×32 两张合成 PNG；[原候选](evidence/source/be316078/candidate.mjs)、[输入](evidence/source/be316078/fixtures.mjs)及逐条 scenario 与源 SHA 对应。
- 实际观察：两请求 complete，原 usage/cost 保留，但 `observedInput` 明确 `scope_unknown`；[原离线分析](evidence/analysis/paid-pro-analysis-v1.json)保留 residual/admissionExceeded 为 null。
- 支持范围：确切 pair 请求接受及实际计费；不证明 I1431 是上下文、不证明图像 tokenizer等价，不回填成正式新绑定认证。

## 逐请求原件

| 场景 | 精确源码 | 脱敏 public 原件 | SHA256 |
| --- | --- | --- | --- |
| sol-offgrid | `cd55df171f9b3529a72677fed8422544abaadcf2` | [`public-9cf13556-3487-422c-9ef7-ac563fcd7907.json`](evidence/sol-offgrid/public-9cf13556-3487-422c-9ef7-ac563fcd7907.json) | `638806100f131f84ad10a317e3aed9dfa6083656dc0cd341f5d8e1af52a54053` |
| sol-square1024 | `cd55df171f9b3529a72677fed8422544abaadcf2` | [`public-01874990-1a4a-4fac-8fe6-d2aaa7b4e888.json`](evidence/sol-square1024/public-01874990-1a4a-4fac-8fe6-d2aaa7b4e888.json) | `f6a10290494500811d6ddb059dc42759645d10ad0fe7ebdcb9f584d3fada2958` |
| sol-large | `cd55df171f9b3529a72677fed8422544abaadcf2` | [`public-c847d4eb-826e-4aec-837c-48c367ae50df.json`](evidence/sol-large/public-c847d4eb-826e-4aec-837c-48c367ae50df.json) | `2be1bb2097d07e7f683245e185df376dfc3d98e27e5cd92a23d4ec13319701e2` |
| luna-offgrid | `cd55df171f9b3529a72677fed8422544abaadcf2` | [`public-a3e8e7fd-43c0-4e5e-bba1-9b38aa3a786a.json`](evidence/luna-offgrid/public-a3e8e7fd-43c0-4e5e-bba1-9b38aa3a786a.json) | `5ac36a1018c3b76d62c7070814812bb90b3c04d320c004ded7cb56d7b1e8f9f0` |
| luna-square1024 | `cd55df171f9b3529a72677fed8422544abaadcf2` | [`public-491691a5-0ea4-4d8d-9507-11d7f8dc4dcc.json`](evidence/luna-square1024/public-491691a5-0ea4-4d8d-9507-11d7f8dc4dcc.json) | `9504ee04e7bd98693b847e6badfb8a2bc46476ad54f8d0c0423c54520711e878` |
| luna-large | `cd55df171f9b3529a72677fed8422544abaadcf2` | [`public-985adafd-9c4b-4b6e-abf7-af1b87d7c9df.json`](evidence/luna-large/public-985adafd-9c4b-4b6e-abf7-af1b87d7c9df.json) | `756057a4a8d3ad02bc7e1655028f8bdb575720777f9dfbcb2196e9cbb730fd36` |
| sol-pro-pair | `be316078f4490f9e03381de1d57a72726eaaec78` | [`public-66d040e8-1fbe-4db1-a9a4-6931b00f6c7c.json`](evidence/sol-pro-pair/public-66d040e8-1fbe-4db1-a9a4-6931b00f6c7c.json) | `9dcfc7bf0cc460172ac861cc4b730c63a940a78dc71c81ea4fdcf6b624e1ca4f` |
| luna-pro-pair | `be316078f4490f9e03381de1d57a72726eaaec78` | [`public-1598ab28-5398-41b8-a940-4a6d68273a99.json`](evidence/luna-pro-pair/public-1598ab28-5398-41b8-a940-4a6d68273a99.json) | `75671d67718343c2fd59a585c333641b555b3f229fc213a900003b3084ec6cb9` |

逐请求 `manifest.json`、`scenario.json` 与 `summary.json` 在相同目录。完整索引见 [provenance.json](provenance.json)；它记录原工作树相对路径、复制后路径、长度、SHA，不要求保留临时 worktree 才能校验本包原件。

## 校验与复算

从本包目录运行 `sha256sum -c SHA256SUMS`；`python3 recompute.py` 不联网，逐条核 scenario/public wire/source 一致、真实型号及来源、输入三项求和、上下文 scope 和十进制费用。这里没有凭据、正式账本、raw SSE 或模型回复原文；公开收据只保留响应块长度／哈希。只验证本包具有的原件；source hash 索引存在不等于本包携带了全部 product dist，源码完整树仍按 commit 和原冻结归档定位。

后续型号、路由、统计语义或算法改变时，此包原件不改。新事实需要独立记录适用源与输入。
