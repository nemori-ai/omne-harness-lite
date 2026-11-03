# tests/fixtures 索引

本文件列出本目录的文件。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：夹具的来源与约束
- [storage.ts](storage.ts)：真实 sqlite-provider 的临时部署
- [scrypt.ts](scrypt.ts)：测试 scrypt 配置与门控计算
- [provider.ts](provider.ts)：一个部署上的一个提供者
- [faults.ts](faults.ts)：存储边界的故障注入
- [restart-child.ts](restart-child.ts)：重启用例的子进程
- [governance.ts](governance.ts)：治理契约套件的夹具
- [mutants.ts](mutants.ts)：负控的 `dist` 副本
- [governance-child.ts](governance-child.ts)：治理重启与升级用例的子进程
- [identity-001/](identity-001/participant.ts)：001 构建参加者的冻结副本
