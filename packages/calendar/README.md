# 日历能力组

本组当前有一个真实 workspace 草稿成员 `@omne-harness/calendar`，版本 `0.0.0`、private；源码为 `export {}`，没有业务 API 或运行服务。2026-11-03 确认的完整目标设计约束后续实现，文档完成不表示运行能力交付。

## 责任与范围

本组落实[日历领域责任](../../docs/domains/calendars/README.md)。产品规则归[产品正文](../../.meta_harness/design/product/calendars/design.md)，本组拥有工程分解、依赖与组合验证导航，成员拥有必要行为及公开设计。

## 成员与依赖

| 真实成员 | 工程责任与入口 |
| --- | --- |
| [calendar](calendar/README.md) | [完整行为](calendar/SPEC.md)、[公开 API 设计](calendar/docs/public-api-design.md)、[内部机制](calendar/docs/internals.md)、[关键流程](calendar/docs/key-flows.md) |

组根不是包或统一服务，不新建占位 provider/tools 包。纯领域值和应用服务不依赖 Cordis；装配、执行和工具是分别可替换的适配责任。允许方向及外部接缝见[组架构](docs/architecture.md)。

## 关键协作

成员通过明确 ports 消费原事实拥有者，不直接读外域表。操作先可靠提交，再交接执行/通知及唤醒；unknown 查询原身份，外部效果不能由 disposer 撤销。Calendar 提供不可变知识与版本，Schedule 拥有日期组合与 Job 接受，执行拥有者报告真实原工作结果，通知拥有者报告耐久可取回和投递。

## 组合验证

必要场景归[成员 SPEC](calendar/SPEC.md#持续验证义务)，来源17组154条与N01–N25归[完整映射](../schedule/schedule/SPEC.md#来源与目标验收映射)。单成员组没有额外组内跨成员事务；跨域版本、授权、SQL提交、执行、通知与工具装配由具名参与者共同取证。当前空导出测试不证明这些能力，未运行的真实介质/Node24/网络/生命周期验收均保持未验证。

## 维护

变更本域承诺同步 SPEC、唯一公开形状、内部机制、流程、双语入口和登记，再同步实际消费者。公开源码实现后替换设计形状的重复定义，保留行为 SPEC 和必要理由；不能把设计类型误报成已有导出。新增包按[成员文档规范](../../docs/member-documentation.md)与真实责任决定，不以图中框数决定包数。产品代码、依赖和具体提供者本轮不变。
