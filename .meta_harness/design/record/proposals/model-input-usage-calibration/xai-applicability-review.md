# xAI 完整输出贡献：独立架构评审

2026-09-29。只读 architecture-reviewer，范围仅 xAI 两叶窄适用性，不包括 ACK，不执行测试或付费调用。最终采用仍归主线。

最终基线 `646497612780eaac10496e4e7984abe7fa5ba5c9`：[提供者 revision 2](../../../realization/packages/model/pi-ai-transport/xai-complete-output-applicability-candidate.md) SHA256 `45dd429509aae878d794bc01d19617de590d6ae1f9c4ec61b1a3710bcb644fde`；[选择附页](xai-applicability-choice.md) SHA256 `c1210c0154f55a015aa5ac77b43f1ad39d3c219ff22fe48d4f3d1109d21f2a70`。

## 结论

本次范围未发现阻断、无新增非阻断架构发现或产品待裁。r1 把原/当前 effort 相等作为 full 可估前提，缺少原生签名绑定依据，且混淆 RT10 S77–79 的输入锚失效与独立 O 贡献；r2 分别校验合法 effort，合法变化使 I/φ 失效而 full 可重新核源解释原 O，X1/X4 承接反例，已关闭该实质风险。

O 整组一次 estimated、reasoning 不双加、非法来源先拒绝、未知算法/身份保持 unavailable 的保护点成立于设计层。V3 definition/implementation/algorithm/tokenizer surrogate/replay 已静态核固定源码 `53114347` 一致。原事实有限解释不是旧执行兼容。无须新增公共协议、遍历器或状态模型。

## 未覆盖与改票条件

V4 原工厂逐字段和 V5 实际导出、真实 public/service 三轮及误差未验证；X1/X5 是实施门。真实 upstreamModel/servingProvider 精确映射原件尚缺，不以候选表认证。765/image 不覆盖当前全部图片域，单列缺口。

最强反方：尚无真实密文二轮差分或经验误差；Grok Build 官方结构化估算若证实适用路由，可能优于 aggregate O；缺 O/partial/未知来源继续拒绝比猜测安全。本选择必须保留这些失败。零 framing 和 O 代理弱点公开，若系统偏差不可接受、原样 replay 被拒绝或新证据显示 effort/prefix 绑定，重新比较贡献策略。责任划分置信度高，实际数值准确性与 replay 成功率未判定。

## 当前实现反例的适用性

shared owner 在固定源码 `4945160721f12ecfed0ed4c3be6d557b575e2a92` 的受控本机 TLS 路径确认：mp4-18 第一轮 high+tool 为一次 HTTP complete；第二轮携真实第一轮完整输出组、tool_result、新 user，发前 input_size_unavailable，未发第二次 HTTP。原 `response-1.json` SHA256 `8f079e950508da26a7ede03ebc6316b8861661fa5b2362a6ff265837ff827ac6`，`wire-1.json` SHA256 `284fd691f7f8f1e9f5fe5f2b5b4868d6e01a474cfdc5d899d524a63a3f6531b1`。实际 counter 保留 reasoning_details 为 unavailable，仅删除该字段才 estimated1462；删除不是合法修复。本候选完整组贡献直接覆盖此失败类型，仍须实施后保留全部字段验证。该受控响应里的 x-ai/grok-4.7/xAI 不能冒真实上游身份映射认证；未复制大 payload 或私有密文到设计。
