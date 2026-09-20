# 2026-09-12：需求基础迁移记录

依据：[提案接受记录](../../proposals/requirements-foundation/README.md#接受记录)与
[D-004](../../decisions/D-004-requirements-foundation.md)。工作分支为 `docs/system-goals`，
迁移前仓库基线为 `b017575150b4795e0800f0d2322dd5233520cf51`；本轮此前逐项整理
的 system-goals 正文和来源材料尚在同一工作树，不能声称它们已存在于该提交。

## 语义去向与确认核对

| 迁移前内容或身份 | 当前拥有者与核对范围 |
|---|---|
| 完全动态目标、原文引用、判定量词未决；SYS-DYNAMIC 建模方向 | [SYS-DYNAMIC](../../requirements/system/fully-dynamic-system.md)，两类确认范围分别保留 |
| 超长期待机、稳定运行、持续进化 | [SYS-LONG-RUNNING](../../requirements/system/long-running-and-evolving.md)，没有擅定时长或 SLA |
| 始终与组织或个人利益对齐 | [SYS-ALIGNMENT](../../requirements/system/interest-alignment.md)，含义与达成判断仍未决 |
| 继承并发展既有/已承诺功能、逐项检索授权 | [SYS-CONTINUITY](../../requirements/system/omne-next-continuity.md)，研究 SHA 未升级成全部继承基线 |
| SYS-IDENTITY/KERNEL/SPEC/DEPLOY/TENANT/LLM/EXPERIMENT | [系统约束](../../requirements/system/constraints.md)，保留全部旧身份及确认范围 |
| SYS-REUSE | [组织规则](../organization.md#共享定义)拥有唯一正文 |
| GOV-DECISION、GOV-MODEL | [治理导航](../../architecture/constraints.md#治理与组织依据)引用 D-002/D-004、D-003 |
| 第一项：租户与多组织上下文 | [PF-001](../../requirements/product/user/PF-001-tenant-organization-context.md)，保留多组织归属及数据、权限、行动空间、流程规范四类效用；全局隔离引用 SYS-TENANT |
| 第二项：感知外部变化并响应、行动 | [PF-002.C1](../../requirements/product/environment/PF-002-external-change-response.md#已确认要求)保留直接要求；其余来源补充不混入用户直接确认 |
| 三维框架与主副归属 | [产品索引](../../requirements/product/README.md)，两项唯一主正文、副维度只引用说明 |
| 完全动态原文、历史及产品来源核对 | [动态来源](../../research/fully-dynamic-system/README.md)、[产品来源](../../research/product-feature-sources.md)，归档原件不改字节 |

旧 [system-goals.md](../../system-goals.md) 只保留旧锚点与新路径，当前入口指向
requirements；提案历史链接仍能解析。拆分前后按用户原始要求、来源补充和未决项
逐项比对，产品要求没有因结构迁移被当作已实现能力。

## 既有决定与候选适用性

D-001 的单义归属、规格分类与冻结继续适用；D-004 增加需求所有者。D-002 的来源
和因果复议继续适用；D-004 明确有效需求前提与冲突部分的新工作适用性。没有
撤销两者原选择，故使用补充关系，旧原文不改。D-003 继续适用。

租户、模型与 Agent 核心候选入口已补充需求依据和缺口，均保持 in-review；
未伪造历史版本曾引用新 ID。catalog 和 frozen 仍为空，没有发布业务契约，
当前没有已接受业务设计因此次整理需要撤回。架构页已投影覆盖与未决部分。

## 导航与角色核对

| 代表性任务 | 读取与判断结果 |
|---|---|
| 修复既有文档链接 | docs/AGENTS → 所属正文与 docs-check；不要求新增决定或全套评审 |
| 设计多组织协作边界 | architecture-design → PF-001 与 SYS-TENANT → 候选覆盖；精确 effect 未知保持可见 |
| 新用户要求冲突于旧决定 | 根 AGENTS/skill → 需求维护与知识流转，定位有效前提及冲突范围；不靠架构投影豁免要求 |
| 从产品包直接进入开发 | packages 局部约定仍继承根 AGENTS，需求导航可达；源码归属和公开入口规则未变化 |
| 独立评审候选 | 共享角色要求可识别的需求快照与确认范围，区分覆盖缺陷与输入缺失；不增加写入或接受权 |

以上为主 agent 的文档导航与语义核对，不是独立模型行为测试。architecture-design
通过 skill 静态检查；角色源在暂存位置生成、比较后同步，模型/宿主适配未改，
两端以生成器 `--check` 核对。未重新执行 Claude 模型调用或宿主加载测试。

## 检查与交付证据

实际执行 `make check`：185 份 Markdown 的文档检查通过；规格结构检查通过，
catalog 为 0，Schema 为 9；64 项测试通过，其中新增 14 项需求结构场景。
TLA+/Alloy 执行任务为 0，明确报告 UNCOVERED，本次不声称完成产品形式验证。
`git diff --check`、architecture-design 的 skill 静态验证、角色双端生成器 `--check`
均通过。完全动态归档的 SHA256SUMS 六项均通过。

新增场景覆盖身份重复、非法元数据、主维度目录或文件名不符、主副维度重复、
索引缺失/多余，以及保持身份的重新分类；普通历史条目仍可按原检查规则处理。
原 D-001/D-002/D-003、spec/catalog.json 和 spec/frozen.json 未改动。

独立 architecture-reviewer 对[20 个文件的固定快照](2026-09-12-requirements-foundation-review.json)
做了限定符合性复核，开始与结束哈希均一致；依据的提案 design.md/migration.md 与
上一轮审阅版本一致。结论为本次范围内未发现阻断或需修正的语义不符合项。
复核覆盖确认/补充/未决边界、租户共同义务、决定有效前提及共享角色输入与权限。
检查器代码、测试执行、Git 恢复、生成配置及宿主行为不在此次独立复核范围内。

正式基线为 `8688fe36a9d3d23edabd2f8c7a436b73cc15f34c`，保留 tag 为
`requirements-baseline/2026-09-12-foundation`。其[自包含历史包和恢复记录](../../../.meta_harness/design/record/evidence/legacy-requirements-baseline/README.md)
在基线之后单独交付，避免自引用提交哈希。仅从包导入 tag 的独立仓库没有开发分支
或 alternates，清除 reflog 并 GC 后，提交及全部 13 份需求文件仍可恢复且字节一致，
`git fsck --full` 通过。包随仓库跟踪保存，本轮没有远端推送或合并。

增加基线证据导航后，最终 docs-check 覆盖 186 份 Markdown 并通过；工具代码与
64 项测试的已验证状态一致。
