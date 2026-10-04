# xAI 两款完整交付：图像与加密历史的窄证据复核

2026-09-29；事实调查与待验证命题，**不是提供者采用决定**。对象只有 `x-ai/grok-4.7`、`x-ai/grok-4.6` 经 OpenRouter 固定 `xai` endpoint；代码观察基线 `b69f287d` 的 definition revision 3 / `pi-ai:xai` revision `mp4-17`。不调查其他模型、不发送付费请求、不读取凭据或费用账本。

## 结论及来源范围

当前主要缺口是图像与实际返回的加密历史都尚不能被正式 meter 计量。已有六次完整结果可支持各型号的可见文本估算偏移和实际缓存读观察，不能证明 encrypted replay 或图像公式。固定 Grok Build 源码提供粗估方法，并没有本路由的 tokenizer 或误差上界。

本轮只重新取已有研究指定的三份源码／许可及两份官方文档。来源 URL、取得时点、字节数、SHA-256 在 [sources.json](closeout-2026-09-29/sources.json)，原文在同目录。网页 `.md` 经浏览工具返回 content-type 不支持后，直接 HTTP GET 成功；没有因此换来源。GitHub 两份 Rust 文件 SHA 与 [09-28 窄核验](2026-09-28-grok-build-estimator.md) 完全相同。本研究不重新定义旧观察。

| 证据 | 本次可确认的事实 | 不能推出的结论 |
|---|---|---|
| Grok Build `f0e3be1100ef5252488e3be8bb0e91cf68d8c305` 的 [lib.rs](closeout-2026-09-29/grok-build-estimation.rs)、[state.rs](closeout-2026-09-29/grok-build-state.rs) | UTF-8 bytes/4；765/image 的注释限定为低分辨率图片块粗估。Reasoning 使用文本与估算解码密文字节中较大者；原文明确是 compaction estimate。 | 765 与图片尺寸无关的上游精确值或上界；OpenRouter 任意分辨率、未知 detail 均适用；密文字节等于 token。 |
| 同 commit 的 [LICENSE](closeout-2026-09-29/grok-build-LICENSE) | Apache-2.0，版权标记 SpaceXAI。固定源码可供后续复用评估。 | 本次已复制或执行 Rust 实现；许可证事实不是模型算法适用性依据。 |
| [xAI image 文档快照](closeout-2026-09-29/xai-images.txt) | Grok 4.7 原生请求示例支持图片 URL/data URL；有 `detail=high` 示例；建议图片请求不在服务端存储历史。 | 本轮页面没有 token 计数公式，未给固定 OpenRouter route 的尺寸缩放／分块／计费映射。不能把原生示例当本项目已验发送。 |
| [xAI reasoning 文档快照](closeout-2026-09-29/xai-reasoning.txt) | 原生 Responses API 的 encrypted reasoning 可以原样交回以延续上下文；4.7 默认返回。原生 Chat Completions 没有 ciphertext 字段。两款支持 low/medium/high/xhigh，推理不可关闭。 | OpenRouter `reasoning_details` 到原生输入的精确计量等式；原输出 O 无条件等于下次输入贡献；4.6/4.7 共用任何未知 tokenizer。 |

## 已有真实证据能复用到哪里

[4.6 完整输入观察](2026-09-28-complete-prompt-calibration.md) 和 [4.7 nonce 观察](2026-09-28-grok47-complete-prompt-calibration.md) 各有两份 fit、一份独立工具历史 holdout；当时是 definition 1 / mp4-1。它们的完整输入分别为 219/240/334 和 1274/1297/1392，均含明确缓存分项。当前可见 full 估算保留各自 141 与 1181 偏移；当前 effort 扩域并没有额外真实 holdout。

六份输出都有 encrypted thinking，工具 holdout 的输入却是预先构造的明文历史，不能把它计为“真实加密回复接下一轮”。包内 `tests/fixtures/xai/history/manifest.json` 的 `nativeReasoningTokens` 是旧候选算式结果，不是上游报告：其六值 165/944/257/117/590/132 与研究记录的真实 reasoning 138/883/233/88/545/111 不同。这个差异不证明哪个 replay 公式准确，只明确二者不得混称。

实际 output 曾超过请求 maxOutputTokens=128（891、553 等），已由前两份研究记录。因此探针预算不得把显式短输出参数当作费用硬上界；本轮没有改变这项既有事实或预算政策。

## 待验证命题及交给提供者设计的精确问题

1. **图像**：765/image 只能作为待检验的低分辨率粗估起点。当前正式 wire 省略 detail，项目 profile 仅有每图 4 MiB 上限，尺寸域不能由字节数推出。需要同路由独立文本基线及小图、大图、多图的完整输入差分，之后才能决定可采用的估算及明确适用范围；不能用校准白名单限制为几张测试图片。
2. **完整输出组**：若采用原 O 的 estimated 代理，应由共享整组覆盖算法承担唯一计数。xAI 只提供精确 origin model/provider/definition/implementation/模式守卫，以及实际 `xai-responses-v1` summary/encrypted 的合法回放条件。全部原输出块按序完整保留才可能使用 aggregate；部分组、未知 origin、缺 O、工具参数不完整或合并冲突不能当已覆盖。此为待采用映射需求，不声称现有资料已证明 O 等式。
3. **增量**：可见文本已有 bytes/4 粗估依据，但正式 full/φ/δ 必须共享贡献来源与明确 framing 口径，prefix I 只在原计量依据与实际投影成立时复用。图片准备改变历史字节或模型／依据变化时不能沿旧 I；不得用每型号自建 walker 补洞。

最小新增真实观察应让首响应的原始输出进入第二次请求，再以第三次追加检查连续复用；每个请求记录冻结 wire、实际完整输入 I、输出 O、cache 分项、费用与模型/provider 身份。完整输入是未缓存、缓存读、缓存写之和，未知分项保持未知。新增图像与工具声明应在有限场景中分别归因，不能用一次混合请求解释所有差额。公开 factory 与 Cordis service 的认证仍分别需要实际运行，研究差分本身不代替它们。

## 失效与局限

来源固定 commit、两模型的固定 endpoint、reasoning 格式、计量字段口径或实际图片准备策略改变时重核。本轮不调用原生 tokenizer，不统计密文内部 token，不执行 Rust，不声称已关闭任何一个正式模型交付条目。没有发现公式只限于上述指定来源，不意味着全社区不存在更精细方法。
