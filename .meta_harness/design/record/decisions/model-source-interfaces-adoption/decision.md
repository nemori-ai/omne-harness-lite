# D-077 模型输入源接口补充采用

2026-09-27，主线在用户已授权完整纵线实施范围内，技术采用 [读取链提案](../../proposals/model-request-adaptation/read-projection.md) 的来源保证补充：[EIS source interfaces revision 1](../../../realization/packages/assets/evaluation-input-store/v3-source-interfaces.md)，精确输入字节及采用状态见 [adoption.json](adoption.json)。不修改已发布 AM3/AE4/AR3、D-074 原设计或服务身份。

独立 architecture-reviewer `core_projection_review` 和 spec-reviewer `binding_batch_spec_review` 已按同一 SHA 完成有限复审，无新增阻断；两者保留 SI-G1 原装配公共来源认回与 SI-G2 旧格式接续的 owner 责任，未运行实际接口验收。

采用完整可信 `{capability,meta}` 部署项，以兑现 AM3 S-20 出厂锁 iff meta：构造时复制固定、发布同单元重核完整 factory，即使本批不替换出厂层，读取也核 head 与实际持有。旧裸清单明确拒绝，不从锁位倒推 meta、不补 false。当前尚未上线；验收初始化新库，已有施工库保持原件，只有部署 owner 带真实完整部署项显式重发布后才可采用。没有兼容或静默迁移承诺。此限定关闭本轮 SI-G2 的选择，实际拒绝和重发布行为仍待验证。

采用独立受限 `./registry-inputs` 窄闭包，与 runtime S-66 当前选根面分开。固定 rootSource 必须来自 registry 核实的同会话原完整 fill，正文由 EIS 真读不可变版本；reload 当前角色、refresh 捕获角色，二者另核当前有效资格。同一 SQL atomic 读取事实，结束事务后复用公开 AD/selector/evaluate。实际 C16 与真实所选根不等共同支持 rootSourceMismatch；其他请求、来源、求值失败与缺陷保持分类。

**SI-G1 仍开着**：registry owner 尚须实现公开原 fill 来源定位，覆盖重启/重新 fill/并发；缺来源不调用此面，不能借 creation 或最近 E 猜原根。受限 import/转导出/路径别名守卫须先形成并通过负控，再由消费者接线；本决定不允许 runtime、模型 adapter 或工具获得固定根读取面。

采用只补技术投影；源码、SI-V1～8、真实 OS/SQL 故障与独立验收另外执行。原读组件的 17 项局部真实 IO 测试不作为新增面通过证据。PG、workspace、分享、MCP 完整来源仍不在本轮支持范围；D-074 其余部分保持有效，人的总体签收尚未发生。
