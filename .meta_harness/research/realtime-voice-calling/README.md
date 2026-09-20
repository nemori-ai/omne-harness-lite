# 实时语音通话：能力、链路与证据强度

这项调查要区分的是：语音层实际保证什么、整条链路还需要什么、厂商数字的证据强度有多高、
法规现在真正要求什么。当前观察支持「能力边界、计费结构、法规义务」三处硬事实；
不支持任何性能倍数的推广——这块的厂商自测数字普遍缺独立复现。

- 调查对象与基线：OpenAI `gpt-live-1`（2026-09-10 API 发布，知识截止 2025-07-31）为主，
  兼及 Google Gemini 3.8 Live、托管平台（Vapi/Retell/Bland）、开源框架（Pipecat、LiveKit Agents）、
  四套学术评测基准，以及美国 FCC 24-17／加州 AB 2905／EU AI Act Art. 50(1)／中国标识办法。
  全部来源取证日 2026-09-19。
- 消费者：待出现。2026-09-19 由设计者要求调查，面向未来可能的语音交互与电话通道设计；
  尚无提案、决定或提供者设计引用本包。
- 最近核对：2026-09-19 / `gpt-live-1`、Gemini 3.8 Live、FCC 24-17

## 准入核对

调查对象与版本明确，全部结论可回溯到带 URL 与抓取日期的来源，并按五档可信度标注
（一手·直连／一手·经代理／一手·个人经验／二手·利益相关／引用链断裂）。

主要局限：OpenAI 两篇官方长文经第三方反向代理取得，非原始字节；性能数字无任何独立复现；
中文场景查遍多个方向仍无独立实测；本轮未执行任何实际 API 调用或真实通话。

结构选择：本轮证据来自六个需要分别核对的来源域，单个 `evidence.md` 读不动，
按**来源轴**拆出 `notes/`，`evidence.md` 退为索引；本轮论证明显多于收敛后的结论，
按**篇幅轴**留了一份报告原貌；首轮无结论变更，无 `changelog.md`。

## 按当前问题展开

| 当前问题                   | 阅读入口                |
| -------------------------- | ----------------------- |
| 现在应该相信什么           | [研究正文](research.md)（C1–C11） |
| 来源、实验或反例是否可复核 | [证据索引](evidence.md) 与 [notes/](notes/) |
| 本轮当时的完整论证与取证路径 | [2026-09-19 首轮调研](reports/2026-09-19-landscape-and-claim-audit.md) |

按来源域分的证据：[gpt-live.md](notes/gpt-live.md)（模型规格与主张）、
[architecture.md](notes/architecture.md)（架构与轮次控制）、
[platforms.md](notes/platforms.md)（产品版图与自托管）、
[telephony-compliance.md](notes/telephony-compliance.md)（电话接入与法规）、
[evaluation.md](notes/evaluation.md)（评测基准）、
[field-reports.md](notes/field-reports.md)（开发者实测与数字溯源）。

原始日志、源码片段或输入快照有必要时随包保存并从证据记录链接。
