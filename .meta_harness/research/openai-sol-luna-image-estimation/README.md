# Sol/Luna 图片估算的有限实测

本包调查四个精确 OpenAI 模型经 OpenRouter 固定 `openai` 路由时，公开图片输入、研究代理预测与实际响应计量之间的关系。

- 对象：`openai/gpt-6-sol`、`openai/gpt-6-luna` 及对应 `-pro`；研究 binding `image-range-pilot-2`。
- 基线：2026-09-29，基础型号源 `cd55df171f9b3529a72677fed8422544abaadcf2`，Pro 源 `be316078`（完整 SHA 在逐请求 manifest）。
- 消费者：`pi-ai-transport` 的 Sol/Luna 图片估算及逐型号认证；本包不宣布采用或完整认证。
- 最近核对：2026-09-29，六个基础型号收据、两个 Pro 收据及对应冻结输入。

## 准入核对

这是一项独立的图片适用域调查；先前文字、模式身份与计费范围调查仍归 [GPT-6 续查](../model-request-adaptation/vendor-continuation/openai/README.md)，这里不重写其结论。所有实际样本均为合成 PNG、单次 public 请求、`low` effort；记录不会被提升成全模态、全 effort 或多轮 service 认证。

| 要核对的内容 | 入口 |
| --- | --- |
| 观察、推断与局限 | [研究正文](research.md) |
| 第一方材料和实际执行范围 | [证据记录](evidence.md) |
| 逐请求来源与字节索引 | [provenance.json](provenance.json) |
| 不联网复核收据与费用 | [recompute.py](recompute.py) |

在本目录运行 `sha256sum -c SHA256SUMS`；从任意目录执行 `python3 recompute.py` 的绝对路径可复算计量，脚本不访问网络、凭据或账本。归档源码只为还原当时执行基线，不是可直接生产运行的入口。
