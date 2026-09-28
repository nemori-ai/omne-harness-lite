# 八家模型输入计量：公开来源与离线复现

核对日期：2026-09-28。调查基线 `1b2a6a0b3236281f270aaf354457cf70177eceae`，主线复现于 `d41238f479eba8b231472a0e715c412b163a882d`。对象是当前 37 个精确模型定义及选定 route；本报告给事实与约束，不接受新的计量器或更改规格。

## 结论

**新版 Claude 有比旧 BPE 更有针对性证据的社区文本计数候选，但本轮没有找到已验证的四个精确型号完整 OpenRouter 请求计数器。** `ctok` 重建新版文本计数；主线重跑 66 项作者历史代码样本全部相等。其接口与样本不覆盖完整多轮、system、工具和图片请求，Opus 5.5、Fable 5.1 也仍有精确版本缺口。不能把作者样本复现称作当前上游真值校验。[固定 ctok 说明](https://github.com/sanderland/ctok/blob/8c43ffd3c7be467622a540f025516e49ef78d8b1/README.md)

**pi、OpenCode 没有隐藏的新版 Claude 精确 tokenizer。** 核对的 pi 文本公式为字符数除四向上取整，并可用适用的历史 usage 加新增尾部估算；OpenCode 基础公式为字符数除四四舍五入。调用路径中还有实际 usage 的使用，不能把两种数据混为同一种计量。本文按官方仓库将用户所说的 “opencoder” 解释为 OpenCode。[pi 固定源码](https://github.com/badlogic/pi-mono/blob/c1449660c83fd00a7c71d5f7e1bd29fafd400550/packages/ai/src/utils/estimate.ts)、[OpenCode 固定源码](https://github.com/anomalyco/opencode/blob/3c893f0a166cfc433819b4eff65d2e6c7696a1c9/packages/core/src/util/token.ts)

其他厂商的差别也不能由一个 BPE 或字符比例消除：公开词表、请求模板、媒体处理和 OpenRouter 转换分别影响输入数。整份 HTTP JSON 的 token 数不是模型内部输入数；generation 参数、JSON 排版变化也会改变前者。本轮反例只说明二者不可直接等同，不给出真实请求误差率。

## 八家逐项读数

下表的“现状”指调查基线随包提供的 meter，不限制消费者注入的实现。共 12 个文本绑定（2 DeepSeek、6 OpenAI、4 Anthropic），不是 12 项精度认证。

| 厂商／本次模型数 | 当前随包计量与更精细来源 | 仍不能得出的结论 |
| --- | --- | --- |
| Anthropic／4 | 当前完整 JSON 经旧 Claude BPE，声明 estimated，图片 unavailable。官方旧库已声明 Claude 3 起不准确；`ctok` 有新版重建及历史样本。官方 count_tokens 按模型处理结构化请求，仍称 estimate。 | `ctok` 单 user 文本计数不能直接覆盖 tools、多轮、thinking、图像；官方 API 需要 Anthropic 凭据，未验证其输入与 OR 转换一致。 |
| OpenAI／12 | 6 个 GPT-5.6 文本绑定用 o200k；固定 tiktoken 对这些名称只走前缀匹配，虚构同前缀型号也匹配；6 个 GPT-6 名称全部 KeyError。官方 Responses 有 input_tokens 计数 API。 | 名称前缀回退不能证明精确型号词表；Responses 计数不能直接等同 OR Chat Completions 的实际输入。 |
| Google／2 | 没有随包本家 meter。固定 python-genai 的本地 loader 拒绝 Gemini 3.7/3.8 Flash；Cloud CountTokens 列表明确覆盖两者，Developer API 示例使用 3.8。 | 不能把旧 Gemini 到 Gemma tokenizer 的映射外推；Cloud 支持不等于当前 google-ai-studio route 已认证。 |
| xAI／2 | 没有随包本家 meter。官方 TokenizeText 文档提供 Grok 4.7 文本示例；它接受文本。 | 不能据此计完消息模板、工具和媒体，也没有本次 Grok 4.6 成功请求；旧公开 Grok 词表不证明当前型号一致。 |
| DeepSeek／2 | 已有专用 tokenizer／encoder 估算；Pro-0813 找到更精确版本的公开 encoder。Flash 公开 image processor 根据尺寸计算 image span，比当前逐图固定 allowance 描述更细。 | 当前 Pro 仅供 low/none，不能把新 high/max 前缀差异冒充当前缺陷；图片参考处理与 DeepInfra serving 的等值未验证。 |
| Qwen／8 | 没有随包本家 meter。两个公开叶子 3.8-2.4T-A95B、3.8-27B 有固定 tokenizer／模板；其他六个商业叶子未确认对应公开版本。 | 商业 Max 增加非思考、视觉等能力，不能直接用公开 2.4T 替代；公开模板拒绝 high，而 OR 枚举有 high/max，映射需另外核验。 |
| Moonshot／2 | 没有随包本家 meter。K3、K2.7 Code 有对应公开编码资料；官方 estimate-token-count 明确列出两者。 | 同词表不表示 XTML／Jinja／工具声明相同；官方接口需要 Moonshot 凭据，未验证 OR 等值。 |
| ZAI／5 | 没有随包本家 meter。GLM 5.3、5.3 Flash、5.2 有对应公开资料；Prime、FlashX 的版本映射未知。 | 本次取得 tokenizer API schema 只列旧 4.x，不能证明 5.x 可用，也不证明未文档化支持不存在。 |

主要第一方出处：[Anthropic 官方计量](https://platform.claude.com/docs/en/build-with-claude/token-counting)、[旧 Claude tokenizer](https://github.com/anthropics/anthropic-tokenizer-typescript/tree/4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b)、[tiktoken 固定映射](https://github.com/openai/tiktoken/blob/4e71bbe0c078468e00fefbf94b39849389f346e5/tiktoken/model.py)、[OpenAI 计量](https://developers.openai.com/api/docs/guides/token-counting)、[Google 固定 loader](https://github.com/googleapis/python-genai/blob/6d012889752f65c1a51d0ad6e5970fc97d19c4ca/google/genai/_local_tokenizer_loader.py)、[Cloud 支持列表](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/count-tokens)、[Google Developer API](https://ai.google.dev/api/tokens)、[xAI TokenizeText](https://docs.x.ai/developers/grpc-api-reference/tokenize)。

开放模型主要出处：[DeepSeek Pro-0813 encoder](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813/blob/72e1d3230f6c080a530b0a1d46f8eb4602340597/encoding/encoding_dsv4.py)、[Flash image processor](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/dba1be0a40aa45a94ad051997016db3960a90277/inference/image_processor.py)、[Qwen 商业变体说明](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/207bd685a7e3696cfaff12ded7c6a7ea0f88c996/README.md)、[Moonshot 计量](https://platform.kimi.ai/docs/api/estimate)、[ZAI OpenAPI](https://docs.z.ai/openapi.json)。逐叶型号、provider、源码 commit 和许可原文位置保存在归档三个 report 中；未下载的大词表仅有上游对象摘要，不冒充主线重新计算的摘要。

## 真正复现了什么

[证据归档](../input-meter-research-2026-09-28.tar.gz)包括三路原稿、固定源码／来源清单、探针及作者结果；`root/` 保存主线在 HUB 独立环境重跑的结果。

- **Claude**：22 份代码 × 3 组作者记录的 Claude 4.5／4.7／Opus 5 计数，66/66 一致；另五条合成文本的四个 ctok 版本、旧 BPE、pi/OpenCode 公式数值与作者产物一致。合成文本没有 API 真值；其中 JSON 是作为文本输入，不是结构化请求计量。`ctok` README 明示 Opus 5 尾部空格和 5.5 的差值未建模，Fable 5.1 没有本次独立样本。
- **OpenAI／Google**：固定源码的名称映射函数通过 AST 抽取执行，结果与作者完全一致；没有启动完整 SDK。o200k 对同一消息的整 JSON，在最小请求、增加 generation 参数、只改排版三个样例分别为 28、40、44。这个差异不提供模型真实 token 数。
- **公开模型**：24 个 Jinja 选项用例、4 个 DeepSeek 版本／effort 对比及 K3 结构／正文特殊 token 区分断言均复现；记录的是渲染文本和 UTF-8 字节，未执行大词表分词。
- **DeepSeek 图片**：固定公开配置及五个纯数学函数的 AST 探针复现；544×544、1024×1024、1920×1080 分别得到 184、652、968 个参考 image span tokens。没有图像解码、方向处理、网络图片加载或 OR 请求，不称实际 serving 真值或保守上界。

主线环境 Python 3.12.13、regex 2026.9.10、tiktoken 0.12.0、Node 24.18.0、js-tiktoken 1.0.21；Jinja 沿作者探针使用系统 2.10.1 并补显式简单 helper。依赖安装可联网；探针没有调用厂商服务。首次 Claude 比对漏跑文档中的 JS 第二步，缺少比较字段而失败；执行完整步骤后字段与数值一致，未发现计数分叉。耗时字段不比较，也不作为性能基准。

## 约束、代价及剩余未知

官方计数接口需要各自凭据和请求格式，增加独立网络、限流及失败点；这次没有调用它们。Anthropic API 也不预测缓存命中。三路重叠的 OpenRouter 文档检索只算一个观察：在读取的公开接口／索引中没有找到适用的统一预发计数端点，**不是接口不存在的证明**。原始下载 403 与浏览工具可读分开记录；浏览摘取没有原始 HTTP body 摘要。

公开 tokenizer 的可用性还受模板、特殊 token 权限、媒体处理、许可和版本维护影响。同词表的家族也可能使用不同请求编码。部分模型仓的许可包含自定义条款，不能把 SDK 的 MIT／Apache 许可套给整个模型资料；本报告没有作项目采用裁决。

历史 usage 可提供已发前缀的反馈；改模型／route／前缀、增加工具结果或改变 reasoning 保留规则后，不能无条件复用。社区 issue 只作为作者报告的失败线索，未复现的不作为固定 HEAD 缺陷。三路原稿的次级社区、许可适用性和其他未亲核事实在[证据索引](../evidence.md#2026-09-28-输入计量来源与离线复现)明确保留转述等级。

本轮没有当前精确路由的误差分布，没有实际多模态计量认证，没有新计量器实施；公共调用和 service 的 37 模型认证数字不因本研究增加。待补证据是每个精确 route 对中英、代码、system／tools、多轮 reasoning、声明媒体形态的可比较上游读数，以及公开编码和 OR 转换之间的差异。
