# 日程与 Job能力组

本组有五个真实 workspace 成员，均为 `0.0.0`、private 初始化草稿。公开入口仍为空，没有业务 API 或运行服务。完整目标设计约束后续实现，包初始化不表示运行能力交付。

## 责任与范围

本组落实[日程与 Job领域责任](../../docs/domains/schedules-and-jobs/README.md)。产品规则归[产品正文](../../.meta_harness/design/product/schedules-and-jobs/design.md)，本组拥有工程分解、依赖与组合验证导航，成员拥有必要行为及公开设计。

## 成员与依赖

| 真实成员 | 工程责任与入口 |
| --- | --- |
| [schedule](schedule/README.md) | [完整行为](schedule/SPEC.md)、[公开 API 设计](schedule/docs/public-api-design.md)、[内部机制](schedule/docs/internals.md)、[关键流程](schedule/docs/key-flows.md) |
| [schedule-contract](schedule-contract/README.md) | 公开数据与服务协议，不依赖 Cordis 或本地后端 |
| [schedule-cordis-contract](schedule-cordis-contract/README.md) | 唯一 Cordis Service、键和类型增补 |
| [schedule-local](schedule-local/README.md) | 单机持久化、恢复、来源或执行适配及提供者装配 |
| [schedule-tools](schedule-tools/README.md) | 通过 inject 消费服务的独立工具贡献 |

组根不是包或统一服务。纯契约、通用实现、Cordis 定义、单机后端和工具按消费边界分别维护。允许方向及外部接缝见[组架构](docs/architecture.md)，安装与部署约束见[包组织](../../docs/package-organization.md#日历与日程的安装和部署边界)。

## 关键协作

成员通过明确 ports 消费原事实拥有者，不直接读外域表。操作先可靠提交，再交接执行/通知及唤醒；unknown 查询原身份，外部效果不能由 disposer 撤销。Calendar 提供不可变知识与版本，Schedule 拥有日期组合与 Job 接受，执行拥有者报告真实原工作结果，通知拥有者报告耐久可取回和投递。

## 组合验证

必要场景归[成员 SPEC](schedule/SPEC.md#持续验证义务)，来源17组154条与N01–N27归[完整映射](schedule/SPEC.md#来源与目标验收映射)。组内共享纯契约，事务只在明确的提供者事务域内成立；跨域版本、授权、SQL提交、执行、通知与工具装配由具名参与者共同取证。当前空导出测试不证明这些能力，未运行的真实介质/Node24/网络/生命周期验收均保持未验证。

## 维护

变更本域承诺同步 SPEC、唯一公开形状、内部机制、流程、双语入口和登记，再同步实际消费者。公开源码实现后替换设计形状的重复定义，保留行为 SPEC 和必要理由；不能把设计类型误报成已有导出。新增包按[成员文档规范](../../docs/member-documentation.md)与真实责任决定，不以图中框数决定包数。新增成员已登记依赖与模板入口，具体业务实现仍待交付。
