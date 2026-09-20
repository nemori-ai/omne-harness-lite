---
kind: product-feature
id: PF-006
primary_dimension: user
secondary_dimensions: [agent]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md
source_sha256: c6783096e424d47622c24dbc980bc4eb381093a485da61018760120f6af07713
source_anchor: "heading:# PF-006：用户设置、Agent 定义级授权与出厂默认覆盖"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-006：用户设置、Agent 定义级授权与出厂默认覆盖

[用户维度](../by-user.md) · [来源核对](../../../../research/legacy_backup/user-governance-and-decision-pool-sources/research.md)

主维度：用户。副维度：智能体，关联 Agent 在用户配置与授权下的实际行为。

本项维护配置和授权**如何生效**；个人用户与组织超级管理员能管理哪些对象、
执行哪些查询/创建/修改/撤销操作，由
[PF-010](../PF-010-organization-personal-assets-and-permissions/requirements.md#管理操作范围)
统一展开。两条互引而不合并正文，避免管理目录和逐项生效规则互相复制。

## 已确认要求

2026-09-12 用户沿 HITL 讨论补充：继承原系统的用户设置、对一个 agent 的授权，
并能覆盖系统默认出厂配置；这里的 agent 明确指 **agent blueprint/definition**。
C1–C3 记录直接要求，C4–C5 结合本轮继承方向与来源中可明确映射的行为展开；
C6 随后续管理补充记录清除覆盖时的生效边界。

- **PF-006.C1：用户设置是系统的正式能力。** 用户能够管理自己的设置，使
  系统及智能体按这些设置提供服务；设置具有明确的适用范围和持久化含义。
- **PF-006.C2：授权可面向 Agent 定义。** 用户能够对指定 Blueprint / Definition
  作出授权，授权目标须能与一次会话、一次运行或一个临时实例区分。定义级授权
  可以按声明的有效范围供相应会话和运行使用；运行时重建不能仅因实例更换而
  丢掉仍有效的授权，也不能把它转移给另一份定义。授权对象和有效范围是分别
  表达的两个方面，定义级对象不意味着每次授权都永久、跨租户或全设备有效。
- **PF-006.C3：用户选择能够覆盖出厂默认配置。** 对适用设置，用户明确选择
  在其作用域内覆盖系统或 Agent 定义提供的出厂默认值，包括相应的默认权限
  行为。系统不能因为默认值随出厂提供，就让用户覆盖只存在于界面或提示词里、
  对实际行为无效。具体设置字段及各层的完整优先关系继续逐项定义。
- **PF-006.C4：作用域与实际生效结果可理解。** 设置按自己的语义生效，不能
  静默外溢。来源已有账号级快捷键、用户默认模型偏好、会话模型选择等不同范围；
  例如模型的会话选择覆盖用户偏好，用户偏好覆盖定义默认，缺席层按规则回落，
  用户能理解最终值及依据。这个例子不把所有设置都套入同一层级。
- **PF-006.C5：授权可查看、变更和撤销，执行使用当前有效依据。** 用户能够
  知道授予了哪个定义、哪些能力/动作、哪些对象及多大范围；可变更和撤销自己
  有权管理的授权。来源的设备能力支持逐项/全权模式与当前会话/设备持续范围
  分别选择，持续授权跨重启保留；这些语义在相应作用域内继承。下一项尚未通过
  授权门的动作使用当前有效授权，已准入动作的停止由独立控制能力负责。
  一次性批准仍只约束那件事，不能自动改写设置或升级为持续权限。
- **PF-006.C6：清除显式覆盖后重新按适用规则求值。** 用户在有权管理的
  范围内清除一层设置覆盖后，系统按该设置已定义的缺席/继承规则取得结果，
  并显示变化与依据；不将“没有覆盖”自动等同于 false、空值、全面授权或一份
  固定旧出厂值。模型偏好的现有三层例子按 C4 回落，其它设置分别定义规则。
  已确认写入值与当前实际生效值可以不同，保存了覆盖不能冒充它已经越过其它
  有效约束。该条随同日 PF-010 管理补充登记，不预设全系统统一层级。

## 场景与边界

| 场景 | 应有表现 |
|---|---|
| 用户为某个 Agent 定义设置偏好和持续授权 | 后续适用会话能解析到同一设置与授权；另一份定义不能冒领 |
| 系统出厂默认与用户明确选择不同 | 实际行为采用适用的用户覆盖，并能解释有效来源 |
| 只修改一个会话的模型选择 | 该会话改变，不改写定义、用户默认偏好或其它会话 |
| 撤销某项权限后，Agent 又尝试相关动作 | 尚未准入的动作按新授权状态处理；重建运行时不会恢复已撤销权限 |
| 用户清除默认模型偏好，但当前会话仍有独立选择 | 被清除的偏好不复活，该会话继续按有效会话选择求值，其它会话按各自依据回落 |

用户覆盖发生在其有权配置的范围内，继续受
[SYS-TENANT](../../system/constraints/requirements.md#sys-tenant) 与已确认不可绕过要求约束。
出厂默认与硬性约束须明确区分，不能把普通默认值伪装为不可改约束，也不能用
设置覆盖绕过租户隔离。配置变更不等于改写原始定义或出厂材料。

待后续明确：设置目录、每个字段的 owner 和作用域、用户全局与定义专属覆盖
的组合、各字段恢复默认的具体规则（C6 拥有共同的缺席/覆盖区别）；定义版本更新、fork、重新获取与跨组织使用时
授权如何延续。旧来源的 `logical Agent`、`agent_id`、manifest 及 release 坐标
需要映射到本项目对象，不能直接拿临时实例标识替代本轮确认的定义级目标。

## 关联与当前覆盖

[PF-023](../PF-023-session-model-selection-and-continuity/requirements.md) 进一步拥有会话级合法
模型切换、候选集、模态/窗口检查及下一轮接续；本项维护一般设置与授权求值，
不复制该专项的模型选择正文。

[PF-001](../PF-001-tenant-organization-context/requirements.md) 拥有用户多组织上下文效用；
[PF-010](../PF-010-organization-personal-assets-and-permissions/requirements.md) 拥有管理范围
与操作目录，C6 的缺席规则来源及分篇依据见管理核对（迁移坐标：`.meta_harness/design/research/tenant-management-sources/research.md`）；
[PF-005](../PF-005-agent-initiated-human-input-and-approval/requirements.md) 与
[PF-007](../PF-007-system-initiated-hitl/requirements.md) 提供申请与执行时确认入口；
[PF-004](../PF-004-subagent-delegation-and-supervision/requirements.md) 的派发级权限继承
保留其范围，不把 master 的持久授权复制成 child 的长期授权。

目前的设计（[本包覆盖状态](README.md#设计覆盖状态)）尚未
给出设置覆盖、定义级授权及运行时有效状态的完整模型。本次确认产品要求，不
接受旧系统的配置聚合、权限字段或部署结构；当前没有已接受业务规格需因此取代。
