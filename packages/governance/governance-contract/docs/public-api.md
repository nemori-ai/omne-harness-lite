# 公开定义导航

## 导出入口

根入口只导出纯协议，`./cordis` 导出唯一 Service 定义。

## 定义索引

| 定义 | 源码 | 责任 |
| --- | --- | --- |
| Scope、声明、引用、命令与查询 Schema | [schema.ts](../src/schema.ts) | 有限结构、规范身份文本与序列化值 |
| GovernanceCommands | [ports.ts](../src/ports.ts) | contribute、adopt、withdraw |
| GovernanceQueries | [ports.ts](../src/ports.ts) | readCatalog、queryOperation |
| 互斥结果类型 | [ports.ts](../src/ports.ts) | 成功、拒绝、待决与未知结果 |
| GovernanceContributionsService | [cordis.ts](../src/cordis.ts) | Cordis 唯一键及抽象方法 |

类型不承载的身份、完整性、同提交和生命周期规则见 [SPEC](../SPEC.md)。
