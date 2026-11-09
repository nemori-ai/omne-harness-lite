# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口与导入边界
- [ledger-store-conformance.spec.ts](ledger-store-conformance.spec.ts)：两组记录仓套件（G1、P01）
- [custody-conformance.spec.ts](custody-conformance.spec.ts)：保管套件（P05）
- [custody-chunks.spec.ts](custody-chunks.spec.ts)：分块、中断与重送、修订号、构造期核对
- [tenant-isolation.spec.ts](tenant-isolation.spec.ts)：租户隔离
- [reopen.spec.ts](reopen.spec.ts)：关闭再打开数据库文件
- [atomic-commit.spec.ts](atomic-commit.spec.ts)：原子提交与修订号冲突
- [commit-answers.spec.ts](commit-answers.spec.ts)：SQL 提交结果到端口答复的对应：暂时原因答 `unavailable`，确定原因、参加者失败与非严格 JSON 写入答 `rejected`，保管的确定原因答 `invalid`（`field` 为 `storage`）
- [guarded-host-commit.spec.ts](guarded-host-commit.spec.ts)：原调用终局与 host 许可同序、两连接竞争、隔离与丢答
- [start-coordinator.spec.ts](start-coordinator.spec.ts)：启动协调器在本仓上的三组套件与重建
- [materials.spec.ts](materials.spec.ts)：材料与组合有效性
- [participant.spec.ts](participant.spec.ts)：参加者模块自身的守卫
- [fixtures/](fixtures/index.md)：测试固定输入
