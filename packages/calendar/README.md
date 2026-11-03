# 日历能力组

本组五个成员提供 Calendar A1 的公开契约、纯日期计算、查询与供应应用、本地持久化及来源适配、Cordis 绑定和独立工具贡献。版本仍为 `0.0.0`、private。源码存在不表示独立验收或发行接受，最终独立验收未完成，尚未父分支合回。Schedule 与 Job 留待 A2，真实跨域接线留待 M2 之后。

## 责任与范围

本组落实[日历领域责任](../../docs/domains/calendars/README.md)。产品规则归[产品正文](../../.meta_harness/design/product/calendars/design.md)，本组拥有工程分解、依赖与组合验证导航，成员拥有必要行为及公开设计。

## 成员与依赖

| 真实成员 | 工程责任与入口 |
| --- | --- |
| [calendar](calendar/README.md) | [完整行为](calendar/SPEC.md)、[公开 API 设计](calendar/docs/public-api-design.md)、[内部机制](calendar/docs/internals.md)、[关键流程](calendar/docs/key-flows.md) |
| [calendar-contract](calendar-contract/README.md) | 公开数据与服务协议，不依赖 Cordis 或本地后端 |
| [calendar-cordis-contract](calendar-cordis-contract/README.md) | 唯一 Cordis Service、键和类型增补 |
| [calendar-local](calendar-local/README.md) | 单机持久化、恢复、来源或执行适配及提供者装配 |
| [calendar-tools](calendar-tools/README.md) | 通过 inject 消费服务的独立工具贡献 |

组根不是包或统一服务。纯契约、通用实现、Cordis 定义、单机后端和工具按消费边界分别维护。允许方向及外部接缝见[组架构](docs/architecture.md)，安装与部署约束见[包组织](../../docs/package-organization.md#日历与日程的安装和部署边界)。

## 关键协作

成员通过明确 ports 消费原事实拥有者，不直接读外域表。操作先可靠提交，再交接执行/通知及唤醒；unknown 查询原身份，外部效果不能由 disposer 撤销。Calendar 提供不可变知识与版本，Schedule 拥有日期组合与 Job 接受，执行拥有者报告真实原工作结果，通知拥有者报告耐久可取回和投递。

## 组合验证

必要场景归[成员 SPEC](calendar/SPEC.md#持续验证义务)，来源17组154条与N01–N27归[完整映射](../schedule/schedule/SPEC.md#来源与目标验收映射)。组内共享纯契约，事务只在明确的提供者事务域内成立；跨域版本、授权、SQL提交、执行、通知与工具装配由具名参与者共同取证。持续用例和独立验收分别按其真实范围取证，不因本域通过声称跨域版本、授权或目标介质强保证已闭合。

复用选择、系统依赖状态、自有实现及工具暴露边界见[实施复用规划](docs/reuse-plan.md)。

## 维护

变更本域承诺同步 SPEC、唯一公开形状、内部机制、流程、双语入口和登记，再同步实际消费者。公开源码是形状唯一源，正文保留行为 SPEC 和必要理由；不能把设计类型误报成已有导出。新增包按[成员文档规范](../../docs/member-documentation.md)与真实责任决定，不以图中框数决定包数。A1 已有本域实现；Schedule/Job、最终应用接入与真实跨域联调仍待后续阶段。
