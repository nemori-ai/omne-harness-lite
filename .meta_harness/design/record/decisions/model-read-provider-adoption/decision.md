# D-074 模型请求读取依赖的提供者采用

2026-09-27。用户已委托实施完整纵线；依据[读取链提案](../../proposals/model-request-adaptation/read-projection.md)、D-073 的精确契约及独立节点复审，技术采用如下投影。各稿的 SHA-256 与四件套快照见 adoption.json，旧设计和旧验证记录不重标。

| 提供者 | 采用范围 | 独立复审 |
|---|---|---|
| assets/evaluation-input-store rev1 | 五张真实源表；SQLite 同单元读取 OG 当前资格、配方和版本；AE selector→实际 AD 正文→完整 evaluate 准入；第二次纯求值成本显式量测 | architecture-reviewer adaptation_architecture_review 与 spec-reviewer binding_batch_spec_review 无阻断；OG S63 精确引用及 SQL 持锁/排队量测两项非阻断已定点关闭 |
| session/session-tenancy-table rev2 | 原 ST2 单一读服务；公共技术参与读；验收 seed 仅 bootstrap 精确路径与指定测试 | 上述两种独立复审无阻断；结构守卫仍是写入口使用前置 |
| assets/assembly-manifest-store v3 rev2 | 同 ReadTx 固定 head、同会话最近 given/mint，reuse 不回退最新 E；完整结果交公共 AE4 S47 judge | architecture-reviewer adaptation_architecture_review 无阻断；真实 IO 和结果制品消费待验 |
| tools/asset-registry v3 | manifest 唯一物理写入者；真实 C16 失配的依赖 unavailable；不修输入、不报告、不换表；普通二次求值分支保留 | architecture-reviewer adaptation_architecture_review 无阻断；固定根实际来源端口仍须实施 |
| core/loop-extension v4 | 根4采用 MP3/MS4；明确保留 /v3 与冻结 schema3；复用 MS4 单记录 judge | architecture-reviewer core_projection_review 无阻断；跨包消费者精确切换和新值测试待验 |

没有来源的 shared/workspace/MCP 分支整次 unavailable，明确无这些来源的正常配方可实施；不制造空来源。捕获角色用于求值，当前效力与调用许可由真实治理读取分别保证。读取持锁、排队、输入规模及双求值成本须实际测量，不以本决定填数。

这些技术投影不补完整产品会话创建、共享、工作区、MCP/Connector、PG 快照或中心送达。目录取值的 RefA→RefB 旧副本反例仍是阻断，目录和凭据新稿另行评审采用；transport、runtime 和 runner 不在本事件中。模型请求 runtime 尚未完整实现，人的总体签收未发生。
