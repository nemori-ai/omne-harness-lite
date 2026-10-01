# Qwen 商业型号完整可见输入代理的事实与误差（2026-09-29）

- 对象：OpenRouter → Alibaba 的 `qwen3.8-max-0902`、`qwen3.8-max-prime`、`qwen3.8-flash`、`qwen3.7-max`、`qwen3.7-plus`、`qwen3.7-flash` 六个精确型号。
- 消费者：`pi-ai-transport` 的 Qwen definition `2`、implementation `mp4-6`，实现提交 `0f1505fd`。本报告记录来源与实现算法的可观测性质，不新增产品政策或接受状态。
- 核对日期：2026-09-29。公开文档读取和离线复算；本轮没有模型请求、真实密钥或正式账本访问。
- 结论：文档确认完整可见历史及工具的输入接口，不能确认六个商业型号的私有 tokenizer 或完整模板。最终 JSON 的公开 tokenizer 代理可完整覆盖这些可见字段，但仍会高估或低估，未有多轮误差界或 MaxPrime 实测误差。

## 原始证据与取得方式

原始材料集中在 [独立证据包](visible-full-surrogate-2026-09-29/manifest.json)，原始字节用 gzip 无损封装（避免把上游空白当作源码格式问题重写），归档文件 SHA 见 [SHA256SUMS](visible-full-surrogate-2026-09-29/SHA256SUMS)。包内区分浏览工具抽取文本、HTTP 正文、冻结旧请求与离线复算结果。

早期直接下载工作流曾遇到 HTTP 403，但没有保留完整失败响应；它只能作为取得过程的限制，不能据此断言某个来源不可达。早期浏览工具读取成功；两个 `browser-extract` 文件是工具返回的抽取文本，含工具行号和引用元数据，**不是原站 HTTP 字节**。归档时另运行包内 `capture.py`，三个 URL 均返回 HTTP 200；独立响应正文、时间、最终 URL、状态、字节数和 SHA 保存在 [http-capture.json](visible-full-surrogate-2026-09-29/http-capture.json)。这次成功不改写此前失败记录。

## 第一方可见事实

1. [Alibaba 的 OpenAI-compatible Chat API](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions) 定义有序 `messages`，涵盖 system、user、assistant、tool；工具调用与结果通过 ID 关联。历史 assistant 可包含工具参数；文档描述 `preserve_thinking` 与历史 `reasoning_content`。这些是 Alibaba API 接口事实，不证明 OpenRouter 逐字段转换或私有 framing 恒定。
2. [OpenRouter 的 MaxPrime 精确型号页](https://openrouter.ai/qwen/qwen3.8-max-prime) 将它描述为 Max 的高吞吐变体及独立 SKU，并声明工具和推理等能力。这支持血缘和公开接口观察，不能证明两个型号具有相同 tokenizer、缓存或内部计数。
3. [固定版本 Qwen 模型卡](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/207bd685a7e3696cfaff12ded7c6a7ea0f88c996/README.md) 描述 Max 在公开 2.4T 基础上的扩展。采用的公开 tokenizer 文件 SHA 为 `0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3`。模型卡和已有五型号单轮样本提供代理关联依据；没有在这些来源中找到六商业型号完整私有模板或逐块精确计数方法。

这些来源均为厂商或路由提供方自述。未将文档缺失提升为“上游不可能提供”；本轮也没有独立测得商业模型内部 tokenizer 身份。

## 实现代理的判断与适用域

当前实现将已验证的完整最终请求 JSON 作为文本代理，用上述固定 tokenizer 编码，关闭自动 special-token 插入。历史、角色、工具 schema、调用参数与结果、明文推理、协议及缓存字段均留在代理内；没有复用旧单 user 算法的 `+51` 或 `0` 偏移。六型号分别绑定 `${exact-model-name}-final-visible-json-proxy-1`，共同使用一个实现。两个公开 Qwen 型号不属于这次算法替换。

这里的推论只到“这些可见字段被送入同一确定的代理函数”。JSON 标点与控制字段不等于模型实际 prompt，商业模板和历史推理保留规则可能不同；不能把全部 JSON 被编码等同于实际 token 全数准确计算。估算仍标记 `estimated`，共享层继续使用调用者配置的余量，上游 usage 原值不被估算替换。

此算法只提供 full；非空新增不具有校准后的增量等价性。图片、视频、加密或未知推理块、未识别字段没有这个计量依据，返回 unavailable。全量编码的工作量随请求可见输入增长，本轮没有性能测量，也不声称解决百万 token 上下文的增量成本。

## 冻结旧输入的新算法离线残差

证据包保留五型号的 20 个旧请求原始字节及对应 golden。`reevaluate.mjs` 在编码前逐个校验旧文件 SHA，重新运行当前 meter；比较对象仍是旧 golden 的上游 input usage，**没有新网络请求**。结果见 [residuals.json](visible-full-surrogate-2026-09-29/residuals.json)。残差定义为新代理预测减旧上游 input usage，尚未应用调用者余量。

| 型号 | 四个旧输入的残差 | 这组观察的局限 |
| --- | --- | --- |
| Qwen3.8-Max-0902 | −5、−5、−4、−4 | 曾采用的四个单 user 样本，不是新多轮 holdout |
| Qwen3.8-Flash | +1、+1、+2、+2 | 同上 |
| Qwen3.7-Max | +52、+52、+53、+53 | 同上 |
| Qwen3.7-Plus | +52、+52、+53、+53 | 同上 |
| Qwen3.7-Flash | +52、+52、+53、+53 | 同上 |
| Qwen3.8-MaxPrime | 未知 | 没有独立的旧 actual 样本 |

负残差直接否定“该代理天然是保守上界”。其他样本的正残差也不能构成全域上界；增加消息、工具或改语言会改变私有 framing 与代理 JSON 的差异。旧研究中的 fit/holdout 标签属于当时的算法和样本选择，本次没有把它们重命名为新算法的独立 holdout。

在实现提交 `0f1505fd` 的构建后，从仓库根复算：

```sh
node .meta_harness/research/model-request-adaptation/vendor-continuation/qwen/visible-full-surrogate-2026-09-29/reevaluate.mjs
```

输出为同目录 `recomputed-residuals.json`，不覆盖归档结果。脚本使用构建后的当前实现；算法或 binding 变化会使它拒绝或产生不同结果，不能静默视为本轮证据。

## 当前验证层次与未知

本批作者验证包括 67 个定向用例及六型号 12 个实际 Cordis/SQLite/JSONL/本机 TLS service 用例，覆盖正常三轮及超限零 HTTP。它们支持本地完整可见历史、工具与提醒的保留，以及 full-only 行为；合成上游 usage 不证明真实模型误差、cache 命中或付费认证。

真实多轮残差、完整工具历史独立 holdout、MaxPrime actual 和各型号完整适用认证门仍待 root 使用当前 binding 执行。单轮旧结果不能补这些门；服务的后续请求必须消费真实前轮输出。实际 provider、历史推理保留、请求投影或 tokenizer 的变化都可能使本轮的代理关联失效，需按新输入重新观察。

本报告不取代现行规格，不修改历史研究的结论；新代理是已有允许估算与可配置余量边界内的实现选择。源码集成、真实认证和最终接受分别由主线记录。
