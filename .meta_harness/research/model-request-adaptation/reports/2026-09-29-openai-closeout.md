# OpenAI 完整输出组：固定实现的复用事实与估算适用边界

2026-09-29。调查基线 `e66ddc9d`；范围是 GPT-6 六叶、GPT-5.6 三 Pro 的 opaque 历史贡献。GPT-5.6 三非 Pro 已采用的 full／φ／δ 不重做。消费者是 D107／transport v13 的家族贡献映射及 D109 后继共享 basis relation；本文是研究事实和显式假设，不发布模型 binding，不接受方案，不把 T29 列为前置。

## 结论

本项目已经采用的 pi **0.86.1@3390bd93630965a12a0a1a5c36ce890ec22f7e1d** 自带两项相关构件：Chat 的结构化 reasoning 原样回放，以及最近适用 response usage 加尾部估算。此前报告核对的 badlogic/pi-mono 另一修订不是这次 fork 的权威基线。固定源码 probe 确认两项构件可独立运行；它们没有本项目完整来源、计量依据和未知值保证，不能整段直接替换现有实现。

OpenRouter 的公开协议使完整 `reasoning_details` 回传适用于当前 Chat 路径；OpenAI 原生 Responses 的 `encrypted_content` 则不是本项目 wire 的直接替代。公开协议和 pi 先例给出 **O 是生成该完整输出的原工作量信号** 的相关性，但未给出九叶 O 与下一轮上下文占用相等的证明。将 O 用作完整组的 estimated 代理、净封装修正实验值为 0，是可以逐项验证的假设；它不是密文分词，也不是“未知隐藏量为 0”。Pro 的多 pass 可能使代理明显偏大；不能从聚合计费推出保守上界，也不能据此把 input scope 从 unknown 改为 known。

研究没有发现可直接提供九叶精确计量的现成 SDK；这只是下表明确阅读范围内的负面读数，不是不存在此类算法的证明。现有规格允许有依据 estimated 和显式 margin，不要求找到精确 tokenizer。是否把下述九叶假设纳入本项目适用账本，归主线技术采用；本报告不自行作决定。

## 固定源码比较

全部源码、许可原文、SHA256 及取得方法见[清单](../evidence/2026-09-29-openai-closeout/source-manifest.json)。执行证据见[复现入口](../evidence/2026-09-29-openai-closeout/README.md)。

| 对象／固定版本／许可 | opaque 与 response usage 的实际行为 | 对 OpenRouter Chat 的适用性与代价 |
| --- | --- | --- |
| [earendil-works/pi 0.86.1](https://github.com/earendil-works/pi/tree/3390bd93630965a12a0a1a5c36ce890ec22f7e1d)，MIT | `openai-completions.ts` 将 reasoning_details 装进 thinkingSignature；text/summary 相邻增量合并，encrypted 对象保持离散；回放时恢复结构化数组。`utils/estimate.ts` 取最近非 error/aborted、timestamp 适用且正 usage 的 assistant，使用 totalTokens 或 input+output+cacheRead+cacheWrite，再加尾部字符估计。 | 同属当前 fork 的 Chat 路径，可复用该工程来源；timestamp 不是本项目原前缀身份，probe 在换 model 的 context 上仍复用旧 usage。没有合法 usage 时空可见 thinking 的 estimate 为 0；因此不能把这个回退移入本项目 opaque 计量。 |
| [DSH c291e796](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26)，MIT；只读 Cordis 之外 llm 栈 | `llm-pi-ai/replay.ts` 持久化 response 身份与逐块 signature；重建历史填 zero PiUsage。`token-meter/usage-projection.ts` 独立保留 provider prompt 压力，再加 surface 相对锚的有符号变动；`estimate.ts` 对 reasoning 只读 text/4+4。 | 能借鉴“原观察与表面估计分开”及回放元数据；zero usage 是满足 pi 历史类型的占位，并非原用量事实。坏 replay 降级为 foreign、参数解析失败给 {}、缺 cache 明细给 0 均与本项目契约不同。D035 已排除直接复用整套 DSH LLM 栈，本轮没有重开该采用。 |
| 本机 omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；`omne_openrouter` MIT（LangChain notice） | `chat_models.py` 保存 additional_kwargs.reasoning_details，出门合并片段并剥离 rs_ ID；相邻同(type,index)通过 last-non-null metadata 合并。token estimator 按 vendor 提供 text counter，response input usage 用于事后对比估计偏差；所读文件没有 usage→下一轮完整组校准。 | 直接对应 OR Chat，能提供真实问题和测试素材；本轮 AST probe 确认它会剥 ID，合成同index encrypted二项会留最后data。该合成反例不声称上游实际发过这种输入，但说明不能用于本项目“原组完整不改”保证。token estimator 所属子包许可未在本轮裁定，只作本机阅读证据，不声明可移植。 |
| [OpenRouter AI SDK Provider 3.1.0@1b22b053](https://github.com/OpenRouterTeam/ai-sdk-provider/tree/1b22b05352cb0f9243a6c3fdd326038dd3705544)，Apache-2.0 | encrypted 留在 response providerMetadata，不生成可见 reasoning part；调用者必须将 metadata 回带到 message/part providerOptions。转换器优先 message-level，再首个 tool/reasoning part，避免多工具复制；另有全消息去重。`computeTokenUsage` 保留 raw，总O不再加reasoning，但缺失计数会置0。 | 原生 OR Chat SDK，能借鉴 opaque 与可见内容分离、单份 metadata；没有下一轮 token estimator。metadata 转接遗漏会丢回放；全局去重、默认0、结构化 tool 参数序列化不满足本项目全部保证。直接换SDK会扩大适配面，不产生九叶计量依据。 |

## 当前第一方证据与假设分界

[OpenRouter reasoning 文档](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)明确：encrypted/summary 使用完整 reasoning_details，连续序列不能改序或修改；GPT-5.6+ 支持 context，省略等同 auto，默认可能随模型不同；Pro slug 对应同基础模型的 pro mode，多 pass 工作更多。该页描述协议，不提供九叶当前路由回执或 O→I 数学关系。

[OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)明确：O 包含 reasoning；Pro 汇总生成最终答案的模型工作并计费；GPT-5.6 默认 all_turns，跨家族可省略不兼容 reasoning。此次工具全文未找到能够据此直接断言 GPT-6 所有精确叶、OpenRouter omitted context 一定 all_turns 的条款。有效 mode 可以由原生响应字段确认，但本次未取得对应九叶新回执。

原生文档抓取存为[工具载荷](../evidence/2026-09-29-openai-closeout/openai-reasoning-tool.json)，OpenRouter 存为[浏览抽取](../evidence/2026-09-29-openai-closeout/openrouter-reasoning-tool.json)。它们都是2026-09-29滚动资料，不是不可变版本；直接请求 OR markdown 收到403，不能把浏览抽取冒充HTTP原站字节。

对九叶可陈述的有限实验假设是：原完整组和目标最终assistant字节/顺序/选入范围保持时，以该组合法原O计一次相关贡献，不加同组text/tools/reasoning第二次；原和目标精确model/provider相同、mode仅为既有slug所指执行模式、context仅省略；O已知且来源合法，保留来源中的未知I。适用假设不包括显式current_turn/all_turns、跨型号、partial组、未知原binding、变化后的原输出内容或把usage缓存命中零值当context。

为什么存在估算相关性：原O来自生成这份实际回传组的同一次响应，公开协议允许这份组重新交给同一路由，pi也使用输出usage进入后继估计。为什么仍可能退化：model默认不渲染部分旧reasoning、Pro包含未回放的内部pass、gateway私有封装以及边界非加性都使O与实际输入贡献不同；误差可能随无有效I的多组累积。完整组O能覆盖哪些实际内部工作尚未知，所以没有报告置信水平或误差上界，没有从Pro已有单点拟合offset/scale。

## 与既有材料的关系及验证边界

本轮是[2026-09-28计量来源研究](2026-09-28-input-meter-sources.md)的**补充**，不是对旧固定版本结果的覆盖。继承[GPT56非Pro完整组依据](../vendor-continuation/openai/2026-09-29-complete-output-group-estimate.md)及[GPT6/Pro已有观察](../vendor-continuation/openai/research.md)的范围限制。六个GPT6首样本和Sol/Luna文本、图像holdout证明过的只有各自所记输入；它们不含这里所需opaque多组占用反事实。没有重新发送这些样本，也没有读密钥、环境凭据或费用账本。

Node24.18.0 上9项纯函数 probe 与 Python3.12.13 上3项 AST probe 均通过，包含不应继承的行为反例。只运行冻结上游纯函数，未运行整套SDK网络客户端、生产meter、public/service认证或实际上游。它们不增加现有线上认证分母。

已采用 MR9 S41–45、RT10 S77–79、transport v13 已有完整来源、full/φ/δ、O覆盖组且不双加、estimated与margin接口；D109及其basis附页已有共同relation和currentOnly／sameEffective／changedEffective职责。九叶的不足是**适用事实／假设及有限原→目标坐标**，不是缺新的公开能力接口。将O用于full不要求把Pro的I伪造成known；φ消费原I仍受原scope约束。

付费请求能补的最小观察单元为每精确叶的实际三轮：第1轮产生完整加密组（优先完整工具call以同时覆盖回放连续性），第2轮同来源回放该组并产生第二组，第3轮完整回放两组；记录原O、有效mode若可见、reader scope、实际请求摘要和最终组范围。已有同binding同wire安全回执满足某一步时可直接引用。三非Pro已完成组合验证不因本报告重做。Pro没有公开真实context输入时，三轮只能证实回放接纳及wire保留，不能从billedI计算上下文残差；若需该精度事实，真正缺的是上游明确的context口径或独立可信计数，而不是更多同类billing样本。

default-mode、provider、reasoning字段规范、输出计费、fork或SDK版本变化即触发重核。当前未完成事项不由缩profile、删opaque、tokenize ciphertext或默认0消除。
