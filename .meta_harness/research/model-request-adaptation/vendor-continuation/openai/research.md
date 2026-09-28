# 当前读数

## 结论

六个 GPT-6 首样本只覆盖固定 OpenAI 路由、`low` effort、三条文字消息与 `max_tokens:16`。它们没有证明 GPT-6 使用 `o200k_base`，也没有给出任何通用误差上界。把各型号的用量除以完整 JSON 的 tokenizer 长度后取最大比值，会混合型号、输入文本和 Pro 执行模式；这一比值不能解释为共同的 tokenizer 比率。

下表逐 text block 单独使用 `js-tiktoken` 的 `o200k_base` 求和。这是一个可复现的文本代理特征，不是模型 tokenizer 身份声明。实际值直接取原始 OpenRouter usage。

| 精确型号（`openai/` 前缀省略） | 文本代理特征 | prompt_tokens | 差值 | completion_tokens |
| ------------------------------ | -----------: | ------------: | ---: | ----------------: |
| gpt-6-astra                    |           25 |            39 |   14 |                 5 |
| gpt-6-astra-pro                |           27 |          1561 | 1534 |                29 |
| gpt-6-sol                      |           29 |            43 |   14 |                 9 |
| gpt-6-sol-pro                  |           29 |          1514 | 1485 |                33 |
| gpt-6-luna                     |           32 |            46 |   14 |                12 |
| gpt-6-luna-pro                 |           31 |          1524 | 1493 |                37 |

三个普通型号的差值相等只是三个独立单点。未对同一型号改变输入长度，无法区分固定 framing、词表误差和输入相关误差。Pro 差值并不恒定；三个 Pro completion 用量还超过请求中的 16。这里记录的是实际计费用量，不能据此宣布上游忽略了输出上限或把差值当作上下文固定开销。

## 第一方事实及推断边界

OpenRouter 的 GPT-6 migration guide 明确列出三个 `-pro` slug 与相应基础模型的 Pro 模式关系；Astra Pro 型号页也直接确认这一对应。OpenAI 的 reasoning guide 说明 Pro 模式会汇总生成最终答案所做的模型工作，并按 token 计费。**已确认的是模式身份与原生计费叙述**；这可以解释为何需要警惕聚合用量，但没有证明此次 OpenRouter usage 的内部拆分，更没有证明计费用量等于单次 context 占用。

OpenAI token-counting guide 说明请求结构、工具、媒体和模型行为都会使本地纯文本 tokenizer 计数不足。原生 Responses 计数端点不是本项目的 OpenRouter 出口；本次未调用它，也没有据此增设原生网络依赖。

## 未知与失效条件

- 所有六个 GPT-6 的精确 tokenizer、Pro 内部计费用量与上下文占用对应关系仍未知。
- 图片留出样本已发生 provider 错误而没有可用 usage；工具留出未发送。二者不算零 token、不算模型失败能力，也不能补足本次六个文字点。
- 本轮尚无新增付费样本；后续长度差分与 CJK/code 留出仍待执行。即使差分吻合，也只支持该固定消息结构、effort 与所测文字范围内的估算观察。
- 上游模型、路由转换、Pro 模式计量或 tokenizer 版本改变时，上述数值不自动有效。没有模型完整 public/service 认证因本报告升级。
