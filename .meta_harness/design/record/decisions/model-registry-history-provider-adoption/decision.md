# D-080 注册表与历史正文提供者增量采用

2026-09-27，主线沿用户已授权完整 model-request-runtime 纵线实施，依据[读取链提案](../../proposals/model-request-adaptation/read-projection.md)、[独立联合复审](../../proposals/model-request-adaptation/review.md#2026-09-27-ar4eis-历史正文联合复审)及 D-079 已接受的 MF4/AR4，技术采用 [AR4 provider](../../../realization/packages/tools/asset-registry/v4-design.md)和 [EIS 历史正文受限面 revision 1](../../../realization/packages/assets/evaluation-input-store/v4-history-source-interfaces.md)。精确输入见 [adoption.json](adoption.json)。既有契约坐标、冻结资源、服务身份与 bindings 不变。

AR 继续拥有七操作、完整 fill 的六表/恰三槽/E/O/assembly/唯一根来源校验，以及报告的 session/run/attempt、H 与 reuse 用途。reload 以 H 条件追加，冲突全套重读重算；refresh 保留 H，不新增末尾头复核。MF 是清单唯一耐久权威，EIS 与 SQL/JSONL 不冒称跨 owner 同提交。

EIS 的独立 ./registry-history 闭包先核真实 STT 租户归属，拒绝分支零 MF IO；再经真实 MF4 readHistory 核实际原表 capability/asset/精确版本；随后 EIS/OG 同 StorageUnit 核当前有效资格并读本机不可变版本，事务真正结束后调用已有 AM3/BodyContracts 纯判定。无需当前仍持有，不重求 C16，不把旧资产注入普通 EvaluationInput。仅可信 app 构造并持有关闭权，registry 借用 read；AST 权限 gate 先于生产消费。

两个 architecture-reviewer 与联合 spec-reviewer 均无阻断，EIS README 顺序摘要 N1 经有限修正复核关闭。真实旧报告、旧资产已不再持有后的成功恢复仍是必交成功路径；正确 unavailable 不能代替交付。HI-V1～9、AR V4-1～15、热换/排空/当前资格竞争与装配观测均待实现，旧 EIS 45 项与 MF 组件测试不代证。

本决定不扩大 workspace/shared/MCP/跨库或完整 PF-004 范围，不新增产品政策或默认许可。人的总体签收尚未发生，生产模型认证仍 0/37。
