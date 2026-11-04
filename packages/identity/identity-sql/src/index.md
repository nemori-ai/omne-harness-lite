# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口与公开定义
- [cordis.ts](cordis.ts)：`IdentitySqlPlugin` 与三个服务子类
- [provider.ts](provider.ts)：`createIdentitySql`，三项操作、读口与结果映射
- [governance.ts](governance.ts)：治理端口，提交与读的映射
- [result.ts](result.ts)：`basis-unavailable`、读失败原因与 `IdentitySqlResultUnknown`
- [materials.ts](materials.ts)：材料描述、事务域、组合版本与登记请求
- [config.ts](config.ts)：配置形状、校验、四项初值与常量期限源
- [deadline.ts](deadline.ts)：截止时刻加法
- [identifiers.ts](identifiers.ts)：标识、操作键、登录凭证与摘要
- [worker/schema.ts](worker/schema.ts)：表、名字、排序键与跨 Worker 边界的形状
- [worker/support.ts](worker/support.ts)：行访问、读 handler 框架与共用的记录核对 SQL
- [worker/migration.ts](worker/migration.ts)：迁移 `identity/001-identity`
- [worker/migration-governance.ts](worker/migration-governance.ts)：迁移 `identity/002-governance`
- [worker/participant.ts](worker/participant.ts)：参加者 `identity`，含八条治理命令
- [worker/read-issue-basis.ts](worker/read-issue-basis.ts)、[worker/read-login-by-proof.ts](worker/read-login-by-proof.ts)、[worker/read-standing.ts](worker/read-standing.ts)、[worker/read-governance.ts](worker/read-governance.ts)：四个读 handler
