# 响应 usage 校准稳定输入前缀：事实、数学边界与离线成本

观察日期：2026-09-29。研究输入是“上游响应的 input usage 准确”；实务文档核对其口径与必要限定。本文给事实及推导，不作接受决定；候选承载方案见[提案](../../../design/record/proposals/model-input-usage-calibration/README.md)。未发实际模型请求，所有将来的真实模型请求仍须统一经 OpenRouter。

## 1. 结论的适用前提

在计量依据相同、实际旧输入前缀保持、上游输入总量与目标窗口口径相同且准确时，**无需反复 tokenize 全部稳定历史**。以响应输入总量为锚，对锚后实际回放输出及新增输入作边际计量，每次可信响应重新校准，可使历史估算误差不跨校准累积。新增量、输出到输入的转换和前缀同一性不能由旧 aggregate 自动得到。

这支持足够准确的持续总量跟踪和未来压缩触发；“任何输入都保证发前不越窗”还需要新增贡献的准确值/有效上界及窗口、输出预留同口径。estimated 加余量只给政策准入；统计样本不能构成无条件上界。性能实测显示消除全历史重复分词有明确价值，不以无法绝对保证否定这项收益。

## 2. 第一方文档事实

以下都是滚动文档，读取日期为2026-09-29；没有虚构不可变发布版号，没有把文档当作本路由实测。日期型 beta 仅在相应页面明确列出时记录。版本、模型、provider 与 OR 转接可能影响实际行为。

| 来源 | 文档支持的事实 | 本研究不能由此推出的事 |
|---|---|---|
| [OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting) | 响应提供原生token usage；stream的最终事件包含汇总输入/输出使用量 | 没有逐message/block的完整token归因；账单计量准确不自动等于任意模型窗口核算 |
| [OpenRouter prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching) | prompt缓存细项与总prompt输入相关，缓存改变计费/复用 | cache命中不意味着这段上下文token消失 |
| [OpenRouter response caching](https://openrouter.ai/docs/guides/features/response-caching) | response缓存命中可返回零billable输入/输出，与原响应复用有关 | 零usage不能解释成当前请求上下文为零，不能无来源重锚 |
| [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) | 原生input_tokens、cache_read_input_tokens、cache_creation_input_tokens需要按语义组合为总输入 | 不能把原生input_tokens单独当含缓存的完整输入，也不能再叠加已经含缓存的OR总prompt |
| [Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/thinking) | 签名承载加密的完整thinking；可见summary与完整output计量不同，回放有保持要求 | ciphertext字节数和可见summary长度都不是隐藏token精确值 |
| [Anthropic preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking) | 对受支持模型，保留thinking与前缀绑定、模型兼容和变换控制有关；页面列有`thinking-binding-controls-2026-08-01` | 不可推广为所有模型、provider或OR均实现相同保留行为；不能只核model字符串 |
| [Anthropic token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting) | token counting本身有估计及系统优化差异，模型变化会影响计数 | 调用官方countAPI也不自动获得本项目无条件窗口保证；本次未调用 |
| [OpenAI reasoning](https://developers.openai.com/api/docs/guides/reasoning) | output包含不可见reasoning使用量，回放/保留取决于模式和模型 | 不能把output total一律作为下一轮输入贡献；不从可见回答反推隐藏量 |
| [OpenRouter reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) | reasoning使用量是输出相关明细；reasoning_details可有文本、summary和opaque内容，回放有结构要求 | 缺reasoning字段不是reasoning=0，完整O与其reasoning子集不可重复相加 |
| [OpenRouter message transforms](https://openrouter.ai/docs/guides/features/message-transforms) | 启用的变换可裁剪/压缩请求消息 | 返回usage可能对应变换后输入，不能自动锚定本地变换前prefix |

本研究使用的“准确 I”指对应最终实际输入的总量。若上游私有重写/保留规则无法映射回本地输入，观察虽准确却不能直接复用为本地前缀计量。需明确模型适配依据，或把预测标 estimated/unavailable。这是实务前提缺失，不是对给定数学条件的否定。

## 3. 数学式、不可辨识与保证

定义计量函数`Cθ(P)`。第k次实际输入`P_k`返回`I_k=Cθ(P_k)`；输出为`G_k`，上游输出总量`O_k`（reasoning细项如存在是其中子集）。下一输入为`P_k⊕replay(G_k)⊕N`，令

```text
φθ(G|P) = Cθ(P⊕replay(G)) − Cθ(P)
δθ(N|P,G) = Cθ(P⊕replay(G)⊕N) − Cθ(P⊕replay(G))
Ĉnext = I_k + φ̂θ + δ̂θ
Cnext − Ĉnext = (φθ−φ̂θ) + (δθ−δ̂θ)
```

φ必须通过模型适配解释O、实际回放形状、隐藏保留及模板边界。**I准确不意味着O到输入的映射已准确**。若映射仅估计，明确φ是估计；已有锚内历史的I仍可准确保留。

归纳：首次准确响应将历史预测替换为I；每次后继响应同样将当前总输入替换为新I。因此上式中不含之前的预测误差。连续缺usage时不能做该替换，误差仅限制在上个有效锚之后的全部新增，随该段增长仍可能累积。未知不置零、不凭回复成功假定usage存在。

三个可复现反例：

- 只用滞后usage：窗口100、输出预留10、旧输入60；新增1可发，新增41越窗。旧usage相同，不看新增的规则不能区分。全部拒绝当然安全，但不是有效准入。
- 无逐条归因：旧输入60、新输入100，两条新增贡献共40；(10,30)与(20,20)同样满足。一个aggregate只有一个方程，t>1通常不足以识别每条/每block。现行usage API分项也不是逐消息账。
- 非加性：玩具tokenizer把`a`、`b`各计1，把相连`ab`计1；单独新增b的长度1而给定a的边际0。它只演示跨边界问题，不声称目标tokenizer恰有这些token。真实模板及隐藏保留也可能产生依赖；顺序差分不能当删除/重排后可搬运的条目真值。

有限算术复核脚本见[math_check.py](../evidence/2026-09-29-prefix-usage-calibration/math_check.py)；一般误差不累积是上述代数归纳，脚本有限枚举不是实测或形式模型证明。

确定性条件保证可写为：已证明稳定prefix与兼容θ、准确I、φ/δ有效上界、窗口及输出预留正确，则`I+φbound+δbound+reserve<=W`蕴含本次fit。配置余量和过去最大误差不满足“有效上界”的证明义务。统计置信还需独立性/分布稳定等前提，模型切换或私有变换可能破坏它；本研究没有给未经数据支持的置信值。

## 4. 仓库当前语义与PF核对

基线`846d4c9096f5b4d18d07fa60c5c56cf29f53fe00`，采用状态以[候选包来源清单](../../../design/record/proposals/model-input-usage-calibration/baseline.json)列出的registry/决定为准，不以冻结正文残留“candidate”标题否定已采用状态，也不使用design_legacy。

- [CA2 S6](../../../design/spec/data/call-accounts/v2/contract.md)：归一化输入三项互斥，总输入需包含缓存读写；output含reasoning，缺明细仍unknown。当前`accounts.ts`在部分cache细项缺失时无法由归一化字段重建虽在原prompt总量中已知的I；MR8的raw诊断附件会过期，单靠附件不是耐久来源。
- [RT9 S54/S57/S58/S60/S74](../../../design/spec/capabilities/model-request-runtime/v9/contract.md)：公开调用显式输入、纯规划、固定最终body、可替换组件；完整最终输入仍有字节/图片门，token允许有依据estimated并显式margin。[MP6](../../../design/spec/data/model-profile/v6/contract.md)负责相关准入计量政策。不能把本地tokenizer的精确编码长度等同上游准确窗口输入；现meter诚实标estimated。
- [MR8](../../../design/spec/data/model-response/v8/contract.md)：usage/route/binding/实际provider及原输入快照等各有既定责任；新增历史可信来源不能只看meter的`body/serialized`两个参数。
- [PF-010 rev6 §5.7、§6.10–6.16](../../../design/product/PF-010-context-management-and-assembly/design.md)：一次CompactionMessage带摘要和静默列表；不修改历史原visibility；所有静默列表决定可读性，而不是最后摘要截断。不可静默最后请求之后的新消息和指定pending占位，压缩后重引入运行时元上下文。
- [MS6 S27–S29](../../../design/spec/data/messages/v6/contract.md)将上述agent可见性落成读取规则：存在于所给prefix，所有祖先toModel=true，路径无静默；容器静默覆盖后代。可读只是进入请求的必要条件。`core/messages` realization的`isReadable(ref,prefix)`纯推导，不回写当前flag。

由此可推：一次compaction改变实际最终prefix，就全量计第一次新输入，响应后重锚，足以覆盖现有静默语义；无需复杂删除delta。未来压缩选择可以使用明确估计的条目长度，压缩触发总量使用校准后总量；无需把aggregate伪装成逐条实测。[PF §6.8](../../../design/product/PF-010-context-management-and-assembly/design.md)要求压缩后可发下一请求，而RT9 estimated政策本身不提供硬fit证明，这个保证口径仍应由相应owner明确，本文不替其裁定。

## 5. 约百万token离线基准

[原始证据目录](../evidence/2026-09-29-prefix-usage-calibration/README.md)含3组JSON、脚本、来源hash与可重跑说明。冻结复制了67个dist/schema/package文件，另记录5个源文件SHA；之后未占用HUB构建窗口。实验实际运行既有纯text meter，没有运行网络transport或真实openCall/dispatch。

环境：Node v24.18.0，Linux x64，Xeon Platinum8175M @2.50GHz、8逻辑CPU；并非独占机器。`js-tiktoken@1.0.21/o200k_base`；既有本地binding为`openai/gpt-5.6-sol`、provider`openai`、implementation`pi-ai:openai/mp4-3`、algorithm`openai-gpt-5.6-o200k-base-3`。这些是源码里的本地测试绑定，不是对当前线上模型可用性/1M路由支持的声明。

输入为合成英语、代码形文本、中文汉字及数字，共1018条消息/blocks。最终序列化body本地tokenizer实际计数 **1,001,641 tokens**；UTF-8 3,630,139 bytes、UTF-16 3,190,363 code units。没有拿字节冒充token。serialized SHA256为`3b29f639eae8f8b7a518374ff7e00426a16cd99f2b8d0b004ad15588a8e3fef8`。meter输出仍是estimated，因为本地编码与上游实际输入口径不是同一证明。

每个新进程1次首次meter、3次warm，3进程共9次warm；各轮前显式GC在计时外。cold import和factory单独记录。

| 阶段 | 中位 | 范围 | 样本 |
|---|---:|---:|---:|
| 导入模块wall | 249.49ms | 248.01–250.07ms | 3 |
| cold factory/tokenizer初始化wall | 702.60ms | 685.25–704.51ms | 3 |
| cold首次meter wall | 3578.15ms | 3385.84–3702.49ms | 3 |
| warm合成final body构建wall | 0.333ms | 0.238–0.357ms | 9 |
| warm `writeJsonLossless`序列化wall | 25.24ms | 22.43–27.73ms | 9 |
| warm实际meter wall | **3490.46ms** | 3343.98–3538.65ms | 9 |
| warm实际meter CPU（user+system） | 3689.65ms | 3501.05–3736.98ms | 9 |
| warm meter前后heap增量 | 74.626MiB | 74.596–74.651MiB | 9 |

构建仅合成最终对象并复用不可变字符串，**不代表完整规划开销**。实际meter内部还做body/serialized一致性重序列化及sanitized-body分词，没有将这项工作人为剥除。CPU统计含运行时线程，可能超过wall。heap是前后观测，不是峰值；第三进程Linux VmHWM峰值359.59MiB，含已加载库。`resourceUsage.maxRSS=1387MiB`在bareNode阴性对照也出现，是launcher继承污染，已排除归因；不能拿它声称meter用1.4GB。

按现有openCall+dispatch两处规划的成本作**算术估计**：两次warm meter中位6.981s，范围6.688–7.077s；两次构建+序列化+meter中位7.035s，范围6.741–7.128s。未测两阶段端到端，未包含额外验证、复制、IO、生命周期。这个结果仅说明当前实现的重复分词成本显著；不说明新方案已实现提速、不推广到所有厂商。

## 6. 仍未知与后续可验证项

尚未知：每个目标model/provider的准确窗口口径、最新输出组φ的exact/上界条件、OR对原生thinking控制的完整透传、私有重写的可识别性。来源有效的旧I可覆盖老opaque历史，但最新opaque输出仍受这些事实限制。不能用旧I重建单个signature的token长度。

离线可用oracle验证：append校准误差重置、缺usage连续段、非加性边界、compaction/模型切换全量回退、分支与乱序、未知提交恢复原批、response-cache零值拒绝建锚；跟踪稳定prefix被tokenize次数应为0（增量路径）。现有本文只完成数学例子与基准，未运行后继实现或TLA模型。

以后另行授权真实探针时统一走OpenRouter，记录固定路由与版本、使用完整回复/部分回复、缓存与thinking组合；指标包括估计误差分布、假拒绝率、实际越限率、失效检出率，报告分母和样本/分布限制。即使样本中0次越限，也只能给有假设的统计界，不能声称永不越窗。压缩触发的迟早偏差与请求准入失败率分别衡量，不混成一个“准确率”。
