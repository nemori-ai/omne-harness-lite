# 模型请求运行时：pi-ai 传输、D-019 比较门与 minimal-runtime 的落点

D-019 接受了「定向 fork pi-ai 作 OpenRouter 传输」的方向，并列了一道实施时必须逐项对照的比较门。
这项调查要区分三件事：**比较门现在逐项做到了哪**（以未进 main 的 minimal-runtime 为样本）；
**pi-ai 从本仓库钉住的 0.85.1 到 0.86.1 有没有动 D-019 的前提**；
**PF-013 对模型请求运行时的要求**（单独中断、首 token 规则、宿主、三类事实与状态码直通、八个成因、按范围取凭据、模态、逐条成本）
在「pi-ai 传输 + minimal-runtime host」上各落在哪、哪些没有落点。

当前观察支持的：D-019 的两处丢失（实际执行方、实际费用）在 0.86.1 源码里原样存在；pi-ai 默认不做隐藏重试，但不交出结构化状态码、会把非视觉模型的图静默换成占位文本、没有语音与视频类型；
minimal-runtime 的 pi-ai 传输只闭合了非推理文本/工具的正常路径。
**不支持的**：任何关于 OpenRouter 线上行为的结论（本轮没有发任何请求）、0.86.x 发布物的逐字节结论（本机没有）、以及「该怎么设计」——那归 record。

- 调查对象与基线：`@earendil-works/pi-ai@0.86.1`（pi `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`）源码；
  `@earendil-works/pi-ai@0.85.1` 发布物与本仓库补丁（`feat/minimal-runtime@d79484d` 的 `patches/`）；
  `feat/minimal-runtime@d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac` 的 `packages/model/{execution,llm}`（未进 main，只作样本，不是证据链上的实现）；
  DSH `c291e7961a515f6d7af9304e7fd1d257929aef26` 的 `packages/llm/{llm,llm-pi-ai,llm-retry,token-meter}` 与作者笔记。2026-09-23 离线取证。
- 消费者：D-019 的比较门现状补记（2026-09-23）（已落）；本程块 C 的架构读数（待出现）。
- 最近核对：2026-09-23 / 上列版本（首轮）。

## 准入核对

精确对象、归档校验值与取得方式逐条记在[证据记录](evidence.md)。三处限制要随结论一起传下去：

- **全程离线**：没有调用 OpenRouter，没有联网查 issue #8940，没有复跑 minimal-runtime 的测试；实施线台账里的真实请求结果只作线索。
- **0.86.1 只有源码**：差分是 0.85.1 发布物对 0.86.1 源码，只做了 `openai-completions` 一个文件；0.86.1 的 OpenRouter 目录数据是生成物，不在源码归档里。
- **minimal-runtime 是候选实现**：它自述 disposition 与公开帧编码等 round-3，而 round-2、round-3 两稿均被拒；它的形状说明「这样接会遇到什么」，不说明本项目的契约。

PF 条款的引用对照 PF-013 rev 4、PF-009 rev 4、PF-012 rev 7、PF-001 rev 15；这些 topic 升 rev 时要回来复核承载表。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么 | [研究正文](research.md) |
| 来源、行号与取证条件是否可复核 | [证据记录](evidence.md) |
| 比较门逐项表、PF-013 承载表、差分细节、与产品正文的缺口 | [当轮报告](reports/2026-09-23-model-request-transport.md) |

只读研究正文就知道当前该信什么；要逐项核对某一格或还原差分过程时，再展开当轮报告。
