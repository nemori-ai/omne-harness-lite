# Anthropic 缓存末端与不透明历史的窄核对

2026-09-29；实现基线 `e66ddc9d`，四个精确对象为 `anthropic/claude-opus-5.5`、`anthropic/claude-opus-5`、`anthropic/claude-sonnet-5`、`anthropic/claude-fable-5.1`，当前 definition `3`／`pi-ai:anthropic/mp4-17`、固定 provider `anthropic`。消费者是 RT10/MR9、D107 的现有完整／增量计量，以及 transport ND-G2。D108 refusal 已完成，不在本次重做。研究不接受方案、不发布定义；实施候选由主线持有。

结论：**既有 pi OpenAI-compatible 和 omne-next 缓存函数都不能消除纯图缺口；原生 Anthropic SDK 能标 image，不证明 OpenRouter 的 image_url 扩展会转译。** OpenRouter 另有公开的顶层 automatic 缓存入口，但采用它会改变现有发送策略。第二个缺口比 `reasoning.encrypted` 更宽：**带 signature 的 `reasoning.text` 也可能只是隐藏推理的显示摘要，当前接受它并对 JSON 分词不能代表完整推理回放。** 四型号原生均保留所有旧轮 thinking；完整输出 usage 作为整组 estimated 代理有相关性依据，但 OpenRouter 隐藏转换及签名保留条件仍须有限声明和实际观察。

证据包：[源码、哈希与探针](../evidence/2026-09-29-anthropic-closeout/README.md)。本轮 39 项提取函数检查通过；无模型请求、无凭据、无费用。没有将这些检查写成路由认证。

## 既有材料与复用边界

| 已有材料 | 直接复用 | 差异复验或缺失 |
|---|---|---|
| [2026-09-29 缓存投影研究](2026-09-29-anthropic-calibration-projection.md) | 旧完整 wire 受移动标记影响的反例；限定 text 标记投影；稳定 assistant/tool 数组；omne-next 固定源码及 TTL 读数 | 该研究未证 image_url.cache_control，也未证不透明组 O 映射；不能据此关闭这两项 |
| [2026-09-28 四路研究](2026-09-28-anthropic-four-routes.md) | 四路配置、同路 opaque 回放的离线形状；无跨型号无根据推广 | 定义/实现变更只复验受影响映射，不机械重测 refusal 或不变的提醒转换 |
| [2026-09-27 真实组合研究](2026-09-27-first-party-and-joint.md) | Opus5.5/Fable5.1 的 signed reasoning.text、工具循环及固定请求事实 | 旧非流式成功不是新 binding 流式认证；没有 encrypted/redacted 真实样本、损坏签名负控或 native-wire |
| [OpenAI 完整组研究](../vendor-continuation/openai/2026-09-29-complete-output-group-estimate.md)与现有 `openai-output-history.ts` | 整组单位替换、full/φ/δ 互斥覆盖、O 不再重复加 reasoning 或同组 text/tool 的机制 | OpenAI 的来源账本与 all_turns 解释不可搬成 Anthropic 依据；签名前缀约束需要单独核对 |
| 原 mp4-17 四叶 public/service 本机证据、D108 reader 证据 | 原实际场景、负控与源文件哈希可直接用于无变化部分 | 新 wire/meter 的纯图、signed/encrypted、多组与当前真实 usage 残差仍缺；不能改旧收据的认证对象 |

报告只引用旧事实，不复制历史数据或缩减既定纯图、工具、参数供给范围。

## 固定源码的具体作用

完整版本、URL、取得失败及 SHA 在 [sources.json](../evidence/2026-09-29-anthropic-closeout/sources.json)。源码原件在同包保存许可。

| 对象 | 函数／配置与读数 | 不能直接复用的原因 |
|---|---|---|
| pi `0.86.1`，`3390bd93630965a12a0a1a5c36ce890ec22f7e1d`，MIT | `openai-completions.ts` 的 `getCompatCacheControl`、`addCacheControlToTextContent`：long+支持时显式1h；非空字符串或最后text可附着；无text返回false。`appendOpenAIReasoningDetail`保留encrypted条目，按顺序合并text/summary增量 | text-only附着正是当前缺口；客户端不知道OR的实际原生转换，也不提供下一轮token估算 |
| 同版 pi 原生 `anthropic-messages.ts`，MIT | `convertMessages`尾部允许text/image/tool_result等原生末块；thinkingSignature和redacted数据按对应原生类型回送 | 原生image和OR image_url是不同协议；环境默认TTL、跨模型处理、宽容丢弃不能自动成为本项目政策 |
| Vercel `@ai-sdk/anthropic` `4.0.68`，`0116f28486baeeef5125e82dc85799090798ec62`，Apache-2.0 | `convertToAnthropicPrompt`把媒体转原生image并透传cache_control；reasoning metadata的signature/redactedData分别生成thinking/redacted_thinking；`CacheControlValidator`读取可配置metadata并限制四处 | 第五处与不可缓存块只warning后忽略；TTL值直接交原生API校验。这些不能替代项目显式校验/失败。该SDK亦无OR服务端转换或O→输入估算算法 |
| 同版 SDK `convertAnthropicUsage` | 记录总output与可选thinking分项，处理executor/compaction/advisor/fallback口径 | 原生usage缺省零和迭代聚合不能照搬OR已归一口径；本研究只考虑单executor完整输出，不引入服务端compaction/advisor |
| DSH `0.1.5-rc.2`，`c291e7961a515f6d7af9304e7fd1d257929aef26`，MIT | 已固定 `llm-pi-ai/src/stream.ts::mapUsage`转接pi usage；注释明确reasoning已在output；replay职责沿既有 [DSH读数](../../message-model-and-stream-sources/notes/dsh-llm.md) | 所读adapter层没有O→后续输入算法；零值/缺席合并与本项目部分事实不同。未声称整个DSH不存在这种算法 |
| omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5` | 已核 `prompt_caching.py::_inject_cache_breakpoints`、`_add_cache_control_to_content`：BP1/BP2/BP3分TTL、复制/去旧标记、末text附着 | 纯图仍不附着，默认5m/条件BP3不同于本项目1h/last_message；当前仓根未找到通用LICENSE，不声称可按开源许可复制。前轮报告的“Anthropic middleware”为此原件，本轮未找到另一个名为anthropoid的实现 |

## OpenRouter 与原生的分层事实

2026-09-29直接打开第一方滚动页面；不是固定产品发布版。直接HTTP获取OpenAPI得到403，浏览工具可读；未伪造HTTP原件。

1. [OpenRouter OpenAPI](https://openrouter.ai/openapi.json) 的 `ChatContentText`声明cache_control；`ChatContentImage`仅声明type/image_url，后者内有url/detail。没有找到该图块的cache_control转换声明。Schema未设additionalProperties:false不能反过来证明字段被转发。该负面结论是公开资料缺口，不是服务端拒绝实验。
2. [OpenRouter缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching) 明确区分显式块标记与顶层automatic，后者指向最后可缓存块；支持5m默认和显式1h。文档不能把现有last_message配置默认为automatic，也没有本轮纯图路由的实际upstream body。
3. [OpenRouter推理文档](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) 给出`reasoning.encrypted`与带signature的`reasoning.text`、`anthropic-claude-v1`格式；回放须保持完整序列。OR为支持的Claude默认请求summarized显示；实际计费生成量可以大于摘要长度。这已经是OR层事实，非原生API推测。
4. [Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/thinking) 列出Opus4.5+、Sonnet4.6+、Fable5.1等保留全部旧轮thinking；signature是不透明的完整推理承载，redacted data亦原样回放。原生回放保留的thinking计入后续输入。此事实支持O与回放贡献的相关性，不证明OR包装净修正为零或精确相等。
5. [Preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking) 对Opus5.5/Fable5.1规定模型和之前system/tools/messages约束；账号时间影响前缀检查是否默认执行。cache_control、effort与max_tokens不在该前缀检查内。OR实际账号、转换与是否报出input_transformations本轮未知；成功返回不是强制校验已生效的证据。

因此不能把四款差异写成四份算法：同型号完整回放/keep-all是共享事实域；Opus5.5与Fable5.1还有更强前缀约束。跨型号可读性不对称，当前研究不建立任何跨型号O映射。原生thinking禁用差异沿已有effort供给处理，不凭它改OR当前参数。

## 离线观察与尚未证明部分

[probe.mjs](../evidence/2026-09-29-anthropic-closeout/probe.mjs) 提取固定源码函数、仅去TS类型后执行，不重写它们的逻辑。39项断言覆盖1h/5m函数输入、纯图/图文/空text/空数组/空字符串/tool文本、本项目与pi兼容函数一致、pi原生image附着、当前meter守卫接受signed text而拒绝encrypted、SDK第五断点警告丢弃。5m只证明函数参数透传；当前官方definition仍只接受1h。完整planner/tokenizer、OR/native网络与TTL有效期均未运行。

有符号text被当前守卫接受且后续JSON投影保留其reasoning_details，说明summary/signature会进入普通BPE；这不是隐藏量计数证据。只有完整同源输出组覆盖其全部text/tool/thinking时，O代理才不会漏掉隐藏部分或重复计可见部分；缺O、部分组、未知格式、跨组／跨区域拼接不由本轮事实支持。零封装修正只能是明确的estimated假设，误差无已知上界；不能把密文长度填成token或把unknown填0。

真实缺口仍是：纯图选择的实际OR转换与1h read/write；signed与redacted完整流式回放的实际口径；四型号当前同次usage残差/public/service接续。旧文字命中证据不覆盖纯图，新离线函数证据不覆盖线上成功。费用或认证门只阻止依赖的实测，不阻止源码与无凭据检查。T29不作为厂商认证前置。

复核触发：上述固定函数、OR schema/转换、thinking保留规则/签名政策、模型provider绑定、projection/replay依据变化。D109请求图片准备改变实际字节或组适用basis时，只核该变化的消费者；不能因为revision变化而抹掉可直接复用的旧事实。
