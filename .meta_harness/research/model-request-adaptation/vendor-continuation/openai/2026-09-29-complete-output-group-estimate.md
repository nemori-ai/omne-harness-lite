# GPT-5.6 完整输出组估算的适用依据

2026-09-29；调查对象仅 `openai/gpt-5.6-sol`、`openai/gpt-5.6-terra`、`openai/gpt-5.6-luna` 三个非 Pro 型号，经固定 OpenRouter `openai` 路由。消费者是 transport v13 H13-P3 的 full／φ／δ 家族贡献映射。本文记录已有单组 `O + 0` 估算向多个完整组组合时的事实、假设和有限适用账本；它不是新精确保证或型号认证。

## 第一方事实及未证明之处

[OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) 的 reasoning context 段说明 GPT-5.6 家族默认 `all_turns`，reasoning items 仍是不透明的；输出 token 计量包括 reasoning。2026-09-29 经 OpenAI Docs 工具重新获取全文；原已归档[工具载荷](../../../openai-sol-luna-image-estimation/evidence/first-party/reasoning-tool.json)保留同页资料（工具抽取，不是原站 HTTP 字节；SHA 在该包索引）。本次重新抓取与该归档的全文抽取内容逐字一致，UTF-8 SHA256 为 `b07e36d53d0bcf5674b4f2220fc541aed073c489a7742dd9aa65ac1191be8982`。本次正文把有来源的默认行为与未验证的实际有效模式区分。

本项目原 `estimateOpenAi56Replay` 以完整、不变、同一 assistant 消息中的输出组为单位，用上游 `output_tokens` 作为一次输入回放贡献，标记 estimated，净封装修正固定为实验假设 0。`O` 已含 reasoning，不再加 `reasoning_tokens`；同组 text/tool 内容也被覆盖。该算法不把密文长度或摘要长度当作隐藏推理长度。它有公开文档的相关性依据，但文档没有证明 OpenRouter 私有输入封装与输出计量相等。

若多组各自保持这些前提，把各组独立估算贡献放入 full 或 δ 是同一个估算的有限组合假设。误差可能随组数累积；一个三轮实测的总残差不能区分组修正、JSON 边界或 tokenizer 误差，也不能外推误差上界。没有在本文从实际残差拟合任何数字。

## 待验证代理的实验坐标

以下表格标识本次实验的有限源／目标坐标，便于复跑与定位结果，**不是模型发布注册表或旧工厂接受规则**。实验逐一考察上述三个精确 modelId，未把跨型号组纳入正向假设：

| 原贡献 | 目标贡献 | 说明 |
| --- | --- | --- |
| definition `6` / `pi-ai:openai/mp4-12` | definition `7` / `pi-ai:openai/mp4-16` | 解释已保存的完整输出事实；原 image/full JSON 与 output O 的来源不因后继组合实现而被改写 |
| definition `7` / `pi-ai:openai/mp4-16` | 同一精确当前贡献 | 后继请求继续消费同规则输出事实 |

原 revision 6 的完整计量基准是 `openai-gpt-5.6-o200k-base-complete-output-6/response-calibration-1`、tokenizer `tokenizer-basis/openai-gpt-5.6-o200k-base-complete-output-6`、replay `openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/1`。目标 revision 7 的完整算法为 `openai-gpt-5.6-o200k-base-complete-output-history-7/response-calibration-1`，tokenizer 仍明确沿原 o200k basis，replay 为 `openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2`。两者投影为 `openrouter-input-projection/2`、transform 为 `openrouter-wire/2`。未知算法、变更 transform、其他 projection 和其他 binding 不在此账本内。

本实验的正向样本条件为：原 `requestInput` known 时完整 basis 匹配对应行；它 unavailable 时由合法组的原 `origin.adaptation/provider/parameters` 指向同一有限原 binding，没有用当前请求补造原来源。原 observedInput 缺失与已知 O 分开观察；原 usage 来自 upstream，O 已知非负，reasoning 若有不超过 O。原组为 reply、complete，完整输出块按原顺序选入同一目标 assistant，且与实际最终投影对应。这些是验证代理的样本条件，数据合法性与实现义务仍以已接受契约为准。

映射假设只讨论 omitted context 的现有公开 wire；未知 mode 或额外 reasoning context 结构不能进入此假设。实验的原／目标 reasoning effort 取自已供给的 `{none,low,medium,high,max}` 或未指定域。当前与原 provider 均为 openai，目标 wire 固定单 provider、无 fallback、require_parameters；若原响应明确给 servingProvider/upstreamModel，正向样本要求其相符。该范围不推断 Pro、GPT-6、跨型号或部分历史的可转换性。

## 本次实验的组合假设与负控设计

- 待测组合假设为多个完整组各计一次 O；含完整加密组的 assistant 单元从**计量副本**整体替换，实际 wire 不变。不仅删 ciphertext 后再对同组 text/tool 计一次。
- full 仍覆盖所有未被 O 覆盖的当前可见输入；δ 只消费分配给 N 的实际单位，P 不再次分词；φ 沿同一个组贡献函数。共享区域分配仍由既有 v13 负责，本实验不改变该共享分配。
- 部分选择、缺原来源、重复目标、跨区、不完整组、未知 O、跨型号和账本外 basis 列入负控设计；观察非法源关系是否保持既有 invalidInput 与 full/unavailable 区分。
- 独立数值 oracle 检验 full = 剩余可见 full + ΣO、δ = 剩余可见净新增 + ΣO、φ = O；margin 最终只施一次。三轮本机 TLS 验证组来源及持久历史；这不证明真实上游零封装修正。

采用边界由已接受 D-101、D-107 及 transport v13 所有；本文不另立决定。没有实际 full/δ 多组 holdout 因本文而成为已执行。上游默认 context、模型身份、原输出计费口径或 transform 变化时，上述相关性和账本都需要复核。
