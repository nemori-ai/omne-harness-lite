# openai/gpt-6-sol 的已知事实与未闭合字段

调查对象为 OpenRouter `openai/gpt-6-sol` 的精确 tag=`openai` endpoint（不是 `openai/flex` 或 `openai/fast`），及2026-09-28官方 OpenAI 文档快照。消费者为 A0b 首模型完整定义。当前结论是身份、模态与独立token上限有明文值，但逐图字节限制及条件参数不能据这些资料冻结成当前完整定义。

## 身份、模态与独立 token 上限有直接值

型号页给 text/image 输入、text 输出、输入922000及输出128000；所选 endpoint 的 max_prompt_tokens/max_completion_tokens 与之相等，没有使用总窗口相减。OpenRouter parent architecture 另列 file，但 file 不是项目模态，不据此增加第五种模态。此声明不证明实际媒体字节路径已实现或通过认证。来源见[文档及 endpoint](evidence.md#第一方刷新)。

## 所选 route 的价格保留字符串及覆盖阈值

精确 tag=openai 的 pricing 为 prompt=`0.000002`、completion=`0.00001`、input_cache_read=`0.0000002`、input_cache_write=`0.0000025`，web_search=`0.01`、discount=0。overrides 含 min_prompt_tokens=272000、prompt=`0.000004`、completion=`0.000015`、input_cache_read=`0.0000004`、input_cache_write=`0.000005`。这是目录价格，不是实际扣费；完整 pricing 和全部 endpoint 原件在包内。不用相邻 flex/fast 价格，也不推断阈值等号时真实计费规则。来源见[endpoint](evidence.md#第一方刷新)。

## 逐图字节上限仍未取得

官方 images-vision 的 Image input requirements 只给总请求512MB、每请求1500张图，以及缩放规则后每图30000 patches。此次已查位置没有逐图 byte ceiling 或明文无 byte 限制声明。总量、图数与 patch 数不能直接换成 maxImageBytes；未查到不是不存在。当前 profile3 S-9 的缺席含义为对此无限制，因此空 inputConstraints 不是这项未知的合法替身。来源见[文档](evidence.md#第一方刷新)。

## 采样与函数调用都具有跨项条件

GPT6 guide 明文 reasoning effort 非none 时去掉 temperature/top_p；Sol型号页明文 Chat Completions function calling 仅 reasoning_effort=none。这是原生文档声明，OpenRouter endpoint supported_parameters 没有逐条件承诺或证明桥接替调用者处理了这些条件。

当前 per-parameter 规则只能看单项值。相同 temperature=1 在 effort=none 与 effort=high 下具有不同原生适用性；同一非空 tools 在none与high下也有不同原生适用性。声明无条件pass不能忠实表达它们；声明无条件drop又是本项目供给处置选择，不是原生模型没有能力的事实。生产采用固定 chat-completions，不据此改协议。资料变化或后续桥接实测会触发复核。来源见[文档](evidence.md#第一方刷新)。

## 参数名、自动缓存声明与实际命中分别保留

所选 endpoint supported_parameters 列 reasoning/include_reasoning/seed/max_tokens/response_format/structured_outputs/tools/tool_choice/reasoning_effort。未列 temperature/top_p/stop/frequency_penalty/presence_penalty，不据缺名证明不支持。Sol原生 effort 含none/low/medium/high/xhigh/max，核心域只是其中none/low/medium/high/max；没有采纳xhigh新核心值。seed精确路由全域、stop数组长度、私有JSON形状与条件仍未闭合；不填任意pass。

所选 endpoint supports_implicit_caching=false 与既有自动缓存文档、历史研究暖读是不同层事实。此次没有 POST、实际命中、TTL到期或媒体执行；这些不由声明或受控抓线补pass。沿旧研究[首两个固定route复核](../model-request-adaptation/reports/2026-09-27-first-two-openai-routes.md)读取其原范围，不重写旧结果。

本次不选择official供给政策、不变更规格或提供者映射。实际完整定义、configuration revision、profile/binding及当前生产认证均未产生。
