# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口与公开定义
- [cordis.ts](cordis.ts)：`IdentitySqlPlugin` 与两个服务子类
- [provider.ts](provider.ts)：`createIdentitySql`，三项操作、读口与结果映射
- [materials.ts](materials.ts)：材料描述、事务域、组合版本与登记请求
- [config.ts](config.ts)：配置形状、校验与常量期限源
- [deadline.ts](deadline.ts)：截止时刻加法
- [identifiers.ts](identifiers.ts)：标识、操作键、登录凭证与摘要
- [worker/schema.ts](worker/schema.ts)：表、名字与跨 Worker 边界的形状
- [worker/support.ts](worker/support.ts)：行访问与读 handler 框架
- [worker/migration.ts](worker/migration.ts)：迁移 `identity/001-identity`
- [worker/participant.ts](worker/participant.ts)：参加者 `identity`
- [worker/read-issue-basis.ts](worker/read-issue-basis.ts)、[worker/read-login-by-proof.ts](worker/read-login-by-proof.ts)、[worker/read-standing.ts](worker/read-standing.ts)：三个读 handler
