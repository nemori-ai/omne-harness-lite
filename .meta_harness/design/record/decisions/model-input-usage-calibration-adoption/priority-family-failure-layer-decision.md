# D-107 后继：PF-N1 失败层次的精确采用

2026-09-29，主线技术验收者在用户持续实施与技术验收授权内，接受[澄清 revision 1](../../../realization/packages/model/pi-ai-transport/priority-family-failure-layer-clarification.md)，精确 SHA256 为 `378c00638fefff7aacec3a5a0ba138e5430be8afe6145a225e1d484bfdc06049`。来源与[两项独立评审](../../proposals/model-input-usage-calibration/priority-family-failure-layer-review.md)均已回读；评审对本范围无阻断，不代表实际行为验收。

本次仅澄清[优先两家采用](priority-family-decision.md)及其摘要中 PF-N1 的层次：贡献不可得先按现行 RT10/RT11 规则尝试 full，full 仍不可判则规划返回 invalidInput/input_size_unavailable；禁止把合法变参解释为 malformed 或签名损坏。保留统一 planner，不增厂商条件、失败枚举、契约版本或冻结资源；其余 O、来源、前缀、缓存及限制优先级不变。

先前摘要的 “must not become invalidInput” 按本次明确限定于贡献层，不再作为禁止现有规划限额失败类别的依据；原记录不改写。必须分别执行贡献、全量回退、public/service 零发送和真实坏来源反控。此次接受释放准确分层测试，不追认任何失败为通过，不接受源码整体或逐模型生产认证。
