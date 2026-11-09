# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [大 final 的实际 SQLite 容量回归](final-capacity.spec.ts)：生产单命令上限，含小结果对照；W3-A 实施中的失败用例。

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口与导入边界
- [ledger-store-conformance.spec.ts](ledger-store-conformance.spec.ts)：两组记录仓套件（G1、P01）
- [custody-conformance.spec.ts](custody-conformance.spec.ts)：保管套件（P05）
- [custody-chunks.spec.ts](custody-chunks.spec.ts)：分块、中断与重送、修订号、构造期核对
- [tenant-isolation.spec.ts](tenant-isolation.spec.ts)：租户隔离
- [reopen.spec.ts](reopen.spec.ts)：关闭再打开数据库文件
- [atomic-commit.spec.ts](atomic-commit.spec.ts)：原子提交与修订号冲突
- [host-history-independence.spec.ts](host-history-independence.spec.ts)：2000 次历史后新调用能启动，每次调用的宿主读数与历史无关，保留作用域不随调用增长（慢层）
- [ledger-asserts.spec.ts](ledger-asserts.spec.ts)：读集断言在 SQL 执行时评估，排队提交与两个连接的用例
- [start-coordinator.spec.ts](start-coordinator.spec.ts)：启动协调器在本仓上的三组套件与重建
- [materials.spec.ts](materials.spec.ts)：材料与组合有效性
- [participant.spec.ts](participant.spec.ts)：参加者模块自身的守卫
- [fixtures/](fixtures/index.md)：测试固定输入
- [body-reclaim-live.spec.ts](body-reclaim-live.spec.ts)：真实 SQLite 的读页与回收交错，覆盖有效及过期租约、附件、过程历史和交付材料隔离。

- [material-worker.spec.ts](material-worker.spec.ts)：材料 SQL 命令、重放、围栏、回滚、读页及重启
- [material-worker-live.spec.ts](material-worker-live.spec.ts)：实际 SQL worker 的 5 MiB 保管、读回与删除恢复

- [material-store.spec.ts](material-store.spec.ts)：公开材料仓的隔离、重放、输入快照与失败全化
- [material-store-live.spec.ts](material-store-live.spec.ts)：公开仓接口经实际 SQL worker 的 5 MiB 读写和删除恢复

- [实际 SQL 的精确 final 保管](final-custody-live.spec.ts)验证 5 MiB envelope 不进入 call 账本，并从重启后的 sealed 记录认回。旧完整事实接收容量测试仍独立保留。
